// ── Status History (point-in-time audit trail) ──────────────────────────────
// THE PROBLEM THIS SOLVES: every report in this app used to show a record's
// CURRENT status for historical periods too — so pulling "last month's report"
// after a loan was closed THIS month would incorrectly show it as already
// closed back then. The app only ever remembered the latest state, never what
// was true at any earlier point in time.
//
// THE FIX: whenever a record's status changes, we log an immutable entry here
// (old status, new status, when). Reports for a past date no longer trust the
// record's current status directly — they ask "what was the status as of that
// date?" by walking this history backward from the report's date.
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function logStatusChange(recordType, recordId, oldStatus, newStatus, userId) {
  if (oldStatus === newStatus) return; // no real change, nothing to log
  try {
    await addDoc(collection(db, 'status_history'), {
      recordType, recordId, oldStatus: oldStatus || null, newStatus,
      changedAt: serverTimestamp(), changedBy: userId || null,
    });
  } catch (e) { /* logging failure should never block the actual save */ }
}

// Fetch the full status-change history for one record, sorted oldest-first.
export async function getStatusHistory(recordType, recordId) {
  try {
    const q = query(collection(db, 'status_history'), where('recordType', '==', recordType), where('recordId', '==', recordId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.changedAt?.seconds || 0) - (b.changedAt?.seconds || 0));
  } catch (e) { return []; }
}

// Fetch ALL history for a record type in one call (for building a report over many records at once —
// far cheaper than one query per record).
export async function getAllStatusHistory(recordType) {
  try {
    const q = query(collection(db, 'status_history'), where('recordType', '==', recordType));
    const snap = await getDocs(q);
    const byRecord = {};
    snap.docs.forEach(d => {
      const x = d.data();
      if (!byRecord[x.recordId]) byRecord[x.recordId] = [];
      byRecord[x.recordId].push(x);
    });
    Object.values(byRecord).forEach(list => list.sort((a, b) => (a.changedAt?.seconds || 0) - (b.changedAt?.seconds || 0)));
    return byRecord;
  } catch (e) { return {}; }
}

// The core resolver: given a record's CURRENT status and its history, work out
// what the status actually WAS as of a given date. If no history entry exists
// before that date, the record's status hadn't changed yet at that point —
// so we walk backward through history to find what it would have been.
export function getEffectiveStatus(currentStatus, history, asOfDate) {
  if (!history || history.length === 0) return currentStatus; // no history logged — best we can do
  const asOfMs = new Date(asOfDate).getTime();
  // Find the latest change that happened AT OR BEFORE asOfDate
  let applicable = null;
  for (const h of history) {
    const changedMs = h.changedAt?.seconds ? h.changedAt.seconds * 1000 : new Date(h.changedAt).getTime();
    if (changedMs <= asOfMs) applicable = h;
    else break; // history is sorted oldest-first, so we can stop early
  }
  if (applicable) return applicable.newStatus;
  // No change happened before asOfDate — the record was in whatever its status
  // was BEFORE the very first logged change (the oldStatus of the earliest entry).
  return history[0].oldStatus || currentStatus;
}
