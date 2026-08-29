/**
 * ExpectedFund.js — a financial planning view for Joined Chits.
 *
 * Answers two questions at a glance: "how much do I owe this month, overall and
 * per chit?" and "if I were to take any of these chits right now, roughly how
 * much would I actually come out ahead (or behind)?"
 *
 * Only ACTIVE chits are shown — anything already cashed out (closed/over) is
 * excluded entirely, since there's nothing left to plan for on those.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { getExpectedPayable } from '../../utils/cf_engine';
import { printJoinedFundProjection } from '../../utils/cf_pdfReport';
import { formatCurrency } from '../../utils/cf_format';
import { tokens, Card, PageHeader, StatCard, Loader } from '../../components/chitfund/UI';
import { Wallet, TrendingUp, TrendingDown, Layers } from 'lucide-react';

function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
function fmtMo(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function shiftMonth(m, delta) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }

// Which round number does a given month fall on for this chit? Respects both
// Days- and Months-based auction frequency.
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

export default function ExpectedFund() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [payMap, setPayMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(curMonth());

  useEffect(() => {
    if (!user) return;
    getOtherChits(user.uid).then(async list => {
      // Only ACTIVE chits — anything already cashed (closed/over) is excluded entirely.
      const active = list.filter(c => c.myStatus !== 'Cashed');
      setChits(active);
      const pm = {};
      await Promise.all(active.map(async c => { pm[c.id] = await getOtherChitPayments(c.id); }));
      setPayMap(pm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Calculating expected fund…" />;

  const rows = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidCount = pays.filter(p => p.status === 'Paid').length;
    const totalPaidSoFar = pays.filter(p => p.status === 'Paid').reduce((s, p) => s + (p.amount || 0), 0);
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    const currentRound = paidCount + 1; // overall progress, regardless of which month is being viewed
    // BUG FIX: roundForMonth returns null when the viewed month ISN'T actually an
    // auction/payout month for this chit's own cycle (e.g. a 5-month cycle chit has
    // no obligation in 4 out of every 5 months). The old code fell back to treating
    // every month as due, which is exactly the "shows full subscription every single
    // month" bug — now a non-payout month correctly shows nothing owed.
    const monthRound = roundForMonth(c, viewMonth);
    const isDueThisMonth = monthRound !== null;
    const round = monthRound || currentRound; // for display/profit calcs when a round number is still needed
    const chitLike = {
      totalChitValue: c.totalChitValue, totalMembers: c.totalMembers,
      mystatus: 'active', commissionType: c.commissionType || 'Single',
      range1: c.range1 || 0, range2: c.range2 || 0, range3: c.range3 || 0, range4: c.range4 || 0,
    };
    const expectedThisMonth = isDueThisMonth ? getExpectedPayable(chitLike, monthRound) : 0;

    // Profit if taken now — same conservative methodology used elsewhere in the app
    // (assumes a ~15% discount bid, i.e. the winner collects the chit value minus
    // roughly 85% of one subscription as the going bid). This is an ESTIMATE, not
    // a guarantee — actual auction bids vary and aren't something this app controls
    // for a chit run by someone else.
    const estBid = sub * 0.85;
    const estPrize = Math.max(0, (c.totalChitValue || 0) - estBid);
    const remainingRounds = Math.max(0, (c.totalMembers || 0) - currentRound);
    const futureCostIfTakenNow = sub * remainingRounds; // full subscription for all remaining rounds once taken
    // Net position if taken now: prize received now, minus everything ever paid in total
    // (what's already sunk, plus full-price rounds still owed after taking).
    const totalOutlayIfTakenNow = totalPaidSoFar + futureCostIfTakenNow;
    const netIfTakenNow = estPrize - totalOutlayIfTakenNow;

    return {
      ...c, pays, paidCount, sub, round, currentRound, isDueThisMonth, expectedThisMonth, totalPaidSoFar,
      estPrize, remainingRounds, futureCostIfTakenNow, netIfTakenNow,
    };
  });

  const totalExpectedThisMonth = rows.reduce((s, r) => s + r.expectedThisMonth, 0);
  const bestOpportunity = rows.length > 0 ? [...rows].sort((a, b) => b.netIfTakenNow - a.netIfTakenNow)[0] : null;

  return (
    <div>
      <PageHeader title="Expected Fund" subtitle="What you're expected to pay, overall and per chit — and what taking any chit now would net you"
        action={rows.length > 0 && (
          <button onClick={() => printJoinedFundProjection(rows.map(r => ({ ...r, isPaidThisMonth: false, isCashed: false, nextRound: r.round, chitName: r.chitName, companyName: r.companyName })), fmtMo(viewMonth), 0)}
            style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tokens.text, fontFamily: 'inherit' }}>
            🖨 Export PDF
          </button>
        )} />

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => setViewMonth(m => shiftMonth(m, -1))} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text, minWidth: 150, textAlign: 'center' }}>{fmtMo(viewMonth)}</div>
        <button onClick={() => setViewMonth(m => shiftMonth(m, 1))} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', fontSize: 15, fontFamily: 'inherit' }}>›</button>
        {viewMonth !== curMonth() && (
          <button onClick={() => setViewMonth(curMonth())} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${tokens.border}`, background: tokens.slateLight, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: tokens.textSub, fontFamily: 'inherit' }}>This Month</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label={`Expected — ${fmtMo(viewMonth)}`} value={formatCurrency(totalExpectedThisMonth)} sub={`across ${rows.length} active chit${rows.length !== 1 ? 's' : ''}`} icon={Wallet} accent={tokens.blue} />
        <StatCard label="Active Chits" value={rows.length} sub="cashed-out chits excluded" icon={Layers} accent="#5521B5" />
        {bestOpportunity && (
          <StatCard label="Best Opportunity If Taken Now" value={formatCurrency(Math.abs(bestOpportunity.netIfTakenNow))}
            sub={bestOpportunity.netIfTakenNow >= 0 ? `${bestOpportunity.chitName || bestOpportunity.companyName} · est. net gain` : `${bestOpportunity.chitName || bestOpportunity.companyName} · est. net cost`}
            icon={bestOpportunity.netIfTakenNow >= 0 ? TrendingUp : TrendingDown} accent={bestOpportunity.netIfTakenNow >= 0 ? tokens.green : tokens.red} />
        )}
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text, marginBottom: 6 }}>No active joined chits</div>
          <div style={{ fontSize: 13, color: tokens.textSub }}>Chits you've already cashed out don't need fund planning, so they're left out of this view.</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: tokens.text }}>{r.chitName || r.companyName}</div>
                  <div style={{ fontSize: 11.5, color: tokens.textSub, marginTop: 2 }}>{r.chitName && r.companyName}{r.chitName ? ' · ' : ''}Round #{r.round} of {r.totalMembers} · Sub {formatCurrency(r.sub)}/round</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase' }}>{fmtMo(viewMonth)}</div>
                  {r.isDueThisMonth ? (
                    <div style={{ fontSize: 17, fontWeight: 800, color: tokens.blue }}>{formatCurrency(r.expectedThisMonth)}</div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted }}>Not due this month</div>
                  )}
                </div>
              </div>
              <div style={{ padding: '10px 18px', background: tokens.slateLight, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 11.5, color: tokens.textSub, borderTop: `1px solid ${tokens.border}` }}>
                <span>Paid so far: <strong style={{ color: tokens.text }}>{formatCurrency(r.totalPaidSoFar)}</strong></span>
                <span>Est. prize if taken now: <strong style={{ color: tokens.text }}>{formatCurrency(r.estPrize)}</strong> <span style={{ color: tokens.textMuted }}>(approx.)</span></span>
                <span>If taken now, net: <strong style={{ color: r.netIfTakenNow >= 0 ? tokens.green : tokens.red }}>{r.netIfTakenNow >= 0 ? '+' : '−'}{formatCurrency(Math.abs(r.netIfTakenNow))}</strong></span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: tokens.textMuted, lineHeight: 1.6 }}>
        "Est. prize if taken now" and "net if taken now" are rough estimates based on a typical ~15% discount bid — actual auction results for chits run by someone else can vary. Use these as a planning guide, not a guarantee.
      </div>
    </div>
  );
}
