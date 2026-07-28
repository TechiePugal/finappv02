// Shared EMI calculation logic — used by both the EMI Loans page (list/create/
// edit) and the Collect EMI page (recording payments), so the schedule/fine/
// EMI-amount math can never drift between the two.
export function genId() { return 'EMI-' + Date.now().toString(36).toUpperCase(); }
export function today() { return new Date().toISOString().split('T')[0]; }

export const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
export const FREQ_FACTOR = { daily: 30, weekly: 4.33, monthly: 1 };

export function calcEMI(principal, rate, periods, freq) {
  // Flat monthly model: each period repays equal principal + flat interest on the ORIGINAL principal.
  const p = parseFloat(principal) || 0;
  const r = parseFloat(rate) || 0;
  const n = parseInt(periods) || 1;
  const interestPerPeriod = p * (r / 100);
  return (p / n) + interestPerPeriod;
}
export function emiPrincipalPerPeriod(loan) { const n = parseInt(loan.totalPeriods) || 1; return (parseFloat(loan.loanAmount) || 0) / n; }
export function emiInterestPerPeriod(loan) { return (parseFloat(loan.loanAmount) || 0) * ((parseFloat(loan.interestRate) || 0) / 100); }

export function buildSchedule(loan) {
  const { frequency, emiStartDate, totalPeriods } = loan;
  if (!emiStartDate || !totalPeriods) return [];
  const start = new Date(emiStartDate);
  const out = [];
  for (let i = 1; i <= totalPeriods; i++) {
    const d = new Date(start);
    if (frequency === 'daily')        d.setDate(d.getDate() + (i - 1));
    else if (frequency === 'weekly')  d.setDate(d.getDate() + (i - 1) * 7);
    else                              d.setMonth(d.getMonth() + (i - 1));
    out.push({ periodNo: i, dueDate: d.toISOString().split('T')[0] });
  }
  return out;
}

export function getDaysOverdue(dueDate) {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((new Date() - new Date(dueDate)) / 86400000));
}

export function calcFine(dueDate, dailyRate = 50) {
  const d = getDaysOverdue(dueDate);
  return d <= 2 ? 0 : (d - 2) * dailyRate;
}

export function fmtEmiDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

// Per-loan schedule enriched with each period's live status — the single
// source of truth both pages use to render period cards identically.
export function getScheduleWithStatus(loan, cols) {
  const sched = buildSchedule(loan);
  const sortedCols = [...(cols || [])].sort((a, b) => a.periodNo - b.periodNo);
  return sched.map((slot, i) => {
    const col = sortedCols.find(c => c.periodNo === i + 1);
    const overdue = getDaysOverdue(slot.dueDate);
    const fine = calcFine(slot.dueDate, loan.dailyFineRate || 50);
    return { ...slot, col, overdue, fine, status: col ? (col.status === 'Partial' ? 'Partial' : col.status === 'Unpaid' ? (overdue > 0 ? 'Overdue' : 'Pending') : 'Paid') : overdue > 0 ? 'Overdue' : 'Pending' };
  });
}
