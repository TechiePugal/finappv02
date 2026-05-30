const SALT = process.env.REACT_APP_ENC_SALT || 'RealEstateLayoutERP_SecureSalt_2025';

export async function deriveKey(uid) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(uid), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptData(uid, data) {
  try {
    const key = await deriveKey(uid);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const combined = new Uint8Array(iv.length + enc.byteLength);
    combined.set(iv); combined.set(new Uint8Array(enc), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch { return null; }
}

export async function decryptData(uid, b64) {
  try {
    const key = await deriveKey(uid);
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
    return JSON.parse(new TextDecoder().decode(dec));
  } catch { return null; }
}

export function generateSessionId(uid) {
  const raw = `${uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0; }
  return `SID-${Math.abs(hash).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

export function createSession(uid, user) {
  const sid = generateSessionId(uid);
  sessionStorage.setItem('erp_session', JSON.stringify({
    sid, uid, email: user.email, displayName: user.displayName,
    createdAt: Date.now(), expiresAt: Date.now() + 8 * 3600000,
  }));
  return sid;
}

export function getSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem('erp_session'));
    if (!s || Date.now() > s.expiresAt) { clearSession(); return null; }
    return s;
  } catch { return null; }
}

export function clearSession() { sessionStorage.removeItem('erp_session'); }
