/**
 * FormedExpectedFund.js — the organizer's-side counterpart to Joined Chits'
 * Expected Fund page. For chits YOU run, this answers: how much should I expect
 * to collect (and earn as organiser fee) this month, per chit and overall?
 *
 * Closed chits are excluded entirely, and a chit only shows an expected amount
 * in a month where it actually has a scheduled auction — never in between.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { printFormedExpectedFund } from '../../utils/cf_pdfReport';
import { formatCurrency } from '../../utils/cf_format';
import { tokens, Card, PageHeader, StatCard, Loader } from '../../components/chitfund/UI';
import { Wallet, Layers, TrendingUp } from 'lucide-react';

function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
function fmtMo(m) { if (!m) return '—'; const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function shiftMonth(m, delta) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
function toMonthKey(d) { const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d); return isNaN(dt) ? null : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; }

export default function FormedExpectedFund() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(curMonth());

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(d => {
      // Closed chits excluded entirely — nothing left to plan for on them.
      const active = (d.chits || []).filter(c => c.status !== 'Closed');
      setChits(active);
      setSchedules(d.schedules || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  if (loading) return <Loader text="Calculating expected fund…" />;

  const rows = chits.map(c => {
    const sched = schedules[c.id] || [];
    // A chit only owes/earns something in a month where it has an ACTUAL scheduled
    // auction — never "every month" regardless of its real auction interval.
    const roundThisMonth = sched.find(a => toMonthKey(a.auctionDate) === viewMonth);
    const isDueThisMonth = !!roundThisMonth;
    const expectedCollection = isDueThisMonth ? (c.totalChitValue || 0) : 0;
    const expectedOrgFee = isDueThisMonth ? (c.totalChitValue || 0) * ((c.managerCommissionPct || 0) / 100) : 0;
    const completedCount = sched.filter(a => a.status === 'Completed').length;
    return { ...c, sched, roundThisMonth, isDueThisMonth, expectedCollection, expectedOrgFee, completedCount };
  });

  const totalExpectedCollection = rows.reduce((s, r) => s + r.expectedCollection, 0);
  const totalExpectedOrgFee = rows.reduce((s, r) => s + r.expectedOrgFee, 0);
  const dueCount = rows.filter(r => r.isDueThisMonth).length;

  return (
    <div>
      <PageHeader title="Expected Fund" subtitle="What you're expected to collect this month, per chit and overall — closed chits excluded"
        action={rows.length > 0 && (
          <button onClick={() => printFormedExpectedFund(rows, fmtMo(viewMonth))}
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
        <StatCard label={`Expected Collection — ${fmtMo(viewMonth)}`} value={formatCurrency(totalExpectedCollection)} sub={`from ${dueCount} chit${dueCount !== 1 ? 's' : ''} due`} icon={Wallet} accent={tokens.blue} />
        <StatCard label="Expected Organiser Fee" value={formatCurrency(totalExpectedOrgFee)} sub="your earnings this month" icon={TrendingUp} accent={tokens.green} />
        <StatCard label="Active Chits" value={rows.length} sub="closed chits excluded" icon={Layers} accent="#5521B5" />
      </div>

      {rows.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text, marginBottom: 6 }}>No active chits</div>
          <div style={{ fontSize: 13, color: tokens.textSub }}>Closed chits don't need fund planning, so they're left out of this view.</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(r => (
            <Card key={r.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: tokens.text }}>{r.companyName}</div>
                  <div style={{ fontSize: 11.5, color: tokens.textSub, marginTop: 2 }}>{r.completedCount}/{r.totalMembers} rounds done · Chit value {formatCurrency(r.totalChitValue)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase' }}>{fmtMo(viewMonth)}</div>
                  {r.isDueThisMonth ? (
                    <div style={{ fontSize: 17, fontWeight: 800, color: tokens.blue }}>{formatCurrency(r.expectedCollection)}</div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted }}>Not due this month</div>
                  )}
                </div>
              </div>
              {r.isDueThisMonth && r.expectedOrgFee > 0 && (
                <div style={{ padding: '10px 18px', background: tokens.slateLight, borderTop: `1px solid ${tokens.border}`, fontSize: 11.5, color: tokens.textSub }}>
                  Your organiser fee this round: <strong style={{ color: tokens.green }}>{formatCurrency(r.expectedOrgFee)}</strong>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
