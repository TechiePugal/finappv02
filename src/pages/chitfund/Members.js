// src/pages/Members.js
import { PageLoader } from '../../components/Skeleton';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, FileText, ChevronRight, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboardData, getMembers, updateMember, deleteMember } from '../../utils/cf_firestore';
import { formatDate } from '../../utils/cf_format';
import {
  Card, PageHeader, Badge, Table, StatCard, SearchBar, FilterTabs,
  Loader, EmptyState, tokens, Modal, FormField, Input, Button, Alert
} from '../../components/chitfund/UI';

export default function Members() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [allMembers, setAllMembers] = useState([]);
  const [chitsMap, setChitsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Edit
  const [showEdit, setShowEdit] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await getDashboardData(user.uid);
    const map = {};
    data.chits.forEach(c => { map[c.id] = c; });
    setChitsMap(map);
    const all = (await Promise.all(
      data.chits.map(c => getMembers(c.id).then(ms => ms.map(m => ({
        ...m, chitName: c.companyName, chitId: c.id,
        chitAuctionsDone: c.auctionsCompleted || 0,
      }))))
    )).flat();
    setAllMembers(all);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const filtered = allMembers.filter(m => {
    const mf = filter === 'All' || m.status === filter;
    const ms = !search || m.name?.toLowerCase().includes(search.toLowerCase())
      || m.phone?.includes(search)
      || m.chitName?.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const openEdit = (member, e) => {
    e.stopPropagation();
    setEditTarget(member);
    setEditForm({ name: member.name, phone: member.phone || '' });
    setEditError('');
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!editForm.name.trim()) return setEditError('Name is required.');
    setEditSaving(true);
    try {
      await updateMember(editTarget.id, { name: editForm.name.trim(), phone: editForm.phone.trim() }, user.uid, editTarget.chitId);
      setShowEdit(false);
      load();
    } catch (e) { setEditError(e.message); }
    setEditSaving(false);
  };

  const openDelete = (member, e) => {
    e.stopPropagation();
    setDeleteTarget(member);
    setShowDelete(true);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMember(deleteTarget.id, deleteTarget.chitId, user.uid);
      setShowDelete(false);
      load();
    } catch (e) {
      setShowDelete(false);
      alert(e.message);
    }
    setDeleting(false);
  };

  const cols = [
    { key: 'name', header: 'Member Name', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
    { key: 'phone', header: 'Phone', render: v => v || '—' },
    { key: 'chitName', header: 'Chit Fund', render: (v, r) => (
      <button onClick={e => { e.stopPropagation(); nav(`/cf/chits/${r.chitId}`); }}
        style={{ background: 'none', border: 'none', color: tokens.blue, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
        {v}
      </button>
    )},
    { key: 'status', header: 'Status', render: v => <Badge status={v} /> },
    { key: 'auctionTakenNumber', header: 'Taken In', render: v => v ? `Auction #${v}` : '—' },
    {
      key: 'id', header: 'Actions', render: (_, row) => (
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={e => openEdit(row, e)}
            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Edit">
            <Pencil size={12} color={tokens.textSub} />
          </button>
          {row.status !== 'Taken' && row.chitAuctionsDone === 0 && (
            <button onClick={e => openDelete(row, e)}
              style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete">
              <Trash2 size={12} color={tokens.red} />
            </button>
          )}
          <ChevronRight size={14} color={tokens.textMuted} />
        </div>
      )
    },
  ];

  if (loading) return <Loader text="Loading members…" />;

  return (
    <div>
      <PageHeader title="All Members" subtitle={`${allMembers.length} members across all chit funds`} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13, marginBottom: 20 }}>
        <StatCard label="Total Members" value={allMembers.length} icon={Users} accent={tokens.blue} />
        <StatCard label="Active" value={allMembers.filter(m => m.status === 'Active').length} icon={Users} accent={tokens.green} />
        <StatCard label="Taken" value={allMembers.filter(m => m.status === 'Taken').length} icon={FileText} accent={tokens.amber} />
      </div>

      <Card noPad>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${tokens.border}`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}><SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone, or chit fund…" /></div>
          <FilterTabs tabs={[{ label: 'All', value: 'All' }, { label: 'Active', value: 'Active' }, { label: 'Taken', value: 'Taken' }]} active={filter} onChange={setFilter} />
        </div>
        {filtered.length > 0
          ? <Table columns={cols} data={filtered} onRowClick={r => nav(`/cf/chits/${r.chitId}`)} />
          : <EmptyState icon={Users} title="No members found" subtitle="Members are added through individual chit fund pages" />
        }
      </Card>

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit Member — ${editTarget?.name}`} width={400}
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button><Button size="sm" onClick={handleEdit} loading={editSaving}>Save Changes</Button></>}>
        {editError && <div style={{ marginBottom: 12 }}><Alert type="error" message={editError} onClose={() => setEditError('')} /></div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormField label="Full Name" required>
            <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Phone Number">
            <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
          </FormField>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal open={showDelete} onClose={() => setShowDelete(false)} title="Delete Member" width={400}
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowDelete(false)}>Cancel</Button><Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Delete Member</Button></>}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: tokens.redLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={tokens.red} />
          </div>
          <div>
            <p style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 600 }}>Delete "{deleteTarget?.name}"?</p>
            <p style={{ margin: 0, fontSize: 13, color: tokens.textSub, lineHeight: 1.5 }}>
              This member will be removed from <strong>{deleteTarget?.chitName}</strong>. This action is only allowed before the first auction and cannot be undone.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
