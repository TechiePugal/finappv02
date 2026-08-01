import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';
import { logStatusChange } from '../../utils/statusHistory';
import toast from 'react-hot-toast';
import { PageHeader, Card, Badge, Button, StatCard, Modal, FormField, Input, Select, formatCurrency } from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';

export default function Refunding() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [refunds, setRefunds] = useState({}); // depositorId -> [refund records]
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refundModal, setRefundModal] = useState(null); // depositor being refunded
  const [rf, setRf] = useState({ amount: '', date: '', mode: 'Cash', remarks: '', full: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = onSnapshot(collection(db, 'deposit_master'), snap => {
      setDeposits(scopeToUser(snap.docs.map(x => ({ id: x.id, ...x.data() })), user?.uid).filter(x => x.status === 'Active'));
      setLoading(false);
    }, () => setLoading(false));
    const r = onSnapshot(collection(db, 'deposit_refunds'), snap => {
      const rm = {};
      scopeToUser(snap.docs.map(x => ({ id: x.id, ...x.data() })), user?.uid).forEach(x => {
        if (!rm[x.depositorId]) rm[x.depositorId] = [];
        rm[x.depositorId].push(x);
      });
      setRefunds(rm);
    });
    return () => { d(); r(); };
  }, [user]);

  const filtered = deposits.filter(dp => {
    const q = search.trim().toLowerCase();
    return !q || [dp.name, dp.phone, dp.depositId].some(v => String(v || '').toLowerCase().includes(q));
  });

  const totalActiveDeposits = deposits.reduce((s, d) => s + (d.depositAmount || 0), 0);
  const totalRefundedAllTime = Object.values(refunds).flat().reduce((s, r) => s + (r.amount || 0), 0);

  function openRefund(dep) {
    setRefundModal(dep);
    setRf({ amount: String(dep.depositAmount || ''), date: new Date().toISOString().split('T')[0], mode: 'Cash', remarks: '', full: true });
  }

  async function saveRefund() {
    const amount = parseFloat(rf.amount) || 0;
    if (amount <= 0) return toast.error('Enter a valid refund amount');
    const dep = refundModal;
    if (amount > (dep.depositAmount || 0)) return toast.error(`Cannot refund more than the current deposit (${formatCurrency(dep.depositAmount)})`);
    setSaving(true);
    try {
      const newAmount = Math.max(0, (dep.depositAmount || 0) - amount);
      const isFullPayout = newAmount === 0;

      // Own audit-trail record — separate from interest settlements, keeps a clean
      // history of every principal payout with its date, mode and note.
      await addDoc(collection(db, 'deposit_refunds'), {
        depositorId: dep.id, depositorName: dep.name, depositId: dep.depositId || dep.id,
        amount, previousAmount: dep.depositAmount || 0, newAmount, date: rf.date, mode: rf.mode, remarks: rf.remarks,
        isFullPayout, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });

      // Ledger entry — this is money going OUT to the depositor, a Debit (unlike a
      // loan repayment coming IN), so it correctly reduces net cash position.
      await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Debit', category: 'Deposit Refund',
        description: `${isFullPayout ? 'Full' : 'Partial'} deposit payout to ${dep.name} — ${formatCurrency(dep.depositAmount)} → ${formatCurrency(newAmount)}${rf.remarks ? ' · ' + rf.remarks : ''}`,
        amount, paymentMode: rf.mode, date: rf.date,
        borrowerName: dep.name, depositorId: dep.id, depositId: dep.depositId || dep.id,
        createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });

      // Reduce the deposit's actual principal — full payout closes it entirely.
      const newStatus = isFullPayout ? 'Closed' : dep.status;
      await updateDoc(doc(db, 'deposit_master', dep.id), { depositAmount: newAmount, status: newStatus, updatedAt: serverTimestamp() });
      if (dep.status !== newStatus) await logStatusChange('deposit', dep.id, dep.status, newStatus, user?.uid);

      if (isFullPayout) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'Deposit Closed',
          description: `Deposit fully refunded and closed — ${dep.name} · ${dep.depositId || dep.id}`,
          amount: amount, date: rf.date,
          borrowerName: dep.name, depositorId: dep.id, depositId: dep.depositId || dep.id,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }

      toast.success(isFullPayout ? `✓ Full deposit refunded — ${formatCurrency(amount)}. Deposit closed.` : `✓ ${formatCurrency(amount)} refunded — remaining deposit: ${formatCurrency(newAmount)}`);
      setRefundModal(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader stats={3} />;

  return (
    <div className="page-enter">
      <PageHeader title="Refunding" subtitle="Pay out deposit principal — full or partial withdrawal, separate from interest settlement" />

      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Active Deposits" value={deposits.length} sub="Eligible for refund" color="#5856d6" />
        <StatCard label="Total Deposited (Active)" value={formatCurrency(Math.round(totalActiveDeposits))} sub="Current principal held" color="#007aff" />
        <StatCard label="Refunded (All Time)" value={formatCurrency(Math.round(totalRefundedAllTime))} sub="Principal paid out so far" color="#ff9500" />
      </div>

      <Card>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, deposit ID…"
          style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.1)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', marginBottom: 16 }} />

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>No active depositors to refund.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map(dep => {
              const depRefunds = refunds[dep.id] || [];
              const totalRefunded = depRefunds.reduce((s, r) => s + (r.amount || 0), 0);
              return (
                <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.07)', flexWrap: 'wrap' }}>
                  {dep.photo ? <img src={dep.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(88,86,214,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#5856d6', flexShrink: 0 }}>{(dep.name || '?')[0].toUpperCase()}</div>}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{dep.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{dep.depositId} · Current: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(dep.depositAmount)}</strong>{totalRefunded > 0 && <span> · Refunded so far: {formatCurrency(totalRefunded)}</span>}</div>
                  </div>
                  <Button size="sm" onClick={() => openRefund(dep)}>Refund</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Refund modal */}
      <Modal open={!!refundModal} onClose={() => setRefundModal(null)} title={`Refund — ${refundModal?.name}`} width={460}
        footer={refundModal && (
          <Button full onClick={saveRefund} disabled={saving}>{saving ? 'Saving…' : `✓ Pay Out ${formatCurrency(parseFloat(rf.amount) || 0)}`}</Button>
        )}>
        {refundModal && (
          <div>
            <div style={{ padding: '12px 14px', background: 'rgba(255,149,0,0.06)', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              Current deposit: <strong>{formatCurrency(refundModal.depositAmount || 0)}</strong>
              {rf.amount && parseFloat(rf.amount) > 0 && (<> → After refund: <strong style={{ color: (refundModal.depositAmount || 0) - (parseFloat(rf.amount) || 0) <= 0 ? '#ff3b30' : '#ff9500' }}>{formatCurrency(Math.max(0, (refundModal.depositAmount || 0) - (parseFloat(rf.amount) || 0)))}</strong>{(refundModal.depositAmount || 0) - (parseFloat(rf.amount) || 0) <= 0 && ' — deposit will be Closed'}</>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={() => setRf(f => ({ ...f, full: true, amount: String(refundModal.depositAmount || '') }))}
                style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1.5px solid ${rf.full ? 'var(--accent)' : 'rgba(0,0,0,0.1)'}`, background: rf.full ? 'rgba(0,122,255,0.06)' : '#fff', color: rf.full ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Full Amount
              </button>
              <button type="button" onClick={() => setRf(f => ({ ...f, full: false, amount: '' }))}
                style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1.5px solid ${!rf.full ? 'var(--accent)' : 'rgba(0,0,0,0.1)'}`, background: !rf.full ? 'rgba(0,122,255,0.06)' : '#fff', color: !rf.full ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Partial Amount
              </button>
            </div>
            <FormField label="Refund Amount (₹)" required>
              <Input type="number" value={rf.amount} onChange={e => setRf(f => ({ ...f, amount: e.target.value, full: parseFloat(e.target.value) === refundModal.depositAmount }))} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <FormField label="Date"><Input type="date" value={rf.date} onChange={e => setRf(f => ({ ...f, date: e.target.value }))} /></FormField>
              <FormField label="Mode">
                <Select value={rf.mode} onChange={e => setRf(f => ({ ...f, mode: e.target.value }))}>
                  <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>DD</option>
                </Select>
              </FormField>
            </div>
            <div style={{ marginTop: 12 }}>
              <FormField label="Remarks (optional)"><Input value={rf.remarks} onChange={e => setRf(f => ({ ...f, remarks: e.target.value }))} placeholder="Reason for the refund…" /></FormField>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
