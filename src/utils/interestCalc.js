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
// THE RULE (corrected): an extra amount added DURING a given month has not been
// held for that whole month yet, so it does not earn interest for that month —
// it only starts counting from the FOLLOWING month onward. A top-up made on
// any day in August still uses the OLD, smaller principal for August itself;
// September is the first month that uses the new, larger amount. This applies
// the same way whether the money arrived as a fresh top-up or as interest that
// was compounded back into the principal on settlement — either way, money
// added this month hasn't been sitting there earning for this month.
//
// (Previous rule, now retired: additions used to apply starting the SAME month
// they were made. That double-counted a same-month compounding as if it had
// already been earning all along, which is what caused figures to look "off"
// for the settlement month itself.)

/**
 * Given a live (current) amount, a list of {date, amount} additions, any
 * already-repaid total, and the specific month being calculated for, returns
 * what the principal actually was during that month.
 */
export function getEffectiveOutstanding(liveAmount, additions, repaidTotal, targetMonth) {
  let outstanding = Math.max(0, (liveAmount||0) - (repaidTotal||0));
  const notYetEffective = (additions||[])
    .filter(a => a.date && a.date.slice(0,7) >= targetMonth)
    .reduce((s,a) => s + (a.amount||0), 0);
  return Math.max(0, outstanding - notYetEffective);
}

/** Interest due for a LOAN in a specific month (borrower_master + loan_additions). */
export function calcLoanInterestForMonth(borrower, additions, repaidTotal, targetMonth) {
  const outstanding = getEffectiveOutstanding(borrower.loanAmount||0, additions, repaidTotal, targetMonth);
  return outstanding * (borrower.interestRate||0) / 100;
}

const _tenureLegacyMap = {'Monthly':1,'Quarterly':3,'Half-Yearly':6,'Yearly':12};
function parseTenureMonths(tenureMonths) {
  return (typeof tenureMonths==='string' && isNaN(tenureMonths))
    ? (_tenureLegacyMap[tenureMonths]||1)
    : (parseInt(tenureMonths)||1);
}

// BUG THIS FIXES: a deposit with a payout tenure LONGER than 1 month (Quarterly,
// Half-Yearly, Yearly...) was showing its FULL period's interest as "due" in
// EVERY single calendar month, on the Overall Dashboard, the Monthly Dashboard,
// the Depositors list, and the Settle Interest PDF — not just the one month it
// actually falls due in. A quarterly ₹1,00,000 deposit would show ₹3,000 due in
// January, ₹3,000 again in February, ₹3,000 again in March, when only ONE of
// those months (the actual payout month) should show anything at all.
//
// isDepositDueMonth walks forward from the deposit's start date in steps of its
// own tenure and checks whether targetMonth actually lands on one of those
// steps — exactly the same schedule Settle Interest's own calendar (genSlots)
// already uses, just expressed as a yes/no check instead of a generated list.
export function isDepositDueMonth(depositor, targetMonth) {
  const t = parseTenureMonths(depositor?.interestTenure);
  if (t<=1) return true; // monthly payout — every month is a due month
  if (!depositor?.startDate || !targetMonth) return true; // not enough info to gate — fail open, matches old behavior
  const start = new Date(depositor.startDate);
  const [ty,tm] = String(targetMonth).split('-').map(Number);
  if (!ty || !tm) return true;
  const startTotal = start.getFullYear()*12 + start.getMonth();
  const targetTotal = (ty*12) + (tm-1);
  const diff = targetTotal - startTotal;
  if (diff<0) return false; // before the deposit even started
  return diff % t === 0;
}

/** Interest due for a DEPOSIT in a specific month (deposit_master + deposit_additions). */
export function calcDepositInterestForMonth(depositor, additions, targetMonth) {
  if (!isDepositDueMonth(depositor, targetMonth)) return 0; // not this deposit's due month — nothing payable here
  const p = getEffectiveOutstanding(depositor.depositAmount||0, additions, 0, targetMonth);
  const r = depositor.interestRate||0;
  const t = parseTenureMonths(depositor.interestTenure);
  // Simple: principal × monthly rate × months. Compound: principal × ((1+r)^t − 1)
  return depositor.compounding ? p*(Math.pow(1+r/100,t)-1) : (p*(r/100)*t);
}
