import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, where, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';
import { logStatusChange } from '../../utils/statusHistory';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, StatCard, Button, Modal, FormField, Input, Select, formatCurrency,
} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import {
  today, calcFine, getDaysOverdue, getScheduleWithStatus, emiPrincipalPerPeriod, emiInterestPerPeriod, fmtEmiDate,
} from '../../utils/emiHelpers';
import { printCollectEMISummary } from '../../utils/pdfReport';

// Early-closure math shared by both the single-period modal and the bulk-settle
// modal: it charges interest for every period that has ACTUALLY fallen due and
// is still unpaid (not just one flat period), and asks for the FULL remaining
// principal (since EMI is a flat-interest-per-period model, not reducing-balance).
//
// `asOfPeriodNo` lets the caller scope the interest count to a specific chosen
// period instead of "however many periods have fallen due as of today" — this
// is what makes the bulk modal's "Settle Through Period" picker actually drive
// the close amount (e.g. settling AS OF period #4 charges 4 periods' interest,
// even if 9 periods have technically fallen due by today's real date).
function computeEarlyCloseAmount(loan, cols, asOfPeriodNo) {
  const paidCount = (cols || []).filter(c => c.status === 'Paid').length;
  const ppp = emiPrincipalPerPeriod(loan);
  const remPrincipal = Math.max(0, (parseFloat(loan.loanAmount) || 0) - paidCount * ppp);
  // INTEREST FIX: interest on an early closure must be charged on the loan's
  // CURRENT REMAINING balance, not the original loan amount. Worked example:
  // loan 10000 @ 3%/mo, EMI 1300/mo x 10 periods. First 2 periods paid properly
  // (2000 principal + 600 interest). Settling in period 3: remaining balance is
  // 8000, and interest is charged on THAT 8000 for the periods still owed — e.g.
  // 8000 x 3% x 3 periods = 720, so close amount = 8000 + 720 = 8720. (When
  // nothing has been paid yet, paidCount is 0 and remPrincipal === loanAmount,
  // so this is exactly backward-compatible with the original flat-on-full-amount
  // math — e.g. 10000 + 9 x 300 = 12700 for a loan settled in its 9th month with
  // nothing paid.) The regular flat per-period EMI due amount shown for ordinary
  // monthly collection is untouched — this only changes the closure/settlement math.
  const interestRate = parseFloat(loan.interestRate) || 0;
  const interestPerPeriod = remPrincipal * (interestRate / 100);
  let elapsedCount;
  if (asOfPeriodNo != null) {
    elapsedCount = asOfPeriodNo;
  } else {
    const sched = getScheduleWithStatus(loan, cols);
    const todayD = new Date();
    elapsedCount = sched.filter(s => new Date(s.dueDate) <= todayD).length;
  }
  const owedPeriods = Math.max(1, elapsedCount - paidCount);
  const intAmt = interestPerPeriod * owedPeriods;
  return { remPrincipal, intAmt, owedPeriods, closeAmt: Math.round(remPrincipal + intAmt) };
}

export default function CollectEMI() {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active'); // active | all | closed
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [windowStarts, setWindowStarts] = useState({});
  const [collectLoan, setCollectLoan] = useState(null);
  const [cpf, setCpf] = useState({});
  const [saving, setSaving] = useState(false);
  // Numbered ledger-entries-with-Undo list inside the Collect EMI modal — mirrors
  // Settle Interest's (DepositorSettlement.js) "Ledger Entries — Undo" pattern
  // exactly, instead of only offering Undo via a footer button when re-opening
  // one already-collected period that happens to belong to a batch.
  const [emiLedger, setEmiLedger] = useState([]);
  const [emiLedgerLoading, setEmiLedgerLoading] = useState(false);
  const [undoingKey, setUndoingKey] = useState(null);

  async function loadEmiLedger(loan) {
    setEmiLedgerLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'finance_ledger_entries'), where('loanId', '==', loan.id)));
      const list = scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid)
        .filter(e => !e.deleted && ['EMI Collection', 'Fine Income', 'EMI Loan Closed'].includes(e.category))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      setEmiLedger(list);
    } catch (e) { toast.error('Could not load ledger entries: ' + e.message); } finally { setEmiLedgerLoading(false); }
  }

  useEffect(() => {
    const l = onSnapshot(query(collection(db, 'emi_loans'), orderBy('createdAt', 'desc')),
      snap => { setLoans(scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid)); setLoading(false); });
    const c = onSnapshot(collection(db, 'emi_collections'), snap => {
      const cm = {};
      scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid).forEach(x => { if (!cm[x.loanId]) cm[x.loanId] = []; cm[x.loanId].push(x); });
      setCollections(cm);
    });
    return () => { l(); c(); };
  }, [user]);

  const filtered = loans.filter(l => {
    const q = search.trim().toLowerCase();
    const matchS = !q || [l.borrowerName, l.phone, l.emiId].some(v => String(v || '').toLowerCase().includes(q));
    const matchF = filter === 'all' || (filter === 'active' && l.status === 'Active') || (filter === 'closed' && l.status === 'Closed');
    return matchS && matchF;
  });

  const activeLoans = loans.filter(l => l.status === 'Active');
  const totalDue = activeLoans.reduce((s, l) => s + (l.emiAmount || 0), 0);
  const totalCollectedAllTime = Object.values(collections).flat().filter(c => c.status === 'Paid').reduce((s, c) => s + (c.amount || 0), 0); // fine excluded
  const totalPendingCount = activeLoans.reduce((s, l) => {
    const cols = collections[l.id] || [];
    const paid = cols.filter(c => c.status === 'Paid').length;
    return s + Math.max(0, (l.totalPeriods || 0) - paid);
  }, 0);

  // ── Opening the modal ───────────────────────────────────────────────────
  // Any unpaid slot that has OTHER unpaid periods sitting before it (up to and
  // including the one clicked) opens in "bulk settle" mode instead of the plain
  // single-period form — this is what lets someone catch up on several months
  // of unpaid EMI (or the whole loan) in one payment, same as Interest Collection.
  function openCollectForSlot(loan, periodIdx) {
    const cols = collections[loan.id] || [];
    const sched = getScheduleWithStatus(loan, cols);
    const slot = sched[periodIdx];
    if (!slot) return;
    if (slot.col) {
      // Already collected — open in edit mode. If this period was part of a
      // bulk/early-closure settlement, surface the whole batch so it can be
      // undone in one action instead of just this one period.
      const col = slot.col;
      const batchId = col.settlementBatchId || null;
      const batchPeriods = batchId ? cols.filter(c => c.settlementBatchId === batchId) : [];
      setCollectLoan(loan);
      loadEmiLedger(loan);
      setCpf({
        amount: String(col.amount || ''), fine: String(col.fine || 0), date: col.date || today(),
        mode: col.mode || 'Cash', remarks: col.remarks || '', collectFine: (col.fine || 0) > 0,
        dueDate: col.dueDate || '', daysOverdue: col.daysOverdue || 0, periodNo: col.periodNo,
        earlyClose: false, isBulk: false, editingId: col.id, editingLedgerId: col.ledgerEntryId || null,
        settlementBatchId: batchId, batchPeriodCount: batchPeriods.length,
        batchTotal: batchPeriods.reduce((s, c) => s + (c.amount || 0), 0),
        batchEarlyClosure: !!col.earlyClosure,
      });
      return;
    }
    const pendingUpTo = sched.map((s, i) => ({ ...s, idx: i })).filter(s => s.status !== 'Paid' && s.idx <= periodIdx);
    if (pendingUpTo.length > 1) {
      openBulkCollect(loan, pendingUpTo, cols, periodIdx);
    } else {
      const fine = calcFine(slot.dueDate, loan.dailyFineRate || 50);
      setCollectLoan(loan);
      loadEmiLedger(loan);
      setCpf({
        amount: String(loan.emiAmount || ''), fine: String(fine), date: today(), mode: 'Cash', remarks: '',
        collectFine: fine > 0, dueDate: slot.dueDate || '', daysOverdue: getDaysOverdue(slot.dueDate),
        periodNo: periodIdx + 1, editingId: null, editingLedgerId: null, isBulk: false, earlyClose: false,
      });
    }
  }

  function openCollect(loan) {
    const cols = collections[loan.id] || [];
    const sched = getScheduleWithStatus(loan, cols);
    const paidCount = cols.filter(c => c.status === 'Paid').length;
    const todayD = new Date();
    // Every period that has already fallen due and is still not Paid — this is
    // what surfaces the "9 months elapsed, nothing paid" scenario as one bulk
    // settlement instead of only ever offering the very next period.
    const duePending = sched.map((s, i) => ({ ...s, idx: i })).filter(s => s.status !== 'Paid' && new Date(s.dueDate) <= todayD);
    if (duePending.length > 1) {
      openBulkCollect(loan, duePending, cols, duePending[duePending.length - 1].idx);
    } else {
      openCollectForSlot(loan, paidCount);
    }
  }

  function openBulkCollect(loan, pendingSlots, cols, uptoIdx) {
    const periods = pendingSlots.map(s => ({
      periodNo: s.idx + 1,
      dueDate: s.dueDate,
      // If a period is sitting at Partial, only the shortfall is still owed.
      amount: Math.round((loan.emiAmount || 0) - (s.status === 'Partial' ? (s.col?.amount || 0) : 0)),
    }));
    const defaultThrough = uptoIdx != null ? uptoIdx + 1 : periods[periods.length - 1].periodNo;
    const combinedTotal = periods.filter(p => p.periodNo <= defaultThrough).reduce((s, p) => s + p.amount, 0);
    setCollectLoan(loan);
    loadEmiLedger(loan);
    setCpf({
      isBulk: true, bulkPeriods: periods, payThrough: defaultThrough,
      amount: String(combinedTotal), fine: '0', collectFine: false,
      date: today(), mode: 'Cash', remarks: '', editingId: null, editingLedgerId: null,
      earlyClose: false, earlyCloseAll: false,
    });
  }

  function setBulkPayThrough(periodNo) {
    setCpf(p => {
      if (p.earlyCloseAll) {
        const { closeAmt } = computeEarlyCloseAmount(collectLoan, collections[collectLoan.id] || [], periodNo);
        return { ...p, payThrough: periodNo, amount: String(closeAmt) };
      }
      const total = (p.bulkPeriods || []).filter(x => x.periodNo <= periodNo).reduce((s, x) => s + x.amount, 0);
      return { ...p, payThrough: periodNo, amount: String(total) };
    });
  }

  // ── Saving ───────────────────────────────────────────────────────────────
  async function saveCollection(statusSel = 'Paid') {
    if (cpf.earlyClose) return saveEarlyClose();
    if (cpf.isBulk) return saveBulkCollection();
    return saveSinglePeriod(statusSel);
  }

  // Whole-loan early closure — one lump-sum settlement record, correctly priced
  // for however many periods have actually elapsed unpaid (fixes the earlier bug
  // where only a single period's interest was ever charged).
  async function saveEarlyClose() {
    if (!cpf.amount || parseFloat(cpf.amount) <= 0) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      const loan = collectLoan;
      const cols = collections[loan.id] || [];
      const fine = cpf.collectFine ? parseFloat(cpf.fine) || 0 : 0;
      const amtEntered = parseFloat(cpf.amount) || 0;
      const totalCollected = amtEntered + fine;
      // Persist the actual principal/interest split for THIS settlement as ground
      // truth on the doc, instead of leaving downstream reports (Monthly dashboard,
      // etc.) to re-derive it by guessing — that guesswork is exactly what broke once
      // an early closure could legitimately span more than one period's interest.
      // remPrincipal/intAmt come from the same reduced-balance formula shown in the
      // modal; if the collected amount was hand-edited away from the suggested
      // default, principalPortion is capped at the real remaining balance and
      // whatever's left of the entered amount is interest, so the two portions
      // always add back up to exactly what was actually collected.
      const { remPrincipal: calcRemPrincipal } = computeEarlyCloseAmount(loan, cols, cpf.payThrough);
      const principalPortion = Math.min(calcRemPrincipal, amtEntered);
      const interestPortion = Math.max(0, amtEntered - principalPortion);
      const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ledgerRef = await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Credit', category: 'EMI Collection',
        description: `EMI early closure settlement from ${loan.borrowerName}`,
        amount: amtEntered, paymentMode: cpf.mode, date: cpf.date,
        borrowerName: loan.borrowerName, loanId: loan.id, settlementBatchId: batchId, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      if (fine > 0) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Credit', category: 'Fine Income',
          description: `Late-payment fine from ${loan.borrowerName} — early closure`,
          amount: fine, paymentMode: cpf.mode, date: cpf.date,
          borrowerName: loan.borrowerName, loanId: loan.id, settlementBatchId: batchId, createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }
      await addDoc(collection(db, 'emi_collections'), {
        loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
        amount: amtEntered, fine, totalCollected, expectedEMI: loan.emiAmount, date: cpf.date, mode: cpf.mode,
        remarks: ('Early closure settlement. ' + (cpf.remarks || '')).trim(),
        periodNo: loan.totalPeriods, earlyClosure: true, status: 'Paid', settlementBatchId: batchId,
        principalPortion, interestPortion, // ground truth for reports — see comment above
        dueDate: cpf.dueDate || '', daysOverdue: cpf.daysOverdue || 0, frequency: loan.frequency,
        ledgerEntryId: ledgerRef.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: loan.totalPeriods, status: 'Closed', closedEarly: true, updatedAt: serverTimestamp() });
      if (loan.status !== 'Closed') await logStatusChange('emi_loan', loan.id, loan.status, 'Closed', user?.uid);
      await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Milestone', category: 'EMI Loan Closed',
        description: `EMI loan closed (early settlement) — ${loan.borrowerName} · ${loan.emiId || loan.id}`,
        amount: loan.loanAmount || 0, date: cpf.date || today(), settlementBatchId: batchId,
        borrowerName: loan.borrowerName, loanId: loan.id, emiId: loan.emiId || loan.id,
        createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      toast.success('✓ Loan closed early — fully settled.');
      setCollectLoan(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  // ── Undo an entire bulk / early-closure settlement batch ────────────────
  // Mirrors Interest Collection's undoBatch: every emi_collections doc that
  // shares this settlementBatchId goes back to Unpaid (wasUndone:true, so it's
  // visibly distinct from a period that was simply never touched), every
  // finance_ledger_entries doc sharing the batch is soft-deleted (never hard
  // deleted — the Journal/Ledger already filter out `deleted:true`), and the
  // loan is reopened (status back to Active, paidPeriods recounted) if the
  // batch had closed it.
  async function undoEmiBatch(loan, batchId) {
    if (!batchId) return toast.error('This entry has no settlement to undo (older data from before Undo existed).');
    setSaving(true);
    try {
      const cols = collections[loan.id] || [];
      const affected = cols.filter(c => c.settlementBatchId === batchId);
      await Promise.all(affected.map(c => updateDoc(doc(db, 'emi_collections', c.id), {
        status: 'Unpaid', amount: 0, fine: 0, totalCollected: 0, earlyClosure: false,
        wasUndone: true, undoneAt: serverTimestamp(),
      })));
      const ledgerSnap = await getDocs(query(collection(db, 'finance_ledger_entries'), where('settlementBatchId', '==', batchId)));
      await Promise.all(ledgerSnap.docs.map(d => updateDoc(doc(db, 'finance_ledger_entries', d.id), {
        deleted: true, deletedAt: serverTimestamp(),
      })));
      const affectedIds = new Set(affected.map(c => c.id));
      const recount = cols.filter(c => c.status === 'Paid' && !affectedIds.has(c.id)).length;
      await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: recount, status: 'Active', closedEarly: false, updatedAt: serverTimestamp() });
      if (loan.status !== 'Active') await logStatusChange('emi_loan', loan.id, loan.status, 'Active', user?.uid);
      toast.success(`↩ Settlement undone — ${affected.length} period${affected.length !== 1 ? 's' : ''} reverted to unpaid.`);
      setCollectLoan(null);
    } catch (e) { toast.error('Undo failed: ' + e.message); } finally { setSaving(false); }
  }

  // Plain single-period collect / partial / mark-unpaid (the original flow).
  async function saveSinglePeriod(statusSel = 'Paid') {
    const isPartial = statusSel === 'Partial';
    if (statusSel !== 'Unpaid' && (!cpf.amount || parseFloat(cpf.amount) <= 0)) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      const loan = collectLoan;
      const cols = collections[loan.id] || [];
      const fine = cpf.collectFine ? parseFloat(cpf.fine) || 0 : 0;
      const totalCollected = parseFloat(cpf.amount) + fine;
      const fullCols = (cols || []).filter(x => x.status !== 'Partial');
      const paidPeriods = fullCols.length + (isPartial ? 0 : 1);

      const isEditing = !!cpf.editingId;
      const effectivePeriodNo = isEditing ? cpf.periodNo : paidPeriods;

      if (isEditing) {
        const isUnpaid = statusSel === 'Unpaid';
        await updateDoc(doc(db, 'emi_collections', cpf.editingId), {
          amount: isUnpaid ? 0 : parseFloat(cpf.amount), fine: isUnpaid ? 0 : fine, totalCollected: isUnpaid ? 0 : totalCollected,
          date: cpf.date, mode: cpf.mode, remarks: isUnpaid ? 'Reverted to unpaid' : cpf.remarks,
          status: statusSel, updatedAt: serverTimestamp(),
        });
        if (cpf.editingLedgerId) {
          await updateDoc(doc(db, 'finance_ledger_entries', cpf.editingLedgerId), {
            description: isUnpaid
              ? `EMI #${effectivePeriodNo} from ${loan.borrowerName} — reverted to unpaid`
              : `EMI #${effectivePeriodNo} from ${loan.borrowerName}${fine > 0 ? ` + Fine ${formatCurrency(fine)}` : ''}${statusSel === 'Partial' ? ' (partial)' : ''}`,
            amount: isUnpaid ? 0 : totalCollected, paymentMode: cpf.mode, date: cpf.date, updatedAt: serverTimestamp(),
          });
        }
        const updatedCols = cols.map(x => x.id === cpf.editingId ? { ...x, status: statusSel } : x);
        const recount = updatedCols.filter(x => x.status === 'Paid').length;
        const fullyPaidEdit = recount >= loan.totalPeriods;
        const newEditStatus = fullyPaidEdit ? 'Closed' : 'Active';
        await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: recount, status: newEditStatus, updatedAt: serverTimestamp() });
        if (loan.status !== newEditStatus) await logStatusChange('emi_loan', loan.id, loan.status, newEditStatus, user?.uid);
        toast.success(isUnpaid ? `↩ EMI #${effectivePeriodNo} reverted to unpaid.` : `✓ EMI #${effectivePeriodNo} updated to ${statusSel}.`);
        setCollectLoan(null); setSaving(false); return;
      }

      // EMI amount and fine are recorded as SEPARATE ledger entries — fine income never
      // mixes into EMI/loan accounting, it flows straight to net profit on its own.
      const ledgerRef = await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Credit', category: 'EMI Collection',
        description: `EMI #${paidPeriods} from ${loan.borrowerName}${isPartial ? ' (partial)' : ''}`,
        amount: parseFloat(cpf.amount) || 0, paymentMode: cpf.mode, date: cpf.date,
        borrowerName: loan.borrowerName, loanId: loan.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      if (fine > 0) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Credit', category: 'Fine Income',
          description: `Late-payment fine from ${loan.borrowerName} — EMI #${paidPeriods}`,
          amount: fine, paymentMode: cpf.mode, date: cpf.date,
          borrowerName: loan.borrowerName, loanId: loan.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }
      await addDoc(collection(db, 'emi_collections'), {
        loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
        amount: parseFloat(cpf.amount), fine, totalCollected, expectedEMI: loan.emiAmount, date: cpf.date, mode: cpf.mode,
        remarks: cpf.remarks, periodNo: paidPeriods, earlyClosure: false, status: statusSel,
        dueDate: cpf.dueDate, daysOverdue: cpf.daysOverdue, frequency: loan.frequency,
        ledgerEntryId: ledgerRef.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      const fullyPaid = paidPeriods >= loan.totalPeriods;
      const newStatus2 = fullyPaid ? 'Closed' : 'Active';
      await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods, status: newStatus2, updatedAt: serverTimestamp() });
      if (loan.status !== newStatus2) await logStatusChange('emi_loan', loan.id, loan.status, newStatus2, user?.uid);
      if (fullyPaid) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Closed',
          description: `EMI loan closed — ${loan.borrowerName} · ${loan.emiId || loan.id}`,
          amount: loan.loanAmount || 0, date: cpf.date || today(),
          borrowerName: loan.borrowerName, loanId: loan.id, emiId: loan.emiId || loan.id,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }
      toast.success(fullyPaid
        ? `🎉 All ${loan.totalPeriods} EMIs collected! Loan closed.`
        : isPartial ? `◐ Partial EMI recorded — period #${paidPeriods + 1} still due.` : `✓ EMI #${paidPeriods} collected. ${loan.totalPeriods - paidPeriods} remaining.`
      );
      setCollectLoan(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  // Bulk / multi-period settlement — the amount entered is applied OLDEST period
  // first: whichever periods it fully covers become Paid, at most one further
  // period absorbs a leftover partial amount, and anything past that stays
  // pending, exactly the "settle 2 months unpaid + 3rd month whole" pattern
  // already used by Interest Collection / Settle Interest.
  async function saveBulkCollection() {
    if (!cpf.amount || parseFloat(cpf.amount) <= 0) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      const loan = collectLoan;
      const cols = collections[loan.id] || [];
      const fine = cpf.collectFine ? parseFloat(cpf.fine) || 0 : 0;
      const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const periodsInScope = (cpf.bulkPeriods || []).filter(p => p.periodNo <= cpf.payThrough);
      let budget = parseFloat(cpf.amount) || 0;
      const settled = [];
      let partial = null, partialAmt = 0, exhausted = false;
      for (const period of periodsInScope) {
        if (exhausted) continue;
        const take = Math.min(budget, period.amount);
        budget -= take;
        if (take >= period.amount) settled.push({ ...period, paid: take });
        else if (take > 0) { partial = period; partialAmt = take; exhausted = true; }
        else exhausted = true;
      }
      if (settled.length === 0 && !partial) { toast.error('No amount allocated — increase the amount.'); setSaving(false); return; }

      let totalCollected = 0;
      for (const period of settled) {
        totalCollected += period.paid;
        const existingCol = cols.find(c => c.periodNo === period.periodNo);
        const data = {
          loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
          amount: period.paid, fine: 0, totalCollected: period.paid, expectedEMI: loan.emiAmount,
          date: cpf.date, mode: cpf.mode, remarks: cpf.remarks ? `${cpf.remarks} (bulk settlement)` : 'Bulk settlement',
          periodNo: period.periodNo, earlyClosure: false, status: 'Paid', dueDate: period.dueDate,
          daysOverdue: getDaysOverdue(period.dueDate), frequency: loan.frequency, settlementBatchId: batchId,
          updatedAt: serverTimestamp(),
        };
        if (existingCol) await updateDoc(doc(db, 'emi_collections', existingCol.id), data);
        else await addDoc(collection(db, 'emi_collections'), { ...data, createdAt: serverTimestamp(), createdBy: user?.uid || null });
      }
      if (partial) {
        totalCollected += partialAmt;
        const existingCol = cols.find(c => c.periodNo === partial.periodNo);
        const data = {
          loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
          amount: partialAmt, fine: 0, totalCollected: partialAmt, expectedEMI: loan.emiAmount,
          date: cpf.date, mode: cpf.mode, remarks: cpf.remarks ? `${cpf.remarks} (partial from bulk settlement)` : 'Partial from bulk settlement',
          periodNo: partial.periodNo, earlyClosure: false, status: 'Partial', dueDate: partial.dueDate,
          daysOverdue: getDaysOverdue(partial.dueDate), frequency: loan.frequency, settlementBatchId: batchId,
          updatedAt: serverTimestamp(),
        };
        if (existingCol) await updateDoc(doc(db, 'emi_collections', existingCol.id), data);
        else await addDoc(collection(db, 'emi_collections'), { ...data, createdAt: serverTimestamp(), createdBy: user?.uid || null });
      }

      const periodCount = settled.length + (partial ? 1 : 0);
      const firstNo = periodsInScope[0]?.periodNo;
      const lastNo = (partial || settled[settled.length - 1])?.periodNo;
      const rangeLabel = periodCount > 1 ? `#${firstNo}–#${lastNo}` : `#${lastNo || firstNo}`;

      if (totalCollected > 0) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Credit', category: 'EMI Collection',
          description: `EMI ${rangeLabel} from ${loan.borrowerName} — ${periodCount} period${periodCount !== 1 ? 's' : ''} settled together`,
          amount: totalCollected, paymentMode: cpf.mode, date: cpf.date,
          borrowerName: loan.borrowerName, loanId: loan.id, settlementBatchId: batchId,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }
      if (fine > 0) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Credit', category: 'Fine Income',
          description: `Late-payment fine from ${loan.borrowerName} — bulk settlement of ${periodCount} period${periodCount !== 1 ? 's' : ''}`,
          amount: fine, paymentMode: cpf.mode, date: cpf.date,
          borrowerName: loan.borrowerName, loanId: loan.id, settlementBatchId: batchId,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }

      const existingPaidCount = cols.filter(c => c.status === 'Paid').length;
      const newPaidCount = existingPaidCount + settled.length;
      const fullyPaid = newPaidCount >= loan.totalPeriods;
      await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: newPaidCount, status: fullyPaid ? 'Closed' : 'Active', updatedAt: serverTimestamp() });
      if (loan.status !== (fullyPaid ? 'Closed' : 'Active')) await logStatusChange('emi_loan', loan.id, loan.status, fullyPaid ? 'Closed' : 'Active', user?.uid);
      if (fullyPaid) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Closed',
          description: `EMI loan closed — ${loan.borrowerName} · ${loan.emiId || loan.id}`,
          amount: loan.loanAmount || 0, date: cpf.date || today(),
          borrowerName: loan.borrowerName, loanId: loan.id, emiId: loan.emiId || loan.id,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }

      toast.success(fullyPaid
        ? '🎉 All EMIs settled! Loan closed.'
        : partial
          ? `✓ ${settled.length} period${settled.length !== 1 ? 's' : ''} settled, #${partial.periodNo} partially paid.`
          : `✓ ${settled.length} period${settled.length !== 1 ? 's' : ''} settled together.`
      );
      setCollectLoan(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader stats={4} />;

  return (
    <div className="page-enter">
      <PageHeader title="Collect EMI" subtitle="Record EMI payments, view schedules and manage overdue instalments"
        action={<Button variant="secondary" onClick={() => printCollectEMISummary(filtered, collections, filter==='all'?'All':filter==='closed'?'Closed':'Active')}>📄 Export PDF</Button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }} className="grid-4">
        <StatCard label="Active EMI Due" value={formatCurrency(Math.round(totalDue))} sub={`${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''}`} color="#007aff" />
        <StatCard label="Collected (All Time)" value={formatCurrency(Math.round(totalCollectedAllTime))} sub="Across all EMI loans" color="#34c759" />
        <StatCard label="Periods Pending" value={totalPendingCount} sub="Remaining across active loans" color="#ff9500" />
        <StatCard label="Total Loans" value={loans.length} sub={`${loans.filter(l => l.status === 'Closed').length} closed`} color="#5856d6" />
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, EMI ID…"
            style={{ flex: '1 1 220px', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.1)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[['active', 'Active'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ padding: '8px 16px', borderRadius: 99, border: 'none', background: filter === k ? 'var(--accent)' : 'rgba(118,118,128,0.1)', color: filter === k ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>No EMI loans match filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((l, lIdx) => {
              const cols = collections[l.id] || [];
              const paid = cols.filter(c => c.status === 'Paid').length;
              const remaining = Math.max(0, (l.totalPeriods || 0) - paid);
              const pct = l.totalPeriods > 0 ? Math.round((paid / l.totalPeriods) * 100) : 0;
              const sched = getScheduleWithStatus(l, cols);
              const isOpen = expandedLoan === l.id;

              return (
                <div key={l.id} style={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
                    onClick={() => setExpandedLoan(isOpen ? null : l.id)}>
                    {l.photo ? <img src={l.photo} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,122,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{(l.borrowerName || '?')[0].toUpperCase()}</div>}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginRight: 4 }}>#{lIdx+1}</span>
                        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{l.borrowerName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: l.status === 'Active' ? 'rgba(52,199,89,0.12)' : 'rgba(118,118,128,0.12)', color: l.status === 'Active' ? '#1a7a34' : 'var(--text-secondary)' }}>{l.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{l.emiId} · {formatCurrency(l.loanAmount)} · EMI {formatCurrency(l.emiAmount)}/{l.frequency}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{paid}/{l.totalPeriods} PAID ({pct}%)</div>
                      <div style={{ fontSize: 11, color: remaining > 0 ? '#ff9500' : '#34c759' }}>{remaining > 0 ? `${remaining} remaining` : 'Complete'}</div>
                    </div>
                    {l.status === 'Active' && (
                      <Button size="sm" onClick={e => { e.stopPropagation(); openCollect(l); }}>Collect</Button>
                    )}
                  </div>

                  {isOpen && (() => {
                    const WIN = 5;
                    const defaultStart = Math.max(0, paid - 2);
                    const winStart = Math.min(Math.max(0, sched.length - WIN), windowStarts[l.id] ?? defaultStart);
                    const visible = sched.slice(winStart, winStart + WIN);
                    const canPrev = winStart > 0;
                    const canNext = winStart + WIN < sched.length;
                    return (
                      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '14px 16px', background: '#fafafa' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Click any unpaid slot to collect it (clicking one with earlier unpaid slots opens a bulk settlement for all of them together), or an already-paid one to edit / mark unpaid</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => setWindowStarts(w => ({ ...w, [l.id]: Math.max(0, winStart - 1) }))} disabled={!canPrev}
                            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: canPrev ? '#fff' : '#f5f5f5', color: canPrev ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: canPrev ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, flex: 1 }}>
                            {visible.map((slot, vi) => {
                              const i = winStart + vi;
                              const isPaid = slot.status === 'Paid';
                              const isPartial = slot.status === 'Partial';
                              const isOverdue = slot.status === 'Overdue';
                              const isNext = i === paid && !isPaid;
                              const label = new Date(slot.dueDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                              const bg = isPaid ? 'rgba(52,199,89,0.04)' : isPartial ? 'rgba(88,86,214,0.05)' : isOverdue ? 'rgba(255,59,48,0.04)' : isNext ? 'rgba(0,122,255,0.04)' : '#fff';
                              const border = isPaid ? 'rgba(52,199,89,0.25)' : isPartial ? 'rgba(88,86,214,0.25)' : isOverdue ? 'rgba(255,59,48,0.25)' : isNext ? 'rgba(0,122,255,0.3)' : 'rgba(0,0,0,0.07)';
                              const textCol = isPaid ? '#1a7a34' : isPartial ? '#5856d6' : isOverdue ? '#c0392b' : isNext ? '#007aff' : 'var(--text-primary)';
                              return (
                                <div key={i} onClick={() => openCollectForSlot(l, i)}
                                  style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${border}`, background: bg, cursor: 'pointer' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: textCol, marginBottom: 4 }}>{label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: isPaid ? '#34c759' : isPartial ? '#5856d6' : isOverdue ? '#ff3b30' : 'var(--text-secondary)' }}>
                                    {isPaid ? formatCurrency(slot.col.amount) : isPartial ? `${formatCurrency(slot.col.amount)} (partial)` : isOverdue ? `${slot.overdue}d overdue` : 'Pending'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button onClick={() => setWindowStarts(w => ({ ...w, [l.id]: Math.min(sched.length - WIN, winStart + 1) }))} disabled={!canNext}
                            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: canNext ? '#fff' : '#f5f5f5', color: canNext ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: canNext ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── COLLECT EMI MODAL ── */}
      <Modal open={!!collectLoan} onClose={() => setCollectLoan(null)}
        title={cpf.editingId ? `Edit EMI #${cpf.periodNo} — Change Status` : cpf.isBulk ? `Settle ${cpf.bulkPeriods?.length || ''} Pending Period${(cpf.bulkPeriods?.length || 0) !== 1 ? 's' : ''}` : 'Collect EMI Payment'}
        width={520}
        footer={collectLoan && (
          <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            {cpf.editingId && cpf.settlementBatchId ? (
              <Button variant="danger" onClick={() => undoEmiBatch(collectLoan, cpf.settlementBatchId)} disabled={saving}>
                ↩ Undo {cpf.batchEarlyClosure ? 'Early Closure' : `Settlement (${cpf.batchPeriodCount} period${cpf.batchPeriodCount !== 1 ? 's' : ''})`}
              </Button>
            ) : cpf.editingId && (
              <Button variant="danger" onClick={() => saveCollection('Unpaid')} disabled={saving}>↩ Mark Unpaid</Button>
            )}
            {!cpf.editingId && !cpf.isBulk && (
              <Button variant="secondary" onClick={() => saveCollection('Partial')} disabled={saving}>Partial</Button>
            )}
            {/* A period that belongs to a bulk/early-closure batch can only be
                Undone as a whole (see above) — editing its amount in place would
                silently desync it from the single combined ledger entry the
                whole batch shares, so no separate "save" action is offered here. */}
            {!(cpf.editingId && cpf.settlementBatchId) && (
              <Button onClick={() => saveCollection('Paid')} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                {saving ? 'Saving…' : cpf.earlyClose
                  ? `✓ Close Loan — ${formatCurrency(parseFloat(cpf.amount) || 0)}`
                  : cpf.isBulk
                    ? `✓ Settle ${formatCurrency(parseFloat(cpf.amount) || 0)}`
                    : cpf.collectFine && parseFloat(cpf.fine) > 0
                      ? `✓ Collect ${formatCurrency((parseFloat(cpf.amount) || 0) + (parseFloat(cpf.fine) || 0))}`
                      : `✓ Collect ${formatCurrency(parseFloat(cpf.amount) || 0)}`}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setCollectLoan(null)}>Cancel</Button>
          </div>
        )}>
        {collectLoan && (
          <>
            {/* Status shown first — before anything else */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: cpf.editingId ? 'rgba(52,199,89,0.08)' : 'rgba(255,149,0,0.08)', border: `1px solid ${cpf.editingId ? 'rgba(52,199,89,0.25)' : 'rgba(255,149,0,0.25)'}` }}>
              <span style={{ fontSize: 16 }}>{cpf.editingId ? '✅' : '⏳'}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: cpf.editingId ? '#1a7a34' : '#b45309' }}>{cpf.editingId ? 'Already Recorded' : cpf.isBulk ? 'Multiple Periods Pending' : 'Pending'}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{cpf.isBulk ? `${cpf.bulkPeriods.length} period${cpf.bulkPeriods.length !== 1 ? 's' : ''} due` : `EMI #${cpf.periodNo}`}</span>
            </div>

            {cpf.editingId && cpf.settlementBatchId && (
              <div style={{ padding: '10px 14px', background: 'rgba(175,82,222,0.06)', border: '1px solid rgba(175,82,222,0.2)', borderRadius: 9, marginBottom: 14, fontSize: 12.5, color: '#7d3cab', lineHeight: 1.5 }}>
                {cpf.batchEarlyClosure
                  ? <>This was settled as part of an <strong>early loan closure</strong> ({formatCurrency(cpf.batchTotal)}). Use Undo below to reverse the whole closure and reopen the loan.</>
                  : <>This was settled together with <strong>{cpf.batchPeriodCount} period{cpf.batchPeriodCount !== 1 ? 's' : ''}</strong> in one bulk settlement (total {formatCurrency(cpf.batchTotal)}). Use Undo below to reverse the whole batch.</>}
              </div>
            )}

            <div style={{ background: 'linear-gradient(135deg,#007aff,#34aadc)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                {collectLoan.photo
                  ? <img src={collectLoan.photo} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
                  : <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{(collectLoan.borrowerName || '?')[0].toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{collectLoan.borrowerName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{collectLoan.emiId} · {collectLoan.phone}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {cpf.isBulk ? (
                    <>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{cpf.bulkPeriods.length} period{cpf.bulkPeriods.length !== 1 ? 's' : ''} · of {collectLoan.totalPeriods}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{formatCurrency(cpf.bulkPeriods.reduce((s, p) => s + p.amount, 0))}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>Total pending</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>EMI #{cpf.periodNo} of {collectLoan.totalPeriods}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan) + emiInterestPerPeriod(collectLoan)))}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>P {formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan)))} + I {formatCurrency(Math.round(emiInterestPerPeriod(collectLoan)))}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {cpf.isBulk ? (
              <>
                <div style={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.03)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>PENDING PERIODS</div>
                  {cpf.bulkPeriods.map(p => (
                    <div key={p.periodNo} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', fontSize: 12.5, borderTop: '1px solid rgba(0,0,0,0.04)', opacity: p.periodNo <= cpf.payThrough ? 1 : 0.4 }}>
                      <span>EMI #{p.periodNo} · {fmtEmiDate(p.dueDate)}</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>

                <FormField label="Settle Through Period" hint="Also drives the 'close loan early' amount below — pick exactly how many periods' interest should be charged.">
                  <Select value={cpf.payThrough} onChange={e => setBulkPayThrough(parseInt(e.target.value))}>
                    {cpf.bulkPeriods.map(p => (
                      <option key={p.periodNo} value={p.periodNo}>Through EMI #{p.periodNo} ({fmtEmiDate(p.dueDate)})</option>
                    ))}
                  </Select>
                </FormField>

                {(() => {
                  // Scoped to whichever period is selected above — NOT to today's
                  // real date — so "Settle Through EMI #4" + "close early" charges
                  // interest for exactly 4 periods, matching what's picked, instead
                  // of silently charging for however many periods are overdue today.
                  const { remPrincipal, intAmt, owedPeriods, closeAmt } = computeEarlyCloseAmount(collectLoan, collections[collectLoan.id] || [], cpf.payThrough);
                  return (
                    <div style={{ background: 'rgba(175,82,222,0.06)', border: '1px solid rgba(175,82,222,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, marginTop: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={!!cpf.earlyCloseAll} onChange={e => setCpf(p => ({ ...p, earlyCloseAll: e.target.checked, earlyClose: e.target.checked, amount: e.target.checked ? String(closeAmt) : p.amount }))} style={{ width: 16, height: 16, accentColor: '#af52de', cursor: 'pointer' }} />
                        <span style={{ fontWeight: 700, color: '#7d3cab' }}>Close loan early — settle whole remaining amount</span>
                      </label>
                      {cpf.earlyCloseAll && (
                        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          Remaining principal <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(Math.round(remPrincipal))}</strong> + interest through EMI #{cpf.payThrough} (<strong>{owedPeriods}</strong> period{owedPeriods !== 1 ? 's' : ''}) <strong style={{ color: '#ff9500' }}>{formatCurrency(Math.round(intAmt))}</strong> = <strong style={{ color: '#af52de' }}>{formatCurrency(closeAmt)}</strong>. Loan will be marked <strong>closed</strong>.
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <FormField label={cpf.earlyCloseAll ? 'Settlement Amount (₹)' : 'Amount to Collect (₹)'} required>
                    <Input type="number" value={cpf.amount} onChange={e => setCpf(p => ({ ...p, amount: e.target.value }))} disabled={cpf.earlyCloseAll} />
                  </FormField>
                  <FormField label="Date" required>
                    <Input type="date" value={cpf.date} onChange={e => setCpf(p => ({ ...p, date: e.target.value }))} />
                  </FormField>
                  <FormField label="Payment Mode">
                    <Select value={cpf.mode} onChange={e => setCpf(p => ({ ...p, mode: e.target.value }))}>
                      <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>DD</option>
                    </Select>
                  </FormField>
                  <FormField label="Remarks">
                    <Input value={cpf.remarks} onChange={e => setCpf(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional note" />
                  </FormField>
                </div>

                {!cpf.earlyCloseAll && (
                  <div style={{ padding: '10px 14px', background: 'rgba(0,122,255,0.05)', border: '1px solid rgba(0,122,255,0.15)', borderRadius: 9, marginBottom: 14, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Amount is applied oldest period first. Whichever periods it fully covers are marked <strong>Paid</strong>; if it doesn't reach a full period, that one is marked <strong>Partial</strong> and the rest stay <strong>Pending</strong>.
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div onClick={() => setCpf(p => ({ ...p, collectFine: !p.collectFine, fine: p.collectFine ? '0' : p.fine }))}
                    style={{ width: 44, height: 26, borderRadius: 999, padding: 2, display: 'flex', alignItems: 'center', justifyContent: cpf.collectFine ? 'flex-end' : 'flex-start', background: cpf.collectFine ? '#ff3b30' : '#e5e5ea', transition: 'background .2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.22)' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: cpf.collectFine ? '#ff3b30' : 'var(--text-secondary)' }}>
                    {cpf.collectFine ? 'Add fine' : 'No fine'}
                  </span>
                  {cpf.collectFine && (
                    <input type="number" value={cpf.fine} onChange={e => setCpf(p => ({ ...p, fine: e.target.value }))} placeholder="Fine ₹"
                      style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1.5px solid rgba(255,59,48,0.3)', fontSize: 13, fontFamily: 'inherit', width: 110, marginLeft: 'auto' }} />
                  )}
                </div>
              </>
            ) : (
              <>
                {cpf.dueDate && (
                  <div style={{ padding: '10px 14px', background: cpf.daysOverdue > 2 ? 'rgba(255,59,48,0.06)' : cpf.daysOverdue > 0 ? 'rgba(255,149,0,0.06)' : 'rgba(52,199,89,0.06)', borderRadius: 9, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Due Date</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtEmiDate(cpf.dueDate)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {cpf.daysOverdue > 0
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: cpf.daysOverdue > 2 ? '#ff3b30' : '#ff9500' }}>
                          {cpf.daysOverdue > 2 ? `⚠ ${cpf.daysOverdue} days overdue` : `${cpf.daysOverdue}d (within grace)`}
                        </span>
                        : <span style={{ fontSize: 13, fontWeight: 600, color: '#34c759' }}>✓ On time</span>}
                    </div>
                  </div>
                )}

                {cpf.daysOverdue > 2 && (
                  <div style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginBottom: 10 }}>
                      ⚠ {cpf.daysOverdue - 2} days after grace — ₹{collectLoan.dailyFineRate || 50}/day suggested
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cpf.collectFine ? 10 : 0 }}>
                      <div onClick={() => setCpf(p => ({ ...p, collectFine: !p.collectFine, fine: '' }))}
                        style={{ width: 44, height: 26, borderRadius: 999, padding: 2, display: 'flex', alignItems: 'center', justifyContent: cpf.collectFine ? 'flex-end' : 'flex-start', background: cpf.collectFine ? '#ff3b30' : '#e5e5ea', transition: 'background .2s', cursor: 'pointer', flexShrink: 0 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.22)' }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: cpf.collectFine ? '#ff3b30' : 'var(--text-secondary)' }}>
                        {cpf.collectFine ? 'Fine ON — enter amount below' : 'Fine OFF'}
                      </span>
                    </div>
                    {cpf.collectFine && (
                      <div>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Fine Amount (₹)</label>
                        <input type="number" value={cpf.fine} onChange={e => setCpf(p => ({ ...p, fine: e.target.value }))}
                          placeholder="Enter fine amount…"
                          style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1.5px solid rgba(255,59,48,0.3)', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                          autoFocus />
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  const { remPrincipal, intAmt, owedPeriods, closeAmt } = computeEarlyCloseAmount(collectLoan, collections[collectLoan.id] || []);
                  return (
                    <div style={{ background: 'rgba(175,82,222,0.06)', border: '1px solid rgba(175,82,222,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={!!cpf.earlyClose} onChange={e => setCpf(p => ({ ...p, earlyClose: e.target.checked, amount: e.target.checked ? String(closeAmt) : String(collectLoan.emiAmount || '') }))} style={{ width: 16, height: 16, accentColor: '#af52de', cursor: 'pointer' }} />
                        <span style={{ fontWeight: 700, color: '#7d3cab' }}>Close loan early (settle now)</span>
                      </label>
                      {cpf.earlyClose && (
                        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                          Remaining principal <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(Math.round(remPrincipal))}</strong> + interest for <strong>{owedPeriods}</strong> elapsed month{owedPeriods !== 1 ? 's' : ''} <strong style={{ color: '#ff9500' }}>{formatCurrency(Math.round(intAmt))}</strong> = <strong style={{ color: '#af52de' }}>{formatCurrency(closeAmt)}</strong>. Loan will be marked <strong>closed</strong>.
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <FormField label="EMI Amount (₹)" required>
                    <Input type="number" value={cpf.amount} onChange={e => setCpf(p => ({ ...p, amount: e.target.value }))} />
                  </FormField>
                  <FormField label="Date" required>
                    <Input type="date" value={cpf.date} onChange={e => setCpf(p => ({ ...p, date: e.target.value }))} />
                  </FormField>
                  <FormField label="Payment Mode">
                    <Select value={cpf.mode} onChange={e => setCpf(p => ({ ...p, mode: e.target.value }))}>
                      <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>DD</option>
                    </Select>
                  </FormField>
                  <FormField label="Remarks">
                    <Input value={cpf.remarks} onChange={e => setCpf(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional note" />
                  </FormField>
                </div>

                {cpf.collectFine && parseFloat(cpf.fine) > 0 ? (
                  <div style={{ padding: '10px 14px', background: 'rgba(52,199,89,0.06)', border: '1px solid rgba(52,199,89,0.18)', borderRadius: 9, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      EMI {formatCurrency(parseFloat(cpf.amount) || 0)} + Fine {formatCurrency(parseFloat(cpf.fine) || 0)}
                    </span>
                    <span style={{ fontSize: 17, fontWeight: 800, color: '#34c759' }}>
                      = {formatCurrency((parseFloat(cpf.amount) || 0) + (parseFloat(cpf.fine) || 0))}
                    </span>
                  </div>
                ) : null}
              </>
            )}

            {/* ── Ledger Entries — Undo ── numbered list of every settlement this
                loan has, each with its own inline Undo, exactly like Settle
                Interest's (DepositorSettlement.js) "Ledger Entries — Undo"
                section — always visible here, not only when re-opening one
                already-collected period that happened to belong to a batch. */}
            <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Ledger Entries — Undo</div>
              {emiLedgerLoading && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 0' }}>Loading…</div>}
              {!emiLedgerLoading && emiLedger.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 0' }}>No settlement entries yet for this loan.</div>}
              {!emiLedgerLoading && emiLedger.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {emiLedger.map((entry, i) => (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.description}>{entry.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{entry.category} · {formatCurrency(entry.amount)} · {entry.date}</div>
                      </div>
                      {entry.type === 'Milestone' ? (
                        <span style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--text-tertiary)' }}>—</span>
                      ) : (
                        <button onClick={async () => { setUndoingKey(entry.settlementBatchId || entry.id); await undoEmiBatch(collectLoan, entry.settlementBatchId); setUndoingKey(null); loadEmiLedger(collectLoan); }} disabled={!!undoingKey}
                          style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#ff3b30', background: '#fff', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 7, padding: '5px 10px', cursor: undoingKey ? 'wait' : 'pointer' }}>
                          {undoingKey === (entry.settlementBatchId || entry.id) ? '…' : '↺ Undo'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
