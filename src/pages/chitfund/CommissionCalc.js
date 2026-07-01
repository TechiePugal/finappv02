/**
 * CommissionCalc.js
 * Forward and reverse commission calculator.
 * Logic ported from reference implementation (amReverseCalc, calcCommission).
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData } from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import {
  calcCommissionForward, calcCommissionReverse,
  calcSubscription, calcPhases, getPhaseIndex, getCommBreakdown
} from '../../utils/cf_engine';
import { Card, PageHeader, SectionHeader, StatCard, tokens, FormField, Input, Select } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const fmt = v => formatCurrency(v || 0);
const INR = v => '₹' + Math.round(v || 0).toLocaleString('en-IN');

// ── Reusable breakdown row ────────────────────────────────────────────────
function CalcRow({ label, value, color, bold, sub }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 14px', borderBottom:`1px solid ${tokens.border}`, background: bold ? tokens.slateLight : 'transparent' }}>
      <div>
        <div style={{ fontSize:13, color: bold ? tokens.text : tokens.textSub, fontWeight: bold ? 700 : 400 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:tokens.textMuted, marginTop:1 }}>{sub}</div>}
      </div>
      <span style={{ fontSize: bold ? 15 : 13.5, fontWeight: bold ? 800 : 600, color: color || tokens.text }}>{value}</span>
    </div>
  );
}

// ── What-if table: scans bid % from 60% to 99% ───────────────────────────
function WhatIfTable({ params, currentBid, currentPayable }) {
  const { chitValue, totalMembers, organiserFeePct, commissionType, alreadyCashedCount } = params;
  if (!chitValue || !totalMembers) return null;
  const sub = calcSubscription(chitValue, totalMembers);
  const rows = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.95, 0.99].map(pct => {
    const bid = Math.round(sub * pct);
    const r = calcCommissionForward({ chitValue, totalMembers, organiserFeePct, commissionType, alreadyCashedCount, bidAmount: bid });
    if (!r) return null;
    const isCurrentBid = currentBid && Math.abs(bid - currentBid) < 50;
    const isCurrentPay = currentPayable && Math.abs((commissionType==='Double'?r.netPayableDouble:r.netPayableNonCashed) - currentPayable) < 50;
    return { pct: Math.round(pct * 100), bid, ...r, highlight: isCurrentBid || isCurrentPay };
  }).filter(Boolean);

  return (
    <Card>
      <SectionHeader title="What-If Analysis — Bid % Scenarios"
        sub="How commission, net payable, and winner's prize change at different bid levels" />
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
          <thead>
            <tr style={{ background:tokens.slateLight, borderBottom:`1px solid ${tokens.border}` }}>
              {['Bid %','Bid Amt','Org Fee','Pool','Commission/Member','Net Payable','Winner Prize'].map(h => (
                <th key={h} style={{ padding:'8px 11px', textAlign:h==='Bid %'?'left':'right', fontSize:10.5, fontWeight:700, color:tokens.textSub, textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${tokens.border}`, background: row.highlight ? tokens.blueLight : i%2===0 ? tokens.slateLight : '#fff' }}>
                <td style={{ padding:'8px 11px', fontWeight: row.highlight ? 800 : 500, color: row.highlight ? tokens.blue : tokens.textSub }}>
                  {row.pct}%{row.highlight && ' ◀'}
                </td>
                <td style={{ padding:'8px 11px', textAlign:'right', fontWeight:600 }}>{fmt(row.bid)}</td>
                <td style={{ padding:'8px 11px', textAlign:'right', color:tokens.amber }}>{fmt(row.orgAmount)}</td>
                <td style={{ padding:'8px 11px', textAlign:'right', color:'#B45309', fontWeight:600 }}>{fmt(row.pool)}</td>
                <td style={{ padding:'8px 11px', textAlign:'right', color:tokens.green, fontWeight:700 }}>{fmt(row.commissionPerMember)}</td>
                <td style={{ padding:'8px 11px', textAlign:'right', color:tokens.red, fontWeight:700 }}>
                  {fmt(commissionType==='Double' ? row.netPayableDouble : row.netPayableNonCashed)}
                </td>
                <td style={{ padding:'8px 11px', textAlign:'right', color:tokens.purple, fontWeight:700 }}>{fmt(row.winnerInHand)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function CommissionCalc() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChitId, setSelectedChitId] = useState('');
  const [inputMode, setInputMode] = useState('forward'); // 'forward' | 'reverse'

  const [form, setForm] = useState({
    chitValue: '', totalMembers: '', organiserFeePct: '5',
    commissionType: 'Single', alreadyCashedCount: '0',
    bidAmount: '',    // forward mode input
    myPayable: '',    // reverse mode input
    iWon: false,
  });

  useEffect(() => {
    if (!user) return;
    getDashboardData(user.uid).then(d => {
      setChits(d.chits || []);
      setLoading(false);
    });
  }, [user]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function loadChit(id) {
    setSelectedChitId(id);
    if (!id) return;
    const c = chits.find(ch => ch.id === id);
    if (!c) return;
    setForm(f => ({
      ...f,
      chitValue: String(c.totalChitValue || ''),
      totalMembers: String(c.totalMembers || ''),
      organiserFeePct: String(c.managerCommissionPct ?? 5),
      commissionType: c.commissionType || 'Single',
      alreadyCashedCount: String(c.auctionsCompleted || 0),
      bidAmount: '', myPayable: '',
    }));
  }

  const chitValue        = parseFloat(form.chitValue)        || 0;
  const totalMembers     = parseInt(form.totalMembers)       || 0;
  const organiserFeePct  = isNaN(parseFloat(form.organiserFeePct)) ? 0 : parseFloat(form.organiserFeePct);
  const alreadyCashed    = parseInt(form.alreadyCashedCount) || 0;
  const sub              = chitValue && totalMembers ? calcSubscription(chitValue, totalMembers) : 0;
  const orgAmount        = chitValue * (organiserFeePct / 100);

  const params = { chitValue, totalMembers, organiserFeePct, commissionType: form.commissionType, alreadyCashedCount: alreadyCashed };

  // Compute result
  let result = null;
  let currentBid = 0, currentPayable = 0;
  if (chitValue && totalMembers) {
    if (inputMode === 'forward' && form.bidAmount) {
      currentBid = parseFloat(form.bidAmount);
      result = calcCommissionForward({ ...params, bidAmount: currentBid });
    } else if (inputMode === 'reverse' && form.myPayable) {
      currentPayable = parseFloat(form.myPayable);
      result = calcCommissionReverse({ ...params, myPayable: currentPayable });
      if (result) currentBid = result.bidAmount;
    }
  }

  const phases = totalMembers > 0 ? calcPhases(totalMembers) : [];
  const isSingle = form.commissionType === 'Single';

  if (loading) return <PageLoader stats={3} />;

  return (
    <div>
      <PageHeader title="Commission Calculator"
        subtitle="Forward: enter bid → see breakdown. Reverse: enter what you paid → derive bid, prize, commission." />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap:20, alignItems:'start' }}>

        {/* Input panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Load from chit */}
          <Card>
            <SectionHeader title="Pre-fill from Chit Fund" />
            <Select value={selectedChitId} onChange={e => loadChit(e.target.value)}>
              <option value="">— Select a chit fund —</option>
              {chits.map(c => (
                <option key={c.id} value={c.id}>
                  {c.companyName} · {fmt(c.totalChitValue)} · {c.totalMembers}m · {c.commissionType}
                </option>
              ))}
            </Select>
          </Card>

          {/* Parameters */}
          <Card>
            <SectionHeader title="Chit Parameters" />
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
              <FormField label="Total Chit Value (₹)" required>
                <Input type="number" value={form.chitValue} onChange={e => set('chitValue', e.target.value)} placeholder="2000000"/>
              </FormField>
              <FormField label="Total Members" required>
                <Input type="number" value={form.totalMembers} onChange={e => set('totalMembers', e.target.value)} placeholder="20"/>
              </FormField>
              <FormField label="Organiser Fee %" hint="0% is valid (interest-free chit) — never defaults to 5">
                <Input type="number" step="0.01" min="0" max="5" value={form.organiserFeePct} onChange={e => set('organiserFeePct', e.target.value)} placeholder="5"/>
              </FormField>
              <FormField label="Commission Type">
                <Select value={form.commissionType} onChange={e => set('commissionType', e.target.value)}>
                  <option value="Single">Single — only non-cashed earn commission</option>
                  <option value="Double">Double — ALL members earn commission</option>
                </Select>
              </FormField>
              {isSingle && (
                <FormField label="Already Cashed Count" hint="Members who won in previous rounds">
                  <Input type="number" value={form.alreadyCashedCount} onChange={e => set('alreadyCashedCount', e.target.value)} placeholder="0"/>
                </FormField>
              )}
            </div>

            {/* Quick preview */}
            {sub > 0 && (
              <div style={{ marginTop:12, padding:'10px 14px', background:tokens.blueLight, borderRadius:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { label:'Subscription/Head', val:fmt(sub) },
                    { label:'Organiser Amount', val:fmt(orgAmount) },
                    { label:isSingle?'Eligible (non-cashed, excl. winner)':'Eligible (all members)', val:isSingle ? Math.max(1,totalMembers-alreadyCashed-1) : totalMembers },
                  ].map((k,i) => (
                    <div key={i}>
                      <div style={{ fontSize:10, color:tokens.textMuted, marginBottom:2 }}>{k.label}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:tokens.blue }}>{k.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Input mode */}
          <Card>
            <div style={{ display:'flex', background:tokens.slateLight, borderRadius:9, padding:3, border:`1px solid ${tokens.border}`, gap:2, marginBottom:14 }}>
              {[['forward','Enter Bid Amount'],['reverse','Enter What I Paid']].map(([v,l]) => (
                <button key={v} onClick={() => setInputMode(v)}
                  style={{ flex:1, padding:'7px 10px', borderRadius:7, border:'none', background:inputMode===v?'#fff':'transparent', color:inputMode===v?tokens.text:tokens.textSub, fontWeight:inputMode===v?700:400, fontSize:12, cursor:'pointer', fontFamily:'inherit', boxShadow:inputMode===v?'0 1px 3px rgba(0,0,0,.09)':'none', transition:'all .15s' }}>
                  {l}
                </button>
              ))}
            </div>

            {inputMode === 'forward' ? (
              <FormField label="Bid Amount (₹)" hint={`Amount winner bids from the TOTAL chit pool (${fmt(chitValue)}). Enter 0 for no bid. Lower bid = larger prize for winner, less commission for members.`}>
                <Input type="number" value={form.bidAmount} onChange={e => set('bidAmount', e.target.value)}
                  placeholder={String(Math.round(sub * 0.85))} />
              </FormField>
            ) : (
              <div>
                <FormField label="What I Actually Paid (₹)" hint="Net payable — system reverse-calculates everything">
                  <Input type="number" value={form.myPayable} onChange={e => set('myPayable', e.target.value)}
                    placeholder={String(Math.round(sub * 0.65))} />
                </FormField>
                <div style={{ marginTop:8, padding:'8px 12px', background:tokens.amberLight, borderRadius:8, fontSize:12, color:tokens.amber, lineHeight:1.5 }}>
                  ℹ️ Applies to <strong>non-cashed, non-winner</strong> members.
                  {isSingle && ' Cashed members always pay full subscription.'}
                </div>
              </div>
            )}

            {inputMode === 'forward' && (
              <FormField label="Did I win this auction?" style={{ marginTop:12 }}>
                <Select value={form.iWon ? 'yes' : 'no'} onChange={e => set('iWon', e.target.value === 'yes')}>
                  <option value="no">No — I did not win</option>
                  <option value="yes">Yes — I won this auction</option>
                </Select>
              </FormField>
            )}
          </Card>
        </div>

        {/* Result panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {result ? (
            <>
              {/* KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:12 }}>
                <StatCard label="Winner's Prize" value={fmt(result.winnerInHand)} sub="chit_value − bid" icon={() => null} accent={tokens.green}/>
                <StatCard label="Commission/Member" value={fmt(result.commissionPerMember)} sub={`pool ÷ ${result.eligible} eligible`} icon={() => null} accent={tokens.blue}/>
                <StatCard label={isSingle ? 'Non-cashed Net Payable' : 'Everyone Pays'}
                  value={fmt(isSingle ? result.netPayableNonCashed : result.netPayableDouble)}
                  sub={isSingle ? 'excl. winner & cashed' : 'all members same'}
                  icon={() => null} accent={tokens.purple}/>
              </div>

              {/* Full breakdown */}
              <Card noPad>
                <div style={{ padding:'14px 18px', borderBottom:`1px solid ${tokens.border}` }}>
                  <SectionHeader title={inputMode === 'reverse' ? 'Reverse-Calculated Breakdown' : 'Commission Breakdown'} sub="Exact spec formulas" />
                </div>
                <CalcRow label="Chit Value" value={fmt(chitValue)} />
                <CalcRow label="Subscription (Per Head)" value={fmt(result.sub)} sub="chit_value ÷ total_members" />
                <CalcRow label={`Organiser Fee (${organiserFeePct}%)`} value={fmt(result.orgAmount)} color={tokens.amber} sub="chit_value × (fee% ÷ 100)" />
                {inputMode === 'reverse' && (
                  <CalcRow label="My Net Payable (input)" value={fmt(currentPayable)} color={tokens.red} />
                )}
                <CalcRow label="Bid Amount" value={fmt(result.bidAmount)} color={tokens.blue}
                  sub={inputMode === 'reverse' ? 'reverse-calculated from your payment' : 'entered'} bold />
                <CalcRow label="Pool (Bid − Organiser Fee)" value={fmt(result.pool)} color={tokens.blue}
                  sub="the distributable amount" bold />
                <CalcRow label={`Eligible Members (${form.commissionType})`} value={result.eligible}
                  sub={isSingle ? `total(${totalMembers}) − cashed(${alreadyCashed}) − 1 winner = max(${totalMembers-alreadyCashed-1},1)` : 'ALL members'} />
                <CalcRow label="Commission Per Member" value={fmt(result.commissionPerMember)} sub="pool ÷ eligible" color={tokens.green} bold />

                {/* Role breakdown */}
                <div style={{ padding:'10px 14px', background:tokens.slateLight, margin:'4px 0' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Net Payable by Role</div>
                  {isSingle ? (
                    <>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div>
                          <div style={{ fontSize:12.5, color:tokens.text }}>Non-cashed, non-winner member</div>
                          <div style={{ fontSize:11, color:tokens.textMuted }}>sub − commission</div>
                        </div>
                        <span style={{ fontSize:15, fontWeight:800, color:tokens.green }}>{fmt(result.netPayableNonCashed)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <div>
                          <div style={{ fontSize:12.5, color:tokens.text }}>Already-cashed member</div>
                          <div style={{ fontSize:11, color:tokens.textMuted }}>FULL subscription — no commission (single rule)</div>
                        </div>
                        <span style={{ fontSize:15, fontWeight:800, color:tokens.red }}>{fmt(result.netPayableCashed)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <div>
                          <div style={{ fontSize:12.5, color:tokens.text }}>Winner (this round)</div>
                          <div style={{ fontSize:11, color:tokens.textMuted }}>FULL sub — no commission on own round (single)</div>
                        </div>
                        <span style={{ fontSize:15, fontWeight:800, color:tokens.amber }}>{fmt(result.netPayableWinner)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:12.5, color:tokens.text }}>Every member (cashed + non-cashed)</div>
                        <div style={{ fontSize:11, color:tokens.textMuted }}>sub − commission — same for all (double)</div>
                      </div>
                      <span style={{ fontSize:15, fontWeight:800, color:tokens.green }}>{fmt(result.netPayableDouble)}</span>
                    </div>
                  )}
                </div>

                <CalcRow label="Winner's Prize (In-Hand)" value={fmt(result.winnerInHand)} sub="chit_value − bid" color={tokens.green} bold />

                {/* Winner net in-hand including own contribution */}
                {result.winnerNetInHand !== undefined && (
                  <>
                    <CalcRow label={`Winner's Own Contribution (${isSingle?'full sub':'sub − commission'})`} value={fmt(result.winnerContrib)} color={tokens.red} />
                    <CalcRow label="Winner Net In-Hand (Prize − Contribution)" value={fmt(result.winnerNetInHand)} color={tokens.purple} bold />
                  </>
                )}
                {inputMode === 'forward' && form.iWon && result.winnerInHand > 0 && (
                  <CalcRow
                    label="Your Net In-Hand (you won)"
                    value={fmt(result.winnerInHand - (isSingle ? result.sub : result.netPayableNonCashed))}
                    color={tokens.green} bold
                    sub="prize − your contribution this month" />
                )}
              </Card>

              {/* Phase ranges */}
              {phases.length > 0 && (
                <Card>
                  <SectionHeader title="Phase Ranges Preview"
                    sub={`ceil(${totalMembers}/4) = ${Math.ceil(totalMembers/4)} members per phase`} />
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:10, marginTop:8 }}>
                    {phases.map((p, i) => (
                      <div key={i} style={{ background:tokens.slateLight, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>{p.label}</div>
                        <div style={{ fontSize:12.5, fontWeight:700, color:tokens.text }}>Rounds {p.startRound}–{p.endRound}</div>
                        <div style={{ fontSize:11, color:tokens.textMuted, marginTop:3 }}>configure payable →</div>
                      </div>
                    ))}
                  </div>
                  <p style={{ margin:'10px 0 0', fontSize:12, color:tokens.textMuted, lineHeight:1.6 }}>
                    Set expected payable per phase in the chit fund detail page (Edit → Phase Ranges). The calculator uses these for the Projection page's cash-flow estimate.
                  </p>
                </Card>
              )}

              <WhatIfTable params={params} currentBid={currentBid} currentPayable={currentPayable} />
            </>
          ) : (
            <Card>
              <div style={{ textAlign:'center', padding:'60px 28px' }}>
                <div style={{ fontSize:52, marginBottom:16 }}>🧮</div>
                <div style={{ fontSize:16, fontWeight:700, color:tokens.textSub, marginBottom:8 }}>
                  {inputMode === 'forward' ? 'Enter bid amount to calculate' : 'Enter what you paid to reverse-calculate'}
                </div>
                <div style={{ fontSize:13, color:tokens.textMuted, maxWidth:420, margin:'0 auto', lineHeight:1.8 }}>
                  <strong>Forward:</strong> Enter winning bid → see pool, commission/member, net payable, winner's prize.<br/>
                  <strong>Reverse:</strong> Enter what you actually paid → system back-calculates bid, pool, everyone's commission, winner's prize.
                </div>
                <div style={{ marginTop:20, padding:'14px 18px', background:tokens.blueLight, borderRadius:11, fontSize:12.5, color:tokens.blue, textAlign:'left', maxWidth:420, margin:'18px auto 0', lineHeight:1.8 }}>
                  <strong>Key Rules (from spec):</strong><br/>
                  • Organiser fee 0% is valid (interest-free chit)<br/>
                  • <strong>Single:</strong> cashed members pay FULL subscription — no commission<br/>
                  • <strong>Double:</strong> ALL members (cashed + non-cashed) get commission<br/>
                  • Pool = Bid − Org Fee (not discount × members)
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
