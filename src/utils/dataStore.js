/**
 * dataStore.js — Unified reactive data layer for EC Fin 360
 *
 * Strategy:
 *  1. First render → return cache immediately (instant)
 *  2. Fire onSnapshot listener → updates cache + notifies subscribers in background
 *  3. Cache persists across page navigations (module-level Map)
 *  4. Listeners are reference-counted — unsubscribed when no component needs them
 *  5. Firestore IndexedDB persistence handles offline + repeat-session speed
 */

import {
  collection, doc, onSnapshot,
  query, where, orderBy, limit,
  getDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';

// ── In-memory store ───────────────────────────────────────────────────────────
const store = new Map();          // key → { data, ts, listeners: Set }
const unsubs = new Map();         // key → unsubscribe function
const pending = new Map();        // key → Promise (in-flight getDocs)

const STALE_MS = 5 * 60 * 1000;  // 5 minutes before forcing a re-fetch

function isStale(key) {
  const entry = store.get(key);
  if (!entry) return true;
  return Date.now() - entry.ts > STALE_MS;
}

function notify(key, data) {
  const entry = store.get(key) || { listeners: new Set() };
  store.set(key, { data, ts: Date.now(), listeners: entry.listeners });
  entry.listeners.forEach(fn => fn(data));
}

function getStored(key) {
  return store.get(key)?.data ?? null;
}

// ── Subscribe to a Firestore query with auto-caching ─────────────────────────
function subscribeQuery(key, firestoreQuery, callback) {
  // Immediately return cached if available
  const cached = getStored(key);
  if (cached) callback(cached);

  // Register listener
  const entry = store.get(key) || { data: cached, ts: 0, listeners: new Set() };
  if (!store.has(key)) store.set(key, entry);
  entry.listeners.add(callback);

  // Start Firestore listener if not already running
  if (!unsubs.has(key)) {
    const unsub = onSnapshot(
      firestoreQuery,
      { includeMetadataChanges: false },
      (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        notify(key, docs);
      },
      (err) => {
        console.warn(`[dataStore] ${key}:`, err.code);
      }
    );
    unsubs.set(key, unsub);
  }

  // Return unsubscribe function for this component
  return () => {
    const e = store.get(key);
    if (e) {
      e.listeners.delete(callback);
      // If no more listeners, kill the Firestore subscription
      if (e.listeners.size === 0) {
        unsubs.get(key)?.();
        unsubs.delete(key);
      }
    }
  };
}

// ── One-shot getDocs with deduplication ──────────────────────────────────────
async function fetchOnce(key, firestoreQuery) {
  const cached = getStored(key);
  if (cached && !isStale(key)) return cached;

  // If a request is already in flight for this key, wait for it
  if (pending.has(key)) return pending.get(key);

  const promise = getDocs(firestoreQuery).then(snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    notify(key, docs);
    pending.delete(key);
    return docs;
  }).catch(err => {
    pending.delete(key);
    throw err;
  });

  pending.set(key, promise);
  return promise;
}

// ── Invalidate cache for a key or prefix ─────────────────────────────────────
export function invalidate(keyOrPrefix) {
  for (const key of store.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      const entry = store.get(key);
      if (entry) entry.ts = 0; // mark stale so next access re-fetches
    }
  }
}

export function invalidateAll() {
  for (const entry of store.values()) entry.ts = 0;
}

// ═════════════════════════════════════════════════════════════════════════════
// REAL ESTATE — live subscriptions
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeProjects(uid, callback) {
  return subscribeQuery(
    `re:projects:${uid}`,
    query(collection(db, 're_projects'), where('uid', '==', uid)),
    callback
  );
}

export function subscribeSites(projectId, callback) {
  return subscribeQuery(
    `re:sites:${projectId}`,
    query(collection(db, 're_sites'), where('projectId', '==', projectId)),
    callback
  );
}

export function subscribeClients(projectId, callback) {
  return subscribeQuery(
    `re:clients:${projectId}`,
    query(collection(db, 're_clients'), where('projectId', '==', projectId)),
    callback
  );
}

export function subscribePayments(projectId, callback) {
  return subscribeQuery(
    `re:payments:${projectId}`,
    query(collection(db, 're_payments'), where('projectId', '==', projectId)),
    callback
  );
}

export function subscribeExpenses(projectId, callback) {
  return subscribeQuery(
    `re:expenses:${projectId}`,
    query(collection(db, 're_expenses'), where('projectId', '==', projectId)),
    callback
  );
}

export function subscribeInvestors(projectId, callback) {
  return subscribeQuery(
    `re:investors:${projectId}`,
    query(collection(db, 're_investors'), where('projectId', '==', projectId)),
    callback
  );
}

export function subscribeLedger(uid, projectId, callback) {
  const key = projectId ? `re:ledger:${projectId}` : `re:ledger:${uid}`;
  const q = projectId
    ? query(collection(db, 're_ledger'), where('uid', '==', uid), where('projectId', '==', projectId))
    : query(collection(db, 're_ledger'), where('uid', '==', uid));
  return subscribeQuery(key, q, callback);
}

// ═════════════════════════════════════════════════════════════════════════════
// CHIT FUND — live subscriptions
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeChits(uid, callback) {
  return subscribeQuery(
    `cf:chits:${uid}`,
    query(collection(db, 'chit_master'), where('createdBy', '==', uid)),
    callback
  );
}

export function subscribeChitMembers(chitId, callback) {
  return subscribeQuery(
    `cf:members:${chitId}`,
    query(collection(db, 'chit_members'), where('chitId', '==', chitId)),
    callback
  );
}

export function subscribeAuctions(chitId, callback) {
  return subscribeQuery(
    `cf:auctions:${chitId}`,
    query(collection(db, 'chit_auction_schedule'), where('chitId', '==', chitId)),
    callback
  );
}

export function subscribeCFLedger(chitId, callback) {
  return subscribeQuery(
    `cf:ledger:${chitId}`,
    query(collection(db, 'chit_ledger'), where('chitId', '==', chitId)),
    callback
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FINANCE LEDGER — live subscriptions
// ═════════════════════════════════════════════════════════════════════════════

export function subscribeDepositors(callback) {
  return subscribeQuery(
    'fl:depositors',
    collection(db, 'deposit_master'),
    callback
  );
}

export function subscribeBorrowers(callback) {
  return subscribeQuery(
    'fl:borrowers',
    collection(db, 'borrower_master'),
    callback
  );
}

export function subscribeRepayments(callback) {
  return subscribeQuery(
    'fl:repayments',
    collection(db, 'loan_repayments'),
    callback
  );
}

export function subscribeInterestPayments(callback) {
  return subscribeQuery(
    'fl:interest',
    collection(db, 'borrower_interest_payments'),
    callback
  );
}

export function subscribeDepositPayments(callback) {
  return subscribeQuery(
    'fl:deposit_payments',
    collection(db, 'deposit_payments'),
    callback
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// HUB — prefetch all 3 apps simultaneously on login
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Call this right after authentication. Kicks off all Firestore listeners
 * so data is warm in the cache before the user clicks into any app.
 */
export function prefetchAll(uid) {
  // Fire and forget — don't await, just warm the cache
  subscribeProjects(uid, () => {});
  subscribeChits(uid, () => {});
  subscribeDepositors(() => {});
  subscribeBorrowers(() => {});
  subscribeRepayments(() => {});
}

// ═════════════════════════════════════════════════════════════════════════════
// React hook — useStore(subscribeFunc, ...args)
// ═════════════════════════════════════════════════════════════════════════════

export function useStore(subscribeFn, ...args) {
  // Dynamic import of React to avoid circular deps
  const { useState, useEffect } = require('react');

  // Determine the initial cached value synchronously
  const key = getCacheKey(subscribeFn, args);
  const [data, setData] = useState(() => getStored(key) ?? null);
  const [loading, setLoading] = useState(() => !getStored(key));

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeFn(...args, (newData) => {
      if (mounted) {
        setData(newData);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, args); // eslint-disable-line

  return { data: data ?? [], loading };
}

// Derive a cache key from function name + args (for the hook)
function getCacheKey(fn, args) {
  const name = fn.name || 'unknown';
  return `${name}:${args.join(':')}`;
}
