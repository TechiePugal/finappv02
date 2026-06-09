/**
 * cf_engine.js — Chit Fund Business Logic Engine
 * 
 * Deep-analysed and ported from reference implementation.
 * 
 * KEY FORMULAS (from reference + spec):
 *
 * SINGLE commission:
 *   eligible = max(members - cashedCount - 1, 1)   ← non-cashed, non-winner
 *   pool = (sub - myPayable) × eligible
 *   bid  = pool + orgAmount
 *   already-cashed members → pay FULL sub, earn NOTHING
 *   winner → pays FULL sub on own round (single), earns commission on others
 *
 * DOUBLE commission:
 *   eligible = members   ← ALL members INCLUDING already-cashed
 *   pool = (sub - myPayable) × eligible
 *   everyone (cashed + non-cashed) gets commission
 *   winner pays (sub - commission) — same as everyone
 *
 * Phase ranges: ceil(members/4) rounds per phase
 *   getExpectedPayable(chit, round) → ranges[phaseIdx] or sub if not set
 *
 * Investment rule (spec §7):
 *   Not taken → Slab Value
 *   Taken     → Per Head Value (auto-switches all future months)
 *
 * Month arithmetic: ALWAYS pure YYYY-MM string math, NEVER Date() — timezone bug
 */

import { addMonths, roundTo } from './cf_format';

// ─── Month string arithmetic (safe, no timezone) ──────────────────────────
/** Add N months to a YYYY-MM string. Returns YYYY-MM. */
export function addMonthsToYM(ym, n) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  let total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Get YYYY-MM key from a Date or Firestore timestamp. Pure integer math. */
export function getMonthKey(date) {
  const d = date?.seconds ? new Date(date.seconds * 1000)
    : date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Schedule generation ──────────────────────────────────────────────────
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

// ─── Per head / subscription ──────────────────────────────────────────────
export function calcPerHeadValue(totalValue, totalMembers) {
  if (!totalMembers) return 0;
  return roundTo(totalValue / totalMembers, 2);
}
export const calcSubscription = calcPerHeadValue;

// ─── Phase ranges ─────────────────────────────────────────────────────────
/**
 * 4 phases, each = ceil(members/4) rounds.
 * Returns [{phaseIndex, label, startRound, endRound}]
 */
export function calcPhases(totalMembers) {
  const size = Math.ceil((totalMembers || 1) / 4);
  return [0, 1, 2, 3].map(i => ({
    phaseIndex: i,
    label: `Phase ${i + 1}`,
    startRound: i * size + 1,
    endRound: Math.min((i + 1) * size, totalMembers),
  }));
}

/** Which phase (0-3) does a given round fall in? */
export function getPhaseIndex(round, totalMembers) {
  const size = Math.ceil((totalMembers || 1) / 4);
  return Math.min(Math.floor((round - 1) / size), 3);
}

/**
 * Expected net payable for a given round.
 * Uses phase ranges if configured; falls back to full subscription.
 * Organiser fee is NEVER added as a default (0% is valid).
 */
export function getExpectedPayable(chit, round) {
  const sub = calcPerHeadValue(chit.totalChitValue, chit.totalMembers);
  // If company already took → single commission → full sub
  if (chit.mystatus === 'cashed' && chit.commissionType === 'Single') return sub;
  const ranges = [
    chit.range_phase1 || chit.range1 || 0,
    chit.range_phase2 || chit.range2 || 0,
    chit.range_phase3 || chit.range3 || 0,
    chit.range_phase4 || chit.range4 || 0,
  ];
  const idx = getPhaseIndex(round, chit.totalMembers);
  const rangeVal = ranges[idx];
  return rangeVal > 0 && rangeVal <= sub ? rangeVal : sub;
}

// ─── FORWARD commission calculator ───────────────────────────────────────
/**
 * Given a bid amount → full commission breakdown.
 *
 * @param chitValue      total chit value
 * @param totalMembers
 * @param organiserFeePct  0–5%. NEVER default to 5 — 0% is valid.
 * @param commissionType  'Single' | 'Double'
 * @param alreadyCashedCount  members who have won in previous rounds
 * @param bidAmount       the bid (amount winner foregoes from chitValue)
 */
export function calcCommissionForward({
  chitValue, totalMembers, organiserFeePct, commissionType,
  alreadyCashedCount, bidAmount,
}) {
  const orgPct  = isNaN(organiserFeePct) || organiserFeePct == null ? 0 : +organiserFeePct;
  const sub     = roundTo(chitValue / totalMembers, 2);
  const orgAmount = roundTo(chitValue * (orgPct / 100), 2);

  if (bidAmount <= orgAmount || bidAmount >= chitValue) return null;

  const pool = roundTo(bidAmount - orgAmount, 2);

  // Eligible:
  //   SINGLE: non-cashed minus this round's winner
  //   DOUBLE: ALL members
  const eligible = commissionType === 'Double'
    ? totalMembers
    : Math.max(1, totalMembers - (alreadyCashedCount || 0) - 1);

  const commissionPerMember = roundTo(pool / eligible, 2);
  const winnerInHand = roundTo(chitValue - bidAmount, 2);

  // Net payables by role:
  const netPayableNonCashed  = roundTo(sub - commissionPerMember, 2); // non-cashed, non-winner
  const netPayableDouble     = roundTo(sub - commissionPerMember, 2); // everyone in double
  const netPayableCashed     = sub;   // cashed member: FULL sub, no commission (single only)
  const netPayableWinner     = commissionType === 'Double'
    ? roundTo(sub - commissionPerMember, 2) // double: winner gets commission too
    : sub;                                   // single: winner pays FULL sub

  return {
    sub, orgAmount, pool, eligible, commissionPerMember, winnerInHand, bidAmount,
    netPayableNonCashed, netPayableDouble, netPayableCashed, netPayableWinner,
  };
}

// ─── REVERSE commission calculator ───────────────────────────────────────
/**
 * Given what I actually paid → reverse-calculate bid, pool, winner's prize.
 * Mirrors reference code's amReverseCalc logic exactly.
 *
 * Works for non-cashed, non-winner members.
 * Cashed-single members always pay full sub — reverse doesn't apply.
 */
export function calcCommissionReverse({
  chitValue, totalMembers, organiserFeePct, commissionType,
  alreadyCashedCount, myPayable,
}) {
  const orgPct    = isNaN(organiserFeePct) || organiserFeePct == null ? 0 : +organiserFeePct;
  const sub       = roundTo(chitValue / totalMembers, 2);
  const orgAmount = roundTo(chitValue * (orgPct / 100), 2);

  const eligible = commissionType === 'Double'
    ? totalMembers
    : Math.max(1, totalMembers - (alreadyCashedCount || 0) - 1);

  const commissionPerMember = roundTo(sub - myPayable, 2);
  if (commissionPerMember <= 0) return null;

  const pool       = roundTo(commissionPerMember * eligible, 2);
  const bidAmount  = roundTo(pool + orgAmount, 2);
  const winnerInHand = roundTo(chitValue - bidAmount, 2);

  if (bidAmount <= 0 || winnerInHand <= 0 || bidAmount >= chitValue) return null;

  // Winner contribution:
  const winnerContrib = commissionType === 'Double'
    ? myPayable           // same as everyone in double
    : sub;                // full sub in single

  const winnerNetInHand = roundTo(winnerInHand - winnerContrib, 2);

  return {
    sub, orgAmount, pool, eligible, commissionPerMember,
    bidAmount, winnerInHand, winnerNetInHand, winnerContrib,
    myPayable,
  };
}

/**
 * Full breakdown for a chit+round combination using phase ranges.
 * Returns null if ranges not configured.
 * Used in Projection, Dashboard, Calendar suggestion panels.
 */
export function getCommBreakdown(chit, round) {
  const sub     = calcPerHeadValue(chit.totalChitValue, chit.totalMembers);
  const orgPct  = isNaN(chit.managerCommissionPct) ? 0 : +(chit.managerCommissionPct || 0);
  const orgAmt  = roundTo(chit.totalChitValue * (orgPct / 100), 2);
  const ranges  = [chit.range_phase1||chit.range1||0, chit.range_phase2||chit.range2||0, chit.range_phase3||chit.range3||0, chit.range_phase4||chit.range4||0];
  const myPayable = ranges[getPhaseIndex(round, chit.totalMembers)];
  if (!myPayable || myPayable >= sub) return null;

  const realDone = round - 1; // conservative estimate for eligible calc
  const eligible = (chit.commissionType || 'Single') === 'Double'
    ? chit.totalMembers
    : Math.max(1, chit.totalMembers - realDone - 1);

  const commission  = roundTo(sub - myPayable, 2);
  const pool        = roundTo(commission * eligible, 2);
  const bid         = roundTo(pool + orgAmt, 2);
  const winnerInHand = Math.max(roundTo(chit.totalChitValue - bid, 2), 0);

  return { myPayable, commission, pool, orgAmt, bid, winnerInHand, eligible, sub };
}

// ─── calcCommission — used by processAuction ─────────────────────────────
// Matches reference code exactly.
// Pool = bid - orgAmount (NOT discount × eligible)
// Single eligible = members - takenCount - 1
// Double eligible = all members (incl. cashed)
export function calcCommission(chit, auction, takenCount) {
  const orgPct = isNaN(chit.managerCommissionPct) ? 0 : +(chit.managerCommissionPct || 0);
  const sub = roundTo(chit.totalChitValue / chit.totalMembers, 2);
  const orgAmount = roundTo(chit.totalChitValue * (orgPct / 100), 2);
  const bid = auction.bidAmount;

  // Validate
  if (!bid || bid <= orgAmount || bid >= chit.totalChitValue) {
    return { discount:0, eligibleMembers:0, commissionPool:0, managerCommission:orgAmount, memberCommission:0, totalCollected:0 };
  }

  // Pool = bid - orgAmount (reference formula)
  const pool = roundTo(bid - orgAmount, 2);

  // Eligible members
  const eligible = (chit.commissionType || 'Single') === 'Double'
    ? chit.totalMembers  // double: ALL members
    : Math.max(1, chit.totalMembers - (takenCount || 0) - 1); // single: non-cashed excl. winner

  const memberCommission = roundTo(pool / eligible, 2);

  return {
    discount:          roundTo(sub - bid, 2),
    eligibleMembers:   eligible,
    commissionPool:    pool,
    managerCommission: orgAmount,   // organiser fee IS the manager commission
    memberCommission,
    totalCollected:    roundTo(bid * eligible, 2),
  };
}

// ─── Investment per spec §7 ───────────────────────────────────────────────
export function calcInvestment(chit, isCompanyTaken, isFutureTaken) {
  if (isCompanyTaken || isFutureTaken) return chit.perHeadValue;
  return chit.slabType === 'Fixed'
    ? chit.slabValue
    : roundTo((chit.totalChitValue * chit.slabValue) / 100, 2);
}

// ─── Exposure / liability ─────────────────────────────────────────────────
export function calcExposure(totalInvested, totalReceived) {
  return roundTo(totalInvested - totalReceived, 2);
}

export function calcFutureLiability(chit, auctionsCompleted, companyTakenAuction) {
  const remaining = chit.totalMembers - auctionsCompleted;
  const isTaken   = companyTakenAuction !== null && companyTakenAuction !== undefined;
  const perHead   = chit.perHeadValue;
  const slabVal   = chit.slabType === 'Fixed'
    ? chit.slabValue
    : roundTo((chit.totalChitValue * chit.slabValue) / 100, 2);
  return roundTo(remaining * (isTaken ? perHead : slabVal), 2);
}

// ─── getChitsForMonth ─────────────────────────────────────────────────────
/**
 * Returns all chits that have an auction scheduled in a given YYYY-MM.
 * Projects ALL future rounds (not just next), handling multi-month intervals.
 * Mirrors reference getChitsForMonth exactly.
 */
export function getChitsForMonth(ym, chits, allSchedules) {
  if (!chits) return [];
  return chits.filter(chit => {
    if (chit.status === 'Completed' || chit.status === 'closed') return false;
    const schedule = allSchedules[chit.id] || [];
    // Use actual schedule from Firestore (more accurate than projection)
    return schedule.some(a => {
      if (a.status !== 'Pending') return false;
      const k = getMonthKey(a.auctionDate);
      return k === ym;
    });
  });
}

/**
 * Get the round number for a chit in a given month.
 */
export function getChitRoundForMonth(chit, ym, schedule) {
  if (!schedule) return null;
  const slot = schedule.find(a => a.status === 'Pending' && getMonthKey(a.auctionDate) === ym);
  return slot ? slot.auctionNumber : null;
}

// ─── Next auction date (YYYY-MM) ─────────────────────────────────────────
/**
 * Returns YYYY-MM of the next pending auction, using schedule from Firestore.
 * Falls back to arithmetic if no schedule available.
 */
export function getNextAuctionDate(chit, schedule) {
  if (schedule && schedule.length > 0) {
    const pending = schedule.find(a => a.status === 'Pending');
    if (pending) return getMonthKey(pending.auctionDate);
  }
  return null;
}

// ─── Month-wise fund projection (spec §9) ────────────────────────────────
/**
 * For each pending auction month: sum all chit investments.
 * Investment = perHead if company taken, slab otherwise.
 * Uses Firestore schedule for accuracy.
 */
export function buildMonthProjection(chits, allSchedules) {
  const projection = {};

  (chits || []).forEach(chit => {
    const schedule = allSchedules[chit.id] || [];
    const isTaken  = chit.companyTakenAuction !== null && chit.companyTakenAuction !== undefined;
    const perHead  = chit.perHeadValue || 0;
    const slabVal  = chit.slabType === 'Fixed'
      ? (chit.slabValue || 0)
      : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
    const investment = isTaken ? perHead : slabVal;

    schedule.forEach(auction => {
      if (auction.status !== 'Pending') return;
      const k = getMonthKey(auction.auctionDate);
      const aDate = auction.auctionDate?.seconds
        ? new Date(auction.auctionDate.seconds * 1000)
        : new Date(auction.auctionDate);

      if (!projection[k]) projection[k] = { month: aDate, key: k, total: 0, chits: [] };
      projection[k].total = roundTo(projection[k].total + investment, 2);
      projection[k].chits.push({
        chitId: chit.id, chitName: chit.companyName,
        investment, isTaken,
        auctionNo: auction.auctionNumber,
        perHeadValue: perHead, slabValue: slabVal,
      });
    });
  });

  return Object.values(projection).sort((a, b) => a.key.localeCompare(b.key));
}

// ─── IRR approximation ────────────────────────────────────────────────────
export function calcIRR(chit) {
  try {
    if (!chit.totalInvested || chit.totalInvested === 0) return 0;
    const duration = (chit.auctionsCompleted || 1) * (chit.auctionInterval || 1);
    const annualReturn = ((chit.totalCommissionEarned || 0) / chit.totalInvested) * (12 / duration) * 100;
    return roundTo(Math.max(0, annualReturn), 2);
  } catch { return 0; }
}

// ─── Risk score ───────────────────────────────────────────────────────────
export function calcRiskScore(chit) {
  try {
    const exposure = (chit.totalInvested || 0) - (chit.totalCommissionEarned || 0);
    const completionRate = (chit.auctionsCompleted || 0) / Math.max(chit.totalMembers || 1, 1);
    const raw = (exposure / Math.max(chit.totalChitValue, 1)) * 100 * (1 - completionRate);
    return roundTo(Math.min(Math.max(raw, 0), 100), 1);
  } catch { return 0; }
}

// ─── Take suggestion engine ───────────────────────────────────────────────
/**
 * Should the company consider taking this chit now?
 * urgencyScore = completionPct × (1 - slabRatio) × 100
 * Higher = paying cheap vs prize value → better time to take
 */
export function calcTakeSuggestion(chit, schedule) {
  if (chit.companyTakenAuction !== null && chit.companyTakenAuction !== undefined) return null;
  if (chit.status !== 'Active') return null;

  const completed = chit.auctionsCompleted || 0;
  const total     = chit.totalMembers || 1;
  const remaining = total - completed;
  if (remaining <= 0) return null;

  const completionPct = completed / total;
  const slab    = chit.slabType === 'Fixed'
    ? (chit.slabValue || 0)
    : roundTo((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100, 2);
  const perHead = chit.perHeadValue || 0;
  const slabRatio = perHead > 0 ? slab / perHead : 1;
  const urgencyScore = Math.round(completionPct * (1 - slabRatio) * 100);

  const pendingSlot = (schedule || []).find(a => a.status === 'Pending');
  const nextDate = pendingSlot?.auctionDate
    ? (pendingSlot.auctionDate?.seconds ? new Date(pendingSlot.auctionDate.seconds * 1000) : new Date(pendingSlot.auctionDate))
    : null;
  const daysToNext = nextDate ? Math.floor((nextDate - new Date()) / 86400000) : null;
  const isUrgent = remaining <= 2 || (daysToNext !== null && daysToNext >= 0 && daysToNext <= 3);

  if (urgencyScore < 5 && !isUrgent) return null;

  // Estimate prize if taken now (conservative 85% bid)
  const estBid = roundTo(perHead * 0.85, 0);
  const estPrize = roundTo((chit.totalChitValue || 0) - estBid, 0);

  return {
    chitId: chit.id, chitName: chit.companyName,
    urgencyScore, isUrgent, completed, remaining,
    completionPct, perHead, slab, slabRatio,
    daysToNext, nextDate, estPrize,
    futureCostIfNotTaken: roundTo(slab * remaining, 0),
    futureCostIfTaken:    roundTo(perHead * remaining, 0),
    reason: isUrgent && remaining <= 2
      ? `Only ${remaining} auction${remaining !== 1 ? 's' : ''} left — take before it's too late`
      : isUrgent && daysToNext !== null && daysToNext <= 3
        ? `Next auction in ${daysToNext === 0 ? 'TODAY' : daysToNext + 'd'} — decide now`
        : `${Math.round(completionPct * 100)}% complete · slab ₹${Math.round(slab).toLocaleString('en-IN')} vs per-head ₹${Math.round(perHead).toLocaleString('en-IN')}`,
  };
}
