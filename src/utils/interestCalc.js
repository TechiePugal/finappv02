// ── Date-Aware Interest Calculation ─────────────────────────────────────────
// THE BUG THIS FIXES: interest was being computed independently in half a
// dozen different files (Dashboard, Monthly Report, Depositors list, Collect
// Interest, Settle Interest), each with its own copy of the same formula.
// Every one of them read the loan/deposit's CURRENT amount with no memory of
// WHEN it changed — so adding extra principal partway through instantly
// changed interest for months that had already passed, and because the logic
// was duplicated everywhere, fixing it in one place never fixed it everywhere.
//
// This is the single source of truth going forward. Every file that needs a
// specific month's interest figure should import from here instead of
// re-deriving its own copy of the math.
//
// THE RULE: an extra amount added in a given month applies STARTING that same
// month — a top-up in August means August itself already uses the new, larger
// principal. Only months strictly BEFORE the addition keep the old amount.

/**
 * Given a live (current) amount, a list of {date, amount} additions, any
 * already-repaid total, and the specific month being calculated for, returns
 * what the principal actually was during that month.
 */
export function getEffectiveOutstanding(liveAmount, additions, repaidTotal, targetMonth) {
  let outstanding = Math.max(0, (liveAmount||0) - (repaidTotal||0));
  const notYetEffective = (additions||[])
    .filter(a => a.date && a.date.slice(0,7) > targetMonth)
    .reduce((s,a) => s + (a.amount||0), 0);
  return Math.max(0, outstanding - notYetEffective);
}

/** Interest due for a LOAN in a specific month (borrower_master + loan_additions). */
export function calcLoanInterestForMonth(borrower, additions, repaidTotal, targetMonth) {
  const outstanding = getEffectiveOutstanding(borrower.loanAmount||0, additions, repaidTotal, targetMonth);
  return outstanding * (borrower.interestRate||0) / 100;
}

/** Interest due for a DEPOSIT in a specific month (deposit_master + deposit_additions). */
export function calcDepositInterestForMonth(depositor, additions, targetMonth) {
  const p = getEffectiveOutstanding(depositor.depositAmount||0, additions, 0, targetMonth);
  const r = depositor.interestRate||0;
  const t = parseInt(depositor.interestTenure)||1;
  // Simple: principal × monthly rate × months. Compound: principal × ((1+r)^t − 1)
  return depositor.compounding ? p*(Math.pow(1+r/100,t)-1) : (p*(r/100)*t);
}
