/**
 * Chitfund Sidebar — matches Finance Ledger UI theme exactly.
 * Light background, iOS-style blue accent (#0a84ff), clean Apple-inspired look.
 *
 * Two chit types clearly separated in nav:
 *   FORMED CHITS  — chits you manage (full ERP: auctions, members, ledger)
 *   JOINED CHITS  — chits you participate in (track only: payments, status)
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logOut } from '../../firebase/config';
import { clearSession } from '../../utils/cf_security';
import { cacheClear } from '../../utils/cf_cache';
import { useAuth } from '../../contexts/AuthContext';

// ── Matches Finance Ledger color tokens exactly ───────────────────────────────
const ACCENT  = '#0a84ff';   // iOS blue — same as FL
const BG      = 'rgba(255,255,255,0.92)';
const BG_ACT  = '#EBF5FF';
const BORDER  = '#E5E9F2';
const DIVIDER = '#F0F3F8';
const TEXT    = '#111928';
const TEXT2   = '#6B7280';
const TEXT3   = '#9CA3AF';

// ── Nav structure: two clearly separated sections ────────────────────────────
const GROUPS = [
  {
    label: 'Overview',
    items: [
      { path:'/cf',            exact:true, label:'Dashboard',    icon:'dashboard' },
      { path:'/cf/projection', label:'Fund Projection',          icon:'projection' },
      { path:'/cf/calendar',   label:'Calendar',                 icon:'calendar' },
    ],
  },
  {
    // Formed Chits: chits you created and manage — FULL ERP control
    label: 'Formed Chits (You Manage)',
    items: [
      { path:'/cf/chits',           label:'Manage Chit Funds',  icon:'chits' },
      { path:'/cf/auctions',        label:'All Auctions',       icon:'auctions' },
      { path:'/cf/commission-calc', label:'Commission Calc',    icon:'calc' },
      { path:'/cf/exposure',        label:'Exposure & Risk',    icon:'exposure' },
      { path:'/cf/ledger',          label:'Ledger',             icon:'ledger' },
    ],
  },
  {
    // Joined Chits: chits you joined as a member — track only
    label: 'Joined Chits (You Joined)',
    items: [
      { path:'/cf/other-chits',     label:'My Joined Chits',   icon:'other' },
    ],
  },
];

function NavIcon({ type }) {
  const s = { width:16, height:16, flexShrink:0 };
  const icons = {
    dashboard:  <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>,
    chits:      <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3V2M11 3V2M2 7h12"/></svg>,
    auctions:   <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>,
    members:    <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="3"/><path d="M1 14c0-3 2-5 5-5M11 10l2 2 3-3"/></svg>,
    calendar:   <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="13" rx="1.5"/><path d="M5 1v2M11 1v2M1 6h14"/></svg>,
    projection: <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="1,12 5,7 9,9 15,3"/><polyline points="11,3 15,3 15,7"/></svg>,
    ledger:     <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h6l4 4v8H2V2z"/><path d="M8 2v4h4"/><path d="M4 9h6M4 12h4"/></svg>,
    exposure:   <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1v14M1 5l7-4 7 4M1 9h14"/></svg>,
    calc:       <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="1" width="12" height="14" rx="1.5"/><path d="M5 5h6M5 8h2M9 8h2M5 11h2M9 11h2"/></svg>,
    other:      <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M10 11l2 2M12 11l-2 2"/></svg>,
    logout:     <svg {...s} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 14H2V2h4M11 11l3-3-3-3M14 8H6"/></svg>,
  };
  return icons[type] || icons.dashboard;
}

export default function Sidebar() {
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [hoverId, setHoverId] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try { clearSession(); cacheClear(); await logOut(); nav('/'); }
    catch { setLoggingOut(false); }
  }

  function isActive(path, exact) {
    if (exact) return loc.pathname === path;
    return loc.pathname === path || loc.pathname.startsWith(path + '/');
  }

  const initials = (user?.displayName || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <aside style={{
      width: 240, height:'100%', display:'flex', flexDirection:'column',
      background: BG,
      backdropFilter:'blur(24px) saturate(180%)',
      WebkitBackdropFilter:'blur(24px) saturate(180%)',
      borderRight:`1px solid ${BORDER}`,
    }}>
      {/* Brand — matches FL brand style */}
      <div style={{ padding:'16px 16px 14px', borderBottom:`1px solid ${DIVIDER}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:ACCENT,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
            boxShadow:`0 2px 8px ${ACCENT}40` }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <path d="M3 15L7 8l4 4 3-5 3 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="4" cy="10" r="2" fill="white" opacity=".8"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:TEXT, letterSpacing:'-.3px' }}>ChitFlow</div>
            <div style={{ fontSize:10, color:TEXT3, letterSpacing:'.04em', marginTop:1 }}>Fund Manager</div>
          </div>
        </div>
      </div>

      {/* Nav groups */}
      <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
        {GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom:4 }}>
            {/* Group label */}
            <div style={{ padding:'10px 16px 4px', fontSize:10, fontWeight:700,
              color: group.label.includes('Formed') ? '#1A56DB'
                   : group.label.includes('Joined') ? '#057A55'
                   : TEXT3,
              textTransform:'uppercase', letterSpacing:'.06em' }}>
              {group.label}
            </div>

            {group.items.map(item => {
              const active = isActive(item.path, item.exact);
              const hov = hoverId === item.path && !active;
              return (
                <button key={item.path}
                  onClick={() => nav(item.path)}
                  onMouseEnter={() => setHoverId(item.path)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    width:'100%', display:'flex', alignItems:'center', gap:10,
                    padding:'8px 16px', border:'none', cursor:'pointer',
                    background: active ? BG_ACT : hov ? '#F4F6FB' : 'transparent',
                    color: active ? ACCENT : hov ? TEXT : TEXT2,
                    fontWeight: active ? 600 : 400,
                    fontSize:13.5, fontFamily:'inherit', textAlign:'left',
                    transition:'all .12s',
                    borderLeft:`3px solid ${active ? ACCENT : 'transparent'}`,
                    marginBottom:1,
                  }}>
                  <span style={{ color:'inherit', display:'flex', flexShrink:0 }}>
                    <NavIcon type={item.icon}/>
                  </span>
                  <span style={{ flex:1 }}>{item.label}</span>
                  {active && (
                    <div style={{ width:6, height:6, borderRadius:'50%',
                      background:ACCENT, flexShrink:0 }}/>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User footer — matches FL layout footer */}
      <div style={{ padding:'10px 12px 14px', borderTop:`1px solid ${DIVIDER}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
          borderRadius:10, background:'#F8FAFC', marginBottom:8,
          border:`1px solid ${BORDER}` }}>
          <div style={{ width:30, height:30, borderRadius:'50%', background:ACCENT,
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontSize:11, fontWeight:700, flexShrink:0 }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover' }}/>
              : initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12.5, fontWeight:600, color:TEXT,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.displayName || user?.email?.split('@')[0] || 'User'}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:1 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'#22c55e' }}/>
              <span style={{ fontSize:10, color:TEXT3 }}>Active session</span>
            </div>
          </div>
        </div>
        <button onClick={handleLogout} disabled={loggingOut}
          style={{ width:'100%', display:'flex', alignItems:'center', gap:8,
            padding:'7px 10px', borderRadius:8, border:`1px solid ${BORDER}`,
            background:'transparent', color:TEXT2, cursor:'pointer',
            fontSize:12.5, fontFamily:'inherit', transition:'all .13s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(220,38,38,0.3)'; e.currentTarget.style.color='#C81E1E'; e.currentTarget.style.background='#FDE8E8'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor=BORDER; e.currentTarget.style.color=TEXT2; e.currentTarget.style.background='transparent'; }}>
          <NavIcon type="logout"/>
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
