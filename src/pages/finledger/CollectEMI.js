import React, { useEffect, useState } from 'react';
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';
import { logStatusChange } from '../../utils/statusHistory';
import toast from 'react-hot-toast';
import {
  PageHeader, Card, StatCard, Button, Modal, FormField, Input, Select, formatCurrency,
} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import {
  today, calcFine, getDaysOverdue, getScheduleWithStatus, emiPrincipalPerPeriod, emiInterestPerPeriod, fmtEmiDate,
} from '../../utils/emiHelpers';

export default function CollectEMI() {
  const { user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active'); // active | all | closed
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [windowStarts, setWindowStarts] = useState({});
  const [collectLoan, setCollectLoan] = useState(null);
  const [cpf, setCpf] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const l = onSnapshot(query(collection(db, 'emi_loans'), orderBy('createdAt', 'desc')),
      snap => { setLoans(scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid)); setLoading(false); });
    const c = onSnapshot(collection(db, 'emi_collections'), snap => {
      const cm = {};
      scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid).forEach(x => { if (!cm[x.loanId]) cm[x.loanId] = []; cm[x.loanId].push(x); });
      setCollections(cm);
    });
    return () => { l(); c(); };
  }, [user]);

  const filtered = loans.filter(l => {
    const q = search.trim().toLowerCase();
    const matchS = !q || [l.borrowerName, l.phone, l.emiId].some(v => String(v || '').toLowerCase().includes(q));
    const matchF = filter === 'all' || (filter === 'active' && l.status === 'Active') || (filter === 'closed' && l.status === 'Closed');
    return matchS && matchF;
  });

  const activeLoans = loans.filter(l => l.status === 'Active');
  const totalDue = activeLoans.reduce((s, l) => s + (l.emiAmount || 0), 0);
  const totalCollectedAllTime = Object.values(collections).flat().filter(c => c.status === 'Paid').reduce((s, c) => s + (c.totalCollected || c.amount || 0), 0);
  const totalPendingCount = activeLoans.reduce((s, l) => {
    const cols = collections[l.id] || [];
    const paid = cols.filter(c => c.status === 'Paid').length;
    return s + Math.max(0, (l.totalPeriods || 0) - paid);
  }, 0);

  function openCollectForSlot(loan, periodIdx) {
    const sched = getScheduleWithStatus(loan, collections[loan.id]);
    const slot = sched[periodIdx];
    if (!slot) return;
    if (slot.col) {
      // Already collected — open in edit mode
      const col = slot.col;
      setCollectLoan(loan);
      setCpf({
        amount: String(col.amount || ''), fine: String(col.fine || 0), date: col.date || today(),
        mode: col.mode || 'Cash', remarks: col.remarks || '', collectFine: (col.fine || 0) > 0,
        dueDate: col.dueDate || '', daysOverdue: col.daysOverdue || 0, periodNo: col.periodNo,
        earlyClose: col.earlyClosure || false, editingId: col.id, editingLedgerId: col.ledgerEntryId || null,
      });
    } else {
      const fine = calcFine(slot.dueDate, loan.dailyFineRate || 50);
      setCollectLoan(loan);
      setCpf({
        amount: String(loan.emiAmount || ''), fine: String(fine), date: today(), mode: 'Cash', remarks: '',
        collectFine: fine > 0, dueDate: slot.dueDate || '', daysOverdue: getDaysOverdue(slot.dueDate),
        periodNo: periodIdx + 1, editingId: null, editingLedgerId: null,
      });
    }
  }

  function openCollect(loan) {
    const cols = collections[loan.id] || [];
    const paidCount = cols.filter(c => c.status === 'Paid').length;
    openCollectForSlot(loan, paidCount);
  }

  async function saveCollection(statusSel = 'Paid') {
    const isPartial = statusSel === 'Partial';
    if (statusSel !== 'Unpaid' && (!cpf.amount || parseFloat(cpf.amount) <= 0)) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      const loan = collectLoan;
      const cols = collections[loan.id] || [];
      const fine = cpf.collectFine ? parseFloat(cpf.fine) || 0 : 0;
      const totalCollected = parseFloat(cpf.amount) + fine;
      const fullCols = (cols || []).filter(x => x.status !== 'Partial');
      const paidPeriods = fullCols.length + (isPartial ? 0 : 1);

      const isEditing = !!cpf.editingId;
      const effectivePeriodNo = isEditing ? cpf.periodNo : paidPeriods;

      if (isEditing) {
        const isUnpaid = statusSel === 'Unpaid';
        await updateDoc(doc(db, 'emi_collections', cpf.editingId), {
          amount: isUnpaid ? 0 : parseFloat(cpf.amount), fine: isUnpaid ? 0 : fine, totalCollected: isUnpaid ? 0 : totalCollected,
          date: cpf.date, mode: cpf.mode, remarks: isUnpaid ? 'Reverted to unpaid' : cpf.remarks,
          status: statusSel, updatedAt: serverTimestamp(),
        });
        if (cpf.editingLedgerId) {
          await updateDoc(doc(db, 'finance_ledger_entries', cpf.editingLedgerId), {
            description: isUnpaid
              ? `EMI #${effectivePeriodNo} from ${loan.borrowerName} — reverted to unpaid`
              : `EMI #${effectivePeriodNo} from ${loan.borrowerName}${fine > 0 ? ` + Fine ${formatCurrency(fine)}` : ''}${statusSel === 'Partial' ? ' (partial)' : ''}`,
            amount: isUnpaid ? 0 : totalCollected, paymentMode: cpf.mode, date: cpf.date, updatedAt: serverTimestamp(),
          });
        }
        const updatedCols = cols.map(x => x.id === cpf.editingId ? { ...x, status: statusSel } : x);
        const recount = updatedCols.filter(x => x.status === 'Paid').length;
        const fullyPaidEdit = recount >= loan.totalPeriods;
        const newEditStatus = fullyPaidEdit ? 'Closed' : 'Active';
        await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: recount, status: newEditStatus, updatedAt: serverTimestamp() });
        if (loan.status !== newEditStatus) await logStatusChange('emi_loan', loan.id, loan.status, newEditStatus, user?.uid);
        toast.success(isUnpaid ? `↩ EMI #${effectivePeriodNo} reverted to unpaid.` : `✓ EMI #${effectivePeriodNo} updated to ${statusSel}.`);
        setCollectLoan(null); setSaving(false); return;
      }

      const ledgerRef = await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Credit', category: 'EMI Collection',
        description: `EMI #${paidPeriods} from ${loan.borrowerName}${fine > 0 ? ` + Fine ${formatCurrency(fine)}` : ''}${isPartial ? ' (partial)' : ''}`,
        amount: totalCollected, paymentMode: cpf.mode, date: cpf.date,
        borrowerName: loan.borrowerName, loanId: loan.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      await addDoc(collection(db, 'emi_collections'), {
        loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
        amount: parseFloat(cpf.amount), fine, totalCollected, expectedEMI: loan.emiAmount, date: cpf.date, mode: cpf.mode,
        remarks: cpf.earlyClose ? ('Early closure settlement. ' + cpf.remarks).trim() : cpf.remarks,
        periodNo: paidPeriods, earlyClosure: cpf.earlyClose || false, status: statusSel,
        dueDate: cpf.dueDate, daysOverdue: cpf.daysOverdue, frequency: loan.frequency,
        ledgerEntryId: ledgerRef.id, createdAt: serverTimestamp(), createdBy: user?.uid || null,
      });
      const fullyPaid = cpf.earlyClose || paidPeriods >= loan.totalPeriods;
      const newStatus2 = fullyPaid ? 'Closed' : 'Active';
      await updateDoc(doc(db, 'emi_loans', loan.id), { paidPeriods: cpf.earlyClose ? loan.totalPeriods : paidPeriods, status: newStatus2, closedEarly: cpf.earlyClose || false, updatedAt: serverTimestamp() });
      if (loan.status !== newStatus2) await logStatusChange('emi_loan', loan.id, loan.status, newStatus2, user?.uid);
      if (fullyPaid) {
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Closed',
          description: `EMI loan closed${cpf.earlyClose ? ' (early settlement)' : ''} — ${loan.borrowerName} · ${loan.emiId || loan.id}`,
          amount: loan.loanAmount || 0, date: cpf.date || today(),
          borrowerName: loan.borrowerName, loanId: loan.id, emiId: loan.emiId || loan.id,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
      }
      toast.success(fullyPaid
        ? (cpf.earlyClose ? '✓ Loan closed early — fully settled.' : `🎉 All ${loan.totalPeriods} EMIs collected! Loan closed.`)
        : isPartial ? `◐ Partial EMI recorded — period #${paidPeriods + 1} still due.` : `✓ EMI #${paidPeriods} collected. ${loan.totalPeriods - paidPeriods} remaining.`
      );
      setCollectLoan(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  if (loading) return <PageLoader stats={4} />;

  return (
    <div className="page-enter">
      <PageHeader title="Collect EMI" subtitle="Record EMI payments, view schedules and manage overdue instalments" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }} className="grid-4">
        <StatCard label="Active EMI Due" value={formatCurrency(Math.round(totalDue))} sub={`${activeLoans.length} active loan${activeLoans.length !== 1 ? 's' : ''}`} color="#007aff" />
        <StatCard label="Collected (All Time)" value={formatCurrency(Math.round(totalCollectedAllTime))} sub="Across all EMI loans" color="#34c759" />
        <StatCard label="Periods Pending" value={totalPendingCount} sub="Remaining across active loans" color="#ff9500" />
        <StatCard label="Total Loans" value={loans.length} sub={`${loans.filter(l => l.status === 'Closed').length} closed`} color="#5856d6" />
      </div>

      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, EMI ID…"
            style={{ flex: '1 1 220px', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.1)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {[['active', 'Active'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{ padding: '8px 16px', borderRadius: 99, border: 'none', background: filter === k ? 'var(--accent)' : 'rgba(118,118,128,0.1)', color: filter === k ? '#fff' : 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>No EMI loans match filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(l => {
              const cols = collections[l.id] || [];
              const paid = cols.filter(c => c.status === 'Paid').length;
              const remaining = Math.max(0, (l.totalPeriods || 0) - paid);
              const pct = l.totalPeriods > 0 ? Math.round((paid / l.totalPeriods) * 100) : 0;
              const sched = getScheduleWithStatus(l, cols);
              const isOpen = expandedLoan === l.id;

              return (
                <div key={l.id} style={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
                    onClick={() => setExpandedLoan(isOpen ? null : l.id)}>
                    {l.photo ? <img src={l.photo} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,122,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{(l.borrowerName || '?')[0].toUpperCase()}</div>}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14.5 }}>{l.borrowerName}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: l.status === 'Active' ? 'rgba(52,199,89,0.12)' : 'rgba(118,118,128,0.12)', color: l.status === 'Active' ? '#1a7a34' : 'var(--text-secondary)' }}>{l.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{l.emiId} · {formatCurrency(l.loanAmount)} · EMI {formatCurrency(l.emiAmount)}/{l.frequency}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{paid}/{l.totalPeriods} PAID ({pct}%)</div>
                      <div style={{ fontSize: 11, color: remaining > 0 ? '#ff9500' : '#34c759' }}>{remaining > 0 ? `${remaining} remaining` : 'Complete'}</div>
                    </div>
                    {l.status === 'Active' && (
                      <Button size="sm" onClick={e => { e.stopPropagation(); openCollect(l); }}>Collect</Button>
                    )}
                  </div>

                  {isOpen && (() => {
                    const WIN = 5;
                    const defaultStart = Math.max(0, paid - 2);
                    const winStart = Math.min(Math.max(0, sched.length - WIN), windowStarts[l.id] ?? defaultStart);
                    const visible = sched.slice(winStart, winStart + WIN);
                    const canPrev = winStart > 0;
                    const canNext = winStart + WIN < sched.length;
                    return (
                      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '14px 16px', background: '#fafafa' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Click any unpaid slot to collect it, or an already-paid one to edit / mark unpaid</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={() => setWindowStarts(w => ({ ...w, [l.id]: Math.max(0, winStart - 1) }))} disabled={!canPrev}
                            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: canPrev ? '#fff' : '#f5f5f5', color: canPrev ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: canPrev ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, flex: 1 }}>
                            {visible.map((slot, vi) => {
                              const i = winStart + vi;
                              const isPaid = slot.status === 'Paid';
                              const isPartial = slot.status === 'Partial';
                              const isOverdue = slot.status === 'Overdue';
                              const isNext = i === paid && !isPaid;
                              const label = new Date(slot.dueDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                              const bg = isPaid ? 'rgba(52,199,89,0.04)' : isPartial ? 'rgba(88,86,214,0.05)' : isOverdue ? 'rgba(255,59,48,0.04)' : isNext ? 'rgba(0,122,255,0.04)' : '#fff';
                              const border = isPaid ? 'rgba(52,199,89,0.25)' : isPartial ? 'rgba(88,86,214,0.25)' : isOverdue ? 'rgba(255,59,48,0.25)' : isNext ? 'rgba(0,122,255,0.3)' : 'rgba(0,0,0,0.07)';
                              const textCol = isPaid ? '#1a7a34' : isPartial ? '#5856d6' : isOverdue ? '#c0392b' : isNext ? '#007aff' : 'var(--text-primary)';
                              return (
                                <div key={i} onClick={() => openCollectForSlot(l, i)}
                                  style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${border}`, background: bg, cursor: 'pointer' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: textCol, marginBottom: 4 }}>{label}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: isPaid ? '#34c759' : isPartial ? '#5856d6' : isOverdue ? '#ff3b30' : 'var(--text-secondary)' }}>
                                    {isPaid ? formatCurrency(slot.col.totalCollected || slot.col.amount) : isPartial ? `${formatCurrency(slot.col.amount)} (partial)` : isOverdue ? `${slot.overdue}d overdue` : 'Pending'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <button onClick={() => setWindowStarts(w => ({ ...w, [l.id]: Math.min(sched.length - WIN, winStart + 1) }))} disabled={!canNext}
                            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: canNext ? '#fff' : '#f5f5f5', color: canNext ? 'var(--text-primary)' : 'var(--text-tertiary)', cursor: canNext ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── COLLECT EMI MODAL ── */}
      <Modal open={!!collectLoan} onClose={() => setCollectLoan(null)} title={cpf.editingId ? `Edit EMI #${cpf.periodNo} — Change Status` : 'Collect EMI Payment'} width={500}
        footer={collectLoan && (
          <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            {cpf.editingId && (
              <Button variant="danger" onClick={() => saveCollection('Unpaid')} disabled={saving}>↩ Mark Unpaid</Button>
            )}
            <Button variant="secondary" onClick={() => saveCollection('Partial')} disabled={saving}>Partial</Button>
            <Button onClick={() => saveCollection('Paid')} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
              {saving ? 'Saving…' : `✓ Collect ${cpf.collectFine && parseFloat(cpf.fine) > 0 ? formatCurrency((parseFloat(cpf.amount) || 0) + (parseFloat(cpf.fine) || 0)) : formatCurrency(parseFloat(cpf.amount) || 0)}`}
            </Button>
            <Button variant="secondary" onClick={() => setCollectLoan(null)}>Cancel</Button>
          </div>
        )}>
        {collectLoan && (
          <>
            <div style={{ background: 'linear-gradient(135deg,#007aff,#34aadc)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                {collectLoan.photo
                  ? <img src={collectLoan.photo} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid rgba(255,255,255,0.5)', flexShrink: 0 }} />
                  : <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{(collectLoan.borrowerName || '?')[0].toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{collectLoan.borrowerName}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{collectLoan.emiId} · {collectLoan.phone}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>EMI #{cpf.periodNo} of {collectLoan.totalPeriods}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan) + emiInterestPerPeriod(collectLoan)))}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>P {formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan)))} + I {formatCurrency(Math.round(emiInterestPerPeriod(collectLoan)))}</div>
                </div>
              </div>
            </div>

            {cpf.dueDate && (
              <div style={{ padding: '10px 14px', background: cpf.daysOverdue > 2 ? 'rgba(255,59,48,0.06)' : cpf.daysOverdue > 0 ? 'rgba(255,149,0,0.06)' : 'rgba(52,199,89,0.06)', borderRadius: 9, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Due Date</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtEmiDate(cpf.dueDate)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {cpf.daysOverdue > 0
                    ? <span style={{ fontSize: 13, fontWeight: 700, color: cpf.daysOverdue > 2 ? '#ff3b30' : '#ff9500' }}>
                      {cpf.daysOverdue > 2 ? `⚠ ${cpf.daysOverdue} days overdue` : `${cpf.daysOverdue}d (within grace)`}
                    </span>
                    : <span style={{ fontSize: 13, fontWeight: 600, color: '#34c759' }}>✓ On time</span>}
                </div>
              </div>
            )}

            {cpf.daysOverdue > 2 && (
              <div style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginBottom: 10 }}>
                  ⚠ {cpf.daysOverdue - 2} days after grace — ₹{collectLoan.dailyFineRate || 50}/day suggested
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cpf.collectFine ? 10 : 0 }}>
                  <div onClick={() => setCpf(p => ({ ...p, collectFine: !p.collectFine, fine: '' }))}
                    style={{ width: 44, height: 26, borderRadius: 999, padding: 2, display: 'flex', alignItems: 'center', justifyContent: cpf.collectFine ? 'flex-end' : 'flex-start', background: cpf.collectFine ? '#ff3b30' : '#e5e5ea', transition: 'background .2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.22)' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: cpf.collectFine ? '#ff3b30' : 'var(--text-secondary)' }}>
                    {cpf.collectFine ? 'Fine ON — enter amount below' : 'Fine OFF'}
                  </span>
                </div>
                {cpf.collectFine && (
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Fine Amount (₹)</label>
                    <input type="number" value={cpf.fine} onChange={e => setCpf(p => ({ ...p, fine: e.target.value }))}
                      placeholder="Enter fine amount…"
                      style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1.5px solid rgba(255,59,48,0.3)', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      autoFocus />
                  </div>
                )}
              </div>
            )}

            {(() => {
              const ppp = (parseFloat(collectLoan.loanAmount) || 0) / (parseInt(collectLoan.totalPeriods) || 1);
              const paidSoFar = (cpf.periodNo || 1) - 1;
              const remPrincipal = Math.max(0, (parseFloat(collectLoan.loanAmount) || 0) - paidSoFar * ppp);
              const intThis = (parseFloat(collectLoan.loanAmount) || 0) * ((parseFloat(collectLoan.interestRate) || 0) / 100);
              const closeAmt = Math.round(remPrincipal + intThis);
              return (
                <div style={{ background: 'rgba(175,82,222,0.06)', border: '1px solid rgba(175,82,222,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input type="checkbox" checked={!!cpf.earlyClose} onChange={e => setCpf(p => ({ ...p, earlyClose: e.target.checked, amount: e.target.checked ? String(closeAmt) : String(collectLoan.emiAmount || '') }))} style={{ width: 16, height: 16, accentColor: '#af52de', cursor: 'pointer' }} />
                    <span style={{ fontWeight: 700, color: '#7d3cab' }}>Close loan early (settle now)</span>
                  </label>
                  {cpf.earlyClose && (
                    <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      Remaining principal <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(Math.round(remPrincipal))}</strong> + this month's interest <strong style={{ color: '#ff9500' }}>{formatCurrency(Math.round(intThis))}</strong> = <strong style={{ color: '#af52de' }}>{formatCurrency(closeAmt)}</strong>. Loan will be marked <strong>closed</strong>.
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="EMI Amount (₹)" required>
                <Input type="number" value={cpf.amount} onChange={e => setCpf(p => ({ ...p, amount: e.target.value }))} />
              </FormField>
              <FormField label="Date" required>
                <Input type="date" value={cpf.date} onChange={e => setCpf(p => ({ ...p, date: e.target.value }))} />
              </FormField>
              <FormField label="Payment Mode">
                <Select value={cpf.mode} onChange={e => setCpf(p => ({ ...p, mode: e.target.value }))}>
                  <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>DD</option>
                </Select>
              </FormField>
              <FormField label="Remarks">
                <Input value={cpf.remarks} onChange={e => setCpf(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional note" />
              </FormField>
            </div>

            {cpf.collectFine && parseFloat(cpf.fine) > 0 ? (
              <div style={{ padding: '10px 14px', background: 'rgba(52,199,89,0.06)', border: '1px solid rgba(52,199,89,0.18)', borderRadius: 9, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  EMI {formatCurrency(parseFloat(cpf.amount) || 0)} + Fine {formatCurrency(parseFloat(cpf.fine) || 0)}
                </span>
                <span style={{ fontSize: 17, fontWeight: 800, color: '#34c759' }}>
                  = {formatCurrency((parseFloat(cpf.amount) || 0) + (parseFloat(cpf.fine) || 0))}
                </span>
              </div>
            ) : null}
          </>
        )}
      </Modal>
    </div>
  );
}
