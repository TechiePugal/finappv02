// src/pages/chitfund/JoinedAuctions.js — "Auctions" equivalent for chits YOU'VE JOINED.
// Since you're a paying member (not the organiser), this shows your payment schedule
// per joined chit — next due round, recent history — rather than a member-collection UI.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, CheckCircle, Clock, ArrowRight, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { getExpectedPayable } from '../../utils/cf_engine';
import { printJoinedFundProjection } from '../../utils/cf_pdfReport';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, Badge, Loader, EmptyState, tokens, SectionHeader } from '../../components/chitfund/UI';

function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
function fmtMo(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); }
function shiftMonth(m, delta) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
// Which round number (1-based) does a given month correspond to for this chit,
// respecting its own auction interval and Days/Months frequency?
function roundForMonth(chit, targetMonth) {
  if (!chit.startMonth) return null;
  const cycle = chit.auctionInterval || 1;
  if (chit.frequencyType === 'Days') {
    const [sy, sm] = chit.startMonth.split('-').map(Number);
    const start = new Date(sy, sm - 1, 1);
    for (let i = 0; i < (chit.totalMembers || 60); i++) {
      const d = new Date(start); d.setDate(d.getDate() + i * cycle);
      const mo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (mo === targetMonth) return i + 1;
    }
    return null;
  }
  const [sy, sm] = chit.startMonth.split('-').map(Number);
  const [ty, tm] = targetMonth.split('-').map(Number);
  const diff = (ty * 12 + tm) - (sy * 12 + sm);
  if (diff < 0 || diff % cycle !== 0) return null;
  return diff / cycle + 1;
}

export default function JoinedAuctions() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chits, setChits] = useState([]);
  const [payMap, setPayMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(curMonth()); // navigable — prev/next buttons shift this

  useEffect(() => {
    if (!user) return;
    getOtherChits(user.uid).then(async list => {
      setChits(list);
      const pairs = await Promise.all(list.map(c => getOtherChitPayments(c.id).then(p => [c.id, p])));
      setPayMap(Object.fromEntries(pairs));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Loading your chit rounds…" />;

  const rows = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidCount = pays.filter(p => p.status === 'Paid').length;
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    const viewedPay = pays.find(p => p.month === viewMonth);
    const isPaidThisMonth = viewedPay && viewedPay.status === 'Paid';
    const isCashed = c.myStatus === 'Cashed';
    const currentRound = paidCount + 1;
    // BUG FIX: roundForMonth returns null when the viewed month isn't actually a
    // payout month for this chit's own cycle (e.g. every-5-months chits only owe
    // something once every 5 months, not every single month). The old fallback to
    // (paidCount + 1) treated every month as due — fixed to show nothing owed
    // on months that genuinely have no obligation.
    const monthRound = roundForMonth(c, viewMonth);
    const isDueThisMonth = monthRound !== null;
    const viewedRound = monthRound || currentRound;
    const nextRound = viewedRound;
    // Adapter matching what getExpectedPayable expects — mirrors OtherChits.js's toChitLike()
    const chitLike = {
      totalChitValue: c.totalChitValue, totalMembers: c.totalMembers,
      mystatus: isCashed ? 'cashed' : 'active', commissionType: c.commissionType || 'Single',
      range1: c.range1 || 0, range2: c.range2 || 0, range3: c.range3 || 0, range4: c.range4 || 0,
    };
    // The real fund-projection rule: if this ticket has ALREADY been taken (cashed),
    // every future payment is the FULL subscription — no more discount. If not yet
    // taken, use the configured commission-range ESTIMATE as the expected (discounted)
    // amount, falling back to full subscription if no range was set. And critically,
    // if this month isn't a payout month at all for this chit's cycle, nothing is owed.
    const expectedThisMonth = !isDueThisMonth ? 0 : (isCashed ? sub : getExpectedPayable(chitLike, nextRound));
    return { ...c, pays, paidCount, sub, expectedThisMonth, isPaidThisMonth, isCashed, isDueThisMonth, nextRound, currentRound, chitLike, recent: [...pays].sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 3) };
  });

  const dueNow = rows.filter(r => !r.isCashed && !r.isPaidThisMonth && r.isDueThisMonth);
  const upToDate = rows.filter(r => !r.isCashed && r.isPaidThisMonth);
  const cashedOut = rows.filter(r => r.isCashed);
  const activeRows = rows.filter(r => !r.isCashed); // the visible card list never shows cashed-out chits

  const totalDueAmount = dueNow.reduce((s, r) => s + r.expectedThisMonth, 0); // uses real taken/not-taken projection, not flat subscription

  // Fund-level profit/loss — only meaningful once a chit has actually been cashed
  // (prize received vs total paid in across all rounds so far).
  const realizedPL = cashedOut.reduce((s, r) => {
    const totalPaidIn = r.pays.filter(p => p.status === 'Paid').reduce((ss, p) => ss + (p.amount || 0), 0);
    return s + ((r.prizeReceived || 0) - totalPaidIn);
  }, 0);

  return (
    <div>
      <PageHeader title="Auctions — Joined Chits" subtitle="Your round-by-round payment schedule across chits you've joined" />

      {/* Month navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <button onClick={()=>setViewMonth(m=>shiftMonth(m,-1))} style={{ width:34, height:34, borderRadius:9, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:15, fontFamily:'inherit' }}>‹</button>
        <div style={{ fontSize:14.5, fontWeight:700, color:tokens.text, minWidth:130, textAlign:'center' }}>{fmtMo(viewMonth)}</div>
        <button onClick={()=>setViewMonth(m=>shiftMonth(m,1))} style={{ width:34, height:34, borderRadius:9, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:15, fontFamily:'inherit' }}>›</button>
        {viewMonth !== curMonth() && (
          <button onClick={()=>setViewMonth(curMonth())} style={{ padding:'7px 14px', borderRadius:9, border:`1px solid ${tokens.border}`, background:tokens.slateLight, cursor:'pointer', fontSize:12.5, fontWeight:600, color:tokens.textSub, fontFamily:'inherit' }}>Back to This Month</button>
        )}
        {chits.length > 0 && (
          <button onClick={()=>printJoinedFundProjection(rows, fmtMo(viewMonth), realizedPL)} style={{ marginLeft:'auto', padding:'8px 16px', borderRadius:9, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, color:tokens.text, fontFamily:'inherit' }}>🖨 Export PDF</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 13, marginBottom: 16 }}>
        <StatCard label="Payment Due Now" value={dueNow.length} sub={formatCurrency(totalDueAmount) + ' owed'} icon={Clock} accent={tokens.amber} />
        <StatCard label="Up to Date" value={upToDate.length} sub="paid this month" icon={CheckCircle} accent={tokens.green} />
        <StatCard label="Cashed Out" value={cashedOut.length} sub="already took prize" icon={Trophy} accent="#5521B5" />
        <StatCard label="Total Joined" value={chits.length} sub="chits" icon={Gavel} accent={tokens.blue} />
      </div>

      {cashedOut.length > 0 && (
        <Card style={{ marginBottom: 20, background: realizedPL >= 0 ? 'rgba(5,150,105,0.05)' : 'rgba(220,38,38,0.05)', border: `1px solid ${realizedPL >= 0 ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Realized Profit / Loss (Cashed-Out Chits)</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: realizedPL >= 0 ? tokens.green : tokens.red }}>
            {realizedPL >= 0 ? '+' : '−'}{formatCurrency(Math.abs(realizedPL))}
          </div>
          <div style={{ fontSize: 12, color: tokens.textSub, marginTop: 4 }}>Prize received minus everything paid in, across all {cashedOut.length} chit{cashedOut.length !== 1 ? 's' : ''} you've already taken.</div>
        </Card>
      )}

      {dueNow.length > 0 && (
        <Card style={{ marginBottom: 20, background: 'rgba(37,99,235,0.04)', border: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: 12, color: tokens.textSub, lineHeight: 1.6 }}>
            💡 <strong>General guideline on when to take a chit:</strong> the earlier you take it, the more months you'll keep paying the full subscription with no more discount — but you get access to a lump sum sooner. The later you take it, the more discounted months you enjoy first, but you compete with fewer people for the pot near the end. There's no single "right" round — weigh it against your own cash-flow needs.
          </div>
        </Card>
      )}

      {activeRows.length === 0 ? (
        <Card><EmptyState icon={Gavel} title="No active joined chits" subtitle="Chits you've already cashed out don't need round-by-round tracking anymore" /></Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {activeRows.map(r => (
            <Card key={r.id} noPad>
              <div onClick={() => nav('/cf/other-chits')} style={{ cursor: 'pointer', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: tokens.text }}>{r.companyName}</span>
                    <Badge status={r.isCashed ? 'Cashed' : r.isPaidThisMonth ? 'Paid' : 'Due'} />
                  </div>
                  <div style={{ fontSize: 12, color: tokens.textSub }}>
                    Round #{r.nextRound} of {r.totalMembers} · Subscription {formatCurrency(r.sub)}/month · Expected {formatCurrency(r.expectedThisMonth)}{r.expectedThisMonth < r.sub ? ' (discounted)' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {!r.isCashed && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>This Month</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: r.isPaidThisMonth ? tokens.green : tokens.amber }}>
                        {r.isPaidThisMonth ? '✓ Paid' : formatCurrency(r.expectedThisMonth)}
                      </div>
                    </div>
                  )}
                  <ArrowRight size={16} color={tokens.textMuted} />
                </div>
              </div>
              {r.recent.length > 0 && (
                <div style={{ borderTop: `1px solid ${tokens.border}`, padding: '10px 18px', display: 'flex', gap: 18, flexWrap: 'wrap', background: tokens.slateLight }}>
                  {r.recent.map((p, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: tokens.textSub }}>
                      {fmtMo(p.month)}: <strong style={{ color: p.status === 'Paid' ? tokens.green : tokens.red }}>{p.status === 'Paid' ? '✓ Paid' : 'Unpaid'}</strong>
                      {p.iWon && <span style={{ color: '#5521B5', fontWeight: 700 }}> 🏆 Won {formatCurrency(p.prizeReceived || 0)}</span>}
                    </div>
                  ))}
                </div>
              )}
              {!r.isCashed && (
                <div style={{ borderTop: `1px solid ${tokens.border}`, padding: '10px 18px', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Next 3 Months (Projected)</span>
                  {[0, 1, 2].map(i => {
                    const round = r.nextRound + i;
                    if (round > r.totalMembers) return null;
                    const expected = getExpectedPayable(r.chitLike, round);
                    return (
                      <div key={i} style={{ fontSize: 11.5, color: tokens.textSub }}>
                        Round #{round}: <strong style={{ color: tokens.text }}>{formatCurrency(expected)}</strong>
                        {expected < r.sub && <span style={{ color: tokens.green }}> (discounted)</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
