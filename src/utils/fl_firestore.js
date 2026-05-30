// Optimized Firestore helpers with caching and batching
import { 
  collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  doc, query, where, orderBy, limit, writeBatch, serverTimestamp,
  onSnapshot, enableNetwork, disableNetwork
} from 'firebase/firestore';
import { db } from '../firebase/config';

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

function getCacheKey(col, filters) {
  return `${col}_${JSON.stringify(filters || {})}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

export function clearCache(col) {
  for (const key of cache.keys()) {
    if (key.startsWith(col)) cache.delete(key);
  }
}

// Fast collection fetch with cache
export async function fetchCollection(colName, filters = [], useCache = true) {
  const cacheKey = getCacheKey(colName, filters);
  if (useCache) {
    const cached = getFromCache(cacheKey);
    if (cached) return cached;
  }
  let q = collection(db, colName);
  const constraints = filters.map(f => {
    if (f.type === 'where') return where(f.field, f.op, f.value);
    if (f.type === 'orderBy') return orderBy(f.field, f.dir || 'asc');
    if (f.type === 'limit') return limit(f.value);
    return null;
  }).filter(Boolean);
  if (constraints.length > 0) q = query(q, ...constraints);
  const snap = await getDocs(q);
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (useCache) setCache(cacheKey, data);
  return data;
}

// Batch write for multiple operations
export async function batchWrite(operations) {
  const batch = writeBatch(db);
  operations.forEach(op => {
    if (op.type === 'set') batch.set(doc(db, op.col, op.id), op.data);
    if (op.type === 'update') batch.update(doc(db, op.col, op.id), op.data);
    if (op.type === 'delete') batch.delete(doc(db, op.col, op.id));
    if (op.type === 'add') batch.set(doc(collection(db, op.col)), { ...op.data, createdAt: serverTimestamp() });
  });
  await batch.commit();
}

// Network control for offline mode
export const goOffline = () => disableNetwork(db);
export const goOnline = () => enableNetwork(db);

// Backup: export all collections
export async function backupAllData() {
  const collections = ['deposit_master', 'borrower_master', 'borrower_interest_payments', 'deposit_payments', 'finance_ledger_entries', 'deposit_interest_schedule'];
  const backup = { exportedAt: new Date().toISOString(), version: '1.0', data: {} };
  for (const col of collections) {
    const snap = await getDocs(collection(db, col));
    backup.data[col] = snap.docs.map(d => {
      const data = d.data();
      // Convert Firestore Timestamps to ISO strings
      Object.keys(data).forEach(k => {
        if (data[k]?.toDate) data[k] = data[k].toDate().toISOString();
      });
      return { id: d.id, ...data };
    });
  }
  return backup;
}

// Restore from backup
export async function restoreFromBackup(backupData) {
  if (!backupData?.data) throw new Error('Invalid backup format');
  const batch = writeBatch(db);
  let count = 0;
  for (const [col, docs] of Object.entries(backupData.data)) {
    for (const docData of docs) {
      const { id, ...rest } = docData;
      batch.set(doc(db, col, id), { ...rest, restoredAt: serverTimestamp() });
      count++;
      if (count % 490 === 0) { await batch.commit(); } // Firestore limit
    }
  }
  await batch.commit();
  return count;
}

export { serverTimestamp };
