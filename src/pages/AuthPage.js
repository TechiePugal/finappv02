import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, Zap, Shield } from 'lucide-react';

const ERR_MAP = {
  'auth/popup-closed-by-user':    '',
  'auth/cancelled-popup-request': '',
  'auth/popup-blocked':           'Popup was blocked. Please allow popups for this site and try again.',
  'auth/network-request-failed':  'Network error. Check your connection.',
  'auth/internal-error':          'Something went wrong. Please try again.',
  'auth/too-many-requests':       'Too many attempts. Please wait a moment.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
};

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const FinSuiteLogo = ({ size = 44 }) => (
  <img src="/logo.png" alt="EC Fin 360" style={{ width: size, height: size, borderRadius: size * 0.27, objectFit: 'cover' }} />
);

export default function AuthPage() {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (e) {
      const msg = ERR_MAP[e.code];
      // Empty string means "user dismissed" — show nothing
      if (msg !== '') {
        setError(msg || 'Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.page}>
      {/* Subtle background */}
      <div style={S.bgGrad} />
      <div style={S.bgGrid} />

      <div style={S.wrap}>

        {/* ── LEFT — brand hero ── */}
        <div style={S.left} className="auth-left">

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 52 }}>
            <FinSuiteLogo size={46} />
            <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>EC Fin 360</span>
          </div>

          <h2 style={S.heroHeading}>
            Your complete<br />finance command centre
          </h2>
          <p style={S.heroSub}>
            One platform for real estate development, chit fund operations and lending — built for how Indian businesses actually work.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 44 }}>
            {[
              [BarChart3, 'Real Estate ERP', 'Projects, plots, clients & P&L'],
              [Zap,       'Chit Fund Manager', 'Auctions, members & commission'],
              [Shield,    'Finance Ledger', 'Deposits, loans & interest tracking'],
            ].map(([Icon, title, desc], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color="rgba(255,255,255,0.85)" />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Mini portfolio card */}
          <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '18px 20px', backdropFilter: 'blur(10px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Live Portfolio</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: 2 }}>₹2.4 Cr</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Total managed assets</div>
            <div style={{ display: 'flex', gap: 3, height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 9 }}>
              {[[65, 'rgba(255,255,255,0.82)'], [25, 'rgba(255,255,255,0.44)'], [10, 'rgba(255,255,255,0.20)']].map(([w, c], i) => (
                <div key={i} style={{ width: `${w}%`, background: c, borderRadius: 3 }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              {['Real Estate', 'Chit Fund', 'Lending'].map((l, i) => (
                <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: ['rgba(255,255,255,0.82)', 'rgba(255,255,255,0.44)', 'rgba(255,255,255,0.20)'][i] }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Device limit note */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.32)' }}>Supports up to 4 simultaneous devices per account</span>
          </div>
        </div>

        {/* ── RIGHT — sign-in card ── */}
        <div style={S.right}>

          {/* Mobile logo (hidden on desktop) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 36, justifyContent: 'center' }} className="auth-mobile-logo">
            <FinSuiteLogo size={40} />
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>EC Fin 360</span>
          </div>

          {/* Heading */}
          <h2 style={S.cardTitle}>Welcome to EC Fin 360</h2>
          <p style={S.cardSub}>Sign in with your Google account to continue</p>

          {/* Security badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, marginBottom: 28 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#166534', fontWeight: 500 }}>Secured with JWT · Max 4 devices · 8-hour session</span>
          </div>

          {/* Error message */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '11px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: 20 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* Google sign-in button */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              padding: '14px 20px',
              background: loading ? '#f8fafc' : '#fff',
              border: '1.5px solid #e2e8f0',
              borderRadius: 12,
              fontSize: 15, fontWeight: 600,
              color: '#1e293b',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 2px 8px rgba(0,0,0,0.07)',
              transition: 'all 0.18s',
              fontFamily: 'inherit',
              opacity: loading ? 0.75 : 1,
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)'; }}
          >
            {loading ? (
              <div style={{ width: 20, height: 20, border: '2.5px solid #e2e8f0', borderTopColor: '#4285F4', borderRadius: '50%', animation: 'fsAuthSpin 0.7s linear infinite' }} />
            ) : (
              <GoogleIcon />
            )}
            {loading ? 'Connecting to Google…' : 'Continue with Google'}
          </button>

          {/* Terms note */}
          <p style={{ textAlign: 'center', fontSize: 11.5, color: '#94a3b8', marginTop: 20, lineHeight: 1.6 }}>
            By signing in, you agree to our terms of service.<br />
            Your Google profile is used only for authentication.
          </p>

          {/* App badges */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 28 }}>
            {[
              ['RE', 'linear-gradient(135deg,#1d4ed8,#4c1d95)', 'Real Estate'],
              ['CF', 'linear-gradient(135deg,#f59e0b,#ef4444)', 'Chit Fund'],
              ['FL', 'linear-gradient(135deg,#10b981,#0d9488)', 'Fin Ledger'],
            ].map(([abbr, grad, name]) => (
              <div key={abbr} title={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>{abbr}</div>
                <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 500 }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fsAuthSpin { to { transform: rotate(360deg); } }
        .auth-left { display: flex !important; }
        .auth-mobile-logo { display: none !important; }
        @media (max-width: 780px) {
          .auth-left { display: none !important; }
          .auth-mobile-logo { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

const S = {
  page: {
    minHeight: '100vh',
    background: '#f1f5f9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', sans-serif",
    WebkitFontSmoothing: 'antialiased',
    position: 'relative', overflow: 'hidden',
    padding: '16px',
  },
  bgGrad: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(29,78,216,0.07), transparent 60%), radial-gradient(ellipse 50% 50% at 90% 100%, rgba(76,29,149,0.06), transparent 60%)',
    pointerEvents: 'none',
  },
  bgGrid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px)',
    backgroundSize: '44px 44px',
    pointerEvents: 'none',
  },
  wrap: {
    width: '100%', maxWidth: 920,
    background: '#fff',
    borderRadius: 20,
    boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 20px 60px rgba(0,0,0,0.09)',
    border: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', overflow: 'hidden',
    position: 'relative', zIndex: 1,
    minHeight: 560,
  },
  left: {
    flex: 1,
    background: 'linear-gradient(145deg, #1d4ed8 0%, #4c1d95 58%, #1e1b4b 100%)',
    padding: '40px 36px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    minWidth: 280,
  },
  heroHeading: {
    fontSize: 28, fontWeight: 800, color: '#fff',
    lineHeight: 1.28, letterSpacing: '-0.5px', marginBottom: 14,
  },
  heroSub: {
    fontSize: 13.5, color: 'rgba(255,255,255,0.62)',
    lineHeight: 1.65, marginBottom: 30,
  },
  right: {
    width: 380, flexShrink: 0,
    padding: '44px 40px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    background: '#fff',
  },
  cardTitle: {
    fontSize: 22, fontWeight: 800, color: '#0f172a',
    letterSpacing: '-0.4px', marginBottom: 7,
  },
  cardSub: {
    fontSize: 13.5, color: '#64748b',
    marginBottom: 22,
  },
};
