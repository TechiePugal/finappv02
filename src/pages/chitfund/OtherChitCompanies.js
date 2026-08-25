/**
 * OtherChitCompanies.js — standalone "Company / Agent" directory for Joined Chits.
 *
 * A joined chit is always run by someone else — a company or an agent. Instead of
 * retyping that company's name/phone every time you join a new chit through them,
 * register the company once here, then pick it when creating a chit.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getOtherCompanies, addOtherCompany, updateOtherCompany, deleteOtherCompany, getOtherChits,
} from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { tokens, Card, PageHeader, StatCard, Button, Modal, FormField, Input } from '../../components/chitfund/UI';
import toast from 'react-hot-toast';

const BLANK = { companyName:'', organiserName:'', organiserPhone:'', notes:'' };

export default function OtherChitCompanies() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [chits, setChits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([getOtherCompanies(user.uid), getOtherChits(user.uid)])
      .then(([co, ch]) => { setCompanies(co); setChits(ch); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  function sf(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function openAdd() { setEditTarget(null); setForm(BLANK); setModalOpen(true); }
  function openEdit(co) { setEditTarget(co); setForm({ companyName: co.companyName||'', organiserName: co.organiserName||'', organiserPhone: co.organiserPhone||'', notes: co.notes||'' }); setModalOpen(true); }

  async function save() {
    if (!form.companyName.trim()) return toast.error('Company name is required');
    setSaving(true);
    try {
      if (editTarget) {
        await updateOtherCompany(editTarget.id, form);
        setCompanies(cs => cs.map(c => c.id === editTarget.id ? { ...c, ...form } : c));
        toast.success('Company updated');
      } else {
        const id = await addOtherCompany(form, user.uid);
        setCompanies(cs => [...cs, { id, ...form, createdBy: user.uid }].sort((a,b)=>a.companyName.localeCompare(b.companyName)));
        toast.success('Company added');
      }
      setModalOpen(false);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  async function confirmDelete() {
    try {
      await deleteOtherCompany(delTarget.id);
      setCompanies(cs => cs.filter(c => c.id !== delTarget.id));
      toast.success('Company removed');
      setDelTarget(null);
    } catch (e) { toast.error('Failed: ' + e.message); }
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: tokens.textSub }}>Loading…</div>;

  const chitCountFor = (companyName) => chits.filter(c => c.companyName === companyName).length;
  const valueFor = (companyName) => chits.filter(c => c.companyName === companyName).reduce((s, c) => s + (c.totalChitValue || 0), 0);

  return (
    <div>
      <PageHeader title="Companies / Agents" subtitle="Register the companies and agents you join chits through"
        action={<Button onClick={openAdd} icon={Plus}>Add Company</Button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 13, marginBottom: 20 }}>
        <StatCard label="Total Companies" value={companies.length} icon={Building2} accent={tokens.blue} />
        <StatCard label="Total Chits Joined" value={chits.length} sub="across all companies" icon={Building2} accent="#5521B5" />
      </div>

      {companies.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text, marginBottom: 6 }}>No companies yet</div>
          <div style={{ fontSize: 13, color: tokens.textSub, marginBottom: 16 }}>Add the company or agent you join chits through — you'll pick it when creating a new chit.</div>
          <Button onClick={openAdd} icon={Plus}>Add Your First Company</Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {companies.map(co => (
            <Card key={co.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
              <span style={{ fontSize: 22 }}>🏢</span>
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => nav('/cf/other-chits')}>
                <div style={{ fontSize: 15, fontWeight: 700, color: tokens.text }}>{co.companyName}</div>
                <div style={{ fontSize: 12, color: tokens.textSub, marginTop: 2 }}>
                  {co.organiserName && <>Agent: {co.organiserName} · </>}
                  {chitCountFor(co.companyName)} chit{chitCountFor(co.companyName) !== 1 ? 's' : ''} · {formatCurrency(valueFor(co.companyName))} total value
                </div>
              </div>
              <button onClick={() => openEdit(co)} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Edit2 size={15} /></button>
              <button onClick={() => setDelTarget(co)} style={{ width: 34, height: 34, borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.red }}><Trash2 size={15} /></button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Company' : 'Add Company / Agent'} width={480}
        footer={<Button onClick={save} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>{saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Company'}</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="Company / Chit Fund Name" required><Input value={form.companyName} onChange={e => sf('companyName', e.target.value)} placeholder="e.g. Shriram Chit Fund" autoFocus /></FormField>
          <FormField label="Agent Name"><Input value={form.organiserName} onChange={e => sf('organiserName', e.target.value)} placeholder="Agent's name" /></FormField>
          <FormField label="Agent Phone"><Input value={form.organiserPhone} onChange={e => sf('organiserPhone', e.target.value)} type="tel" placeholder="9876543210" /></FormField>
          <FormField label="Notes (optional)"><Input value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Any notes about this company" /></FormField>
        </div>
      </Modal>

      <Modal open={!!delTarget} onClose={() => setDelTarget(null)} title="Remove Company?" width={420}
        footer={<div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Button variant="danger" onClick={confirmDelete} style={{ flex: 1, justifyContent: 'center' }}>Remove</Button>
          <Button variant="secondary" onClick={() => setDelTarget(null)}>Cancel</Button>
        </div>}>
        <p style={{ fontSize: 13.5, color: tokens.textSub }}>
          Remove <strong>{delTarget?.companyName}</strong> from your company directory? This won't affect any chits you've already added under this company — it just removes it from the picker.
        </p>
      </Modal>
    </div>
  );
}
