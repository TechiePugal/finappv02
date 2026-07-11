import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { ChevronDown, ChevronRight, AlertCircle, TrendingUp, Wallet, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { buildMonthProjection, calcTakeSuggestion, getExpectedPayable, getCommBreakdown, getPhaseIndex } from '../../utils/cf_engine';
import { formatCurrency, formatMonthYear } from '../../utils/cf_format';
import { Card, StatCard, SectionHeader, tokens, Badge } from '../../components/chitfund/UI';
import { printFundProjection } from '../../utils/cf_pdfReport';
import { PageLoader } from '../../components/Skeleton';

const fmt = v => formatCurrency(v||0);

export default function Projection() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chitsData, setChitsData] = useState([]);
  const [projection, setProjection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(data => {
      const chits = data.chits || [];
      setChitsData(chits);
      const proj = buildMonthProjection(chits, data.schedules || {});
      setProjection(proj);
      // Auto-expand current month
      const now = new Date();
      const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      if (proj.length) setExpanded({ [proj.find(p=>p.key>=curKey)?.key || proj[0].key]: true });
      setLoading(false);
    });
  }, [user]);

  if (loading) return <PageLoader stats={4}/>;

  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  // FIX: projection[0] is just the EARLIEST month with any pending auction — if no chit
  // happens to have a round due this exact calendar month, that would silently show a
  // FUTURE month's figure mislabeled as "This Month". Find the real current-month entry
  // explicitly instead (defaulting to ₹0 if nothing is actually due this month).
  const curMonthEntry = projection.find(m => m.key === curKey);
  const next1  = curMonthEntry?.total || 0;
  const upcoming = projection.filter(m => m.key >= curKey); // only current + future, never past
  const next3  = upcoming.slice(0,3).reduce((s,m)=>s+m.total,0);
  const next6  = upcoming.slice(0,6).reduce((s,m)=>s+m.total,0);
  const next12 = upcoming.slice(0,12).reduce((s,m)=>s+m.total,0);

  const chartData = projection.slice(0,12).map((m,i) => ({
    month: formatMonthYear(m.month),
    taken: m.chits.filter(c=>c.isTaken).reduce((s,c)=>s+c.investment,0),
    ongoing: m.chits.filter(c=>!c.isTaken).reduce((s,c)=>s+c.investment,0),
    total: m.total,
    isCur: m.key === curKey,
  }));

  const peak = projection.slice(0,12).reduce((mx,m)=>m.total>(mx?.total||0)?m:mx, null);
  const avg  = projection.slice(0,12).length > 0 ? Math.round(projection.slice(0,12).reduce((s,m)=>s+m.total,0)/projection.slice(0,12).length) : 0;

  // Urgency suggestions
  const suggestions = chitsData
    .map(c => calcTakeSuggestion(c, []))
    .filter(Boolean)
    .sort((a,b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 5);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:900, color:tokens.text }}>Fund Projection</h1>
          <p style={{ margin:'4px 0 0', fontSize:13.5, color:tokens.textSub }}>Month-wise investment forecast · Based on slab (not taken) vs per head (taken) logic per spec §7</p>
        </div>
        <button onClick={() => printFundProjection(projection, { next1, next3, next6, next12 })}
          style={{ padding:'9px 16px', borderRadius:10, border:`1px solid ${tokens.border}`, background:'#fff', color:tokens.text, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          🖨 Export PDF
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:13 }}>
        <StatCard label="This Month"    value={fmt(next1)}  sub="immediate need"     icon={Wallet}    accent={tokens.red}/>
        <StatCard label="Next 3 Months" value={fmt(next3)}  sub="quarterly outlook"  icon={Calendar}  accent='#B45309'/>
        <StatCard label="Next 6 Months" value={fmt(next6)}  sub="half-year plan"     icon={TrendingUp} accent={tokens.blue}/>
        <StatCard label="Annual (12mo)" value={fmt(next12)} sub="full year estimate"  icon={TrendingUp} accent={tokens.purple}/>
      </div>

      {/* Chart */}
      <Card>
        <SectionHeader title="12-Month Stacked View"
          sub={`Peak: ${peak?formatMonthYear(peak.month):'—'} at ${fmt(peak?.total||0)} · Average: ${fmt(avg)}/month`}/>
        <div style={{ height:230, marginTop:8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left:-5, right:10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false}/>
              <XAxis dataKey="month" tick={{ fontSize:11, fill:tokens.textSub }}/>
              <YAxis tick={{ fontSize:10, fill:tokens.textSub }} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`}/>
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const taken   = payload.find(p=>p.dataKey==='taken')?.value   || 0;
                const ongoing = payload.find(p=>p.dataKey==='ongoing')?.value || 0;
                return (
                  <div style={{ background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,0,0,.09)' }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>{label}</div>
                    <div style={{ fontSize:12, color:'#5521B5', marginBottom:3 }}>Taken (per head): {fmt(taken)}</div>
                    <div style={{ fontSize:12, color:tokens.blue, marginBottom:5 }}>Ongoing (slab): {fmt(ongoing)}</div>
                    <div style={{ fontSize:14, fontWeight:800, borderTop:`1px solid ${tokens.border}`, paddingTop:5 }}>Total: {fmt(taken+ongoing)}</div>
                  </div>
                );
              }}/>
              <Bar dataKey="ongoing" stackId="a" name="Ongoing (Slab)" fill={tokens.blue} radius={[0,0,0,0]}/>
              <Bar dataKey="taken"   stackId="a" name="Taken (Per Head)" fill="#5521B5" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display:'flex', gap:16, justifyContent:'center', marginTop:8 }}>
          {[{ color:tokens.blue, label:'Ongoing (company not taken — pays slab rate)' },{ color:'#5521B5', label:'Taken (company cashed — pays full per-head rate)' }].map((l,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:tokens.textSub }}>
              <div style={{ width:12, height:12, borderRadius:3, background:l.color }}/>{l.label}
            </div>
          ))}
        </div>
      </Card>

      {/* Algorithm note */}
      <div style={{ padding:'12px 16px', background:'#EFF6FF', border:`1px solid ${tokens.blue}25`, borderRadius:11, display:'flex', gap:10 }}>
        <AlertCircle size={16} color={tokens.blue} style={{ flexShrink:0, marginTop:1 }}/>
        <div style={{ fontSize:12.5, color:tokens.blue, lineHeight:1.6 }}>
          <strong>How this works:</strong> Before your company takes the chit, you invest at the Slab rate (your set amount per round). Once you take (cash out), you switch to paying the full Per-Head subscription like any other member.
          If chit is <em>Taken</em> → invest Per Head Value (switches automatically after company wins).
        </div>
      </div>

      {/* Smart suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <SectionHeader title="💡 Smart Suggestions — Consider Taking These Chits"/>
          {suggestions.map((s,i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:i<suggestions.length-1?`1px solid ${tokens.border}`:'none', flexWrap:'wrap', gap:8 }}>
              <div>
                <div style={{ fontSize:13.5, fontWeight:700, color:tokens.text }}>{s.chitName}</div>
                <div style={{ fontSize:12, color:tokens.textSub, marginTop:2 }}>
                  {Math.round(s.completionPct*100)}% complete · {s.remaining} auctions left
                </div>
                <div style={{ fontSize:11.5, color:s.isUrgent?tokens.red:'#B45309', marginTop:2, fontWeight:600 }}>{s.reason}</div>
              </div>
              <button onClick={()=>nav(`/cf/chits/${s.chitId}`)}
                style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${tokens.blue}30`, background:'#EFF6FF', color:tokens.blue, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
                View Chit →
              </button>
            </div>
          ))}
        </Card>
      )}

      {/* Month breakdown */}
      <div>
        <SectionHeader title="Month-by-Month Breakdown" sub={`${projection.length} months with pending auctions`}/>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:10 }}>
          {projection.length === 0 ? (
            <Card><div style={{ textAlign:'center', padding:'40px', color:tokens.textMuted, fontSize:13 }}>No pending auctions found.</div></Card>
          ) : projection.map(m => {
            const isCur  = m.key === curKey;
            const isOpen = !!expanded[m.key];
            const urgColor = m.total>500000 ? tokens.red : m.total>200000 ? '#B45309' : tokens.blue;
            return (
              <div key={m.key} style={{ border:`1.5px solid ${isCur?tokens.blue+'50':tokens.border}`, borderRadius:13, overflow:'hidden', background:'#fff' }}>
                <div onClick={()=>setExpanded(e=>({...e,[m.key]:!e[m.key]}))}
                  style={{ padding:'13px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', background:isCur?'#EFF6FF':'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    {isOpen ? <ChevronDown size={15} color={tokens.textSub}/> : <ChevronRight size={15} color={tokens.textSub}/>}
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14.5, fontWeight:700, color:tokens.text }}>{formatMonthYear(m.month)}</span>
                        {isCur && <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:99, background:tokens.blue, color:'#fff' }}>THIS MONTH</span>}
                      </div>
                      <div style={{ fontSize:12, color:tokens.textSub, marginTop:1 }}>
                        {m.chits.length} chit{m.chits.length!==1?'s':''} ·
                        <span style={{ color:'#5521B5' }}> {m.chits.filter(c=>c.isTaken).length} taken</span> ·
                        <span style={{ color:tokens.blue }}> {m.chits.filter(c=>!c.isTaken).length} ongoing</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize:20, fontWeight:900, color:urgColor }}>{fmt(m.total)}</div>
                </div>
                {isOpen && (
                  <div style={{ borderTop:`1px solid ${tokens.border}` }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 100px 90px', gap:8, padding:'8px 18px', background:'#F8FAFC', fontSize:10.5, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.06em' }}>
                      <span>Chit Fund {/* cf_proj_v2 */}</span>
                      <span style={{ textAlign:'right' }}>Subscription/Head</span>
                      <span style={{ textAlign:'right' }}>Your Slab/Round</span>
                      <span style={{ textAlign:'right' }}>Total Collection</span>
                      <span style={{ textAlign:'right' }}>Status</span>
                    </div>
                    {m.chits.map((c,i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 100px 90px', gap:8, padding:'11px 18px', borderBottom:i<m.chits.length-1?`1px solid ${tokens.border}`:'none', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13.5, fontWeight:600, color:tokens.text }}>{c.chitName}</div>
                          <div style={{ fontSize:11, color:tokens.textMuted }}>Auction #{c.auctionNo}</div>
                        </div>
                        <div style={{ textAlign:'right', fontSize:12.5, color:tokens.textSub }}>{fmt(c.perHeadValue||0)}</div>
                        <div style={{ textAlign:'right', fontSize:12.5, color:tokens.textSub }}>
                          {fmt(c.slabValue||0)}
                          {c.slabValue>0&&<div style={{fontSize:9.5,color:tokens.textMuted}}>your share/round</div>}
                        </div>
                        <div style={{ textAlign:'right', fontSize:14, fontWeight:800, color:c.isTaken?'#5521B5':tokens.blue }}>
                          {fmt(c.investment)}
                          <div style={{fontSize:9.5,fontWeight:400,color:tokens.textMuted}}>{c.isTaken?'at per-head':'at slab rate'}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:99, background:c.isTaken?'#EDEBFF':'#EFF6FF', color:c.isTaken?'#5521B5':tokens.blue }}>
                            {c.isTaken?'Taken':'Ongoing'}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 18px', background:'#F8FAFC', borderTop:`1px solid ${tokens.border}` }}>
                      <span style={{ fontSize:12, fontWeight:700, color:tokens.textSub }}>TOTAL FOR {formatMonthYear(m.month).toUpperCase()}</span>
                      <span style={{ fontSize:16, fontWeight:900, color:urgColor }}>{fmt(m.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
