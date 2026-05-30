import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSessionInfo, sessionExpiryLabel } from '../utils/jwtSession';
import { ArrowLeft, User, Mail, Lock, Shield, Eye, EyeOff, Check, AlertTriangle, LogOut, Trash2, RefreshCw, Key } from 'lucide-react';

const FIREBASE_ERRORS = {
  'auth/wrong-password': 'Incorrect current password.',
  'auth/weak-password': 'New password must be at least 6 characters.',
  'auth/email-already-in-use': 'That email belongs to another account.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/requires-recent-login': 'Your session is old. Please sign out and sign in again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
  'auth/user-mismatch': 'Google account does not match the current user.',
};

function mapError(err) {
  return FIREBASE_ERRORS[err.code] || err.message;
}

function Toast({ type, message, onClose }) {
  if (!message) return null;

  const styles = {
    success: { background: 'rgba(48,209,88,.1)', border: '1px solid rgba(48,209,88,.25)', color: '#25a244' },
    error: { background: 'rgba(255,69,58,.1)', border: '1px solid rgba(255,69,58,.25)', color: '#d93025' },
    info: { background: 'rgba(0,122,255,.08)', border: '1px solid rgba(0,122,255,.2)', color: '#0055cc' },
  };
  const s = styles[type] || styles.info;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', borderRadius: 10, marginBottom: 16, ...s }}>
      {type === 'success' && <Check size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
      {type === 'error' && <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'currentColor', cursor: 'pointer', opacity: 0.6, padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

function SectionCard({ title, subtitle, icon: Icon, iconColor = '#007aff', children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)', boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '15px 22px 13px', borderBottom: '1px solid rgba(0,0,0,.06)', display: 'flex', alignItems: 'center', gap: 11 }}>
        {Icon && (
          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${iconColor}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={16} color={iconColor} />
          </div>
        )}
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: '#636366', marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#636366', marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: '#ff453a', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11.5, color: '#aeaeb2', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function TextInput({ label, required, hint, type = 'text', value, onChange, placeholder, disabled }) {
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} required={required} hint={hint}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '9px 13px',
          background: disabled ? 'rgba(118,118,128,.06)' : 'rgba(118,118,128,.07)',
          border: `1.5px solid ${focused ? '#007aff' : 'rgba(0,0,0,.1)'}`,
          boxShadow: focused ? '0 0 0 3px rgba(0,122,255,.09)' : 'none',
          borderRadius: 10, fontSize: 14, color: '#1c1c1e',
          outline: 'none', fontFamily: 'inherit', transition: 'all .15s',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </Field>
  );
}

function PasswordInput({ label, required, hint, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Field label={label} required={required} hint={hint}>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '••••••••'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '9px 40px 9px 13px',
            background: 'rgba(118,118,128,.07)',
            border: `1.5px solid ${focused ? '#007aff' : 'rgba(0,0,0,.1)'}`,
            boxShadow: focused ? '0 0 0 3px rgba(0,122,255,.09)' : 'none',
            borderRadius: 10, fontSize: 14, color: '#1c1c1e',
            outline: 'none', fontFamily: 'inherit', transition: 'all .15s',
          }}
        />
        <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8e8e93', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </Field>
  );
}

function ActionButton({ children, onClick, variant = 'primary', loading, disabled, fullWidth, icon: Icon }) {
  const [hovered, setHovered] = useState(false);

  const variantStyles = {
    primary: { background: '#007aff', color: '#fff', border: 'none' },
    secondary: { background: hovered ? 'rgba(118,118,128,.14)' : 'rgba(118,118,128,.1)', color: '#1c1c1e', border: 'none' },
    danger: { background: hovered ? 'rgba(255,69,58,.14)' : 'rgba(255,69,58,.09)', color: '#ff453a', border: '1px solid rgba(255,69,58,.2)' },
    success: { background: hovered ? 'rgba(48,209,88,.16)' : 'rgba(48,209,88,.1)', color: '#25a244', border: '1px solid rgba(48,209,88,.25)' },
  };

  const s = variantStyles[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 16px', borderRadius: 10,
        fontSize: 13.5, fontWeight: 600,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : 'auto',
        fontFamily: 'inherit', transition: 'all .15s',
        ...s,
      }}
    >
      {loading ? (
        <span style={{ width: 13, height: 13, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite', opacity: 0.7 }} />
      ) : Icon ? <Icon size={13} /> : null}
      {children}
    </button>
  );
}

function PasswordStrength({ value }) {
  if (!value) return null;
  const checks = [
    { label: '8+ chars', ok: value.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(value) },
    { label: 'Number', ok: /[0-9]/.test(value) },
    { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(value) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['#ff453a', '#ff9f0a', '#30d158', '#0a84ff'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];
  const color = colors[score - 1] || '#aeaeb2';
  const label = labels[score - 1] || '';

  return (
    <div style={{ marginTop: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? color : 'rgba(0,0,0,.08)', transition: 'background .2s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {score > 0 && <span style={{ fontSize: 11.5, fontWeight: 600, color }}>{label}</span>}
        {checks.map(c => (
          <span key={c.label} style={{ fontSize: 11, color: c.ok ? '#25a244' : '#aeaeb2', display: 'flex', alignItems: 'center', gap: 3 }}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
      <span style={{ fontSize: 13.5, color: '#636366' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: color || '#1c1c1e', fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  );
}

export default function AccountSettings({ onBack }) {
  const { user, updateDisplayName, changeEmail, changePassword, setNewPassword, resetPassword, logout, deleteAccount, isGoogleUser } = useAuth();

  const googleUser = isGoogleUser();
  const session = getSessionInfo();

  // Display name
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState({ type: '', text: '' });

  // Email
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState({ type: '', text: '' });

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ type: '', text: '' });

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState({ type: '', text: '' });

  const nameChanged = displayName.trim() !== (user?.displayName || '');
  const emailChanged = newEmail.trim() !== (user?.email || '');

  async function saveName() {
    if (!displayName.trim()) { setNameMsg({ type: 'error', text: 'Name cannot be empty.' }); return; }
    setNameSaving(true);
    setNameMsg({ type: '', text: '' });
    try {
      await updateDisplayName(displayName.trim());
      setNameMsg({ type: 'success', text: 'Display name updated successfully.' });
    } catch (err) {
      setNameMsg({ type: 'error', text: mapError(err) });
    } finally {
      setNameSaving(false);
    }
  }

  async function saveEmail() {
    if (!newEmail.trim()) { setEmailMsg({ type: 'error', text: 'Email cannot be empty.' }); return; }
    if (!emailPassword) { setEmailMsg({ type: 'error', text: 'Please enter your current password to confirm.' }); return; }
    setEmailSaving(true);
    setEmailMsg({ type: '', text: '' });
    try {
      await changeEmail(newEmail.trim(), emailPassword);
      setEmailPassword('');
      setEmailMsg({ type: 'success', text: 'Email updated. Please verify your new email address.' });
    } catch (err) {
      setEmailMsg({ type: 'error', text: mapError(err) });
    } finally {
      setEmailSaving(false);
    }
  }

  async function savePassword() {
    if (!newPw) { setPwMsg({ type: 'error', text: 'Enter a new password.' }); return; }
    if (newPw.length < 6) { setPwMsg({ type: 'error', text: 'Password must be at least 6 characters.' }); return; }
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    if (!googleUser && !currentPw) { setPwMsg({ type: 'error', text: 'Enter your current password.' }); return; }
    setPwSaving(true);
    setPwMsg({ type: '', text: '' });
    try {
      if (googleUser) await setNewPassword(newPw);
      else await changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ type: 'success', text: 'Password changed successfully. Your session has been refreshed.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: mapError(err) });
    } finally {
      setPwSaving(false);
    }
  }

  async function sendResetEmail() {
    try {
      await resetPassword(user.email);
      setPwMsg({ type: 'success', text: `Password reset link sent to ${user.email}. Check your inbox.` });
    } catch (err) {
      setPwMsg({ type: 'error', text: mapError(err) });
    }
  }

  async function doDeleteAccount() {
    if (deleteConfirmText !== 'DELETE') { setDeleteMsg({ type: 'error', text: 'Type DELETE (uppercase) to confirm.' }); return; }
    if (!googleUser && !deletePassword) { setDeleteMsg({ type: 'error', text: 'Enter your password to confirm.' }); return; }
    setDeleting(true);
    setDeleteMsg({ type: '', text: '' });
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      setDeleteMsg({ type: 'error', text: mapError(err) });
      setDeleting(false);
    }
  }

  const initial = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div style={{ minHeight: '100vh', background: '#f2f2f7', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif', WebkitFontSmoothing: 'antialiased' }}>

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,.08)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 99 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#007aff', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: 0 }}>
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.02em' }}>Account Settings</span>
        </div>
        <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.2)', borderRadius: 8, color: '#ff453a', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <LogOut size={13} /> Sign Out
        </button>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* Profile hero */}
        <div style={{ background: 'linear-gradient(135deg,#007aff,#5856d6)', borderRadius: 20, padding: '24px 26px 22px', marginBottom: 20, position: 'relative', overflow: 'hidden', boxShadow: '0 8px 28px rgba(0,122,255,.28)' }}>
          <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.07)', top: -70, right: -40 }} />
          <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.05)', bottom: -30, left: 40 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,.2)', border: '2.5px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {user?.photoURL ? <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 2 }}>{user?.displayName || 'User'}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(255,255,255,.15)', fontSize: 11.5, fontWeight: 600, color: '#fff' }}>
                  {googleUser ? '🔑 Google Account' : '✉️ Email Account'}
                </div>
                {session && (
                  <div style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(48,209,88,.2)', fontSize: 11.5, fontWeight: 600, color: '#c8ffd4' }}>
                    🔒 JWT · {sessionExpiryLabel()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Display Name */}
        <SectionCard title="Display Name" subtitle="Your name shown across all 3 apps" icon={User} iconColor="#007aff">
          <Toast type={nameMsg.type} message={nameMsg.text} onClose={() => setNameMsg({ type: '', text: '' })} />
          <TextInput label="Full Name" required value={displayName} onChange={setDisplayName} placeholder="Your full name" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton onClick={saveName} loading={nameSaving} disabled={!nameChanged} variant="primary" icon={Check}>
              Save Name
            </ActionButton>
          </div>
        </SectionCard>

        {/* Email — email accounts only */}
        {!googleUser && (
          <SectionCard title="Email Address" subtitle="Update your login email address" icon={Mail} iconColor="#5856d6">
            <Toast type={emailMsg.type} message={emailMsg.text} onClose={() => setEmailMsg({ type: '', text: '' })} />
            <TextInput
              label="Email Address" type="email" required
              value={newEmail} onChange={setNewEmail}
              hint="You'll receive a verification email at the new address."
            />
            {emailChanged && (
              <PasswordInput
                label="Current Password (to confirm)" required
                value={emailPassword} onChange={setEmailPassword}
              />
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ActionButton onClick={saveEmail} loading={emailSaving} disabled={!emailChanged} variant="primary" icon={Check}>
                Update Email
              </ActionButton>
            </div>
          </SectionCard>
        )}

        {/* Password */}
        <SectionCard
          title="Password"
          subtitle={googleUser ? 'Set a password to also allow email login' : 'Change your login password'}
          icon={Lock}
          iconColor="#ff9f0a"
        >
          <Toast type={pwMsg.type} message={pwMsg.text} onClose={() => setPwMsg({ type: '', text: '' })} />

          {googleUser && (
            <div style={{ padding: '10px 13px', background: 'rgba(0,122,255,.07)', border: '1px solid rgba(0,122,255,.15)', borderRadius: 9, fontSize: 13, color: '#0055cc', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={14} />
              Signed in with Google. You can set a password to also enable email + password login.
            </div>
          )}

          {!googleUser && (
            <PasswordInput label="Current Password" required value={currentPw} onChange={setCurrentPw} />
          )}

          <PasswordInput label="New Password" required value={newPw} onChange={setNewPw} placeholder="At least 6 characters" />
          <PasswordStrength value={newPw} />

          <div style={{ marginTop: 12 }}>
            <PasswordInput label="Confirm New Password" required value={confirmPw} onChange={setConfirmPw} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            {!googleUser && (
              <button onClick={sendResetEmail} style={{ background: 'none', border: 'none', color: '#007aff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
                <RefreshCw size={12} /> Send reset link to email instead
              </button>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <ActionButton onClick={savePassword} loading={pwSaving} disabled={!newPw || !confirmPw} variant="primary" icon={Key}>
                {googleUser ? 'Set Password' : 'Change Password'}
              </ActionButton>
            </div>
          </div>
        </SectionCard>

        {/* Session Info */}
        <SectionCard title="Session & Security" subtitle="Current JWT session details" icon={Shield} iconColor="#10b981">
          <InfoRow label="Session Type" value="JWT (HS256)" />
          <InfoRow label="Session Binding" value="Browser + User fingerprint" />
          {session && (
            <>
              <InfoRow label="JWT ID (jti)" value={session.jti?.slice(0, 16) + '…'} mono />
              <InfoRow label="Session Expires" value={sessionExpiryLabel()} color={session.exp - Math.floor(Date.now()/1000) < 1800 ? 'var(--red)' : 'var(--green-dark)'} />
              <InfoRow label="Issued At" value={new Date(session.iat * 1000).toLocaleTimeString('en-IN')} />
            </>
          )}
        </SectionCard>

        {/* Account Info */}
        <SectionCard title="Account Information" subtitle="Read-only details about your account" icon={User} iconColor="#636366">
          <InfoRow label="Account Type" value={googleUser ? 'Google Sign-In' : 'Email & Password'} />
          <InfoRow label="Email Verified" value={user?.emailVerified ? '✓ Verified' : '✗ Not Verified'} color={user?.emailVerified ? '#25a244' : '#ff453a'} />
          <InfoRow label="User ID" value={user?.uid?.slice(0, 20) + '…'} mono />
          <InfoRow label="Member Since" value={user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
          <InfoRow label="Last Sign In" value={user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
        </SectionCard>

        {/* Danger zone */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid rgba(255,69,58,.2)', boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <div style={{ padding: '15px 22px 13px', borderBottom: '1px solid rgba(255,69,58,.1)', display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,69,58,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={16} color="#ff453a" />
            </div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: '#ff453a' }}>Danger Zone</div>
              <div style={{ fontSize: 12, color: '#636366', marginTop: 2 }}>These actions are permanent and cannot be undone</div>
            </div>
          </div>

          <div style={{ padding: '18px 22px' }}>
            {!deleteOpen ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', marginBottom: 4 }}>Delete Account</div>
                  <div style={{ fontSize: 13, color: '#636366', lineHeight: 1.55, maxWidth: 380 }}>
                    Permanently remove your account. Your data in Firebase will remain but you will lose access immediately.
                  </div>
                </div>
                <ActionButton variant="danger" onClick={() => setDeleteOpen(true)} icon={Trash2}>
                  Delete Account
                </ActionButton>
              </div>
            ) : (
              <>
                <Toast type={deleteMsg.type} message={deleteMsg.text} onClose={() => setDeleteMsg({ type: '', text: '' })} />
                <div style={{ padding: '10px 13px', background: 'rgba(255,69,58,.07)', borderRadius: 9, marginBottom: 14, fontSize: 13, color: '#d93025', fontWeight: 500 }}>
                  ⚠️ This is permanent. You will be logged out immediately and cannot recover your account.
                </div>
                {!googleUser && (
                  <PasswordInput label="Current Password" required value={deletePassword} onChange={setDeletePassword} placeholder="Enter your password to confirm" />
                )}
                <TextInput label='Type DELETE to confirm' required value={deleteConfirmText} onChange={setDeleteConfirmText} placeholder="DELETE" />
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <ActionButton variant="secondary" onClick={() => { setDeleteOpen(false); setDeletePassword(''); setDeleteConfirmText(''); setDeleteMsg({ type: '', text: '' }); }}>
                    Cancel
                  </ActionButton>
                  <ActionButton variant="danger" onClick={doDeleteAccount} loading={deleting} disabled={deleteConfirmText !== 'DELETE'} icon={Trash2}>
                    Delete My Account
                  </ActionButton>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ height: 40 }} />
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
