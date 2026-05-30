// src/pages/AuthPage.js
import React, { useState } from 'react';
import { Building2, Eye, EyeOff, Mail, Lock, User, Shield, TrendingUp, BarChart3 } from 'lucide-react';
import { signInWithGoogle, signInEmail, signUpEmail, resetPassword } from '../../firebase/config';
import { tokens, Button, Input, Alert } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

export default function AuthPage() {
  const [tab, setTab] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const errMsg = { 'auth/user-not-found': 'No account with this email.', 'auth/wrong-password': 'Incorrect password.', 'auth/email-already-in-use': 'Email already registered.', 'auth/invalid-email': 'Invalid email address.', 'auth/too-many-requests': 'Too many attempts. Try later.', 'auth/invalid-credential': 'Invalid email or password.' };

  const submit = async () => {
    setError(''); setSuccess('');
    if (!email) return setError('Email is required.');
    if (tab !== 'reset' && !password) return setError('Password is required.');
    if (tab === 'signup' && password.length < 6) return setError('Password must be at least 6 characters.');
    setLoading(true);
    try {
      if (tab === 'signin') await signInEmail(email, password);
      else if (tab === 'signup') await signUpEmail(email, password);
      else { await resetPassword(email); setSuccess('Reset link sent. Check your inbox.'); }
    } catch (e) { setError(errMsg[e.code] || 'Something went wrong. Try again.'); }
    finally { setLoading(false); }
  };

  const googleAuth = async () => {
    setError(''); setGLoading(true);
    try { await signInWithGoogle(); }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user') setError('Google sign-in failed.'); }
    finally { setGLoading(false); }
  };

  const sw = (t) => { setTab(t); setError(''); setSuccess(''); };

  const features = [
    { icon: Building2, text: 'Complete auction lifecycle management' },
    { icon: TrendingUp, text: 'Commission & exposure tracking' },
    { icon: BarChart3, text: 'Month-wise fund projection' },
    { icon: Shield, text: 'AES-256-GCM encrypted storage' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      {/* Left */}
      <div style={{ flex: '0 0 400px', background: tokens.slate, display: 'flex', flexDirection: 'column', padding: '44px 40px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: 'rgba(59,118,239,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(59,118,239,0.06)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: tokens.blue, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={17} color="#fff" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>ChitFlow</span>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.25 }}>Professional Chit Fund Management</h2>
          <p style={{ margin: '0 0 36px', fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>Track every auction, commission, and payment with precision.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={14} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>© 2025 ChitFlow Management System</p>
      </div>

      {/* Right */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tokens.bg, padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          {tab !== 'reset' && (
            <div style={{ display: 'flex', background: '#fff', border: `1px solid ${tokens.border}`, borderRadius: 9, padding: 3, marginBottom: 26 }}>
              {['signin', 'signup'].map(t => (
                <button key={t} onClick={() => sw(t)} style={{ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', fontFamily: 'inherit', background: tab === t ? tokens.blue : 'transparent', color: tab === t ? '#fff' : tokens.textSub, fontSize: 13, fontWeight: tab === t ? 600 : 500, cursor: 'pointer', transition: 'all 0.15s' }}>
                  {t === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
          )}

          <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: tokens.text, letterSpacing: '-0.3px' }}>
            {tab === 'signin' ? 'Welcome back' : tab === 'signup' ? 'Get started' : 'Reset password'}
          </h1>
          <p style={{ margin: '0 0 22px', fontSize: 13, color: tokens.textSub }}>
            {tab === 'signin' ? 'Sign in to your account' : tab === 'signup' ? 'Create your ChitFlow account' : 'Enter your email for a reset link'}
          </p>

          {error && <div style={{ marginBottom: 14 }}><Alert type="error" message={error} onClose={() => setError('')} /></div>}
          {success && <div style={{ marginBottom: 14 }}><Alert type="success" message={success} /></div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: tokens.textMid, display: 'block', marginBottom: 5 }}>Email Address</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" prefix={<Mail size={13} />} onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
            {tab !== 'reset' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: tokens.textMid }}>Password</label>
                  {tab === 'signin' && <button onClick={() => sw('reset')} style={{ background: 'none', border: 'none', color: tokens.blue, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, padding: 0 }}>Forgot?</button>}
                </div>
                <Input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  prefix={<Lock size={13} />}
                  suffix={<button onClick={() => setShowPass(!showPass)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: tokens.textMuted }}>{showPass ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
                  onKeyDown={e => e.key === 'Enter' && submit()} />
              </div>
            )}
          </div>

          <Button variant="primary" size="lg" onClick={submit} loading={loading} style={{ width: '100%', marginTop: 18 }}>
            {tab === 'signin' ? 'Sign In' : tab === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </Button>

          {tab === 'reset' && (
            <button onClick={() => sw('signin')} style={{ display: 'block', background: 'none', border: 'none', color: tokens.blue, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', margin: '13px auto 0', fontWeight: 500, padding: 0 }}>Back to Sign In</button>
          )}

          {tab !== 'reset' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: tokens.border }} />
                <span style={{ fontSize: 11, color: tokens.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>or</span>
                <div style={{ flex: 1, height: 1, background: tokens.border }} />
              </div>
              <button onClick={googleAuth} disabled={gLoading} style={{ width: '100%', height: 40, borderRadius: 8, border: `1.5px solid ${tokens.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: tokens.textMid, cursor: gLoading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: gLoading ? 0.7 : 1 }}
                onMouseEnter={e => { e.currentTarget.style.background = tokens.slateLight; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
                <svg width="15" height="15" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" /><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" /><path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" /><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" /></svg>
                {gLoading ? 'Connecting…' : 'Continue with Google'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
