/**
 * ExpectedFund.js — a financial planning view for Joined Chits.
 *
 * Answers two questions at a glance: "how much do I owe this month, overall and
 * per chit?" and "if I were to take any of these chits right now, roughly how
 * much would I actually come out ahead (or behind)?"
 *
 * BUG THIS FIXES: a chit marked "Cashed" (you already won your prize) used to
 * be excluded entirely, on the assumption there was nothing left to plan for.
 * That's wrong — most chits still require the FULL subscription every round
 * right up to the last round even after you've already taken the prize early
 * (OtherChits.js's own "Payment pending" alert already reflects this). So a
 * cashed chit is only left out once it's actually fully paid off (every round
 * settled); if it's cashed but still has rounds left to pay, it stays in this
 * view — just without the "if taken now" profit projection, since that
 * scenario no longer applies once you've already taken it.
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
  const round = diff / cycle + 1;
  // BUG FIX: a chit only has `totalMembers` rounds, ever — once its schedule is
  // exhausted (e.g. a 10-month chit that started June 2026 has no round beyond
  // March 2027) there is nothing due in any later month, no matter how far you
  // browse forward. Without this cap the month math kept "finding" round 11,
  // 12... for months after the chit's real term ended, so it kept showing an
  // amount due (and staying visible) long after the chit had actually run its
  // full course.
  if (chit.totalMembers && round > chit.totalMembers) return null;
  return round;
}

// Which round number was this chit ACTUALLY taken on? Needed so "cashed"
// status only applies from that round onward, not retroactively to rounds
// that happened before the chit was ever taken (see chitLike below).
function cashRoundOf(c) {
  if (c.myStatus !== 'Cashed' || !c.actualTakeMonth) return null;
  return roundForMonth(c, c.actualTakeMonth);
}

// The calendar month of this chit's very LAST scheduled round (e.g. a 10-month
// chit starting June 2026 ends March 2027) — used to drop a chit from this view
// once you've browsed past its real closing month, even if a payment or two
// was never actually recorded (so it isn't "fully paid off" by that count
// alone). A chit fund with a fixed number of rounds simply has nothing left to
// expect once its own schedule has run out, regardless of bookkeeping gaps.
function scheduleEndMonth(chit) {
  if (!chit.startMonth || !chit.totalMembers) return null;
  const cycle = chit.auctionInterval || 1;
  if (chit.frequencyType === 'Days') {
    const [sy, sm] = chit.startMonth.split('-').map(Number);
    const d = new Date(sy, sm - 1, 1);
    d.setDate(d.getDate() + (chit.totalMembers - 1) * cycle);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return shiftMonth(chit.startMonth, (chit.totalMembers - 1) * cycle);
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
      // Fetch payments for every chit first — whether a cashed chit still
      // belongs in this view depends on whether it's actually fully paid off,
      // which we can't know until we've counted its payments.
      const pm = {};
      await Promise.all(list.map(async c => { pm[c.id] = await getOtherChitPayments(c.id); }));
      const relevant = list.filter(c => {
        if (c.myStatus !== 'Cashed') return true; // not yet cashed — always relevant
        const paidCount = (pm[c.id] || []).filter(p => p.status === 'Paid').length;
        return paidCount < (c.totalMembers || 0); // cashed, but still owes future rounds
      });
      setChits(relevant);
      setPayMap(pm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Calculating expected fund…" />;

  const rows = chits.map(c => {
    const isCashed = c.myStatus === 'Cashed';
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
    // BUG FIX: mystatus was hardcoded to 'active' here even for a chit already
    // marked Cashed, so getExpectedPayable always applied the pre-cash
    // commission-adjusted rate. Once cashed, the real obligation is the FULL
    // subscription every remaining round (getExpectedPayable already knows
    // this — it just needs to be told the chit's actual status).
    // FURTHER BUG FIX (round-aware): that "cashed" flag used to apply to EVERY
    // round unconditionally — so a chit taken in, say, round 4 of 10 was showing
    // the post-cash full-subscription rate even when browsing back to rounds
    // 1-3, which happened before it was ever taken and should still show the
    // normal pre-cash commission-adjusted amount. Now cashed-mystatus is only
    // applied to the round actually being viewed when that round is at or after
    // the chit's real take-round (cashRoundOf); earlier rounds stay 'active'.
    const cashRound = cashRoundOf(c);
    const cashedForThisRound = isCashed && (cashRound === null || monthRound >= cashRound);
    const chitLike = {
      totalChitValue: c.totalChitValue, totalMembers: c.totalMembers,
      mystatus: cashedForThisRound ? 'cashed' : 'active', commissionType: c.commissionType || 'Single',
      range1: c.range1 || 0, range2: c.range2 || 0, range3: c.range3 || 0, range4: c.range4 || 0,
    };
    const expectedThisMonth = isDueThisMonth ? getExpectedPayable(chitLike, monthRound) : 0;

    // "If taken now" is a projection for chits NOT yet taken — once a chit is
    // already cashed there's no "if taken now" scenario left, so these are
    // left null and the card shows the remaining payoff instead.
    let estPrize = null, remainingRounds = 0, futureCostIfTakenNow = 0, netIfTakenNow = null;
    if (!isCashed) {
      // Profit if taken now — same conservative methodology used elsewhere in the app
      // (assumes a ~15% discount bid, i.e. the winner collects the chit value minus
      // roughly 85% of one subscription as the going bid). This is an ESTIMATE, not
      // a guarantee — actual auction bids vary and aren't something this app controls
      // for a chit run by someone else.
      const estBid = sub * 0.85;
      estPrize = Math.max(0, (c.totalChitValue || 0) - estBid);
      remainingRounds = Math.max(0, (c.totalMembers || 0) - currentRound);
      futureCostIfTakenNow = sub * remainingRounds; // full subscription for all remaining rounds once taken
      // Net position if taken now: prize received now, minus everything ever paid in total
      // (what's already sunk, plus full-price rounds still owed after taking).
      const totalOutlayIfTakenNow = totalPaidSoFar + futureCostIfTakenNow;
      netIfTakenNow = estPrize - totalOutlayIfTakenNow;
    }
    const remainingRoundsToPayOff = Math.max(0, (c.totalMembers || 0) - paidCount);
    // BUG FIX: a chit with a fixed number of rounds (e.g. 10 monthly rounds
    // starting June 2026) has genuinely nothing left to expect once you browse
    // past its real closing month (March 2027) — even if a round or two was
    // never actually marked paid on record, there's no round #11 coming. Without
    // this, such a chit kept showing up indefinitely as "Not due this month"
    // long after it had actually run its full course.
    const endMonth = scheduleEndMonth(c);
    const pastScheduleEnd = endMonth !== null && viewMonth > endMonth;

    return {
      ...c, isCashed, pays, paidCount, sub, round, currentRound, isDueThisMonth, expectedThisMonth, totalPaidSoFar,
      estPrize, remainingRounds, futureCostIfTakenNow, netIfTakenNow, remainingRoundsToPayOff, pastScheduleEnd,
    };
  }).filter(r => !r.pastScheduleEnd);

  const totalExpectedThisMonth = rows.reduce((s, r) => s + r.expectedThisMonth, 0);
  const takeableRows = rows.filter(r => !r.isCashed);
  const bestOpportunity = takeableRows.length > 0 ? [...takeableRows].sort((a, b) => b.netIfTakenNow - a.netIfTakenNow)[0] : null;

  return (
    <div>
      <PageHeader title="Expected Fund" subtitle="What you're expected to pay, overall and per chit — and what taking any chit now would net you"
        action={rows.length > 0 && (
          <button onClick={() => printJoinedFundProjection(rows.map(r => ({ ...r, isPaidThisMonth: false, isCashed: r.isCashed, nextRound: r.round, chitName: r.chitName, companyName: r.companyName })), fmtMo(viewMonth), 0)}
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
        <StatCard label="Active Chits" value={rows.length} sub="fully paid off or past their term excluded" icon={Layers} accent="#5521B5" />
        {bestOpportunity && (
          <StatCard label="Best Opportunity If Taken Now" value={formatCurrency(Math.abs(bestOpportunity.netIfTakenNow))}
            sub={bestOpportunity.netIfTakenNow >= 0 ? `${bestOpportunity.chitName || bestOpportunity.companyName} · est. net gain` : `${bestOpportunity.chitName || bestOpportunity.companyName} · est. net cost`}
            icon={bestOpportunity.netIfTakenNow >= 0 ? TrendingUp : TrendingDown} accent={bestOpportunity.netIfTakenNow >= 0 ? tokens.green : tokens.red} />
        )}
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text, marginBottom: 6 }}>No joined chits with anything left to pay</div>
          <div style={{ fontSize: 13, color: tokens.textSub }}>Chits that are fully paid off don't need fund planning, so they're left out of this view.</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: tokens.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {r.chitName || r.companyName}
                    {r.isCashed && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: tokens.greenLight, color: tokens.green, border: '1px solid rgba(5,122,85,0.25)' }}>✓ CASHED</span>
                    )}
                  </div>
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
                {r.isCashed ? (
                  <span>Rounds still owed: <strong style={{ color: tokens.text }}>{r.remainingRoundsToPayOff}</strong> <span style={{ color: tokens.textMuted }}>· prize already received</span></span>
                ) : (
                  <>
                    <span>Est. prize if taken now: <strong style={{ color: tokens.text }}>{formatCurrency(r.estPrize)}</strong> <span style={{ color: tokens.textMuted }}>(approx.)</span></span>
                    <span>If taken now, net: <strong style={{ color: r.netIfTakenNow >= 0 ? tokens.green : tokens.red }}>{r.netIfTakenNow >= 0 ? '+' : '−'}{formatCurrency(Math.abs(r.netIfTakenNow))}</strong></span>
                  </>
                )}
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
