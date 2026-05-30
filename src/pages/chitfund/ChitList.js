import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Users, TrendingUp, Wallet, Edit2, Trash2, X, AlertTriangle, Eye, Clock, CheckCircle, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getChits, createChit, updateChit, deleteChit, addMember, getDashboardData } from '../../utils/cf_firestore';
import { calcPerHeadValue, buildMonthProjection } from '../../utils/cf_engine';
import { formatCurrency, formatDate } from '../../utils/cf_format';
import { Card, PageHeader, Button, Badge, Modal, FormField, Input, Select, Alert, tokens, StatCard } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const BLANK = {
  companyName: '', branch: 'Head Office', totalChitValue: '', totalMembers: '',
  auctionInterval: '1', startDate: '', commissionType: 'Single',
  managerCommissionPct: '5', slabType: 'Fixed', slabValue: '', commissionBase: 'On Total',
};

// ── Icon button ──────────────────────────────────────────────────────────────
function IconBtn({ icon: Icon, onClick, title, danger, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button
      title={title} onClick={e => { e.stopPropagation(); if (!disabled) onClick(e); }}
      disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${h && !disabled ? (danger ? tokens.red : tokens.borderDark || '#c8d0e2') : tokens.border}`, background: h && !disabled ? (danger ? tokens.redLight : tokens.slateLight) : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', opacity: disabled ? 0.4 : 1, flexShrink: 0 }}
    >
      <Icon size={13} color={h && !disabled ? (danger ? tokens.red : tokens.blue) : tokens.textSub} strokeWidth={2} />
    </button>
  );
}

// ── Member input row ─────────────────────────────────────────────────────────
function MemberRow({ idx, member, onChange, onRemove, canRemove }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 32px', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${tokens.border}` }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted, textAlign: 'center' }}>{idx + 1}</span>
      <Input value={member.name} onChange={e => onChange(idx, 'name', e.target.value)} placeholder={`Member ${idx + 1}`} style={{ height: 32, fontSize: 12 }} />
      <Input value={member.phone} onChange={e => onChange(idx, 'phone', e.target.value)} placeholder="Phone" style={{ height: 32, fontSize: 12 }} />
      <button onClick={() => onRemove(idx)} disabled={!canRemove}
        style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${tokens.border}`, background: canRemove ? tokens.redLight : tokens.slateLight, color: canRemove ? tokens.red : tokens.textMuted, cursor: canRemove ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={12} />
      </button>
    </div>
  );
}

// ── Chit Card (replaces table rows with rich cards) ──────────────────────────
function ChitCard({ chit, schedule, onEdit, onDelete, onView }) {
  const nav = useNavigate();
  const [hov, setHov] = useState(false);

  const completed = chit.auctionsCompleted || 0;
  const total = chit.totalMembers || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isCompanyTaken = chit.companyTakenAuction !== null && chit.companyTakenAuction !== undefined;
  const slab = chit.slabType === 'Fixed'
    ? (chit.slabValue || 0)
    : Math.round((chit.totalChitValue || 0) * (chit.slabValue || 0) / 100);
  const thisMonthNeed = isCompanyTaken ? (chit.perHeadValue || 0) : slab;
  const expectedComm = (chit.totalChitValue || 0) * (chit.managerCommissionPct || 5) / 100;
  const earnedComm = chit.totalCommissionEarned || 0;

  const pendingSchedule = (schedule || []).filter(s => s.status === 'Pending');
  const nextAuction = pendingSchedule[0];
  const nextDate = nextAuction?.auctionDate
    ? (nextAuction.auctionDate?.seconds ? new Date(nextAuction.auctionDate.seconds * 1000) : new Date(nextAuction.auctionDate))
    : null;
  const daysToNext = nextDate ? Math.max(0, Math.floor((nextDate - new Date()) / 86400000)) : null;

  const urgencyColor = daysToNext !== null && daysToNext <= 2 ? tokens.red
    : daysToNext !== null && daysToNext <= 7 ? tokens.amber : tokens.blue;

  return (
    <div
      onClick={() => nav(`/cf/chits/${chit.id}`)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: '#fff', borderRadius: 16, border: `1px solid ${hov ? tokens.blue + '40' : daysToNext !== null && daysToNext <= 2 ? tokens.red + '30' : tokens.border}`, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: hov ? '0 8px 28px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden' }}
    >
      {/* Top accent line for urgent */}
      {daysToNext !== null && daysToNext <= 2 && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tokens.red, borderRadius: '16px 16px 0 0' }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: tokens.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chit.companyName}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: tokens.textMuted, background: tokens.slateLight, padding: '2px 7px', borderRadius: 5 }}>{chit.branch || 'Head Office'}</span>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>·</span>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>{total} members</span>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>·</span>
            <span style={{ fontSize: 11, color: tokens.textMuted }}>{chit.commissionType}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, marginLeft: 10 }}>
          <Badge status={chit.status} />
          <IconBtn icon={Edit2} onClick={onEdit} title="Edit chit fund" />
          {completed === 0 && <IconBtn icon={Trash2} onClick={onDelete} title="Delete chit fund" danger />}
          <IconBtn icon={Eye} onClick={() => nav(`/cf/chits/${chit.id}`)} title="View details" />
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11.5, color: tokens.textSub, fontWeight: 500 }}>Progress: {completed} of {total} auctions</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: pct >= 75 ? tokens.green : pct >= 40 ? tokens.amber : tokens.blue }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: tokens.slateLight, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: pct >= 75 ? tokens.green : pct >= 40 ? tokens.amber : tokens.blue, borderRadius: 3, transition: 'width 0.6s ease' }} />
        </div>
      </div>

      {/* Key numbers grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Total Value', val: formatCurrency(chit.totalChitValue), color: tokens.text, sub: '' },
          { label: 'Per Head', val: formatCurrency(chit.perHeadValue), color: tokens.blue, sub: 'per member' },
          { label: 'This Month', val: formatCurrency(thisMonthNeed), color: urgencyColor, sub: isCompanyTaken ? 'per head (taken)' : 'slab investment' },
          { label: 'Commission', val: formatCurrency(earnedComm), color: tokens.green, sub: `of ${formatCurrency(expectedComm)} expected` },
        ].map((item, i) => (
          <div key={i} style={{ background: tokens.slateLight, borderRadius: 9, padding: '9px 10px' }}>
            <div style={{ fontSize: 9.5, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: item.color, lineHeight: 1.1 }}>{item.val}</div>
            {item.sub && <div style={{ fontSize: 9, color: tokens.textMuted, marginTop: 2 }}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Bottom info row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: tokens.textSub, flexWrap: 'wrap' }}>
          <span>Start: <strong style={{ color: tokens.text }}>{formatDate(chit.startDate)}</strong></span>
          <span>Chit Taken: <strong style={{ color: isCompanyTaken ? tokens.purple : tokens.textMuted }}>{isCompanyTaken ? 'Yes ✓' : 'No'}</strong></span>
          <span>Slab: <strong style={{ color: tokens.text }}>{chit.slabType === 'Fixed' ? formatCurrency(slab) : `${chit.slabValue}%`}</strong></span>
        </div>
        {nextDate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: urgencyColor + '12', borderRadius: 8, border: `1px solid ${urgencyColor + '30'}` }}>
            <Clock size={11} color={urgencyColor} />
            <span style={{ fontSize: 11.5, fontWeight: 700, color: urgencyColor }}>
              Auction #{nextAuction.auctionNumber}: {daysToNext === 0 ? 'Today!' : daysToNext === 1 ? 'Tomorrow' : `${daysToNext}d`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ChitList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chits, setChits] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK);
  const [members, setMembers] = useState([{ name: '', phone: '' }]);
  const [saving, setSaving] = useState(false);
  const [createErr, setCreateErr] = useState('');

  // Edit modal
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  // Delete confirm
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getDashboardData(user.uid);
    setChits(data.chits || []);
    setSchedules(data.schedules || {});
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const perHead = form.totalChitValue && form.totalMembers
    ? calcPerHeadValue(+form.totalChitValue, +form.totalMembers) : 0;

  // ── Create ────────────────────────────────────────────────────────────────
  function handleNext() {
    setCreateErr('');
    if (!form.companyName.trim()) return setCreateErr('Chit fund name is required.');
    if (!form.totalChitValue || +form.totalChitValue <= 0) return setCreateErr('Total value must be > 0.');
    if (!form.totalMembers || +form.totalMembers < 2) return setCreateErr('Minimum 2 members required.');
    if (!form.startDate) return setCreateErr('Start date is required.');
    if (!form.slabValue || +form.slabValue <= 0) return setCreateErr('Slab value is required.');
    if (form.slabType === 'Fixed' && +form.slabValue > perHead)
      return setCreateErr(`Slab (₹${form.slabValue}) cannot exceed Per Head (${formatCurrency(perHead)}).`);
    const count = +form.totalMembers;
    setMembers(Array.from({ length: count }, (_, i) => members[i] || { name: '', phone: '' }));
    setStep(2);
  }

  async function handleCreate() {
    setCreateErr('');
    const named = members.filter(m => m.name.trim());
    if (named.length === 0) return setCreateErr('Add at least one named member.');
    setSaving(true);
    try {
      const id = await createChit({
        ...form,
        totalChitValue: +form.totalChitValue, totalMembers: +form.totalMembers,
        auctionInterval: +form.auctionInterval, managerCommissionPct: +form.managerCommissionPct,
        slabValue: +form.slabValue,
      }, user.uid);
      await Promise.all(named.map(m => addMember(id, m, user.uid)));
      closeCreate(); load(); nav(`/cf/chits/${id}`);
    } catch (e) { setCreateErr(e.message); }
    finally { setSaving(false); }
  }

  function closeCreate() {
    setShowCreate(false); setForm(BLANK); setMembers([{ name: '', phone: '' }]);
    setStep(1); setCreateErr('');
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  function openEdit(chit) {
    setEditTarget(chit);
    setEditForm({ companyName: chit.companyName, branch: chit.branch || 'Head Office', managerCommissionPct: chit.managerCommissionPct, commissionType: chit.commissionType });
    setEditErr(''); 
  }

  async function handleEdit() {
    setEditErr('');
    if (!editForm.companyName?.trim()) return setEditErr('Name is required.');
    setEditSaving(true);
    try { await updateChit(editTarget.id, editForm, user.uid); setEditTarget(null); load(); }
    catch (e) { setEditErr(e.message); }
    finally { setEditSaving(false); }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try { await deleteChit(delTarget.id, user.uid); setDelTarget(null); load(); }
    catch (e) { alert(e.message); }
    finally { setDeleting(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filterTabs = ['All', 'Active', 'Closed'];
  const filtered = chits.filter(c => {
    const ms = !search || c.companyName?.toLowerCase().includes(search.toLowerCase()) || c.branch?.toLowerCase().includes(search.toLowerCase());
    const mf = filter === 'All' || c.status === filter;
    return ms && mf;
  });

  const totalVal = chits.reduce((s, c) => s + (c.totalChitValue || 0), 0);
  const totalComm = chits.reduce((s, c) => s + (c.totalCommissionEarned || 0), 0);
  const activeCount = chits.filter(c => c.status === 'Active').length;
  const locked = editTarget && (editTarget.auctionsCompleted || 0) > 0;

  if (loading) return <PageLoader stats={4} />;

  return (
    <div>
      <PageHeader
        title="Chit Funds"
        subtitle={`${chits.length} funds · ${activeCount} active · ${formatCurrency(totalVal)} total portfolio`}
        action={
          <Button icon={Plus} onClick={() => setShowCreate(true)}>
            Create Chit Fund
          </Button>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Chit Funds" value={chits.length} sub={`${activeCount} active`} icon={FileText} accent={tokens.blue} />
        <StatCard label="Portfolio Value" value={formatCurrency(totalVal)} sub="Combined chit value" icon={Wallet} accent={tokens.amber} />
        <StatCard label="Total Members" value={chits.reduce((s, c) => s + (c.totalMembers || 0), 0)} sub="Across all chits" icon={Users} accent={tokens.green} />
        <StatCard label="Commission Earned" value={formatCurrency(totalComm)} sub="All chit funds" icon={TrendingUp} accent={tokens.purple} />
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={14} color={tokens.textMuted} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or branch…"
            style={{ width: '100%', height: 38, paddingLeft: 34, paddingRight: 12, borderRadius: 10, border: `1.5px solid ${tokens.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: tokens.text }} />
        </div>
        <div style={{ display: 'flex', background: tokens.slateLight, borderRadius: 10, padding: 3, border: `1px solid ${tokens.border}`, gap: 2 }}>
          {filterTabs.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: filter === t ? '#fff' : 'transparent', color: filter === t ? tokens.text : tokens.textSub, fontWeight: filter === t ? 700 : 400, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', boxShadow: filter === t ? '0 1px 3px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.15s' }}>
              {t} {t !== 'All' && `(${chits.filter(c => c.status === t).length})`}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: tokens.textMuted, marginLeft: 'auto' }}>
          {filtered.length} {filtered.length === 1 ? 'fund' : 'funds'}
        </span>
      </div>

      {/* Chit cards */}
      {filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '52px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>💰</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: tokens.textSub, marginBottom: 6 }}>
              {search ? 'No chit funds match your search' : 'No chit funds yet'}
            </div>
            <div style={{ fontSize: 13, color: tokens.textMuted, marginBottom: 20 }}>
              {search ? 'Try a different search term' : 'Create your first chit fund to get started'}
            </div>
            {!search && <Button icon={Plus} onClick={() => setShowCreate(true)}>Create Chit Fund</Button>}
          </div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(c => (
            <ChitCard
              key={c.id}
              chit={c}
              schedule={schedules[c.id] || []}
              onEdit={() => openEdit(c)}
              onDelete={() => setDelTarget(c)}
              onView={() => nav(`/cf/chits/${c.id}`)}
            />
          ))}
        </div>
      )}

      {/* ─────────── CREATE MODAL ─────────── */}
      <Modal open={showCreate} onClose={closeCreate} width={step === 2 ? 640 : 600}
        title={step === 1 ? '📋 Create New Chit Fund' : `👥 Add Members — ${form.companyName}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[1, 2].map(s => <div key={s} style={{ width: 28, height: 4, borderRadius: 2, background: step >= s ? tokens.blue : tokens.border }} />)}
              <span style={{ fontSize: 11.5, color: tokens.textSub, marginLeft: 6 }}>Step {step} of 2</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {step === 2 && <Button variant="secondary" size="sm" onClick={() => { setStep(1); setCreateErr(''); }}>← Back</Button>}
              <Button variant="secondary" size="sm" onClick={closeCreate}>Cancel</Button>
              {step === 1
                ? <Button size="sm" onClick={handleNext}>Next: Add Members →</Button>
                : <Button size="sm" variant="success" onClick={handleCreate} loading={saving}>✓ Create Chit Fund</Button>}
            </div>
          </div>
        }>

        {createErr && <div style={{ marginBottom: 14, padding: '10px 14px', background: tokens.redLight, border: `1px solid ${tokens.red}30`, borderRadius: 9, fontSize: 13, color: tokens.red, fontWeight: 500 }}>⚠ {createErr}</div>}

        {step === 1 && (
          <div>
            {/* Fund name (full width) */}
            <div style={{ marginBottom: 14 }}>
              <FormField label="Chit Fund Name" required hint="e.g. Sri Lakshmi Chit Fund — Group 5">
                <Input value={form.companyName} onChange={e => setF('companyName', e.target.value)} placeholder="Chit fund name" autoFocus />
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <FormField label="Branch / Location">
                <Input value={form.branch} onChange={e => setF('branch', e.target.value)} placeholder="Head Office" />
              </FormField>
              <FormField label="Start Date" required>
                <Input type="date" value={form.startDate} onChange={e => setF('startDate', e.target.value)} />
              </FormField>
              <FormField label="Total Chit Value (₹)" required>
                <Input type="number" value={form.totalChitValue} onChange={e => setF('totalChitValue', e.target.value)} placeholder="1000000" prefix="₹" />
              </FormField>
              <FormField label="Number of Members" required hint="Minimum 2">
                <Input type="number" value={form.totalMembers} onChange={e => setF('totalMembers', e.target.value)} placeholder="20" />
              </FormField>
              <FormField label="Auction Every (months)" required>
                <Input type="number" value={form.auctionInterval} onChange={e => setF('auctionInterval', e.target.value)} placeholder="1" />
              </FormField>
              <FormField label="Commission Type">
                <Select value={form.commissionType} onChange={e => setF('commissionType', e.target.value)}>
                  <option value="Single">Single Commission</option>
                  <option value="Double">Double Commission</option>
                </Select>
              </FormField>
              <FormField label="Manager Commission %" required>
                <Input type="number" step="0.01" value={form.managerCommissionPct} onChange={e => setF('managerCommissionPct', e.target.value)} suffix="%" />
              </FormField>
              <FormField label="Commission Base">
                <Select value={form.commissionBase} onChange={e => setF('commissionBase', e.target.value)}>
                  <option value="On Total">On Total Chit Value</option>
                  <option value="On Collected">On Collected Amount</option>
                </Select>
              </FormField>
              <FormField label="Slab Type" required hint="Investment when chit NOT taken by company">
                <Select value={form.slabType} onChange={e => setF('slabType', e.target.value)}>
                  <option value="Fixed">Fixed Amount (₹)</option>
                  <option value="Percentage">Percentage of Total (%)</option>
                </Select>
              </FormField>
              <FormField label={form.slabType === 'Fixed' ? 'Slab Amount (₹)' : 'Slab Percentage (%)'} required>
                <Input type="number" step="0.01" value={form.slabValue} onChange={e => setF('slabValue', e.target.value)} prefix={form.slabType === 'Fixed' ? '₹' : undefined} suffix={form.slabType === 'Percentage' ? '%' : undefined} placeholder={form.slabType === 'Fixed' ? '5000' : '5'} />
              </FormField>
            </div>

            {/* Auto-calc preview */}
            {perHead > 0 && (
              <div style={{ background: 'linear-gradient(135deg,rgba(26,86,219,0.06),rgba(88,86,214,0.04))', border: `1px solid ${tokens.blue}25`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: tokens.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Auto-Calculated Preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Per Head Value', val: formatCurrency(perHead) },
                    { label: 'Total Auctions', val: form.totalMembers || '—' },
                    { label: 'Duration', val: form.totalMembers && form.auctionInterval ? `${+form.totalMembers * +form.auctionInterval} months` : '—' },
                    { label: 'Expected Commission', val: form.totalChitValue ? formatCurrency(+form.totalChitValue * +form.managerCommissionPct / 100) : '—' },
                  ].map((item, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: tokens.blue }}>{item.val}</div>
                      <div style={{ fontSize: 10.5, color: tokens.textMuted, marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16, padding: '10px 14px', background: tokens.slateLight, borderRadius: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: tokens.blue }}>{formatCurrency(perHead)}</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Per Head</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: tokens.text }}>{form.totalMembers}</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Total Slots</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: tokens.green }}>{members.filter(m => m.name.trim()).length}</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Named so far</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 32px', gap: 8, marginBottom: 6 }}>
              <span />
              <span style={{ fontSize: 10, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member Name</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Phone (optional)</span>
              <span />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 2 }}>
              {members.map((m, i) => (
                <MemberRow key={i} idx={i} member={m}
                  onChange={(i2, f, v) => setMembers(ms => ms.map((r, idx) => idx === i2 ? { ...r, [f]: v } : r))}
                  onRemove={i2 => setMembers(ms => ms.filter((_, idx) => idx !== i2))}
                  canRemove={members.length > 1} />
              ))}
            </div>
            {members.length < +form.totalMembers && (
              <button onClick={() => setMembers(ms => [...ms, { name: '', phone: '' }])}
                style={{ marginTop: 10, width: '100%', padding: '8px', background: 'none', border: `1.5px dashed ${tokens.border}`, borderRadius: 8, color: tokens.blue, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={13} /> Add Member Row
              </button>
            )}
            <p style={{ margin: '10px 0 0', fontSize: 11, color: tokens.textMuted }}>Empty rows are skipped. You can add more members later from the chit detail page.</p>
          </div>
        )}
      </Modal>

      {/* ─────────── EDIT MODAL ─────────── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} width={480}
        title={`✏️ Edit — ${editTarget?.companyName}`}
        footer={<><Button variant="secondary" size="sm" onClick={() => setEditTarget(null)}>Cancel</Button><Button size="sm" onClick={handleEdit} loading={editSaving}>Save Changes</Button></>}>
        {editErr && <div style={{ marginBottom: 14, padding: '10px 14px', background: tokens.redLight, borderRadius: 9, fontSize: 13, color: tokens.red }}>⚠ {editErr}</div>}
        {locked && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: tokens.amberLight, border: `1px solid ${tokens.amber}30`, borderRadius: 9, fontSize: 12.5, color: tokens.amber }}>
            ⚠ This chit has completed auctions. Only name, branch, and commission % can be changed.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <FormField label="Chit Fund Name" required>
            <Input value={editForm.companyName || ''} onChange={e => setEditForm(f => ({ ...f, companyName: e.target.value }))} />
          </FormField>
          <FormField label="Branch">
            <Input value={editForm.branch || ''} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))} />
          </FormField>
          <FormField label="Manager Commission %" hint="Can always be updated">
            <Input type="number" step="0.01" value={editForm.managerCommissionPct || ''} onChange={e => setEditForm(f => ({ ...f, managerCommissionPct: +e.target.value }))} suffix="%" />
          </FormField>
          {!locked && (
            <FormField label="Commission Type">
              <Select value={editForm.commissionType || 'Single'} onChange={e => setEditForm(f => ({ ...f, commissionType: e.target.value }))}>
                <option value="Single">Single Commission</option>
                <option value="Double">Double Commission</option>
              </Select>
            </FormField>
          )}
        </div>
      </Modal>

      {/* ─────────── DELETE CONFIRM ─────────── */}
      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} width={420}
        title="🗑️ Delete Chit Fund"
        footer={<><Button variant="secondary" size="sm" onClick={() => setDelTarget(null)}>Cancel</Button><Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Delete Permanently</Button></>}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: tokens.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={20} color={tokens.red} />
          </div>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: tokens.text }}>Delete "{delTarget?.companyName}"?</p>
            <p style={{ margin: 0, fontSize: 13.5, color: tokens.textSub, lineHeight: 1.6 }}>This will permanently delete the chit fund, all {delTarget?.totalMembers || 0} member records, and the auction schedule. <strong style={{ color: tokens.red }}>This cannot be undone.</strong></p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
