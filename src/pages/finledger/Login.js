import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../../firebase/config';
import { generateSessionId } from '../../utils/fl_crypto';
import toast from 'react-hot-toast';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleEmailAuth(e) {
    e.preventDefault();
    if (mode === 'signup' && password !== confirmPassword) return toast.error('Passwords do not match');
    if (mode !== 'reset' && password.length < 6) return toast.error('Password must be at least 6 characters');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        sessionStorage.setItem('fin_sid', generateSessionId(user.uid));
        toast.success('Account created! Welcome to FinLedger.');
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        toast.success('Password reset email sent!');
        setMode('signin');
      } else {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        sessionStorage.setItem('fin_sid', generateSessionId(user.uid));
        toast.success('Welcome back!');
      }
    } catch (err) {
      const msgs = { 'auth/user-not-found':'No account with this email', 'auth/wrong-password':'Incorrect password', 'auth/email-already-in-use':'Email already registered', 'auth/invalid-credential':'Invalid email or password', 'auth/too-many-requests':'Too many attempts. Try later.' };
      toast.error(msgs[err.code] || 'Authentication failed');
    } finally { setLoading(false); }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      googleProvider.addScope('email');
      const { user } = await signInWithPopup(auth, googleProvider);
      sessionStorage.setItem('fin_sid', generateSessionId(user.uid));
      toast.success('Welcome, ' + (user.displayName?.split(' ')[0] || 'there') + '!');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') toast.error('Google sign-in failed');
    } finally { setGoogleLoading(false); }
  }

  const focusStyle = { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px rgba(0,122,255,0.15)' };
  const blurStyle = { borderColor: 'rgba(0,0,0,0.1)', boxShadow: 'none' };

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', position:'relative', overflow:'hidden', padding:20 }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,122,255,0.08), transparent 60%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)', backgroundSize:'28px 28px', pointerEvents:'none' }}/>

      <div style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1, animation:'fadeUp 0.5s ease both' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28, justifyContent:'center' }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(0,122,255,0.3)' }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><path d="M8 20L14 10L20 17L23 13L26 20H8Z" fill="white" opacity="0.9"/><circle cx="10" cy="13" r="2.5" fill="white"/></svg>
          </div>
          <div>
            <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em', lineHeight:1 }}>FinLedger</h1>
            <p style={{ color:'var(--text-secondary)', fontSize:12, marginTop:2 }}>Finance Management System</p>
          </div>
        </div>

        <div style={{ background:'rgba(255,255,255,0.92)', backdropFilter:'blur(20px)', border:'1px solid rgba(0,0,0,0.08)', borderRadius:22, padding:'28px', boxShadow:'0 8px 40px rgba(0,0,0,0.1)' }}>
          {mode !== 'reset' && (
            <div style={{ display:'flex', background:'rgba(118,118,128,0.1)', borderRadius:10, padding:3, marginBottom:22 }}>
              {['signin','signup'].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'8px 16px', borderRadius:8, border:'none', background: mode===m ? '#fff' : 'transparent', fontSize:14, fontWeight: mode===m ? 600 : 500, color: mode===m ? 'var(--text-primary)' : 'var(--text-secondary)', cursor:'pointer', boxShadow: mode===m ? '0 1px 4px rgba(0,0,0,0.12)' : 'none', transition:'all 0.2s' }}>
                  {m === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>
          )}

          {mode === 'reset' && (
            <div style={{ marginBottom:20 }}>
              <h2 style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>Reset Password</h2>
              <p style={{ color:'var(--text-secondary)', fontSize:13, marginTop:4 }}>We'll send a reset link to your email</p>
            </div>
          )}

          {mode !== 'reset' && (
            <>
              <button onClick={handleGoogle} disabled={googleLoading}
                style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, width:'100%', padding:'11px 16px', background:'#fff', border:'1px solid rgba(0,0,0,0.12)', borderRadius:12, fontSize:15, fontWeight:500, color:'var(--text-primary)', cursor:'pointer', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:16, transition:'all 0.2s' }}>
                {googleLoading ? <BtnSpinner color="var(--text-primary)"/> : (
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
                  </svg>
                )}
                <span>{googleLoading ? 'Signing in…' : 'Continue with Google'}</span>
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{ flex:1, height:1, background:'rgba(0,0,0,0.08)' }}/>
                <span style={{ color:'var(--text-tertiary)', fontSize:13 }}>or</span>
                <div style={{ flex:1, height:1, background:'rgba(0,0,0,0.08)' }}/>
              </div>
            </>
          )}

          <form onSubmit={handleEmailAuth} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', display:'block', marginBottom:6 }}>Email Address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"
                style={{ padding:'11px 14px', background:'rgba(118,118,128,0.08)', border:'1.5px solid rgba(0,0,0,0.1)', borderRadius:10, fontSize:15, color:'var(--text-primary)', outline:'none', width:'100%', transition:'all 0.2s' }}
                onFocus={e=>Object.assign(e.target.style,focusStyle)} onBlur={e=>Object.assign(e.target.style,blurStyle)}/>
            </div>
            {mode !== 'reset' && (
              <div>
                <label style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', display:'block', marginBottom:6 }}>Password</label>
                <div style={{ position:'relative' }}>
                  <input type={showPass?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required minLength={6}
                    autoComplete={mode==='signin'?'current-password':'new-password'}
                    style={{ padding:'11px 44px 11px 14px', background:'rgba(118,118,128,0.08)', border:'1.5px solid rgba(0,0,0,0.1)', borderRadius:10, fontSize:15, color:'var(--text-primary)', outline:'none', width:'100%', transition:'all 0.2s' }}
                    onFocus={e=>Object.assign(e.target.style,focusStyle)} onBlur={e=>Object.assign(e.target.style,blurStyle)}/>
                  <button type="button" onClick={()=>setShowPass(!showPass)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-secondary)', display:'flex', padding:4 }}>
                    {showPass ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                  </button>
                </div>
              </div>
            )}
            {mode === 'signup' && (
              <div>
                <label style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', display:'block', marginBottom:6 }}>Confirm Password</label>
                <input type={showPass?'text':'password'} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="••••••••" required
                  style={{ padding:'11px 14px', background:'rgba(118,118,128,0.08)', border:'1.5px solid rgba(0,0,0,0.1)', borderRadius:10, fontSize:15, color:'var(--text-primary)', outline:'none', width:'100%', transition:'all 0.2s' }}
                  onFocus={e=>Object.assign(e.target.style,focusStyle)} onBlur={e=>Object.assign(e.target.style,blurStyle)}/>
              </div>
            )}
            {mode === 'signin' && (
              <button type="button" onClick={()=>setMode('reset')} style={{ background:'none', border:'none', color:'var(--accent)', fontSize:13, cursor:'pointer', textAlign:'right' }}>Forgot password?</button>
            )}
            <button type="submit" disabled={loading}
              style={{ marginTop:4, width:'100%', padding:'12px', background:'var(--accent)', border:'none', borderRadius:12, color:'#fff', fontSize:16, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 2px 8px rgba(0,122,255,0.35)', opacity:loading?0.7:1, transition:'all 0.2s' }}>
              {loading ? <BtnSpinner color="#fff"/> : (mode==='signin'?'Sign In':mode==='signup'?'Create Account':'Send Reset Link')}
            </button>
            {mode === 'reset' && (
              <button type="button" onClick={()=>setMode('signin')} style={{ width:'100%', padding:'10px', background:'none', border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, color:'var(--text-secondary)', fontSize:14, cursor:'pointer' }}>← Back to Sign In</button>
            )}
          </form>

          <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center', marginTop:20, color:'var(--text-secondary)', fontSize:11 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            AES-256 encrypted · Session secured · Google Auth
          </div>
        </div>
        <p style={{ textAlign:'center', marginTop:20, color:'var(--text-tertiary)', fontSize:12 }}>FinLedger Pro v2.0 · Secure Finance Management</p>
      </div>
      <style>{'@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} input::placeholder{color:var(--text-tertiary)} button:active{opacity:0.85}'}</style>
    </div>
  );
}

function BtnSpinner({ color }) {
  return <span style={{ width:16, height:16, border:`2px solid ${color}44`, borderTopColor:color, borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }}/>;
}
