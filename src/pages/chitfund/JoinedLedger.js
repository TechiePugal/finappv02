// src/pages/chitfund/JoinedLedger.js — Ledger for chits YOU'VE JOINED
import React, { useEffect, useState } from 'react';
import { BookOpen, TrendingUp, TrendingDown, Award } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, Select, FormField, Loader, EmptyState, tokens, KPIRow, Table } from '../../components/chitfund/UI';

const typeConfig = {
  'Subscription': { color: tokens.red, bg: tokens.redLight, icon: TrendingDown, label: 'Subscription Paid' },
  'Prize':         { color: tokens.green, bg: tokens.greenLight, icon: Award,     label: 'Prize Received' },
};

export default function JoinedLedger() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [selectedChit, setSelectedChit] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    getOtherChits(user.uid).then(list => {
      setChits(list);
      if (list.length > 0) setSelectedChit(list[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!selectedChit) return;
    setEntriesLoading(true);
    getOtherChitPayments(selectedChit).then(pays => {
      const rows = [];
      pays.forEach(p => {
        rows.push({ id: p.id + '_sub', type: 'Subscription', month: p.month, amount: p.amount || 0, debit: p.amount || 0, credit: 0 });
        if (p.iWon && p.prizeReceived > 0) {
          rows.push({ id: p.id + '_prize', type: 'Prize', month: p.month, amount: p.prizeReceived || 0, debit: 0, credit: p.prizeReceived || 0 });
        }
      });
      setEntries(rows.sort((a, b) => String(b.month).localeCompare(String(a.month))));
      setEntriesLoading(false);
    }).catch(() => setEntriesLoading(false));
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
    { key: 'month', header: 'Month', render: v => <span style={{ fontWeight: 600, color: tokens.blue }}>{v}</span> },
    { key: 'debit', header: 'Debit', align: 'right', render: v => v > 0 ? <span style={{ color: tokens.red, fontWeight: 700 }}>{formatCurrency(v)}</span> : <span style={{ color: tokens.textMuted }}>—</span> },
    { key: 'credit', header: 'Credit', align: 'right', render: v => v > 0 ? <span style={{ color: tokens.green, fontWeight: 700 }}>{formatCurrency(v)}</span> : <span style={{ color: tokens.textMuted }}>—</span> },
    { key: 'amount', header: 'Amount', align: 'right', render: v => <span style={{ fontWeight: 600 }}>{formatCurrency(v)}</span> },
  ];

  if (loading) return <Loader text="Loading ledger…" />;

  return (
    <div>
      <PageHeader title="Ledger — Joined Chits" subtitle="Transaction-level history for each chit you've joined" />

      <Card style={{ marginBottom: 18, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <FormField label="Select Joined Chit">
              <Select value={selectedChit} onChange={e => setSelectedChit(e.target.value)}>
                {chits.length === 0 && <option value="">No joined chits found</option>}
                {chits.map(c => <option key={c.id} value={c.id}>{c.companyName} — {c.myStatus || 'Active'}</option>)}
              </Select>
            </FormField>
          </div>
          {selectedChitData && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: tokens.textSub }}>Subscription: <strong style={{ color: tokens.text }}>{formatCurrency((selectedChitData.totalChitValue || 0) / (selectedChitData.totalMembers || 1))}</strong></span>
              <span style={{ fontSize: 12, color: tokens.textSub }}>Status: <strong style={{ color: tokens.text }}>{selectedChitData.myStatus || 'Active'}</strong></span>
            </div>
          )}
        </div>
      </Card>

      {selectedChit && (
        <>
          <KPIRow items={[
            { label: 'Total Paid (Debit)', value: formatCurrency(totalDebit), color: tokens.red },
            { label: 'Total Received (Credit)', value: formatCurrency(totalCredit), color: tokens.green },
            { label: 'Net Balance', value: formatCurrency(netBalance), color: netBalance >= 0 ? tokens.green : tokens.red },
            { label: 'Total Entries', value: entries.length, color: tokens.text },
          ]} />

          <Card noPad style={{ marginTop: 18 }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tokens.border}` }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.text }}>Transaction Entries</h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textSub }}>Auto-generated from your recorded payments</p>
            </div>
            {entriesLoading ? <Loader text="Loading entries…" /> : entries.length > 0
              ? <Table columns={cols} data={entries} />
              : <EmptyState icon={BookOpen} title="No ledger entries" subtitle="Record a payment for this chit to see entries here" />
            }
          </Card>
        </>
      )}

      {chits.length === 0 && (
        <Card><EmptyState icon={BookOpen} title="No joined chits" subtitle="Join a chit fund to view its ledger" /></Card>
      )}
    </div>
  );
}
