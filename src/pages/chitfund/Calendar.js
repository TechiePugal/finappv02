import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Gavel, ArrowRight, X, Calendar as CalIcon, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { getExpectedPayable, getCommBreakdown, calcPhases, getPhaseIndex } from '../../utils/cf_engine';
import { Card, PageHeader, Badge, StatCard, SectionHeader, tokens } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

function fmtDate(d) {
  if (!d) return '—';
  const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dateKey(d) {
  const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ── Popup for a single day's auctions ────────────────────────────────────────
function DayPopup({ date, events, onClose, nav }) {
  if (!events?.length) return null;
  const dt = new Date(date + 'T00:00:00');
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(17,24,39,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden', animation: 'popIn 0.2s ease' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${tokens.blue},#5521B5)`, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {dt.toLocaleDateString('en-IN', { weekday: 'long' })}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.4px' }}>
              {dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
              {events.length} auction{events.length > 1 ? 's' : ''} scheduled
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Auction cards */}
        <div style={{ padding: '16px 20px', maxHeight: 460, overflowY: 'auto' }}>
          {events.map((e, i) => {
            const isPending = e.status === 'Pending';
            const cardColor = isPending ? tokens.amber : tokens.green;
            return (
              <div key={i} style={{ marginBottom: 12, border: `1.5px solid ${cardColor}30`, borderRadius: 14, overflow: 'hidden', background: cardColor + '05' }}>
                {/* Chit name bar */}
                <div style={{ padding: '10px 16px', background: cardColor + '12', borderBottom: `1px solid ${cardColor}20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: tokens.text }}>{e.chitName}</span>
                    <span style={{ fontSize: 11, color: tokens.textSub, marginLeft: 8 }}>{e.branch}</span>
                  </div>
                  <Badge status={e.status} />
                </div>

                {/* Auction info */}
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      { label: 'Auction No.', val: `#${e.auctionNumber}`, bold: true },
                      { label: 'Per Head Value', val: formatCurrency(e.perHeadValue || 0), color: tokens.blue },
                      isPending ? { label: 'Total Members', val: e.totalMembers } : { label: 'Winning Bid', val: formatCurrency(e.bidAmount || 0), color: tokens.green },
                      isPending ? { label: 'Status', val: '⏳ Not yet conducted' } : { label: 'Winner', val: e.winnerName || '—' },
                    ].filter(Boolean).map((item, j) => (
                      <div key={j} style={{ background: '#fff', borderRadius: 9, padding: '8px 12px', border: `1px solid ${tokens.border}` }}>
                        <div style={{ fontSize: 10, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{item.label}</div>
                        <div style={{ fontSize: 13.5, fontWeight: item.bold ? 800 : 700, color: item.color || tokens.text }}>{item.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Winner payout for completed */}
                  {!isPending && e.bidAmount && (
                    <div style={{ padding: '10px 12px', background: tokens.greenLight, borderRadius: 10, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: tokens.green, fontWeight: 700, marginBottom: 2 }}>Winner Payout Breakdown</div>
                      <div style={{ fontSize: 12, color: tokens.textSub }}>
                        Bid Amount: <strong>{formatCurrency(e.bidAmount)}</strong> ·
                        Discount/head: <strong>{formatCurrency((e.perHeadValue || 0) - (e.bidAmount || 0))}</strong>
                      </div>
                    </div>
                  )}

                  {e.notes && (
                    <div style={{ fontSize: 12, color: tokens.textSub, padding: '8px 10px', background: tokens.slateLight, borderRadius: 8, marginBottom: 10 }}>
                      📝 {e.notes}
                    </div>
                  )}

                  <button onClick={() => { onClose(); nav(`/cf/chits/${e.chitId}`); }}
                    style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: tokens.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                    Open {e.chitName} <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.92) translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function NextAuctionPopup({ ev, onClose, nav }) {
  const chit = ev.chitObj || {};
  const round = ev.auctionNumber || 1;
  const sub = ev.perHeadValue || 0;
  let br = null; try { br = getCommBreakdown(chit, round); } catch (e) {}
  let expectedPayable = sub; try { expectedPayable = getExpectedPayable(chit, round); } catch (e) {}
  const bid = br ? br.bid : 0;
  const payout = br ? br.winnerInHand : (chit.totalChitValue || 0);
  const commPerHead = br ? br.commission : 0;
  const orgAmt = br ? br.orgAmt : 0;
  const dt = ev.dateKey ? new Date(ev.dateKey + "T00:00:00") : null;
  const rows = [
    { label:"Each member pays", val: formatCurrency(expectedPayable), color: tokens.blue, hint:"Contribution this round" },
    { label:"Expected winning bid", val: formatCurrency(bid), color: tokens.amber, hint:"From current slab" },
    { label:"Winner receives", val: formatCurrency(payout), color: tokens.green, hint:"Chit value minus bid" },
    { label:"Commission / member", val: formatCurrency(commPerHead), color: tokens.purple, hint:"Saved by each member" },
    { label:"Organiser fee", val: formatCurrency(orgAmt), color: tokens.text, hint:"Your cut this round" },
  ];
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:1100, background:"rgba(17,24,39,0.6)", backdropFilter:"blur(5px)", overflowY:"auto", padding:"24px 16px" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:480, margin:"0 auto", boxShadow:"0 24px 64px rgba(0,0,0,0.2)", overflow:"hidden", animation:"popIn 0.2s ease" }}>
        <div style={{ background:`linear-gradient(135deg,${tokens.blue},#5521B5)`, padding:"18px 22px", position:"relative" }}>
          <button onClick={onClose} style={{ position:"absolute", top:14, right:16, width:30, height:30, borderRadius:9, background:"rgba(255,255,255,0.15)", border:"none", cursor:"pointer", color:"#fff", fontSize:17 }}>×</button>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:700, textTransform:"uppercase", letterSpacing:".06em" }}>Next Auction · Money Projection</div>
          <div style={{ fontSize:20, fontWeight:900, color:"#fff", marginTop:4 }}>{ev.chitName}</div>
          <div style={{ fontSize:13, color:"rgba(255,255,255,0.78)", marginTop:3 }}>Auction #{round}{dt?` · ${dt.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}`:""}</div>
        </div>
        <div style={{ padding:"16px 20px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {rows.map((r,i)=>(
              <div key={i} style={{ background: tokens.slateLight, borderRadius:11, padding:"11px 13px", border:`1px solid ${tokens.border}` }}>
                <div style={{ fontSize:10, color:tokens.textMuted, fontWeight:700, textTransform:"uppercase", letterSpacing:".04em" }}>{r.label}</div>
                <div style={{ fontSize:17, fontWeight:800, color:r.color, marginTop:3 }}>{r.val}</div>
                <div style={{ fontSize:10.5, color:tokens.textSub, marginTop:2 }}>{r.hint}</div>
              </div>
            ))}
          </div>
          {!br && <div style={{ marginTop:12, fontSize:12, color:tokens.textSub, background:tokens.amberLight, borderRadius:9, padding:"9px 12px" }}>⚠ Projection uses the chit’s commission slabs. Add bid ranges in chit settings for a sharper estimate.</div>}
          <button onClick={()=>{ onClose(); nav(`/cf/chits/${ev.chitId}`); }} style={{ width:"100%", marginTop:14, padding:"11px", borderRadius:11, border:"none", background:tokens.blue, color:"#fff", fontSize:13.5, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"inherit" }}>
            Open {ev.chitName} <ArrowRight size={14}/>
          </button>
        </div>
      </div>
      <style>{`@keyframes popIn{from{opacity:0;transform:scale(0.92) translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

export default function CalendarPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [eventsByDate, setEventsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [nextPopup, setNextPopup] = useState(null);

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(data => {
      const ev = {};
      data.chits.forEach(c => {
        (data.schedules[c.id] || []).forEach(a => {
          const k = dateKey(a.auctionDate);
          if (!ev[k]) ev[k] = [];
          ev[k].push({
            ...a,
            chitName: c.companyName,
            chitId: c.id,
            branch: c.branch || 'Head Office',
            perHeadValue: c.perHeadValue,
            totalMembers: c.totalMembers,
            // Include chit data needed for estimates
            totalChitValue: c.totalChitValue,
            managerCommissionPct: c.managerCommissionPct,
            commissionType: c.commissionType,
            range_phase1: c.range_phase1 || c.range1 || 0,
            range_phase2: c.range_phase2 || c.range2 || 0,
            range_phase3: c.range_phase3 || c.range3 || 0,
            range_phase4: c.range_phase4 || c.range4 || 0,
            chitObj: c, // full chit for getExpectedPayable
          });
        });
      });
      setEventsByDate(ev);
      setLoading(false);
    });
  }, [user]);

  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const moKey = `${yr}-${String(mo + 1).padStart(2, '0')}`;
  const moEvents = Object.entries(eventsByDate).filter(([k]) => k.startsWith(moKey)).flatMap(([, v]) => v);
  const pending = moEvents.filter(e => e.status === 'Pending');
  const done = moEvents.filter(e => e.status === 'Completed');

  // Upcoming from today
  const nowStr = todayKey;
  const upcoming = Object.entries(eventsByDate)
    .filter(([k]) => k >= nowStr)
    .flatMap(([k, evts]) => evts.filter(e => e.status === 'Pending').map(e => ({ ...e, dateKey: k })))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(0, 8);

  if (loading) return <PageLoader stats={3} />;
  if (loadErr) return <div style={{padding:'40px',textAlign:'center',color:'#f87171',fontSize:14}}>⚠ {loadErr}</div>;

  return (
    <div>
      <PageHeader title="Auction Calendar" subtitle="Visual auction schedule — click any date to see full details" />

      {upcoming.length > 0 && (() => {
        const nx = upcoming[0];
        const dtn = new Date(nx.dateKey + "T00:00:00");
        const ddays = Math.ceil((dtn - new Date(todayKey + "T00:00:00")) / 86400000);
        const when = ddays <= 0 ? "Today" : ddays === 1 ? "Tomorrow" : `in ${ddays} days`;
        return (
          <div onClick={()=>setNextPopup(nx)} style={{ cursor:"pointer", display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderRadius:14, marginBottom:20, background:`linear-gradient(135deg,${tokens.blue},#5521B5)`, boxShadow:"0 8px 24px rgba(0,122,255,0.25)", flexWrap:"wrap" }}>
            <div style={{ width:46, height:46, borderRadius:13, background:"rgba(255,255,255,0.18)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Gavel size={22} color="#fff"/></div>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", fontWeight:700, textTransform:"uppercase", letterSpacing:".05em" }}>Next Upcoming Auction · {when}</div>
              <div style={{ fontSize:16, fontWeight:800, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nx.chitName} — Auction #{nx.auctionNumber}</div>
              <div style={{ fontSize:12.5, color:"rgba(255,255,255,0.82)", marginTop:1 }}>{dtn.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})} · Each member pays ~{formatCurrency(nx.perHeadValue||0)}</div>
            </div>
            <div style={{ flexShrink:0, padding:"8px 14px", borderRadius:10, background:"rgba(255,255,255,0.2)", color:"#fff", fontSize:12.5, fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>View details <ArrowRight size={14}/></div>
          </div>
        );
      })()}
      {nextPopup && <NextAuctionPopup ev={nextPopup} onClose={()=>setNextPopup(null)} nav={nav} />}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label="This Month" value={moEvents.length} sub="total auctions" icon={CalIcon} accent={tokens.blue} />
        <StatCard label="Pending" value={pending.length} sub="not conducted yet" icon={Gavel} accent={tokens.amber} />
        <StatCard label="Completed" value={done.length} sub="this month" icon={Gavel} accent={tokens.green} />
        <StatCard label="Upcoming" value={upcoming.length} sub="from today" icon={Users} accent={tokens.purple} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18 }}>

        {/* Calendar */}
        <Card>
          {/* Nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <button onClick={() => setViewDate(new Date(yr, mo - 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={16} color={tokens.textSub} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: tokens.text }}>
                {new Date(yr, mo).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
              {pending.length > 0 && (
                <div style={{ fontSize: 11.5, color: tokens.amber, fontWeight: 600, marginTop: 2 }}>
                  {pending.length} pending auction{pending.length > 1 ? 's' : ''} this month
                </div>
              )}
            </div>
            <button onClick={() => setViewDate(new Date(yr, mo + 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={16} color={tokens.textSub} />
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3, marginBottom: 4 }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
            {days.map((day, i) => {
              if (!day) return <div key={i} />;
              const k = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvts = eventsByDate[k] || [];
              const hasPending = dayEvts.some(e => e.status === 'Pending');
              const hasCompleted = dayEvts.some(e => e.status === 'Completed');
              const isToday = k === todayKey;
              const isSelected = k === selectedDay;
              const dotColor = hasPending && hasCompleted ? tokens.blue : hasPending ? tokens.amber : tokens.green;

              return (
                <div key={i}
                  onClick={() => dayEvts.length > 0 ? setSelectedDay(k === selectedDay ? null : k) : null}
                  style={{
                    minHeight: 56, padding: '6px 4px', borderRadius: 10,
                    cursor: dayEvts.length ? 'pointer' : 'default',
                    background: isSelected ? tokens.blue : isToday ? tokens.blueLight : dayEvts.length ? dotColor + '08' : 'transparent',
                    border: isSelected ? `2px solid ${tokens.blue}` : isToday ? `2px solid ${tokens.blue}50` : dayEvts.length ? `1.5px solid ${dotColor}35` : '1.5px solid transparent',
                    transition: 'all 0.15s',
                    transform: dayEvts.length && !isSelected ? undefined : undefined,
                  }}
                  onMouseEnter={e => { if (dayEvts.length && !isSelected) e.currentTarget.style.transform = 'scale(1.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}>
                  <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: isToday ? 800 : 400, color: isSelected ? '#fff' : isToday ? tokens.blue : tokens.text, marginBottom: 4 }}>
                    {day}
                    {isToday && !isSelected && <div style={{ width: 5, height: 5, borderRadius: '50%', background: tokens.blue, margin: '1px auto 0' }} />}
                  </div>
                  {dayEvts.slice(0, 2).map((e, ei) => (
                    <div key={ei} style={{ fontSize: 8.5, padding: '1px 4px', borderRadius: 3, marginBottom: 2, background: isSelected ? 'rgba(255,255,255,0.22)' : (e.status === 'Completed' ? tokens.greenLight : tokens.amberLight), color: isSelected ? '#fff' : (e.status === 'Completed' ? tokens.green : tokens.amber), fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.chitName.length > 7 ? e.chitName.slice(0, 7) + '…' : e.chitName}
                    </div>
                  ))}
                  {dayEvts.length > 2 && (
                    <div style={{ fontSize: 8.5, color: isSelected ? 'rgba(255,255,255,0.7)' : tokens.textMuted, paddingLeft: 4 }}>+{dayEvts.length - 2}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${tokens.border}`, flexWrap: 'wrap' }}>
            {[{ color: tokens.amber, label: 'Pending auction' }, { color: tokens.green, label: 'Completed' }, { color: tokens.blue, label: 'Today / Selected' }].map((l, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: tokens.textSub }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />{l.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Right panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionHeader title={`Upcoming Auctions (${upcoming.length})`} />
            {upcoming.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: tokens.textMuted, fontSize: 13 }}>
                No upcoming pending auctions
              </div>
            ) : upcoming.map((u, i) => {
              const d = new Date(u.dateKey + 'T00:00:00');
              const days = Math.floor((d - today) / 86400000);
              const col = days === 0 ? tokens.red : days <= 2 ? tokens.amber : tokens.blue;
              return (
                <div key={i}
                  onClick={() => setSelectedDay(u.dateKey)}
                  style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: i < upcoming.length - 1 ? `1px solid ${tokens.border}` : 'none', cursor: 'pointer', alignItems: 'center' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 11, background: col + '14', border: `1.5px solid ${col}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: col, lineHeight: 1 }}>{d.getDate()}</span>
                    <span style={{ fontSize: 9, color: col, fontWeight: 600 }}>{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.chitName}</div>
                    <div style={{ fontSize: 11, color: tokens.textSub }}>#{u.auctionNumber} · {formatCurrency(u.perHeadValue || 0)}/head</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: col, background: col + '12', padding: '3px 8px', borderRadius: 99, flexShrink: 0 }}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tmrw' : `${days}d`}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      {/* Day popup */}
      {selectedDay && eventsByDate[selectedDay] && (
        <DayPopup
          date={selectedDay}
          events={eventsByDate[selectedDay]}
          onClose={() => setSelectedDay(null)}
          nav={nav}
        />
      )}
    </div>
  );
}
