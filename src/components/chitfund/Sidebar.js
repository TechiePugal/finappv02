// src/components/Sidebar.js
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logOut } from '../../firebase/config';
import { clearSession } from '../../utils/cf_security';
import { cacheClear } from '../../utils/cf_cache';
import { useAuth } from '../../contexts/AuthContext';
import { tokens, LogOut, LayoutDashboard, FileText, Gavel, Users, Calendar, BarChart3, BookOpen, Zap, Building2, Settings } from './UI';

const NAV = [
  { path: '/cf',           icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/cf/chits',      icon: FileText,        label: 'Chit Funds' },
  { path: '/cf/auctions',   icon: Gavel,           label: 'Auctions' },
  { path: '/cf/members',    icon: Users,           label: 'Members' },
  { path: '/cf/calendar',   icon: Calendar,        label: 'Calendar' },
  { path: '/cf/projection', icon: BarChart3,       label: 'Fund Projection' },
  { path: '/cf/ledger',     icon: BookOpen,        label: 'Ledger' },
  { path: '/cf/exposure',   icon: Zap,             label: 'Exposure & Risk' },
  { path: '/cf/commission-calc', icon: BarChart3, label: 'Commission Calc' },
  { path: '/cf/other-chits', icon: Users, label: 'My Chits (Others)' },
  { path: '/cf/settings',   icon: Settings,        label: 'Settings' },
];

export default function Sidebar({ onClose }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleNav = (path) => { nav(path); onClose?.(); };

  const handleLogout = async () => {
    setLoggingOut(true);
    cacheClear(); clearSession();
    await logOut();
  };

  const initials = (user?.displayName || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div style={{ width: 228, height: '100%', display: 'flex', flexDirection: 'column', background: tokens.slate, borderRight: 'none' }}>
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: tokens.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={17} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.2px' }}>ChitFlow</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Management System</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '8px 10px 6px' }}>Navigation</div>
        {NAV.map(item => {
          const active = item.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <button key={item.path} onClick={() => handleNav(item.path)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', color: active ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: active ? 600 : 400, fontSize: 13, fontFamily: 'inherit', marginBottom: 1, transition: 'all 0.13s', textAlign: 'left', borderLeft: `3px solid ${active ? tokens.blue : 'transparent'}` }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <Icon size={15} strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, marginBottom: 6 }}>
          {user?.photoURL
            ? <img src={user.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 30, height: 30, borderRadius: '50%', background: tokens.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.displayName || 'User'}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
          </div>
        </div>
        <button onClick={handleLogout} disabled={loggingOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.13s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,30,30,0.15)'; e.currentTarget.style.color = '#FC8181'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}>
          <LogOut size={13} strokeWidth={2} />
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}
