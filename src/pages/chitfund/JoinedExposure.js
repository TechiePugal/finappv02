// src/pages/chitfund/JoinedExposure.js — Exposure & Risk for chits YOU'VE JOINED
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { Zap, TrendingDown, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, SectionHeader, Table, Badge, Loader, EmptyState, tokens, KPIRow } from '../../components/chitfund/UI';

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
      setChits(list);
      const pairs = await Promise.all(list.map(c => getOtherChitPayments(c.id).then(p => [c.id, p])));
      setPayMap(Object.fromEntries(pairs));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Calculating exposure…" />;

  const enriched = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidMonths = pays.filter(p => p.status === 'Paid');
    const totalPaid = paidMonths.reduce((s, p) => s + (p.amount || 0), 0);
    const totalReceived = pays.reduce((s, p) => s + (p.iWon ? (p.prizeReceived || 0) : 0), 0);
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    const remainingMonths = Math.max(0, (c.totalMembers || 0) - paidMonths.length);
    const isCashed = c.myStatus === 'Cashed';
    // Exposure: money paid in, not yet recovered as prize (0 once cashed and received >= paid)
    const exposure = isCashed ? Math.max(0, totalPaid - totalReceived) : totalPaid;
    const futureLiability = isCashed ? 0 : sub * remainingMonths;
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
        { label: 'Active Joined Chits', value: chits.filter(c => c.myStatus !== 'Cashed').length, sub: 'still paying in' },
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
