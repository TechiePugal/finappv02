// src/pages/Exposure.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from 'recharts';
import { Zap, TrendingDown, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { calcExposure, calcFutureLiability } from '../../utils/cf_engine';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, SectionHeader, Table, Badge, Loader, EmptyState, tokens, KPIRow } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

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

export default function Exposure() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(d => { setData(d); setLoading(false); });
  }, [user]);

  if (loading) return <Loader text="Calculating exposure…" />;

  const chits = data?.chits || [];

  const enriched = chits.map(c => ({
    ...c,
    exposure: calcExposure(c.totalInvested || 0, c.totalCommissionEarned || 0),
    futureLiability: calcFutureLiability(c, c.auctionsCompleted || 0, c.companyTakenAuction),
  })).map(c => ({ ...c, totalRisk: c.exposure + c.futureLiability }));

  const totalExposure = enriched.reduce((s, c) => s + c.exposure, 0);
  const totalFuture = enriched.reduce((s, c) => s + c.futureLiability, 0);
  const totalRisk = enriched.reduce((s, c) => s + c.totalRisk, 0);
  const totalCommission = chits.reduce((s, c) => s + (c.totalCommissionEarned || 0), 0);

  const chartData = enriched.slice(0, 8).map(c => ({
    name: c.companyName?.length > 10 ? c.companyName.slice(0, 10) + '…' : c.companyName,
    exposure: c.exposure,
    future: c.futureLiability,
    commission: c.totalCommissionEarned || 0,
  }));

  const cols = [
    { key: 'companyName', header: 'Chit Fund', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'totalInvested', header: 'Invested', render: v => formatCurrency(v || 0), align: 'right' },
    { key: 'totalCommissionEarned', header: 'Commission', render: v => <span style={{ color: tokens.green, fontWeight: 600 }}>{formatCurrency(v || 0)}</span>, align: 'right' },
    { key: 'exposure', header: 'Current Exposure', render: v => <span style={{ color: v > 0 ? tokens.red : tokens.green, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'futureLiability', header: 'Future Liability', render: v => <span style={{ color: tokens.amber, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'totalRisk', header: 'Total Risk', render: v => <span style={{ color: tokens.red, fontWeight: 700 }}>{formatCurrency(v)}</span>, align: 'right' },
    { key: 'status', header: 'Status', render: v => <Badge status={v} /> },
    { key: 'id', header: '', render: v => <ChevronRight size={14} color={tokens.textMuted} /> },
  ];

  return (
    <div>
      <PageHeader title="Exposure & Risk" subtitle="Monitor current exposure, future liability and total risk across all chit funds" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label="Current Exposure" value={formatCurrency(totalExposure)} sub="Invested minus received" icon={Zap} accent={tokens.red} />
        <StatCard label="Future Liability" value={formatCurrency(totalFuture)} sub="Remaining auctions" icon={TrendingDown} accent={tokens.amber} />
        <StatCard label="Total Risk" value={formatCurrency(totalRisk)} sub="Exposure + Future" icon={AlertCircle} accent="#5521B5" />
        <StatCard label="Commission Earned" value={formatCurrency(totalCommission)} sub="All chits combined" icon={TrendingUp} accent={tokens.green} />
      </div>

      {/* Risk overview */}
      <KPIRow items={[
        { label: 'Active Chits', value: chits.filter(c => c.status === 'Active').length, sub: 'with ongoing liability' },
        { label: 'Highest Exposure Chit', value: enriched.length > 0 ? enriched.reduce((a, b) => a.exposure > b.exposure ? a : b).companyName : '—', sub: 'requires attention' },
        { label: 'Total Invested', value: formatCurrency(chits.reduce((s, c) => s + (c.totalInvested || 0), 0)), color: tokens.red },
        { label: 'Net Position', value: formatCurrency(totalCommission - totalExposure), color: totalCommission - totalExposure >= 0 ? tokens.green : tokens.red, sub: 'commission minus exposure' },
      ]} />

      {chartData.length > 0 && (
        <Card style={{ marginTop: 18, marginBottom: 18 }}>
          <SectionHeader title="Exposure vs Future Liability" sub="Per chit fund breakdown" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }} barSize={20}>
              <CartesianGrid strokeDasharray="2 4" stroke={tokens.border} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tokens.textSub }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tokens.textSub }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: tokens.slateLight }} />
              <Legend wrapperStyle={{ fontSize: 12, color: tokens.textSub }} />
              <Bar dataKey="exposure" name="Current Exposure" fill={tokens.red} radius={[3, 3, 0, 0]} />
              <Bar dataKey="future" name="Future Liability" fill={tokens.amber} radius={[3, 3, 0, 0]} />
              <Bar dataKey="commission" name="Commission Earned" fill={tokens.green} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card noPad>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tokens.border}` }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.text }}>Chit-wise Risk Report</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textSub }}>Detailed exposure analysis per chit fund</p>
        </div>
        {enriched.length > 0
          ? <Table columns={cols} data={enriched} onRowClick={r => nav(`/cf/chits/${r.id}`)} />
          : <EmptyState icon={Zap} title="No exposure data" subtitle="Create and process chit fund auctions to view risk data" />
        }
      </Card>
    </div>
  );
}
