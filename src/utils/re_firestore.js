import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, where, writeBatch, serverTimestamp, increment
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { cacheGet, cacheSet, cacheClear } from './re_helpers';
import { processFile } from './fileStore';

// ── Sort helper ──────────────────────────────────────────────────────────────
const sort = (arr, f = 'createdAt', dir = 'desc') =>
  [...arr].sort((a, b) => {
    const av = a[f]?.toMillis?.() ?? a[f] ?? 0;
    const bv = b[f]?.toMillis?.() ?? b[f] ?? 0;
    return dir === 'desc' ? bv - av : av - bv;
  });

// ── PROJECTS ─────────────────────────────────────────────────────────────────

export async function getProjects(uid) {
  const k = `projs_${uid}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_projects'), where('uid', '==', uid)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function getProject(id) {
  const k = `proj_${id}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDoc(doc(db, 're_projects', id));
  if (!s.exists()) return null;
  const d = { id: s.id, ...s.data() };
  cacheSet(k, d);
  return d;
}

export async function createProject(uid, data) {
  const landCost = parseFloat(data.landCost) || 0;
  const amountRequired = parseFloat(data.amountRequired) || 0;
  const initInvestAmt = parseFloat(data.initialInvestment) || 0;
  const totalAcres = parseFloat(data.totalAcres) || 0;
  const totalSqft = totalAcres > 0 ? Math.round(totalAcres * 43560) : (parseFloat(data.totalSqft) || 0);
  const initialStatus = initInvestAmt > 0 ? 'Active' : 'Planning';
  const { initialInvestment, investorName, ...projData } = data;
  const ref_ = await addDoc(collection(db, 're_projects'), { ...projData, uid, landCost, amountRequired, totalSqft, totalAcres, totalSites: 0, availableSites: 0, bookedSites: 0, registeredSites: 0, soldSites: 0, reservedSites: 0, onHoldSites: 0, totalExpenses: 0, totalInvestment: landCost, totalRevenue: 0, projectedRevenue: 0, totalFunded: initInvestAmt, siteMapUrl: data.siteMapUrl || null, siteMapName: data.siteMapName || null, landCostHistory: [{ amount: landCost, date: data.purchaseDate, note: 'Initial purchase', ts: new Date().toISOString() }], status: initialStatus, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  addDoc(collection(db, 're_ledger'), { uid, projectId: ref_.id, type: 'Land Purchase', description: `Land purchased: ${data.projectName}`, debit: landCost, credit: 0, date: data.purchaseDate, createdAt: serverTimestamp() });
  if (initInvestAmt > 0) {
    const invName = (investorName && investorName.trim()) || 'Owner / Self';
    await Promise.all([ addDoc(collection(db, 're_investors'), { uid, projectId: ref_.id, name: invName, amount: initInvestAmt, investType: 'Full Project', phone: '', date: data.purchaseDate, amountReturned: 0, profitShare: 0, sharePercent: 0, status: 'Active', investorId: `INV-${Date.now().toString(36).toUpperCase()}`, note: 'Initial project investment', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), addDoc(collection(db, 're_ledger'), { uid, projectId: ref_.id, type: 'Investment', description: `Initial investment by ${invName}`, debit: 0, credit: initInvestAmt, date: data.purchaseDate, createdAt: serverTimestamp() }) ]);
    cacheClear(`invs_${ref_.id}`); cacheClear(`allinvs_${uid}`);
  }
  cacheClear(`projs_${uid}`);
  return ref_.id;
}
export async function uploadSiteMap(uid, projectId, file) { const r = await processFile(file); await updateDoc(doc(db, 're_projects', projectId), { siteMapUrl: r.dataUrl, siteMapName: file.name, siteMapType: r.fileType, updatedAt: serverTimestamp() }); cacheClear(`proj_${projectId}`); cacheClear(`projs_${uid}`); return r.dataUrl; }
export async function removeSiteMap(uid, projectId) { await updateDoc(doc(db, 're_projects', projectId), { siteMapUrl: null, siteMapName: null, siteMapType: null, updatedAt: serverTimestamp() }); cacheClear(`proj_${projectId}`); cacheClear(`projs_${uid}`); }

export async function updateProject(uid, id, data) {
  const upd = { ...data, updatedAt: serverTimestamp() };
  if (data.landCost != null) {
    const prev = await getProject(id);
    const lc = parseFloat(data.landCost) || 0;
    upd.landCost = lc;
    upd.totalInvestment = lc + (prev?.totalExpenses || 0);
    upd.landCostHistory = [...(prev?.landCostHistory || []), {
      amount: lc,
      date: data.landCostDate || new Date().toISOString().split('T')[0],
      note: data.landCostNote || 'Updated',
      ts: new Date().toISOString(),
    }];
    delete upd.landCostDate;
    delete upd.landCostNote;
  }
  await updateDoc(doc(db, 're_projects', id), upd);
  cacheClear(`proj_${id}`);
  cacheClear(`projs_${uid}`);
}

export async function deleteProject(uid, id) {
  const cols = ['re_sites','re_clients','re_payments','re_expenses','re_investors','re_documents','re_ledger'];
  for (const col of cols) {
    const s = await getDocs(query(collection(db, col), where('projectId', '==', id)));
    if (s.docs.length) {
      const b = writeBatch(db);
      s.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  await deleteDoc(doc(db, 're_projects', id));
  cacheClear(`projs_${uid}`);
  cacheClear(`proj_${id}`);
}

// ── SITES ────────────────────────────────────────────────────────────────────

export async function getSites(projectId) {
  const k = `sites_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_sites'), where('projectId', '==', projectId)));
  const d = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.lotSeq ?? 0) - (b.lotSeq ?? 0));
  cacheSet(k, d);
  return d;
}

export async function getSite(id) {
  const k = `site_${id}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDoc(doc(db, 're_sites', id));
  if (!s.exists()) return null;
  const d = { id: s.id, ...s.data() };
  cacheSet(k, d);
  return d;
}

export function genLot(prefix, seq) {
  const { genLot: g } = require('./re_helpers');
  return g(prefix, seq);
}

export async function addSites(uid, projectId, rows) {
  const proj = await getProject(projectId);
  const prefix = proj?.lotPrefix || 'SITE';
  const maxSeq = proj?.maxLotSeq || 0;
  const batch = writeBatch(db);
  let projectedRevenue = proj?.projectedRevenue || 0;

  rows.forEach((r, i) => {
    const seq = maxSeq + i + 1;
    const lot = `${prefix}-${String(seq).padStart(3, '0')}`;
    const saleValue = (parseFloat(r.size) || 0) * (parseFloat(r.pricePerSqft) || 0);
    projectedRevenue += saleValue;
    const sRef = doc(collection(db, 're_sites'));
    batch.set(sRef, {
      uid, projectId, lotNumber: lot, lotSeq: seq,
      size: parseFloat(r.size) || 0,
      pricePerSqft: parseFloat(r.pricePerSqft) || 0,
      saleValue,
      facing: r.facing || 'East',
      notes: r.notes || '',
      status: 'Available',
      clientId: null, clientName: null, bookedDate: null,
      priceHistory: [{ price: parseFloat(r.pricePerSqft) || 0, ts: new Date().toISOString(), note: 'Initial' }],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });

  batch.update(doc(db, 're_projects', projectId), {
    totalSites: increment(rows.length),
    availableSites: increment(rows.length),
    maxLotSeq: maxSeq + rows.length,
    projectedRevenue,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  cacheClear(`sites_${projectId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

export async function updateSite(uid, projectId, siteId, data) {
  const prev = await getSite(siteId);
  const size = parseFloat(data.size ?? prev?.size) || 0;
  const pricePerSqft = parseFloat(data.pricePerSqft ?? prev?.pricePerSqft) || 0;
  const saleValue = size * pricePerSqft;
  const upd = { ...data, size, pricePerSqft, saleValue, updatedAt: serverTimestamp() };

  if (data.pricePerSqft != null && data.pricePerSqft !== prev?.pricePerSqft) {
    upd.priceHistory = [...(prev?.priceHistory || []), {
      price: pricePerSqft, ts: new Date().toISOString(), note: data.priceNote || 'Updated',
    }];
  }
  delete upd.priceNote;

  await updateDoc(doc(db, 're_sites', siteId), upd);
  cacheClear(`site_${siteId}`);
  cacheClear(`sites_${projectId}`);
  // Recalc projected revenue in background
  getSites(projectId).then(allSites => {
    const projectedRevenue = allSites.map(s => s.id === siteId ? saleValue : (s.saleValue || 0)).reduce((a, b) => a + b, 0);
    updateDoc(doc(db, 're_projects', projectId), { projectedRevenue, updatedAt: serverTimestamp() });
    cacheClear(`proj_${projectId}`);
    cacheClear(`projs_${uid}`);
  });
}

export async function deleteSite(uid, projectId, siteId) {
  const site = await getSite(siteId);
  if (site?.clientId) throw new Error(`Site ${site.lotNumber} has a client. Cancel booking first.`);
  const st = site?.status || 'Available';
  await deleteDoc(doc(db, 're_sites', siteId));

  const proj = await getProject(projectId);
  const dec = {
    totalSites: Math.max(0, (proj?.totalSites || 0) - 1),
    projectedRevenue: Math.max(0, (proj?.projectedRevenue || 0) - (site?.saleValue || 0)),
    updatedAt: serverTimestamp(),
  };
  const countKey = { Available: 'availableSites', Booked: 'bookedSites', Reserved: 'reservedSites', 'On Hold': 'onHoldSites' }[st];
  if (countKey) dec[countKey] = Math.max(0, (proj?.[countKey] || 0) - 1);
  await updateDoc(doc(db, 're_projects', projectId), dec);
  cacheClear(`sites_${projectId}`);
  cacheClear(`site_${siteId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

export async function bulkUpdatePrices(uid, projectId, newPrice, statusFilter = ['Available', 'Reserved']) {
  const sites = await getSites(projectId);
  const batch = writeBatch(db);
  let projectedRevenue = 0;
  for (const s of sites) {
    if (statusFilter.includes(s.status)) {
      const sv = (s.size || 0) * newPrice;
      projectedRevenue += sv;
      batch.update(doc(db, 're_sites', s.id), {
        pricePerSqft: newPrice, saleValue: sv, updatedAt: serverTimestamp(),
        priceHistory: [...(s.priceHistory || []), { price: newPrice, ts: new Date().toISOString(), note: 'Bulk update' }],
      });
    } else {
      projectedRevenue += (s.saleValue || 0);
    }
  }
  batch.update(doc(db, 're_projects', projectId), { projectedRevenue, updatedAt: serverTimestamp() });
  await batch.commit();
  cacheClear(`sites_${projectId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

// ── CLIENTS ──────────────────────────────────────────────────────────────────

export async function getClients(projectId) {
  const k = `clients_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_clients'), where('projectId', '==', projectId)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function getAllClients(uid) {
  const k = `allclients_${uid}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_clients'), where('uid', '==', uid)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function getClient(id) {
  const s = await getDoc(doc(db, 're_clients', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function registerClient(uid, projectId, siteId, data) {
  // Fetch site and project in parallel
  const [site, proj] = await Promise.all([getSite(siteId), getProject(projectId)]);
  if (!site) throw new Error('Site not found');
  if (['Sold', 'Registered'].includes(site.status)) throw new Error(`${site.lotNumber} is already ${site.status}`);

  const advance = parseFloat(data.advance) || 0;
  const saleValue = parseFloat(data.negotiatedPrice) || site.saleValue || 0;
  const balanceDue = saleValue - advance;
  const newSiteStatus = data.siteStatus || 'Booked';

  const batch = writeBatch(db);
  const cRef = doc(collection(db, 're_clients'));

  batch.set(cRef, {
    ...data, uid, projectId, siteId,
    lotNumber: site.lotNumber,
    saleValue, advance, totalPaid: advance, balanceDue,
    status: 'Active',
    clientId: `CLT-${Date.now().toString(36).toUpperCase()}`,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 're_sites', siteId), {
    status: newSiteStatus, clientId: cRef.id, clientName: data.name,
    bookedDate: data.bookedDate, saleValue, updatedAt: serverTimestamp(),
  });

  const decMap = { Available: 'availableSites', Reserved: 'reservedSites', 'On Hold': 'onHoldSites' };
  const incMap = { Booked: 'bookedSites', Registered: 'registeredSites', Sold: 'soldSites', Reserved: 'reservedSites', 'On Hold': 'onHoldSites' };
  const projUpd = { updatedAt: serverTimestamp() };
  if (decMap[site.status]) projUpd[decMap[site.status]] = Math.max(0, (proj?.[decMap[site.status]] || 0) - 1);
  if (incMap[newSiteStatus]) projUpd[incMap[newSiteStatus]] = (proj?.[incMap[newSiteStatus]] || 0) + 1;
  if (advance > 0) projUpd.totalRevenue = (proj?.totalRevenue || 0) + advance;
  batch.update(doc(db, 're_projects', projectId), projUpd);

  if (advance > 0) {
    const pRef = doc(collection(db, 're_payments'));
    batch.set(pRef, {
      uid, projectId, clientId: cRef.id, siteId, lotNumber: site.lotNumber, clientName: data.name,
      amount: advance, mode: data.advanceMode || 'Cash', reference: data.advanceRef || '',
      date: data.bookedDate, notes: 'Advance/Token payment at booking',
      paymentId: `PAY-${Date.now().toString(36).toUpperCase()}`,
      createdAt: serverTimestamp(),
    });
    const lRef = doc(collection(db, 're_ledger'));
    batch.set(lRef, {
      uid, projectId, clientId: cRef.id, type: 'Client Payment',
      description: `Advance from ${data.name} — ${site.lotNumber}`,
      debit: 0, credit: advance, date: data.bookedDate, createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
  cacheClear(`site_${siteId}`);
  cacheClear(`sites_${projectId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
  return cRef.id;
}

export async function updateClient(uid, projectId, clientId, data) {
  await updateDoc(doc(db, 're_clients', clientId), { ...data, updatedAt: serverTimestamp() });
  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
}

export async function cancelBooking(uid, projectId, clientId) {
  const [client, proj] = await Promise.all([getClient(clientId), getProject(projectId)]);
  if (!client) throw new Error('Client not found');

  const batch = writeBatch(db);
  batch.update(doc(db, 're_clients', clientId), { status: 'Cancelled', updatedAt: serverTimestamp() });
  batch.update(doc(db, 're_sites', client.siteId), {
    status: 'Available', clientId: null, clientName: null, bookedDate: null, updatedAt: serverTimestamp(),
  });

  const decMap = { Booked: 'bookedSites', Registered: 'registeredSites', Sold: 'soldSites' };
  const projUpd = { availableSites: (proj?.availableSites || 0) + 1, updatedAt: serverTimestamp() };
  if (decMap[client.siteStatusWhenBooked || 'Booked'])
    projUpd[decMap[client.siteStatusWhenBooked || 'Booked']] = Math.max(0, (proj?.[decMap[client.siteStatusWhenBooked || 'Booked']] || 0) - 1);
  if (client.totalPaid > 0) projUpd.totalRevenue = Math.max(0, (proj?.totalRevenue || 0) - client.totalPaid);
  batch.update(doc(db, 're_projects', projectId), projUpd);
  await batch.commit();

  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
  cacheClear(`site_${client.siteId}`);
  cacheClear(`sites_${projectId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

export async function transferSite(uid, projectId, clientId, newSiteId) {
  const [client, newSite] = await Promise.all([getClient(clientId), getSite(newSiteId)]);
  if (!newSite || newSite.clientId) throw new Error('New site is not available');

  const batch = writeBatch(db);
  batch.update(doc(db, 're_sites', client.siteId), {
    status: 'Available', clientId: null, clientName: null, bookedDate: null, updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 're_sites', newSiteId), {
    status: 'Booked', clientId, clientName: client.name, bookedDate: client.bookedDate, updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 're_clients', clientId), {
    siteId: newSiteId, lotNumber: newSite.lotNumber,
    saleValue: newSite.saleValue, balanceDue: newSite.saleValue - (client.totalPaid || 0),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
  cacheClear(`site_${client.siteId}`);
  cacheClear(`site_${newSiteId}`);
  cacheClear(`sites_${projectId}`);
}

// ── PAYMENTS ─────────────────────────────────────────────────────────────────

export async function getProjectPayments(projectId) {
  const k = `ppays_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_payments'), where('projectId', '==', projectId)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function getAllPayments(uid) {
  const k = `allpays_${uid}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_payments'), where('uid', '==', uid)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function recordPayment(uid, projectId, clientId, data) {
  // Fetch client and project in parallel — eliminates one round trip
  const [client, proj] = await Promise.all([getClient(clientId), getProject(projectId)]);
  if (!client) throw new Error('Client not found');
  const amount = parseFloat(data.amount) || 0;
  if (amount <= 0) throw new Error('Amount must be greater than zero');

  const newPaid = (client.totalPaid || 0) + amount;
  const newBal = Math.max(0, client.saleValue - newPaid);
  const fullyPaid = newBal <= 0;

  const batch = writeBatch(db);
  const pRef = doc(collection(db, 're_payments'));
  batch.set(pRef, {
    ...data, uid, projectId, clientId, siteId: client.siteId,
    lotNumber: client.lotNumber, clientName: client.name,
    amount, paymentId: `PAY-${Date.now().toString(36).toUpperCase()}`,
    createdAt: serverTimestamp(),
  });

  const cUpd = { totalPaid: newPaid, balanceDue: newBal, updatedAt: serverTimestamp() };
  if (fullyPaid) cUpd.status = 'Completed';
  batch.update(doc(db, 're_clients', clientId), cUpd);

  if (fullyPaid) batch.update(doc(db, 're_sites', client.siteId), { status: 'Registered', updatedAt: serverTimestamp() });

  const pUpd = { totalRevenue: (proj?.totalRevenue || 0) + amount, updatedAt: serverTimestamp() };
  if (fullyPaid) {
    pUpd.registeredSites = (proj?.registeredSites || 0) + 1;
    pUpd.bookedSites = Math.max(0, (proj?.bookedSites || 0) - 1);
  }
  batch.update(doc(db, 're_projects', projectId), pUpd);

  const lRef = doc(collection(db, 're_ledger'));
  batch.set(lRef, {
    uid, projectId, clientId, type: 'Client Payment',
    description: `Payment from ${client.name} — ${client.lotNumber}`,
    debit: 0, credit: amount, mode: data.mode, date: data.date, createdAt: serverTimestamp(),
  });

  await batch.commit();
  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
  cacheClear(`ppays_${projectId}`);
  cacheClear(`allpays_${uid}`);
  cacheClear(`site_${client.siteId}`);
  cacheClear(`sites_${projectId}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
  return pRef.id;
}

export async function deletePayment(uid, projectId, payId, clientId, amount) {
  const [client, proj] = await Promise.all([getClient(clientId), getProject(projectId)]);
  const batch = writeBatch(db);
  batch.delete(doc(db, 're_payments', payId));
  if (client) {
    const newPaid = Math.max(0, (client.totalPaid || 0) - amount);
    const newBal = client.saleValue - newPaid;
    batch.update(doc(db, 're_clients', clientId), { totalPaid: newPaid, balanceDue: newBal, status: 'Active', updatedAt: serverTimestamp() });
  }
  batch.update(doc(db, 're_projects', projectId), {
    totalRevenue: Math.max(0, (proj?.totalRevenue || 0) - amount), updatedAt: serverTimestamp(),
  });
  await batch.commit();
  cacheClear(`clients_${projectId}`);
  cacheClear(`allclients_${uid}`);
  cacheClear(`ppays_${projectId}`);
  cacheClear(`allpays_${uid}`);
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────

export async function getExpenses(projectId) {
  const k = `exps_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_expenses'), where('projectId', '==', projectId)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

async function recalcProjectExpenses(uid, projectId, newAmount = null, isDelta = false) {
  // Optimized: if we know the delta, skip the re-read
  cacheClear(`exps_${projectId}`);
  const [exps, proj] = await Promise.all([getExpenses(projectId), getProject(projectId)]);
  const totalExpenses = exps.reduce((s, e) => s + (e.amount || 0), 0);
  const totalInvestment = (proj?.landCost || 0) + totalExpenses;
  await updateDoc(doc(db, 're_projects', projectId), { totalExpenses, totalInvestment, updatedAt: serverTimestamp() });
  cacheClear(`proj_${projectId}`);
  cacheClear(`projs_${uid}`);
}

export async function addExpense(uid, projectId, data) {
  const amount = parseFloat(data.amount) || 0;
  // Write expense + ledger entry together, then recalc in background
  const [eRef] = await Promise.all([
    addDoc(collection(db, 're_expenses'), {
      ...data, uid, projectId, amount,
      expenseId: `EXP-${Date.now().toString(36).toUpperCase()}`,
      createdAt: serverTimestamp(),
    }),
    addDoc(collection(db, 're_ledger'), {
      uid, projectId, type: 'Expense',
      description: `${data.category}: ${data.description || data.vendor || ''}`,
      debit: amount, credit: 0, date: data.date, createdAt: serverTimestamp(),
    }),
  ]);
  // Recalc in background — UI doesn't wait for this
  recalcProjectExpenses(uid, projectId);
  return eRef.id;
}

export async function updateExpense(uid, projectId, expId, data) {
  await updateDoc(doc(db, 're_expenses', expId), { ...data, amount: parseFloat(data.amount) || 0, updatedAt: serverTimestamp() });
  recalcProjectExpenses(uid, projectId);
}

export async function deleteExpense(uid, projectId, expId) {
  await deleteDoc(doc(db, 're_expenses', expId));
  recalcProjectExpenses(uid, projectId);
}

// ── INVESTORS ────────────────────────────────────────────────────────────────

export async function getInvestors(projectId) {
  const k = `invs_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_investors'), where('projectId', '==', projectId)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function getAllInvestors(uid) {
  const k = `allinvs_${uid}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_investors'), where('uid', '==', uid)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

export async function addInvestor(uid, projectId, data) {
  const amount = parseFloat(data.amount) || 0;
  const [iRef] = await Promise.all([
    addDoc(collection(db, 're_investors'), {
      ...data, uid, projectId, amount,
      amountReturned: 0, profitShare: 0, sharePercent: 0,
      status: 'Active',
      investorId: `INV-${Date.now().toString(36).toUpperCase()}`,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }),
    addDoc(collection(db, 're_ledger'), {
      uid, projectId, type: 'Investment',
      description: `Investment by ${data.name} (${data.investType || 'General'})`,
      debit: 0, credit: amount, date: data.date, createdAt: serverTimestamp(),
    }),
  ]);
  // Update project funded amount
  getProject(projectId).then(proj =>
    updateDoc(doc(db, 're_projects', projectId), {
      totalFunded: (proj?.totalFunded || 0) + amount, updatedAt: serverTimestamp(),
    })
  );
  cacheClear(`invs_${projectId}`);
  cacheClear(`allinvs_${uid}`);
  return iRef.id;
}

export async function updateInvestor(uid, projectId, invId, data) {
  const prev = await getDoc(doc(db, 're_investors', invId));
  const prevAmt = prev.data()?.amount || 0;
  const newAmt = parseFloat(data.amount ?? prevAmt) || 0;
  await updateDoc(doc(db, 're_investors', invId), { ...data, amount: newAmt, updatedAt: serverTimestamp() });
  const diff = newAmt - prevAmt;
  if (diff !== 0) {
    getProject(projectId).then(proj =>
      updateDoc(doc(db, 're_projects', projectId), {
        totalFunded: Math.max(0, (proj?.totalFunded || 0) + diff), updatedAt: serverTimestamp(),
      })
    );
  }
  cacheClear(`invs_${projectId}`);
  cacheClear(`allinvs_${uid}`);
}

export async function deleteInvestor(uid, projectId, invId) {
  const inv = await getDoc(doc(db, 're_investors', invId));
  const amt = inv.data()?.amount || 0;
  await deleteDoc(doc(db, 're_investors', invId));
  getProject(projectId).then(proj =>
    updateDoc(doc(db, 're_projects', projectId), {
      totalFunded: Math.max(0, (proj?.totalFunded || 0) - amt), updatedAt: serverTimestamp(),
    })
  );
  cacheClear(`invs_${projectId}`);
  cacheClear(`allinvs_${uid}`);
}

export async function recordInvestorReturn(uid, projectId, invId, data) {
  const amount = parseFloat(data.amount) || 0;
  const inv = await getDoc(doc(db, 're_investors', invId));
  await Promise.all([
    updateDoc(doc(db, 're_investors', invId), {
      amountReturned: (inv.data()?.amountReturned || 0) + amount, updatedAt: serverTimestamp(),
    }),
    addDoc(collection(db, 're_ledger'), {
      uid, projectId, investorId: invId, type: 'Investor Return',
      description: `Return to investor ${inv.data()?.name}`,
      debit: amount, credit: 0, date: data.date, createdAt: serverTimestamp(),
    }),
  ]);
  cacheClear(`invs_${projectId}`);
  cacheClear(`allinvs_${uid}`);
}

export async function distributeProfit(uid, projectId) {
  const [proj, investors] = await Promise.all([getProject(projectId), getInvestors(projectId)]);
  const netProfit = (proj?.totalRevenue || 0) - (proj?.totalInvestment || 0);
  const totalInvested = investors.reduce((s, i) => s + (i.amount || 0), 0);
  if (!investors.length || !totalInvested) return;
  const batch = writeBatch(db);
  for (const inv of investors) {
    const pct = ((inv.amount || 0) / totalInvested) * 100;
    const share = (netProfit * pct) / 100;
    batch.update(doc(db, 're_investors', inv.id), { sharePercent: pct, profitShare: share, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  cacheClear(`invs_${projectId}`);
  cacheClear(`allinvs_${uid}`);
}

// ── DOCUMENTS ────────────────────────────────────────────────────────────────

export async function getDocuments(projectId) {
  const k = `docs_${projectId}`;
  const c = cacheGet(k);
  if (c) return c;
  const s = await getDocs(query(collection(db, 're_documents'), where('projectId', '==', projectId)));
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })), 'uploadedAt');
  cacheSet(k, d);
  return d;
}

export async function uploadDocument(uid, projectId, file, docType) {
  const result = await processFile(file);
  const dRef = await addDoc(collection(db, 're_documents'), {
    uid, projectId, docType,
    fileName: file.name,
    fileSize: file.size,
    fileType: result.fileType,
    dataUrl: result.dataUrl,
    sizeKB: result.sizeKB,
    originalSizeKB: result.originalSizeKB,
    isImage: result.isImage,
    isTruncated: result.isTruncated || false,
    uploadedAt: serverTimestamp(),
  });
  cacheClear(`docs_${projectId}`);
  return { id: dRef.id, dataUrl: result.dataUrl, fileName: file.name };
}

export async function deleteDocument(uid, projectId, docId) {
  await deleteDoc(doc(db, 're_documents', docId));
  cacheClear(`docs_${projectId}`);
}


// RENT
export async function getRentAgreements(projectId){const k=`rentagr_${projectId}`;const ch=cacheGet(k);if(ch)return ch;const s=await getDocs(query(collection(db,'re_rent_agreements'),where('projectId','==',projectId)));const d=sort(s.docs.map(x=>({id:x.id,...x.data()})));cacheSet(k,d);return d;}
export async function getRentPayments(projectId){const k=`rentpay_${projectId}`;const ch=cacheGet(k);if(ch)return ch;const s=await getDocs(query(collection(db,'re_rent_payments'),where('projectId','==',projectId)));const d=sort(s.docs.map(x=>({id:x.id,...x.data()})));cacheSet(k,d);return d;}
export async function addRentAgreement(uid,projectId,data){const ref_=await addDoc(collection(db,'re_rent_agreements'),{uid,projectId,tenantName:data.tenantName||'',tenantPhone:data.tenantPhone||'',siteId:data.siteId||null,siteLabel:data.siteLabel||'Whole project / unspecified',purpose:data.purpose||'Agriculture',monthlyRent:parseFloat(data.monthlyRent)||0,deposit:parseFloat(data.deposit)||0,startDate:data.startDate||null,endDate:data.endDate||null,notes:data.notes||'',totalCollected:0,status:'Active',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});cacheClear(`rentagr_${projectId}`);return ref_.id;}
export async function updateRentAgreement(uid,projectId,agrId,data){const u={...data,updatedAt:serverTimestamp()};if(data.monthlyRent!=null)u.monthlyRent=parseFloat(data.monthlyRent)||0;if(data.deposit!=null)u.deposit=parseFloat(data.deposit)||0;await updateDoc(doc(db,'re_rent_agreements',agrId),u);cacheClear(`rentagr_${projectId}`);}
export async function deleteRentAgreement(uid,projectId,agrId){const pays=await getDocs(query(collection(db,'re_rent_payments'),where('agreementId','==',agrId)));const tot=pays.docs.reduce((s,d)=>s+(d.data().amount||0),0);const b=writeBatch(db);pays.docs.forEach(d=>b.delete(d.ref));b.delete(doc(db,'re_rent_agreements',agrId));await b.commit();if(tot>0){const p=await getProject(projectId);await updateDoc(doc(db,'re_projects',projectId),{totalRevenue:Math.max(0,(p?.totalRevenue||0)-tot),updatedAt:serverTimestamp()});}const led=await getDocs(query(collection(db,'re_ledger'),where('agreementId','==',agrId)));if(led.docs.length){const lb=writeBatch(db);led.docs.forEach(d=>lb.delete(d.ref));await lb.commit();}cacheClear(`rentagr_${projectId}`);cacheClear(`rentpay_${projectId}`);cacheClear(`proj_${projectId}`);cacheClear(`projs_${uid}`);}
export async function recordRentPayment(uid,projectId,agrId,data){const amt=parseFloat(data.amount)||0;const agr=await getDoc(doc(db,'re_rent_agreements',agrId));const ad=agr.data()||{};await Promise.all([addDoc(collection(db,'re_rent_payments'),{uid,projectId,agreementId:agrId,tenantName:ad.tenantName||'',siteLabel:ad.siteLabel||'',amount:amt,forMonth:data.forMonth||'',mode:data.mode||'Cash',date:data.date||new Date().toISOString().split('T')[0],note:data.note||'',createdAt:serverTimestamp()}),addDoc(collection(db,'re_ledger'),{uid,projectId,agreementId:agrId,type:'Rent Income',description:`Rent from ${ad.tenantName||'tenant'}`,debit:0,credit:amt,date:data.date||new Date().toISOString().split('T')[0],createdAt:serverTimestamp()}),updateDoc(doc(db,'re_rent_agreements',agrId),{totalCollected:(ad.totalCollected||0)+amt,updatedAt:serverTimestamp()})]);const p=await getProject(projectId);await updateDoc(doc(db,'re_projects',projectId),{totalRevenue:(p?.totalRevenue||0)+amt,updatedAt:serverTimestamp()});cacheClear(`rentpay_${projectId}`);cacheClear(`rentagr_${projectId}`);cacheClear(`proj_${projectId}`);cacheClear(`projs_${uid}`);}
export async function deleteRentPayment(uid,projectId,payId,agrId,amount){const amt=parseFloat(amount)||0;await deleteDoc(doc(db,'re_rent_payments',payId));const ag=await getDoc(doc(db,'re_rent_agreements',agrId));const p=await getProject(projectId);await Promise.all([updateDoc(doc(db,'re_rent_agreements',agrId),{totalCollected:Math.max(0,(ag.data()?.totalCollected||0)-amt),updatedAt:serverTimestamp()}),updateDoc(doc(db,'re_projects',projectId),{totalRevenue:Math.max(0,(p?.totalRevenue||0)-amt),updatedAt:serverTimestamp()})]);cacheClear(`rentpay_${projectId}`);cacheClear(`rentagr_${projectId}`);cacheClear(`proj_${projectId}`);cacheClear(`projs_${uid}`);}
// ── LEDGER ───────────────────────────────────────────────────────────────────

export async function getLedger(uid, projectId) {
  const k = `ledger_${uid}_${projectId || 'all'}`;
  const c = cacheGet(k);
  if (c) return c;
  const q = projectId
    ? query(collection(db, 're_ledger'), where('uid', '==', uid), where('projectId', '==', projectId))
    : query(collection(db, 're_ledger'), where('uid', '==', uid));
  const s = await getDocs(q);
  const d = sort(s.docs.map(d => ({ id: d.id, ...d.data() })));
  cacheSet(k, d);
  return d;
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────

export async function getDashStats(uid) {
  const projects = await getProjects(uid);
  return {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'Active').length,
    totalLandCost: projects.reduce((s, p) => s + (p.landCost || 0), 0),
    totalExpenses: projects.reduce((s, p) => s + (p.totalExpenses || 0), 0),
    totalInvestment: projects.reduce((s, p) => s + (p.totalInvestment || 0), 0),
    totalRevenue: projects.reduce((s, p) => s + (p.totalRevenue || 0), 0),
    totalFunded: projects.reduce((s, p) => s + (p.totalFunded || 0), 0),
    totalSites: projects.reduce((s, p) => s + (p.totalSites || 0), 0),
    availableSites: projects.reduce((s, p) => s + (p.availableSites || 0), 0),
    bookedSites: projects.reduce((s, p) => s + (p.bookedSites || 0), 0),
    registeredSites: projects.reduce((s, p) => s + (p.registeredSites || 0), 0),
    soldSites: projects.reduce((s, p) => s + (p.soldSites || 0), 0),
    reservedSites: projects.reduce((s, p) => s + (p.reservedSites || 0), 0),
    onHoldSites: projects.reduce((s, p) => s + (p.onHoldSites || 0), 0),
    projectedRevenue: projects.reduce((s, p) => s + (p.projectedRevenue || 0), 0),
    netProfit: projects.reduce((s, p) => s + ((p.totalRevenue || 0) - (p.totalInvestment || 0)), 0),
    projects,
  };
}
