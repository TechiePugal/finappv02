// ── Cascade Delete ──────────────────────────────────────────────────────────
// THE BUG THIS FIXES: deleting a Borrower/Depositor/EMI Loan only ever removed
// that ONE master document — every related record (payment history, ledger
// entries, refunds, top-ups, uploaded documents, status history) stayed behind
// in the database forever. Those orphaned records kept being summed into
// Dashboard totals, Reports, and Refunding's "all time" figures, so numbers
// never actually went to zero even after every visible record was deleted.
//
// This deletes a record's ENTIRE footprint across every collection it ever
// touched, not just the master document itself.
import { collection, query, where, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';

async function deleteWhere(collectionName, field, value) {
  try {
    const q = query(collection(db, collectionName), where(field, '==', value));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  } catch (e) { /* collection may not exist yet — safe to ignore */ }
}

async function deleteDocSafe(collectionName, docId) {
  try { await deleteDoc(doc(db, collectionName, docId)); } catch (e) { /* not present */ }
}

export async function cascadeDeleteBorrower(borrowerId) {
  await Promise.all([
    deleteWhere('borrower_interest_payments', 'borrowerId', borrowerId),
    deleteWhere('loan_repayments', 'borrowerId', borrowerId),
    deleteWhere('loan_additions', 'borrowerId', borrowerId),
    deleteWhere('finance_ledger_entries', 'borrowerId', borrowerId),
    deleteWhere('status_history', 'recordId', borrowerId), // covers both 'loan' and any other type tagged with this id
    deleteDocSafe('borrower_files', `${borrowerId}_check`),
    deleteDocSafe('borrower_files', `${borrowerId}_bond`),
    deleteDocSafe('borrower_files', `${borrowerId}_agreement`),
    deleteDocSafe('borrower_files', `${borrowerId}_land`),
  ]);
  await deleteDoc(doc(db, 'borrower_master', borrowerId));
}

export async function cascadeDeleteDepositor(depositorId) {
  await Promise.all([
    deleteWhere('deposit_payments', 'depositId', depositorId),
    deleteWhere('deposit_refunds', 'depositorId', depositorId),
    deleteWhere('deposit_additions', 'depositorId', depositorId),
    deleteWhere('finance_ledger_entries', 'depositId', depositorId),
    deleteWhere('deposit_interest_schedule', 'depositorId', depositorId),
    deleteWhere('status_history', 'recordId', depositorId),
    deleteDocSafe('depositor_files', `${depositorId}_check`),
    deleteDocSafe('depositor_files', `${depositorId}_bond`),
  ]);
  await deleteDoc(doc(db, 'deposit_master', depositorId));
}

export async function cascadeDeleteEmiLoan(loanId) {
  await Promise.all([
    deleteWhere('emi_collections', 'loanId', loanId),
    deleteWhere('finance_ledger_entries', 'loanId', loanId),
    deleteWhere('status_history', 'recordId', loanId),
    deleteDocSafe('emi_files', `${loanId}_check`),
    deleteDocSafe('emi_files', `${loanId}_bond`),
    deleteDocSafe('emi_files', `${loanId}_agreement`),
  ]);
  await deleteDoc(doc(db, 'emi_loans', loanId));
}

// ── One-time cleanup: find and remove orphaned records ─────────────────────
// For data that was ALREADY left behind by deletions made before this fix
// existed. Scans every related collection, checks whether its parent record
// still exists, and removes anything whose parent is gone.
//
// IMPORTANT: this does NOT filter by createdBy at the query level — many of
// the orphaned records this is meant to clean up predate that field being
// added at all, so a where('createdBy','==',userId) query would silently
// miss exactly the old data we're trying to remove. Instead it fetches every
// document and only touches ones that either belong to this user OR have no
// owner recorded at all (the same "legacy record" rule used everywhere else
// in this app), which keeps this safe without missing older orphans.
export async function findAndCleanOrphans(userId) {
  const report = { borrowerOrphans: 0, depositOrphans: 0, emiOrphans: 0, ledgerOrphans: 0 };

  const [borrowersSnap, depositsSnap, emiLoansSnap] = await Promise.all([
    getDocs(collection(db, 'borrower_master')),
    getDocs(collection(db, 'deposit_master')),
    getDocs(collection(db, 'emi_loans')),
  ]);
  const mine = d => !d.data().createdBy || d.data().createdBy === userId;
  const validBorrowerIds = new Set(borrowersSnap.docs.filter(mine).map(d => d.id));
  const validDepositIds = new Set(depositsSnap.docs.filter(mine).map(d => d.id));
  const validEmiIds = new Set(emiLoansSnap.docs.filter(mine).map(d => d.id));

  async function cleanCollection(collectionName, field, validIds, reportKey) {
    const snap = await getDocs(collection(db, collectionName));
    const orphans = snap.docs.filter(d => {
      const data = d.data();
      if (!mine(d)) return false; // never touch another account's records
      const val = data[field];
      return val && !validIds.has(val);
    });
    if (orphans.length === 0) return;
    // Firestore batches cap at 500 writes — chunk just in case there's a lot of debris.
    for (let i = 0; i < orphans.length; i += 450) {
      const batch = writeBatch(db);
      orphans.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    report[reportKey] += orphans.length;
  }

  await Promise.all([
    cleanCollection('borrower_interest_payments', 'borrowerId', validBorrowerIds, 'borrowerOrphans'),
    cleanCollection('loan_repayments', 'borrowerId', validBorrowerIds, 'borrowerOrphans'),
    cleanCollection('loan_additions', 'borrowerId', validBorrowerIds, 'borrowerOrphans'),
    cleanCollection('deposit_payments', 'depositId', validDepositIds, 'depositOrphans'),
    cleanCollection('deposit_refunds', 'depositorId', validDepositIds, 'depositOrphans'),
    cleanCollection('deposit_additions', 'depositorId', validDepositIds, 'depositOrphans'),
    cleanCollection('deposit_interest_schedule', 'depositorId', validDepositIds, 'depositOrphans'),
    cleanCollection('emi_collections', 'loanId', validEmiIds, 'emiOrphans'),
  ]);

  // Ledger entries can reference any of the three parent types — check each linked field
  const ledgerSnap = await getDocs(collection(db, 'finance_ledger_entries'));
  const ledgerOrphanDocs = ledgerSnap.docs.filter(d => {
    if (!mine(d)) return false;
    const x = d.data();
    if (x.borrowerId) return !validBorrowerIds.has(x.borrowerId);
    if (x.depositId) return !validDepositIds.has(x.depositId);
    if (x.loanId) return !validEmiIds.has(x.loanId);
    return false; // no parent reference at all (e.g. a manual/expense entry) — never touch these
  });
  if (ledgerOrphanDocs.length > 0) {
    for (let i = 0; i < ledgerOrphanDocs.length; i += 450) {
      const batch = writeBatch(db);
      ledgerOrphanDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    report.ledgerOrphans = ledgerOrphanDocs.length;
  }

  return report;
}
