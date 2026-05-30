// src/pages/Ledger.js
import React, { useEffect, useState } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData, getLedger } from '../../utils/cf_firestore';
import { formatCurrency, formatDate } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, Table, Select, FormField, Loader, EmptyState, tokens, KPIRow, SectionHeader } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const typeConfig = {
  'Investment':        { color: tokens.red,   bg: tokens.redLight,   icon: TrendingDown, label: 'Investment' },
  'Commission Earned': { color: tokens.green, bg: tokens.greenLight, icon: TrendingUp,   label: 'Commission' },
  'Manager Commission':{ color: tokens.amber, bg: tokens.amberLight, icon: Minus,        label: 'Mgr. Comm.' },
};

export default function Ledger() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [selectedChit, setSelectedChit] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(data => {
      setChits(data.chits);
      if (data.chits.length > 0) setSelectedChit(data.chits[0].id);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedChit) return;
    setEntriesLoading(true);
    getLedger(selectedChit).then(e => { setEntries(e); setEntriesLoading(false); });
  }, [selectedChit]);

  const totalDebit = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const netBalance = totalCredit - totalDebit;

  const selectedChitData = chits.find(c => c.id === selectedChit);

  const cols = [
    {
      key: 'type', header: 'Type', render: v => {
        const cfg = typeConfig[v] || { color: tokens.textSub, bg: tokens.slateLight, label: v };
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 20, background: cfg.bg }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
          </div>
        );
      }
    },
    { key: 'auctionNumber', header: 'Auction', render: v => <span style={{ fontWeight: 600, color: tokens.blue }}>#{v}</span> },
    { key: 'date', header: 'Date', render: v => formatDate(v) },
    {
      key: 'debit', header: 'Debit', align: 'right',
      render: v => v > 0 ? <span style={{ color: tokens.red, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(v)}</span> : <span style={{ color: tokens.textMuted }}>—</span>
    },
    {
      key: 'credit', header: 'Credit', align: 'right',
      render: v => v > 0 ? <span style={{ color: tokens.green, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(v)}</span> : <span style={{ color: tokens.textMuted }}>—</span>
    },
    {
      key: 'amount', header: 'Amount', align: 'right',
      render: v => <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(v)}</span>
    },
  ];

  if (loading) return <Loader text="Loading ledger…" />;

  return (
    <div>
      <PageHeader title="Ledger" subtitle="Transaction-level audit trail for each auction" />

      {/* Chit Selector */}
      <Card style={{ marginBottom: 18, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <FormField label="Select Chit Fund">
              <Select value={selectedChit} onChange={e => setSelectedChit(e.target.value)}>
                {chits.length === 0 && <option value="">No chit funds found</option>}
                {chits.map(c => <option key={c.id} value={c.id}>{c.companyName} — {c.status}</option>)}
              </Select>
            </FormField>
          </div>
          {selectedChitData && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: tokens.textSub }}>Per Head: <strong style={{ color: tokens.text }}>{formatCurrency(selectedChitData.perHeadValue)}</strong></span>
              <span style={{ fontSize: 12, color: tokens.textSub }}>Progress: <strong style={{ color: tokens.text }}>{selectedChitData.auctionsCompleted}/{selectedChitData.totalMembers}</strong></span>
            </div>
          )}
        </div>
      </Card>

      {selectedChit && (
        <>
          <KPIRow items={[
            { label: 'Total Debit (Invested)', value: formatCurrency(totalDebit), color: tokens.red },
            { label: 'Total Credit (Earned)', value: formatCurrency(totalCredit), color: tokens.green },
            { label: 'Net Balance', value: formatCurrency(netBalance), color: netBalance >= 0 ? tokens.green : tokens.red },
            { label: 'Total Entries', value: entries.length, color: tokens.text },
          ]} />

          <Card noPad style={{ marginTop: 18 }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tokens.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.text }}>Transaction Entries</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textSub }}>Auto-generated for each processed auction</p>
            </div>
            {entriesLoading ? <Loader text="Loading entries…" /> : entries.length > 0
              ? <Table columns={cols} data={entries} />
              : <EmptyState icon={BookOpen} title="No ledger entries" subtitle="Process auctions to generate ledger entries" />
            }
          </Card>
        </>
      )}

      {chits.length === 0 && (
        <Card><EmptyState icon={BookOpen} title="No chit funds" subtitle="Create chit funds to view ledger entries" /></Card>
      )}
    </div>
  );
}
