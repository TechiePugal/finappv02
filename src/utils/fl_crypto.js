// AES-GCM encryption for sensitive data using Web Crypto API
const ALGO = 'AES-GCM';
const KEY_USAGE = ['encrypt', 'decrypt'];

// Derive a key from user UID (deterministic, per-user)
async function getDerivedKey(uid) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(uid + '_finledger_2024_salt'),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('finledger_salt_v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: 256 },
    false, KEY_USAGE
  );
}

export async function encryptData(data, uid) {
  try {
    const key = await getDerivedKey(uid);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(JSON.stringify(data)));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (e) {
    console.error('Encrypt error:', e);
    return JSON.stringify(data); // fallback
  }
}

export async function decryptData(encryptedStr, uid) {
  try {
    const key = await getDerivedKey(uid);
    const combined = new Uint8Array(atob(encryptedStr).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    try { return JSON.parse(encryptedStr); } catch { return encryptedStr; }
  }
}

// Session ID generator (Google Authenticator style TOTP-like token)
export function generateSessionId(uid) {
  const timestamp = Math.floor(Date.now() / 30000); // 30-second window
  const data = `${uid}_${timestamp}_finledger`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
}

// Format currency
export function fmtINR(n) {
  if (n === undefined || n === null || isNaN(n)) return '₹0';
  return '₹' + Math.abs(Number(n)).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function fmtDate(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtMonth(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
