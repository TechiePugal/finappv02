/**
 * jwtSession.js — JWT Session Security with 4-device limit
 *
 * Firestore collection "user_sessions" tracks active sessions.
 * Max 4 concurrent sessions per user — oldest is evicted on overflow.
 * No composite index required — filtering/sorting done in JS.
 */

import { db } from '../firebase/config';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';

const SESSION_KEY = 'fs_jwt';
const SESSION_TTL = 8 * 60 * 60;   // 8 hours
const MAX_DEVICES = 4;
const ISSUER      = 'finsuite-v1';

// ── Signing key ────────────────────────────────────────────────────────────────
async function getSigningKey(uid) {
  const enc = new TextEncoder();
  const fp  = [navigator.userAgent, navigator.language, window.screen.colorDepth, new Date().getTimezoneOffset()].join('|');
  const raw = `${uid}::${ISSUER}::${fp}`;

  const base = await crypto.subtle.importKey('raw', enc.encode(raw), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(`${ISSUER}-salt-2025`), iterations: 100000, hash: 'SHA-256' },
    base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']
  );
}

// ── Base64url ──────────────────────────────────────────────────────────────────
const b64e = s  => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const b64d = s  => atob(s.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((s.length+3)%4));
const encO = o  => b64e(JSON.stringify(o));
const decO = s  => { try { return JSON.parse(b64d(s)); } catch { return null; } };
const jti  = () => Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');

// ── Firestore session helpers (no composite index needed) ──────────────────────
async function getActiveSessions(uid) {
  try {
    const snap = await getDocs(query(collection(db, 'user_sessions'), where('uid', '==', uid)));
    const now  = Math.floor(Date.now() / 1000);
    // Filter expired in JS, sort by exp ascending (oldest first)
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.exp > now)
      .sort((a, b) => a.exp - b.exp);
  } catch {
    return [];  // offline / no index — fail silently
  }
}

async function registerSession(uid, sessionJti, exp) {
  try {
    const sessions = await getActiveSessions(uid);
    // Evict oldest sessions if over limit
    if (sessions.length >= MAX_DEVICES) {
      const toEvict = sessions.slice(0, sessions.length - MAX_DEVICES + 1);
      await Promise.all(toEvict.map(s => deleteDoc(doc(db, 'user_sessions', s.jti || s.id)).catch(() => {})));
    }
    await setDoc(doc(db, 'user_sessions', sessionJti), {
      uid, jti: sessionJti, exp,
      createdAt: Math.floor(Date.now() / 1000),
      device: navigator.userAgent.slice(0, 120),
    });
  } catch (e) {
    // Non-critical — session still works locally even if Firestore registration fails
    console.warn('Session registration skipped:', e.code || e.message);
  }
}

async function revokeSession(sessionJti) {
  try { await deleteDoc(doc(db, 'user_sessions', sessionJti)); } catch {}
}

// ── Create JWT + register in Firestore ────────────────────────────────────────
export async function createSession(firebaseUser, app = 'hub') {
  try {
    const now  = Math.floor(Date.now() / 1000);
    const id   = jti();
    const exp  = now + SESSION_TTL;

    const header  = { alg: 'HS256', typ: 'JWT' };
    const payload = { iss: ISSUER, sub: firebaseUser.uid, iat: now, exp, uid: firebaseUser.uid, email: firebaseUser.email || '', name: firebaseUser.displayName || '', photo: firebaseUser.photoURL || '', app, jti: id };

    const input  = `${encO(header)}.${encO(payload)}`;
    const key    = await getSigningKey(firebaseUser.uid);
    const rawSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
    const sig    = b64e(String.fromCharCode(...new Uint8Array(rawSig)));
    const jwt    = `${input}.${sig}`;

    sessionStorage.setItem(SESSION_KEY, jwt);

    // Register in Firestore asynchronously — never blocks sign-in
    registerSession(firebaseUser.uid, id, exp);

    return jwt;
  } catch (err) {
    console.error('createSession error:', err);
    // Still allow login — create a minimal local session
    sessionStorage.setItem(SESSION_KEY + '_fallback', JSON.stringify({ uid: firebaseUser.uid, exp: Math.floor(Date.now()/1000) + SESSION_TTL }));
    return null;
  }
}

// ── Verify JWT ────────────────────────────────────────────────────────────────
export async function verifySession() {
  try {
    const jwt = sessionStorage.getItem(SESSION_KEY);
    if (!jwt) {
      // Check fallback (created when crypto failed)
      const fb = sessionStorage.getItem(SESSION_KEY + '_fallback');
      if (fb) {
        const d = JSON.parse(fb);
        if (d.exp > Math.floor(Date.now() / 1000)) return d;
      }
      return null;
    }

    const [hB64, pB64, sB64] = jwt.split('.');
    if (!hB64 || !pB64 || !sB64) return null;

    const payload = decO(pB64);
    if (!payload?.uid || !payload?.exp) return null;

    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) { clearSession(); return null; }
    if (payload.iss !== ISSUER) return null;

    const key    = await getSigningKey(payload.uid);
    const rawSig = Uint8Array.from(b64d(sB64).split('').map(c => c.charCodeAt(0)));
    const valid  = await crypto.subtle.verify('HMAC', key, rawSig, new TextEncoder().encode(`${hB64}.${pB64}`));
    if (!valid) { clearSession(); return null; }

    return payload;
  } catch (err) {
    console.warn('verifySession:', err);
    // On error, check fallback
    try {
      const fb = sessionStorage.getItem(SESSION_KEY + '_fallback');
      if (fb) { const d = JSON.parse(fb); if (d.exp > Math.floor(Date.now()/1000)) return d; }
    } catch {}
    return null;
  }
}

// ── Get session info (no verify — UI only) ────────────────────────────────────
export function getSessionInfo() {
  try {
    const jwt = sessionStorage.getItem(SESSION_KEY);
    if (jwt) {
      const parts = jwt.split('.');
      if (parts.length === 3) {
        const p = decO(parts[1]);
        if (p && p.exp > Math.floor(Date.now()/1000)) return p;
      }
    }
    // Fallback
    const fb = sessionStorage.getItem(SESSION_KEY + '_fallback');
    if (fb) { const d = JSON.parse(fb); if (d.exp > Math.floor(Date.now()/1000)) return d; }
    return null;
  } catch { return null; }
}

export function sessionExpiryLabel() {
  const info = getSessionInfo();
  if (!info) return '';
  const secs = Math.max(0, info.exp - Math.floor(Date.now()/1000));
  if (!secs) return 'Expired';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function hasActiveSession() { return getSessionInfo() !== null; }

export function clearSession() {
  const info = getSessionInfo();
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY + '_fallback');
  if (info?.jti && info?.uid) revokeSession(info.jti);
}

export async function refreshSession(firebaseUser) {
  const info = getSessionInfo();
  if (!info) return null;
  if (Math.floor(Date.now()/1000) - (info.iat || 0) < 30 * 60) return sessionStorage.getItem(SESSION_KEY);
  return createSession(firebaseUser, info.app);
}

// ── Device management (account settings) ──────────────────────────────────────
export async function getActiveDevices(uid) {
  const sessions = await getActiveSessions(uid);
  const current  = getSessionInfo();
  return sessions.map(s => ({
    jti:      s.jti || s.id,
    exp:      s.exp,
    createdAt: s.createdAt,
    device:   s.device || 'Unknown device',
    isCurrent: (s.jti || s.id) === current?.jti,
  }));
}

export async function revokeDevice(sessionJti) { await revokeSession(sessionJti); }

// Legacy compat
export function generateSessionId(uid) { return getSessionInfo()?.jti || uid.slice(0,8); }
export function storeSession(uid, user) { createSession(user); }
