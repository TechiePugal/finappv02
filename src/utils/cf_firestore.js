// src/utils/firestoreService.js
import { db } from '../firebase/config';
import {
  collection, doc, getDoc, getDocs, addDoc,
  updateDoc, deleteDoc, query, where,
  writeBatch, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { cacheGet, cacheSet, cacheDelete, cacheDeletePattern } from './cf_cache';
import { generateAuctionSchedule, calcPerHeadValue, calcCommission, calcInvestment } from './cf_engine';
import { roundTo } from './cf_format';

// ─── AUDIT LOG ────────────────────────────────────────────────────────────

export async function writeAuditLog(action, entityType, entityId, details, userId) {
  try {
    await addDoc(collection(db, 'chit_audit_log'), {
      action,          // CREATE | UPDATE | DELETE | PROCESS | LOGIN
      entityType,      // chit | member | auction | setting
      entityId,
      details,
      userId,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Audit log write failed:', e.message);
  }
}

// ─── SETTINGS / COMPANY ──────────────────────────────────────────────────

export async function getSettings(userId) {
  const ck = `settings-${userId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(db, 'company_settings', userId));
    const result = snap.exists() ? { id: snap.id, ...snap.data() } : {
      companyName: '', branch: 'Head Office', financialYearStart: '04',
      financialYearLocked: false, lockedUpTo: null,
      defaultManagerCommission: 5, defaultInterval: 2,
    };
    cacheSet(ck, result);
    return result;
  } catch { return { companyName: '', branch: 'Head Office', financialYearStart: '04', financialYearLocked: false }; }
}

export async function saveSettings(userId, data) {
  await writeDoc(doc(db, 'company_settings', userId), { ...data, updatedAt: serverTimestamp() });
  cacheDelete(`settings-${userId}`);
  await writeAuditLog('UPDATE', 'setting', userId, data, userId);
}

async function writeDoc(ref, data) {
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) await updateDoc(ref, data);
    else {
      const { setDoc } = await import('firebase/firestore');
      await setDoc(ref, { ...data, createdAt: serverTimestamp() });
    }
  } catch {
    const { setDoc } = await import('firebase/firestore');
    await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  }
}

// ─── CHIT MASTER ─────────────────────────────────────────────────────────

export async function createChit(data, userId) {
  const perHeadValue = calcPerHeadValue(data.totalChitValue, data.totalMembers);

  // Validation
  if (data.slabType === 'Fixed' && data.slabValue > perHeadValue) {
    throw new Error(`Slab value (₹${data.slabValue}) cannot exceed Per Head Value (₹${perHeadValue})`);
  }

  const schedule = generateAuctionSchedule(data.startDate, data.totalMembers, data.auctionInterval);
  const projectedEndDate = schedule[schedule.length - 1]?.auctionDate;

  const chitData = {
    ...data,
    perHeadValue,
    totalAuctions: data.totalMembers,
    projectedEndDate: Timestamp.fromDate(new Date(projectedEndDate)),
    startDate: Timestamp.fromDate(new Date(data.startDate)),
    status: 'Active',
    auctionsCompleted: 0,
    totalInvested: 0,
    totalCommissionEarned: 0,
    totalManagerCommission: 0,
    totalReceived: 0,
    companyTakenAuction: null,
    branch: data.branch || 'Head Office',
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  const chitRef = doc(collection(db, 'chit_master'));
  batch.set(chitRef, chitData);

  for (const auction of schedule) {
    const aRef = doc(collection(db, 'chit_auction_schedule'));
    batch.set(aRef, {
      chitId: chitRef.id,
      auctionNumber: auction.auctionNumber,
      auctionDate: Timestamp.fromDate(new Date(auction.auctionDate)),
      status: 'Pending',
      winnerId: null, winnerName: null, bidAmount: null,
      takenByCompany: false, notes: '',
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  await writeAuditLog('CREATE', 'chit', chitRef.id, { companyName: data.companyName, totalChitValue: data.totalChitValue }, userId);
  cacheDeletePattern('chits');
  cacheDeletePattern('dashboard');
  return chitRef.id;
}

export async function getChits(userId) {
  const ck = `chits-${userId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const q = query(collection(db, 'chit_master'), where('createdBy', '==', userId));
  const snap = await getDocs(q);
  const result = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  cacheSet(ck, result);
  return result;
}

export async function getChit(chitId) {
  const ck = `chit-${chitId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const snap = await getDoc(doc(db, 'chit_master', chitId));
  if (!snap.exists()) return null;
  const result = { id: snap.id, ...snap.data() };
  cacheSet(ck, result);
  return result;
}

export async function updateChit(chitId, updates, userId) {
  const chit = await getChit(chitId);
  if (!chit) throw new Error('Chit not found.');

  const auctionsDone = chit.auctionsCompleted || 0;

  // Lock rules from spec §12
  const LOCKED_AFTER_FIRST = ['slabValue', 'slabType', 'totalMembers', 'auctionInterval', 'startDate', 'commissionBase'];
  if (auctionsDone > 0) {
    const forbidden = Object.keys(updates).filter(k => LOCKED_AFTER_FIRST.includes(k));
    if (forbidden.length > 0) {
      throw new Error(`Cannot edit: ${forbidden.join(', ')} after first auction has been processed.`);
    }
  }

  // Slab validation
  if (updates.slabValue !== undefined || updates.totalChitValue !== undefined) {
    const perHead = calcPerHeadValue(
      updates.totalChitValue ?? chit.totalChitValue,
      updates.totalMembers ?? chit.totalMembers
    );
    const slabVal = updates.slabValue ?? chit.slabValue;
    if ((updates.slabType ?? chit.slabType) === 'Fixed' && slabVal > perHead) {
      throw new Error(`Slab value cannot exceed Per Head Value (₹${perHead.toLocaleString('en-IN')}).`);
    }
  }

  const payload = { ...updates, updatedAt: serverTimestamp() };

  // Recalculate perHead if value/members changed
  if (updates.totalChitValue || updates.totalMembers) {
    payload.perHeadValue = calcPerHeadValue(
      updates.totalChitValue ?? chit.totalChitValue,
      updates.totalMembers ?? chit.totalMembers
    );
  }

  await updateDoc(doc(db, 'chit_master', chitId), payload);
  await writeAuditLog('UPDATE', 'chit', chitId, updates, userId);
  cacheDelete(`chit-${chitId}`);
  cacheDeletePattern('chits');
  cacheDeletePattern('dashboard');
}

export async function closeChit(chitId, userId) {
  await updateDoc(doc(db, 'chit_master', chitId), { status: 'Closed', closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await writeAuditLog('UPDATE', 'chit', chitId, { status: 'Closed' }, userId);
  cacheDelete(`chit-${chitId}`);
  cacheDeletePattern('chits');
}

export async function deleteChit(chitId, userId) {
  const chit = await getChit(chitId);
  if (!chit) throw new Error('Chit not found.');
  if ((chit.auctionsCompleted || 0) > 0) throw new Error('Cannot delete a chit fund that has processed auctions.');

  const batch = writeBatch(db);
  // Delete auction schedule
  const schedSnap = await getDocs(query(collection(db, 'chit_auction_schedule'), where('chitId', '==', chitId)));
  schedSnap.docs.forEach(d => batch.delete(d.ref));
  // Delete members
  const membSnap = await getDocs(query(collection(db, 'chit_members'), where('chitId', '==', chitId)));
  membSnap.docs.forEach(d => batch.delete(d.ref));
  // Delete chit
  batch.delete(doc(db, 'chit_master', chitId));
  await batch.commit();
  await writeAuditLog('DELETE', 'chit', chitId, { companyName: chit.companyName }, userId);
  cacheDelete(`chit-${chitId}`);
  cacheDeletePattern('chits');
  cacheDeletePattern('dashboard');
}

// ─── MEMBERS ──────────────────────────────────────────────────────────────

export async function addMember(chitId, memberData, userId) {
  const ref = await addDoc(collection(db, 'chit_members'), {
    chitId, ...memberData,
    status: 'Active',
    auctionTakenNumber: null,
    kycUploaded: false,
    createdAt: serverTimestamp(),
  });
  if (userId) await writeAuditLog('CREATE', 'member', ref.id, { name: memberData.name, chitId }, userId);
  cacheDeletePattern(`members-${chitId}`);
  return ref.id;
}

export async function getMembers(chitId) {
  const ck = `members-${chitId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const q = query(collection(db, 'chit_members'), where('chitId', '==', chitId));
  const snap = await getDocs(q);
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
  cacheSet(ck, result);
  return result;
}

export async function updateMember(memberId, data, userId, chitId) {
  const member = await getDoc(doc(db, 'chit_members', memberId));
  if (!member.exists()) throw new Error('Member not found.');
  const mData = member.data();
  if (mData.status === 'Taken' && (data.name || data.phone)) {
    // Allow phone update but name cannot change after taken
  }
  await updateDoc(doc(db, 'chit_members', memberId), { ...data, updatedAt: serverTimestamp() });
  if (userId) await writeAuditLog('UPDATE', 'member', memberId, data, userId);
  if (chitId) cacheDeletePattern(`members-${chitId}`);
}

export async function deleteMember(memberId, chitId, userId) {
  // Spec §4: Members cannot be deleted after first auction
  const chit = await getChit(chitId);
  if ((chit?.auctionsCompleted || 0) > 0) {
    throw new Error('Members cannot be deleted after the first auction has been processed.');
  }
  const memberSnap = await getDoc(doc(db, 'chit_members', memberId));
  if (!memberSnap.exists()) throw new Error('Member not found.');
  const member = memberSnap.data();
  if (member.status === 'Taken') throw new Error('Cannot delete a member who has already won an auction.');
  await deleteDoc(doc(db, 'chit_members', memberId));
  await writeAuditLog('DELETE', 'member', memberId, { name: member.name, chitId }, userId);
  cacheDeletePattern(`members-${chitId}`);
}

// ─── AUCTION SCHEDULE ─────────────────────────────────────────────────────

export async function getAuctionSchedule(chitId) {
  const ck = `schedule-${chitId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const q = query(collection(db, 'chit_auction_schedule'), where('chitId', '==', chitId));
  const snap = await getDocs(q);
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.auctionNumber - b.auctionNumber);
  cacheSet(ck, result);
  return result;
}

// ─── AUCTION PROCESSING ───────────────────────────────────────────────────

export async function processAuction(chitId, auctionScheduleId, auctionData, userId) {
  const [chit, members, schedule] = await Promise.all([
    getChit(chitId), getMembers(chitId), getAuctionSchedule(chitId)
  ]);

  // Spec §12 Validation
  if (!auctionData.takenByCompany && !auctionData.winnerId) {
    throw new Error('Auction cannot close without a Taken selection (winner or company).');
  }
  if (!auctionData.bidAmount || auctionData.bidAmount <= 0) {
    throw new Error('Bid amount is required and must be greater than zero.');
  }
  if (auctionData.bidAmount >= chit.perHeadValue) {
    throw new Error(`Bid amount must be less than Per Head Value (₹${chit.perHeadValue?.toLocaleString('en-IN')}).`);
  }

  // Check financial year lock
  if (chit.financialYearLocked) {
    throw new Error('This financial year is locked. No further processing allowed.');
  }

  const takenCount = members.filter(m => m.status === 'Taken').length;
  const commInfo = calcCommission(chit, auctionData, takenCount);
  const investment = calcInvestment(chit, auctionData.takenByCompany, chit.companyTakenAuction !== null);
  const perHead = chit.perHeadValue;

  // Risk score: exposure / totalChitValue * 100
  const currentExposure = (chit.totalInvested || 0) + investment - (chit.totalCommissionEarned || 0) - commInfo.commissionPool;
  const riskScore = roundTo(Math.min(Math.max((currentExposure / chit.totalChitValue) * 100, 0), 100), 1);

  const batch = writeBatch(db);

  // 1. Update auction schedule
  batch.update(doc(db, 'chit_auction_schedule', auctionScheduleId), {
    status: 'Completed', winnerId: auctionData.winnerId, winnerName: auctionData.winnerName,
    bidAmount: auctionData.bidAmount, takenByCompany: auctionData.takenByCompany,
    notes: auctionData.notes || '', processedAt: serverTimestamp(), processedBy: userId,
  });

  // 2. Auction result
  const resultRef = doc(collection(db, 'chit_auction_results'));
  batch.set(resultRef, {
    chitId, auctionNumber: auctionData.auctionNumber, auctionDate: auctionData.auctionDate,
    winnerId: auctionData.winnerId, winnerName: auctionData.winnerName,
    bidAmount: auctionData.bidAmount, takenByCompany: auctionData.takenByCompany,
    notes: auctionData.notes || '', ...commInfo, investment, riskScore,
    processedBy: userId, createdAt: serverTimestamp(),
  });

  // 3. Member payment records (one per member)
  for (const member of members) {
    const isWinner = member.id === auctionData.winnerId;
    const eligibleForComm = chit.commissionType === 'Single'
      ? (member.status === 'Active' && !isWinner)
      : !isWinner;

    const payRef = doc(collection(db, 'chit_member_payments'));
    batch.set(payRef, {
      chitId,
      memberId: member.id,
      memberName: member.name,
      auctionNumber: auctionData.auctionNumber,
      auctionDate: auctionData.auctionDate,
      auctionResultId: resultRef.id,
      contributionAmount: perHead,
      commissionReceived: eligibleForComm ? commInfo.memberCommission : 0,
      netPayable: eligibleForComm ? roundTo(perHead - commInfo.memberCommission, 2) : perHead,
      isWinner,
      winnerPayout: isWinner ? auctionData.bidAmount : 0,
      paymentStatus: 'Pending',   // Pending | Paid
      createdAt: serverTimestamp(),
    });
  }

  // 4. Commission distribution entries
  const eligibleMembers = chit.commissionType === 'Single'
    ? members.filter(m => m.status === 'Active' && m.id !== auctionData.winnerId)
    : members.filter(m => m.id !== auctionData.winnerId);

  for (const member of eligibleMembers) {
    const cRef = doc(collection(db, 'chit_commission_distribution'));
    batch.set(cRef, {
      chitId, auctionResultId: resultRef.id, auctionNumber: auctionData.auctionNumber,
      memberId: member.id, memberName: member.name,
      commissionAmount: commInfo.memberCommission, createdAt: serverTimestamp(),
    });
  }

  // 5. Company investment entry
  batch.set(doc(collection(db, 'chit_company_investment')), {
    chitId, auctionNumber: auctionData.auctionNumber, auctionResultId: resultRef.id,
    investmentAmount: investment, takenByCompany: auctionData.takenByCompany,
    createdAt: serverTimestamp(),
  });

  // 6. Ledger entries (Investment, Commission Earned, Manager Commission, Cash/Bank)
  const ledgerItems = [
    { type: 'Investment',         amount: investment,                debit: investment,                credit: 0 },
    { type: 'Commission Earned',  amount: commInfo.commissionPool,   debit: 0,                         credit: commInfo.commissionPool },
    { type: 'Manager Commission', amount: commInfo.managerCommission,debit: commInfo.managerCommission, credit: 0 },
    { type: 'Cash/Bank',          amount: auctionData.bidAmount,     debit: 0,                         credit: auctionData.bidAmount },
  ];
  for (const entry of ledgerItems) {
    batch.set(doc(collection(db, 'chit_ledger_entries')), {
      chitId, auctionNumber: auctionData.auctionNumber, auctionResultId: resultRef.id,
      date: auctionData.auctionDate, userId, ...entry, createdAt: serverTimestamp(),
    });
  }

  // 7. Update winner member
  if (auctionData.winnerId && auctionData.winnerId !== 'company') {
    batch.update(doc(db, 'chit_members', auctionData.winnerId), {
      status: 'Taken', auctionTakenNumber: auctionData.auctionNumber, updatedAt: serverTimestamp(),
    });
  }

  // 8. Update chit master
  const newCompleted = (chit.auctionsCompleted || 0) + 1;
  const newInvested = roundTo((chit.totalInvested || 0) + investment, 2);
  const newCommission = roundTo((chit.totalCommissionEarned || 0) + commInfo.commissionPool, 2);
  const newManagerComm = roundTo((chit.totalManagerCommission || 0) + commInfo.managerCommission, 2);
  const newReceived = roundTo((chit.totalReceived || 0) + auctionData.bidAmount, 2);

  const chitUpdate = {
    auctionsCompleted: newCompleted,
    totalInvested: newInvested,
    totalCommissionEarned: newCommission,
    totalManagerCommission: newManagerComm,
    totalReceived: newReceived,
    currentRiskScore: riskScore,
    status: newCompleted >= chit.totalMembers ? 'Closed' : 'Active',
    updatedAt: serverTimestamp(),
  };
  if (auctionData.takenByCompany && chit.companyTakenAuction === null) {
    chitUpdate.companyTakenAuction = auctionData.auctionNumber;
  }
  batch.update(doc(db, 'chit_master', chitId), chitUpdate);

  // 9. Audit log
  const auditRef = doc(collection(db, 'chit_audit_log'));
  batch.set(auditRef, {
    action: 'PROCESS', entityType: 'auction', entityId: auctionScheduleId,
    details: { auctionNumber: auctionData.auctionNumber, bidAmount: auctionData.bidAmount, winner: auctionData.winnerName, investment, commission: commInfo.commissionPool },
    userId, chitId, timestamp: serverTimestamp(), createdAt: serverTimestamp(),
  });

  await batch.commit();

  // Invalidate caches
  ['chit', 'schedule', 'members', 'all-payments', 'payments'].forEach(prefix => cacheDeletePattern(prefix));
  cacheDeletePattern('chits');
  cacheDeletePattern('dashboard');

  return { commInfo, investment, riskScore };
}

// ─── UPDATE PAYMENT STATUS ────────────────────────────────────────────────

export async function updatePaymentStatus(paymentId, status, userId) {
  await updateDoc(doc(db, 'chit_member_payments', paymentId), {
    paymentStatus: status, updatedAt: serverTimestamp(), updatedBy: userId,
  });
  await writeAuditLog('UPDATE', 'payment', paymentId, { paymentStatus: status }, userId);
  cacheDeletePattern('payments');
  cacheDeletePattern('all-payments');
}

// ─── MEMBER PAYMENTS ─────────────────────────────────────────────────────

export async function getAuctionPayments(chitId, auctionNumber) {
  const ck = `payments-${chitId}-${auctionNumber}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const q = query(
    collection(db, 'chit_member_payments'),
    where('chitId', '==', chitId),
    where('auctionNumber', '==', auctionNumber)
  );
  const snap = await getDocs(q);
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.memberName || '').localeCompare(b.memberName || ''));
  cacheSet(ck, result);
  return result;
}

export async function getAllPaymentsForChit(chitId) {
  const ck = `all-payments-${chitId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const q = query(collection(db, 'chit_member_payments'), where('chitId', '==', chitId));
  const snap = await getDocs(q);
  const result = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.auctionNumber - b.auctionNumber || (a.memberName || '').localeCompare(b.memberName || ''));
  cacheSet(ck, result);
  return result;
}

// ─── LEDGER ───────────────────────────────────────────────────────────────

export async function getLedger(chitId) {
  const q = query(collection(db, 'chit_ledger_entries'), where('chitId', '==', chitId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────

export async function getAuditLog(userId, limit = 50) {
  const q = query(collection(db, 'chit_audit_log'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    .slice(0, limit);
}

// ─── COMMISSION DISTRIBUTION ──────────────────────────────────────────────

export async function getCommissionDistribution(chitId, auctionNumber) {
  const q = query(
    collection(db, 'chit_commission_distribution'),
    where('chitId', '==', chitId),
    where('auctionNumber', '==', auctionNumber)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── DASHBOARD DATA ───────────────────────────────────────────────────────

export async function getDashboardData(userId) {
  const ck = `dashboard-${userId}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  const chits = await getChits(userId);
  const allSchedules = await Promise.all(chits.map(c => getAuctionSchedule(c.id)));
  const result = {
    chits,
    schedules: Object.fromEntries(chits.map((c, i) => [c.id, allSchedules[i]])),
  };
  cacheSet(ck, result);
  return result;
}

// ─── IRR CALCULATION (Basic) ──────────────────────────────────────────────
// Internal Rate of Return approximation for chit investment

export function calcIRR(chit, completedAuctions) {
  try {
    // Simple approximation: (Commission Earned / Total Invested) / Duration in months * 12
    if (!chit.totalInvested || chit.totalInvested === 0) return 0;
    const duration = (chit.auctionsCompleted || 1) * (chit.auctionInterval || 1);
    const annualReturn = ((chit.totalCommissionEarned || 0) / chit.totalInvested) * (12 / duration) * 100;
    return roundTo(Math.max(0, annualReturn), 2);
  } catch { return 0; }
}

// ─── RISK SCORE ───────────────────────────────────────────────────────────

export function calcRiskScore(chit) {
  try {
    const exposure = (chit.totalInvested || 0) - (chit.totalCommissionEarned || 0);
    const completionRate = (chit.auctionsCompleted || 0) / Math.max(chit.totalMembers || 1, 1);
    // Higher exposure + lower completion = higher risk
    const raw = (exposure / Math.max(chit.totalChitValue, 1)) * 100 * (1 - completionRate);
    return roundTo(Math.min(Math.max(raw, 0), 100), 1);
  } catch { return 0; }
}

// ─── OTHER CHITS (Put chit on others tracking) ────────────────────────────

export async function getOtherChits(userId) {
  const q = query(collection(db, 'chit_others'), where('createdBy', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export async function addOtherChit(data, userId) {
  const ref = await addDoc(collection(db, 'chit_others'), {
    ...data, createdBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateOtherChit(id, data, userId) {
  await updateDoc(doc(db, 'chit_others', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteOtherChit(id, userId) {
  await deleteDoc(doc(db, 'chit_others', id));
}

export async function addOtherChitPayment(otherId, data, userId) {
  const ref = await addDoc(collection(db, 'chit_others_payments'), {
    otherId, ...data, createdBy: userId, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getOtherChitPayments(otherId) {
  const q = query(collection(db, 'chit_others_payments'), where('otherId', '==', otherId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));
}

export async function updateOtherChitPayment(paymentId, data) {
  await updateDoc(doc(db, 'chit_others_payments', paymentId), { ...data, updatedAt: serverTimestamp() });
}

// ─── DELETE AUCTION (reverse processAuction) ────────────────────────────────
export async function deleteAuction(chitId, auctionScheduleId, auctionNumber, userId) {
  const [chit, schedule] = await Promise.all([getChit(chitId), getAuctionSchedule(chitId)]);
  
  const auctionSlot = schedule.find(s => s.id === auctionScheduleId || s.auctionNumber === auctionNumber);
  if (!auctionSlot || auctionSlot.status !== 'Completed') {
    throw new Error('Only completed auctions can be deleted.');
  }

  // Get the result record to reverse financials
  const resSnap = await getDocs(query(
    collection(db, 'chit_auction_results'),
    where('chitId', '==', chitId), where('auctionNumber', '==', auctionNumber)
  ));
  const result = resSnap.docs[0];
  if (!result) throw new Error('Auction result record not found.');
  const resData = result.data();

  const batch = writeBatch(db);

  // 1. Reset auction schedule slot → Pending
  batch.update(doc(db, 'chit_auction_schedule', auctionScheduleId), {
    status: 'Pending', winnerId: null, winnerName: null,
    bidAmount: null, takenByCompany: false, notes: '',
    updatedAt: serverTimestamp(),
  });

  // 2. Delete auction result
  batch.delete(doc(db, 'chit_auction_results', result.id));

  // 3. Delete all member payments for this auction
  const paySnap = await getDocs(query(
    collection(db, 'chit_member_payments'),
    where('chitId', '==', chitId), where('auctionNumber', '==', auctionNumber)
  ));
  paySnap.docs.forEach(d => batch.delete(doc(db, 'chit_member_payments', d.id)));

  // 4. Delete commission distribution entries
  const commSnap = await getDocs(query(
    collection(db, 'chit_commission_distribution'),
    where('chitId', '==', chitId), where('auctionNumber', '==', auctionNumber)
  ));
  commSnap.docs.forEach(d => batch.delete(doc(db, 'chit_commission_distribution', d.id)));

  // 5. Delete company investment entry
  const invSnap = await getDocs(query(
    collection(db, 'chit_company_investment'),
    where('chitId', '==', chitId), where('auctionNumber', '==', auctionNumber)
  ));
  invSnap.docs.forEach(d => batch.delete(doc(db, 'chit_company_investment', d.id)));

  // 6. Delete ledger entries
  const ledSnap = await getDocs(query(
    collection(db, 'chit_ledger_entries'),
    where('chitId', '==', chitId), where('auctionNumber', '==', auctionNumber)
  ));
  ledSnap.docs.forEach(d => batch.delete(doc(db, 'chit_ledger_entries', d.id)));

  // 7. Reset winner member status
  if (resData.winnerId && resData.winnerId !== 'company') {
    batch.update(doc(db, 'chit_members', resData.winnerId), {
      status: 'Active', auctionTakenNumber: null, updatedAt: serverTimestamp(),
    });
  }

  // 8. Reverse chit master financials
  const newCompleted = Math.max(0, (chit.auctionsCompleted || 0) - 1);
  const chitUpdate = {
    auctionsCompleted: newCompleted,
    totalInvested:         roundTo(Math.max(0, (chit.totalInvested || 0)        - (resData.investment || 0)), 2),
    totalCommissionEarned: roundTo(Math.max(0, (chit.totalCommissionEarned || 0) - (resData.commissionPool || 0)), 2),
    totalManagerCommission:roundTo(Math.max(0, (chit.totalManagerCommission || 0)- (resData.managerCommission || 0)), 2),
    totalReceived:         roundTo(Math.max(0, (chit.totalReceived || 0)         - (resData.bidAmount || 0)), 2),
    status: 'Active',
    updatedAt: serverTimestamp(),
  };
  // Reverse companyTakenAuction if this was the company auction
  if (resData.takenByCompany && chit.companyTakenAuction === auctionNumber) {
    chitUpdate.companyTakenAuction = null;
  }
  batch.update(doc(db, 'chit_master', chitId), chitUpdate);

  // 9. Audit log
  batch.set(doc(collection(db, 'chit_audit_log')), {
    action: 'DELETE_AUCTION', entityType: 'auction', entityId: auctionScheduleId,
    details: { auctionNumber, winner: resData.winnerName, bidAmount: resData.bidAmount },
    userId, chitId, timestamp: serverTimestamp(), createdAt: serverTimestamp(),
  });

  await batch.commit();
  ['chit', 'schedule', 'members', 'all-payments', 'payments', 'chits', 'dashboard']
    .forEach(prefix => cacheDeletePattern(prefix));
}
