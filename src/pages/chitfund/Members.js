// src/pages/chitfund/Members.js
// Shared MEMBER ENROLLMENT for Chit Fund — one real person, reusable across
// multiple chits. Storing them here (instead of re-typing fresh for every chit)
// lets us: (1) offer autocomplete when adding a member to a chit, and
// (2) build a single cross-chit history report for one person — every chit
// they're in, active/closed status, and full payment history with dates.
// Formed chits only.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  createPerson, updatePerson, getPersons, deletePerson, getPersonChitHistory,
} from '../../utils/cf_firestore';
import { savePersonProof, getPersonProof } from '../../utils/personFiles';
import { uploadDocumentFile } from '../../utils/fileStore';
import { Card, PageHeader, Button, FormField, Input, Textarea, Modal } from '../../components/chitfund/UI';
import toast from 'react-hot-toast';

const tokens = { blue: '#007AFF', green: '#34C759', amber: '#FF9500', purple: '#5856D6', red: '#FF3B30', text: '#1C1C1E', textSub: '#6B7280', textMuted: '#9CA3AF', border: 'rgba(0,0,0,0.08)', slateLight: '#F9F9FB' };
const fmt = v => '₹' + Math.round(v || 0).toLocaleString('en-IN');
const fmtDate = d => { if (!d) return '—'; const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d); return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

const BLANK = { name: '', phone: '', address: '', aadhaar: '', nomineeName: '', nomineePhone: '', guardianName: '', guardianPhone: '', notes: '' };

export default function Members() {
  const { user } = useAuth();
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'add' | person object
  const [form, setForm] = useState(BLANK);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);
  const [existingProof, setExistingProof] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportPerson, setReportPerson] = useState(null); // person whose individual report is open

  useEffect(() => { load(); }, []); //eslint-disable-line
  async function load() {
    if (!user) return;
    setLoading(true);
    try { setPersons(await getPersons(user.uid)); } catch (e) { toast.error('Failed to load members'); }
    setLoading(false);
  }

  function openAdd() {
    setForm(BLANK); setPhotoPreview(null); setPhotoFile(null); setProofFile(null); setExistingProof(null);
    setModal('add');
  }
  async function openEdit(p) {
    setForm({ ...BLANK, ...p });
    setPhotoPreview(p.photo || null); setPhotoFile(null); setProofFile(null);
    const proof = await getPersonProof(p.id).catch(() => null);
    setExistingProof(proof);
    setModal(p);
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handlePhoto(file) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Name and phone are required.');
    setSaving(true);
    try {
      const photoUrl = photoFile ? (await uploadDocumentFile(photoFile)).dataUrl : (photoPreview || null);
      const proofUrl = proofFile ? (await uploadDocumentFile(proofFile)).dataUrl : undefined; // undefined = don't touch

      let personId;
      if (modal === 'add') {
        personId = await createPerson({ ...form, photo: photoUrl }, user.uid);
        toast.success('Member enrolled!');
      } else {
        personId = modal.id;
        await updatePerson(personId, { ...form, photo: photoUrl }, user.uid);
        toast.success('Member updated!');
      }
      if (proofFile) await savePersonProof(personId, proofUrl);
      setModal(null);
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  }

  async function remove(p) {
    if (!window.confirm(`Remove ${p.name} from the member directory? This does not affect any chit they're already part of.`)) return;
    try { await deletePerson(p.id); toast.success('Removed'); load(); } catch (e) { toast.error('Failed: ' + e.message); }
  }

  const filtered = persons.filter(p => {
    const q = search.trim().toLowerCase();
    return !q || [p.name, p.phone, p.aadhaar].some(v => String(v || '').toLowerCase().includes(q));
  });

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: tokens.textSub }}>Loading members…</div>;

  return (
    <div>
      <PageHeader title="Members" subtitle="Shared member directory — one enrollment, usable across multiple chits (formed chits only)"
        action={<Button onClick={openAdd}>+ Enroll Member</Button>} />

      <Card>
        <div style={{ marginBottom: 16 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, Aadhaar…"
            style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${tokens.border}`, fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: tokens.textSub }}>No members enrolled yet — click "+ Enroll Member" to add your first one.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${tokens.border}`, flexWrap: 'wrap' }}>
                {p.photo ? <img src={p.photo} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#007AFF,#5856D6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(p.name || '?')[0].toUpperCase()}</div>}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: tokens.textSub }}>{p.phone}{p.aadhaar ? ' · Aadhaar: ' + p.aadhaar : ''}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setReportPerson(p)}>Full History</Button>
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>Edit</Button>
                <button onClick={() => remove(p)} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${tokens.red}30`, background: `${tokens.red}0a`, color: tokens.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Enroll / Edit modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Enroll New Member' : 'Edit Member'} width={640}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Member'}</Button></>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          {photoPreview ? <img src={photoPreview} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: tokens.slateLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: tokens.textMuted }}>👤</div>}
          <label style={{ fontSize: 12.5, fontWeight: 600, color: tokens.blue, cursor: 'pointer' }}>
            {photoPreview ? 'Change Photo' : 'Upload Photo'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Full Name" required><Input value={form.name} onChange={e => set('name', e.target.value)} /></FormField>
          <FormField label="Mobile Number" required><Input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" /></FormField>
          <FormField label="Aadhaar / ID Number"><Input value={form.aadhaar} onChange={e => set('aadhaar', e.target.value)} /></FormField>
          <FormField label="Proof Document">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', borderRadius: 9, border: `1px dashed ${tokens.border}`, cursor: 'pointer', fontSize: 12.5, color: (proofFile || existingProof) ? tokens.green : tokens.textSub }}>
              {proofFile ? `✓ ${proofFile.name}` : existingProof ? '✓ Uploaded — tap to replace' : '📎 Upload Aadhaar/ID scan'}
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => e.target.files[0] && setProofFile(e.target.files[0])} />
            </label>
          </FormField>
        </div>
        <div style={{ marginTop: 12 }}><FormField label="Address"><Textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2} /></FormField></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <FormField label="Nominee Name"><Input value={form.nomineeName} onChange={e => set('nomineeName', e.target.value)} /></FormField>
          <FormField label="Nominee Phone"><Input value={form.nomineePhone} onChange={e => set('nomineePhone', e.target.value)} type="tel" /></FormField>
          <FormField label="Guardian Name"><Input value={form.guardianName} onChange={e => set('guardianName', e.target.value)} /></FormField>
          <FormField label="Guardian Phone"><Input value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} type="tel" /></FormField>
        </div>
        <div style={{ marginTop: 12 }}><FormField label="Notes"><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></FormField></div>
      </Modal>

      {/* Individual cross-chit history report */}
      {reportPerson && <MemberReportModal person={reportPerson} onClose={() => setReportPerson(null)} />}
    </div>
  );
}

function MemberReportModal({ person, onClose }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);

  useEffect(() => {
    getPersonChitHistory(person.id, user.uid).then(setRows).catch(() => setRows([]));
  }, [person.id, user.uid]);

  const active = (rows || []).filter(r => r.status !== 'Taken');
  const closed = (rows || []).filter(r => r.status === 'Taken');
  const totalPaid = (rows || []).reduce((s, r) => s + r.payments.filter(p => p.paymentStatus === 'Paid').reduce((a, p) => a + (p.netPayable || 0), 0), 0);

  return (
    <Modal open onClose={onClose} title={`${person.name} — Full Chit History`} width={720}
      footer={<Button full onClick={onClose}>Close</Button>}>
      {rows === null ? (
        <div style={{ padding: 30, textAlign: 'center', color: tokens.textSub }}>Loading history…</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 18 }}>
            {[
              { l: 'Total Chits', v: rows.length, c: tokens.blue },
              { l: 'Active', v: active.length, c: tokens.green },
              { l: 'Taken/Closed', v: closed.length, c: tokens.purple },
              { l: 'Total Collected', v: fmt(totalPaid), c: tokens.green },
            ].map((s, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: `${s.c}0d`, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: tokens.textMuted, fontWeight: 700, textTransform: 'uppercase' }}>{s.l}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          {rows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: tokens.textSub }}>Not a member of any formed chit yet.</div>}

          {rows.map(r => (
            <div key={r.id} style={{ border: `1px solid ${tokens.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: r.status === 'Taken' ? 'rgba(88,86,214,0.06)' : 'rgba(52,199,89,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{r.chit?.companyName || 'Unknown chit'}</span>
                  <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 99, background: r.status === 'Taken' ? 'rgba(88,86,214,0.15)' : 'rgba(52,199,89,0.15)', color: r.status === 'Taken' ? '#5B21B6' : '#1a7a34', fontWeight: 600 }}>
                    {r.status === 'Taken' ? 'Taken / Closed' : 'Active'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: tokens.textSub }}>
                  {r.chit && `Chit Value: ${fmt(r.chit.totalChitValue)} · ${r.chit.totalMembers} members`}
                </div>
              </div>
              {r.payments.length > 0 ? (
                <div style={{ padding: '8px 14px' }}>
                  {r.payments.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < r.payments.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
                      <span style={{ fontSize: 11.5, color: tokens.textMuted, width: 70, flexShrink: 0 }}>Round #{p.auctionNumber}</span>
                      <span style={{ flex: 1, fontSize: 12.5 }}>{fmtDate(p.auctionDate)}{p.isWinner ? ' · 🏆 Winner this round' : ''}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.paymentStatus === 'Paid' ? 'rgba(52,199,89,0.15)' : 'rgba(255,149,0,0.15)', color: p.paymentStatus === 'Paid' ? '#1a7a34' : '#92400E' }}>{p.paymentStatus}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tokens.text, minWidth: 80, textAlign: 'right' }}>{fmt(p.netPayable)}</span>
                    </div>
                  ))}
                </div>
              ) : <div style={{ padding: '10px 14px', fontSize: 12, color: tokens.textSub }}>No payment records yet for this chit.</div>}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
