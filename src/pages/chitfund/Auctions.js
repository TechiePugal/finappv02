import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gavel, ChevronDown, ChevronRight, Users, CheckCircle, Clock,
  ArrowRight, Trash2, Edit2, X, AlertTriangle, BarChart3, TrendingUp
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDashboardData, getAuctionPayments, updatePaymentStatus, deleteAuction,
  getAuctionResultByRound, giveWinnerPayout, revertWinnerPayout
} from '../../utils/cf_firestore';
import { formatCurrency, formatMonthYear } from '../../utils/cf_format';
import {
  Card, PageHeader, Badge, StatCard, tokens, Button, Modal,
  FormField, SectionHeader, FilterTabs, SearchBar
} from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmt(v) { return formatCurrency(v || 0); }
function IBtn({ icon: Icon, onClick, title, danger, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={e => { e.stopPropagation(); if (!disabled) onClick(e); }}
      disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, border: `1px solid ${h && !disabled ? (danger ? tokens.red : '#bfcce4') : tokens.border}`, background: h && !disabled ? (danger ? '#FDE8E8' : tokens.blueLight) : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', opacity: disabled ? 0.4 : 1 }}>
      <Icon size={13} color={h && !disabled ? (danger ? tokens.red : tokens.blue) : tokens.textSub} strokeWidth={2} />
    </button>
  );
}

// ── CollectBtn: toggle paid/pending per member ────────────────────────────────
export function CollectBtn({ isPaid, loading, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 99, border: 'none', cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, transition: 'all 0.15s', background: isPaid ? '#D1FAE5' : '#FEF3C7', color: isPaid ? '#065F46' : '#92400E', minWidth: 90, justifyContent: 'center' }}>
      {loading ? <span style={{ width: 10, height: 10, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite', display: 'inline-block' }} /> : isPaid ? <CheckCircle size={11} /> : <Clock size={11} />}
      {loading ? '' : isPaid ? 'Paid ✓' : 'Pending'}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}

// ── Settlement Popup — Cash/Account split + remarks, opens when marking a member Paid ──
export function SettlementPopup({ payment, onClose, onConfirm, onMarkUnpaid }) {
  const netPayable = payment?.netPayable || 0;
  const alreadyPaid = payment?.paymentStatus === 'Paid';
  const [cashAmt, setCashAmt] = useState(String(netPayable));
  const [acctAmt, setAcctAmt] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  if (!payment) return null;
  const cashV = parseFloat(cashAmt) || 0, acctV = parseFloat(acctAmt) || 0;
  const splitTotal = cashV + acctV;
  const mismatch = Math.round(splitTotal) !== Math.round(netPayable);
  async function confirm() {
    setSaving(true);
    await onConfirm({ cashAmount: cashV, accountAmount: acctV, remarks });
    setSaving(false);
  }
  async function markUnpaid() {
    setSaving(true);
    await onMarkUnpaid();
    setSaving(false);
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 28px 72px rgba(0,0,0,.25)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', background: `linear-gradient(135deg,${tokens.blue},#6366f1)` }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.65)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Settle Payment</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{payment.memberName}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>Net payable: <strong style={{ color: '#fff' }}>{fmt(netPayable)}</strong></div>
        </div>
        <div style={{ padding: 20 }}>
          {alreadyPaid ? (
            <>
              <div style={{ fontSize: 12.5, color: tokens.textSub, marginBottom: 14 }}>This payment is already marked <strong style={{ color: tokens.green }}>Paid</strong>. Here's how it was recorded:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ padding: '10px 12px', borderRadius: 9, background: tokens.slateLight }}>
                  <div style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>💵 Cash</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>{fmt(payment.cashAmount || 0)}</div>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 9, background: tokens.slateLight }}>
                  <div style={{ fontSize: 10.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>🏦 Account</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>{fmt(payment.accountAmount || 0)}</div>
                </div>
              </div>
              {payment.remarks && (
                <div style={{ marginBottom: 16, fontSize: 12.5, color: tokens.textSub, fontStyle: 'italic', padding: '10px 12px', background: tokens.slateLight, borderRadius: 9 }}>"{payment.remarks}"</div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={markUnpaid} disabled={saving}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: tokens.red, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Reverting…' : '↩ Mark Unpaid'}
                </button>
                <button onClick={onClose} disabled={saving}
                  style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', color: tokens.textSub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
          <div style={{ fontSize: 11.5, color: tokens.textSub, marginBottom: 12 }}>Split how this amount was actually handled — cash in hand vs bank/account — for your own records.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textSub, display: 'block', marginBottom: 5 }}>💵 Cash Amount</label>
              <input type="number" value={cashAmt} onChange={e => setCashAmt(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            </div>
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textSub, display: 'block', marginBottom: 5 }}>🏦 Account Amount</label>
              <input type="number" value={acctAmt} onChange={e => setAcctAmt(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            </div>
          </div>
          {mismatch && (
            <div style={{ marginBottom: 14, fontSize: 11.5, color: tokens.amber, background: `${tokens.amberLight}`, padding: '8px 12px', borderRadius: 9 }}>
              ⚠ Cash + Account ({fmt(splitTotal)}) doesn't match the net payable ({fmt(netPayable)}). You can still save if this is intentional.
            </div>
          )}
          <label style={{ fontSize: 11.5, fontWeight: 700, color: tokens.textSub, display: 'block', marginBottom: 5 }}>Remarks <span style={{ fontWeight: 400, color: tokens.textMuted }}>(optional)</span></label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Any note about this settlement…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={confirm} disabled={saving}
              style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: tokens.blue, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : '✓ Confirm Settlement'}
            </button>
            <button onClick={onClose} disabled={saving}
              style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', color: tokens.textSub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Payment Collection Modal ──────────────────────────────────────────────────
export function PaymentModal({ open, onClose, auction }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [settleTarget, setSettleTarget] = useState(null); // payment record being settled via popup
  const [auctionResult, setAuctionResult] = useState(null); // chit_auction_results doc — tracks payoutGiven
  const [payoutPopupOpen, setPayoutPopupOpen] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);

  useEffect(() => {
    if (!open || !auction) return;
    setPayments([]);
    setAuctionResult(null);
    setLoading(true);
    Promise.all([
      getAuctionPayments(auction.chitId, auction.auctionNumber),
      getAuctionResultByRound(auction.chitId, auction.auctionNumber),
    ]).then(([p, ar]) => { setPayments(p); setAuctionResult(ar); setLoading(false); });
  }, [open, auction]);

  async function togglePayment(payId, currentStatus, mode) {
    setUpdatingId(payId);
    const next = currentStatus === 'Paid' ? 'Pending' : 'Paid';
    await updatePaymentStatus(payId, next, null, mode);
    setPayments(prev => prev.map(p => p.id === payId ? { ...p, paymentStatus: next, paymentMode: mode || p.paymentMode } : p));
    setUpdatingId(null);
  }
  async function setMode(payId, mode) {
    setPayments(prev => prev.map(p => p.id === payId ? { ...p, paymentMode: mode } : p));
    await updatePaymentStatus(payId, payments.find(p=>p.id===payId)?.paymentStatus || 'Pending', null, mode);
  }
  async function confirmSettlement(extra) {
    const p = settleTarget;
    setUpdatingId(p.id);
    await updatePaymentStatus(p.id, 'Paid', null, extra);
    setPayments(prev => prev.map(x => x.id === p.id ? { ...x, paymentStatus: 'Paid', ...extra } : x));
    setUpdatingId(null);
    setSettleTarget(null);
  }
  async function confirmUnpaid() {
    const p = settleTarget;
    setUpdatingId(p.id);
    await updatePaymentStatus(p.id, 'Pending', null, { cashAmount: null, accountAmount: null, remarks: '' });
    setPayments(prev => prev.map(x => x.id === p.id ? { ...x, paymentStatus: 'Pending', cashAmount: null, accountAmount: null, remarks: '' } : x));
    setUpdatingId(null);
    setSettleTarget(null);
  }

  async function confirmPayout(extra) {
    if (!auctionResult) return;
    setPayoutSaving(true);
    await giveWinnerPayout(auctionResult.id, extra, null);
    setAuctionResult(prev => ({ ...prev, payoutGiven: true, payoutCash: extra.cashAmount, payoutBank: extra.accountAmount, payoutRemarks: extra.remarks }));
    setPayoutSaving(false);
    setPayoutPopupOpen(false);
  }
  async function undoPayout() {
    if (!auctionResult) return;
    setPayoutSaving(true);
    await revertWinnerPayout(auctionResult.id, null);
    setAuctionResult(prev => ({ ...prev, payoutGiven: false, payoutCash: 0, payoutBank: 0, payoutRemarks: '' }));
    setPayoutSaving(false);
  }

  async function markAll(status) {
    const toUpdate = payments.filter(p => p.paymentStatus !== status);
    for (const p of toUpdate) {
      setUpdatingId(p.id);
      await updatePaymentStatus(p.id, status, null);
    }
    setPayments(prev => prev.map(p => ({ ...p, paymentStatus: status })));
    setUpdatingId(null);
  }

  if (!open || !auction) return null;

  const paidCount = payments.filter(p => p.paymentStatus === 'Paid').length;
  const pendingCount = payments.length - paidCount;
  const collectedAmt = payments.filter(p => p.paymentStatus === 'Paid').reduce((s, p) => s + (p.netPayable || 0), 0);
  const totalAmt = payments.reduce((s, p) => s + (p.netPayable || 0), 0);
  const pct = payments.length > 0 ? Math.round((paidCount / payments.length) * 100) : 0;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 72px rgba(0,0,0,.22)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px', background: `linear-gradient(135deg,${tokens.blue},#6366f1)`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
                Payment Collection — Auction #{auction.auctionNumber}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-.3px' }}>{auction.chitName}</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
                {fmtDate(auction.auctionDate)} · Winner: <strong style={{ color: '#fff' }}>{auction.winnerName || 'Company'}</strong> · Bid: <strong style={{ color: '#fff' }}>{fmt(auction.bidAmount)}</strong>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,.18)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Progress + KPIs */}
        <div style={{ padding: '14px 24px', borderBottom: `1px solid ${tokens.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {[
              { label: 'Total Members', val: payments.length, color: tokens.blue },
              { label: 'Collected', val: `${paidCount} / ${payments.length}`, color: tokens.green },
              { label: 'Pending', val: pendingCount, color: tokens.amber },
              { label: 'Amount Collected', val: fmt(collectedAmt), color: tokens.purple },
              { label: 'Total Receivable', val: fmt(totalAmt), color: tokens.text },
            ].map((k, i) => (
              <div key={i}>
                <div style={{ fontSize: 10, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11.5, color: tokens.textSub }}>
              <span>Collection Progress</span>
              <span style={{ fontWeight: 700, color: pct === 100 ? tokens.green : tokens.blue }}>{pct}%</span>
            </div>
            <div style={{ height: 7, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? tokens.green : `linear-gradient(90deg,${tokens.blue},#6366f1)`, borderRadius: 4, transition: 'width .5s ease' }} />
            </div>
          </div>
        </div>

        {/* Winner payout — gated behind full collection */}
        {auctionResult && (
          <div style={{ padding: '14px 24px', borderBottom: `1px solid ${tokens.border}`, background: auctionResult.payoutGiven ? 'rgba(52,199,89,0.05)' : pendingCount === 0 ? 'rgba(88,86,214,0.05)' : tokens.slateLight, flexShrink: 0 }}>
            {auctionResult.payoutGiven ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: tokens.green }}>✓ Payout given to {auction.winnerName || 'Company'}</div>
                  <div style={{ fontSize: 11.5, color: tokens.textSub, marginTop: 2 }}>
                    💵 {fmt(auctionResult.payoutCash)} · 🏦 {fmt(auctionResult.payoutBank)}
                    {auctionResult.payoutRemarks && ` · "${auctionResult.payoutRemarks}"`}
                  </div>
                </div>
                <button onClick={undoPayout} disabled={payoutSaving}
                  style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${tokens.border}`, background: '#fff', color: tokens.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ↩ Undo
                </button>
              </div>
            ) : pendingCount === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: tokens.purple }}>All contributions collected — ready to pay {auction.winnerName || 'Company'}</div>
                  <div style={{ fontSize: 11.5, color: tokens.textSub, marginTop: 2 }}>Prize: <strong>{fmt(payments.find(p => p.isWinner)?.winnerPayout || 0)}</strong></div>
                </div>
                <button onClick={() => setPayoutPopupOpen(true)}
                  style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: tokens.purple, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  🏆 Give Payout to Winner
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: tokens.textSub }}>
                ⏳ Winner's payout is on hold until all {pendingCount} pending contribution{pendingCount !== 1 ? 's are' : ' is'} collected.
              </div>
            )}
          </div>
        )}

        {/* Bulk actions */}
        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={() => markAll('Paid')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: `1px solid #D1FAE5`, background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <CheckCircle size={12} /> Mark All Collected
          </button>
          <button onClick={() => markAll('Pending')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, border: `1px solid #FEF3C7`, background: '#FFFBEB', color: '#92400E', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Clock size={12} /> Reset All to Pending
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: tokens.textSub }}>
            <span>Total: <strong style={{ color: tokens.text }}>{fmt(totalAmt)}</strong></span>
            <span>Collected: <strong style={{ color: tokens.green }}>{fmt(collectedAmt)}</strong></span>
          </div>
        </div>

        {/* Member list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${tokens.border}`, borderTopColor: tokens.blue, borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
              Loading member payments…
            </div>
          ) : payments.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted, fontSize: 14 }}>No payment records found for this auction.</div>
          ) : payments.map((p, i) => {
            const isPaid = p.paymentStatus === 'Paid';
            const isWinner = p.isWinner;
            const isUpdating = updatingId === p.id;
            return (
              <div key={p.id || i}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 24px', borderBottom: `1px solid ${tokens.border}`, background: isPaid ? 'rgba(5,150,105,0.025)' : 'transparent', transition: 'background 0.2s' }}>
                {/* Avatar */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: isWinner ? '#EDE9FE' : isPaid ? '#D1FAE5' : '#DBEAFE', color: isWinner ? '#5B21B6' : isPaid ? '#065F46' : '#1D4ED8' }}>
                  {(p.memberName || '?')[0].toUpperCase()}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: tokens.text }}>{p.memberName}</span>
                    {isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#5B21B6', color: '#fff' }}>WINNER</span>}
                    {p.commissionReceived > 0 && !isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#D1FAE5', color: '#065F46' }}>ELIGIBLE</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: tokens.textSub }}>
                    Contribution: {fmt(p.contributionAmount)}
                    {p.commissionReceived > 0 && <span style={{ color: tokens.green }}> · Commission back: {fmt(p.commissionReceived)}</span>}
                    {isWinner && p.winnerPayout > 0 && <span style={{ color: tokens.purple }}> · 🏆 Prize: {fmt(p.winnerPayout)}</span>}
                  </div>
                </div>
                {/* Net payable */}
                <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>{fmt(p.netPayable)}</div>
                  <div style={{ fontSize: 10.5, color: tokens.textMuted }}>net payable</div>
                </div>
                {/* Collect toggle */}
                <div style={{ display:'flex', flexDirection: 'column', alignItems:'flex-end', gap:4 }}>
                  <CollectBtn isPaid={isPaid} loading={isUpdating} onClick={() => setSettleTarget(p)} />
                  {isPaid && (p.cashAmount != null || p.accountAmount != null) && (
                    <div style={{ fontSize: 9.5, color: tokens.textMuted, textAlign: 'right' }}>
                      {p.cashAmount > 0 && `💵 ${fmt(p.cashAmount)}`}{p.cashAmount > 0 && p.accountAmount > 0 && ' · '}{p.accountAmount > 0 && `🏦 ${fmt(p.accountAmount)}`}
                    </div>
                  )}
                  {isPaid && p.remarks && (
                    <div style={{ fontSize: 9.5, color: tokens.textMuted, fontStyle: 'italic', textAlign: 'right', maxWidth: 140 }}>"{p.remarks}"</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {settleTarget && <SettlementPopup payment={settleTarget} onClose={() => setSettleTarget(null)} onConfirm={confirmSettlement} onMarkUnpaid={confirmUnpaid} />}
      {payoutPopupOpen && (
        <SettlementPopup
          payment={{ memberName: auction.winnerName || 'Company', netPayable: payments.find(p => p.isWinner)?.winnerPayout || 0, paymentStatus: 'Pending' }}
          onClose={() => setPayoutPopupOpen(false)}
          onConfirm={confirmPayout}
        />
      )}

    </div>
  );
}

// ── Delete Auction Modal ──────────────────────────────────────────────────────
function DeleteAuctionModal({ open, onClose, auction, onDeleted }) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  async function handleDelete() {
    setDeleting(true); setErr('');
    try {
      await deleteAuction(auction.chitId, auction.id || auction.scheduleId, auction.auctionNumber, user.uid);
      onDeleted();
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setDeleting(false); }
  }

  if (!open || !auction) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(15,23,42,.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440, boxShadow: '0 28px 72px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px', background: '#FEF2F2', borderBottom: `1px solid #FECACA` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Trash2 size={18} color={tokens.red} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#991B1B' }}>Delete Auction #{auction.auctionNumber}</div>
              <div style={{ fontSize: 12.5, color: '#B91C1C', marginTop: 2 }}>{auction.chitName}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: '18px 22px' }}>
          {err && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEE2E2', borderRadius: 9, fontSize: 13, color: tokens.red }}>{err}</div>}
          <p style={{ fontSize: 13.5, color: tokens.textSub, lineHeight: 1.7, marginBottom: 16 }}>
            This will permanently delete auction #{auction.auctionNumber} and <strong>reverse all its effects</strong>:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {[
              'Reset auction slot to Pending',
              'Delete all member payment records',
              'Delete commission distribution records',
              'Delete ledger entries for this auction',
              `Restore winner "${auction.winnerName || '?'}" status to Active`,
              'Reverse investment, commission, and received amounts on chit totals',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: tokens.textSub }}>
                <span style={{ color: tokens.red, flexShrink: 0 }}>⚠</span> {item}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: tokens.red, fontWeight: 600, marginBottom: 16 }}>This action cannot be undone.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleDelete} disabled={deleting}
              style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: deleting ? '#FCA5A5' : tokens.red, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete Permanently'}
            </button>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: tokens.textSub, fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Auction Card — compact box-grid style ───────────────────────────────────
function AuctionRow({ auction, onPaymentClick, onDeleteClick, nav }) {
  const now = new Date();
  const d = auction.auctionDate?.seconds ? new Date(auction.auctionDate.seconds * 1000) : new Date(auction.auctionDate);
  const daysAway = Math.floor((d - now) / 86400000);
  const isCompleted = auction.status === 'Completed';
  const isUrgent = !isCompleted && daysAway >= 0 && daysAway <= 2;
  const isOverdue = !isCompleted && daysAway < 0;
  const accent = isCompleted ? tokens.green : isUrgent ? tokens.red : isOverdue ? tokens.amber : tokens.textMuted;
  const bg = isCompleted ? 'rgba(52,199,89,0.05)' : isUrgent ? 'rgba(255,59,48,0.05)' : isOverdue ? 'rgba(255,149,0,0.05)' : '#fff';
  const border = isCompleted ? 'rgba(52,199,89,0.25)' : isUrgent ? 'rgba(255,59,48,0.3)' : isOverdue ? 'rgba(255,149,0,0.3)' : tokens.border;

  return (
    <div
      onClick={() => isCompleted ? onPaymentClick(auction) : nav(`/cf/chits/${auction.chitId}`)}
      style={{ position: 'relative', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', background: bg, border: `1.5px solid ${border}`, transition: 'transform 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'none'}>

      {isCompleted && (
        <button title="Delete this auction" onClick={e => { e.stopPropagation(); onDeleteClick(auction); }}
          style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.04)', color: tokens.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trash2 size={11} />
        </button>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>Round #{auction.auctionNumber}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: tokens.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{auction.chitName}</div>
      <div style={{ fontSize: 10.5, color: tokens.textSub, marginBottom: 8 }}>{fmtDate(auction.auctionDate)}</div>

      {isCompleted ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1a7a34' }}>{auction.winnerName}</div>
          <div style={{ fontSize: 10.5, color: tokens.textSub, marginBottom: 8 }}>Bid: {fmt(auction.bidAmount)} · Prize: {fmt((auction.perHead * auction.totalMembers) - auction.bidAmount)}</div>
          <button
            title="View payments & collect"
            onClick={e => { e.stopPropagation(); onPaymentClick(auction); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 8, border: `1px solid ${tokens.blue}30`, background: tokens.blueLight, color: tokens.blue, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Users size={11} /> Collect
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: accent, marginBottom: 8 }}>
            {isUrgent ? `⚡ ${daysAway === 0 ? 'Today!' : 'Tomorrow!'}` : isOverdue ? `⚠ ${Math.abs(daysAway)}d overdue` : 'Not taken'}
          </div>
          <button
            onClick={e => { e.stopPropagation(); nav(`/cf/chits/${auction.chitId}`); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 0', borderRadius: 8, border: 'none', background: isUrgent ? tokens.red : tokens.amber, color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Gavel size={11} /> Process
          </button>
        </>
      )}
    </div>
  );
}

// ── Month Group ───────────────────────────────────────────────────────────────
function MonthGroup({ group, onPaymentClick, onDeleteClick, nav, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const now = new Date();
  const nowMo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrent = group.key === nowMo;
  const completedCount = group.auctions.filter(a => a.status === 'Completed').length;
  const pendingCount = group.auctions.length - completedCount;
  const totalBid = group.auctions.filter(a => a.status === 'Completed').reduce((s, a) => s + (a.bidAmount || 0), 0);
  const hasUrgent = group.auctions.some(a => {
    if (a.status === 'Completed') return false;
    const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds * 1000) : new Date(a.auctionDate);
    return Math.floor((d - now) / 86400000) <= 2;
  });

  return (
    <div style={{ border: `1.5px solid ${isCurrent ? tokens.blue + '50' : hasUrgent ? tokens.red + '40' : tokens.border}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isCurrent ? '#EFF6FF' : open ? '#fff' : '#F8FAFC', transition: 'background 0.15s' }}
        onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#F1F5F9'; }}
        onMouseLeave={e => { e.currentTarget.style.background = isCurrent ? '#EFF6FF' : open ? '#fff' : '#F8FAFC'; }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: isCurrent ? tokens.blue : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gavel size={17} color={isCurrent ? '#fff' : '#64748B'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: tokens.text }}>{formatMonthYear(group.date)}</span>
              {isCurrent && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: tokens.blue, color: '#fff', letterSpacing: '.04em' }}>THIS MONTH</span>}
              {hasUrgent && <span style={{ fontSize: 10, fontWeight: 800, color: tokens.red }}>⚡ URGENT</span>}
            </div>
            <div style={{ fontSize: 12, color: tokens.textSub, marginTop: 2 }}>
              {group.auctions.length} auction{group.auctions.length !== 1 ? 's' : ''}
              {completedCount > 0 && <span style={{ color: tokens.green }}> · {completedCount} completed</span>}
              {pendingCount > 0 && <span style={{ color: tokens.amber }}> · {pendingCount} pending</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {completedCount > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Total Bid</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: tokens.blue }}>{fmt(totalBid)}</div>
            </div>
          )}
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {open ? <ChevronDown size={14} color={tokens.textSub} /> : <ChevronRight size={14} color={tokens.textSub} />}
          </div>
        </div>
      </div>

      {/* Auction cards — box grid */}
      {open && (
        <div style={{ borderTop: `1px solid ${tokens.border}`, padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
            {group.auctions.map((a, i) => (
              <AuctionRow
                key={a.id || i}
                auction={a}
                onPaymentClick={onPaymentClick}
                onDeleteClick={onDeleteClick}
                nav={nav}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Auctions() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [allAuctions, setAllAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const data = await getDashboardData(user.uid);
    const auctions = [];
    data.chits.forEach(c => {
      (data.schedules[c.id] || []).forEach(a => {
        auctions.push({
          ...a,
          chitId: c.id,
          chitName: c.companyName,
          perHead: c.perHeadValue || 0,
          totalMembers: c.totalMembers || 0,
        });
      });
    });
    // Sort by date ascending
    auctions.sort((a, b) => {
      const da = a.auctionDate?.seconds ?? (new Date(a.auctionDate).getTime() / 1000);
      const db2 = b.auctionDate?.seconds ?? (new Date(b.auctionDate).getTime() / 1000);
      return da - db2;
    });
    setAllAuctions(auctions);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Filtered list
  const filtered = allAuctions.filter(a => {
    const mf = filter === 'All' || a.status === filter;
    const ms = !search || a.chitName?.toLowerCase().includes(search.toLowerCase()) || (a.winnerName || '').toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  // Group by month
  const groups = {};
  filtered.forEach(a => {
    const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds * 1000) : new Date(a.auctionDate);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[k]) groups[k] = { key: k, date: d, auctions: [] };
    groups[k].auctions.push(a);
  });
  const monthGroups = Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));

  const now = new Date();
  const nowMo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const totalAuctions = allAuctions.length;
  const completedCount = allAuctions.filter(a => a.status === 'Completed').length;
  const pendingCount = allAuctions.filter(a => a.status === 'Pending').length;
  const companyCount = allAuctions.filter(a => a.takenByCompany).length;
  const urgentCount = allAuctions.filter(a => {
    if (a.status === 'Completed') return false;
    const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds * 1000) : new Date(a.auctionDate);
    const days = Math.floor((d - now) / 86400000);
    return days >= 0 && days <= 2;
  }).length;

  if (loading) return <PageLoader stats={4} />;

  return (
    <div>
      <PageHeader
        title="All Auctions"
        subtitle="View, manage and collect payments · Click completed auctions to mark payments per member · Delete to reverse"
      />

      {/* Urgent alert */}
      {urgentCount > 0 && (
        <div style={{ marginBottom: 18, padding: '13px 18px', background: '#FEF2F2', border: `1.5px solid #FECACA`, borderRadius: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={17} color={tokens.red} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#991B1B' }}>
              ⚡ {urgentCount} Urgent Auction{urgentCount > 1 ? 's' : ''} — Must be processed within 2 days!
            </div>
            <div style={{ fontSize: 12.5, color: '#B91C1C', marginTop: 2 }}>
              {allAuctions.filter(a => {
                if (a.status === 'Completed') return false;
                const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds * 1000) : new Date(a.auctionDate);
                return Math.floor((d - now) / 86400000) <= 2;
              }).map(a => `${a.chitName} #${a.auctionNumber}`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Auctions" value={totalAuctions} sub={`${monthGroups.length} months`} icon={Gavel} accent={tokens.blue} />
        <StatCard label="Completed" value={completedCount} sub="processed & recorded" icon={CheckCircle} accent={tokens.green} />
        <StatCard label="Pending" value={pendingCount} sub={urgentCount > 0 ? `${urgentCount} urgent!` : 'to be conducted'} icon={Clock} accent={urgentCount > 0 ? tokens.red : tokens.amber} />
        <StatCard label="Company Taken" value={companyCount} sub="auctions by company" icon={BarChart3} accent="#5B21B6" />
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by chit fund or winner…" />
        </div>
        <FilterTabs
          tabs={[
            { label: 'All', value: 'All' },
            { label: `Pending (${pendingCount})`, value: 'Pending' },
            { label: `Completed (${completedCount})`, value: 'Completed' },
          ]}
          active={filter}
          onChange={setFilter}
        />
        <span style={{ fontSize: 12.5, color: tokens.textMuted, marginLeft: 'auto' }}>
          {filtered.length} auction{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Month groups */}
      {monthGroups.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '56px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textSub, marginBottom: 6 }}>No auctions found</div>
            <div style={{ fontSize: 13, color: tokens.textMuted }}>
              {search ? 'Try a different search term' : 'Create chit funds to generate auction schedules'}
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {monthGroups.map(group => (
            <MonthGroup
              key={group.key}
              group={group}
              onPaymentClick={setPaymentTarget}
              onDeleteClick={setDeleteTarget}
              nav={nav}
              defaultOpen={group.key >= nowMo}
            />
          ))}
        </div>
      )}

      {/* Payment Collection Modal */}
      <PaymentModal
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        auction={paymentTarget}
      />

      {/* Delete Auction Modal */}
      <DeleteAuctionModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        auction={deleteTarget}
        onDeleted={load}
      />
    </div>
  );
}
