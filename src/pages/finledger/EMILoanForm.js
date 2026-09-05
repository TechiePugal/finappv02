import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { uploadDocumentFile } from '../../utils/fileStore';
import { saveEmiDocs, getEmiDocs } from '../../utils/emiFiles';
import { syncGuardianAsUser } from '../../utils/guardianSync';
import toast from 'react-hot-toast';
import { Button, FormField, Input, Select, Card, PageHeader, SectionHeader, Divider, formatCurrency } from '../../components/finledger/UI';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';

function genId() { return 'EMI-' + Date.now().toString(36).toUpperCase(); }
function today() { return new Date().toISOString().split('T')[0]; }

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

// Same EMI math used on the EMI Loans list page — kept identical so the
// preview shown here always matches what actually gets created.
function calcEMI(principal, rate, periods, frequency) {
  const P = parseFloat(principal) || 0, n = parseInt(periods) || 1;
  const periodRate = (parseFloat(rate) || 0) / 100; // rate is per-month already
  const periodsPerMonth = frequency === 'daily' ? 30 : frequency === 'weekly' ? 4.33 : 1;
  const r = periodRate / periodsPerMonth;
  if (r === 0) return P / n;
  const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return emi;
}

const BLANK = {
  emiId: genId(), borrowerName: '', phone: '', email: '', address: '',
  guardianName: '', guardianPhone: '', guardianAddress: '',
  loanAmount: '', interestRate: '', totalPeriods: '',
  frequency: 'monthly', loanDate: today(), emiStartDate: today(),
  dailyFineRate: '50', status: 'Active', notes: '', photo: null, customerId: '',
};

export default function EMILoanForm() {
  const { user } = useAuth();
  const { id } = useParams(); const nav = useNavigate(); const isEdit = !!id;
  const [form, setForm] = useState(BLANK);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [docFiles, setDocFiles] = useState({});
  const [existingDocs, setExistingDocs] = useState({});
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  const [custs, setCusts] = useState([]);
  const [custQ, setCustQ] = useState('');
  const [linkedUser, setLinkedUser] = useState(null);
  const [guardianQ, setGuardianQ] = useState('');
  const [guardianLinked, setGuardianLinked] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'customer_master')).then(s => setCusts(scopeToUser(s.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const s = await getDoc(doc(db, 'emi_loans', id));
      if (!s.exists()) { toast.error('EMI loan not found'); nav('/fl/emi-loans'); return; }
      const d = s.data();
      setForm({
        emiId: d.emiId || '', borrowerName: d.borrowerName || '', phone: d.phone || '', email: d.email || '', address: d.address || '',
        guardianName: d.guardianName || '', guardianPhone: d.guardianPhone || '', guardianAddress: d.guardianAddress || '',
        loanAmount: String(d.loanAmount ?? ''), interestRate: String(d.interestRate ?? ''), totalPeriods: String(d.totalPeriods ?? ''),
        frequency: d.frequency || 'monthly', loanDate: d.loanDate || today(), emiStartDate: d.emiStartDate || today(),
        dailyFineRate: String(d.dailyFineRate ?? '50'), status: d.status || 'Active', notes: d.notes || '', photo: d.photo || null,
        customerId: d.customerId || '',
      });
      setPhotoPreview(d.photo || null);
      if (d.customerId) setLinkedUser({ id: d.customerId, name: d.borrowerName, phone: d.phone, customerId: d.customerId });
      const fileDocs = await getEmiDocs(id).catch(() => ({}));
      setExistingDocs(fileDocs);
      setLoadingEdit(false);
    })();
  }, [id]); //eslint-disable-line

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handlePhoto(file) {
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = e => setPhotoPreview(e.target.result);
    reader.readAsDataURL(file);
  }
  function removePhoto() { setPhotoFile(null); setPhotoPreview(null); set('photo', null); }

  const emi = (form.loanAmount && form.interestRate && form.totalPeriods)
    ? Math.round(calcEMI(form.loanAmount, form.interestRate, form.totalPeriods, form.frequency))
    : 0;

  async function save() {
    if (!isEdit && !form.customerId) return toast.error('Select an existing User first — EMI loans can only be created for a linked User.');
    if (form.guardianPhone && form.phone && form.guardianPhone.trim() === form.phone.trim())
      return toast.error('The Guardian must be a different person from the borrower — they cannot share the same phone number.');
    if (!form.borrowerName || !form.phone || !form.loanAmount || !form.interestRate || !form.totalPeriods || !form.loanDate || !form.emiStartDate)
      return toast.error('Fill all required fields (Name, Phone, Amount, Rate, Periods, Dates)');
    setSaving(true);
    try {
      const emiCalc = calcEMI(form.loanAmount, form.interestRate, form.totalPeriods, form.frequency);
      const photoUrl = photoFile ? (await uploadDocumentFile(photoFile)).dataUrl : (photoPreview || null);
      const data = {
        ...form, photo: photoUrl,
        loanAmount: parseFloat(form.loanAmount),
        interestRate: parseFloat(form.interestRate),
        totalPeriods: parseInt(form.totalPeriods),
        emiAmount: Math.round(emiCalc),
        dailyFineRate: parseFloat(form.dailyFineRate) || 50,
        updatedAt: serverTimestamp(),
      };
      const toDataUrl = async (file) => { if (!file) return null; const r = await uploadDocumentFile(file); return r.dataUrl; };
      const [checkUrl, bondUrl, agreementUrl] = await Promise.all([
        docFiles.check ? toDataUrl(docFiles.check) : Promise.resolve(existingDocs.check || null),
        docFiles.bond ? toDataUrl(docFiles.bond) : Promise.resolve(existingDocs.bond || null),
        docFiles.agreement ? toDataUrl(docFiles.agreement) : Promise.resolve(existingDocs.agreement || null),
      ]);
      let savedLoanId = isEdit ? id : null;
      if (isEdit) {
        await updateDoc(doc(db, 'emi_loans', id), data);
        toast.success('EMI Loan updated!');
      } else {
        data.paidPeriods = 0;
        data.createdAt = serverTimestamp();
        data.createdBy = user?.uid || null;
        const ref = await addDoc(collection(db, 'emi_loans'), data);
        savedLoanId = ref.id;
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Created',
          description: `EMI loan created — ${form.borrowerName} · ${form.emiId || ref.id}`,
          amount: parseFloat(form.loanAmount) || 0, date: form.loanDate || today(),
          borrowerName: form.borrowerName, loanId: ref.id, emiId: form.emiId || ref.id,
          createdAt: serverTimestamp(), createdBy: user?.uid || null,
        });
        toast.success('EMI Loan created!');
      }
      if (savedLoanId) await saveEmiDocs(savedLoanId, { check: checkUrl, bond: bondUrl, agreement: agreementUrl });
      // Guardian → also register as a User, if name+phone were entered
      await syncGuardianAsUser(form.guardianName, form.guardianPhone, form.guardianAddress, user?.uid);
      nav('/fl/emi-loans');
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  if (loadingEdit) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;

  return (
    <div className="page-enter">
      <PageHeader title={isEdit ? 'Edit EMI Loan' : 'Create New EMI Loan'} subtitle={isEdit ? form.borrowerName : 'Set up a new instalment loan for a linked User'} back onBack={() => nav('/fl/emi-loans')} />

      <Card>
        {/* Photo upload strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '14px 16px', background: 'rgba(0,122,255,0.04)', borderRadius: 12, border: '1px solid rgba(0,122,255,0.1)' }}>
          <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'rgba(118,118,128,0.08)', border: '2.5px dashed rgba(0,122,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {photoPreview
              ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(0,122,255,0.4)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Borrower Photo</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Clear face photo (JPG/PNG, max 2MB)</p>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              {photoPreview ? 'Change Photo' : 'Upload Photo'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
            </label>
            {photoPreview && (
              <button type="button" onClick={removePhoto} style={{ marginLeft: 10, fontSize: 12, color: '#ff3b30', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
            )}
          </div>
        </div>

        {/* User picker */}
        {!isEdit && (
          <div style={{ marginBottom: 16, padding: '14px 16px', background: linkedUser ? 'rgba(52,199,89,0.06)' : 'rgba(0,122,255,0.05)', border: linkedUser ? '1.5px solid rgba(52,199,89,0.3)' : '1.5px dashed rgba(0,122,255,0.3)', borderRadius: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: linkedUser ? '#248a3d' : '#0a84ff', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              {linkedUser ? '✓ Linked to User' : 'Step 1 — Select the User'}
            </div>
            {linkedUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#34c759,#30b0c7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(linkedUser.name || '?')[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{linkedUser.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{linkedUser.phone} · {linkedUser.customerId}</div>
                </div>
                <button type="button" onClick={() => { setLinkedUser(null); set('borrowerName', ''); set('phone', ''); set('customerId', ''); }} style={{ fontSize: 12, color: '#ff3b30', background: 'none', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Change</button>
              </div>
            ) : (
              <>
                <input value={custQ} onChange={e => setCustQ(e.target.value)} placeholder="Search by user name, phone or ID…" style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                {custQ.trim() && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {custs.filter(cc => [cc.name, cc.phone, cc.customerId].some(v => String(v || '').toLowerCase().includes(custQ.trim().toLowerCase()))).slice(0, 6).map(cc => (
                      <div key={cc.id} onClick={() => { setLinkedUser(cc); set('borrowerName', cc.name || ''); set('phone', cc.phone || ''); set('customerId', cc.id); setCustQ(''); }} style={{ padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.08)', cursor: 'pointer', fontSize: 13 }}>
                        <strong>{cc.name}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>· {cc.phone} · {cc.customerId}</span>
                      </div>))}
                    {custs.filter(cc => [cc.name, cc.phone, cc.customerId].some(v => String(v || '').toLowerCase().includes(custQ.trim().toLowerCase()))).length === 0 && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 2px' }}>No matching user. <a href="/fl/customers" style={{ color: '#0a84ff' }}>Enroll a new User first →</a></div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <SectionHeader title="Borrower Details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <FormField label="EMI ID"><Input value={form.emiId} disabled style={{ color: 'var(--accent)', fontWeight: 600 }} /></FormField>
          <FormField label="Status">
            <Select value={form.status} onChange={e => set('status', e.target.value)}>
              <option>Active</option><option>Closed</option>
            </Select>
          </FormField>
          <FormField label="Borrower Name" required>
            <Input value={form.borrowerName} onChange={e => set('borrowerName', e.target.value)} placeholder="Full name" disabled={!!linkedUser} />
          </FormField>
          <FormField label="Phone Number" required>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" placeholder="9876543210" />
          </FormField>
          <FormField label="Email Address">
            <Input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="email@example.com" />
          </FormField>
        </div>
        <FormField label="Full Address">
          <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Door no, street, city" />
        </FormField>

        <Divider label="Guardian Details (Optional — searchable, must be a different person)" />
        <div style={{ padding: '14px 16px', background: guardianLinked ? 'rgba(88,86,214,0.06)' : 'rgba(118,118,128,0.05)', border: guardianLinked ? '1.5px solid rgba(88,86,214,0.3)' : '1.5px dashed rgba(0,0,0,0.15)', borderRadius: 12, marginBottom: form.guardianName ? 12 : 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: guardianLinked ? '#5856d6' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            {guardianLinked ? '✓ Linked to User' : 'Search or add a Guardian'}
          </div>
          {guardianLinked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#5856d6,#af52de)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, flexShrink: 0 }}>{(guardianLinked.name || '?')[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{guardianLinked.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{guardianLinked.phone}{guardianLinked.customerId ? ' · ' + guardianLinked.customerId : ''}</div>
              </div>
              <button type="button" onClick={() => { setGuardianLinked(null); set('guardianName', ''); set('guardianPhone', ''); }} style={{ fontSize: 12, color: '#ff3b30', background: 'none', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Change</button>
            </div>
          ) : (
            <>
              <input value={guardianQ} onChange={e => { setGuardianQ(e.target.value); set('guardianName', e.target.value); }} placeholder="Search existing user, or type a new name…" style={{ width: '100%', boxSizing: 'border-box', height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.12)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              {guardianQ.trim() && (() => {
                const matches = custs.filter(cc => cc.id !== form.customerId && [cc.name, cc.phone, cc.customerId].some(v => String(v || '').toLowerCase().includes(guardianQ.trim().toLowerCase())));
                return (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {matches.slice(0, 6).map(cc => {
                      const isSamePerson = cc.phone && form.phone && cc.phone === form.phone;
                      return (
                        <div key={cc.id} onClick={() => {
                          if (isSamePerson) { toast.error("The Guardian must be a different person from the borrower."); return; }
                          setGuardianLinked(cc); set('guardianName', cc.name || ''); set('guardianPhone', cc.phone || ''); setGuardianQ('');
                        }} style={{ padding: '8px 10px', borderRadius: 8, background: isSamePerson ? 'rgba(255,59,48,0.04)' : '#fff', border: `1px solid ${isSamePerson ? 'rgba(255,59,48,0.25)' : 'rgba(0,0,0,0.08)'}`, cursor: isSamePerson ? 'not-allowed' : 'pointer', fontSize: 13, opacity: isSamePerson ? 0.6 : 1 }}>
                          <strong>{cc.name}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: 11.5 }}>· {cc.phone}{cc.customerId ? ' · ' + cc.customerId : ''}</span>
                          {isSamePerson && <span style={{ marginLeft: 6, fontSize: 11, color: '#ff3b30', fontWeight: 600 }}>Same as borrower — can't select</span>}
                        </div>
                      );
                    })}
                    {matches.length === 0 && (
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', padding: '8px 2px' }}>No matching user. Keep typing the full name and phone below to add them as a new Guardian.</div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
        {form.guardianName && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <FormField label="Guardian Phone">
              <Input value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} type="tel" placeholder="9876543210" />
            </FormField>
            <FormField label="Guardian Address">
              <Input value={form.guardianAddress} onChange={e => set('guardianAddress', e.target.value)} placeholder="Guardian's address" />
            </FormField>
          </div>
        )}

        <Divider label="Loan Details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Loan Amount (₹)" required>
            <Input type="number" value={form.loanAmount} onChange={e => set('loanAmount', e.target.value)} placeholder="50000" min="1" />
          </FormField>
          <FormField label="Interest Rate (% per month)" required>
            <Input type="number" value={form.interestRate} onChange={e => set('interestRate', e.target.value)} placeholder="2" step="any" min="0" />
          </FormField>
          <FormField label="EMI Frequency" required>
            <Select value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </FormField>
          <FormField label={`Total ${FREQ_LABEL[form.frequency] || 'Monthly'} Payments`} required hint="Number of EMIs to collect">
            <Input type="number" value={form.totalPeriods} onChange={e => set('totalPeriods', e.target.value)}
              placeholder={form.frequency === 'daily' ? '365' : form.frequency === 'weekly' ? '52' : '12'} min="1" />
          </FormField>
          <FormField label="Loan Date" required hint="Date money was disbursed">
            <Input type="date" value={form.loanDate} onChange={e => set('loanDate', e.target.value)} />
          </FormField>
          <FormField label="First EMI Due Date" required hint="When first EMI payment is due">
            <Input type="date" value={form.emiStartDate} onChange={e => set('emiStartDate', e.target.value)} />
          </FormField>
          <FormField label="Daily Fine Rate (₹)" hint="Fine per day after 2-day grace period">
            <Input type="number" value={form.dailyFineRate} onChange={e => set('dailyFineRate', e.target.value)} placeholder="50" min="0" />
          </FormField>
          <FormField label="Notes / Terms">
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes or terms" />
          </FormField>
        </div>

        {emi > 0 && (
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'linear-gradient(135deg,rgba(0,122,255,0.08),rgba(88,86,214,0.06))', borderRadius: 12, border: '1px solid rgba(0,122,255,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{FREQ_LABEL[form.frequency] || 'Monthly'} EMI Amount</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.5px' }}>{formatCurrency(emi)}</span>
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>Total repayable: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(emi * (parseInt(form.totalPeriods) || 0))}</strong></span>
              <span>Principal: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(parseFloat(form.loanAmount) || 0)}</strong></span>
              <span>Interest: <strong style={{ color: '#ff9500' }}>{formatCurrency(Math.max(0, emi * (parseInt(form.totalPeriods) || 0) - (parseFloat(form.loanAmount) || 0)))}</strong></span>
            </div>
          </div>
        )}

        {/* Security Documents — moved to the end, matching the Borrower form's layout */}
        <Divider label="Security Documents (Optional)" />
        <div style={{ marginBottom: 8, padding: '14px 16px', background: 'rgba(118,118,128,0.04)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Upload check/bond/agreement copies if collected for this EMI loan.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
            {[['check', 'Check Copy'], ['bond', 'Bond Copy'], ['agreement', 'Agreement']].map(([key, label]) => {
              const has = docFiles?.[key] || existingDocs?.[key];
              return (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', borderRadius: 9, border: `1px solid ${has ? 'rgba(52,199,89,0.3)' : 'rgba(0,0,0,0.08)'}`, background: has ? 'rgba(52,199,89,0.05)' : '#fff', cursor: 'pointer', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: has ? '#1a7a34' : 'var(--text-secondary)' }}>{has ? `✓ ${label}` : label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{has ? 'Uploaded' : 'Tap to upload'}</span>
                  <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => e.target.files[0] && setDocFiles(p => ({ ...p, [key]: e.target.files[0] }))} />
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create EMI Loan'}</Button>
          <Button variant="secondary" onClick={() => nav('/fl/emi-loans')}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
}
