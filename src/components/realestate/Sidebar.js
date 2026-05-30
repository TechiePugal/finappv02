import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard, Building2, Users, Wallet, BookOpen,
  BarChart3, UserCheck, LogOut, Settings, MapPin,
} from 'lucide-react';

const NAV = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { key: 'projects',  icon: Building2,       label: 'Projects' },
  { key: 'clients',   icon: Users,           label: 'All Clients' },
  { key: 'investors', icon: UserCheck,       label: 'Investors' },
  { key: 'payments',  icon: Wallet,          label: 'Payments' },
  { key: 'ledger',    icon: BookOpen,        label: 'Finance Ledger' },
  { key: 'reports',   icon: BarChart3,       label: 'Reports' },
  { key: 'account',   icon: Settings,        label: 'Settings' },
];

const SLATE = '#1E2640';
const BLUE  = '#1A56DB';

export default function Sidebar({ active, onChange, onClose }) {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const initials = (user?.displayName || user?.email || 'U').slice(0, 2).toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  function handleNav(key) {
    onChange(key);
    onClose?.();
  }

  return (
    <div style={{
      width: 228, height: '100%',
      display: 'flex', flexDirection: 'column',
      background: SLATE,
    }}>

      {/* ── Logo header ── */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MapPin size={17} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.2px' }}>Layout ERP</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Real Estate</div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '8px 10px 6px' }}>
          Navigation
        </div>
        {NAV.map(item => {
          const isActive = active === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 8, border: 'none',
                cursor: 'pointer',
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13, fontFamily: 'inherit',
                marginBottom: 1,
                transition: 'all 0.13s', textAlign: 'left',
                borderLeft: `3px solid ${isActive ? BLUE : 'transparent'}`,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={15} strokeWidth={isActive ? 2.4 : 2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* ── User footer ── */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, marginBottom: 6 }}>
          {user?.photoURL
            ? <img src={user.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            : <div style={{ width: 30, height: 30, borderRadius: '50%', background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.displayName || 'User'}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: loggingOut ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.13s' }}
          onMouseEnter={e => { if (!loggingOut) { e.currentTarget.style.background = 'rgba(200,30,30,0.15)'; e.currentTarget.style.color = '#FC8181'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
        >
          <LogOut size={13} strokeWidth={2} />
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
