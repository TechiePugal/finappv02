import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Fld, Inp, PwInp, Btn, Alert } from '../../components/realestate/UI';
import { Building2 } from 'lucide-react';

const ERR = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'Email already registered.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/too-many-requests': 'Too many attempts. Please try later.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
};

export default function AuthPage() {
  const { signInGoogle, signInEmail, signUp, resetPw } = useAuth();
  const [tab, setTab] = useState('in');
  const [f, setF] = useState({ email:'', pw:'', pw2:'', name:'' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const upd = (k, v) => { setF(p => ({ ...p, [k]: v })); setErr(''); };
  const fe = code => ERR[code] || 'Something went wrong. Try again.';

  async function handleGoogle() {
    setBusy(true); setErr('');
    try { await signInGoogle(); }
    catch (e) { setErr(fe(e.code)); }
    finally { setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr(''); setOk('');
    try {
      if (tab === 'in') await signInEmail(f.email, f.pw);
      else if (tab === 'up') {
        if (!f.name.trim()) { setErr('Full name is required.'); return; }
        if (f.pw !== f.pw2) { setErr('Passwords do not match.'); return; }
        await signUp(f.email, f.pw, f.name);
      } else {
        await resetPw(f.email);
        setOk('Reset email sent. Check your inbox.');
      }
    } catch (e) { setErr(fe(e.code)); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-card">
        <div className="auth-logo"><Building2 size={30} color="white" /></div>
        <div style={{ textAlign:'center', marginBottom:22 }}>
          <h1 style={{ fontSize:22, fontWeight:800, letterSpacing:-.4 }}>Layout ERP</h1>
          <p style={{ fontSize:13.5, color:'var(--text2)', marginTop:3 }}>Real Estate Development Manager</p>
        </div>

        {tab !== 'reset' && (
          <div className="auth-tabs">
            {[['in','Sign In'],['up','Sign Up']].map(([k,l]) => (
              <button key={k} className={`auth-tab ${tab===k?'active':''}`} onClick={() => { setTab(k); setErr(''); setOk(''); }}>{l}</button>
            ))}
          </div>
        )}

        {err && <Alert type="e">{err}</Alert>}
        {ok  && <Alert type="s">{ok}</Alert>}

        {tab !== 'reset' && (
          <>
            <button className="google-btn" onClick={handleGoogle} disabled={busy}>
              <svg width="17" height="17" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
                <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
                <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.31z"/>
              </svg>
              Continue with Google
            </button>
            <div className="divider-lbl">or</div>
          </>
        )}

        <form onSubmit={submit}>
          {tab === 'up' && <FormField label="Full Name" required><Input value={f.name} onChange={e=>upd('name',e.target.value)} placeholder="John Smith" required /></FormField>}
          <FormField label="Email" required><Input type="email" value={f.email} onChange={e=>upd('email',e.target.value)} placeholder="you@company.com" required /></FormField>
          {tab !== 'reset' && <FormField label="Password" required><PwInp value={f.pw} onChange={e=>upd('pw',e.target.value)} placeholder={tab==='up'?'Min. 6 characters':'Password'} required /></FormField>}
          {tab === 'up' && <FormField label="Confirm Password" required><PwInp value={f.pw2} onChange={e=>upd('pw2',e.target.value)} placeholder="Repeat password" required /></FormField>}
          {tab === 'in' && (
            <div style={{ textAlign:'right', marginTop:-6, marginBottom:14 }}>
              <button type="button" style={{ background:'none', border:'none', color:'var(--blue)', fontSize:12.5, cursor:'pointer' }}
                onClick={() => { setTab('reset'); setErr(''); }}>Forgot password?</button>
            </div>
          )}
          <Button type="submit" loading={busy} style={{ width:'100%', padding:12, fontSize:15 }}>
            {tab==='in'?'Sign In':tab==='up'?'Create Account':'Send Reset Email'}
          </Button>
          {tab==='reset' && (
            <button type="button" style={{ width:'100%', marginTop:10, background:'none', border:'none', color:'var(--blue)', fontSize:13.5, cursor:'pointer', padding:8 }}
              onClick={() => { setTab('in'); setErr(''); setOk(''); }}>← Back to Sign In</button>
          )}
        </form>
      </div>
    </div>
  );
}
