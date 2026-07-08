import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { logOut } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
const ACCENT = '#007AFF';
const NAV = [
  { group:'Overview', items:[
    { to:'/cf', label:'Dashboard', icon:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></> },
    { to:'/cf/projection', label:'Fund Projection', icon:<><polyline points="3,17 9,11 13,15 21,7"/><polyline points="16,7 21,7 21,12"/></> },
    { to:'/cf/calendar', label:'Calendar', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
    { to:'/cf/journal', label:'Journal', icon:<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></> },
  ]},
  { group:'Formed Chits (You Manage)', color:'#007AFF', items:[
    { to:'/cf/chits', label:'Manage Chit Funds', icon:<><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M7 3V2M17 3V2M3 8h18"/></> },
    { to:'/cf/auctions', label:'All Auctions', icon:<><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></> },
    { to:'/cf/commission-calc', label:'Commission Calc', icon:<><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h3M14 11h2M8 15h3M14 15h2"/></> },
    { to:'/cf/exposure', label:'Exposure & Risk', icon:<><path d="M12 2v20M2 7l10-5 10 5M2 12h20"/></> },
    { to:'/cf/ledger', label:'Ledger', icon:<><path d="M3 3h7a3 3 0 0 1 3 3v15a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 3h-7a3 3 0 0 0-3 3v15a2.5 2.5 0 0 1 2.5-2.5H21z"/></> },
  ]},
  { group:'Joined Chits (You Joined)', color:'#34C759', items:[
    { to:'/cf/other-chits', label:'My Joined Chits', icon:<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></> },
    { to:'/cf/joined-auctions', label:'Auctions', icon:<><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></> },
    { to:'/cf/joined-exposure', label:'Exposure & Risk', icon:<><path d="M12 2v20M2 7l10-5 10 5M2 12h20"/></> },
    { to:'/cf/joined-ledger', label:'Ledger', icon:<><path d="M3 3h7a3 3 0 0 1 3 3v15a2.5 2.5 0 0 0-2.5-2.5H3z"/><path d="M21 3h-7a3 3 0 0 0-3 3v15a2.5 2.5 0 0 1 2.5-2.5H21z"/></> },
  ]},
];
const MOB_MAIN = ['/cf', '/cf/chits', '/cf/calendar', '/cf/other-chits'];
export default function CFLayout() {
  const { user } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => { setMoreOpen(false); setMobileOpen(false); }, [loc.pathname]);
  async function handleLogout() { setLoggingOut(true); try { await logOut(); nav('/'); } catch { setLoggingOut(false); } }
  const allItems = NAV.flatMap(g => g.items);
  const curItem = allItems.find(n => n.to === '/cf' ? loc.pathname === '/cf' : loc.pathname.startsWith(n.to));
  const title = curItem ? curItem.label : 'ChitFlow';
  const initials = (user?.displayName || user?.email || 'U').slice(0,2).toUpperCase();
  const userName = user?.displayName || user?.email?.split('@')[0] || 'User';
  const mobActive = MOB_MAIN.find(p => p === '/cf' ? loc.pathname === '/cf' : loc.pathname.startsWith(p));
  const moreIsActive = !mobActive;
  function SidebarContent({ onClose }) {
    return (
      <aside style={{ width:240, height:'100%', display:'flex', flexDirection:'column', background:'rgba(255,255,255,0.92)', backdropFilter:'blur(24px) saturate(180%)', WebkitBackdropFilter:'blur(24px) saturate(180%)', borderRight:'1px solid rgba(0,0,0,0.07)', overflowY:'auto' }}>
        <div style={{ padding:'16px 14px 12px', borderBottom:'1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:11, background:ACCENT, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 3px 12px rgba(0,122,255,0.25)' }}><svg width="19" height="19" viewBox="0 0 22 22" fill="none"><path d="M3 16L8 8l4 4 3-5 3 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="4" cy="11" r="2" fill="white" opacity=".85"/></svg></div>
            <div><div style={{ fontSize:15.5, fontWeight:800, color:'#000', letterSpacing:'-0.03em', lineHeight:1 }}>ChitFlow</div><div style={{ fontSize:10.5, color:'#8E8E93', marginTop:2, fontWeight:500 }}>Fund Manager</div></div>
          </div>
        </div>
        <nav style={{ flex:1, padding:'6px 6px 4px', overflowY:'auto' }}>
          {NAV.map(group => (
            <div key={group.group} style={{ marginBottom:2 }}>
              <p style={{ fontSize:10, fontWeight:700, color:group.color || '#8E8E93', textTransform:'uppercase', letterSpacing:'0.06em', padding:'10px 10px 5px' }}>{group.group}</p>
              {group.items.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === '/cf'} onClick={onClose} style={({ isActive }) => ({ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:9, background: isActive ? 'rgba(0,122,255,0.09)' : 'transparent', color: isActive ? ACCENT : '#3C3C43CC', fontWeight: isActive ? 600 : 400, fontSize:13.5, marginBottom:1, transition:'all 0.13s', textDecoration:'none', borderLeft:'3px solid '+(isActive ? ACCENT : 'transparent') })}>
                  {({ isActive }) => (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={isActive ? ACCENT : '#8E8E93'} strokeWidth={isActive ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg><span style={{ flex:1 }}>{item.label}</span>{isActive && <div style={{ width:5, height:5, borderRadius:'50%', background:ACCENT, flexShrink:0 }}/>}</>)}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding:'8px 8px 12px', borderTop:'1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:10, background:'rgba(118,118,128,0.06)', marginBottom:8 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', flexShrink:0, overflow:'hidden', background:'linear-gradient(135deg,#007AFF,#5856D6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:11.5 }}>{user?.photoURL ? <img src={user.photoURL} alt="" style={{ width:32, height:32, objectFit:'cover' }}/> : initials}</div>
            <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12.5, fontWeight:600, color:'#000', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName}</div><div style={{ display:'flex', alignItems:'center', gap:4, marginTop:1 }}><div style={{ width:5, height:5, borderRadius:'50%', background:'#34C759' }}/><span style={{ fontSize:10, color:'#8E8E93' }}>Active session</span></div></div>
          </div>
          <button onClick={handleLogout} disabled={loggingOut} style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:9, border:'1px solid rgba(0,0,0,0.08)', background:'transparent', color:'#3C3C43CC', cursor:'pointer', fontSize:12.5, fontWeight:500, fontFamily:'inherit' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>{loggingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </aside>
    );
  }
  const mobItems = [
    { to:'/cf', label:'Home', icon:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></> },
    { to:'/cf/chits', label:'Chits', icon:<><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M7 3V2M17 3V2M3 8h18"/></> },
    { to:'/cf/calendar', label:'Calendar', icon:<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></> },
    { to:'/cf/other-chits', label:'Joined', icon:<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></> },
  ];
  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#F2F2F7', fontFamily:'-apple-system,BlinkMacSystemFont,"Inter",sans-serif', WebkitFontSmoothing:'antialiased' }}>
      <div className="cf-sidebar-desktop" style={{ flexShrink:0, height:'100%' }}><SidebarContent onClose={() => {}}/></div>
      {mobileOpen && (<div style={{ position:'fixed', inset:0, zIndex:300 }}><div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.28)' }} onClick={() => setMobileOpen(false)}/><div style={{ position:'relative', zIndex:1, width:240, height:'100%', animation:'cfSlideIn .22s ease both' }}><SidebarContent onClose={() => setMobileOpen(false)}/></div></div>)}
      <main style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden', background:'#F2F2F7' }}>
        <header style={{ height:56, background:'rgba(255,255,255,0.90)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', borderBottom:'1px solid rgba(0,0,0,0.07)', display:'flex', alignItems:'center', padding:'0 20px', zIndex:50, gap:12, flexShrink:0 }}>
          <button onClick={() => setMobileOpen(true)} className="cf-mob-menu" style={{ display:'none', background:'none', border:'none', cursor:'pointer', padding:6, borderRadius:8, color:'#3C3C43CC', flexShrink:0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
          <span style={{ fontSize:16, fontWeight:700, color:'#000', letterSpacing:'-0.02em', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</span>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'rgba(52,199,89,0.08)', border:'1px solid rgba(52,199,89,0.2)', borderRadius:99, flexShrink:0 }}><div style={{ width:6, height:6, borderRadius:'50%', background:'#34C759' }}/><span style={{ fontSize:11.5, fontWeight:600, color:'#248A3D' }}>Secure</span></div>
        </header>
        <div className="cf-content" style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'24px 28px 40px' }}><div style={{ maxWidth:1400, margin:'0 auto' }}><Outlet/></div></div>
      </main>
      <div className="cf-bottom-nav" style={{ display:'none', position:'fixed', bottom:0, left:0, right:0, zIndex:100, background:'rgba(255,255,255,0.94)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', borderTop:'1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display:'flex' }}>
          {mobItems.map(item => { const isActive = item.to === '/cf' ? loc.pathname === '/cf' : loc.pathname.startsWith(item.to); return (<button key={item.to} onClick={() => { nav(item.to); setMoreOpen(false); }} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'7px 4px max(7px, env(safe-area-inset-bottom))', border:'none', background:'none', cursor:'pointer', color:isActive?ACCENT:'#8E8E93', fontSize:10, fontWeight:isActive?600:400, fontFamily:'inherit', transition:'color .12s', minWidth:0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive?ACCENT:'#8E8E93'} strokeWidth={isActive?2:1.7} strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>{item.label}</button>); })}
          <button onClick={() => setMoreOpen(o => !o)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, padding:'7px 4px max(7px, env(safe-area-inset-bottom))', border:'none', background:'none', cursor:'pointer', color:moreIsActive?ACCENT:'#8E8E93', fontSize:10, fontWeight:moreIsActive?600:400, fontFamily:'inherit', minWidth:0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={moreIsActive||moreOpen?ACCENT:'#8E8E93'} strokeWidth={1.8}><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>More</button>
        </div>
      </div>
      {moreOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200 }} onClick={() => setMoreOpen(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.25)' }}/>
          <div onClick={e => e.stopPropagation()} style={{ position:'absolute', bottom:0, left:0, right:0, background:'#fff', borderRadius:'20px 20px 0 0', padding:'6px 0 max(20px, env(safe-area-inset-bottom))', maxHeight:'78vh', overflowY:'auto', animation:'cfSlideUp .24s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ display:'flex', justifyContent:'center', padding:'8px 0 12px' }}><div style={{ width:36, height:4, borderRadius:2, background:'rgba(0,0,0,0.15)' }}/></div>
            {NAV.map(group => { const items = group.items.filter(item => !MOB_MAIN.includes(item.to)); if (!items.length) return null; return (<div key={group.group}><p style={{ fontSize:10.5, fontWeight:700, color:group.color || '#8E8E93', textTransform:'uppercase', letterSpacing:'0.06em', padding:'10px 20px 6px' }}>{group.group}</p>{items.map(item => { const isActive = loc.pathname.startsWith(item.to); return (<button key={item.to} onClick={() => { nav(item.to); setMoreOpen(false); }} style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'12px 20px', border:'none', background:isActive?'rgba(0,122,255,0.07)':'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left', borderBottom:'1px solid rgba(0,0,0,0.04)' }}><div style={{ width:36, height:36, borderRadius:9, background:isActive?'rgba(0,122,255,0.12)':'rgba(118,118,128,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={isActive?ACCENT:'#8E8E93'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg></div><span style={{ fontSize:15, fontWeight:isActive?600:400, color:isActive?ACCENT:'#000' }}>{item.label}</span></button>); })}</div>); })}
            <button onClick={handleLogout} style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'14px 20px', border:'none', background:'none', cursor:'pointer', fontFamily:'inherit' }}><div style={{ width:36, height:36, borderRadius:9, background:'rgba(255,59,48,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="1.8" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div><span style={{ fontSize:15, fontWeight:500, color:'#FF3B30' }}>Sign Out</span></button>
          </div>
        </div>
      )}
      <style>{`@media (max-width: 768px){.cf-sidebar-desktop{display:none !important;}.cf-mob-menu{display:flex !important;}.cf-bottom-nav{display:block !important;}.cf-content{padding:16px 16px calc(80px + env(safe-area-inset-bottom)) !important;}}@keyframes cfSlideIn{from{transform:translateX(-100%);}to{transform:translateX(0);}}@keyframes cfSlideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}`}</style>
    </div>
  );
}
