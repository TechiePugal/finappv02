// src/pages/chitfund/JoinedExposure.js — Exposure & Risk for chits YOU'VE JOINED
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Zap, TrendingDown, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { getExpectedPayable } from '../../utils/cf_engine';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, SectionHeader, Table, Badge, Loader, EmptyState, tokens, KPIRow } from '../../components/chitfund/UI';

// Which round number does a given month fall on for this chit — same logic
// used on Expected Fund / Auctions / Calendar so every screen agrees.
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
// Which round was this chit ACTUALLY taken on — "cashed" only applies to the
// future-liability of rounds at/after this one, not rounds that already
// happened before the chit was ever taken.
function cashRoundOf(c) {
  if (c.myStatus !== 'Cashed' || !c.actualTakeMonth) return null;
  return roundForMonth(c, c.actualTakeMonth);
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${tokens.border}`, borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: tokens.textSub }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.fill }} />
          <span style={{ fontSize: 12, color: tokens.textSub }}>{p.name}:</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: tokens.text }}>{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function JoinedExposure() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chits, setChits] = useState([]);
  const [payMap, setPayMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getOtherChits(user.uid).then(async list => {
      // BUG FIX: this used to drop every "Cashed" chit outright, on the assumption
      // there's nothing left to be "at risk" on once taken — same mistaken
      // assumption fixed elsewhere (Expected Fund, Auctions). Most chits still owe
      // the full subscription every remaining round after being taken, so a cashed
      // chit only truly has zero future liability once it's actually fully paid
      // off. Need payments fetched first to know which is which.
      const pm = {};
      await Promise.all(list.map(async c => { pm[c.id] = await getOtherChitPayments(c.id); }));
      const relevant = list.filter(c => {
        const paidCount = (pm[c.id] || []).filter(p => p.status === 'Paid').length;
        return paidCount < (c.totalMembers || 0); // still owes something, cashed or not
      });
      setChits(relevant);
      setPayMap(pm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Calculating exposure…" />;

  const enriched = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidMonths = pays.filter(p => p.status === 'Paid');
    const paidCount = paidMonths.length;
    const totalPaid = paidMonths.reduce((s, p) => s + (p.amount || 0), 0);
    // BUG FIX: this only counted a prize if some individual PAYMENT record had
    // iWon set — but backfilled/historical rows never carry iWon at all, only the
    // chit's own prizeReceived field (set once, when you mark it taken) does. That
    // meant "Prize Received" showed ₹0 for every cashed chit regardless of the
    // real prize, on top of cashed chits being excluded from this page entirely.
    // Prefer the chit's own recorded prize; fall back to summing payment rows for
    // older data that predates that field being set reliably.
    const totalReceived = (c.prizeReceived || 0) || pays.reduce((s, p) => s + (p.iWon ? (p.prizeReceived || 0) : 0), 0);
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    const isCashed = c.myStatus === 'Cashed';
    // Current Exposure: strictly what's actually been paid out to date — full stop.
    // (Netting the prize against it here used to conflate "money paid in" with "net
    // position", which is what the separate Net Position KPI further down is for.)
    const exposure = totalPaid;
    // Future Liability: sum of what's actually still owed for each remaining round —
    // using the same per-round commission-aware amount used everywhere else in the
    // app (getExpectedPayable), not a flat subscription guess. This also no longer
    // zeroes out just because the chit was cashed — a cashed Single-commission
    // chit still owes the full subscription every remaining round; a cashed
    // Double-commission chit keeps getting its discount. Only a fully paid-off
    // chit (already excluded above) has zero future liability.
    // BUG FIX (round-aware): a single chitLike used to be applied to EVERY
    // remaining round — so if a chit was cashed partway through, rounds that
    // hadn't been paid yet but happened BEFORE the actual take-round were still
    // being charged the post-cash full-subscription rate. Now each round in the
    // loop below gets its own cashed/active status based on whether it's at or
    // after the real take-round.
    const cashRound = cashRoundOf(c);
    let futureLiability = 0;
    for (let r = paidCount + 1; r <= (c.totalMembers || 0); r++) {
      const cashedForThisRound = isCashed && (cashRound === null || r >= cashRound);
      const chitLike = {
        totalChitValue: c.totalChitValue, totalMembers: c.totalMembers,
        mystatus: cashedForThisRound ? 'cashed' : 'active', commissionType: c.commissionType || 'Single',
        range1: c.range1 || 0, range2: c.range2 || 0, range3: c.range3 || 0, range4: c.range4 || 0,
      };
      futureLiability += getExpectedPayable(chitLike, r);
    }
    const totalRisk = exposure + futureLiability;
    return { ...c, totalPaid, totalReceived, exposure, futureLiability, totalRisk, isCashed };
  });

  const totalExposure = enriched.reduce((s, c) => s + c.exposure, 0);
  const totalFuture = enriched.reduce((s, c) => s + c.futureLiability, 0);
  const totalRisk = enriched.reduce((s, c) => s + c.totalRisk, 0);
  const totalReceived = enriched.reduce((s, c) => s + c.totalReceived, 0);

  const chartData = enriched.slice(0, 8).map(c => ({
    name: c.companyName?.length > 10 ? c.companyName.slice(0, 10) + '…' : c.companyName,
    exposure: c.exposure, future: c.futureLiability, received: c.totalReceived,
  }));

  const cols = [
    { key: 'companyName', header: 'Chit Fund', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'totalPaid', header: 'Total Paid', render: v => formatCurrency(v || 0), align: 'right' },
    { key: 'totalReceived', header: 'Prize Received', render: v => <span style={{ color: tokens.green, fontWeight: 600 }}>{formatCurrency(v || 0)}</span>, align: 'right' },
    { key: 'exposure', header: 'Current Exposure', render: v => <span style={{ color: v > 0 ? tokens.red : tokens.green, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'futureLiability', header: 'Future Liability', render: v => <span style={{ color: tokens.amber, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'totalRisk', header: 'Total Risk', render: v => <span style={{ color: tokens.red, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'myStatus', header: 'Status', render: v => <Badge status={v || 'Active'} /> },
    { key: 'id', header: '', render: () => <ChevronRight size={14} color={tokens.textMuted} /> },
  ];

  return (
    <div>
      <PageHeader title="Exposure & Risk — Joined Chits" subtitle="Your money at risk and remaining commitment across chits you've joined" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label="Current Exposure" value={formatCurrency(totalExposure)} sub="Paid, not yet recovered" icon={Zap} accent={tokens.red} />
        <StatCard label="Future Liability" value={formatCurrency(totalFuture)} sub="Remaining subscriptions" icon={TrendingDown} accent={tokens.amber} />
        <StatCard label="Total Risk" value={formatCurrency(totalRisk)} sub="Exposure + Future" icon={AlertCircle} accent="#5521B5" />
        <StatCard label="Prize Received" value={formatCurrency(totalReceived)} sub="All joined chits" icon={TrendingUp} accent={tokens.green} />
      </div>

      <KPIRow items={[
        { label: 'Joined Chits With Balance Due', value: chits.length, sub: 'still owe something' },
        { label: 'Highest Exposure Chit', value: enriched.length > 0 ? enriched.reduce((a, b) => a.exposure > b.exposure ? a : b).companyName : '—', sub: 'largest amount at risk' },
        { label: 'Total Paid In', value: formatCurrency(enriched.reduce((s, c) => s + c.totalPaid, 0)), color: tokens.red },
        { label: 'Net Position', value: formatCurrency(totalReceived - totalExposure - totalFuture), color: (totalReceived - totalExposure - totalFuture) >= 0 ? tokens.green : tokens.red, sub: 'received minus risk' },
      ]} />

      {chartData.length > 0 && (
        <Card style={{ marginTop: 18, marginBottom: 18 }}>
          <SectionHeader title="Exposure vs Future Liability" sub="Per joined chit breakdown" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barSize={20}>
              <CartesianGrid strokeDasharray="2 4" stroke={tokens.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.textSub }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tokens.textSub }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: tokens.slateLight }} />
              <Legend wrapperStyle={{ fontSize: 12, color: tokens.textSub }} />
              <Bar dataKey="exposure" name="Current Exposure" fill={tokens.red} radius={[3, 3, 0, 0]} />
              <Bar dataKey="future" name="Future Liability" fill={tokens.amber} radius={[3, 3, 0, 0]} />
              <Bar dataKey="received" name="Prize Received" fill={tokens.green} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card noPad>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tokens.border}` }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.text }}>Chit-wise Risk Report</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textSub }}>Detailed exposure analysis per joined chit</p>
        </div>
        {enriched.length > 0
          ? <Table columns={cols} data={enriched} onRowClick={() => nav('/cf/other-chits')} />
          : <EmptyState icon={Zap} title="No joined chits" subtitle="Join a chit fund to view risk data" />
        }
      </Card>
    </div>
  );
}
