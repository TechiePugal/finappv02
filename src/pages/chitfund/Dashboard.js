import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { FileText, Gavel, TrendingUp, Wallet, AlertTriangle, Clock, CheckCircle, ArrowRight, Plus, BarChart3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData, getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { buildMonthProjection, getExpectedPayable, getCommBreakdown, getChitsForMonth, getChitRoundForMonth, calcTakeSuggestion } from '../../utils/cf_engine';
import { formatCurrency, formatMonthYear, roundTo } from '../../utils/cf_format';
import { Card, StatCard, tokens, SectionHeader } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const fmt = v => formatCurrency(v || 0);

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [joined, setJoined] = useState([]);
  const [joinedPays, setJoinedPays] = useState({});

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(d => { setData(d); setLoading(false); }).catch(e => { setLoadErr('Failed to load data — check connection'); setLoading(false); });
    getOtherChits(user.uid).then(list => {
      setJoined(list);
      const active = list.filter(j => j.myStatus !== 'Cashed');
      Promise.all(active.map(j => getOtherChitPayments(j.id).then(p => [j.id, p]))).then(pairs => {
        setJoinedPays(Object.fromEntries(pairs));
      }).catch(() => {});
    }).catch(() => {});
  }, [user]);

  if (loading) return <PageLoader stats={4} />;
  if (loadErr) return (
    <div style={{ padding:'40px', textAlign:'center' }}>
      <div style={{ color:'#f87171', fontSize:14, marginBottom:12 }}>⚠ {loadErr}</div>
      <button onClick={() => { setLoading(true); getDashboardData(user.uid).then(d=>{setData(d);setLoadErr('');}).catch(()=>setLoadErr('Failed to load data — check connection')).finally(()=>setLoading(false)); }} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.1)', color:'#f87171', cursor:'pointer', fontSize:13, fontFamily:'inherit' }}>Retry</button>
    </div>
  );

  const chits   = data?.chits    || [];
  const scheds  = data?.schedules || {};
  const active  = chits.filter(c => c.status === 'Active');
  const proj    = buildMonthProjection(chits, scheds);
  // FIX: proj[0] is just the earliest month with ANY pending auction, not necessarily
  // the actual current calendar month — find it explicitly so "This Month" is accurate.
  const _curMoKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const next1   = (proj.find(m=>m.key===_curMoKey)?.total) || 0; // formed-only (kept for existing stat cards)
  const next3   = proj.slice(0,3).reduce((s,m)=>s+m.total,0);
  const next6   = proj.slice(0,6).reduce((s,m)=>s+m.total,0);
  const totalExposure = chits.reduce((s,c)=>s+Math.max(0,(c.totalInvested||0)-(c.totalCommissionEarned||0)-(c.totalReceived||0)),0);

  // This month need per chit (investment model)
  const thisMonthNeed = active.reduce((s, c) => {
    const taken = c.companyTakenAuction !== null && c.companyTakenAuction !== undefined;
    const nextRound = (c.auctionsCompleted || 0) + 1;
    return s + (taken ? (c.perHeadValue||0) : getExpectedPayable(c, nextRound));
  }, 0);

  // Upcoming auctions (next 7 days)
  const now = new Date();
  const upcoming = [];
  chits.forEach(c => {
    (scheds[c.id]||[]).forEach(a => {
      if (a.status !== 'Pending') return;
      const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds*1000) : new Date(a.auctionDate);
      const days = Math.floor((d - now)/86400000);
      if (days >= 0 && days <= 7) upcoming.push({ ...a, chitName:c.companyName, chitId:c.id, daysAway:days, date:d });
    });
  });
  upcoming.sort((a,b) => a.daysAway - b.daysAway);
  const urgent = upcoming.filter(u => u.daysAway <= 1);

  // FIX: build 8 REAL calendar months starting from the actual current month, looking up
  // each one's total from `proj` by key match. Previously this used proj.slice(0,8), which
  // is just the earliest 8 months that happen to have ANY pending auction — if this month
  // had none, the chart silently started from a future month and mislabeled it "Now".
  const _today = new Date();
  const chartData = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(_today.getFullYear(), _today.getMonth() + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const m = proj.find(p => p.key === k);
    const joinedThisMonth = joined.filter(j => j.myStatus !== 'Cashed').reduce((s,j) => {
      const pays = joinedPays[j.id] || [];
      const paidCount = pays.filter(p => p.status === 'Paid').length;
      const sub = (j.totalChitValue||0) / (j.totalMembers||1);
      const stillOwesThisMonth = (paidCount + i) < (j.totalMembers||0);
      return s + (stillOwesThisMonth ? sub : 0);
    }, 0);
    const formedTotal = m?.total || 0;
    return {
      month: formatMonthYear(d),
      formed: formedTotal,
      joinedObligation: Math.round(joinedThisMonth),
      required: formedTotal + Math.round(joinedThisMonth),
      isNow: i===0, // now genuinely true — i=0 is always the real current month
    };
  });

  const formedValue   = chits.reduce((s,c)=>s+(c.totalChitValue||0),0);
  const formedComm    = chits.reduce((s,c)=>s+(c.totalCommissionEarned||0),0);

  // ── P&L Analytics — real profit/loss, combined across formed + joined ──
  // Formed: commission earned is pure profit (capital invested is recovered when taken, not a loss).
  // Joined: for chits already won, realized P&L = prize received − total subscriptions paid.
  const joinedRealized = joined.map(j => {
    const pays = joinedPays[j.id] || [];
    const totalPaid = pays.filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.amount||0),0);
    const totalReceived = pays.reduce((s,p)=>s+(p.iWon?(p.prizeReceived||0):0),0);
    const hasWon = pays.some(p=>p.iWon);
    return { chitName: j.companyName, hasWon, pl: hasWon ? (totalReceived-totalPaid) : null };
  });
  const joinedRealizedPL = joinedRealized.filter(r=>r.hasWon).reduce((s,r)=>s+r.pl,0);
  const joinedWonCount = joinedRealized.filter(r=>r.hasWon).length;
  const combinedNetPL = formedComm + joinedRealizedPL;

  const joinedActive  = joined.filter(j => j.status !== 'Completed' && j.status !== 'Closed');
  const joinedValue   = joined.reduce((s,j)=>s+(j.totalChitValue||0),0);
  const notTaken      = active.filter(c => c.companyTakenAuction === null || c.companyTakenAuction === undefined);
  const compareData = [
    { name:'Formed', amount: formedValue, fill: tokens.blue },
    { name:'Joined', amount: joinedValue, fill: tokens.green },
    { name:'Commission', amount: formedComm, fill: tokens.purple },
  ];
  const takeAdvice = notTaken.map(c => {
    const sug = calcTakeSuggestion(c, scheds[c.id]);
    const nextRound = (c.auctionsCompleted||0)+1;
    const br = getCommBreakdown(c, nextRound);
    const pct = c.totalMembers>0 ? Math.round(((c.auctionsCompleted||0)/c.totalMembers)*100) : 0;
    return { c, sug, br, pct };
  });

  // Joined-chit reminders — payment due/overdue this month
  const _curMo = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; })();
  const joinedReminders = joined.filter(j => j.myStatus !== 'Cashed').map(j => {
    const pays = joinedPays[j.id] || [];
    const thisMoPay = pays.find(p => p.month === _curMo);
    const paid = thisMoPay && thisMoPay.status === 'Paid';
    const sub = (j.totalChitValue || 0) / (j.totalMembers || 1);
    return { j, paid, sub };
  }).filter(r => !r.paid);

  const now_ = new Date();
  const hour = now_.getHours();
  const greeting = hour<12 ? 'Good morning' : hour<17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Greeting */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:tokens.text, letterSpacing:'-.4px' }}>
            {greeting} 👋
          </h1>
          <p style={{ margin:'4px 0 0', fontSize:13.5, color:tokens.textSub }}>
            {now_.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
        <button onClick={()=>nav('/cf/chits')}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:10, border:'none', background:tokens.blue, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          <Plus size={14}/> New Chit Fund
        </button>
      </div>

      {/* Urgent alert */}
      {urgent.length > 0 && (
        <div style={{ padding:'14px 18px', background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:12, display:'flex', gap:14, alignItems:'flex-start' }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'#FEE2E2', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <AlertTriangle size={18} color={tokens.red}/>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#991B1B', marginBottom:5 }}>
              ⚡ {urgent.length} Urgent Auction{urgent.length>1?'s':''} — Action Required!
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {urgent.map((u,i) => (
                <button key={i} onClick={()=>nav(`/cf/chits/${u.chitId}`)}
                  style={{ fontSize:12, background:'#FEE2E2', color:tokens.red, padding:'3px 10px', borderRadius:99, fontWeight:700, border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                  {u.chitName} · #{u.auctionNumber} · {u.daysAway===0?'TODAY':'Tomorrow'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:13 }}>
        <StatCard label="Active Chit Funds"   value={active.length} sub={`${chits.length} total`} icon={FileText}  accent={tokens.blue}/>
        <StatCard label="This Month Required" value={fmt(thisMonthNeed)} sub={`3mo: ${fmt(next3)}`} icon={Wallet}    accent='#B45309'/>
        <StatCard label="Next Month"          value={fmt(next1)} sub="projected outflow"            icon={BarChart3} accent={tokens.blue}/>
        <StatCard label="Net Exposure"        value={fmt(totalExposure)} sub="invested − received"  icon={TrendingUp} accent={totalExposure>0?tokens.red:tokens.green}/>
      </div>

      <Card>
        <SectionHeader title="Your Chit Money — Formed vs Joined" />
        <div className="cf-two-col">
          <div style={{ height:230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ left:-4, right:8, top:8, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false}/>
                <XAxis dataKey="name" tick={{ fontSize:12, fill:tokens.textSub }}/>
                <YAxis tick={{ fontSize:10, fill:tokens.textSub }} tickFormatter={v=>v>=100000?`₹${(v/100000).toFixed(1)}L`:`₹${(v/1000).toFixed(0)}K`}/>
                <Tooltip cursor={{ fill:'rgba(0,0,0,0.03)' }} content={({ active, payload, label }) => active && payload?.length ? (<div style={{ background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:9, padding:'8px 13px', boxShadow:'0 4px 16px rgba(0,0,0,.09)' }}><div style={{ fontSize:11, color:tokens.textSub, marginBottom:3 }}>{label}</div><div style={{ fontSize:15, fontWeight:800, color:tokens.text }}>{formatCurrency(payload[0].value)}</div></div>) : null}/>
                <Bar dataKey="amount" radius={[6,6,0,0]} maxBarSize={70}>{compareData.map((d,i)=><Cell key={i} fill={d.fill}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12, justifyContent:'center' }}>
            <div onClick={()=>nav('/cf/chits')} style={{ cursor:'pointer', padding:'14px 16px', borderRadius:12, background:'rgba(0,122,255,0.06)', border:`1.5px solid ${tokens.blue}30` }}>
              <span style={{ fontSize:11, fontWeight:800, color:tokens.blue, textTransform:'uppercase', letterSpacing:'.05em' }}>🏢 Formed Chits — You are Organiser {/* cf_dash_v2 */}</span>
              <div style={{ fontSize:22, fontWeight:900, color:tokens.text, letterSpacing:'-.5px', marginTop:6 }}>{fmt(formedValue)}</div>
              <div style={{ fontSize:12, color:tokens.textSub, marginTop:3 }}>{chits.length} chit{chits.length!==1?'s':''} · Total commission earned: <strong style={{color:tokens.green}}>{fmt(formedComm)}</strong></div>
              <div style={{ fontSize:11, color:tokens.textMuted, marginTop:2 }}>Org fee = % of total chit value per auction round</div>
            </div>
            <div onClick={()=>nav('/cf/other-chits')} style={{ cursor:'pointer', padding:'14px 16px', borderRadius:12, background:'rgba(52,199,89,0.06)', border:`1.5px solid ${tokens.green}30` }}>
              <span style={{ fontSize:11, fontWeight:800, color:tokens.green, textTransform:'uppercase', letterSpacing:'.05em' }}>👥 Joined Chits — You are a Member</span>
              <div style={{ fontSize:22, fontWeight:900, color:tokens.text, letterSpacing:'-.5px', marginTop:6 }}>{fmt(joinedValue)}</div>
              <div style={{ fontSize:12, color:tokens.textSub, marginTop:3 }}>{joined.length} chit{joined.length!==1?'s':''} · {joinedActive.length} still running · you pay per-head each round</div>
            </div>
          </div>
        </div>
      </Card>

      {notTaken.length > 0 && (
        <Card>
          <SectionHeader title="Should I Take My Chit This Month?" />
          <p style={{ margin:'-4px 0 14px', fontSize:12.5, color:tokens.textSub }}>For each chit you manage but haven't taken yet — whether this is a good month to take the prize, or better to wait.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:12 }}>
            {takeAdvice.map(({ c, sug, br, pct }) => {
              const good = !!sug;
              const prize = sug ? sug.estPrize : (br ? br.winnerInHand : 0);
              return (
                <div key={c.id} onClick={()=>nav(`/cf/chits/${c.id}`)} style={{ cursor:'pointer', padding:'14px 16px', borderRadius:12, border:`1.5px solid ${good?tokens.green+'55':tokens.border}`, background: good?'rgba(52,199,89,0.05)':tokens.surface }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:700, color:tokens.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.companyName}</span>
                    <span style={{ fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:99, flexShrink:0, background: good?'#D1FAE5':'#F3F4F6', color: good?'#065F46':tokens.textSub }}>{good ? '✓ Good month to take' : '⏳ Better to wait'}</span>
                  </div>
                  <div style={{ fontSize:12.5, color:tokens.textSub, marginBottom:10, lineHeight:1.5 }}>{good ? sug.reason : `Cycle is ${pct}% done — taking now isn't optimal yet. Holding keeps your slab low.`}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div style={{ background:tokens.slateLight, borderRadius:8, padding:'8px 10px' }}><div style={{ fontSize:9.5, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase' }}>You'd Receive Now</div><div style={{ fontSize:15, fontWeight:800, color:tokens.green }}>{fmt(prize)}</div></div>
                    <div style={{ background:tokens.slateLight, borderRadius:8, padding:'8px 10px' }}><div style={{ fontSize:9.5, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase' }}>Cycle Progress</div><div style={{ fontSize:15, fontWeight:800, color: pct>=75?tokens.green:pct>=40?'#B45309':tokens.blue }}>{pct}%</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {joinedReminders.length > 0 && (
        <Card>
          <SectionHeader title="Joined Chit Reminders — Payment Due" />
          <p style={{ margin:'-4px 0 14px', fontSize:12.5, color:tokens.textSub }}>Chits you've joined where this month's subscription isn't marked paid yet.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
            {joinedReminders.map(({ j, sub }) => (
              <div key={j.id} onClick={()=>nav('/cf/other-chits')} style={{ cursor:'pointer', padding:'14px 16px', borderRadius:12, border:`1.5px solid ${tokens.amber}55`, background:'rgba(255,149,0,0.05)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:tokens.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{j.companyName}</span>
                  <span style={{ fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:99, flexShrink:0, background:'#FEF3C7', color:'#92400E' }}>⏰ Due this month</span>
                </div>
                <div style={{ fontSize:12.5, color:tokens.textSub }}>Subscription: <strong style={{color:tokens.text}}>{fmt(sub)}</strong></div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 20 }}>
        <SectionHeader title="P&amp;L Analytics" sub="Real profit and loss, combined across every chit you organise or have joined" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginTop:12 }}>
          <div style={{ padding:'14px 16px', borderRadius:12, background:'rgba(52,199,89,0.06)', border:'1px solid rgba(52,199,89,0.15)' }}>
            <div style={{ fontSize:11, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase' }}>Formed — Commission Profit</div>
            <div style={{ fontSize:19, fontWeight:900, color:tokens.green, marginTop:4 }}>+{fmt(formedComm)}</div>
            <div style={{ fontSize:11, color:tokens.textSub, marginTop:2 }}>Capital invested is recovered when taken — not counted as a loss</div>
          </div>
          <div style={{ padding:'14px 16px', borderRadius:12, background: joinedRealizedPL>=0 ? 'rgba(52,199,89,0.06)' : 'rgba(255,59,48,0.06)', border:`1px solid ${joinedRealizedPL>=0?'rgba(52,199,89,0.15)':'rgba(255,59,48,0.15)'}` }}>
            <div style={{ fontSize:11, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase' }}>Joined — Realized P&amp;L</div>
            <div style={{ fontSize:19, fontWeight:900, color: joinedRealizedPL>=0?tokens.green:tokens.red, marginTop:4 }}>{joinedRealizedPL>=0?'+':''}{fmt(joinedRealizedPL)}</div>
            <div style={{ fontSize:11, color:tokens.textSub, marginTop:2 }}>{joinedWonCount} chit{joinedWonCount!==1?'s':''} already taken · prize received minus subscriptions paid</div>
          </div>
          <div style={{ padding:'14px 16px', borderRadius:12, background: combinedNetPL>=0 ? 'rgba(0,122,255,0.06)' : 'rgba(255,59,48,0.06)', border:`1px solid ${combinedNetPL>=0?'rgba(0,122,255,0.2)':'rgba(255,59,48,0.15)'}` }}>
            <div style={{ fontSize:11, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase' }}>Combined Net P&amp;L</div>
            <div style={{ fontSize:19, fontWeight:900, color: combinedNetPL>=0?tokens.blue:tokens.red, marginTop:4 }}>{combinedNetPL>=0?'+':''}{fmt(combinedNetPL)}</div>
            <div style={{ fontSize:11, color:tokens.textSub, marginTop:2 }}>Formed profit + joined realized P&amp;L</div>
          </div>
        </div>
      </Card>

      <div className="cf-dash-main-aside">
        {/* Chart */}
        <Card>
          <SectionHeader title="Combined Fund Projection — 8-Month Forecast"
            sub="Formed-chit slab investment + joined-chit subscriptions, combined"
            action={<button onClick={()=>nav('/cf/projection')} style={{ background:'none', border:'none', color:tokens.blue, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4 }}>Full View <ArrowRight size={12}/></button>}/>
          <div style={{ display:'flex', gap:20, marginBottom:10, flexWrap:'wrap' }}>
            {[{l:'This Month (Combined)',v:fmt(chartData[0]?.required||0),c:tokens.blue},{l:'3 Months',v:fmt(chartData.slice(0,3).reduce((s,m)=>s+m.required,0)),c:'#B45309'},{l:'6 Months',v:fmt(chartData.slice(0,6).reduce((s,m)=>s+m.required,0)),c:tokens.purple}].map((k,i)=>(
              <div key={i}>
                <div style={{ fontSize:11, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{k.l}</div>
                <div style={{ fontSize:16, fontWeight:800, color:k.c }}>{k.v}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:14, marginBottom:12, fontSize:11.5 }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{width:9,height:9,borderRadius:2,background:tokens.blue,display:'inline-block'}}/>Formed (your slab)</span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{width:9,height:9,borderRadius:2,background:tokens.green,display:'inline-block'}}/>Joined (your subscriptions)</span>
          </div>
          <div style={{ height:190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left:-8, right:8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false}/>
                <XAxis dataKey="month" tick={{ fontSize:11, fill:tokens.textSub }}/>
                <YAxis tick={{ fontSize:10, fill:tokens.textSub }} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`}/>
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div style={{ background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:9, padding:'8px 13px', boxShadow:'0 4px 16px rgba(0,0,0,.09)' }}>
                    <div style={{ fontSize:11, color:tokens.textSub, marginBottom:4, fontWeight:700 }}>{label}</div>
                    <div style={{ fontSize:12, color:tokens.blue }}>Formed: {formatCurrency(payload.find(p=>p.dataKey==='formed')?.value||0)}</div>
                    <div style={{ fontSize:12, color:tokens.green }}>Joined: {formatCurrency(payload.find(p=>p.dataKey==='joinedObligation')?.value||0)}</div>
                    <div style={{ fontSize:13, fontWeight:800, color:tokens.text, marginTop:3, borderTop:`1px solid ${tokens.border}`, paddingTop:3 }}>Total: {formatCurrency((payload.find(p=>p.dataKey==='formed')?.value||0)+(payload.find(p=>p.dataKey==='joinedObligation')?.value||0))}</div>
                  </div>
                ) : null}/>
                <Bar dataKey="formed" stackId="a" radius={[0,0,0,0]}>
                  {chartData.map((d,i) => <Cell key={i} fill={d.isNow ? tokens.blue : '#BFDBFE'}/>)}
                </Bar>
                <Bar dataKey="joinedObligation" stackId="a" radius={[5,5,0,0]}>
                  {chartData.map((d,i) => <Cell key={i} fill={d.isNow ? tokens.green : '#BBF7D0'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Upcoming */}
        <Card>
          <SectionHeader title="Next 7 Days" action={<button onClick={()=>nav('/cf/calendar')} style={{ background:'none', border:'none', color:tokens.blue, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Calendar</button>}/>
          {upcoming.length === 0 ? (
            <div style={{ textAlign:'center', padding:'28px 0', color:tokens.textMuted }}>
              <CheckCircle size={28} color={tokens.green} style={{ display:'block', margin:'0 auto 8px' }}/>
              <div style={{ fontSize:13, fontWeight:600 }}>All clear</div>
              <div style={{ fontSize:12, marginTop:3 }}>No auctions in next 7 days</div>
            </div>
          ) : upcoming.slice(0,6).map((u,i) => {
            const col = u.daysAway===0 ? tokens.red : u.daysAway<=2 ? '#B45309' : tokens.blue;
            return (
              <div key={i} onClick={()=>nav(`/cf/chits/${u.chitId}`)}
                style={{ display:'flex', gap:10, padding:'9px 0', borderBottom: i<Math.min(upcoming.length,6)-1 ? `1px solid ${tokens.border}`:'none', cursor:'pointer', alignItems:'center' }}>
                <div style={{ width:42, height:42, borderRadius:10, background:col+'14', border:`1.5px solid ${col}30`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:14, fontWeight:900, color:col, lineHeight:1 }}>{u.date.getDate()}</span>
                  <span style={{ fontSize:9, color:col, fontWeight:600 }}>{u.date.toLocaleDateString('en-IN',{month:'short'})}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:tokens.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.chitName}</div>
                  <div style={{ fontSize:11.5, color:tokens.textSub }}>Auction #{u.auctionNumber}</div>
                </div>
                <span style={{ fontSize:11, fontWeight:800, color:col, background:col+'12', padding:'3px 8px', borderRadius:99, flexShrink:0 }}>
                  {u.daysAway===0?'TODAY':u.daysAway===1?'Tmrw':`${u.daysAway}d`}
                </span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Per-chit monthly need */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <div>
            <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:tokens.text }}>Monthly Money Required — Each Chit Fund</h2>
            <p style={{ margin:'3px 0 0', fontSize:13, color:tokens.textSub }}>
              Total this month: <strong style={{ color:tokens.blue, fontSize:15 }}>{fmt(thisMonthNeed)}</strong> across {active.length} active fund{active.length!==1?'s':''}
            </p>
          </div>
          <button onClick={()=>nav('/cf/chits')} style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:`1px solid ${tokens.border}`, color:tokens.blue, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', padding:'7px 14px', borderRadius:9 }}>
            Manage All <ArrowRight size={13}/>
          </button>
        </div>

        {active.length === 0 ? (
          <Card>
            <div style={{ textAlign:'center', padding:'40px 24px' }}>
              <div style={{ fontSize:44, marginBottom:12 }}>💰</div>
              <div style={{ fontSize:15, fontWeight:700, color:tokens.textSub, marginBottom:6 }}>No active chit funds</div>
              <button onClick={()=>nav('/cf/chits')} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'9px 18px', borderRadius:10, border:'none', background:tokens.blue, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={14}/> Create First Chit Fund
              </button>
            </div>
          </Card>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:14 }}>
            {active.map(c => {
              const taken = c.companyTakenAuction !== null && c.companyTakenAuction !== undefined;
              const slab  = c.slabType==='Fixed' ? (c.slabValue||0) : Math.round((c.totalChitValue||0)*(c.slabValue||0)/100);
              const nextRound_ = (c.auctionsCompleted||0)+1;
              const need  = taken ? (c.perHeadValue||0) : getExpectedPayable(c, nextRound_);
              const pct   = c.totalMembers>0 ? Math.round(((c.auctionsCompleted||0)/c.totalMembers)*100) : 0;
              const expComm = (c.totalChitValue||0)*(c.managerCommissionPct||5)/100;
              const sched   = scheds[c.id]||[];
              const nextPending = sched.find(s=>s.status==='Pending');
              const nextDate = nextPending?.auctionDate?.seconds ? new Date(nextPending.auctionDate.seconds*1000) : nextPending?.auctionDate ? new Date(nextPending.auctionDate) : null;
              const daysToNext = nextDate ? Math.floor((nextDate-now)/86400000) : null;
              const urg = daysToNext!==null && daysToNext<=2;
              return (
                <div key={c.id} onClick={()=>nav(`/cf/chits/${c.id}`)}
                  style={{ background:'#fff', borderRadius:16, border:`1.5px solid ${urg?tokens.red+'50':tokens.border}`, padding:'18px 20px', cursor:'pointer', transition:'all .2s', position:'relative', overflow:'hidden' }}
                  onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,.1)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none'; }}>
                  <div style={{ position:'absolute', top:0, left:0, right:0, height:4, background:urg?tokens.red:taken?'#5521B5':tokens.blue, borderRadius:'16px 16px 0 0' }}/>
                  
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:700, color:tokens.text, marginBottom:2 }}>{c.companyName}</div>
                      <div style={{ fontSize:11.5, color:tokens.textSub }}>{c.branch||'Head Office'} · {c.totalMembers} members</div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:99, background: c.status==='Active'?'#D1FAE5':'#F3F4F6', color:c.status==='Active'?'#065F46':'#6B7280' }}>
                      {c.status}
                    </span>
                  </div>

                  {/* Money needed highlight */}
                  <div style={{ background:need>100000?'#FEF2F2':need>50000?'#FEF3C7':'#EFF6FF', border:`1.5px solid ${need>100000?tokens.red+'40':need>50000?'#B45309'+'40':tokens.blue+'40'}`, borderRadius:10, padding:'12px 14px', marginBottom:12 }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>💰 This Month Required</div>
                    <div style={{ fontSize:26, fontWeight:900, color:need>100000?tokens.red:need>50000?'#B45309':tokens.blue, letterSpacing:'-.5px', lineHeight:1 }}>{fmt(need)}</div>
                    <div style={{ fontSize:11, color:tokens.textSub, marginTop:5 }}>
                      {taken ? '✓ Company taken — paying per head value' : `Ongoing — slab (${c.slabType==='Fixed'?fmt(slab):`${c.slabValue}%`})`}
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:11.5, color:tokens.textSub }}>
                      <span>Progress: {c.auctionsCompleted||0}/{c.totalMembers}</span>
                      <span style={{ fontWeight:700, color:pct>=75?tokens.green:pct>=40?'#B45309':tokens.blue }}>{pct}%</span>
                    </div>
                    <div style={{ height:5, background:'#E5E7EB', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:pct>=75?tokens.green:pct>=40?'#B45309':tokens.blue, borderRadius:3, transition:'width .5s' }}/>
                    </div>
                  </div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:9.5, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>Commission Earned</div>
                      <div style={{ fontSize:13.5, fontWeight:800, color:tokens.green }}>{fmt(c.totalCommissionEarned||0)}</div>
                      <div style={{ fontSize:9, color:tokens.textMuted }}>of {fmt(expComm)} expected</div>
                    </div>
                    <div style={{ background:'#F8FAFC', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:9.5, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>Next Auction</div>
                      {nextDate ? (
                        <>
                          <div style={{ fontSize:13, fontWeight:800, color:urg?tokens.red:'#B45309' }}>
                            {daysToNext===0?'TODAY!':daysToNext===1?'Tomorrow':`${daysToNext}d`}
                          </div>
                          <div style={{ fontSize:9.5, color:tokens.textSub }}>#{nextPending?.auctionNumber} · {nextDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>
                        </>
                      ) : <div style={{ fontSize:13, fontWeight:700, color:tokens.green }}>All done ✓</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
