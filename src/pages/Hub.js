import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtCr(v) {
  const n = Math.abs(Number(v) || 0);
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n/1000).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
}

function KPICard({ label, value, sub, color, icon, loading }) {
  if (loading) return (
    <div style={{ background:'#fff', borderRadius:16, padding:'18px 20px', border:'1px solid rgba(0,0,0,.07)' }}>
      <div style={{ width:36, height:36, borderRadius:10, background:'#f3f4f6', marginBottom:12 }}/>
      <div style={{ height:22, background:'#f3f4f6', borderRadius:5, marginBottom:7, width:'55%' }}/>
      <div style={{ height:12, background:'#f3f4f6', borderRadius:4, width:'75%' }}/>
    </div>
  );
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'18px 20px', border:`1px solid rgba(0,0,0,.07)`, boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
      <div style={{ width:38, height:38, borderRadius:11, background:color+'18', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:13 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:900, color:'#111928', letterSpacing:'-.5px', lineHeight:1, marginBottom:5 }}>{value}</div>
      <div style={{ fontSize:13, color:'#6b7280', fontWeight:500 }}>{label}</div>
      {sub && <div style={{ fontSize:11.5, color:'#9ca3af', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function AppCard({ title, subtitle, color, gradient, icon, badge, kpis, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:'#fff', borderRadius:20, overflow:'hidden', border:'1px solid rgba(0,0,0,.08)', cursor:'pointer', transition:'all .2s', boxShadow: hov ? '0 12px 40px rgba(0,0,0,.14)' : '0 2px 8px rgba(0,0,0,.05)', transform: hov ? 'translateY(-3px)' : 'none' }}>
      {/* App header */}
      <div style={{ padding:'24px 24px 20px', background:gradient, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,.08)' }}/>
        <div style={{ position:'absolute', bottom:-30, right:20, width:70, height:70, borderRadius:'50%', background:'rgba(255,255,255,.06)' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.22)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
            {icon}
          </div>
          {badge && (
            <span style={{ fontSize:10.5, fontWeight:700, padding:'4px 9px', borderRadius:99, background:'rgba(255,255,255,.25)', color:'#fff', letterSpacing:'.04em' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ marginTop:14 }}>
          <h3 style={{ margin:0, fontSize:20, fontWeight:900, color:'#fff', letterSpacing:'-.3px' }}>{title}</h3>
          <p style={{ margin:'4px 0 0', fontSize:12.5, color:'rgba(255,255,255,.75)' }}>{subtitle}</p>
        </div>
      </div>
      {/* KPIs */}
      <div style={{ padding:'16px 20px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:10, marginBottom:16 }}>
          {kpis.map((k,i) => (
            <div key={i} style={{ textAlign:'center', padding:'10px 8px', background:'#f8fafc', borderRadius:10 }}>
              <div style={{ fontSize:15, fontWeight:800, color:k.color||'#111928' }}>{k.value}</div>
              <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2, fontWeight:500 }}>{k.label}</div>
            </div>
          ))}
        </div>
        <button style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:gradient, color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'opacity .15s', opacity: hov?1:.9 }}>
          Open {title} →
        </button>
      </div>
    </div>
  );
}

export default function Hub({ onLaunch }) {
  const { user, logout } = useAuth();

  const [projects,   setProjects]   = useState(null);
  const [chits,      setChits]      = useState(null);
  const [deposits,   setDeposits]   = useState(null);
  const [borrowers,  setBorrowers]  = useState(null);
  const [repayments, setRepayments] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);

  const ready = projects !== null && chits !== null && deposits !== null && borrowers !== null && repayments !== null;

  useEffect(() => {
    const u1 = onSnapshot(collection(db,'re_projects'),   s => setProjects(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,'chit_master'),   s => setChits(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3 = onSnapshot(collection(db,'deposit_master'),s => setDeposits(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4 = onSnapshot(collection(db,'borrower_master'),s=> setBorrowers(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u5 = onSnapshot(collection(db,'loan_repayments'),s=> setRepayments(s.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1();u2();u3();u4();u5(); };
  }, []);

  // Derived KPIs
  const activeChits     = (chits||[]).filter(c=>c.status==='Active').length;
  const totalChitValue  = (chits||[]).reduce((s,c)=>s+(c.totalChitValue||0),0);
  const chitComm        = (chits||[]).reduce((s,c)=>s+(c.totalCommissionEarned||0),0);

  const activeDeposits  = (deposits||[]).filter(d=>d.status==='Active').length;
  const totalDeposited  = (deposits||[]).filter(d=>d.status==='Active').reduce((s,d)=>s+(d.depositAmount||0),0);

  const activeBorr      = (borrowers||[]).filter(b=>b.status==='Active').length;
  const totalLoans      = (borrowers||[]).filter(b=>b.status==='Active').reduce((s,b)=>s+(b.loanAmount||0),0);
  const totalRepaid     = (repayments||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const outstanding     = Math.max(0, totalLoans - totalRepaid);

  const activeProjects  = (projects||[]).filter(p=>p.status==='Active').length;
  const totalRevenue    = (projects||[]).reduce((s,p)=>s+(p.totalRevenue||0),0);
  const bizMax = Math.max(totalRevenue, totalChitValue, totalDeposited, 1);
  const moneyInMotion = totalChitValue + totalDeposited + outstanding + totalRevenue;

  const now   = new Date();
  const hour  = now.getHours();
  const greet = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const name  = user?.displayName?.split(' ')[0] || 'Manager';

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(145deg,#0f172a 0%,#1e1a4a 40%,#0f172a 100%)', fontFamily:'-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif' }}>

      {/* ── TOP NAV ─────────────────────────────────────────────── */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(15,23,42,.85)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,.08)', padding:'0 24px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(99,102,241,.4)' }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M6 22L12 10L18 20L22 14L27 22H6Z" fill="white" opacity=".95"/>
              <circle cx="9" cy="13" r="2.5" fill="white"/>
            </svg>
          </div>
          <div>
            <span style={{ fontSize:17, fontWeight:900, color:'#fff', letterSpacing:'-.4px' }}>FinSuite</span>
            <span style={{ fontSize:11, color:'rgba(255,255,255,.45)', marginLeft:8, fontWeight:500 }}>ERP</span>
          </div>
        </div>

        {/* Desktop nav links */}
        <div className="hub-nav-links" style={{ display:'flex', gap:6 }}>
          {[['🏠 Home','#'],['🏢 Real Estate','re'],['💰 Chit Fund','cf'],['📊 Finance Ledger','fl']].map(([label,key])=>(
            <button key={key} onClick={()=>key!=='#'&&onLaunch(key)}
              style={{ padding:'7px 14px', borderRadius:9, border:'none', background: key==='#'?'rgba(99,102,241,.25)':'transparent', color: key==='#'?'#a5b4fc':'rgba(255,255,255,.6)', fontSize:13, fontWeight: key==='#'?600:400, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
              onMouseEnter={e=>{if(key!=='#'){e.currentTarget.style.background='rgba(255,255,255,.08)';e.currentTarget.style.color='#fff';}}}
              onMouseLeave={e=>{if(key!=='#'){e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,.6)';}}}
            >{label}</button>
          ))}
        </div>

        {/* User + hamburger */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {user?.photoURL
            ? <img src={user.photoURL} alt="" style={{ width:34, height:34, borderRadius:'50%', border:'2px solid rgba(99,102,241,.5)' }}/>
            : <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700 }}>
                {(user?.displayName||user?.email||'U')[0].toUpperCase()}
              </div>}
          <button className="hub-hamburger" onClick={()=>setMobileMenu(m=>!m)}
            style={{ display:'none', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,.7)', padding:4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button onClick={logout} style={{ display:'none' }} className="hub-logout-btn"
            style={{ padding:'7px 14px', borderRadius:9, border:'1px solid rgba(255,255,255,.15)', background:'transparent', color:'rgba(255,255,255,.6)', fontSize:12.5, cursor:'pointer', fontFamily:'inherit' }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenu && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(15,23,42,.95)', display:'flex', flexDirection:'column', padding:24 }}>
          <button onClick={()=>setMobileMenu(false)} style={{ alignSelf:'flex-end', background:'none', border:'none', color:'#fff', fontSize:24, cursor:'pointer', marginBottom:24 }}>×</button>
          {[['🏠 Home','#'],['🏢 Real Estate','re'],['💰 Chit Fund','cf'],['📊 Finance Ledger','fl']].map(([label,key])=>(
            <button key={key} onClick={()=>{if(key!=='#')onLaunch(key);setMobileMenu(false);}}
              style={{ padding:'16px 20px', marginBottom:8, borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'rgba(255,255,255,.06)', color:'#fff', fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
              {label}
            </button>
          ))}
          <button onClick={()=>{logout();setMobileMenu(false);}}
            style={{ marginTop:'auto', padding:'14px', borderRadius:12, border:'1px solid rgba(255,59,48,.4)', background:'rgba(255,59,48,.1)', color:'#ff453a', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            Sign Out
          </button>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div style={{ padding:'48px 24px 32px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ marginBottom:40 }}>
          <div style={{ fontSize:13, color:'rgba(165,180,252,.8)', fontWeight:600, marginBottom:10, letterSpacing:'.05em', textTransform:'uppercase' }}>
            {greet}, {name} 👋
          </div>
          <h1 style={{ margin:'0 0 10px', fontSize:'clamp(28px,5vw,48px)', fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1.1 }}>
            Your Financial
            <span style={{ background:'linear-gradient(90deg,#818cf8,#a78bfa,#c084fc)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', display:'block' }}>
              Command Centre
            </span>
          </h1>
          <p style={{ fontSize:16, color:'rgba(255,255,255,.5)', maxWidth:520, lineHeight:1.7, marginBottom:28 }}>
            Manage real estate projects, chit funds, and finance ledger — all in one place.
          </p>
          {/* Global KPIs */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[
              { label:'Active Chits',   val:ready?activeChits:'—',   icon:'💰', color:'#818cf8' },
              { label:'Active Deposits',val:ready?activeDeposits:'—',icon:'🏦', color:'#34d399' },
              { label:'Active Loans',   val:ready?activeBorr:'—',    icon:'📋', color:'#f59e0b' },
              { label:'RE Projects',    val:ready?activeProjects:'—',icon:'🏗️', color:'#60a5fa' },
            ].map((k,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:99, background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.12)' }}>
                <span style={{ fontSize:14 }}>{k.icon}</span>
                <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{k.val}</span>
                <span style={{ fontSize:12, color:'rgba(255,255,255,.5)' }}>{k.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BUSINESS COMPARISON */}
        <div style={{ background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.12)', borderRadius:20, padding:'24px 26px', marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6, flexWrap:'wrap', gap:8 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'#fff', letterSpacing:'-.3px' }}>Business Overview</h2>
            <span style={{ fontSize:13, color:'rgba(255,255,255,.55)' }}>Money in motion: <strong style={{ color:'#fff', fontWeight:800 }}>{ready?fmtCr(moneyInMotion):'—'}</strong></span>
          </div>
          <p style={{ margin:'0 0 18px', fontSize:12.5, color:'rgba(255,255,255,.4)' }}>Side-by-side scale of your three businesses.</p>
          {[
            { name:'Real Estate', icon:'🏢', color:'#2dd4bf', head:totalRevenue, headLabel:'Revenue', sub:`${activeProjects} active projects`, key:'re' },
            { name:'Chit Fund', icon:'💰', color:'#818cf8', head:totalChitValue, headLabel:'Managed value', sub:`Commission ${fmtCr(chitComm)} · ${activeChits} active`, key:'cf' },
            { name:'Finance Ledger', icon:'📊', color:'#34d399', head:totalDeposited, headLabel:'Deposits', sub:`Loans out ${fmtCr(outstanding)} · ${activeDeposits} deposits`, key:'fl' },
          ].map((b,i)=>(
            <div key={i} onClick={()=>onLaunch(b.key)} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i<2?'1px solid rgba(255,255,255,.07)':'none', cursor:'pointer' }}>
              <div style={{ width:40, height:40, borderRadius:11, background:b.color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, flexShrink:0 }}>{b.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, marginBottom:6 }}>
                  <span style={{ fontSize:14.5, fontWeight:700, color:'#fff' }}>{b.name}</span>
                  <span style={{ fontSize:15, fontWeight:900, color:'#fff', flexShrink:0 }}>{ready?fmtCr(b.head):'—'} <span style={{ fontSize:10.5, fontWeight:500, color:'rgba(255,255,255,.45)' }}>{b.headLabel}</span></span>
                </div>
                <div style={{ height:7, background:'rgba(255,255,255,.08)', borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ width: ready?`${Math.round(b.head/bizMax*100)}%`:'0%', height:'100%', background:b.color, borderRadius:4, transition:'width .6s' }}/>
                </div>
                <div style={{ fontSize:11.5, color:'rgba(255,255,255,.45)' }}>{b.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── APP CARDS ─────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:18, marginBottom:48 }}>

          {/* Real Estate */}
          <AppCard
            title="Real Estate ERP"
            subtitle="Projects, sites, clients, payments & documents"
            gradient="linear-gradient(135deg,#0f766e,#0d9488)"
            icon="🏢"
            badge="ERP"
            onClick={() => onLaunch('re')}
            kpis={[
              { label:'Projects', value: ready ? activeProjects : '—', color:'#fff' },
              { label:'Revenue',  value: ready ? fmtCr(totalRevenue) : '—', color:'#99f6e4' },
            ]}
          />

          {/* Chit Fund */}
          <AppCard
            title="Chit Fund Manager"
            subtitle="Auctions, commissions, members & projections"
            gradient="linear-gradient(135deg,#1d4ed8,#6366f1)"
            icon="💰"
            badge="LIVE"
            onClick={() => onLaunch('cf')}
            kpis={[
              { label:'Active Chits', value: ready ? activeChits : '—', color:'#fff' },
              { label:'Portfolio',    value: ready ? fmtCr(totalChitValue) : '—', color:'#bfdbfe' },
              { label:'Commission',   value: ready ? fmtCr(chitComm) : '—', color:'#86efac' },
            ]}
          />

          {/* Finance Ledger */}
          <AppCard
            title="Finance Ledger"
            subtitle="Deposits, loans, EMI & interest tracking"
            gradient="linear-gradient(135deg,#7c3aed,#a855f7)"
            icon="📊"
            badge="PRO"
            onClick={() => onLaunch('fl')}
            kpis={[
              { label:'Deposits',    value: ready ? fmtCr(totalDeposited) : '—', color:'#f0abfc' },
              { label:'Loans',       value: ready ? fmtCr(totalLoans) : '—', color:'#fff' },
              { label:'Outstanding', value: ready ? fmtCr(outstanding) : '—', color:'#fca5a5' },
            ]}
          />
        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────── */}
        <div style={{ marginBottom:48 }}>
          <h2 style={{ margin:'0 0 16px', fontSize:18, fontWeight:800, color:'rgba(255,255,255,.9)' }}>Quick Actions</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {[
              { icon:'➕', label:'New Borrower',    action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'💎', label:'New Chit Fund',   action:()=>onLaunch('cf'), sub:'Chit Fund' },
              { icon:'📥', label:'New Depositor',   action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'📋', label:'EMI Loans',       action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'📅', label:'Auction Calendar',action:()=>onLaunch('cf'), sub:'Chit Fund' },
              { icon:'⚠️', label:'View Alerts',     action:()=>onLaunch('fl'), sub:'Finance Ledger' },
            ].map((q,i) => (
              <button key={i} onClick={q.action}
                style={{ padding:'14px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,.1)', background:'rgba(255,255,255,.06)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all .15s' }}
                onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,.12)'; e.currentTarget.style.borderColor='rgba(255,255,255,.2)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,.06)'; e.currentTarget.style.borderColor='rgba(255,255,255,.1)'; }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{q.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:3 }}>{q.label}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)' }}>{q.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div style={{ borderTop:'1px solid rgba(255,255,255,.07)', paddingTop:24, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'rgba(255,255,255,.35)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 6px #34d399' }}/>
            Secured · AES-256 · {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
          </div>
          <button onClick={logout}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid rgba(255,59,48,.3)', background:'rgba(255,59,48,.08)', color:'#ff6b6b', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
            Sign Out
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hub-nav-links { display: none !important; }
          .hub-hamburger { display: flex !important; }
        }
        @media (max-width: 480px) {
          .hub-logout-btn { display: none; }
        }
      `}</style>
    </div>
  );
}
