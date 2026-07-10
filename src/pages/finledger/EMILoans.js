import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, serverTimestamp
,getDocs} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { uploadDocumentFile } from '../../utils/fileStore';
import toast from 'react-hot-toast';
import {printEMILoansSummary, printEMILoanReport} from '../../utils/pdfReport';
import {saveEmiDocs, getEmiDocs} from '../../utils/emiFiles';
import {
  PageHeader, Card, StatCard, Button, Modal, FormField, Input, Select,
  SectionHeader, Badge, FilterTabs, SearchBar, formatCurrency, Divider
} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';

// ── Pure helpers (no closures over component state) ────────────────────────

function genId() { return 'EMI-' + Date.now().toString(36).toUpperCase(); }
function today() { return new Date().toISOString().split('T')[0]; }

const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FREQ_FACTOR = { daily: 30, weekly: 4.33, monthly: 1 };

function calcEMI(principal, rate, periods, freq) {
  // Flat monthly model: each period repays equal principal + flat interest on the ORIGINAL principal.
  // e.g. 10000 @ 2%/mo over 10 = 1000 principal + 200 interest = 1200/period.
  const p = parseFloat(principal) || 0;
  const r = parseFloat(rate) || 0;
  const n = parseInt(periods) || 1;
  const interestPerPeriod = p * (r / 100);
  return (p / n) + interestPerPeriod;
}
function emiPrincipalPerPeriod(loan) { const n = parseInt(loan.totalPeriods) || 1; return (parseFloat(loan.loanAmount) || 0) / n; }
function emiInterestPerPeriod(loan) { return (parseFloat(loan.loanAmount) || 0) * ((parseFloat(loan.interestRate) || 0) / 100); }

function buildSchedule(loan) {
  const { frequency, emiStartDate, totalPeriods } = loan;
  if (!emiStartDate || !totalPeriods) return [];
  const start = new Date(emiStartDate);
  const out = [];
  for (let i = 1; i <= totalPeriods; i++) {
    const d = new Date(start);
    if (frequency === 'daily')        d.setDate(d.getDate() + (i - 1));
    else if (frequency === 'weekly')  d.setDate(d.getDate() + (i - 1) * 7);
    else                              d.setMonth(d.getMonth() + (i - 1));
    out.push({ periodNo: i, dueDate: d.toISOString().split('T')[0] });
  }
  return out;
}

function getDaysOverdue(dueDate) {
  if (!dueDate) return 0;
  return Math.max(0, Math.floor((new Date() - new Date(dueDate)) / 86400000));
}

function calcFine(dueDate, dailyRate = 50) {
  const d = getDaysOverdue(dueDate);
  return d <= 2 ? 0 : (d - 2) * dailyRate;
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

const BLANK = {
  emiId: genId(), borrowerName: '', phone: '', email: '', address: '',
  guardianName: '', guardianPhone: '', guardianAddress: '',
  loanAmount: '', interestRate: '', totalPeriods: '',
  frequency: 'monthly', loanDate: today(), emiStartDate: today(),
  dailyFineRate: '50', status: 'Active', notes: '', photo: null,
};


// ── EMIScheduleRow — inline expandable schedule (rendered inside tbody) ────
function EMIScheduleRow({ loan, sched, cols, outstanding, onSelectSlot }) {
  const paidCount = cols.filter(c => c.periodNo).length;
  const overdueCount = sched.filter(s => { const col = cols.find(c=>c.periodNo===s.periodNo); return !col && s.overdue > 0; }).length;
  return (
    <tr>
      <td colSpan={10} style={{ padding:0, borderBottom:'2px solid rgba(0,122,255,0.15)', background:'rgba(0,122,255,0.02)' }}>
        <div style={{ padding:'16px 20px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:10, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
            <div>
              EMI Schedule — {loan.borrowerName}
              <span style={{ fontSize:11, fontWeight:400, color:'var(--text-secondary)', marginLeft:8 }}>
                Click any unpaid slot to collect it
              </span>
            </div>
            <div style={{ display:'flex', gap:14, fontSize:12, color:'var(--text-secondary)' }}>
              <span>✅ Paid: <strong style={{color:'#34c759'}}>{paidCount}</strong></span>
              <span>⚠ Overdue: <strong style={{color:'#ff3b30'}}>{overdueCount}</strong></span>
              <span>💰 Outstanding: <strong style={{color:'var(--accent)'}}>{formatCurrency(Math.round(outstanding))}</strong></span>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(115px,1fr))', gap:8 }}>
            {sched.map((slot, si) => {
              const colRec = cols.find(c => c.periodNo === slot.periodNo);
              const isPaid = !!colRec;
              const isNext = si === paidCount && !isPaid;
              const isFuture = si > paidCount;
              const od = slot.overdue;
              const fine = slot.fine;
              const bg = isPaid?'rgba(52,199,89,0.08)':od>0?'rgba(255,59,48,0.07)':isNext?'rgba(0,122,255,0.1)':'rgba(118,118,128,0.04)';
              const bdr = isPaid?'1.5px solid rgba(52,199,89,0.35)':od>0?'1.5px solid rgba(255,59,48,0.35)':isNext?'2px solid rgba(0,122,255,0.45)':'1px solid rgba(0,0,0,0.08)';
              const col = isPaid?'#34c759':od>0?'#ff3b30':isNext?'var(--accent)':'var(--text-secondary)';
              return (
                <div key={si}
                  onClick={() => { if(!isPaid && !isFuture) onSelectSlot(slot, false); }}
                  style={{ padding:'10px 10px', borderRadius:10, border:bdr, background:bg, cursor:isPaid||isFuture?'default':'pointer', transition:'all 0.15s', position:'relative', opacity:isFuture?0.45:1 }}
                  onMouseEnter={e=>{ if(!isPaid&&!isFuture) { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; } }}
                  onMouseLeave={e=>{ e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none'; }}
                  title={isPaid?('Paid on '+fmtDate(colRec?.date)):isFuture?'Future — cannot collect yet':'Click to collect this EMI'}
                >
                  {isNext && !isPaid && (
                    <div style={{ position:'absolute', top:-8, left:'50%', transform:'translateX(-50%)', background:'var(--accent)', color:'#fff', fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:99, whiteSpace:'nowrap' }}>NEXT DUE</div>
                  )}
                  <div style={{ fontSize:11, fontWeight:800, color:col, marginBottom:3 }}>#{slot.periodNo}</div>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', marginBottom:4 }}>{slot.dueDate}</div>
                  <div style={{ fontSize:12.5, fontWeight:700, color:col }}>{formatCurrency(Math.round(emiPrincipalPerPeriod(loan)+emiInterestPerPeriod(loan)))}</div>
                  <div style={{ fontSize:8.5, color:'var(--text-secondary)', marginTop:2, lineHeight:1.3 }}>P {formatCurrency(Math.round(emiPrincipalPerPeriod(loan)))} + I {formatCurrency(Math.round(emiInterestPerPeriod(loan)))}</div>
                  {isPaid && <div style={{ fontSize:9.5, color:'#34c759', marginTop:3 }}>✓ {fmtDate(colRec.date)}</div>}
                  {!isPaid && od>0 && <div style={{ fontSize:9.5, color:'#ff3b30', fontWeight:700, marginTop:3 }}>{od}d late{fine>0?` · Fine ₹${fine.toLocaleString('en-IN')}`:''}</div>}
                  {!isPaid && !isFuture && od===0 && <div style={{ fontSize:9.5, color:'var(--accent)', marginTop:3 }}>Tap to pay</div>}
                </div>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── PhotoAvatar — clickable to show full photo popup ──────────────────────
function PhotoAvatar({ src, name, size = 34, onClick }) {
  const letter = (name || '?')[0].toUpperCase();
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to view photo' : name}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        background: 'rgba(0,122,255,0.1)',
        border: src ? '2px solid rgba(0,122,255,0.2)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.38), fontWeight: 700, color: 'var(--accent)',
        transition: 'transform 0.15s',
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
    </div>
  );
}

// ── PhotoPopup — shows full photo in a centered overlay ───────────────────
function PhotoPopup({ src, name, onClose }) {
  if (!src) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <button onClick={onClose} /* photoCloseX */ style={{position:'absolute',top:-14,right:-14,width:32,height:32,borderRadius:'50%',background:'#fff',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(0,0,0,0.35)',zIndex:1,fontSize:15,fontWeight:700,color:'#111'}}>✕</button>
        <img
          src={src} alt={name}
          style={{
            maxWidth: 320, maxHeight: 320, borderRadius: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            border: '3px solid rgba(255,255,255,0.2)',
            display: 'block',
          }}
        />
        <div style={{ textAlign: 'center', marginTop: 12, color: '#fff', fontWeight: 600, fontSize: 15 }}>{name}</div>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: -12, right: -12,
            width: 30, height: 30, borderRadius: '50%',
            background: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >×</button>
      </div>
    </div>,
    document.body
  );
}

// ── LoanForm — defined OUTSIDE the main component (critical fix) ──────────
// This prevents remounting on every parent re-render, which was causing
// the modal to close when typing.
function LoanForm({ form, setForm, photoPreview, onPhotoChange, onPhotoRemove, docFiles, setDocFiles, existingDocs }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [custs, setCusts] = useState([]);
  const [custQ, setCustQ] = useState('');
  const [linkedUser, setLinkedUser] = useState(form.customerId ? { id: form.customerId, name: form.borrowerName, phone: form.phone, customerId: form.customerId } : null);
  useEffect(() => { getDocs(collection(db, 'customer_master')).then(s => setCusts(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {}); }, []);
  const emi = (form.loanAmount && form.interestRate && form.totalPeriods)
    ? Math.round(calcEMI(form.loanAmount, form.interestRate, form.totalPeriods, form.frequency))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

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
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && onPhotoChange(e.target.files[0])} />
          </label>
          {photoPreview && (
            <button type="button" onClick={onPhotoRemove} style={{ marginLeft: 10, fontSize: 12, color: '#ff3b30', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Optional documents — Check / Bond / Agreement copies (not mandatory for EMI loans) */}
      <div style={{ marginBottom: 20, padding: '14px 16px', background: 'rgba(118,118,128,0.04)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Security Documents <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(optional)</span></p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Upload check/bond/agreement copies if collected for this EMI loan.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
          {[['check','Check Copy'],['bond','Bond Copy'],['agreement','Agreement']].map(([key,label]) => {
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

      {/* User picker — Step 1: pick the User first */}
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
      {/* Borrower Details */}
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

      <Divider label="Guardian Details (Optional)" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <FormField label="Guardian Name">
          <Input value={form.guardianName} onChange={e => set('guardianName', e.target.value)} placeholder="Guardian's full name" />
        </FormField>
        <FormField label="Guardian Phone">
          <Input value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} type="tel" placeholder="9876543210" />
        </FormField>
      </div>
      <FormField label="Guardian Address">
        <Input value={form.guardianAddress} onChange={e => set('guardianAddress', e.target.value)} placeholder="Guardian's address" />
      </FormField>

      <Divider label="Loan Details" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FormField label="Loan Amount (₹)" required>
          <Input type="number" value={form.loanAmount} onChange={e => set('loanAmount', e.target.value)} placeholder="50000" min="1" />
        </FormField>
        <FormField label="Interest Rate (% per month)" required>
          <Input type="number" value={form.interestRate} onChange={e => set('interestRate', e.target.value)} placeholder="2" step="0.01" min="0" />
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

      {/* Live EMI preview */}
      {emi > 0 && (
        <div style={{ marginTop: 16, padding: '14px 18px', background: 'linear-gradient(135deg,rgba(0,122,255,0.08),rgba(88,86,214,0.06))', borderRadius: 12, border: '1px solid rgba(0,122,255,0.12)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{FREQ_LABEL[form.frequency] || 'Monthly'} EMI Amount</span>
            </div>
            <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent)', letterSpacing: '-0.5px' }}>{formatCurrency(emi)}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>Total repayable: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(emi * (parseInt(form.totalPeriods) || 0))}</strong></span>
            <span>Principal: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(parseFloat(form.loanAmount) || 0)}</strong></span>
            <span>Interest: <strong style={{ color: '#ff9500' }}>{formatCurrency(Math.max(0, emi * (parseInt(form.totalPeriods) || 0) - (parseFloat(form.loanAmount) || 0)))}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function EMILoans() {
  const [loans, setLoans] = useState([]);
  const [collections, setCollections] = useState({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [addOpen, setAddOpen] = useState(false);
  const [editLoan, setEditLoan] = useState(null);
  const [collectLoan, setCollectLoan] = useState(null);
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [docFiles, setDocFiles] = useState({});
  const [existingDocs, setExistingDocs] = useState({});
  const [histLoan, setHistLoan] = useState(null);
  const [delLoan, setDelLoan] = useState(null);
  const [photoPopup, setPhotoPopup] = useState(null); // {src, name}

  // Form state — lifted out of LoanForm to avoid remount bug
  const [form, setForm] = useState({ ...BLANK });
  const [photoPreview, setPhotoPreview] = useState(null);

  // Collect form
  const [cpf, setCpf] = useState({ amount: '', fine: '0', date: today(), mode: 'Cash', remarks: '', collectFine: false, dueDate: '', daysOverdue: 0, periodNo: 1, earlyClose: false, editingId: null, editingLedgerId: null });
  const [saving, setSaving] = useState(false);
  // List controls
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');

  useEffect(() => {
    const l = onSnapshot(query(collection(db, 'emi_loans'), orderBy('createdAt', 'desc')),
      snap => { setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    const c = onSnapshot(collection(db, 'emi_collections'), snap => {
      const cm = {};
      snap.docs.forEach(d => { const x = { id: d.id, ...d.data() }; if (!cm[x.loanId]) cm[x.loanId] = []; cm[x.loanId].push(x); });
      setCollections(cm);
    });
    return () => { l(); c(); };
  }, []);

  // ── Photo handlers ─────────────────────────────────────────────────────
  async function handlePhotoFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Photo must be under 2MB'); return; }
    try {
      const r = await uploadDocumentFile(file);
      setPhotoPreview(r.dataUrl);
      setForm(f => ({ ...f, photo: r.dataUrl }));
    } catch (e) { toast.error('Upload failed: ' + e.message); }
  }

  function removePhoto() { setPhotoPreview(null); setForm(f => ({ ...f, photo: null })); }

  // ── Open add/edit ──────────────────────────────────────────────────────
  function openAdd() {
    setForm({ ...BLANK, emiId: genId() });
    setPhotoPreview(null);
    setDocFiles({}); setExistingDocs({});
    setAddOpen(true);
  }

  function openEdit(loan) {
    setForm({
      emiId: loan.emiId || loan.id,
      borrowerName: loan.borrowerName || '',
      phone: loan.phone || '',
      email: loan.email || '',
      address: loan.address || '',
      guardianName: loan.guardianName || '',
      guardianPhone: loan.guardianPhone || '',
      guardianAddress: loan.guardianAddress || '',
      loanAmount: String(loan.loanAmount || ''),
      interestRate: String(loan.interestRate || ''),
      totalPeriods: String(loan.totalPeriods || ''),
      frequency: loan.frequency || 'monthly',
      loanDate: loan.loanDate || today(),
      emiStartDate: loan.emiStartDate || today(),
      dailyFineRate: String(loan.dailyFineRate || 50),
      status: loan.status || 'Active',
      notes: loan.notes || '',
      photo: loan.photo || null,
    });
    setPhotoPreview(loan.photo || null);
    setDocFiles({});
    getEmiDocs(loan.id).then(setExistingDocs).catch(() => setExistingDocs({}));
    setEditLoan(loan);
  }

  // ── Save loan ──────────────────────────────────────────────────────────
  async function saveLoan(isEdit) {
    if (!isEdit && !form.customerId) return toast.error('Select an existing User first — EMI loans can only be created for a linked User.');
    if (!form.borrowerName || !form.phone || !form.loanAmount || !form.interestRate || !form.totalPeriods || !form.loanDate || !form.emiStartDate)
      return toast.error('Fill all required fields (Name, Phone, Amount, Rate, Periods, Dates)');
    setSaving(true);
    try {
      const emi = calcEMI(form.loanAmount, form.interestRate, form.totalPeriods, form.frequency);
      const data = {
        ...form,
        loanAmount: parseFloat(form.loanAmount),
        interestRate: parseFloat(form.interestRate),
        totalPeriods: parseInt(form.totalPeriods),
        emiAmount: Math.round(emi),
        dailyFineRate: parseFloat(form.dailyFineRate) || 50,
        updatedAt: serverTimestamp(),
      };
      const toDataUrl = async (file) => { if (!file) return null; const r = await uploadDocumentFile(file); return r.dataUrl; };
      const [checkUrl, bondUrl, agreementUrl] = await Promise.all([
        docFiles.check ? toDataUrl(docFiles.check) : Promise.resolve(existingDocs.check || null),
        docFiles.bond ? toDataUrl(docFiles.bond) : Promise.resolve(existingDocs.bond || null),
        docFiles.agreement ? toDataUrl(docFiles.agreement) : Promise.resolve(existingDocs.agreement || null),
      ]);
      let savedLoanId = isEdit ? editLoan.id : null;
      if (isEdit) {
        await updateDoc(doc(db, 'emi_loans', editLoan.id), data);
        toast.success('EMI Loan updated!');
        setEditLoan(null);
      } else {
        data.paidPeriods = 0;
        data.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, 'emi_loans'), data);
        savedLoanId = ref.id;
        // Milestone: EMI Loan Created — notable lifecycle event for Journal
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Created',
          description: `EMI loan created — ${form.borrowerName} · ${form.emiId||ref.id}`,
          amount: parseFloat(form.loanAmount) || 0, date: form.loanDate || new Date().toISOString().split('T')[0],
          borrowerName: form.borrowerName, loanId: ref.id, emiId: form.emiId || ref.id,
          createdAt: serverTimestamp(),
        });
        toast.success('EMI Loan created!');
        setAddOpen(false);
      }
      if (savedLoanId) await saveEmiDocs(savedLoanId, { check: checkUrl, bond: bondUrl, agreement: agreementUrl });
      setForm({ ...BLANK, emiId: genId() });
      setPhotoPreview(null);
      setDocFiles({}); setExistingDocs({});
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  // ── Delete loan ────────────────────────────────────────────────────────
  async function deleteLoan() {
    if (!delLoan) return;
    try {
      await deleteDoc(doc(db, 'emi_loans', delLoan.id));
      const cols = collections[delLoan.id] || [];
      await Promise.all(cols.map(c => deleteDoc(doc(db, 'emi_collections', c.id)).catch(() => {})));
      toast.success('EMI Loan deleted');
      setDelLoan(null);
    } catch (e) { toast.error('Delete failed: ' + e.message); }
  }

  // ── Collect EMI ────────────────────────────────────────────────────────
  function openCollect(loan) {
    const cols = collections[loan.id] || [];
    // Only 'Paid' periods count toward how many are actually done — a reverted 'Unpaid'
    // record still exists (history) but must be offered again as the next one to collect.
    const paidCount = cols.filter(c => c.status === 'Paid').length;
    const schedule = buildSchedule(loan);
    const nextSlot = schedule[paidCount];
    const fine = nextSlot ? calcFine(nextSlot.dueDate, loan.dailyFineRate || 50) : 0;
    // A collection record may already exist for this period number (e.g. previously reverted
    // to Unpaid) — if so, edit it in place instead of creating a duplicate.
    const existingForSlot = cols.find(c => c.periodNo === paidCount + 1);
    setCollectLoan(loan);
    setCpf({
      amount: String(loan.emiAmount || ''),
      fine: String(fine),
      date: today(),
      mode: 'Cash',
      remarks: '',
      collectFine: fine > 0,
      dueDate: nextSlot?.dueDate || '',
      daysOverdue: nextSlot ? getDaysOverdue(nextSlot.dueDate) : 0,
      periodNo: paidCount + 1,
      editingId: existingForSlot?.id || null, editingLedgerId: existingForSlot?.ledgerEntryId || null,
    });
  }

  // Unified schedule-dropdown handler: pick any period → collect (if unpaid) or edit/mark-unpaid (if already collected)
  function handleScheduleSelect(loan, periodIdx) {
    if (periodIdx === '' || periodIdx == null) return;
    const sched = getScheduleWithStatus(loan);
    const slot = sched[+periodIdx];
    if (!slot) return;
    if (slot.col) {
      editCollection(loan, slot.col); // already collected — opens Edit (Partial / Paid / Mark Unpaid)
    } else {
      const fine = calcFine(slot.dueDate, loan.dailyFineRate || 50);
      setCollectLoan(loan);
      setCpf({
        amount: String(loan.emiAmount || ''),
        fine: String(fine),
        date: today(),
        mode: 'Cash',
        remarks: '',
        collectFine: fine > 0,
        dueDate: slot.dueDate || '',
        daysOverdue: getDaysOverdue(slot.dueDate),
        periodNo: +periodIdx + 1,
        editingId: null, editingLedgerId: null,
      });
    }
  }

  // Edit an ALREADY-collected period — updates in place, does not duplicate
  function editCollection(loan, col) {
    setCollectLoan(loan);
    setCpf({
      amount: String(col.amount || ''),
      fine: String(col.fine || 0),
      date: col.date || today(),
      mode: col.mode || 'Cash',
      remarks: col.remarks || '',
      collectFine: (col.fine || 0) > 0,
      dueDate: col.dueDate || '',
      daysOverdue: col.daysOverdue || 0,
      periodNo: col.periodNo,
      earlyClose: col.earlyClosure || false,
      editingId: col.id, editingLedgerId: col.ledgerEntryId || null,
    });
  }

  async function saveCollection(statusSel='Paid') {
    const isPartial=statusSel==='Partial';
    if (statusSel !== 'Unpaid' && (!cpf.amount || parseFloat(cpf.amount) <= 0)) return toast.error('Enter valid amount');
    setSaving(true);
    try {
      const loan = collectLoan;
      const cols = collections[loan.id] || [];
      const fine = cpf.collectFine ? parseFloat(cpf.fine) || 0 : 0;
      const totalCollected = parseFloat(cpf.amount) + fine;
      const fullCols=(cols||[]).filter(x=>x.status!=='Partial');
      const paidPeriods = fullCols.length + (isPartial?0:1);

      const isEditing = !!cpf.editingId;
      const effectivePeriodNo = isEditing ? cpf.periodNo : paidPeriods;

      if (isEditing) {
        const isUnpaid = statusSel === 'Unpaid';
        // Update the EXISTING collection record in place — no duplicate.
        // Reverting to Unpaid zeroes out the amounts (undoes the collection) rather than deleting the record.
        await updateDoc(doc(db, 'emi_collections', cpf.editingId), {
          amount: isUnpaid ? 0 : parseFloat(cpf.amount), fine: isUnpaid ? 0 : fine, totalCollected: isUnpaid ? 0 : totalCollected,
          date: cpf.date, mode: cpf.mode, remarks: isUnpaid ? 'Reverted to unpaid' : cpf.remarks,
          status: statusSel, updatedAt: serverTimestamp(),
        });
        if (cpf.editingLedgerId) {
          await updateDoc(doc(db, 'finance_ledger_entries', cpf.editingLedgerId), {
            description: isUnpaid
              ? `EMI #${effectivePeriodNo} from ${loan.borrowerName} — reverted to unpaid`
              : `EMI #${effectivePeriodNo} from ${loan.borrowerName}${fine > 0 ? ` + Fine ${formatCurrency(fine)}` : ''}${statusSel==='Partial'?' (partial)':''}`,
            amount: isUnpaid ? 0 : totalCollected, paymentMode: cpf.mode, date: cpf.date, updatedAt: serverTimestamp(),
          });
        }
        // Recompute paidPeriods — ONLY status==='Paid' counts as fully paid (not Partial, not Unpaid)
        const updatedCols = cols.map(x => x.id === cpf.editingId ? { ...x, status: statusSel } : x);
        const recount = updatedCols.filter(x => x.status === 'Paid').length;
        const fullyPaidEdit = recount >= loan.totalPeriods;
        await updateDoc(doc(db, 'emi_loans', loan.id), {
          paidPeriods: recount, status: fullyPaidEdit ? 'Closed' : 'Active', updatedAt: serverTimestamp(),
        });
        toast.success(isUnpaid ? `↩ EMI #${effectivePeriodNo} reverted to unpaid.` : `✓ EMI #${effectivePeriodNo} updated to ${statusSel}.`);
        setCollectLoan(null);
        setSaving(false);
        return;
      }

      const ledgerRef = await addDoc(collection(db, 'finance_ledger_entries'), {
        type: 'Credit', category: 'EMI Collection',
        description: `EMI #${paidPeriods} from ${loan.borrowerName}${fine > 0 ? ` + Fine ${formatCurrency(fine)}` : ''}${isPartial?' (partial)':''}`,
        amount: totalCollected, paymentMode: cpf.mode, date: cpf.date,
        borrowerName: loan.borrowerName, loanId: loan.id, createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'emi_collections'), {
        loanId: loan.id, borrowerName: loan.borrowerName, emiId: loan.emiId,
        amount: parseFloat(cpf.amount), fine, totalCollected,
        expectedEMI: loan.emiAmount, date: cpf.date, mode: cpf.mode,
        remarks: cpf.earlyClose ? ('Early closure settlement. '+cpf.remarks).trim() : cpf.remarks, periodNo: paidPeriods, earlyClosure: cpf.earlyClose || false, status: statusSel,
        dueDate: cpf.dueDate, daysOverdue: cpf.daysOverdue,
        frequency: loan.frequency, ledgerEntryId: ledgerRef.id, createdAt: serverTimestamp(),
      });

      const fullyPaid = cpf.earlyClose || paidPeriods >= loan.totalPeriods;
      await updateDoc(doc(db, 'emi_loans', loan.id), {
        paidPeriods: cpf.earlyClose ? loan.totalPeriods : paidPeriods, status: fullyPaid ? 'Closed' : 'Active', closedEarly: cpf.earlyClose || false, updatedAt: serverTimestamp(),
      });
      if (fullyPaid) {
        // Milestone: EMI Loan Closed — notable lifecycle event for Journal
        await addDoc(collection(db, 'finance_ledger_entries'), {
          type: 'Milestone', category: 'EMI Loan Closed',
          description: `EMI loan closed${cpf.earlyClose ? ' (early settlement)' : ''} — ${loan.borrowerName} · ${loan.emiId || loan.id}`,
          amount: loan.loanAmount || 0, date: cpf.date || new Date().toISOString().split('T')[0],
          borrowerName: loan.borrowerName, loanId: loan.id, emiId: loan.emiId || loan.id,
          createdAt: serverTimestamp(),
        });
      }

      toast.success(fullyPaid
        ? (cpf.earlyClose ? '✓ Loan closed early — fully settled.' : `🎉 All ${loan.totalPeriods} EMIs collected! Loan closed.`)
        : isPartial ? `◐ Partial EMI recorded — period #${paidPeriods+1} still due.` : `✓ EMI #${paidPeriods} collected. ${loan.totalPeriods - paidPeriods} remaining.`
      );
      setCollectLoan(null);
    } catch (e) { toast.error('Failed: ' + e.message); } finally { setSaving(false); }
  }

  // ── Derived data ───────────────────────────────────────────────────────
  function getOutstanding(loan) {
    const paid = (collections[loan.id] || []).reduce((s, c) => s + (c.amount || 0), 0);
    return Math.max(0, (loan.loanAmount || 0) - paid);
  }

  function getScheduleWithStatus(loan) {
    const sched = buildSchedule(loan);
    const cols = [...(collections[loan.id] || [])].sort((a, b) => a.periodNo - b.periodNo);
    return sched.map((slot, i) => {
      const col = cols.find(c => c.periodNo === i + 1);
      const overdue = getDaysOverdue(slot.dueDate);
      const fine = calcFine(slot.dueDate, loan.dailyFineRate || 50);
      return { ...slot, col, overdue, fine, status: col ? (col.status==='Partial' ? 'Partial' : col.status==='Unpaid' ? (overdue > 0 ? 'Overdue' : 'Pending') : 'Paid') : overdue > 0 ? 'Overdue' : 'Pending' };
    });
  }

  const active = loans.filter(l => l.status === 'Active');
  const closed = loans.filter(l => l.status === 'Closed');
  const totalOut = active.reduce((s, l) => s + getOutstanding(l), 0);
  const totalMonthly = active.reduce((s, l) => s + (l.emiAmount || 0) * (FREQ_FACTOR[l.frequency] || 1), 0);

  const filtered = loans.filter(l => {
    const ms = !search || l.borrowerName?.toLowerCase().includes(search.toLowerCase()) || (l.emiId || '').toLowerCase().includes(search.toLowerCase()) || (l.phone || '').includes(search);
    const mf = filter === 'all' || (filter === 'active' && l.status === 'Active') || (filter === 'closed' && l.status === 'Closed');
    return ms && mf;
  });

  if (loading) return <PageLoader stats={4} />;

  return (
    <div className="page-enter">

      {/* Photo popup overlay */}
      {photoPopup && <PhotoPopup src={photoPopup.src} name={photoPopup.name} onClose={() => setPhotoPopup(null)} />}

      <PageHeader title="EMI Loans" subtitle="Daily, weekly and monthly instalment loan management"
        action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => printEMILoansSummary(filtered)}>Export PDF{filter!=='all' ? ` (${filter==='active'?'Active':'Closed'})` : ''}</Button>
          <Button onClick={openAdd}>+ New EMI Loan</Button>
        </div>} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <StatCard label="Active Loans" value={active.length} sub="Currently running" color="#007aff" />
        <StatCard label="Total Outstanding" value={formatCurrency(Math.round(totalOut))} sub="Principal remaining" color="#ff9500" />
        <StatCard label="Monthly Collection" value={formatCurrency(Math.round(totalMonthly))} sub="Expected this month" color="#34c759" />
        <StatCard label="Closed Loans" value={closed.length} sub="Fully paid off" color="#5856d6" />
      </div>

      {/* Table */}
      <Card>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <FilterTabs
            options={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'closed', label: 'Closed', count: closed.length },
              { value: 'all', label: 'All', count: loans.length },
            ]}
            value={filter} onChange={setFilter}
          />
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone or EMI ID…" />
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No EMI loans found</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Create a new EMI loan to get started</div>
            <Button onClick={openAdd}>+ New EMI Loan</Button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(118,118,128,0.07)', borderBottom: '1px solid rgba(0,0,0,.08)' }}>
                  {['', 'EMI ID', 'Borrower', 'Loan', 'EMI Amt', 'Freq', 'Progress', 'Next Due', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const cols = collections[l.id] || [];
                  // Only count records with status==='Paid' — a reverted 'Unpaid' record still exists
                  // (to preserve history) but must NOT count toward progress.
                  const paid = cols.filter(c => c.status === 'Paid').length;
                  const remaining = Math.max(0, (l.totalPeriods || 0) - paid);
                  const pct = l.totalPeriods > 0 ? Math.round((paid / l.totalPeriods) * 100) : 0;
                  const schedule = buildSchedule(l);
                  const nextSlot = schedule[paid];
                  const fine = nextSlot ? calcFine(nextSlot.dueDate, l.dailyFineRate || 50) : 0;
                  const daysOD = nextSlot ? getDaysOverdue(nextSlot.dueDate) : 0;

                  return (
                    <React.Fragment key={l.id}>
                    <tr style={{ borderBottom: '1px solid rgba(0,0,0,.04)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,122,255,0.015)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                      {/* Photo avatar — click to popup */}
                      <td style={{ padding: '10px 10px' }}>
                        <PhotoAvatar
                          src={l.photo} name={l.borrowerName} size={36}
                          onClick={l.photo ? () => setPhotoPopup({ src: l.photo, name: l.borrowerName }) : undefined}
                        />
                      </td>

                      <td style={{ padding: '10px 12px', fontSize: 11.5, fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700 }}>{l.emiId}</td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{l.borrowerName}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{l.phone}</div>
                        {l.guardianName && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>G: {l.guardianName}</div>}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{formatCurrency(l.loanAmount || 0)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>O/S: {formatCurrency(Math.round(getOutstanding(l)))}</div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{formatCurrency(l.emiAmount || 0)}</div>
                        {fine > 0 && <div style={{ fontSize: 11, color: '#ff3b30', fontWeight: 600, marginTop: 2 }}>+{formatCurrency(fine)} fine</div>}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,122,255,0.08)', color: 'var(--accent)', fontWeight: 600 }}>
                          {FREQ_LABEL[l.frequency] || l.frequency}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', minWidth: 100 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          <span style={{ color: '#34c759' }}>{paid}</span>
                          <span style={{ color: 'var(--text-secondary)' }}> / {l.totalPeriods}</span>
                          <span style={{ color: 'var(--text-secondary)', marginLeft: 4, fontSize: 11 }}>({pct}%)</span>
                        </div>
                        <div style={{ height: 5, background: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#34c759' : 'var(--accent)', borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: remaining > 0 ? '#ff9500' : '#34c759', marginTop: 3 }}>
                          {remaining > 0 ? `${remaining} remaining` : '✓ Complete'}
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        {nextSlot ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{fmtDate(nextSlot.dueDate)}</div>
                            {daysOD > 0 ? (
                              <div style={{ fontSize: 10, fontWeight: 700, color: daysOD > 7 ? '#ff3b30' : '#ff9500', marginTop: 2 }}>
                                {daysOD > 2 ? `${daysOD}d overdue` : `${daysOD}d (grace)`}
                              </div>
                            ) : (
                              <div style={{ fontSize: 10, color: '#34c759', marginTop: 2 }}>On time</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#34c759', fontWeight: 600 }}>✓ Done</span>
                        )}
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <Badge label={l.status} type={l.status === 'Active' ? 'success' : 'neutral'} />
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {l.status === 'Active' && (
                            <Button size="sm" onClick={() => openCollect(l)}>Collect</Button>
                          )}
                          <button
                            title={expandedLoan===l.id?'Collapse':'View full EMI schedule'}
                            onClick={() => setExpandedLoan(expandedLoan===l.id?null:l.id)}
                            style={{padding:'7px 10px',background:expandedLoan===l.id?'rgba(0,122,255,0.08)':'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:expandedLoan===l.id?'var(--accent)':'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontWeight:600}}>
                            {expandedLoan===l.id?'Close':'Schedule'}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{transform:expandedLoan===l.id?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          <button onClick={() => printEMILoanReport(l, getScheduleWithStatus(l))} title="Download PDF Report"
                            style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(220,38,38,.2)',background:'rgba(220,38,38,.04)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#dc2626'}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
                          </button>
                          {cols.length > 0 && (
                            <button
                              title="Payment History"
                              onClick={() => setHistLoan({ loan: l, cols })}
                              style={{ height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid rgba(0,0,0,.1)', background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Hist
                            </button>
                          )}
                          <button
                            title="Edit Loan"
                            onClick={() => openEdit(l)}
                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(0,122,255,0.2)', background: 'rgba(0,122,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button
                            title="Delete Loan"
                            onClick={() => setDelLoan(l)}
                            style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,59,48,.25)', background: 'rgba(255,59,48,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff3b30' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedLoan === l.id && (() => {
                      const sched = getScheduleWithStatus(l);
                      const paidAmt = cols.filter(x => x.status === 'Paid').reduce((s, x) => s + (x.totalCollected || x.amount || 0), 0);
                      return (
                        <tr>
                          <td colSpan={10} style={{ padding: 0, background: '#fafafa', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                            <div style={{ padding: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                                  Full EMI Schedule from Loan Start
                                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}> · Click any unpaid slot to collect it, or an already-paid one to edit / mark unpaid</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{paid}/{l.totalPeriods} PAID</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: '#34c759' }}>{formatCurrency(Math.round(paidAmt))}</div>
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
                                {sched.map((slot, i) => {
                                  const isPaid = slot.status === 'Paid';
                                  const isPartial = slot.status === 'Partial';
                                  const isOverdue = slot.status === 'Overdue';
                                  const isNext = i === paid && !isPaid;
                                  const label = new Date(slot.dueDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                                  const bg = isPaid ? 'rgba(52,199,89,0.04)' : isPartial ? 'rgba(88,86,214,0.05)' : isOverdue ? 'rgba(255,59,48,0.04)' : isNext ? 'rgba(0,122,255,0.04)' : '#fff';
                                  const border = isPaid ? 'rgba(52,199,89,0.25)' : isPartial ? 'rgba(88,86,214,0.25)' : isOverdue ? 'rgba(255,59,48,0.25)' : isNext ? 'rgba(0,122,255,0.3)' : 'rgba(0,0,0,0.07)';
                                  const textCol = isPaid ? '#1a7a34' : isPartial ? '#5856d6' : isOverdue ? '#c0392b' : isNext ? '#007aff' : 'var(--text-primary)';
                                  return (
                                    <div key={i} onClick={() => handleScheduleSelect(l, i)}
                                      style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${border}`, background: bg, cursor: 'pointer' }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: textCol, marginBottom: 4 }}>{label}</div>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: isPaid ? '#34c759' : isPartial ? '#5856d6' : isOverdue ? '#ff3b30' : 'var(--text-secondary)' }}>
                                        {isPaid ? formatCurrency(slot.col.totalCollected || slot.col.amount) : isPartial ? `${formatCurrency(slot.col.amount)} (partial)` : isOverdue ? `${slot.overdue}d overdue` : 'Pending'}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── ADD MODAL ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create New EMI Loan" width={700}
        footer={addOpen&&(
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Button onClick={() => saveLoan(false)} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create EMI Loan'}</Button>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        )}>
        <LoanForm
          form={form} setForm={setForm}
          photoPreview={photoPreview}
          onPhotoChange={handlePhotoFile}
          onPhotoRemove={removePhoto}
          docFiles={docFiles} setDocFiles={setDocFiles} existingDocs={existingDocs}
        />
      </Modal>

      {/* ── EDIT MODAL ── */}
      <Modal open={!!editLoan} onClose={() => setEditLoan(null)} title={`Edit EMI Loan — ${editLoan?.borrowerName || ''}`} width={700}
        footer={editLoan&&(
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Button onClick={() => saveLoan(true)} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="secondary" onClick={() => setEditLoan(null)}>Cancel</Button>
          </div>
        )}>
        <LoanForm
          form={form} setForm={setForm}
          photoPreview={photoPreview}
          onPhotoChange={handlePhotoFile}
          onPhotoRemove={removePhoto}
          docFiles={docFiles} setDocFiles={setDocFiles} existingDocs={existingDocs}
        />
      </Modal>

      {/* ── COLLECT EMI MODAL ── */}
      <Modal open={!!collectLoan} onClose={() => setCollectLoan(null)} title={cpf.editingId ? `Edit EMI #${cpf.periodNo} — Change Status` : "Collect EMI Payment"} width={500}
        footer={collectLoan&&(
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
            {/* emiLoanPopupV2 — Gradient header */}
            <div style={{background:'linear-gradient(135deg,#007aff,#34aadc)',borderRadius:12,padding:'16px',marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                {collectLoan.photo
                  ?<img src={collectLoan.photo} alt="" style={{width:48,height:48,borderRadius:'50%',objectFit:'cover',border:'2.5px solid rgba(255,255,255,0.5)',flexShrink:0}}/>
                  :<div style={{width:48,height:48,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#fff',flexShrink:0}}>{(collectLoan.borrowerName||'?')[0].toUpperCase()}</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,fontSize:16,color:'#fff'}}>{collectLoan.borrowerName}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.75)',marginTop:2}}>{collectLoan.emiId} · {collectLoan.phone}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.7)'}}>EMI #{cpf.periodNo} of {collectLoan.totalPeriods}</div>
                  <div style={{fontSize:20,fontWeight:900,color:'#fff'}}>{formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan)+emiInterestPerPeriod(collectLoan)))}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.7)'}}>P {formatCurrency(Math.round(emiPrincipalPerPeriod(collectLoan)))} + I {formatCurrency(Math.round(emiInterestPerPeriod(collectLoan)))}</div>
                </div>
              </div>
            </div>

            {/* Due date info */}
            {cpf.dueDate && (
              <div style={{ padding: '10px 14px', background: cpf.daysOverdue > 2 ? 'rgba(255,59,48,0.06)' : cpf.daysOverdue > 0 ? 'rgba(255,149,0,0.06)' : 'rgba(52,199,89,0.06)', borderRadius: 9, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Due Date</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(cpf.dueDate)}</div>
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

            {/* Fine section */}
            {cpf.daysOverdue > 2 && (
              <div style={{ background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#c0392b', fontWeight: 600, marginBottom: 10 }}>
                  ⚠ {cpf.daysOverdue - 2} days after grace — ₹{collectLoan.dailyFineRate || 50}/day suggested
                </div>
                {/* iOS toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: cpf.collectFine ? 10 : 0 }}>
                  <div onClick={() => setCpf(p => ({ ...p, collectFine: !p.collectFine, fine: '' }))}
                    style={{ width: 44, height: 26, borderRadius: 999, padding: 2, display: 'flex', alignItems: 'center',
                      justifyContent: cpf.collectFine ? 'flex-end' : 'flex-start',
                      background: cpf.collectFine ? '#ff3b30' : '#e5e5ea',
                      transition: 'background .2s', cursor: 'pointer', flexShrink: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.22)' }}/>
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
                      style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1.5px solid rgba(255,59,48,0.3)',
                        fontSize: 14, fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)',
                        outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      autoFocus />
                  </div>
                )}
              </div>
            )}

            {/* Early closure */}
            {(() => {
              const ppp = (parseFloat(collectLoan.loanAmount)||0)/(parseInt(collectLoan.totalPeriods)||1);
              const paidSoFar = (cpf.periodNo||1)-1;
              const remPrincipal = Math.max(0,(parseFloat(collectLoan.loanAmount)||0) - paidSoFar*ppp);
              const intThis = (parseFloat(collectLoan.loanAmount)||0)*((parseFloat(collectLoan.interestRate)||0)/100);
              const closeAmt = Math.round(remPrincipal + intThis);
              return (
                <div style={{ background:'rgba(175,82,222,0.06)', border:'1px solid rgba(175,82,222,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13 }}>
                    <input type="checkbox" checked={!!cpf.earlyClose} onChange={e=>setCpf(p=>({ ...p, earlyClose:e.target.checked, amount: e.target.checked?String(closeAmt):String(collectLoan.emiAmount||'') }))} style={{ width:16, height:16, accentColor:'#af52de', cursor:'pointer' }}/>
                    <span style={{ fontWeight:700, color:'#7d3cab' }}>Close loan early (settle now)</span>
                  </label>
                  {cpf.earlyClose && (
                    <div style={{ marginTop:8, fontSize:12.5, color:'var(--text-secondary)', lineHeight:1.6 }}>
                      Remaining principal <strong style={{color:'var(--text-primary)'}}>{formatCurrency(Math.round(remPrincipal))}</strong> + this month’s interest <strong style={{color:'#ff9500'}}>{formatCurrency(Math.round(intThis))}</strong> = <strong style={{color:'#af52de'}}>{formatCurrency(closeAmt)}</strong>. Loan will be marked <strong>closed</strong>.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Payment fields */}
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

            {/* Total summary */}
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

      {/* ── SCHEDULE / CALENDAR MODAL ── */}

      {/* ── HISTORY MODAL ── */}
      <Modal open={!!histLoan} onClose={() => setHistLoan(null)} title={`Payment History — ${histLoan?.loan?.borrowerName || ''}`} width={540}
        footer={histLoan&&<Button full onClick={() => setHistLoan(null)}>Close</Button>}>
        {histLoan && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(0,122,255,0.04)', borderRadius: 10, marginBottom: 14 }}>
              <PhotoAvatar
                src={histLoan.loan.photo} name={histLoan.loan.borrowerName} size={40}
                onClick={histLoan.loan.photo ? () => setPhotoPopup({ src: histLoan.loan.photo, name: histLoan.loan.borrowerName }) : undefined}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{histLoan.loan.borrowerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {histLoan.cols.length} payments · Total collected: {formatCurrency(histLoan.cols.reduce((s, c) => s + (c.totalCollected || c.amount || 0), 0))}
                </div>
              </div>
            </div>

            {[...histLoan.cols].sort((a, b) => (b.periodNo || 0) - (a.periodNo || 0)).map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: i < histLoan.cols.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>EMI #{c.periodNo} · {fmtDate(c.date)}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {c.mode}{c.dueDate ? ` · Due: ${fmtDate(c.dueDate)}` : ''}{c.remarks ? ` · ${c.remarks}` : ''}
                  </div>
                  {c.daysOverdue > 0 && <div style={{ fontSize: 11, color: '#ff9500', marginTop: 1 }}>{c.daysOverdue} days late</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#34c759' }}>{formatCurrency(c.amount || 0)}</div>
                  {c.fine > 0 && <div style={{ fontSize: 11, color: '#ff3b30', fontWeight: 600 }}>+{formatCurrency(c.fine)} fine</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Modal open={!!delLoan} onClose={() => setDelLoan(null)} title="Delete EMI Loan" width={420}
        footer={delLoan&&(
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <Button variant="danger" onClick={deleteLoan} style={{ flex: 1, justifyContent: 'center' }}>Delete Permanently</Button>
            <Button variant="secondary" onClick={() => setDelLoan(null)}>Cancel</Button>
          </div>
        )}>
        {delLoan && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(255,59,48,0.06)', borderRadius: 10, marginBottom: 16, border: '1px solid rgba(255,59,48,0.15)' }}>
              <PhotoAvatar src={delLoan.photo} name={delLoan.borrowerName} size={44} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{delLoan.borrowerName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {delLoan.emiId} · {formatCurrency(delLoan.loanAmount)} · {(collections[delLoan.id] || []).length} payments recorded
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              This will permanently delete this EMI loan and all <strong>{(collections[delLoan.id] || []).length} payment records</strong>. This action cannot be undone.
            </p>
          </>
        )}
      </Modal>

    </div>
  );
}
