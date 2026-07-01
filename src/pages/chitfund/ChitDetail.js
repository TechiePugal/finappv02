import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users, Gavel, BookOpen, LayoutDashboard, Plus, TrendingUp, Wallet,
  Zap, Target, Pencil, Trash2, AlertTriangle, CheckCircle, Clock,
  ArrowLeft, BarChart3, Edit2, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getChit, getAuctionSchedule, getMembers, addMember, updateMember,
  deleteMember, processAuction, getAuctionPayments, updatePaymentStatus,
  getAllPaymentsForChit, getLedger, calcIRR, calcRiskScore, deleteAuction,
  updateChit,
} from '../../utils/cf_firestore';
import {
  calcCommission, calcCommissionForward, calcCommissionReverse, calcExposure, calcFutureLiability,
  calcPhases, getPhaseIndex, getExpectedPayable, getCommBreakdown
} from '../../utils/cf_engine';
import { formatCurrency, formatDate, roundTo } from '../../utils/cf_format';
import {
  Card, PageHeader, Button, Badge, Table, Modal, FormField, Input, Select,
  Textarea, Toggle, StatCard, InfoRow, SectionHeader, ProgressBar,
  EmptyState, Alert, Tabs, KPIRow, tokens, Amount
} from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(v) { return formatCurrency(v || 0); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function Spinner() {
  return <div style={{ width: 20, height: 20, border: '3px solid rgba(0,0,0,.1)', borderTopColor: tokens.blue, borderRadius: '50%', animation: 'spin .6s linear infinite' }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}
function IBtn({ icon: Icon, onClick, title, danger, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={e => { e.stopPropagation(); if (!disabled) onClick(e); }} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${h && !disabled ? (danger ? tokens.red : '#bfcce4') : tokens.border}`, background: h && !disabled ? (danger ? '#FDE8E8' : '#EFF6FF') : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', opacity: disabled ? 0.4 : 1, flexShrink: 0 }}>
      <Icon size={12} color={h && !disabled ? (danger ? tokens.red : tokens.blue) : tokens.textSub} strokeWidth={2} />
    </button>
  );
}

function RiskBadge({ score }) {
  const cfg = score < 25 ? { label: 'Low Risk', color: tokens.green, bg: '#D1FAE5' }
    : score < 60 ? { label: 'Medium Risk', color: tokens.amber, bg: '#FEF3C7' }
    : { label: 'High Risk', color: tokens.red, bg: '#FEE2E2' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} /> {cfg.label} ({score}%)
    </span>
  );
}

// ── Payment collection inline toggle ─────────────────────────────────────────
function PayToggle({ status, onToggle }) {
  const isPaid = status === 'Paid';
  return (
    <button onClick={e => { e.stopPropagation(); onToggle(); }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: isPaid ? '#D1FAE5' : '#FEF3C7', color: isPaid ? '#065F46' : '#92400E', transition: 'all .15s' }}>
      {isPaid ? <CheckCircle size={10} /> : <Clock size={10} />}
      {isPaid ? 'Paid' : 'Pending'}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ChitDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();

  const [chit, setChit] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');

  // Member modals
  const [memberModal, setMemberModal] = useState(null); // null | 'add' | member-obj
  const [memberForm, setMemberForm] = useState({ name: '', phone: '' });
  const [memberSaving, setMemberSaving] = useState(false);
  const [delMember, setDelMember] = useState(null);
  const [delMemberLoading, setDelMemberLoading] = useState(false);

  // Process auction modal
  const [auctionModal, setAuctionModal] = useState(null); // auction slot
  const [aForm, setAForm] = useState({ winnerId: '', bidAmount: '', notes: '' });
  const [auctionSaving, setAuctionSaving] = useState(false);

  // Delete auction modal
  const [delAuction, setDelAuction] = useState(null);
  const [delAuctionLoading, setDelAuctionLoading] = useState(false);

  // Payment detail modal
  const [payModal, setPayModal] = useState(null); // auction
  const [payments, setPayments] = useState([]);
  const [payLoading, setPayLoading] = useState(false);
  const [updatingPay, setUpdatingPay] = useState(null);

  // Edit chit modal (for phase ranges + basic settings)
  const [editChitModal, setEditChitModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, s, m] = await Promise.all([getChit(id), getAuctionSchedule(id), getMembers(id)]);
    setChit(c); setSchedule(s); setMembers(m);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageLoader stats={6} />;
  if (!chit) return (
    <EmptyState icon={Gavel} title="Chit fund not found"
      action={<Button onClick={() => nav('/cf/chits')}>← Back to Chit Funds</Button>} />
  );

  // Derived
  const exposure = calcExposure(chit.totalInvested || 0, chit.totalCommissionEarned || 0);
  const futureLiability = calcFutureLiability(chit, chit.auctionsCompleted || 0, chit.companyTakenAuction);
  const takenCount = members.filter(m => m.status === 'Taken').length;
  const activeMembers = members.filter(m => m.status === 'Active');
  const nextAuction = schedule.find(s => s.status === 'Pending');
  const irr = calcIRR(chit, schedule.filter(s => s.status === 'Completed'));
  const riskScore = calcRiskScore(chit);
  const subscription = chit.totalChitValue / chit.totalMembers;
  const phases = calcPhases(chit.totalMembers);

  // Commission preview for process-auction modal
  // Commission preview using spec-correct forward calculator
  const isCompanyWinnerSelected = aForm.winnerId === 'company';
  let commPreview = null;
  if (aForm.bidAmount !== '' && aForm.winnerId) {
    try {
      commPreview = calcCommissionForward({
        chitValue: chit.totalChitValue,
        totalMembers: chit.totalMembers,
        organiserFeePct: chit.managerCommissionPct,
        commissionType: chit.commissionType || 'Single',
        alreadyCashedCount: takenCount,
        bidAmount: +aForm.bidAmount,
      });
    } catch {}
  }

  // ── Member actions ──────────────────────────────────────────────────────────
  async function handleSaveMember() {
    if (!memberForm.name.trim()) return setError('Name is required.');
    setMemberSaving(true);
    try {
      if (memberModal === 'add') {
        await addMember(id, { name: memberForm.name.trim(), phone: memberForm.phone.trim() }, user.uid);
      } else {
        await updateMember(memberModal.id, { name: memberForm.name.trim(), phone: memberForm.phone.trim() }, user.uid, id);
      }
      setMemberModal(null); setMemberForm({ name: '', phone: '' }); setError(''); load();
    } catch (e) { setError(e.message); }
    setMemberSaving(false);
  }

  async function handleDeleteMember() {
    if (!delMember) return;
    setDelMemberLoading(true);
    try { await deleteMember(delMember.id, id, user.uid); setDelMember(null); load(); }
    catch (e) { alert(e.message); }
    setDelMemberLoading(false);
  }

  // ── Auction processing ──────────────────────────────────────────────────────
  async function handleProcessAuction() {
    setError('');
    // companyIncluded: company is a member in the dropdown, selected like anyone else
    // No separate "takenByCompany" toggle needed - company won = winner.id === 'company'
    if (!aForm.winnerId) return setError('Select a winner from the list.');
    if (aForm.bidAmount === '' || aForm.bidAmount === null || aForm.bidAmount === undefined) return setError('Bid amount is required (enter 0 if no bid).');

    // Find winner — could be a member or the company slot
    const isCompanyWinner = aForm.winnerId === 'company';
    const winner = isCompanyWinner
      ? { id: 'company', name: 'Company' }
      : members.find(m => m.id === aForm.winnerId);
    if (!winner) return setError('Selected winner not found.');

    setAuctionSaving(true);
    try {
      await processAuction(id, auctionModal.id, {
        auctionNumber: auctionModal.auctionNumber,
        auctionDate: auctionModal.auctionDate,
        winnerId: winner.id,
        winnerName: winner.name,
        bidAmount: +aForm.bidAmount,
        takenByCompany: isCompanyWinner,  // derived from selection, not a manual toggle
        notes: aForm.notes,
      }, user.uid);
      setAuctionModal(null); setError(''); load();
    } catch (e) { setError(e.message); }
    setAuctionSaving(false);
  }

  // ── Delete auction ──────────────────────────────────────────────────────────
  async function handleDeleteAuction() {
    if (!delAuction) return;
    setDelAuctionLoading(true);
    try {
      await deleteAuction(id, delAuction.id, delAuction.auctionNumber, user.uid);
      setDelAuction(null); load();
    } catch (e) { alert(e.message); }
    setDelAuctionLoading(false);
  }

  // ── Payment collection ──────────────────────────────────────────────────────
  async function openPayments(auction) {
    if (auction.status !== 'Completed') return;
    setPayModal(auction); setPayLoading(true); setPayments([]);
    const p = await getAuctionPayments(id, auction.auctionNumber);
    setPayments(p); setPayLoading(false);
  }

  async function togglePayment(payId, current) {
    setUpdatingPay(payId);
    const next = current === 'Paid' ? 'Pending' : 'Paid';
    await updatePaymentStatus(payId, next, user.uid);
    setPayments(prev => prev.map(p => p.id === payId ? { ...p, paymentStatus: next } : p));
    setUpdatingPay(null);
  }

  async function markAllPayments(status) {
    const toUpdate = payments.filter(p => p.paymentStatus !== status);
    for (const p of toUpdate) {
      setUpdatingPay(p.id);
      await updatePaymentStatus(p.id, status, user.uid);
    }
    setPayments(prev => prev.map(p => ({ ...p, paymentStatus: status })));
    setUpdatingPay(null);
  }

  // ── Edit chit (phase ranges) ────────────────────────────────────────────────
  function openEditChit() {
    setEditForm({
      companyName: chit.companyName,
      branch: chit.branch || '',
      managerCommissionPct: String(chit.managerCommissionPct ?? 5),
      phase1: String(chit.range_phase1 || ''),
      phase2: String(chit.range_phase2 || ''),
      phase3: String(chit.range_phase3 || ''),
      phase4: String(chit.range_phase4 || ''),
    });
    setEditChitModal(true);
  }

  async function handleEditChit() {
    setEditSaving(true);
    try {
      await updateChit(id, {
        companyName: editForm.companyName,
        branch: editForm.branch,
        managerCommissionPct: parseFloat(editForm.managerCommissionPct) || 0,
        range_phase1: editForm.phase1 ? +editForm.phase1 : null,
        range_phase2: editForm.phase2 ? +editForm.phase2 : null,
        range_phase3: editForm.phase3 ? +editForm.phase3 : null,
        range_phase4: editForm.phase4 ? +editForm.phase4 : null,
      }, user.uid);
      setEditChitModal(false); load();
    } catch (e) { alert(e.message); }
    setEditSaving(false);
  }

  // ── Page tabs ───────────────────────────────────────────────────────────────
  const pageTabs = [
    { value: 'overview',  label: 'Overview',        icon: LayoutDashboard },
    { value: 'schedule',  label: `Schedule (${schedule.length})`, icon: Gavel },
    { value: 'members',   label: `Members (${members.length})`,   icon: Users },
    { value: 'payments',  label: 'Payments',         icon: Wallet },
    { value: 'ledger',    label: 'Ledger',            icon: BookOpen },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => nav('/cf/chits')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: tokens.textSub, fontSize: 12.5, fontFamily: 'inherit', padding: '0 0 8px' }}>
          <ArrowLeft size={13} /> Chit Funds
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: tokens.text, letterSpacing: '-.4px' }}>{chit.companyName}</h1>
            <div style={{ fontSize: 13, color: tokens.textSub, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge status={chit.status} />
              <RiskBadge score={riskScore} />
              <span>{chit.commissionType} Commission · {chit.totalMembers} Members</span>
              <span>·</span>
              <span>{chit.branch || 'Head Office'}</span>
              <span>·</span>
              <span>Started {fmtDate(chit.startDate)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <IBtn icon={Edit2} onClick={openEditChit} title="Edit chit fund settings" />
            {nextAuction && (
              <button onClick={() => { setAuctionModal(nextAuction); setAForm({ winnerId: '', bidAmount: '', notes: '' }); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: tokens.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Gavel size={14} /> Process Auction #{nextAuction.auctionNumber}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Value"      value={fmt(chit.totalChitValue)}         icon={Wallet}   accent={tokens.blue} />
        <StatCard label="Per Head"         value={fmt(chit.perHeadValue)}            icon={Target}   accent="#5521B5" />
        <StatCard label="Progress"         value={`${chit.auctionsCompleted}/${chit.totalMembers}`} sub="auctions done" icon={Gavel} accent="#B45309" />
        <StatCard label="Invested"         value={fmt(chit.totalInvested || 0)}      icon={TrendingUp} accent={tokens.red} />
        <StatCard label="Commission"       value={fmt(chit.totalCommissionEarned||0)} icon={BarChart3} accent={tokens.green} />
        <StatCard label="Net Exposure"     value={fmt(exposure)}                     icon={Zap}      accent={exposure > 0 ? tokens.red : tokens.green} />
      </div>

      {/* Progress bar */}
      <Card style={{ padding: '12px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Auction Progress</span>
          <span style={{ fontSize: 12, color: tokens.textSub }}>
            {chit.auctionsCompleted}/{chit.totalMembers} · IRR ~{irr}% p.a.
            {nextAuction && ` · Next: #${nextAuction.auctionNumber} on ${fmtDate(nextAuction.auctionDate)}`}
          </span>
        </div>
        <ProgressBar value={chit.auctionsCompleted} max={chit.totalMembers}
          color={riskScore > 60 ? tokens.red : riskScore > 30 ? tokens.amber : tokens.blue} />
      </Card>

      <Tabs tabs={pageTabs} active={tab} onChange={setTab} />

      {/* ──────────── OVERVIEW ──────────── */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <SectionHeader title="Chit Configuration" action={<IBtn icon={Edit2} onClick={openEditChit} title="Edit" />} />
            {[
              ['Total Chit Value',   fmt(chit.totalChitValue)],
              ['Per Head Value',     fmt(chit.perHeadValue)],
              ['Number of Members', chit.totalMembers],
              ['Auction Interval',  `Every ${chit.auctionInterval} month(s)`],
              ['Commission Type',   <Badge key="ct" status={chit.commissionType}>{chit.commissionType}</Badge>],
              ['Commission Base',   chit.commissionBase],
              ['Manager Commission',`${chit.managerCommissionPct}%`],
              ['Slab Type',         chit.slabType],
              ['Slab Value',        chit.slabType === 'Fixed' ? fmt(chit.slabValue) : `${chit.slabValue}%`],
              ['Branch',            chit.branch || 'Head Office'],
              ['Start Date',        fmtDate(chit.startDate)],
              ['Projected End',     fmtDate(chit.projectedEndDate)],
            ].map(([label, value], i, arr) => <InfoRow key={label} label={label} value={value} last={i === arr.length - 1} />)}
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <SectionHeader title="Financial Position" />
              {[
                ['Total Invested',     fmt(chit.totalInvested || 0),           tokens.red],
                ['Total Received',     fmt(chit.totalReceived || 0),           tokens.blue],
                ['Commission Earned',  fmt(chit.totalCommissionEarned || 0),   tokens.green],
                ['Manager Commission', fmt(chit.totalManagerCommission || 0),  tokens.amber],
                ['Net Exposure',       fmt(exposure),                           exposure > 0 ? tokens.red : tokens.green],
                ['Future Liability',   fmt(futureLiability),                   tokens.amber],
                ['Members Taken',      `${takenCount} / ${chit.totalMembers}`, tokens.text],
                ['Company Taken In',   chit.companyTakenAuction ? `Auction #${chit.companyTakenAuction}` : 'Not yet', tokens.textSub],
              ].map(([label, value, color], i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < arr.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
                  <span style={{ fontSize: 12.5, color: tokens.textSub }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: color || tokens.text }}>{value}</span>
                </div>
              ))}
            </Card>

            {/* Phase ranges */}
            <Card>
              <SectionHeader title="Phase Ranges (Expected Net Payable)"
                sub={`Configured to estimate monthly outflow. Phase size = ceil(${chit.totalMembers}/4) = ${Math.ceil(chit.totalMembers / 4)}`}
                action={<IBtn icon={Edit2} onClick={openEditChit} title="Configure phases" />} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
                {phases.map((p, i) => {
                  const val = [chit.range_phase1, chit.range_phase2, chit.range_phase3, chit.range_phase4][i];
                  return (
                    <div key={i} style={{ background: val ? '#EFF6FF' : tokens.slateLight, borderRadius: 10, padding: '10px 12px', textAlign: 'center', border: `1px solid ${val ? tokens.blue + '30' : tokens.border}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: val ? tokens.blue : tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{p.label}</div>
                      <div style={{ fontSize: 12, color: tokens.textSub, marginBottom: 4 }}>Rounds {p.startRound}–{p.endRound}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: val ? tokens.blue : tokens.textMuted }}>{val ? fmt(val) : 'Not set'}</div>
                      {val && <div style={{ fontSize: 10, color: tokens.green, marginTop: 2 }}>Saves {fmt(subscription - val)}/mo</div>}
                    </div>
                  );
                })}
              </div>
              {!chit.range_phase1 && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: tokens.textMuted }}>
                  Set expected net payable per phase to get accurate cash flow projections. Click ✏️ to configure.
                </p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ──────────── SCHEDULE ──────────── */}
      {tab === 'schedule' && (
        <Card noPad>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Auction Schedule</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: tokens.textSub }}>
                Pending: click Process · Completed: click Collect to manage payments · Delete reverses all effects
              </p>
            </div>
            {nextAuction && (
              <button onClick={() => { setAuctionModal(nextAuction); setAForm({ winnerId: '', bidAmount: '', notes: '' }); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: tokens.blue, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                <Gavel size={13} /> Process #{nextAuction.auctionNumber}
              </button>
            )}
          </div>

          {schedule.length === 0 ? (
            <EmptyState icon={Gavel} title="No auctions scheduled" subtitle="Add members and create a schedule" />
          ) : schedule.map((a, i) => {
            const d = a.auctionDate?.seconds ? new Date(a.auctionDate.seconds * 1000) : new Date(a.auctionDate);
            const isPending = a.status === 'Pending';
            const isCompleted = a.status === 'Completed';
            const now = new Date();
            const daysAway = Math.floor((d - now) / 86400000);
            const isUrgent = isPending && daysAway >= 0 && daysAway <= 2;
            const isOverdue = isPending && daysAway < 0;
            const dotColor = isCompleted ? tokens.green : isUrgent ? tokens.red : isOverdue ? tokens.amber : tokens.textMuted;

            return (
              <div key={a.id || i}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < schedule.length - 1 ? `1px solid ${tokens.border}` : 'none', background: isUrgent ? '#FFF7ED' : 'transparent', cursor: isCompleted ? 'pointer' : 'default', transition: 'background .15s' }}
                onClick={() => isCompleted && openPayments(a)}
                onMouseEnter={e => { if (isCompleted) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isUrgent ? '#FFF7ED' : 'transparent'; }}>

                {/* Round badge */}
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isCompleted ? '#D1FAE5' : isUrgent ? '#FEE2E2' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${dotColor}30` }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: dotColor }}>#{a.auctionNumber}</span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{fmtDate(a.auctionDate)}</span>
                    <Badge status={a.status} />
                    {a.takenByCompany && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#EDE9FE', color: '#5B21B6' }}>COMPANY</span>}
                    {isUrgent && <span style={{ fontSize: 10, fontWeight: 800, color: tokens.red }}>⚡ {daysAway === 0 ? 'TODAY!' : 'TOMORROW!'}</span>}
                    {isOverdue && <span style={{ fontSize: 10, fontWeight: 800, color: tokens.amber }}>⚠ {Math.abs(daysAway)}d overdue</span>}
                  </div>
                  {isCompleted ? (
                    <div style={{ fontSize: 11.5, color: tokens.textSub }}>
                      Winner: <strong>{a.winnerName || '—'}</strong> · Bid: {fmt(a.bidAmount)} · Prize: {fmt((chit.perHeadValue * chit.totalMembers) - a.bidAmount)}
                      <span style={{ color: tokens.blue, marginLeft: 8 }}>Click to manage payments →</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: tokens.textSub }}>
                      {isPending ? `Per Head: ${fmt(chit.perHeadValue)} · ${members.filter(m => m.status === 'Active').length} eligible members` : ''}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isPending ? (
                    <button
                      onClick={e => { e.stopPropagation(); setAuctionModal(a); setAForm({ winnerId: '', bidAmount: '', notes: '' }); setError(''); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: isUrgent ? tokens.red : tokens.amber, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Gavel size={12} /> Process
                    </button>
                  ) : (
                    <>
                      <button onClick={e => { e.stopPropagation(); openPayments(a); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, border: `1px solid ${tokens.blue}30`, background: '#EFF6FF', color: tokens.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <Users size={12} /> Collect
                      </button>
                      <IBtn icon={Trash2} onClick={() => setDelAuction(a)} title="Delete this auction (reverses all effects)" danger />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* ──────────── MEMBERS ──────────── */}
      {tab === 'members' && (
        <Card noPad>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Members</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: tokens.textSub }}>
                {members.length} members · {takenCount} taken · {activeMembers.length} active
              </p>
            </div>
            <button onClick={() => { setMemberModal('add'); setMemberForm({ name: '', phone: '' }); setError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: 'none', background: tokens.blue, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={13} /> Add Member
            </button>
          </div>

          {members.length === 0 ? (
            <EmptyState icon={Users} title="No members" subtitle="Add members to this chit fund"
              action={<Button size="sm" icon={Plus} onClick={() => { setMemberModal('add'); setMemberForm({ name: '', phone: '' }); }}>Add Member</Button>} />
          ) : members.map((m, i) => (
            <div key={m.id || i}
              style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 18px', borderBottom: i < members.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.status === 'Taken' ? '#EDE9FE' : '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: m.status === 'Taken' ? '#5B21B6' : tokens.blue, flexShrink: 0 }}>
                {m.name?.[0]?.toUpperCase() || '?'}
              </div>
              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: tokens.text }}>{m.name}</span>
                  <Badge status={m.status} />
                  {m.auctionTakenNumber && <span style={{ fontSize: 11, color: tokens.textSub }}>Taken in #{m.auctionTakenNumber}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: tokens.textSub, marginTop: 2 }}>{m.phone || 'No phone'}</div>
              </div>
              {/* Actions — always visible */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <IBtn icon={Edit2} onClick={() => { setMemberModal(m); setMemberForm({ name: m.name, phone: m.phone || '' }); setError(''); }} title="Edit member" />
                <IBtn icon={Trash2} onClick={() => setDelMember(m)} title={m.status === 'Taken' ? 'Cannot delete: member has won an auction' : 'Delete member'} danger disabled={m.status === 'Taken'} />
              </div>
            </div>
          ))}

          {(chit.auctionsCompleted || 0) > 0 && (
            <div style={{ padding: '8px 18px', borderTop: `1px solid ${tokens.border}`, fontSize: 11, color: tokens.textMuted }}>
              Members who have won (Taken status) cannot be deleted. Others can be deleted at any time.
            </div>
          )}
        </Card>
      )}

      {/* ──────────── PAYMENTS ──────────── */}
      {tab === 'payments' && <AllPaymentsTab chitId={id} userId={user.uid} subscription={subscription} />}

      {/* ──────────── LEDGER ──────────── */}
      {tab === 'ledger' && <LedgerTab chitId={id} />}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Add / Edit Member */}
      {memberModal !== null && (
        <div onClick={() => setMemberModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{memberModal === 'add' ? 'Add Member' : `Edit — ${memberModal.name}`}</h3>
              <button onClick={() => setMemberModal(null)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} color={tokens.textSub} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {error && <div style={{ marginBottom: 12, padding: '9px 13px', background: '#FEE2E2', borderRadius: 8, fontSize: 13, color: tokens.red }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FormField label="Full Name" required>
                  <Input value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Member's full name" autoFocus />
                </FormField>
                <FormField label="Phone Number">
                  <Input value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="9876543210" type="tel" />
                </FormField>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleSaveMember} disabled={memberSaving}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: memberSaving ? '#93C5FD' : tokens.blue, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: memberSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {memberSaving ? <Spinner /> : null} {memberModal === 'add' ? 'Add Member' : 'Save Changes'}
                </button>
                <button onClick={() => setMemberModal(null)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: tokens.textSub }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Member */}
      {delMember && (
        <div onClick={() => setDelMember(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,.18)', padding: '22px 24px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={18} color={tokens.red} /></div>
              <div>
                <p style={{ margin: '0 0 5px', fontSize: 15, fontWeight: 700 }}>Delete "{delMember.name}"?</p>
                <p style={{ margin: 0, fontSize: 13, color: tokens.textSub, lineHeight: 1.6 }}>This member will be removed from the chit fund. This cannot be undone.</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDeleteMember} disabled={delMemberLoading}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: tokens.red, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {delMemberLoading ? 'Deleting…' : 'Delete Member'}
              </button>
              <button onClick={() => setDelMember(null)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: tokens.textSub }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Process Auction */}
      {auctionModal && (
        <div onClick={() => { setAuctionModal(null); setError(''); }} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 560, boxShadow: '0 24px 64px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', background: `linear-gradient(135deg,${tokens.blue},#6366f1)` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.65)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Process Auction</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>Round #{auctionModal.auctionNumber} — {fmtDate(auctionModal.auctionDate)}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
                    Per Head: {fmt(chit.perHeadValue)} · {activeMembers.length} eligible · {chit.commissionType} commission
                  </div>
                </div>
                <button onClick={() => { setAuctionModal(null); setError(''); }} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,.18)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {error && <div style={{ marginBottom: 12, padding: '10px 13px', background: '#FEE2E2', borderRadius: 8, fontSize: 13, color: tokens.red }}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {/* Winner select — company appears here if companyIncluded */}
                <FormField label="Select Winner" required
                  hint={chit.companyIncluded ? 'Company is a member — select company if it wins this auction' : 'Select the winning member'}>
                  <Select value={aForm.winnerId} onChange={e => setAForm(f => ({ ...f, winnerId: e.target.value }))}>
                    <option value="">— Select winner —</option>
                    {/* Company slot — only shown if company is included as a member */}
                    {chit.companyIncluded && (
                      <option value="company">🏢 Company (Organiser)</option>
                    )}
                    {activeMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </FormField>

                {/* Bid amount */}
                <FormField label="Bid Amount (₹)" hint={`Amount the winner bids from the TOTAL chit pool (₹${(chit.totalChitValue||0).toLocaleString("en-IN")}). ₹0 = no bid (full prize). Lower bid = higher prize for winner.`}>
                  <Input type="number" step="1" value={aForm.bidAmount}
                    onChange={e => setAForm(f => ({ ...f, bidAmount: e.target.value }))}
                    prefix="₹" placeholder={String(Math.round(chit.perHeadValue * 0.85))} />
                </FormField>

                <FormField label="Notes (optional)">
                  <Textarea value={aForm.notes} onChange={e => setAForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this auction…" style={{ minHeight: 52 }} />
                </FormField>

                {/* Commission preview — using correct spec formula */}
                {commPreview && (
                  <div style={{ padding: '12px 14px', background: '#ECFDF5', border: `1px solid #D1FAE5`, borderRadius: 10 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: tokens.green, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
                      Commission Breakdown Preview ({chit.commissionType})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12.5 }}>
                      {[
                        ['Organiser Amount',          fmt(commPreview.managerCommission)],
                        ['Pool (Bid − Org)',           fmt(commPreview.commissionPool)],
                        ['Eligible Members',           commPreview.eligibleMembers],
                        ['Commission per Member',      fmt(commPreview.memberCommission)],
                        chit.commissionType === 'Single'
                          ? ['Non-cashed Net Payable', fmt(String(Math.round((chit.perHeadValue||0) - (commPreview.memberCommission||0))))]
                          : ['Every Member Pays',      fmt(String(Math.round((chit.perHeadValue||0) - (commPreview.memberCommission||0))))],
                        ['Winner In-Hand Prize',       fmt(String(Math.round((chit.totalChitValue||0) - (parseFloat(aForm.bidAmount)||0))))],  // total - bid
                      ].map(([lbl, val], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ color: tokens.textSub }}>{lbl}:</span>
                          <strong style={{ color: tokens.green }}>{val}</strong>
                        </div>
                      ))}
                    </div>
                    {chit.commissionType === 'Single' && takenCount > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: tokens.amber, fontWeight: 600 }}>
                        ⚠ {takenCount} cashed member{takenCount > 1 ? 's' : ''} pay FULL subscription ({fmt(subscription)}) — no commission deduction
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button onClick={handleProcessAuction} disabled={auctionSaving}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: auctionSaving ? '#93C5FD' : tokens.blue, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: auctionSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {auctionSaving ? <Spinner /> : <Gavel size={15} />} {auctionSaving ? 'Processing…' : 'Confirm & Process Auction'}
                </button>
                <button onClick={() => { setAuctionModal(null); setError(''); }} style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: tokens.textSub }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Collection Modal */}
      {payModal && (
        <div onClick={() => setPayModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 28px 72px rgba(0,0,0,.22)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', background: `linear-gradient(135deg,${tokens.blue},#6366f1)`, flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>Payment Collection — Auction #{payModal.auctionNumber}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>{chit.companyName}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
                    {fmtDate(payModal.auctionDate)} · Winner: <strong style={{ color: '#fff' }}>{payModal.winnerName || '—'}</strong> · Bid: {fmt(payModal.bidAmount)}
                  </div>
                </div>
                <button onClick={() => setPayModal(null)} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,.18)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            </div>

            {/* Progress */}
            {!payLoading && payments.length > 0 && (() => {
              const paidC = payments.filter(p => p.paymentStatus === 'Paid').length;
              const pct = Math.round((paidC / payments.length) * 100);
              return (
                <div style={{ padding: '12px 22px', borderBottom: `1px solid ${tokens.border}`, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
                    {[['Members', payments.length, tokens.blue], ['Collected', paidC, tokens.green], ['Pending', payments.length - paidC, tokens.amber],
                      ['Amt Collected', fmt(payments.filter(p => p.paymentStatus === 'Paid').reduce((s, p) => s + (p.netPayable || 0), 0)), tokens.purple]].map(([l, v, c], i) => (
                      <div key={i}><div style={{ fontSize: 9.5, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{l}</div><div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div></div>
                    ))}
                  </div>
                  <div style={{ height: 6, background: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? tokens.green : `linear-gradient(90deg,${tokens.blue},#6366f1)`, borderRadius: 3, transition: 'width .5s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button onClick={() => markAllPayments('Paid')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid #D1FAE5', background: '#ECFDF5', color: '#065F46', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <CheckCircle size={11} /> Mark All Paid
                    </button>
                    <button onClick={() => markAllPayments('Pending')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 7, border: '1px solid #FEF3C7', background: '#FFFBEB', color: '#92400E', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Clock size={11} /> Reset All
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Member list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {payLoading ? <div style={{ padding: '48px', textAlign: 'center', color: tokens.textMuted }}>Loading payments…</div>
                : payments.map((p, i) => (
                <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px', borderBottom: i < payments.length - 1 ? `1px solid ${tokens.border}` : 'none', background: p.paymentStatus === 'Paid' ? 'rgba(5,150,105,0.025)' : 'transparent' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: p.isWinner ? '#EDE9FE' : p.paymentStatus === 'Paid' ? '#D1FAE5' : '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: p.isWinner ? '#5B21B6' : p.paymentStatus === 'Paid' ? '#065F46' : tokens.blue }}>
                    {(p.memberName || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.memberName}</span>
                      {p.isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#5B21B6', color: '#fff' }}>WINNER</span>}
                      {p.commissionReceived > 0 && !p.isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#D1FAE5', color: '#065F46' }}>ELIGIBLE</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: tokens.textSub }}>
                      Contribution: {fmt(p.contributionAmount)}
                      {p.commissionReceived > 0 && <span style={{ color: tokens.green }}> · Commission back: {fmt(p.commissionReceived)}</span>}
                      {p.isWinner && p.winnerPayout > 0 && <span style={{ color: '#5B21B6' }}> · Prize: {fmt(p.winnerPayout)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginRight: 12, flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>{fmt(p.netPayable)}</div>
                    <div style={{ fontSize: 10.5, color: tokens.textMuted }}>net payable</div>
                  </div>
                  {updatingPay === p.id
                    ? <div style={{ width: 80, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                    : <PayToggle status={p.paymentStatus} onToggle={() => togglePayment(p.id, p.paymentStatus)} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete Auction */}
      {delAuction && (
        <div onClick={() => setDelAuction(null)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,.2)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Trash2 size={17} color={tokens.red} /></div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#991B1B' }}>Delete Auction #{delAuction.auctionNumber}</div>
                  <div style={{ fontSize: 12.5, color: '#B91C1C', marginTop: 1 }}>This reverses ALL effects of this auction</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 22px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                {['Auction slot reset to Pending', 'All member payment records deleted', 'Commission distribution records deleted', 'Ledger entries deleted', `Winner "${delAuction.winnerName || '—'}" status restored to Active`, 'Investment, commission & received amounts reversed'].map((item, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: tokens.textSub, display: 'flex', gap: 7 }}>
                    <span style={{ color: tokens.red, flexShrink: 0 }}>⚠</span> {item}
                  </div>
                ))}
              </div>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: tokens.red, fontWeight: 600 }}>This action cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDeleteAuction} disabled={delAuctionLoading}
                  style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: delAuctionLoading ? '#FCA5A5' : tokens.red, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: delAuctionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {delAuctionLoading ? 'Deleting…' : 'Delete Permanently'}
                </button>
                <button onClick={() => setDelAuction(null)} style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: tokens.textSub }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Chit / Phase Ranges */}
      {editChitModal && (
        <div onClick={() => setEditChitModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Edit Chit Fund Settings</h3>
              <button onClick={() => setEditChitModal(false)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} color={tokens.textSub} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginBottom: 20 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <FormField label="Chit Fund Name">
                    <Input value={editForm.companyName || ''} onChange={e => setEditForm(f => ({ ...f, companyName: e.target.value }))} />
                  </FormField>
                </div>
                <FormField label="Branch">
                  <Input value={editForm.branch || ''} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))} />
                </FormField>
                <FormField label="Manager Commission %" hint="0–5%">
                  <Input type="number" step="0.01" min="0" max="5" value={editForm.managerCommissionPct || ''} onChange={e => setEditForm(f => ({ ...f, managerCommissionPct: e.target.value }))} suffix="%" />
                </FormField>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text, marginBottom: 4 }}>Phase Ranges — Expected Net Payable Per Round</div>
                <div style={{ fontSize: 12, color: tokens.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
                  Set the amount you expect to pay per phase. Used for cash flow projection.<br />
                  Phase size = ceil({chit.totalMembers}/4) = {Math.ceil(chit.totalMembers / 4)} rounds per phase.
                  Leave blank if unknown.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {phases.map((p, i) => (
                  <FormField key={i} label={`${p.label} (Rnd ${p.startRound}–${p.endRound})`}>
                    <Input type="number" value={editForm[`phase${i + 1}`] || ''} onChange={e => setEditForm(f => ({ ...f, [`phase${i + 1}`]: e.target.value }))} placeholder={String(Math.round(subscription))} prefix="₹" />
                  </FormField>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <button onClick={handleEditChit} disabled={editSaving}
                  style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: editSaving ? '#93C5FD' : tokens.blue, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: editSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
                <button onClick={() => setEditChitModal(false)} style={{ padding: '10px 16px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: tokens.textSub }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── All Payments Tab ──────────────────────────────────────────────────────────
function AllPaymentsTab({ chitId, userId, subscription }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aFilter, setAFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    getAllPaymentsForChit(chitId).then(p => { setPayments(p); setLoading(false); });
  }, [chitId]);

  async function toggle(id, current) {
    setUpdatingId(id);
    const next = current === 'Paid' ? 'Pending' : 'Paid';
    await updatePaymentStatus(id, next, userId);
    setPayments(prev => prev.map(p => p.id === id ? { ...p, paymentStatus: next } : p));
    setUpdatingId(null);
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>Loading payments…</div>;

  const auctions = [...new Set(payments.map(p => p.auctionNumber))].sort((a, b) => a - b);
  const filtered = aFilter === 'all' ? payments : payments.filter(p => p.auctionNumber === +aFilter);
  const paid = filtered.filter(p => p.paymentStatus === 'Paid');
  const pending = filtered.filter(p => p.paymentStatus !== 'Paid');

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Net Payable" value={formatCurrency(filtered.reduce((s, p) => s + p.netPayable, 0))} icon={Wallet} accent={tokens.blue} />
        <StatCard label="Paid" value={formatCurrency(paid.reduce((s, p) => s + p.netPayable, 0))} icon={CheckCircle} accent={tokens.green} />
        <StatCard label="Pending" value={formatCurrency(pending.reduce((s, p) => s + p.netPayable, 0))} icon={Clock} accent={tokens.amber} />
      </div>
      <Card noPad>
        <div style={{ padding: '11px 16px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: tokens.textSub }}>Filter:</span>
          <select value={aFilter} onChange={e => setAFilter(e.target.value)} style={{ height: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${tokens.border}`, fontSize: 12, fontFamily: 'inherit', background: '#fff' }}>
            <option value="all">All Auctions</option>
            {auctions.map(n => <option key={n} value={n}>Auction #{n}</option>)}
          </select>
          <span style={{ fontSize: 12, color: tokens.textMuted, marginLeft: 'auto' }}>{filtered.length} records</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: tokens.textMuted, fontSize: 13 }}>No payment records. Process auctions to generate them.</div>
        ) : filtered.map((p, i) => (
          <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${tokens.border}` : 'none', background: p.paymentStatus === 'Paid' ? 'rgba(5,150,105,0.025)' : 'transparent' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: tokens.blue, width: 36, textAlign: 'center' }}>#{p.auctionNumber}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.memberName}</div>
              <div style={{ fontSize: 11, color: tokens.textSub }}>Contribution: {formatCurrency(p.contributionAmount)} · Commission: {p.commissionReceived > 0 ? formatCurrency(p.commissionReceived) : '—'}</div>
            </div>
            {p.isWinner && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#5B21B6', color: '#fff' }}>WINNER</span>}
            <div style={{ textAlign: 'right', marginRight: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{formatCurrency(p.netPayable)}</div>
              {p.winnerPayout > 0 && <div style={{ fontSize: 11, color: '#5B21B6' }}>Prize: {formatCurrency(p.winnerPayout)}</div>}
            </div>
            {updatingId === p.id
              ? <div style={{ width: 74, display: 'flex', justifyContent: 'center' }}><div style={{ width: 16, height: 16, border: `2px solid ${tokens.border}`, borderTopColor: tokens.blue, borderRadius: '50%', animation: 'spin .6s linear infinite' }} /></div>
              : <button onClick={() => toggle(p.id, p.paymentStatus)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, background: p.paymentStatus === 'Paid' ? '#D1FAE5' : '#FEF3C7', color: p.paymentStatus === 'Paid' ? '#065F46' : '#92400E' }}>
                {p.paymentStatus === 'Paid' ? <CheckCircle size={10} /> : <Clock size={10} />}
                {p.paymentStatus === 'Paid' ? 'Paid' : 'Pending'}
              </button>}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Ledger Tab ────────────────────────────────────────────────────────────────
function LedgerTab({ chitId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLedger(chitId).then(e => { setEntries(e); setLoading(false); });
  }, [chitId]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: tokens.textMuted }}>Loading ledger…</div>;

  const typeCfg = {
    'Investment':         { color: tokens.red,    label: 'Investment' },
    'Commission Earned':  { color: tokens.green,  label: 'Commission' },
    'Manager Commission': { color: tokens.amber,  label: 'Mgr. Comm.' },
    'Cash/Bank':          { color: tokens.blue,   label: 'Cash/Bank' },
  };

  const totals = entries.reduce((acc, e) => ({
    debit: acc.debit + (e.debit || 0),
    credit: acc.credit + (e.credit || 0),
  }), { debit: 0, credit: 0 });

  return (
    <Card noPad>
      <div style={{ padding: '11px 16px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Chit Fund Ledger</span>
        <div style={{ display: 'flex', gap: 20, fontSize: 12.5 }}>
          <span>Total Debit: <strong style={{ color: tokens.red }}>{formatCurrency(totals.debit)}</strong></span>
          <span>Total Credit: <strong style={{ color: tokens.green }}>{formatCurrency(totals.credit)}</strong></span>
          <span>Net: <strong style={{ color: totals.credit - totals.debit >= 0 ? tokens.green : tokens.red }}>{formatCurrency(totals.credit - totals.debit)}</strong></span>
        </div>
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: tokens.textMuted, fontSize: 13 }}>No ledger entries yet. Process auctions to generate entries.</div>
      ) : entries.map((e, i) => {
        const cfg = typeCfg[e.type] || { color: tokens.textSub, label: e.type };
        return (
          <div key={e.id || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < entries.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
            <div style={{ width: 80, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
            </div>
            <div style={{ width: 36, fontSize: 12, color: tokens.blue, fontWeight: 700, flexShrink: 0 }}>#{e.auctionNumber}</div>
            <div style={{ flex: 1, fontSize: 12, color: tokens.textSub }}>{fmtDate(e.date)}</div>
            <div style={{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: 700, color: tokens.red }}>{e.debit > 0 ? formatCurrency(e.debit) : '—'}</div>
            <div style={{ width: 110, textAlign: 'right', fontSize: 13, fontWeight: 700, color: tokens.green }}>{e.credit > 0 ? formatCurrency(e.credit) : '—'}</div>
          </div>
        );
      })}
    </Card>
  );
}
