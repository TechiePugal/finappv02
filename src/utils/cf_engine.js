import { addMonths } from './cf_format';

/**
 * cf_engine.js — Chit Fund ERP Business Logic
 * Based on: ChitFund ERP Development Reference v1.0
 *
 * KEY FORMULA REFERENCE (from spec):
 *   Subscription        = chit_value / total_members
 *   Organiser Amount    = chit_value × (organiser_fee_pct / 100)  ← NO || fallback!
 *   Pool                = bid_amount − organiser_amount
 *   Double eligible     = total_members (ALL — cashed and non-cashed)
 *   Single eligible     = total_members − already_cashed − 1  (min 1)
 *   Commission/member   = pool / eligible
 *   Net Payable (double)= subscription − commission_per_member  (everyone same)
 *   Net Payable (single non-cashed non-winner) = subscription − commission_per_member
 *   Net Payable (single CASHED)                = subscription  (NO deduction)
 *   Net Payable (single WINNER)                = subscription  (NO deduction on own round)
 *   Winner In-Hand      = chit_value − bid_amount
 *   Bid from Net (double) = (sub − net) × total_members + org_amount
 *   Bid from Net (single) = (sub − net) × eligible    + org_amount
 */

// ── Helpers ───────────────────────────────────────────────────────────────────
export function roundTo(v, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }

// CRITICAL: never use `|| 5` fallback — 0% fee is valid (interest-free chit)
function safeOrgPct(pct) { return (isNaN(pct) || pct == null) ? 0 : +pct; }

/** Subscription (per-head value) = chit value / members */
export function calcSubscription(chitValue, totalMembers) {
  if (!totalMembers) return 0;
  return roundTo(chitValue / totalMembers, 2);
}

export function calcPerHeadValue(totalValue, totalMembers) {
  return calcSubscription(totalValue, totalMembers);
}

// ── Core Commission Engine ─────────────────────────────────────────────────────
/**
 * Forward calculator: given bid amount, return full breakdown.
 *
 * @param {object} params
 *   chitValue          - total chit value ₹
 *   totalMembers       - total member count
 *   organiserFeePct    - organiser fee % (0–5, NEVER default to 5)
 *   commissionType     - 'Single' | 'Double'
 *   alreadyCashedCount - members who won in previous rounds (for Single)
 *   bidAmount          - amount winner bids (foregoes)
 * @returns {object} full commission breakdown
 */
export function calcCommissionForward({
  chitValue, totalMembers, organiserFeePct, commissionType, alreadyCashedCount, bidAmount,
}) {
  const orgPct = safeOrgPct(organiserFeePct);
  const subscription = roundTo(chitValue / totalMembers, 2);
  const orgAmount = roundTo(chitValue * (orgPct / 100), 2);

  // Validate: bid must be > orgAmount and < chitValue
  if (bidAmount <= orgAmount) return null; // negative pool
  if (bidAmount >= chitValue) return null;

  const pool = roundTo(bidAmount - orgAmount, 2);

  let eligible;
  if (commissionType === 'Double') {
    // ALL members get commission (cashed and non-cashed)
    eligible = totalMembers;
  } else {
    // Single: only NON-CASHED excluding THIS round's winner
    eligible = Math.max(1, totalMembers - alreadyCashedCount - 1);
  }

  const commissionPerMember = roundTo(pool / eligible, 2);
  const winnerInHand = roundTo(chitValue - bidAmount, 2);

  return {
    subscription,
    orgAmount,
    pool,
    eligible,
    commissionPerMember,
    winnerInHand,
    bidAmount,
    // Net payables by role:
    netPayableNonCashedNonWinner: roundTo(subscription - commissionPerMember, 2),
    netPayableDouble: roundTo(subscription - commissionPerMember, 2), // same for all in double
    netPayableCashedMember: subscription, // single: cashed pay FULL sub, no commission
    netPayableWinner: subscription,       // winner pays full sub on their own round
  };
}

/**
 * Reverse calculator: given what a member actually paid (net_payable), derive full breakdown.
 * Use this when user enters "I paid ₹X" and wants to see the full auction breakdown.
 *
 * @param {object} params  — same as forward, replace bidAmount with netPayable
 * @returns {object} full breakdown
 */
export function calcCommissionReverse({
  chitValue, totalMembers, organiserFeePct, commissionType, alreadyCashedCount, netPayable,
}) {
  const orgPct = safeOrgPct(organiserFeePct);
  const subscription = roundTo(chitValue / totalMembers, 2);
  const orgAmount = roundTo(chitValue * (orgPct / 100), 2);

  const commissionPerMember = roundTo(subscription - netPayable, 2);

  let eligible;
  if (commissionType === 'Double') {
    eligible = totalMembers;
  } else {
    eligible = Math.max(1, totalMembers - alreadyCashedCount - 1);
  }

  const pool = roundTo(commissionPerMember * eligible, 2);
  const bidAmount = roundTo(pool + orgAmount, 2);
  const winnerInHand = roundTo(chitValue - bidAmount, 2);

  if (bidAmount <= 0 || winnerInHand <= 0) return null;

  return {
    subscription,
    orgAmount,
    pool,
    eligible,
    commissionPerMember,
    winnerInHand,
    bidAmount,
    netPayable,
    netPayableNonCashedNonWinner: netPayable,
    netPayableCashedMember: subscription,
    netPayableWinner: subscription,
  };
}

/**
 * Legacy wrapper for processAuction compatibility.
 * Maps old field names to new engine.
 */
export function calcCommission(chit, auction, alreadyCashedCount) {
  const orgPct = safeOrgPct(chit.managerCommissionPct);
  const chitValue = chit.totalChitValue;
  const totalMembers = chit.totalMembers;
  const bidAmount = auction.bidAmount;

  const result = calcCommissionForward({
    chitValue, totalMembers,
    organiserFeePct: orgPct,
    commissionType: chit.commissionType || 'Single',
    alreadyCashedCount: alreadyCashedCount || 0,
    bidAmount,
  });
  if (!result) return {
    discount: 0, commissionPool: 0, managerCommission: orgPct > 0 ? roundTo(chitValue * orgPct / 100, 2) : 0,
    memberCommission: 0, eligibleMembers: 0, totalCollected: 0,
  };

  // Map back to legacy field names
  return {
    discount: roundTo(chit.perHeadValue - bidAmount, 2),
    commissionPool: result.pool,
    managerCommission: result.orgAmount,
    memberCommission: result.commissionPerMember,
    eligibleMembers: result.eligible,
    totalCollected: roundTo(bidAmount * (chit.commissionType === 'Double' ? totalMembers : result.eligible), 2),
  };
}

// ── Phase-Based Range Estimates ───────────────────────────────────────────────
/**
 * Calculate 4 phases based on total member count.
 * Spec: phase_size = ceil(totalMembers / 4)
 *
 * @returns Array of {phaseIndex, label, startRound, endRound}
 */
export function calcPhases(totalMembers) {
  const size = Math.ceil(totalMembers / 4);
  return [0, 1, 2, 3].map(i => ({
    phaseIndex: i,
    label: `Phase ${i + 1}`,
    startRound: i * size + 1,
    endRound: Math.min((i + 1) * size, totalMembers),
  }));
}

/**
 * Get which phase index (0–3) a given round falls in.
 * Spec: floor((R-1) / phase_size), capped at 3
 */
export function getPhaseIndex(round, totalMembers) {
  const size = Math.ceil(totalMembers / 4);
  return Math.min(Math.floor((round - 1) / size), 3);
}

/**
 * Get expected payable for a given round using phase ranges.
 * Falls back to full subscription if range not set.
 *
 * @param {number} round        - 1-based round number
 * @param {number} totalMembers
 * @param {object} ranges       - { phase1, phase2, phase3, phase4 } — null if not set
 * @param {number} subscription - fallback
 */
export function getExpectedPayable(round, totalMembers, ranges, subscription) {
  if (!ranges) return subscription;
  const idx = getPhaseIndex(round, totalMembers);
  const keys = ['phase1', 'phase2', 'phase3', 'phase4'];
  const val = ranges[keys[idx]];
  return (val != null && val > 0) ? val : subscription;
}

/**
 * Calculate commission saved vs paying full subscription.
 */
export function calcCommissionSaved(subscription, expectedPayable) {
  return Math.max(0, roundTo(subscription - expectedPayable, 2));
}

// ── Auction Calendar & Projection ─────────────────────────────────────────────
/**
 * Get YYYY-MM key for a date. Uses pure integer arithmetic to avoid UTC/IST timezone issues.
 * NEVER use .toISOString() for month derivation — it converts to UTC, causing IST dates
 * near midnight to flip to previous month.
 */
export function getMonthKey(date) {
  const d = date instanceof Date ? date : new Date(date?.seconds ? date.seconds * 1000 : date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Add N months using pure integer arithmetic (no timezone issues). */
export function addMonthsSafe(dateOrStr, months) {
  let d;
  if (typeof dateOrStr === 'string' && dateOrStr.length === 7) {
    // YYYY-MM format
    const [y, m] = dateOrStr.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  }
  d = dateOrStr instanceof Date ? new Date(dateOrStr) : new Date(dateOrStr?.seconds ? dateOrStr.seconds * 1000 : dateOrStr);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Difference in months between two YYYY-MM strings. */
function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return Math.abs((by - ay) * 12 + (bm - am));
}

/**
 * Get the next pending auction month for a chit.
 * Uses YYYY-MM strings throughout to avoid timezone issues.
 */
export function getNextAuctionMonth(chit, schedule) {
  // Find the last completed auction's month
  const completed = schedule.filter(s => s.status === 'Completed');
  const cycle = chit.auctionInterval || chit.pay_cycle_months || 1;

  if (completed.length === 0) {
    // No completed auctions — first auction is startDate
    const startDate = chit.startDate || chit.start_month;
    if (!startDate) return null;
    return typeof startDate === 'string' && startDate.length === 7
      ? startDate
      : getMonthKey(new Date(startDate));
  }

  // Find the highest auction number completed
  const lastDone = completed.reduce((max, a) => a.auctionNumber > max.auctionNumber ? a : max, completed[0]);
  const lastDate = lastDone.auctionDate;
  const lastMonth = lastDate?.seconds
    ? getMonthKey(new Date(lastDate.seconds * 1000))
    : (typeof lastDate === 'string' && lastDate.length === 7 ? lastDate : getMonthKey(new Date(lastDate)));

  return addMonthsSafe(lastMonth, cycle);
}

/**
 * Get all chits that have an auction in a given YYYY-MM month.
 * Implements the spec's projection algorithm with 60-month safety break.
 */
export function getChitsForMonth(ym, chits, schedules) {
  const result = [];
  chits.forEach(c => {
    const schedule = schedules[c.id] || [];
    const realDoneCount = schedule.filter(s => s.status === 'Completed').length;
    const remaining = c.totalMembers - realDoneCount;
    if (remaining <= 0) return;

    const next = getNextAuctionMonth(c, schedule);
    if (!next) return;

    const cycle = c.auctionInterval || c.pay_cycle_months || 1;
    let cursor = next;
    for (let i = 0; i < remaining; i++) {
      if (cursor === ym) {
        const roundNumber = realDoneCount + 1 + i;
        result.push({ chit: c, roundNumber, expectedPayable: c.perHeadValue || 0 });
        break;
      }
      cursor = addMonthsSafe(cursor, cycle);
      if (monthDiff(cursor, ym) > 60) break; // safety
    }
  });
  return result;
}

/**
 * Build month-by-month projection (used by Dashboard and Projection page).
 * Returns array sorted by month, each with total required investment.
 */
export function buildMonthProjection(chits, allSchedules) {
  const projection = {};

  chits.forEach(chit => {
    const schedule = allSchedules[chit.id] || [];
    const realDoneCount = schedule.filter(s => s.status === 'Completed').length;
    const remaining = chit.totalMembers - realDoneCount;
    if (remaining <= 0) return;

    const next = getNextAuctionMonth(chit, schedule);
    if (!next) return;

    const cycle = chit.auctionInterval || 1;
    const isCompanyTaken = chit.companyTakenAuction !== null && chit.companyTakenAuction !== undefined;
    const subscription = roundTo((chit.totalChitValue || 0) / (chit.totalMembers || 1), 2);
    const slab = chit.slabType === 'Fixed'
      ? (chit.slabValue || 0)
      : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
    const monthlyInvestment = isCompanyTaken ? subscription : slab;

    let cursor = next;
    for (let i = 0; i < remaining; i++) {
      if (!projection[cursor]) {
        projection[cursor] = { month: new Date(cursor + '-01'), key: cursor, total: 0, chits: [] };
      }
      projection[cursor].total = roundTo(projection[cursor].total + monthlyInvestment, 2);
      projection[cursor].chits.push({
        chitId: chit.id,
        chitName: chit.companyName,
        investment: monthlyInvestment,
        isTaken: isCompanyTaken,
        auctionNo: realDoneCount + 1 + i,
        perHeadValue: subscription,
        slabValue: slab,
      });
      cursor = addMonthsSafe(cursor, cycle);
      if (i > 200) break; // safety
    }
  });

  return Object.values(projection).sort((a, b) => a.key.localeCompare(b.key));
}

// ── Urgency & Take Suggestion Engine ─────────────────────────────────────────
/**
 * Determine if company should consider taking a chit now.
 *
 * Logic:
 *  - If already taken: no suggestion
 *  - urgencyScore = completionPct × (1 - slabRatio) × 100
 *    High score = paying cheap (slab << perHead) but approaching completion = should take
 *  - isUrgent: ≤2 rounds left OR next auction ≤3 days
 */
export function calcTakeSuggestion(chit, schedule) {
  if (chit.companyTakenAuction !== null && chit.companyTakenAuction !== undefined) return null;
  if (chit.status !== 'Active') return null;

  const completed = schedule.filter(s => s.status === 'Completed').length;
  const total = chit.totalMembers || 1;
  const remaining = total - completed;
  const completionPct = completed / total;

  const perHead = roundTo((chit.totalChitValue || 0) / total, 2);
  const slab = chit.slabType === 'Fixed'
    ? (chit.slabValue || 0)
    : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
  const slabRatio = perHead > 0 ? slab / perHead : 1;

  // Higher score = bigger benefit from taking now (paid cheap for long, prize still valuable)
  const urgencyScore = Math.round(completionPct * (1 - slabRatio) * 100);

  const nextPending = schedule.find(s => s.status === 'Pending');
  const nextDate = nextPending?.auctionDate
    ? (nextPending.auctionDate?.seconds ? new Date(nextPending.auctionDate.seconds * 1000) : new Date(nextPending.auctionDate))
    : null;
  const daysToNext = nextDate ? Math.floor((nextDate - new Date()) / 86400000) : null;

  const isUrgent = remaining <= 2 || (daysToNext !== null && daysToNext >= 0 && daysToNext <= 3);

  // Estimate prize if taken now (conservative: bid at 85% of perHead)
  const estBidPct = completionPct > 0.7 ? 0.90 : completionPct > 0.4 ? 0.85 : 0.80;
  const estBid = roundTo(perHead * estBidPct, 0);
  const estPrize = roundTo((chit.totalChitValue || 0) - estBid, 0);

  // Future cost if NOT taken (continue paying slab)
  const futureCostIfNotTaken = roundTo(slab * remaining, 0);
  const futureCostIfTaken = roundTo(perHead * remaining, 0);
  const netSaving = roundTo(futureCostIfNotTaken - futureCostIfTaken, 0); // usually negative (taking costs more)

  if (urgencyScore < 5 && !isUrgent) return null;

  return {
    chitId: chit.id,
    chitName: chit.companyName,
    urgencyScore,
    isUrgent,
    completed,
    remaining,
    completionPct,
    perHead,
    slab,
    slabRatio,
    daysToNext,
    nextDate,
    estBid,
    estPrize,
    futureCostIfNotTaken,
    futureCostIfTaken,
    netSaving,
    reason: isUrgent && remaining <= 2
      ? `Only ${remaining} auction${remaining !== 1 ? 's' : ''} left — take soon before opportunity closes`
      : isUrgent && daysToNext !== null && daysToNext <= 3
        ? `Next auction in ${daysToNext === 0 ? 'TODAY' : daysToNext + 'd'} — decide now`
        : `${Math.round(completionPct * 100)}% complete, slab (${formatRupees(slab)}) much lower than per-head (${formatRupees(perHead)}) — good time to take`,
  };
}

function formatRupees(v) { return '₹' + Math.round(v).toLocaleString('en-IN'); }

// ── Existing compat exports ───────────────────────────────────────────────────
export function calcInvestment(chit, isCompanyTaken, isFutureTaken) {
  const sub = roundTo((chit.totalChitValue || 0) / (chit.totalMembers || 1), 2);
  if (isCompanyTaken || isFutureTaken) return sub;
  return chit.slabType === 'Fixed'
    ? (chit.slabValue || 0)
    : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
}

export function calcExposure(totalInvested, totalReceived) {
  return roundTo(totalInvested - totalReceived, 2);
}

export function calcFutureLiability(chit, auctionsCompleted, companyTakenAuction) {
  const remaining = chit.totalMembers - auctionsCompleted;
  const isTaken = companyTakenAuction !== null && companyTakenAuction !== undefined;
  const sub = roundTo((chit.totalChitValue || 0) / (chit.totalMembers || 1), 2);
  const slabVal = chit.slabType === 'Fixed'
    ? (chit.slabValue || 0)
    : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
  return roundTo(remaining * (isTaken ? sub : slabVal), 2);
}

export function generateAuctionSchedule(startDate, totalMembers, intervalMonths) {

  const schedule = [];
  const start = new Date(startDate);
  for (let i = 0; i < totalMembers; i++) {
    schedule.push({
      auctionNumber: i + 1,
      auctionDate: addMonths(start, i * intervalMonths),
      status: 'Pending',
      winnerId: null, winnerName: null, bidAmount: null, takenByCompany: false,
    });
  }
  return schedule;
}
