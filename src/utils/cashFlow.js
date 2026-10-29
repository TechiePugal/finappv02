// ─────────────────────────────────────────────────────────────────────────────
// ONE definition of "money in" and "money out" for the whole Finance Ledger —
// used by the Overall Dashboard, the Monthly Dashboard, the Journal and the
// Ledger, so every screen agrees on what a rupee coming in or going out means.
//
//   MONEY IN  (+, green)                     MONEY OUT  (−, red)
//   ───────────────────────────────          ───────────────────────────────
//   Deposits received (new + top-ups)        Loans given (new + top-ups)
//   Loan interest collected (cash)           EMI loans given
//   Loan principal collected (repayments)    Deposit interest paid (cash)
//   EMI collected (instalments + closures)   Deposit principal refunded
//   Fine income                              Operational expenses
//
// NOT cash, so never counted as in or out anywhere:
//   • "Interest Added to Loan" / "Interest Compounded" — interest folded back
//     into a loan's / deposit's principal. No money moved; it only makes the
//     balance bigger. (Money moves later, when that bigger balance is repaid
//     or refunded — and THAT is counted then.)
//   • "Loan Closed" / "Deposit Closed" / "EMI Loan Closed" — status events.
//     The money side of a closure is its own repayment / refund / collection.
// ─────────────────────────────────────────────────────────────────────────────

// ── Ledger-entry classification (used by Journal + Ledger rows/summaries) ───
const NON_CASH = new Set(['Interest Added to Loan', 'Interest Compounded', 'Loan Closed', 'Deposit Closed', 'EMI Loan Closed']);
const MILESTONE_OUT = new Set(['Loan Created', 'EMI Loan Created']);
const MILESTONE_IN = new Set(['Deposit Created']);
// Older entries saved a deposit top-up as a Debit even though it is money the
// business RECEIVED — classify by what actually happened, not by that type.
const FORCE_IN = new Set(['Deposit Amount Increased']);

// 'in' | 'out' | 'none'
export function ledgerDirection(e) {
  const c = e?.category || '';
  if (e?.type === 'Milestone') {
    if (MILESTONE_OUT.has(c)) return 'out';
    if (MILESTONE_IN.has(c)) return 'in';
    return 'none';
  }
  if (NON_CASH.has(c)) return 'none';
  if (FORCE_IN.has(c)) return 'in';
  if (e?.type === 'Credit') return 'in';
  if (e?.type === 'Debit') return 'out';
  return 'none';
}

export const FLOW_GREEN = '#1a9d3f';
export const FLOW_RED = '#e0301e';
export const FLOW_GREY = '#8e8e93';

export function flowColor(dir) { return dir === 'in' ? FLOW_GREEN : dir === 'out' ? FLOW_RED : '#5856d6'; }
export function flowSign(dir) { return dir === 'in' ? '+' : dir === 'out' ? '−' : ''; }

// Which summary line a ledger entry belongs to.
const LEDGER_LINE = {
  'Deposit Created': 'depositsReceived',
  'Deposit Amount Increased': 'depositsReceived',
  'Loan Interest': 'loanInterest',
  'Loan Repayment': 'loanPrincipal',
  'EMI Collection': 'emiCollected',
  'Fine Income': 'fine',
  'Loan Created': 'loansGiven',
  'Loan Amount Increased': 'loansGiven',
  'EMI Loan Created': 'emiGiven',
  'Deposit Settlement': 'depInterestPaid',
  'Deposit Refund': 'depRefunds',
  'Finance Expense': 'expenses',
  'Expense': 'expenses',
};

// The ordered lines shown in every Money In / Money Out breakdown.
export const IN_LINES = [
  { key: 'depositsReceived', label: 'Deposits received' },
  { key: 'loanInterest', label: 'Loan interest collected' },
  { key: 'loanPrincipal', label: 'Loan principal collected' },
  { key: 'emiCollected', label: 'EMI collected' },
  { key: 'fine', label: 'Fine income' },
];
export const OUT_LINES = [
  { key: 'loansGiven', label: 'Loan amount given' },
  { key: 'emiGiven', label: 'EMI loans given' },
  { key: 'depInterestPaid', label: 'Deposit interest paid' },
  { key: 'depRefunds', label: 'Deposits refunded' },
  { key: 'expenses', label: 'Expenses' },
];

function emptyTotals() {
  const t = {};
  IN_LINES.concat(OUT_LINES).forEach(l => { t[l.key] = 0; });
  t.otherIn = 0; t.otherOut = 0; t.nonCash = 0;
  return t;
}

function finish(t) {
  const totalIn = IN_LINES.reduce((s, l) => s + t[l.key], 0) + t.otherIn;
  const totalOut = OUT_LINES.reduce((s, l) => s + t[l.key], 0) + t.otherOut;
  const inLines = IN_LINES.map(l => ({ ...l, amount: t[l.key] }));
  const outLines = OUT_LINES.map(l => ({ ...l, amount: t[l.key] }));
  if (t.otherIn) inLines.push({ key: 'otherIn', label: 'Other money in', amount: t.otherIn });
  if (t.otherOut) outLines.push({ key: 'otherOut', label: 'Other money out', amount: t.otherOut });
  return { inLines, outLines, totalIn, totalOut, net: totalIn - totalOut, nonCash: t.nonCash, totals: t };
}

// Summarise a list of LEDGER ENTRIES (Journal / Ledger — whatever is filtered).
export function summarizeLedger(entries) {
  const t = emptyTotals();
  (entries || []).forEach(e => {
    const amt = e.amount || 0;
    const dir = ledgerDirection(e);
    if (dir === 'none') { if (e.type !== 'Milestone') t.nonCash += amt; return; }
    const k = LEDGER_LINE[e.category];
    if (k) t[k] += amt;
    else if (dir === 'in') t.otherIn += amt;
    else t.otherOut += amt;
  });
  return finish(t);
}

// ── Dashboard engine: built from the real records (not the ledger), so a
// missing/duplicated ledger row can never skew it. ───────────────────────────
// range = { from:'YYYY-MM-DD', to:'YYYY-MM-DD' } (inclusive) or null = all time.
//
// How "given"/"received" principal is recovered per account:
//   borrower_master.loanAmount / deposit_master.depositAmount are LIVE balances
//   (they already include interest compounded in, and a deposit's has had
//   refunds taken out). The money that actually changed hands at the start is
//   therefore  loanAmount − (all additions)   and
//   depositAmount + (refunds) − (all additions);
//   later top-ups the person typed in are the additions that carry NO
//   settlementBatchId (compounded interest always carries one).
export function computeCashFlow(src, range) {
  const {
    borrowers = [], loanAdditions = [], repayments = [], payDocs = [],
    emiLoans = [], emiCols = [],
    deposits = [], depAdditions = [], refunds = [], setDocs = [],
    fineEntries = [], expenses = [],
  } = src;
  const t = emptyTotals();
  const inR = (d) => {
    if (!range) return true;
    if (!d) return false;
    const s = String(d).slice(0, 10);
    return (!range.from || s >= range.from) && (!range.to || s <= range.to);
  };
  const borIds = new Set(borrowers.map(b => b.id));
  const depIds = new Set(deposits.map(d => d.id));
  const emiIds = new Set(emiLoans.map(l => l.id));

  // Loans given — every loan ever issued (closed ones too) + manual top-ups
  borrowers.forEach(b => {
    const adds = loanAdditions.filter(a => a.borrowerId === b.id);
    const allAdd = adds.reduce((s, a) => s + (a.amount || 0), 0);
    const original = Math.max(0, (b.loanAmount || 0) - allAdd);
    if (inR(b.loanStartDate)) t.loansGiven += original;
    adds.filter(a => !a.settlementBatchId).forEach(a => { if (inR(a.date)) t.loansGiven += (a.amount || 0); });
  });
  // EMI loans given
  emiLoans.forEach(l => { if (inR(l.loanDate || l.emiStartDate)) t.emiGiven += (l.loanAmount || 0); });
  // Deposits received — every deposit ever taken (closed too) + manual top-ups
  deposits.forEach(d => {
    const adds = depAdditions.filter(a => a.depositorId === d.id);
    const allAdd = adds.reduce((s, a) => s + (a.amount || 0), 0);
    const refunded = refunds.filter(r => r.depositorId === d.id).reduce((s, r) => s + (r.amount || 0), 0);
    const original = Math.max(0, (d.depositAmount || 0) + refunded - allAdd);
    if (inR(d.startDate)) t.depositsReceived += original;
    adds.filter(a => !a.settlementBatchId).forEach(a => { if (inR(a.date)) t.depositsReceived += (a.amount || 0); });
  });
  // Deposit principal refunded
  refunds.filter(r => depIds.has(r.depositorId)).forEach(r => { if (inR(r.date)) t.depRefunds += (r.amount || 0); });
  // Loan principal collected (repayments)
  repayments.filter(r => !r.deleted && borIds.has(r.borrowerId)).forEach(r => { if (inR(r.date)) t.loanPrincipal += (r.repaidAmount || r.amount || 0); });
  // Loan interest collected — CASH only (compounded part moved no money)
  payDocs.filter(p => borIds.has(p.borrowerId) && (p.status === 'Paid' || p.status === 'Partial' || p.addedToLoan)).forEach(p => {
    const when = p.paymentDate || (p.month ? p.month + '-01' : '');
    if (inR(when)) t.loanInterest += (p.amountPaid || 0);
  });
  // Deposit interest paid — CASH only
  setDocs.filter(p => depIds.has(p.depositId) && (p.status === 'Paid' || p.status === 'Partial' || p.addedToDeposit)).forEach(p => {
    const when = p.paymentDate || (p.month ? p.month + '-01' : '');
    if (inR(when)) t.depInterestPaid += (p.amountPaid || 0);
  });
  // EMI collected (full instalment cash, early closures included)
  emiCols.filter(c => emiIds.has(c.loanId) && (c.status === 'Paid' || c.status === 'Partial') && (c.amount || 0) > 0).forEach(c => {
    if (inR(c.date)) t.emiCollected += (c.amount || 0);
  });
  // Fine income
  fineEntries.filter(e => !e.deleted).forEach(e => { if (inR(e.date)) t.fine += (e.amount || 0); });
  // Expenses
  expenses.forEach(e => { if (inR(e.date)) t.expenses += (e.amount || 0); });

  return finish(t);
}
