/**
 * CommissionCalc.js — Standalone Commission Calculator
 * Implements both forward (bid → breakdown) and reverse (net_payable → breakdown)
 * Per ChitFund ERP Development Reference v1.0
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { calcCommissionForward, calcCommissionReverse, calcSubscription, calcPhases, getPhaseIndex } from '../../utils/cf_engine';
import { Card, PageHeader, SectionHeader, StatCard, tokens, FormField, Input, Select } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const fmt = v => formatCurrency(v || 0);

function Row({ label, value, color, bold, sub, border }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '9px 14px', borderBottom: border !== false ? `1px solid ${tokens.border}` : 'none', alignItems: 'center', background: bold ? tokens.slateLight : 'transparent' }}>
      <div>
        <span style={{ fontSize: 13, color: bold ? tokens.text : tokens.textSub, fontWeight: bold ? 700 : 400 }}>{label}</span>
        {sub && <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: bold ? 15 : 13.5, fontWeight: bold ? 800 : 600, color: color || (bold ? tokens.text : tokens.text), textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function WhatIfTable({ form, subscription, orgAmount }) {
  const perHead = parseFloat(form.perHeadValue) || 0;
  if (perHead <= 0) return null;

  const rows = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.95, 0.99].map(pct => {
    const bid = Math.round(perHead * pct);
    if (bid <= orgAmount || bid >= parseFloat(form.totalChitValue)) return null;
    const r = calcCommissionForward({
      chitValue: parseFloat(form.totalChitValue),
      totalMembers: parseInt(form.totalMembers),
      organiserFeePct: parseFloat(form.organiserFeePct),
      commissionType: form.commissionType,
      alreadyCashedCount: parseInt(form.alreadyCashedCount) || 0,
      bidAmount: bid,
    });
    if (!r) return null;
    const isCurrent = Math.abs(bid - (parseFloat(form.bidAmount) || parseFloat(form.netPayable) || 0)) < 100;
    return { pct: Math.round(pct * 100), bid, ...r, isCurrent };
  }).filter(Boolean);

  if (!rows.length) return null;

  return (
    <Card>
      <SectionHeader title="What-If Analysis — Bid Amount Scenarios"
        sub="How commission and prize change at different bid levels" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: tokens.slateLight, borderBottom: `1px solid ${tokens.border}` }}>
              {['Bid %', 'Bid Amount', 'Pool', 'Commission/Member', 'Net Payable', 'Winner In-Hand'].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: h === 'Bid %' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: tokens.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${tokens.border}`, background: row.isCurrent ? tokens.blueLight : i % 2 === 0 ? tokens.slateLight : '#fff' }}>
                <td style={{ padding: '8px 12px', fontWeight: row.isCurrent ? 800 : 500, color: row.isCurrent ? tokens.blue : tokens.textSub }}>
                  {row.pct}%{row.isCurrent && ' ◀ current'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(row.bid)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: tokens.amber, fontWeight: 600 }}>{fmt(row.pool)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: tokens.blue, fontWeight: 600 }}>{fmt(row.commissionPerMember)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: tokens.green, fontWeight: 700 }}>
                  {fmt(row.commissionType === 'Double' ? row.netPayableDouble : row.netPayableNonCashedNonWinner)}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: tokens.purple, fontWeight: 700 }}>{fmt(row.winnerInHand)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function CommissionCalc() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputMode, setInputMode] = useState('bid'); // 'bid' | 'netPayable'
  const [sourceMode, setSourceMode] = useState('manual'); // 'chit' | 'manual'
  const [selectedChitId, setSelectedChitId] = useState('');

  const [form, setForm] = useState({
    totalChitValue: '',
    totalMembers: '',
    organiserFeePct: '5',
    commissionType: 'Single',
    alreadyCashedCount: '0',
    bidAmount: '',
    netPayable: '',
    perHeadValue: '',
  });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(d => { setChits(d.chits || []); setLoading(false); });
  }, [user]);

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    // Auto-calc perHead when chitValue or members changes
    if ((k === 'totalChitValue' || k === 'totalMembers') && next.totalChitValue && next.totalMembers) {
      const ph = calcSubscription(+next.totalChitValue, +next.totalMembers);
      next.perHeadValue = String(ph);
    }
    return next;
  });

  function loadChit(id) {
    setSelectedChitId(id);
    if (!id) return;
    const c = chits.find(ch => ch.id === id);
    if (!c) return;
    setForm(f => ({
      ...f,
      totalChitValue: String(c.totalChitValue || ''),
      totalMembers: String(c.totalMembers || ''),
      organiserFeePct: String(c.managerCommissionPct ?? 5),
      commissionType: c.commissionType || 'Single',
      alreadyCashedCount: String(c.auctionsCompleted || 0),
      perHeadValue: String(c.perHeadValue || calcSubscription(c.totalChitValue, c.totalMembers)),
      bidAmount: '',
      netPayable: '',
    }));
  }

  // Compute result
  const chitValue = parseFloat(form.totalChitValue) || 0;
  const totalMembers = parseInt(form.totalMembers) || 0;
  const orgPct = form.organiserFeePct === '' ? 0 : parseFloat(form.organiserFeePct);
  const alreadyCashed = parseInt(form.alreadyCashedCount) || 0;
  const perHead = parseFloat(form.perHeadValue) || 0;
  const subscription = calcSubscription(chitValue, totalMembers);
  const orgAmount = chitValue * (isNaN(orgPct) ? 0 : orgPct) / 100;

  let result = null;
  if (chitValue && totalMembers) {
    if (inputMode === 'bid' && form.bidAmount) {
      result = calcCommissionForward({
        chitValue, totalMembers, organiserFeePct: orgPct,
        commissionType: form.commissionType, alreadyCashedCount: alreadyCashed,
        bidAmount: parseFloat(form.bidAmount),
      });
      // result is null when inputs invalid
    } else if (inputMode === 'netPayable' && form.netPayable) {
      result = calcCommissionReverse({
        chitValue, totalMembers, organiserFeePct: orgPct,
        commissionType: form.commissionType, alreadyCashedCount: alreadyCashed,
        netPayable: parseFloat(form.netPayable),
      });
    }
  }

  // Phase ranges preview
  const phases = totalMembers > 0 ? calcPhases(totalMembers) : [];

  const isSingle = form.commissionType === 'Single';
  const eligibleCount = result?.eligible || 0;

  if (loading) return <PageLoader stats={3} />;

  return (
    <div>
      <PageHeader title="Commission Calculator"
        subtitle="Forward (bid → breakdown) and reverse (net paid → bid) calculator. Implements spec formulas exactly." />

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Input Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionHeader title="Load from Chit Fund" />
            <Select value={selectedChitId} onChange={e => loadChit(e.target.value)}>
              <option value="">— Select a chit fund to pre-fill —</option>
              {chits.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName} · {fmt(c.totalChitValue)} · {c.totalMembers}m · {c.commissionType}
                </option>
              ))}
            </Select>
          </Card>

          <Card>
            <SectionHeader title="Chit Parameters" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormField label="Total Chit Value (₹)" required>
                <Input type="number" value={form.totalChitValue} onChange={e => set('totalChitValue', e.target.value)} placeholder="2000000" />
              </FormField>
              <FormField label="Total Members" required>
                <Input type="number" value={form.totalMembers} onChange={e => set('totalMembers', e.target.value)} placeholder="20" />
              </FormField>
              <FormField label="Organiser Fee %" hint="0% is valid (interest-free chit) — spec caps at 5%">
                <Input type="number" step="0.01" min="0" max="5" value={form.organiserFeePct} onChange={e => set('organiserFeePct', e.target.value)} placeholder="5" />
              </FormField>
              <FormField label="Commission Type">
                <Select value={form.commissionType} onChange={e => set('commissionType', e.target.value)}>
                  <option value="Single">Single — only non-cashed members earn commission</option>
                  <option value="Double">Double — ALL members earn commission</option>
                </Select>
              </FormField>
              {isSingle && (
                <FormField label="Already Cashed Count" hint="Members who won in previous rounds">
                  <Input type="number" value={form.alreadyCashedCount} onChange={e => set('alreadyCashedCount', e.target.value)} placeholder="0" />
                </FormField>
              )}
            </div>

            {perHead > 0 && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: tokens.blueLight, borderRadius: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: tokens.textMuted, marginBottom: 2 }}>SUBSCRIPTION / HEAD</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tokens.blue }}>{fmt(subscription)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: tokens.textMuted, marginBottom: 2 }}>ORGANISER AMOUNT</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tokens.amber }}>{fmt(orgAmount)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: tokens.textMuted, marginBottom: 2 }}>
                      {isSingle ? 'ELIGIBLE (non-cashed excl. winner)' : 'ELIGIBLE (all members)'}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>
                      {isSingle ? Math.max(1, totalMembers - alreadyCashed - 1) : totalMembers}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Input Mode" />
            <div style={{ display: 'flex', background: tokens.slateLight, borderRadius: 10, padding: 3, border: `1px solid ${tokens.border}`, gap: 2, marginBottom: 14 }}>
              {[{ v: 'bid', l: 'Enter Bid Amount' }, { v: 'netPayable', l: 'Enter Net Payable' }].map(m => (
                <button key={m.v} onClick={() => setInputMode(m.v)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: inputMode === m.v ? '#fff' : 'transparent', color: inputMode === m.v ? tokens.text : tokens.textSub, fontWeight: inputMode === m.v ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', boxShadow: inputMode === m.v ? '0 1px 3px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.15s' }}>
                  {m.l}
                </button>
              ))}
            </div>

            {inputMode === 'bid' ? (
              <FormField label="Bid Amount (₹)" hint={`Winner foregoes this from ${fmt(chitValue)} chit value. Must be > ${fmt(orgAmount)} (organiser fee) and < ${fmt(chitValue)}`}>
                <Input type="number" value={form.bidAmount} onChange={e => set('bidAmount', e.target.value)} placeholder={String(Math.round(perHead * 0.85))} />
              </FormField>
            ) : (
              <div>
                <FormField label="What I Actually Paid (₹)" hint="Net payable this round — system reverse-calculates bid, prize, and commission">
                  <Input type="number" value={form.netPayable} onChange={e => set('netPayable', e.target.value)} placeholder={String(Math.round(subscription * 0.65))} />
                </FormField>
                {isSingle && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: tokens.amberLight, borderRadius: 8, fontSize: 12, color: tokens.amber }}>
                    ℹ️ Reverse calc applies only to <strong>non-cashed, non-winner</strong> members. Cashed members always pay full subscription ({fmt(subscription)}).
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ── Result Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {result ? (
            <>
              {/* Top KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                <StatCard label="Winner In-Hand Prize" value={fmt(result.winnerInHand)} sub="chit_value − bid" icon={() => null} accent={tokens.green} />
                <StatCard label="Commission per Member" value={fmt(result.commissionPerMember)} sub={`pool ÷ ${result.eligible} eligible`} icon={() => null} accent={tokens.blue} />
                <StatCard label="Net Payable" value={fmt(isSingle ? result.netPayableNonCashedNonWinner : result.netPayableDouble)} sub={isSingle ? 'non-cashed, non-winner' : 'every member (double)'} icon={() => null} accent={tokens.purple} />
              </div>

              {/* Full Breakdown */}
              <Card>
                <SectionHeader title="Full Commission Breakdown" sub="Per spec §2 formulas — exact calculation" />
                <Row label="Chit Value" value={fmt(chitValue)} />
                <Row label="Total Members" value={totalMembers} />
                <Row label="Subscription (Per Head)" value={fmt(result.subscription)} sub="chit_value ÷ total_members" />
                <Row label="Organiser Fee %" value={`${orgPct}%`} />
                <Row label="Organiser Amount" value={fmt(result.orgAmount)} sub="chit_value × (fee% ÷ 100)" color={tokens.amber} />
                <Row label="Bid Amount" value={fmt(result.bidAmount)} sub={inputMode === 'netPayable' ? 'derived from net payable' : 'entered'} />
                <Row label="Pool" value={fmt(result.pool)} sub="bid_amount − organiser_amount" color={tokens.blue} bold />
                <Row label={isSingle ? 'Eligible Members (Single)' : 'Eligible Members (Double)'} value={result.eligible}
                  sub={isSingle ? `total − already_cashed(${alreadyCashed}) − 1 = max(${totalMembers - alreadyCashed - 1}, 1)` : 'ALL members'} />
                <Row label="Commission Per Member" value={fmt(result.commissionPerMember)} sub="pool ÷ eligible" color={tokens.blue} bold />

                {/* Net payable breakdown by role */}
                <div style={{ padding: '10px 14px', background: tokens.slateLight, margin: '4px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Net Payable by Member Role</div>
                  {isSingle ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, color: tokens.textSub }}>Non-cashed, non-winner → sub − commission</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: tokens.green }}>{fmt(result.netPayableNonCashedNonWinner)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, color: tokens.textSub }}>Already-cashed members → FULL subscription</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: tokens.red }}>{fmt(result.netPayableCashedMember)}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                        <span style={{ fontSize: 12.5, color: tokens.textSub }}>Winner → FULL subscription (no commission on own round)</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: tokens.amber }}>{fmt(result.netPayableWinner)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                      <span style={{ fontSize: 12.5, color: tokens.textSub }}>ALL members (cashed and non-cashed) → sub − commission</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: tokens.green }}>{fmt(result.netPayableDouble)}</span>
                    </div>
                  )}
                </div>

                <Row label="Winner In-Hand" value={fmt(result.winnerInHand)} sub="chit_value − bid_amount" color={tokens.green} bold />
              </Card>

              <WhatIfTable form={form} subscription={subscription} orgAmount={orgAmount} />

              {/* Phase ranges */}
              {phases.length > 0 && (
                <Card>
                  <SectionHeader title="Phase Ranges Preview" sub={`Dynamic split: ceil(${totalMembers}/4) = ${Math.ceil(totalMembers / 4)} members per phase`} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                    {phases.map((p, i) => (
                      <div key={i} style={{ background: tokens.slateLight, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{p.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text }}>Rounds {p.startRound}–{p.endRound}</div>
                        <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 2 }}>configure payable range</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 12, color: tokens.textMuted }}>
                    Phase ranges let you configure expected net payable per phase for cash flow planning. Set them on the Chit Fund detail page.
                  </p>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <div style={{ fontSize: 52, marginBottom: 16 }}>🧮</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textSub, marginBottom: 8 }}>
                  Enter chit parameters and {inputMode === 'bid' ? 'bid amount' : 'net payable'} to calculate
                </div>
                <div style={{ fontSize: 13, color: tokens.textMuted, maxWidth: 420, margin: '0 auto', lineHeight: 1.7 }}>
                  <strong>Forward mode:</strong> Enter the winning bid → see pool, commission per member, net payable, winner's prize.<br />
                  <strong>Reverse mode:</strong> Enter what you actually paid → system back-calculates the full auction: bid amount, winner's prize, everyone's commission.
                </div>
                <div style={{ marginTop: 20, padding: '12px 16px', background: tokens.blueLight, borderRadius: 10, fontSize: 12, color: tokens.blue, textAlign: 'left', maxWidth: 420, margin: '16px auto 0' }}>
                  <strong>Key rules (from spec):</strong><br />
                  • Organiser fee: 0% is valid (interest-free chit)<br />
                  • Single: cashed members pay FULL subscription — no commission<br />
                  • Double: ALL members (cashed + non-cashed) get commission<br />
                  • Pool = Bid − Organiser Amount (not discount × members)
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
