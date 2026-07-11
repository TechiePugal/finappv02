import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { collection, onSnapshot } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { addHubNote, getHubNotes, dismissHubNote, deleteHubNote } from '../utils/hub_notes';
import { getCompanyProfile, saveCompanyProfile } from '../utils/companyProfile';
import toast from 'react-hot-toast';
import Logo from '../assets/ECFin360Logo.png'

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtCr(v) {
  const n = Math.abs(Number(v) || 0);
  if (n >= 10000000) return `₹${(n/10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n/100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n/1000).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
}
function fmtWhen(ts) {
  if (!ts?.seconds) return null;
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function KPICard({ label, value, sub, color, icon, loading }) {
  if (loading) return (
    <div style={{ background:'#fff', borderRadius:16, padding:'18px 20px', border:'1px solid rgba(0,0,0,.06)' }}>
      <div style={{ width:36, height:36, borderRadius:10, background:'#f3f4f6', marginBottom:12 }}/>
      <div style={{ height:22, background:'#f3f4f6', borderRadius:5, marginBottom:7, width:'55%' }}/>
      <div style={{ height:12, background:'#f3f4f6', borderRadius:4, width:'75%' }}/>
    </div>
  );
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'18px 20px', border:`1px solid rgba(0,0,0,.06)`, boxShadow:'0 1px 2px rgba(0,0,0,.03), 0 4px 14px rgba(0,0,0,.035)' }}>
      <div style={{ width:38, height:38, borderRadius:11, background:color+'14', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:13 }}>
        <span style={{ fontSize:20 }}>{icon}</span>
      </div>
      <div style={{ fontSize:22, fontWeight:900, color:'#111928', letterSpacing:'-.5px', lineHeight:1, marginBottom:5 }}>{value}</div>
      <div style={{ fontSize:13, color:'#6b7280', fontWeight:500 }}>{label}</div>
      {sub && <div style={{ fontSize:11.5, color:'#9ca3af', marginTop:3 }}>{sub}</div>}
    </div>
  );
}

function AppCard({ title, subtitle, color, gradient, icon, badge, kpis, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:'#fff', borderRadius:20, overflow:'hidden', border:'1px solid rgba(0,0,0,.07)', cursor:'pointer', transition:'all .2s', boxShadow: hov ? '0 16px 44px rgba(0,0,0,.12)' : '0 2px 10px rgba(0,0,0,.045)', transform: hov ? 'translateY(-3px)' : 'none' }}>
      {/* App header */}
      <div style={{ padding:'24px 24px 20px', background:gradient, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-20, right:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,.1)' }}/>
        <div style={{ position:'absolute', bottom:-30, right:20, width:70, height:70, borderRadius:'50%', background:'rgba(255,255,255,.08)' }}/>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:'rgba(255,255,255,.24)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
            {icon}
          </div>
          {badge && (
            <span style={{ fontSize:10.5, fontWeight:700, padding:'4px 9px', borderRadius:99, background:'rgba(255,255,255,.26)', color:'#fff', letterSpacing:'.04em' }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ marginTop:14 }}>
          <h3 style={{ margin:0, fontSize:20, fontWeight:900, color:'#fff', letterSpacing:'-.3px' }}>{title}</h3>
          <p style={{ margin:'4px 0 0', fontSize:12.5, color:'rgba(255,255,255,.8)' }}>{subtitle}</p>
        </div>
      </div>
      {/* KPIs */}
      <div style={{ padding:'16px 20px 20px' }}>
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${kpis.length},1fr)`, gap:10, marginBottom:16 }}>
          {kpis.map((k,i) => (
            <div key={i} style={{ textAlign:'center', padding:'10px 8px', background:'#f8fafc', borderRadius:10 }}>
              <div style={{ fontSize:15, fontWeight:800, color:k.color||'#111928' }}>{k.value}</div>
              <div style={{ fontSize:10.5, color:'#9ca3af', marginTop:2, fontWeight:500 }}>{k.label}</div>
            </div>
          ))}
        </div>
        <button style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:gradient, color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit', transition:'opacity .15s', opacity: hov?1:.92 }}>
          Open {title} →
        </button>
      </div>
    </div>
  );
}

// ── Notes & Reminders — lives on the Hub, global to the whole app ──────────
function NotesPanel({ userId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [wantsReminder, setWantsReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [popupAlert, setPopupAlert] = useState(null); // the one reminder currently shown as a popup
  const seenPopupIds = React.useRef(new Set());

  useEffect(() => { load(); }, [userId]); //eslint-disable-line

  // Check every 10s for newly-due reminders that haven't been popped up yet this session
  useEffect(() => {
    const check = () => {
      const nowMs = Date.now();
      const due = notes.find(n => n.reminderAt?.seconds && n.reminderAt.seconds * 1000 <= nowMs && !n.dismissed && !seenPopupIds.current.has(n.id));
      if (due) { seenPopupIds.current.add(due.id); setPopupAlert(due); }
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [notes]);
  async function load() {
    if (!userId) return;
    try { setNotes(await getHubNotes(userId)); } catch (e) { /* silent */ }
    setLoading(false);
  }

  async function save() {
    if (!text.trim()) return toast.error('Write something in the note first.');
    setSaving(true);
    try {
      await addHubNote(userId, { title: title.trim(), text: text.trim(), reminderAt: wantsReminder ? reminderAt : null });
      setTitle(''); setText(''); setWantsReminder(false); setReminderAt('');
      setModalOpen(false);
      load();
      toast.success('Note added');
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  }

  async function handleDismiss(id) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n));
    setPopupAlert(p => (p?.id === id ? null : p));
    try { await dismissHubNote(id); } catch (e) { /* keep local state */ }
  }

  async function handleDelete(id) {
    setNotes(prev => prev.filter(n => n.id !== id));
    try { await deleteHubNote(id); } catch (e) { /* ignore */ }
  }

  const now = Date.now();
  const activeAlerts = notes.filter(n => n.reminderAt?.seconds && n.reminderAt.seconds * 1000 <= now && !n.dismissed);
  const regularNotes = notes.filter(n => !activeAlerts.includes(n));

  if (loading) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Persistent reminder alerts — stay until explicitly closed */}
      {activeAlerts.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {activeAlerts.map(n => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px', borderRadius: 14, background: 'linear-gradient(135deg,#fff7ed,#fef2f2)', border: '1px solid #fed7aa' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⏰</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {n.title && <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111928', marginBottom: 2 }}>{n.title}</div>}
                <div style={{ fontSize: 13, color: '#374151' }}>{n.text}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Reminder was set for {fmtWhen(n.reminderAt)}</div>
              </div>
              <button onClick={() => handleDismiss(n.id)} title="Close this reminder"
                style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(0,0,0,.07)', boxShadow: '0 1px 2px rgba(0,0,0,.03), 0 4px 14px rgba(0,0,0,.035)', padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111928' }}>📝 Notes &amp; Reminders</div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>Jot anything down — set a reminder and it'll alert you until you close it.</div>
          </div>
          <button onClick={() => setModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
            + Add Note
          </button>
        </div>

        {regularNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 13 }}>No notes yet — add your first one.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10 }}>
            {regularNotes.map(n => (
              <div key={n.id} style={{ padding: '13px 14px', borderRadius: 13, background: '#f8fafc', position: 'relative', border: '1px solid rgba(0,0,0,.04)' }}>
                <button onClick={() => handleDelete(n.id)} title="Delete note"
                  style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  ✕
                </button>
                {n.title && <div style={{ fontSize: 13, fontWeight: 700, color: '#111928', marginBottom: 4, paddingRight: 20 }}>{n.title}</div>}
                <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                {n.reminderAt?.seconds && (
                  <div style={{ fontSize: 10.5, color: '#b45309', fontWeight: 600, marginTop: 6 }}>⏰ Reminder: {fmtWhen(n.reminderAt)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 28px 72px rgba(0,0,0,.25)' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#111928', marginBottom: 16 }}>Add Note</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
              style={{ width: '100%', boxSizing: 'border-box', height: 40, padding: '0 13px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,.09)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }} />
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write your note…" rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,.09)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 12 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: wantsReminder ? 10 : 18 }}>
              <input type="checkbox" checked={wantsReminder} onChange={e => setWantsReminder(e.target.checked)} />
              <span style={{ fontSize: 13, color: '#111928' }}>Set a reminder</span>
            </label>
            {wantsReminder && (
              <input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', height: 40, padding: '0 13px', borderRadius: 10, border: '1.5px solid rgba(0,0,0,.09)', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 18 }} />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : 'Save Note'}
              </button>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: '12px 20px', borderRadius: 11, border: '1px solid rgba(0,0,0,.09)', background: '#fff', color: '#6b7280', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder popup — fires the moment a reminder becomes due, must be explicitly closed */}
      {popupAlert && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 22, width: '100%', maxWidth: 400, padding: 28, textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,.3)', animation: 'popIn .25s ease' }}>
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'linear-gradient(135deg,#fef3c7,#fed7aa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 16px' }}>⏰</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Reminder</div>
            {popupAlert.title && <div style={{ fontSize: 18, fontWeight: 800, color: '#111928', marginBottom: 8 }}>{popupAlert.title}</div>}
            <div style={{ fontSize: 14.5, color: '#374151', lineHeight: 1.6, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{popupAlert.text}</div>
            <button onClick={() => handleDismiss(popupAlert.id)}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px rgba(99,102,241,.35)' }}>
              Got it — Close
            </button>
          </div>
          <style>{`@keyframes popIn { from { opacity:0; transform:scale(.92); } to { opacity:1; transform:none; } }`}</style>
        </div>
      )}
    </div>
  );
}


// ── Profile Settings — Google login profile + per-vertical company names ──
function ProfileModal({ user, onClose }) {
  const [companyNames, setCompanyNames] = useState({ financeCompanyName:'', realEstateCompanyName:'', chitFundCompanyName:'' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCompanyProfile(user.uid).then(p => {
      setCompanyNames({
        financeCompanyName: p.financeCompanyName || '',
        realEstateCompanyName: p.realEstateCompanyName || '',
        chitFundCompanyName: p.chitFundCompanyName || '',
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user.uid]);

  async function save() {
    setSaving(true);
    try {
      await saveCompanyProfile(user.uid, companyNames);
      toast.success('Profile updated');
      onClose();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  }

  const isGoogle = user?.providerData?.some(p => p.providerId === 'google.com');

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1300, background:'rgba(15,23,42,.55)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:22, width:'100%', maxWidth:460, padding:26, boxShadow:'0 32px 80px rgba(0,0,0,.28)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
          {user?.photoURL
            ? <img src={user.photoURL} alt="" style={{ width:56, height:56, borderRadius:'50%', border:'2px solid rgba(99,102,241,.3)' }}/>
            : <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22, fontWeight:800 }}>{(user?.displayName||user?.email||'U')[0].toUpperCase()}</div>}
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:'#111928' }}>{user?.displayName || 'Account'}</div>
            <div style={{ fontSize:12.5, color:'#6b7280', marginTop:2 }}>{user?.email}</div>
            {isGoogle && (
              <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:5, fontSize:10.5, fontWeight:700, color:'#4285F4', background:'rgba(66,133,244,.08)', padding:'2px 9px', borderRadius:99 }}>
                <svg width="10" height="10" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.07 5.07 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0012 23z"/><path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 015.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 001 12c0 1.77.43 3.45 1.18 4.93z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Signed in with Google
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize:13, fontWeight:700, color:'#111928', marginBottom:4 }}>Company Names</div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>Set a distinct company name for each business — shown across that section of the app.</div>

        {loading ? (
          <div style={{ padding:20, textAlign:'center', color:'#9ca3af', fontSize:13 }}>Loading…</div>
        ) : (
          <div style={{ display:'grid', gap:12, marginBottom:20 }}>
            {[
              { key:'financeCompanyName', label:'📊 Finance Ledger', placeholder:'e.g. Sri Ram Finance' },
              { key:'realEstateCompanyName', label:'🏢 Real Estate', placeholder:'e.g. Arun Builders' },
              { key:'chitFundCompanyName', label:'💰 Chit Fund', placeholder:'e.g. ChitFlow Pvt Ltd' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize:12.5, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>{f.label}</label>
                <input value={companyNames[f.key]} onChange={e=>setCompanyNames(c=>({...c,[f.key]:e.target.value}))} placeholder={f.placeholder}
                  style={{ width:'100%', boxSizing:'border-box', height:40, padding:'0 13px', borderRadius:10, border:'1.5px solid rgba(0,0,0,.09)', fontSize:13.5, fontFamily:'inherit', outline:'none' }} />
              </div>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={save} disabled={saving || loading}
            style={{ flex:1, padding:'12px', borderRadius:11, border:'none', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <button onClick={onClose}
            style={{ padding:'12px 20px', borderRadius:11, border:'1px solid rgba(0,0,0,.09)', background:'#fff', color:'#6b7280', fontSize:13.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Hub({ onLaunch }) {
  const { user, logout } = useAuth();

  const [projects,   setProjects]   = useState(null);
  const [chits,      setChits]      = useState(null);
  const [deposits,   setDeposits]   = useState(null);
  const [borrowers,  setBorrowers]  = useState(null);
  const [repayments, setRepayments] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const ready = projects !== null && chits !== null && deposits !== null && borrowers !== null && repayments !== null;

  useEffect(() => {
    const u1 = onSnapshot(collection(db,'re_projects'),   s => setProjects(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u2 = onSnapshot(collection(db,'chit_master'),   s => setChits(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u3 = onSnapshot(collection(db,'deposit_master'),s => setDeposits(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u4 = onSnapshot(collection(db,'borrower_master'),s=> setBorrowers(s.docs.map(d=>({id:d.id,...d.data()}))));
    const u5 = onSnapshot(collection(db,'loan_repayments'),s=> setRepayments(s.docs.map(d=>({id:d.id,...d.data()}))));
    return () => { u1();u2();u3();u4();u5(); };
  }, []);

  // Derived KPIs
  const activeChits     = (chits||[]).filter(c=>c.status==='Active').length;
  const totalChitValue  = (chits||[]).reduce((s,c)=>s+(c.totalChitValue||0),0);
  const chitComm        = (chits||[]).reduce((s,c)=>s+(c.totalCommissionEarned||0),0);

  const activeDeposits  = (deposits||[]).filter(d=>d.status==='Active').length;
  const totalDeposited  = (deposits||[]).filter(d=>d.status==='Active').reduce((s,d)=>s+(d.depositAmount||0),0);

  const activeBorr      = (borrowers||[]).filter(b=>b.status==='Active').length;
  const totalLoans      = (borrowers||[]).filter(b=>b.status==='Active').reduce((s,b)=>s+(b.loanAmount||0),0);
  const totalRepaid     = (repayments||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const outstanding     = Math.max(0, totalLoans - totalRepaid);

  const activeProjects  = (projects||[]).filter(p=>p.status==='Active').length;
  const totalRevenue    = (projects||[]).reduce((s,p)=>s+(p.totalRevenue||0),0);
  const bizMax = Math.max(totalRevenue, totalChitValue, totalDeposited, 1);
  const moneyInMotion = totalChitValue + totalDeposited + outstanding + totalRevenue;

  const now   = new Date();
  const hour  = now.getHours();
  const greet = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening';
  const name  = user?.displayName?.split(' ')[0] || 'Manager';

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)', fontFamily:'-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif', position:'relative', overflow:'hidden' }}>
      {/* Decorative background orbs — soft, Apple-marketing-page feel */}
      <div style={{ position:'absolute', top:-120, right:-100, width:420, height:420, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,.14),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:280, left:-160, width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,.10),transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:700, right:-140, width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,.10),transparent 70%)', pointerEvents:'none' }} />

      {/* ── TOP NAV ─────────────────────────────────────────────── */}
      <nav style={{ position:'sticky', top:0, zIndex:100, background:'rgba(255,255,255,.85)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:'1px solid rgba(0,0,0,.06)', padding:'0 24px', height:64, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:11 }}>
          <img src={Logo}
alt="EC Fin 360" style={{ width:38, height:38, borderRadius:10, boxShadow:'0 4px 12px rgba(0,0,0,.18)' }} />
          <div>
            <span style={{ fontSize:17, fontWeight:900, color:'#111928', letterSpacing:'-.4px' }}>EC Fin 360</span>
            <span style={{ fontSize:11, color:'#9ca3af', marginLeft:8, fontWeight:500 }}>ERP</span>
          </div>
        </div>

        {/* Desktop nav links */}
        <div className="hub-nav-links" style={{ display:'flex', gap:6 }}>
          {[['🏠 Home','#'],['🏢 Real Estate','re'],['💰 Chit Fund','cf'],['📊 Finance Ledger','fl']].map(([label,key])=>(
            <button key={key} onClick={()=>key!=='#'&&onLaunch(key)}
              style={{ padding:'7px 14px', borderRadius:9, border:'none', background: key==='#'?'rgba(99,102,241,.1)':'transparent', color: key==='#'?'#4f46e5':'#6b7280', fontSize:13, fontWeight: key==='#'?600:400, cursor:'pointer', fontFamily:'inherit', transition:'all .15s' }}
              onMouseEnter={e=>{if(key!=='#'){e.currentTarget.style.background='rgba(0,0,0,.04)';e.currentTarget.style.color='#111928';}}}
              onMouseLeave={e=>{if(key!=='#'){e.currentTarget.style.background='transparent';e.currentTarget.style.color='#6b7280';}}}
            >{label}</button>
          ))}
        </div>

        {/* User + hamburger */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>setProfileOpen(true)} title="Profile settings" style={{ background:'none', border:'none', padding:0, cursor:'pointer', borderRadius:'50%' }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:34, height:34, borderRadius:'50%', border:'2px solid rgba(99,102,241,.35)' }}/>
              : <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700 }}>
                  {(user?.displayName||user?.email||'U')[0].toUpperCase()}
                </div>}
          </button>
          <button className="hub-hamburger" onClick={()=>setMobileMenu(m=>!m)}
            style={{ display:'none', background:'none', border:'none', cursor:'pointer', color:'#6b7280', padding:4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button onClick={logout} className="hub-logout-btn"
            style={{ padding:'7px 14px', borderRadius:9, border:'1px solid rgba(0,0,0,.08)', background:'#fff', color:'#6b7280', fontSize:12.5, cursor:'pointer', fontFamily:'inherit' }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenu && (
        <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(255,255,255,.98)', display:'flex', flexDirection:'column', padding:24 }}>
          <button onClick={()=>setMobileMenu(false)} style={{ alignSelf:'flex-end', background:'none', border:'none', color:'#111928', fontSize:24, cursor:'pointer', marginBottom:24 }}>×</button>
          {[['🏠 Home','#'],['🏢 Real Estate','re'],['💰 Chit Fund','cf'],['📊 Finance Ledger','fl']].map(([label,key])=>(
            <button key={key} onClick={()=>{if(key!=='#')onLaunch(key);setMobileMenu(false);}}
              style={{ padding:'16px 20px', marginBottom:8, borderRadius:12, border:'1px solid rgba(0,0,0,.08)', background:'#f8fafc', color:'#111928', fontSize:16, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
              {label}
            </button>
          ))}
          <button onClick={()=>{logout();setMobileMenu(false);}}
            style={{ marginTop:'auto', padding:'14px', borderRadius:12, border:'1px solid rgba(255,59,48,.3)', background:'rgba(255,59,48,.06)', color:'#ff3b30', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
            Sign Out
          </button>
        </div>
      )}

      {/* Profile settings modal */}
      {profileOpen && user && <ProfileModal user={user} onClose={()=>setProfileOpen(false)} />}

      {/* ── HERO — single professional line, no multi-line greeting stack ── */}
      <div style={{ padding:'44px 24px 32px', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ marginBottom:32 }}>
          <h1 style={{ margin:'0 0 8px', fontSize:'clamp(24px,4vw,34px)', fontWeight:800, color:'#111928', letterSpacing:'-.6px', lineHeight:1.25 }}>
            Welcome back, {name} — here's your business at a glance.
          </h1>
          <p style={{ fontSize:14.5, color:'#6b7280', marginBottom:26 }}>
            Real estate, chit funds and finance ledger, unified in one command centre.
          </p>
          {/* Global KPIs — proper stat cards, not pills */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
            {[
              { label:'Active Chits',   val:ready?activeChits:'—',   icon:'💰', color:'#6366f1' },
              { label:'Active Deposits',val:ready?activeDeposits:'—',icon:'🏦', color:'#10b981' },
              { label:'Active Loans',   val:ready?activeBorr:'—',    icon:'📋', color:'#f59e0b' },
              { label:'RE Projects',    val:ready?activeProjects:'—',icon:'🏗️', color:'#3b82f6' },
            ].map((k,i)=>(
              <div key={i} style={{ background:'#fff', borderRadius:14, padding:'14px 16px', border:'1px solid rgba(0,0,0,.06)', boxShadow:'0 1px 2px rgba(0,0,0,.03), 0 4px 12px rgba(0,0,0,.03)', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, opacity:.85 }} />
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:16 }}>{k.icon}</span>
                  <span style={{ fontSize:10.5, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.05em' }}>{k.label}</span>
                </div>
                <div style={{ fontSize:22, fontWeight:900, color:'#111928', letterSpacing:'-.4px' }}>{k.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* QUICK INSIGHTS — richer at-a-glance detail, built from data already loaded */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:28 }}>
          {[
            { label:'Total Managed Value', value: ready?fmtCr(moneyInMotion):'—', icon:'💼', color:'#6366f1', sub:'Across all three businesses' },
            { label:'Commission Earned', value: ready?fmtCr(chitComm):'—', icon:'✨', color:'#10b981', sub:'From chit fund auctions' },
            { label:'Outstanding Loans', value: ready?fmtCr(outstanding):'—', icon:'📉', color:'#f59e0b', sub:'Yet to be recovered' },
            { label:'Active Accounts', value: ready?(activeChits+activeDeposits+activeBorr+activeProjects):'—', icon:'📊', color:'#3b82f6', sub:'Chits, deposits, loans & projects' },
          ].map((k,i)=>(
            <div key={i} style={{ background:'#fff', borderRadius:16, padding:'16px 18px', border:'1px solid rgba(0,0,0,.06)', boxShadow:'0 1px 2px rgba(0,0,0,.03), 0 4px 14px rgba(0,0,0,.03)', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:k.color, opacity:.85 }} />
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <span style={{ fontSize:16 }}>{k.icon}</span>
                <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.05em' }}>{k.label}</span>
              </div>
              <div style={{ fontSize:21, fontWeight:900, color:'#111928', letterSpacing:'-.4px' }}>{k.value}</div>
              <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* NOTES & REMINDERS — the global home page note-taking widget */}
        <NotesPanel userId={user?.uid} />

        {/* BUSINESS COMPARISON — list + donut chart, side by side */}
        <div style={{ background:'#fff', border:'1px solid rgba(0,0,0,.07)', borderRadius:20, padding:'24px 26px', marginBottom:28, boxShadow:'0 1px 2px rgba(0,0,0,.03), 0 4px 14px rgba(0,0,0,.035)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6, flexWrap:'wrap', gap:8 }}>
            <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'#111928', letterSpacing:'-.3px' }}>Business Overview</h2>
            <span style={{ fontSize:13, color:'#6b7280' }}>Money in motion: <strong style={{ color:'#111928', fontWeight:800 }}>{ready?fmtCr(moneyInMotion):'—'}</strong></span>
          </div>
          <p style={{ margin:'0 0 18px', fontSize:12.5, color:'#9ca3af' }}>Side-by-side scale of your three businesses.</p>
          <div style={{ display:'grid', gridTemplateColumns: bizMax>1 ? '1fr 220px' : '1fr', gap:24, alignItems:'center' }}>
            <div>
              {[
                { name:'Real Estate', icon:'🏢', color:'#14b8a6', head:totalRevenue, headLabel:'Revenue', sub:`${activeProjects} active projects`, key:'re' },
                { name:'Chit Fund', icon:'💰', color:'#6366f1', head:totalChitValue, headLabel:'Managed value', sub:`Commission ${fmtCr(chitComm)} · ${activeChits} active`, key:'cf' },
                { name:'Finance Ledger', icon:'📊', color:'#10b981', head:totalDeposited, headLabel:'Deposits', sub:`Loans out ${fmtCr(outstanding)} · ${activeDeposits} deposits`, key:'fl' },
              ].map((b,i)=>(
                <div key={i} onClick={()=>onLaunch(b.key)} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i<2?'1px solid rgba(0,0,0,.06)':'none', cursor:'pointer' }}>
                  <div style={{ width:40, height:40, borderRadius:11, background:b.color+'16', display:'flex', alignItems:'center', justifyContent:'center', fontSize:19, flexShrink:0 }}>{b.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, marginBottom:6 }}>
                      <span style={{ fontSize:14.5, fontWeight:700, color:'#111928' }}>{b.name}</span>
                      <span style={{ fontSize:15, fontWeight:900, color:'#111928', flexShrink:0 }}>{ready?fmtCr(b.head):'—'} <span style={{ fontSize:10.5, fontWeight:500, color:'#9ca3af' }}>{b.headLabel}</span></span>
                    </div>
                    <div style={{ height:7, background:'#f1f5f9', borderRadius:4, overflow:'hidden', marginBottom:4 }}>
                      <div style={{ width: ready?`${Math.round(b.head/bizMax*100)}%`:'0%', height:'100%', background:b.color, borderRadius:4, transition:'width .6s' }}/>
                    </div>
                    <div style={{ fontSize:11.5, color:'#9ca3af' }}>{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            {ready && (totalRevenue+totalChitValue+totalDeposited)>0 && (
              <div style={{ position:'relative', height:200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[
                        { name:'Real Estate', value:totalRevenue, color:'#14b8a6' },
                        { name:'Chit Fund', value:totalChitValue, color:'#6366f1' },
                        { name:'Finance Ledger', value:totalDeposited, color:'#10b981' },
                      ]}
                      dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                      {[{color:'#14b8a6'},{color:'#6366f1'},{color:'#10b981'}].map((e,i)=><Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v)=>fmtCr(v)} contentStyle={{ borderRadius:10, border:'1px solid rgba(0,0,0,.08)', fontSize:12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
                  <div style={{ fontSize:11, color:'#9ca3af', fontWeight:600 }}>Total</div>
                  <div style={{ fontSize:15, fontWeight:900, color:'#111928' }}>{fmtCr(totalRevenue+totalChitValue+totalDeposited)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── APP CARDS ─────────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:18, marginBottom:48 }}>

          {/* Real Estate */}
          <AppCard
            title="Real Estate ERP"
            subtitle="Projects, sites, clients, payments & documents"
            gradient="linear-gradient(135deg,#0f766e,#0d9488)"
            icon="🏢"
            badge="ERP"
            onClick={() => onLaunch('re')}
            kpis={[
              { label:'Projects', value: ready ? activeProjects : '—', color:'#fff' },
              { label:'Revenue',  value: ready ? fmtCr(totalRevenue) : '—', color:'#99f6e4' },
            ]}
          />

          {/* Chit Fund */}
          <AppCard
            title="Chit Fund Manager"
            subtitle="Auctions, commissions, members & projections"
            gradient="linear-gradient(135deg,#1d4ed8,#6366f1)"
            icon="💰"
            badge="LIVE"
            onClick={() => onLaunch('cf')}
            kpis={[
              { label:'Active Chits', value: ready ? activeChits : '—', color:'#fff' },
              { label:'Portfolio',    value: ready ? fmtCr(totalChitValue) : '—', color:'#bfdbfe' },
              { label:'Commission',   value: ready ? fmtCr(chitComm) : '—', color:'#86efac' },
            ]}
          />

          {/* Finance Ledger */}
          <AppCard
            title="Finance Ledger"
            subtitle="Deposits, loans, EMI & interest tracking"
            gradient="linear-gradient(135deg,#7c3aed,#a855f7)"
            icon="📊"
            badge="PRO"
            onClick={() => onLaunch('fl')}
            kpis={[
              { label:'Deposits',    value: ready ? fmtCr(totalDeposited) : '—', color:'#f0abfc' },
              { label:'Loans',       value: ready ? fmtCr(totalLoans) : '—', color:'#fff' },
              { label:'Outstanding', value: ready ? fmtCr(outstanding) : '—', color:'#fca5a5' },
            ]}
          />
        </div>

        {/* ── QUICK ACTIONS ─────────────────────────────────────── */}
        <div style={{ marginBottom:48 }}>
          <h2 style={{ margin:'0 0 16px', fontSize:18, fontWeight:800, color:'#111928' }}>Quick Actions</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
            {[
              { icon:'➕', label:'New Borrower',    action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'💎', label:'New Chit Fund',   action:()=>onLaunch('cf'), sub:'Chit Fund' },
              { icon:'📥', label:'New Depositor',   action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'📋', label:'EMI Loans',       action:()=>onLaunch('fl'), sub:'Finance Ledger' },
              { icon:'📅', label:'Auction Calendar',action:()=>onLaunch('cf'), sub:'Chit Fund' },
              { icon:'⚠️', label:'View Alerts',     action:()=>onLaunch('fl'), sub:'Finance Ledger' },
            ].map((q,i) => (
              <button key={i} onClick={q.action}
                style={{ padding:'14px 16px', borderRadius:12, border:'1px solid rgba(0,0,0,.07)', background:'#fff', cursor:'pointer', fontFamily:'inherit', textAlign:'left', transition:'all .15s', boxShadow:'0 1px 2px rgba(0,0,0,.03)' }}
                onMouseEnter={e=>{ e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='rgba(99,102,241,.25)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; e.currentTarget.style.borderColor='rgba(0,0,0,.07)'; e.currentTarget.style.transform='none'; }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{q.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#111928', marginBottom:3 }}>{q.label}</div>
                <div style={{ fontSize:11, color:'#9ca3af' }}>{q.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── FOOTER ─────────────────────────────────────────────── */}
        <div style={{ borderTop:'1px solid rgba(0,0,0,.07)', paddingTop:24, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#9ca3af' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', boxShadow:'0 0 6px rgba(16,185,129,.5)' }}/>
            Secured · AES-256 · {new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
          </div>
          <button onClick={logout}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid rgba(255,59,48,.25)', background:'rgba(255,59,48,.05)', color:'#dc2626', fontSize:13, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
            Sign Out
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hub-nav-links { display: none !important; }
          .hub-hamburger { display: flex !important; }
        }
        @media (max-width: 480px) {
          .hub-logout-btn { display: none; }
        }
      `}</style>
    </div>
  );
}
