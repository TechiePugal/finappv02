// src/pages/chitfund/JoinedAuctions.js — "Auctions" equivalent for chits YOU'VE JOINED.
// Since you're a paying member (not the organiser), this shows your payment schedule
// per joined chit — next due round, recent history — rather than a member-collection UI.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gavel, CheckCircle, Clock, ArrowRight, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, Badge, Loader, EmptyState, tokens, SectionHeader } from '../../components/chitfund/UI';

function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
function fmtMo(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); }

export default function JoinedAuctions() {
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

  if (loading) return <Loader text="Loading your chit rounds…" />;

  const cur = curMonth();
  const rows = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidCount = pays.filter(p => p.status === 'Paid').length;
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    const thisMonthPay = pays.find(p => p.month === cur);
    const isPaidThisMonth = thisMonthPay && thisMonthPay.status === 'Paid';
    const isCashed = c.myStatus === 'Cashed';
    const nextRound = paidCount + 1;
    return { ...c, pays, paidCount, sub, isPaidThisMonth, isCashed, nextRound, recent: [...pays].sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 3) };
  });

  const dueNow = rows.filter(r => !r.isCashed && !r.isPaidThisMonth);
  const upToDate = rows.filter(r => !r.isCashed && r.isPaidThisMonth);
  const cashedOut = rows.filter(r => r.isCashed);

  const totalDueAmount = dueNow.reduce((s, r) => s + r.sub, 0);

  return (
    <div>
      <PageHeader title="Auctions — Joined Chits" subtitle="Your round-by-round payment schedule across chits you've joined" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label="Payment Due Now" value={dueNow.length} sub={formatCurrency(totalDueAmount) + ' owed'} icon={Clock} accent={tokens.amber} />
        <StatCard label="Up to Date" value={upToDate.length} sub="paid this month" icon={CheckCircle} accent={tokens.green} />
        <StatCard label="Cashed Out" value={cashedOut.length} sub="already took prize" icon={Trophy} accent="#5521B5" />
        <StatCard label="Total Joined" value={chits.length} sub="chits" icon={Gavel} accent={tokens.blue} />
      </div>

      {chits.length === 0 ? (
        <Card><EmptyState icon={Gavel} title="No joined chits" subtitle="Join a chit fund to track its rounds here" /></Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.id} noPad>
              <div onClick={() => nav('/cf/other-chits')} style={{ cursor: 'pointer', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: tokens.text }}>{r.companyName}</span>
                    <Badge status={r.isCashed ? 'Cashed' : r.isPaidThisMonth ? 'Paid' : 'Due'} />
                  </div>
                  <div style={{ fontSize: 12, color: tokens.textSub }}>
                    Round #{r.nextRound} of {r.totalMembers} · Subscription {formatCurrency(r.sub)}/month
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {!r.isCashed && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>This Month</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: r.isPaidThisMonth ? tokens.green : tokens.amber }}>
                        {r.isPaidThisMonth ? '✓ Paid' : formatCurrency(r.sub)}
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
