import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import toast from 'react-hot-toast';

const NAV_GROUPS = [
  { label:'Overview', items:[
    { to:'/fl', label:'Dashboard', 
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill={a?'#0a84ff':'none'} stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
    { to:'/fl/monthly-receivable', label:'Monthly Report',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { to:'/fl/expenses', label:'Finance Expenses',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { to:'/fl/alerts', label:'Alerts',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    { to:'/fl/customers', label:'Users',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },

  ]},
  { label:'Deposits', items:[
        { to:'/fl/depositors', label:'Depositors',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { to:'/fl/depositor-settlement', label:'Settle Interest',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/></svg> },
  ]},
  { label:'Loans', items:[
    { to:'/fl/borrowers', label:'Borrowers',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0"/><path d="M6 10h1M6 14h8"/></svg> },
    { to:'/fl/interest-collection', label:'Collect Interest',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    { to:'/fl/loan-repayment', label:'Loan Repayment',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
  ]},
  { label:'EMI', items:[ // navReorg2
    { to:'/fl/emi-loans', label:'EMI Loans',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 10v4M10 12h4"/></svg> },
      { to:'/fl/emi-alerts', label:'EMI Alerts',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  ]},
  { label:'Reports', items:[
    { to:'/fl/reports', label:'Financial Reports',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><rect x="2" y="2" width="20" height="20" rx="2" fill="none"/></svg> },
    { to:'/fl/journal', label:'Journal',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
  ]},
  { label:'Records', items:[
    { to:'/fl/ledger', label:'Ledger',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
    { to:'/fl/security-documents', label:'Documents',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { to:'/fl/backup', label:'Backup & Restore',
      icon:a=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={a?'#0a84ff':'#8e8e93'} strokeWidth="1.8"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> },
  ]},
];

export default function Layout({ user }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut(auth);
    sessionStorage.removeItem('fin_sid');
    toast.success('Signed out');
    navigate('/');
  }

  const initial  = user?.displayName?.[0] || user?.email?.[0]?.toUpperCase() || 'U';
  const userName = user?.displayName || user?.email?.split('@')[0] || 'Admin';
  const allItems = NAV_GROUPS.flatMap(g=>g.items);
  const currentItem = allItems.find(n => n.to==='/fl' ? location.pathname==='/fl' : location.pathname.startsWith(n.to));

  const sidebarContent = (
    <aside style={{
      width: 240, background:'rgba(255,255,255,0.82)',
      backdropFilter:'blur(24px) saturate(180%)', WebkitBackdropFilter:'blur(24px) saturate(180%)',
      borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column',
      flexShrink:0, overflowY:'auto', height:'100%',
    }}>
      {/* Brand */}
      <div style={{ padding:'16px 14px 12px', borderBottom:'1px solid var(--divider)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'var(--accent)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 3px 10px rgba(10,132,255,0.35)', flexShrink:0 }}>
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M7 21L13 10L20 18L23 13L26 21H7Z" fill="white" opacity="0.95"/>
              <circle cx="10" cy="13" r="2.5" fill="white"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize:15, fontWeight:800, color:'var(--text-primary)', letterSpacing:'-0.02em', lineHeight:1 }}>FinLedger</p>
            <p style={{ fontSize:10, color:'var(--text-secondary)', marginTop:2, fontWeight:500 }}>Finance Management</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'8px 8px 4px' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom:4 }}>
            <p style={{ fontSize:10, fontWeight:700, color:'var(--text-tertiary)', textTransform:'uppercase',
              letterSpacing:'0.09em', padding:'8px 10px 4px' }}>
              {group.label}
            </p>
            {group.items.map(item => (
              <NavLink key={item.to} to={item.to} end={item.exact}
                onClick={()=>setMobileOpen(false)}
                style={({ isActive }) => ({
                  display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
                  borderRadius:'var(--r-sm)',
                  background: isActive ? 'rgba(10,132,255,0.09)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  fontWeight: isActive ? 600 : 400, fontSize:13.5,
                  marginBottom:1, transition:'all 0.15s var(--ease)', textDecoration:'none',
                })}>
                {({ isActive }) => <>
                  {item.icon(isActive)}
                  <span>{item.label}</span>
                  {isActive && <div style={{ marginLeft:'auto', width:5, height:5, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }}/>}
                </>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div style={{ padding:'10px 8px 12px', borderTop:'1px solid var(--divider)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 10px',
          borderRadius:'var(--r-sm)', background:'rgba(118,118,128,0.06)' }}>
          <div style={{ width:30, height:30, borderRadius:9, flexShrink:0, overflow:'hidden',
            background:'linear-gradient(135deg, var(--accent) 0%, var(--indigo) 100%)',
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontWeight:700, fontSize:12 }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:30, height:30, objectFit:'cover' }}/>
              : initial}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName}</p>
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:1 }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--green)' }}/>
              <p style={{ fontSize:10, color:'var(--text-secondary)' }}>Secure session</p>
            </div>
          </div>
          <button onClick={handleSignOut} title="Sign out"
            style={{ background:'none', border:'none', color:'var(--text-tertiary)', cursor:'pointer',
              padding:5, borderRadius:6, display:'flex', transition:'color 0.15s', flexShrink:0 }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--red)'}
            onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', overflow:'hidden' }}>

      {/* Desktop sidebar */}
      <div style={{ display:'flex' }} className="desktop-sidebar">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(2px)' }} onClick={()=>setMobileOpen(false)}/>
          <div style={{ position:'relative', zIndex:1, width:240, height:'100%', overflowY:'auto' }}>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* Topbar */}
        <header style={{
          height:56, background:'rgba(255,255,255,0.88)', backdropFilter:'blur(16px)',
          WebkitBackdropFilter:'blur(16px)', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', padding:'0 22px', position:'sticky', top:0, zIndex:50, gap:12,
        }}>
          {/* Mobile menu button */}
          <button onClick={()=>setMobileOpen(true)}
            style={{ display:'none', background:'none', border:'none', cursor:'pointer', padding:6, borderRadius:8, color:'var(--text-primary)' }}
            className="mobile-menu-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <p style={{ fontSize:16, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.015em', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {currentItem?.label || 'FinLedger Pro'}
          </p>

          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            <div style={{ padding:'4px 10px', background:'rgba(48,209,88,0.09)', border:'1px solid rgba(48,209,88,0.22)',
              borderRadius:'var(--r-full)', display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)', boxShadow:'0 0 5px rgba(48,209,88,0.6)' }}/>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--green-dark)', display:'none' }} className="badge-text">AES-256 Secure</span>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--green-dark)' }}>Secure</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ flex:1, padding:'22px 24px', overflowX:'hidden' }}>
          <Outlet/>
        </div>
      </main>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
        @media (max-width: 640px) {
          .grid-4 { grid-template-columns: 1fr 1fr !important; }
          .grid-3 { grid-template-columns: 1fr 1fr !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 400px) {
          .grid-4, .grid-3, .grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
