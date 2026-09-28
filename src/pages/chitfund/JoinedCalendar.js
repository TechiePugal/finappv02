// src/pages/chitfund/JoinedCalendar.js — Calendar for chits YOU'VE JOINED.
//
// Replaces the old cramped "next 8 auctions across ~4 months" list (which had
// no day-level detail and no cash/non-cash breakdown) with a real month grid,
// centered on the current month with smooth prev/next navigation — every
// ticket's due round is placed on its actual due day, colored by whether it's
// paid, still due, or already cashed, and each entry shows what taking that
// chit right now would put in hand plus one-tap "Enter amount paid" / "Mark
// paid" actions, so you don't have to leave the calendar to record a payment.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, Wallet, CheckCircle, Clock, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getOtherChits, getOtherChitPayments, addOtherChitPayment } from '../../utils/cf_firestore';
import { getExpectedPayable } from '../../utils/cf_engine';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, Badge, Loader, EmptyState, tokens } from '../../components/chitfund/UI';

function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; }
function shiftMonth(m, delta) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
function monthLabel(m) { const [y, mo] = m.split('-').map(Number); return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); }
function daysInMonth(y, mo) { return new Date(y, mo, 0).getDate(); }

// Which round number does a given month fall on for this chit — same logic
// used on Expected Fund / Auctions / Exposure so every screen agrees.
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
  // BUG FIX: cap at the chit's real round count — without this, browsing to a
  // month after the chit's actual closing month still "found" a round number
  // and kept showing it as due, long after the chit's schedule had ended.
  if (chit.totalMembers && round > chit.totalMembers) return null;
  return round;
}

// Which round was this chit ACTUALLY taken on — cashed status should only
// apply from that round onward, not to earlier rounds.
function cashRoundOf(c) {
  if (c.myStatus !== 'Cashed' || !c.actualTakeMonth) return null;
  return roundForMonth(c, c.actualTakeMonth);
}

export default function JoinedCalendar() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chits, setChits] = useState([]);
  const [payMap, setPayMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(curMonth());
  const [entryInput, setEntryInput] = useState({}); // { [chitId]: '<amount being typed>' }
  const [saving, setSaving] = useState({}); // { [chitId]: true } while a quick action is in flight

  function load() {
    if (!user) return;
    getOtherChits(user.uid).then(async list => {
      const pm = {};
      await Promise.all(list.map(async c => { pm[c.id] = await getOtherChitPayments(c.id); }));
      setChits(list);
      setPayMap(pm);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(load, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loader text="Loading your chit calendar…" />;

  const [vy, vmo] = viewMonth.split('-').map(Number);
  const today = new Date();
  const todayKey = curMonth();
  const isViewingCurrent = viewMonth === todayKey;

  // Build one entry per joined chit that has an actual due round in the
  // viewed month — fully paid-off chits never appear again (nothing left to
  // ever owe); cashed-but-still-owing chits stay in, matching the rest of the
  // app's Joined-Chits screens (Expected Fund / Auctions / Exposure).
  const entries = chits.map(c => {
    const pays = payMap[c.id] || [];
    const paidCount = pays.filter(p => p.status === 'Paid').length;
    const isFullyPaidOff = paidCount >= (c.totalMembers || 0);
    if (isFullyPaidOff) return null;
    const round = roundForMonth(c, viewMonth);
    if (round === null) return null;
    const isCashed = c.myStatus === 'Cashed';
    const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
    // Round-aware: this round only counts as "cashed" (full subscription, no
    // discount) if it's at/after the round the chit was actually taken on —
    // a round before that still gets its normal pre-cash commission rate.
    const cashRound = cashRoundOf(c);
    const cashedForThisRound = isCashed && (cashRound === null || round >= cashRound);
    const chitLike = {
      totalChitValue: c.totalChitValue, totalMembers: c.totalMembers,
      mystatus: cashedForThisRound ? 'cashed' : 'active', commissionType: c.commissionType || 'Single',
      range1: c.range1 || 0, range2: c.range2 || 0, range3: c.range3 || 0, range4: c.range4 || 0,
    };
    const expected = getExpectedPayable(chitLike, round);
    const viewedPay = pays.find(p => p.month === viewMonth);
    const isPaid = viewedPay && viewedPay.status === 'Paid';
    const day = Math.min(daysInMonth(vy, vmo), Math.max(1, +c.auctionDayOfMonth || 1));
    // "If you cash" estimate — same ~15% discount-bid methodology used on Expected
    // Fund. Only meaningful for a chit not yet taken.
    const estBid = sub * 0.85;
    const estCashInHand = Math.max(0, (c.totalChitValue || 0) - estBid);
    return { chit: c, round, isCashed, sub, expected, isPaid, day, estCashInHand };
  }).filter(Boolean).sort((a, b) => a.day - b.day);

  const paidEntries = entries.filter(e => e.isPaid);
  const unpaidEntries = entries.filter(e => !e.isPaid);
  const totalSubs = entries.reduce((s, e) => s + e.expected, 0);
  const totalPaidAmount = paidEntries.reduce((s, e) => s + e.expected, 0);

  // Group entries by day-of-month for the grid cells.
  const byDay = {};
  entries.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });

  const firstDow = new Date(vy, vmo - 1, 1).getDay(); // 0=Sun
  const totalDays = daysInMonth(vy, vmo);
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  async function quickMark(entry, amountOverride) {
    const { chit } = entry;
    setSaving(s => ({ ...s, [chit.id]: true }));
    try {
      const amount = amountOverride != null ? amountOverride : entry.expected;
      await addOtherChitPayment(chit.id, { month: viewMonth, date: `${viewMonth}-${String(entry.day).padStart(2, '0')}`, amount: Math.round(amount), status: 'Paid' }, user.uid);
      toast.success(`${chit.chitName || chit.companyName}: marked paid for ${monthLabel(viewMonth)}`);
      setEntryInput(v => ({ ...v, [chit.id]: '' }));
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    finally { setSaving(s => ({ ...s, [chit.id]: false })); }
  }

  return (
    <div>
      <PageHeader title="Calendar — Joined Chits" subtitle="Every ticket's due round for the month, day by day, with cash-in-hand estimates" />

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => setViewMonth(m => shiftMonth(m, -1))} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} color={tokens.textSub} /></button>
        <div style={{ fontSize: 16, fontWeight: 800, color: tokens.text, minWidth: 170, textAlign: 'center' }}>{monthLabel(viewMonth)}</div>
        <button onClick={() => setViewMonth(m => shiftMonth(m, 1))} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} color={tokens.textSub} /></button>
        {!isViewingCurrent && (
          <button onClick={() => setViewMonth(todayKey)} style={{ padding: '7px 14px', borderRadius: 9, border: `1px solid ${tokens.border}`, background: tokens.slateLight, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: tokens.textSub, fontFamily: 'inherit' }}>Today</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 13, marginBottom: 18 }}>
        <StatCard label="Rounds This Month" value={entries.length} sub="across your tickets" icon={CalIcon} accent={tokens.blue} />
        <StatCard label="Total Subscriptions" value={formatCurrency(totalSubs)} sub="due this month" icon={Wallet} accent="#B45309" />
        <StatCard label="Paid" value={paidEntries.length} sub={formatCurrency(totalPaidAmount)} icon={CheckCircle} accent={tokens.green} />
        <StatCard label="Unpaid" value={unpaidEntries.length} sub={formatCurrency(totalSubs - totalPaidAmount)} icon={Clock} accent={tokens.amber} />
      </div>

      {/* Month grid */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ fontSize: 10.5, fontWeight: 700, color: tokens.textMuted, textAlign: 'center', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((d, i) => {
            const isToday = isViewingCurrent && d === today.getDate();
            const dayEntries = d ? (byDay[d] || []) : [];
            return (
              <div key={i} style={{ minHeight: 66, borderRadius: 9, border: `1px solid ${isToday ? tokens.blue : tokens.border}`, background: isToday ? '#EFF6FF' : d ? '#fff' : 'transparent', padding: '5px 5px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {d && <div style={{ fontSize: 10.5, fontWeight: 700, color: isToday ? tokens.blue : tokens.textMuted }}>{d}</div>}
                {dayEntries.slice(0, 3).map((e, ei) => (
                  <div key={ei} title={`${e.chit.chitName || e.chit.companyName} · Round #${e.round}`}
                    style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 4px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: e.isPaid ? tokens.greenLight : (e.isCashed ? '#EDEBFF' : '#FEF3E2'), color: e.isPaid ? tokens.green : (e.isCashed ? '#5521B5' : '#B45309') }}>
                    {e.chit.chitName || e.chit.companyName}
                  </div>
                ))}
                {dayEntries.length > 3 && <div style={{ fontSize: 9, color: tokens.textMuted }}>+{dayEntries.length - 3} more</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          {[{ c: '#FEF3E2', tc: '#B45309', l: 'Due / unpaid' }, { c: tokens.greenLight, tc: tokens.green, l: 'Paid' }, { c: '#EDEBFF', tc: '#5521B5', l: 'Already cashed' }].map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: tokens.textSub }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: x.c, border: `1px solid ${x.tc}40` }} /> {x.l}
            </div>
          ))}
        </div>
      </Card>

      {/* Detailed list for the month */}
      <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text, marginBottom: 10 }}>Auctions — {monthLabel(viewMonth)}</div>
      {entries.length === 0 ? (
        <Card><EmptyState icon={CalIcon} title="Nothing due this month" subtitle="None of your joined chits have a round landing in this month" /></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e, i) => {
            const c = e.chit;
            const rowSaving = !!saving[c.id];
            return (
              <Card key={i} noPad>
                <div onClick={() => nav('/cf/other-chits')} style={{ cursor: 'pointer', padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14.5, color: tokens.text }}>{c.chitName || c.companyName}</span>
                      <Badge status={e.isCashed ? 'Cashed' : e.isPaid ? 'Paid' : 'Due'} />
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: tokens.slateLight, color: tokens.textSub, textTransform: 'uppercase' }}>{c.commissionType || 'Single'} commission</span>
                    </div>
                    <div style={{ fontSize: 12, color: tokens.textSub }}>{formatCurrency(c.totalChitValue)} · Round #{e.round} of {c.totalMembers} · auction day {c.auctionDayOfMonth || 1}</div>
                    {!e.isCashed && (
                      <div style={{ fontSize: 11.5, color: tokens.green, marginTop: 4 }}>If you cash: est. {formatCurrency(e.estCashInHand)} in hand</div>
                    )}
                    {e.isCashed && <div style={{ fontSize: 11.5, color: '#5521B5', marginTop: 4 }}>Already cashed — this round is still owed, no more discount{c.commissionType === 'Double' ? ' applies, but commission keeps accruing' : ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>Expected</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: e.isPaid ? tokens.green : tokens.text, textDecoration: e.isPaid ? 'line-through' : 'none' }}>{formatCurrency(e.expected)}</div>
                    {!e.isPaid && <div style={{ fontSize: 10.5, color: tokens.textMuted }}>est. net payable</div>}
                  </div>
                </div>
                {!e.isPaid && (
                  <div onClick={ev => ev.stopPropagation()} style={{ borderTop: `1px solid ${tokens.border}`, padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: tokens.slateLight }}>
                    <input type="number" placeholder={`₹${Math.round(e.expected)}`} value={entryInput[c.id] || ''}
                      onChange={ev => setEntryInput(v => ({ ...v, [c.id]: ev.target.value }))}
                      style={{ width: 130, height: 32, padding: '0 10px', borderRadius: 8, border: `1.5px solid ${tokens.border}`, fontSize: 12.5, fontFamily: 'inherit' }} />
                    <button disabled={rowSaving || !entryInput[c.id]} onClick={() => quickMark(e, +entryInput[c.id])}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tokens.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: (rowSaving || !entryInput[c.id]) ? 'not-allowed' : 'pointer', opacity: (rowSaving || !entryInput[c.id]) ? 0.5 : 1, fontFamily: 'inherit' }}>
                      + Enter amount paid
                    </button>
                    <button disabled={rowSaving} onClick={() => quickMark(e)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${tokens.border}`, background: '#fff', color: tokens.textSub, fontSize: 12, fontWeight: 700, cursor: rowSaving ? 'not-allowed' : 'pointer', opacity: rowSaving ? 0.5 : 1, fontFamily: 'inherit' }}>
                      {rowSaving ? 'Saving…' : `Mark paid (${formatCurrency(e.expected)})`}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {chits.some(c => c.myStatus === 'Cashed') && (
        <div style={{ marginTop: 16, fontSize: 11.5, color: tokens.textMuted, lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trophy size={13} /> Already-cashed chits stay on this calendar until every round is actually paid off — see Auctions / Exposure &amp; Risk for the full picture.
        </div>
      )}
    </div>
  );
}
