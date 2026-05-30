// src/utils/security.js

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(data, userUID) {
  try {
    const salt = process.env.REACT_APP_ENCRYPTION_SALT || 'ChitFundApp';
    const key = await deriveKey(userUID, salt);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(JSON.stringify(data))
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.error('Encryption error:', e);
    return null;
  }
}

export async function decryptData(encryptedStr, userUID) {
  try {
    const salt = process.env.REACT_APP_ENCRYPTION_SALT || 'ChitFundApp';
    const key = await deriveKey(userUID, salt);
    const combined = new Uint8Array(atob(encryptedStr).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.error('Decryption error:', e);
    return null;
  }
}

// ─── TOTP-Style Session ID ────────────────────────────────────────────────

export function generateSessionId(uid) {
  const timestamp = Date.now();
  const raw = `${uid}-${timestamp}-${Math.random().toString(36).slice(2)}`;
  // Simple hash simulation
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `SID-${Math.abs(hash).toString(16).toUpperCase()}-${timestamp.toString(36).toUpperCase()}`;
}

export function storeSession(uid, user) {
  const sessionId = generateSessionId(uid);
  const sessionData = {
    sessionId,
    uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    createdAt: Date.now(),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  };
  sessionStorage.setItem('cf_session', JSON.stringify(sessionData));
  return sessionData;
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem('cf_session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem('cf_session');
}
