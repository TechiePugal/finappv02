// src/utils/chitEngine.js
import { addMonths, roundTo } from './format';

// ─── Auction Schedule Generator ──────────────────────────────────────────

export function generateAuctionSchedule(startDate, totalMembers, intervalMonths) {
  const schedule = [];
  const start = new Date(startDate);
  for (let i = 0; i < totalMembers; i++) {
    const auctionDate = addMonths(start, i * intervalMonths);
    schedule.push({
      auctionNumber: i + 1,
      auctionDate,
      status: 'Pending',
      winnerId: null,
      winnerName: null,
      bidAmount: null,
      takenByCompany: false,
    });
  }
  return schedule;
}

// ─── Per Head Value ───────────────────────────────────────────────────────

export function calcPerHeadValue(totalValue, totalMembers) {
  return roundTo(totalValue / totalMembers, 2);
}

// ─── Commission Logic ─────────────────────────────────────────────────────

export function calcCommission(chit, auction, takenCount) {
  const { perHeadValue, commissionType, managerCommissionPct, commissionBase, totalMembers } = chit;
  const { bidAmount, winnerId } = auction;

  const discount = perHeadValue - bidAmount;
  const eligibleNonTaken = totalMembers - takenCount - 1; // exclude current winner

  let commissionPool = 0;
  let totalCollected = 0;

  if (commissionType === 'Single') {
    // Distribute only to non-taken members (excluding winner)
    commissionPool = discount * eligibleNonTaken;
    totalCollected = bidAmount * (eligibleNonTaken);
  } else {
    // Double: distribute to all members (excluding winner by default)
    commissionPool = discount * (totalMembers - 1);
    totalCollected = bidAmount * (totalMembers - 1);
  }

  const base = commissionBase === 'On Total' ? chit.totalChitValue : totalCollected;
  const managerCommission = roundTo((base * managerCommissionPct) / 100, 2);
  const memberCommission = roundTo(commissionPool / (totalMembers - 1), 2);

  return {
    discount,
    eligibleMembers: commissionType === 'Single' ? eligibleNonTaken : totalMembers - 1,
    commissionPool: roundTo(commissionPool, 2),
    managerCommission,
    memberCommission,
    totalCollected: roundTo(totalCollected, 2),
  };
}

// ─── Company Investment Logic ─────────────────────────────────────────────

export function calcInvestment(chit, isCompanyTaken, isFutureTaken) {
  if (isCompanyTaken || isFutureTaken) {
    return chit.perHeadValue;
  }
  return chit.slabType === 'Fixed' ? chit.slabValue : roundTo((chit.totalChitValue * chit.slabValue) / 100, 2);
}

// ─── Exposure Calculation ─────────────────────────────────────────────────

export function calcExposure(totalInvested, totalReceived) {
  return roundTo(totalInvested - totalReceived, 2);
}

// ─── Future Liability ─────────────────────────────────────────────────────

export function calcFutureLiability(chit, auctionsCompleted, companyTakenAuction) {
  const remaining = chit.totalMembers - auctionsCompleted;
  const isTaken = companyTakenAuction !== null;
  const perHead = chit.perHeadValue;
  const slabVal = chit.slabType === 'Fixed'
    ? chit.slabValue
    : roundTo((chit.totalChitValue * chit.slabValue) / 100, 2);

  let future = 0;
  for (let i = 0; i < remaining; i++) {
    future += isTaken ? perHead : slabVal;
  }
  return roundTo(future, 2);
}

// ─── Month-wise Fund Projection ───────────────────────────────────────────

export function buildMonthProjection(chits, allSchedules) {
  const projection = {};

  chits.forEach((chit) => {
    const schedule = allSchedules[chit.id] || [];
    const companyTaken = chit.companyTakenAuction || null;

    schedule.forEach((auction, idx) => {
      if (auction.status === 'Completed') return;
      const aDate = auction.auctionDate instanceof Date
        ? auction.auctionDate
        : new Date(auction.auctionDate?.seconds * 1000 || auction.auctionDate);

      const key = `${aDate.getFullYear()}-${String(aDate.getMonth() + 1).padStart(2, '0')}`;
      const isFutureTaken = companyTaken !== null;
      const investment = calcInvestment(chit, auction.takenByCompany, isFutureTaken);

      if (!projection[key]) {
        projection[key] = { month: aDate, total: 0, chits: [] };
      }
      projection[key].total = roundTo(projection[key].total + investment, 2);
      projection[key].chits.push({ chitId: chit.id, chitName: chit.companyName, investment, auctionNo: auction.auctionNumber });
    });
  });

  return Object.entries(projection)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({ key, ...val }));
}
