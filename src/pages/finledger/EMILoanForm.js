import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { uploadDocumentFile, openDocument } from '../../utils/fileStore';
import { saveEmiDocs, getEmiDocs } from '../../utils/emiFiles';
import { syncGuardianAsUser } from '../../utils/guardianSync';
import toast from 'react-hot-toast';
import { Button, FormField, Input, Select, Card, PageHeader, SectionHeader, InfoRow, Divider, formatCurrency } from '../../components/finledger/UI';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';
import { calcEMI, buildSchedule, FREQ_LABEL } from '../../utils/emiHelpers';

function genId() { return 'EMI-' + Date.now().toString(36).toUpperCase(); }
function today() { return new Date().toISOString().split('T')[0]; }

const BLANK = {
  emiId: genId(), borrowerName: '', phone: '', email: '', address: '',
  guardianName: '', guardianPhone: '', guardianAddress: '',
  // Nominee details — simple, independent of the Guardian; just a name + mobile
  // for reports (same field pair used on the Borrower/Depositor forms).
  nomineeName: '', nomineePhone: '',
  loanAmount: '', interestRate: '', totalPeriods: '',
  frequency: 'monthly', loanDate: today(), emiStartDate: today(),
  dailyFineRate: '50',
  // Security Details — brought in line with the regular Borrower loan form,
  // which already has this section; EMI loans previously had nothing here at
  // all beyond the document uploads.
  securityType: 'Documents Collected', securityTypeOther: '', securityValue: '',
  status: 'Active', notes: '', photo: null, customerId: '',
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
  const [showAllPeriods, setShowAllPeriods] = useState(false);

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
        nomineeName: d.nomineeName || '', nomineePhone: d.nomineePhone || '',
        loanAmount: String(d.loanAmount ?? ''), interestRate: String(d.interestRate ?? ''), totalPeriods: String(d.totalPeriods ?? ''),
        frequency: d.frequency || 'monthly', loanDate: d.loanDate || today(), emiStartDate: d.emiStartDate || today(),
        dailyFineRate: String(d.dailyFineRate ?? '50'),
        securityType: d.securityType || 'Documents Collected', securityTypeOther: d.securityTypeOther || '',
        securityValue: d.securityValue || '',
        status: d.status || 'Active', notes: d.notes || '', photo: d.photo || null,
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
  const coverage = form.securityValue && form.loanAmount ? ((parseFloat(form.securityValue) / parseFloat(form.loanAmount)) * 100).toFixed(0) : null;
  const adequate = coverage && parseFloat(coverage) >= 100;

  // EMI Schedule preview — same idea as the Borrower/Depositor forms' schedule
  // cards, built from the shared buildSchedule() helper (the same one the
  // actual EMI Loans/Collect EMI pages use) so the preview here always matches
  // what the real schedule will look like once the loan is created.
  const schedule = (form.emiStartDate && form.totalPeriods)
    ? buildSchedule({ frequency: form.frequency, emiStartDate: form.emiStartDate, totalPeriods: parseInt(form.totalPeriods) || 0 })
    : [];
  const displaySchedule = showAllPeriods ? schedule : schedule.slice(0, 6);

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
        securityValue: parseFloat(form.securityValue) || 0,
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Photo Upload — its own card, same as the Borrower loan form */}
          <Card style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(118,118,128,0.1)', border: '2px dashed rgba(0,122,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {photoPreview
                  ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,122,255,0.5)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Borrower Photo</p>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--accent)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  {photoPreview ? 'Change Photo' : 'Upload Photo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
                </label>
                {photoPreview && <button type="button" onClick={removePhoto} style={{ marginLeft: 8, fontSize: 11, color: '#ff3b30', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>}
              </div>
            </div>
          </Card>

          {/* Loan Details */}
          <Card>
            <SectionHeader title="Loan Details" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="EMI ID"><Input value={form.emiId} disabled style={{ color: 'var(--accent)', fontWeight: 600 }} /></FormField>
              <FormField label="Status"><Select value={form.status} onChange={e => set('status', e.target.value)}><option>Active</option><option>Non-Active</option><option>Closed</option></Select></FormField>

              {!isEdit && (
                <div style={{ gridColumn: '1/-1', marginBottom: 4, padding: '14px 16px', background: linkedUser ? 'rgba(52,199,89,0.06)' : 'rgba(0,122,255,0.05)', border: linkedUser ? '1.5px solid rgba(52,199,89,0.3)' : '1.5px dashed rgba(0,122,255,0.3)', borderRadius: 12 }}>
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

              <FormField label="Borrower Name" required><Input value={form.borrowerName} onChange={e => set('borrowerName', e.target.value)} placeholder="Full name" disabled={!!linkedUser} /></FormField>
              <FormField label="Phone Number" required><Input value={form.phone} onChange={e => set('phone', e.target.value)} type="tel" placeholder="9876543210" /></FormField>
              <FormField label="Email Address"><Input value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="email@example.com" /></FormField>
              <FormField label="Loan Amount (₹)" required><Input type="number" value={form.loanAmount} onChange={e => set('loanAmount', e.target.value)} placeholder="50000" min="1" /></FormField>
              <FormField label="Interest Rate (% per month)" required><Input type="number" value={form.interestRate} onChange={e => set('interestRate', e.target.value)} placeholder="2" step="any" min="0" /></FormField>
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
            </div>
            <div style={{ marginTop: 12 }}>
              <FormField label="Full Address"><Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Door no, street, city" /></FormField>
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Nominee Name"><Input value={form.nomineeName} onChange={e => set('nomineeName', e.target.value)} placeholder="Nominee full name" /></FormField>
              <FormField label="Nominee Mobile Number"><Input value={form.nomineePhone} onChange={e => set('nomineePhone', e.target.value)} placeholder="9876543210" type="tel" /></FormField>
            </div>
            <div style={{ marginTop: 12 }}>
              <FormField label="Notes / Terms">
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes or terms"
                  style={{ padding: '10px 12px', background: 'rgba(118,118,128,0.08)', border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 10, fontSize: 14, color: 'var(--text-primary)', outline: 'none', width: '100%', minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                  onFocus={e => { e.target.style.borderColor = '#007aff'; e.target.style.boxShadow = '0 0 0 3px rgba(0,122,255,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.08)'; e.target.style.boxShadow = 'none'; }} />
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
          </Card>

          {/* Guardian Details — same searchable picker as the regular Borrower
              loan form, kept in its own card for the same visual alignment. */}
          <Card>
            <SectionHeader title="Guardian Details" action={<span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Optional</span>} />
            <div style={{ padding: '14px 16px', background: guardianLinked ? 'rgba(88,86,214,0.06)' : 'rgba(118,118,128,0.05)', border: guardianLinked ? '1.5px solid rgba(88,86,214,0.3)' : '1.5px dashed rgba(0,0,0,0.15)', borderRadius: 12, marginBottom: form.guardianName ? 12 : 0 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FormField label="Guardian Mobile"><Input value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} type="tel" placeholder="9876543210" /></FormField>
                <FormField label="Guardian Address"><Input value={form.guardianAddress} onChange={e => set('guardianAddress', e.target.value)} placeholder="Guardian's address" /></FormField>
              </div>
            )}
          </Card>

          {/* Security Details — brand new for EMI loans, matching the regular
              Borrower loan form's section exactly (type, value, coverage check). */}
          <Card>
            <SectionHeader title="Security Details" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Security Type">
                <Select value={form.securityType} onChange={e => set('securityType', e.target.value)}>
                  <option>Documents Collected</option>
                  <option>Property Registered to Company</option>
                  <option>Gold</option>
                  <option>Vehicle</option>
                  <option>Other</option>
                </Select>
              </FormField>
              <FormField label="Security Value (₹)"><Input value={form.securityValue} onChange={e => set('securityValue', e.target.value)} placeholder="1000000" type="number" min="0" /></FormField>
            </div>
            {form.securityType === 'Other' && (
              <div style={{ marginTop: 12 }}>
                <FormField label="Specify Security Type" required>
                  <Input value={form.securityTypeOther} onChange={e => set('securityTypeOther', e.target.value)} placeholder="e.g. Fixed Deposit, Machinery, Jewellery…" />
                </FormField>
              </div>
            )}
            {coverage && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: adequate ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.08)', border: `1px solid ${adequate ? 'rgba(52,199,89,0.2)' : 'rgba(255,59,48,0.2)'}` }}>
                <p style={{ fontSize: 13, color: adequate ? '#1a7a34' : '#c0392b', fontWeight: 600 }}>
                  {adequate ? '✓' : '⚠'} Security Coverage: {coverage}% — {adequate ? 'Adequate' : 'Insufficient'}
                </p>
              </div>
            )}
          </Card>

          {/* Security Documents */}
          <Card>
            <SectionHeader title="Security Documents" />
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>All documents are optional — upload if collected</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FileUpload label="Check Copy" existing={existingDocs.check} onChange={f => setDocFiles(p => ({ ...p, check: f }))} onView={() => openDocument(existingDocs.check, 'Check Copy')} />
              <FileUpload label="Bond Copy" existing={existingDocs.bond} onChange={f => setDocFiles(p => ({ ...p, bond: f }))} onView={() => openDocument(existingDocs.bond, 'Bond Copy')} />
              <FileUpload label="Agreement Copy" existing={existingDocs.agreement} onChange={f => setDocFiles(p => ({ ...p, agreement: f }))} onView={() => openDocument(existingDocs.agreement, 'Agreement')} />
            </div>
          </Card>

          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create EMI Loan'}</Button>
            <Button variant="secondary" onClick={() => nav('/fl/emi-loans')}>Cancel</Button>
          </div>
        </div>

        {/* Summary + Schedule sidebar — same layout as the Borrower/Depositor forms */}
        <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionHeader title="Loan Summary" />
            <InfoRow label="Loan Amount" value={form.loanAmount ? formatCurrency(parseFloat(form.loanAmount)) : '—'} />
            <InfoRow label="Interest Rate" value={form.interestRate ? `${form.interestRate}%/mo` : '—'} color="#ff9500" />
            <InfoRow label="Frequency" value={FREQ_LABEL[form.frequency] || '—'} />
            <InfoRow label="Total Periods" value={form.totalPeriods || '—'} />
            <InfoRow label="Security Value" value={form.securityValue ? formatCurrency(parseFloat(form.securityValue)) : '—'} color="#5856d6" />
            {coverage && <InfoRow label="Coverage" value={`${coverage}%`} color={adequate ? '#34c759' : '#ff3b30'} />}
            {form.guardianName && <InfoRow label="Guardian" value={form.guardianName} />}
            {form.nomineeName && <InfoRow label="Nominee" value={form.nomineePhone ? `${form.nomineeName} · ${form.nomineePhone}` : form.nomineeName} />}
            <Divider />
            <div style={{ marginTop: 4, padding: '14px', background: 'rgba(0,122,255,0.06)', borderRadius: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginBottom: 4 }}>{FREQ_LABEL[form.frequency] || 'Monthly'} EMI Amount</p>
              <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>{emi > 0 ? formatCurrency(emi) : '₹0'}</p>
            </div>
          </Card>

          {schedule.length > 0 && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>EMI Schedule</p>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{schedule.length} periods total</p>
              </div>
              {displaySchedule.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 10px', borderRadius: 9, background: i % 2 === 0 ? 'rgba(118,118,128,0.04)' : 'transparent', marginBottom: 2 }}>
                  <div>
                    <p style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{p.dueDate}</p>
                    <p style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Period #{p.periodNo}</p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{formatCurrency(emi)}</span>
                </div>
              ))}
              {schedule.length > 6 && (
                <button type="button" onClick={() => setShowAllPeriods(s => !s)}
                  style={{ width: '100%', padding: '8px', background: 'none', border: '1px solid rgba(0,122,255,0.2)', borderRadius: 8, color: 'var(--accent)', fontSize: 12, cursor: 'pointer', marginTop: 6, fontFamily: 'inherit' }}>
                  {showAllPeriods ? 'Show Less' : 'Show All ' + schedule.length + ' Periods'}
                </button>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FileUpload({ label, existing, onChange, onView }) {
  const [name, setName] = useState('');
  const hasFile = !!name || !!existing;
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: hasFile ? 'rgba(52,199,89,0.06)' : 'rgba(118,118,128,0.06)', border: `1.5px dashed ${hasFile ? '#34c759' : 'rgba(0,0,0,0.15)'}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasFile ? '#34c759' : '#6e6e73'} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
        <span style={{ fontSize: 13, color: hasFile ? '#34c759' : '#6e6e73', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || (existing ? '✓ Uploaded' : `Upload ${label}`)}</span>
        <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) { setName(e.target.files[0].name); onChange(e.target.files[0]); } }} />
      </label>
      {existing && !name && <button type="button" onClick={onView} style={{ color: 'var(--accent)', fontSize: 11, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>View existing →</button>}
    </div>
  );
}
