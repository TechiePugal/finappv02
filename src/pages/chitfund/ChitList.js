/**
 * ChitList.js — Formed Chits management
 *
 * Company Included logic:
 *   companyIncluded = true  → company IS one of the members
 *     - totalMembers includes company (e.g. 20 total = 19 outside members + 1 company)
 *     - Only (totalMembers - 1) external members need to be added
 *     - In auction: company appears in winner list; no separate "Taken by Company" toggle
 *
 *   companyIncluded = false → company is NOT a member
 *     - All totalMembers are external people
 *     - In auction: only external members in winner list; there is no "company wins"
 *
 * This matches real-world chit funds where organiser sometimes keeps a slot.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, AlertTriangle, Search, Eye, Building2, Users, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getChits, createChit, updateChit, deleteChit, addMember, getDashboardData } from '../../utils/cf_firestore';
import { calcPerHeadValue, calcPhases, getExpectedPayable } from '../../utils/cf_engine';
import { formatCurrency } from '../../utils/cf_format';
import { PageLoader } from '../../components/Skeleton';

const fmt = v => formatCurrency(v || 0);

// ── Design tokens — Apple Finance style ──────────────────────────────────────
const T = {
  bg:       '#F2F2F7',   // iOS system background
  surface:  '#FFFFFF',
  surface2: '#F2F2F7',
  border:   '#E5E5EA',
  divider:  '#C6C6C8',
  accent:   '#007AFF',   // iOS blue
  green:    '#34C759',
  red:      '#FF3B30',
  amber:    '#FF9500',
  purple:   '#AF52DE',
  text:     '#000000',
  text2:    '#3C3C43',
  text3:    '#3C3C4399',
  text4:    '#8E8E93',
  label:    '#6B6B6B',
};

// ── Apple-style UI components ─────────────────────────────────────────────────
function Field({ label, required, hint, children }) {
  return (
    <div>
      <div style={{ fontSize:12, fontWeight:600, color:T.label, letterSpacing:'.02em', marginBottom:5, textTransform:'uppercase' }}>
        {label}{required && <span style={{ color:T.red }}> *</span>}
      </div>
      {children}
      {hint && <div style={{ fontSize:11.5, color:T.text4, marginTop:4, lineHeight:1.4 }}>{hint}</div>}
    </div>
  );
}

function Inp({ ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input {...props}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
      style={{
        width:'100%', height:44, padding:'0 13px',
        borderRadius:11, fontFamily:'inherit', fontSize:15, color:T.text,
        background: props.readOnly ? T.surface2 : T.surface,
        border:`1.5px solid ${focused ? T.accent : T.border}`,
        outline:'none', transition:'border-color .15s',
        boxShadow: focused ? `0 0 0 3px ${T.accent}18` : 'none',
        ...(props.style||{}),
      }}/>
  );
}

function Sel({ children, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <select {...props}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width:'100%', height:44, padding:'0 13px',
        borderRadius:11, fontFamily:'inherit', fontSize:15, color:T.text,
        background:T.surface, border:`1.5px solid ${focused ? T.accent : T.border}`,
        outline:'none', appearance:'none', transition:'border-color .15s',
        boxShadow: focused ? `0 0 0 3px ${T.accent}18` : 'none',
        ...(props.style||{}),
      }}>
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:T.surface, borderRadius:11, border:`1.5px solid ${checked ? T.accent+'40' : T.border}`, cursor:'pointer', transition:'all .15s' }}
      onClick={() => onChange(!checked)}>
      <div>
        <div style={{ fontSize:14.5, fontWeight:500, color:T.text }}>{label}</div>
        {hint && <div style={{ fontSize:12, color:T.text4, marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ width:51, height:31, borderRadius:999, background:checked?T.accent:'#E5E5EA', padding:2, display:'flex', alignItems:'center', justifyContent:checked?'flex-end':'flex-start', transition:'all .22s', flexShrink:0, marginLeft:12 }}>
        <div style={{ width:27, height:27, borderRadius:'50%', background:'#fff', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}/>
      </div>
    </div>
  );
}

function IBtn({ icon: Icon, onClick, title, danger, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button title={title}
      onClick={e => { e.stopPropagation(); if (!disabled) onClick(e); }}
      disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width:32, height:32, borderRadius:9, border:`1px solid ${h&&!disabled ? (danger?T.red+'50':T.accent+'40') : T.border}`, background: h&&!disabled ? (danger?'#FFF0EF':T.accent+'10') : T.surface, cursor:disabled?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .12s', opacity:disabled?.35:1, flexShrink:0 }}>
      <Icon size={13} color={h&&!disabled ? (danger?T.red:T.accent) : T.text4} strokeWidth={2}/>
    </button>
  );
}

function Notif({ msg, type, onHide }) {
  if (!msg) return null;
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:9999, padding:'12px 18px', background:type==='error'?'#FFF0EF':'#F0FFF4', border:`1px solid ${type==='error'?T.red+'30':'#34C75940'}`, borderRadius:12, fontSize:13.5, color:type==='error'?T.red:T.green, display:'flex', gap:10, alignItems:'center', boxShadow:'0 8px 32px rgba(0,0,0,.12)', maxWidth:340 }}>
      {msg}
      <button onClick={onHide} style={{ background:'none', border:'none', color:'currentColor', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, marginLeft:4 }}>×</button>
    </div>
  );
}

const BLANK = {
  companyName:'', branch:'Head Office', totalChitValue:'', totalMembers:'',
  auctionInterval:'1', startDate:'', commissionType:'Single',
  managerCommissionPct:'5', slabType:'Fixed', slabValue:'',
  commissionBase:'On Total', auctionDay:'15',
  companyIncluded: false,   // ← KEY NEW FIELD
  range1:'', range2:'', range3:'', range4:'',
};

export default function ChitList() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [chits,      setChits]      = useState([]);
  const [schedules,  setSchedules]  = useState({});
  const [loading,    setLoading]    = useState(true);
  const [loadErr,    setLoadErr]    = useState('');
  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState('all');
  const [notif,      setNotif]      = useState({ msg:'', type:'success' });
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(BLANK);
  const [step,       setStep]       = useState(1);
  const [members,    setMembers]    = useState([{ name:'', phone:'' }]);
  const [saving,     setSaving]     = useState(false);
  const [formErr,    setFormErr]    = useState('');
  const [delTarget,  setDelTarget]  = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const [deleting,   setDeleting]   = useState(false);

  const showNotif = (msg, type='success') => { setNotif({ msg, type }); setTimeout(() => setNotif({ msg:'', type:'success' }), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const data = await getDashboardData(user.uid);
      setChits(data.chits || []);
      setSchedules(data.schedules || {});
    } catch { setLoadErr('Failed to load — check connection'); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Key derived values
  const sub    = form.totalChitValue && form.totalMembers ? calcPerHeadValue(+form.totalChitValue, +form.totalMembers) : 0;
  const phases = form.totalMembers ? calcPhases(+form.totalMembers) : [];

  // External member slots = totalMembers - (companyIncluded ? 1 : 0)
  const externalSlots = form.totalMembers ? Math.max(0, +form.totalMembers - (form.companyIncluded ? 1 : 0)) : 0;

  function openCreate() { setForm(BLANK); setStep(1); setFormErr(''); setMembers([{name:'',phone:''}]); setShowCreate(true); }
  function openEdit(c) {
    setEditTarget(c);
    setForm({
      companyName: c.companyName||'', branch: c.branch||'Head Office',
      totalChitValue: String(c.totalChitValue||''), totalMembers: String(c.totalMembers||''),
      auctionInterval: String(c.auctionInterval||1),
      startDate: c.startDate?.seconds ? new Date(c.startDate.seconds*1000).toISOString().slice(0,10) : (c.startDate||''),
      commissionType: c.commissionType||'Single',
      managerCommissionPct: String(c.managerCommissionPct??5),
      slabType: c.slabType||'Fixed', slabValue: String(c.slabValue||''),
      commissionBase: c.commissionBase||'On Total', auctionDay: String(c.auctionDay||15),
      companyIncluded: c.companyIncluded || false,
      range1: String(c.range_phase1||c.range1||''), range2: String(c.range_phase2||c.range2||''),
      range3: String(c.range_phase3||c.range3||''), range4: String(c.range_phase4||c.range4||''),
    });
    setFormErr(''); setShowCreate(true);
  }
  function closeCreate() { setShowCreate(false); setEditTarget(null); setForm(BLANK); setStep(1); setFormErr(''); }

  async function handleNext() {
    setFormErr('');
    if (!form.companyName.trim())                            return setFormErr('Chit name is required.');
    if (!form.totalChitValue || +form.totalChitValue <= 0)   return setFormErr('Chit value must be greater than 0.');
    if (!form.totalMembers   || +form.totalMembers < 2)      return setFormErr('Minimum 2 total members.');
    if (!form.startDate)                                     return setFormErr('Start date is required.');
    if (!form.slabValue || +form.slabValue <= 0)             return setFormErr('Slab value is required.');
    if (form.slabType === 'Fixed' && sub > 0 && +form.slabValue > sub)
      return setFormErr(`Slab (${fmt(+form.slabValue)}) cannot exceed per-head (${fmt(sub)}).`);
    if (editTarget) { await handleSave(); return; }
    setMembers(Array.from({ length: externalSlots }, (_, i) => members[i] || { name:'', phone:'' }));
    setStep(2);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        totalChitValue:      +form.totalChitValue,
        totalMembers:        +form.totalMembers,
        auctionInterval:     +form.auctionInterval,
        managerCommissionPct:+form.managerCommissionPct,
        slabValue:           +form.slabValue,
        auctionDay:          +form.auctionDay || 15,
        companyIncluded:     form.companyIncluded,
        range_phase1:        +form.range1 || 0,
        range_phase2:        +form.range2 || 0,
        range_phase3:        +form.range3 || 0,
        range_phase4:        +form.range4 || 0,
      };
      if (editTarget) {
        await updateChit(editTarget.id, payload, user.uid);
        showNotif('Chit updated successfully');
      } else {
        const named = members.filter(m => m.name.trim());
        const id = await createChit(payload, user.uid);
        if (named.length) await Promise.all(named.map(m => addMember(id, m, user.uid)));
        closeCreate(); load();
        showNotif('Chit fund created!');
        nav(`/cf/chits/${id}`); return;
      }
      closeCreate(); load();
    } catch(e) {
      setFormErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteClick(e, c) {
    e.stopPropagation();
    if (delConfirm === c.id) {
      setDelTarget(c); setDelConfirm(null);
    } else {
      setDelConfirm(c.id);
      showNotif(`Click delete again to confirm: "${c.companyName}"`, 'error');
      setTimeout(() => setDelConfirm(id => id === c.id ? null : id), 4000);
    }
  }

  async function confirmDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try { await deleteChit(delTarget.id, user.uid); setDelTarget(null); showNotif(`Deleted "${delTarget.companyName}"`); load(); }
    catch(e) { showNotif(e.message, 'error'); }
    finally { setDeleting(false); }
  }

  // Derived
  const active   = chits.filter(c => c.status === 'Active');
  const closed   = chits.filter(c => c.status !== 'Active');
  const tabMap   = { all:chits, active, closed };
  const filtered = (tabMap[activeTab]||chits).filter(c => !search || c.companyName?.toLowerCase().includes(search.toLowerCase()) || c.branch?.toLowerCase().includes(search.toLowerCase()));
  const totalMonthly = active.reduce((s,c) => { const isTaken=c.companyTakenAuction!==null&&c.companyTakenAuction!==undefined; const slab=c.slabType==='Fixed'?(c.slabValue||0):Math.round((c.totalChitValue||0)*(c.slabValue||0)/100); return s+(isTaken?(c.perHeadValue||0):slab); }, 0);

  if (loading) return <PageLoader stats={4}/>;

  return (
    <div style={{ background:T.bg, minHeight:'100vh', padding:'0 0 40px' }}>
      <Notif msg={notif.msg} type={notif.type} onHide={() => setNotif({msg:'',type:'success'})}/>

      {/* ── Page Header ── */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'20px 24px', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <div>
            <h1 style={{ margin:0, fontSize:28, fontWeight:700, color:T.text, letterSpacing:'-.5px' }}>Chit Funds</h1>
            <p style={{ margin:'4px 0 0', fontSize:14, color:T.text4 }}>Manage your formed chit funds</p>
          </div>
          <button onClick={openCreate}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'11px 20px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontSize:14.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 14px ${T.accent}40` }}>
            <Plus size={16}/> New Chit Fund
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10, marginTop:18 }}>
          {[
            { label:'Total Funds',    val:chits.length,                                                                    color:T.text },
            { label:'Portfolio Value',val:fmt(active.reduce((s,c)=>s+(c.totalChitValue||0),0)),                            color:T.accent },
            { label:'Commission',     val:fmt(chits.reduce((s,c)=>s+(c.totalCommissionEarned||0),0)),                      color:T.green },
            { label:'Monthly Outflow',val:fmt(totalMonthly),                                                               color:T.red },
          ].map((k,i) => (
            <div key={i} style={{ background:T.surface2, borderRadius:12, padding:'12px 14px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:11, color:T.text4, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:5 }}>{k.label}</div>
              <div style={{ fontSize:19, fontWeight:700, color:k.color, letterSpacing:'-.3px' }}>{k.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding:'0 24px' }}>
        {/* Error */}
        {loadErr && (
          <div style={{ marginBottom:16, padding:'12px 16px', background:'#FFF0EF', border:`1px solid ${T.red}30`, borderRadius:12, fontSize:13.5, color:T.red, display:'flex', gap:8, alignItems:'center' }}>
            <AlertTriangle size={15}/> {loadErr}
            <button onClick={load} style={{ marginLeft:'auto', background:'none', border:'none', color:T.accent, cursor:'pointer', fontSize:13, fontFamily:'inherit', fontWeight:600 }}>Retry</button>
          </div>
        )}

        {/* Tabs + search */}
        <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
          {/* Segmented control — Apple style */}
          <div style={{ display:'inline-flex', background:T.surface2, borderRadius:10, padding:3, border:`1px solid ${T.border}` }}>
            {[['all',`All (${chits.length})`],['active',`Active (${active.length})`],['closed',`Closed (${closed.length})`]].map(([t,l]) => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ padding:'6px 14px', fontSize:13, fontWeight:activeTab===t?600:400, borderRadius:8, border:'none', background:activeTab===t?T.surface:'transparent', color:activeTab===t?T.text:T.text4, cursor:'pointer', fontFamily:'inherit', boxShadow:activeTab===t?'0 1px 4px rgba(0,0,0,0.1)':'none', transition:'all .15s' }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ position:'relative', marginLeft:'auto' }}>
            <Search size={14} color={T.text4} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ paddingLeft:32, paddingRight:12, height:38, background:T.surface, border:`1.5px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:13.5, fontFamily:'inherit', outline:'none', width:180 }}/>
          </div>
        </div>

        {/* Chit list */}
        {filtered.length === 0 ? (
          <div style={{ background:T.surface, borderRadius:16, border:`1px solid ${T.border}`, padding:'52px 24px', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:14 }}>💰</div>
            <div style={{ fontSize:17, fontWeight:600, color:T.text2, marginBottom:6 }}>
              {search ? 'No matching chit funds' : 'No chit funds yet'}
            </div>
            <div style={{ fontSize:14, color:T.text4, marginBottom:20 }}>
              {search ? 'Try a different search term' : 'Create your first chit fund to get started'}
            </div>
            {!search && (
              <button onClick={openCreate}
                style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'11px 20px', borderRadius:12, border:'none', background:T.accent, color:'#fff', fontSize:14.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                <Plus size={15}/> Create Chit Fund
              </button>
            )}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map(c => {
              const done = c.auctionsCompleted || 0;
              const pct  = c.totalMembers ? Math.round(done/c.totalMembers*100) : 0;
              const isTaken = c.companyTakenAuction !== null && c.companyTakenAuction !== undefined;
              const sched = schedules[c.id] || [];
              const next  = sched.find(a => a.status === 'Pending');
              const nextDate = next?.auctionDate ? (next.auctionDate?.seconds ? new Date(next.auctionDate.seconds*1000) : new Date(next.auctionDate)) : null;
              const daysToNext = nextDate ? Math.floor((nextDate-new Date())/86400000) : null;
              const isUrgent   = daysToNext !== null && daysToNext >= 0 && daysToNext <= 2;
              const isOverdue  = daysToNext !== null && daysToNext < 0;
              const isDelConf  = delConfirm === c.id;

              return (
                <div key={c.id}
                  onClick={() => nav(`/cf/chits/${c.id}`)}
                  style={{ background:T.surface, borderRadius:16, border:`1.5px solid ${isDelConf?T.red+'40':isUrgent?T.amber+'40':T.border}`, padding:'16px 18px', cursor:'pointer', transition:'all .18s', position:'relative', overflow:'hidden' }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>

                  {/* Urgency bar */}
                  {(isUrgent||isOverdue) && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:isOverdue?T.red:T.amber, borderRadius:'16px 16px 0 0' }}/>}

                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                    {/* Left info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
                        <span style={{ fontSize:16, fontWeight:700, color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.companyName}</span>
                        {/* Company included badge */}
                        {c.companyIncluded && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:600, padding:'2px 7px', borderRadius:6, background:'#F0F5FF', color:T.accent, border:`1px solid ${T.accent}25` }}>
                            <Building2 size={9}/> Co. included
                          </span>
                        )}
                        <span style={{ fontSize:10.5, fontWeight:600, padding:'2px 7px', borderRadius:6, background:isTaken?'#F0FFF4':isOverdue?'#FFF0EF':isUrgent?'#FFF8F0':'#F0F5FF', color:isTaken?T.green:isOverdue?T.red:isUrgent?T.amber:T.accent, border:`1px solid ${isTaken?T.green+'25':isOverdue?T.red+'25':isUrgent?T.amber+'25':T.accent+'25'}` }}>
                          {isTaken?'Cashed':isOverdue?'Overdue':isUrgent?'Due soon':'Active'}
                        </span>
                      </div>
                      <div style={{ fontSize:12.5, color:T.text4, display:'flex', gap:10, flexWrap:'wrap' }}>
                        <span>{fmt(c.totalChitValue)} · {c.totalMembers} members</span>
                        <span>·</span>
                        <span>Sub: {fmt(c.perHeadValue)}/head</span>
                        <span>·</span>
                        <span>{c.commissionType} commission</span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                      <IBtn icon={Edit2}       onClick={() => openEdit(c)}              title="Edit"/>
                      <IBtn icon={Eye}         onClick={() => nav(`/cf/chits/${c.id}`)} title="View"/>
                      <IBtn icon={Trash2}      onClick={e => handleDeleteClick(e, c)}
                        title={isDelConf?'Click again to confirm':'Delete'} danger/>
                      {isDelConf && <span style={{ fontSize:11, color:T.red, fontWeight:600, whiteSpace:'nowrap' }}>confirm?</span>}
                    </div>
                  </div>

                  {/* Progress + next auction */}
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12.5, color:T.text4 }}>
                      <span>{done}/{c.totalMembers} auctions</span>
                      <div style={{ display:'flex', gap:12 }}>
                        {nextDate && (
                          <span style={{ color:isOverdue?T.red:isUrgent?T.amber:T.text4, fontWeight:isUrgent||isOverdue?600:400 }}>
                            Next: {daysToNext===0?'Today!':daysToNext===1?'Tomorrow':nextDate.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                          </span>
                        )}
                        <span style={{ fontWeight:600, color:pct>=75?T.green:pct>=40?T.amber:T.accent }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height:5, background:T.surface2, borderRadius:3, overflow:'hidden' }}>
                      <div style={{ width:`${pct}%`, height:'100%', background:pct>=75?T.green:pct>=40?T.amber:T.accent, borderRadius:3, transition:'width .5s' }}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── CREATE / EDIT MODAL ─────────────────────────────────────────────── */}
      {showCreate && (
        <div onClick={closeCreate} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', padding:0 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:T.surface, borderRadius:'20px 20px 0 0', width:'100%', maxWidth:640, maxHeight:'94vh', overflowY:'auto', boxShadow:'0 -8px 48px rgba(0,0,0,0.2)' }}>

            {/* Handle */}
            <div style={{ display:'flex', justifyContent:'center', padding:'12px 0 0' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:T.border }}/>
            </div>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px 12px', borderBottom:`1px solid ${T.border}` }}>
              <div>
                <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:T.text }}>
                  {editTarget ? `Edit — ${editTarget.companyName}` : step===1 ? 'New Chit Fund' : `Add Members — ${form.companyName}`}
                </h2>
                {!editTarget && <div style={{ fontSize:12.5, color:T.text4, marginTop:2 }}>Step {step} of 2</div>}
              </div>
              <button onClick={closeCreate}
                style={{ width:30, height:30, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={14} color={T.text4}/>
              </button>
            </div>

            <div style={{ padding:'18px 20px' }}>
              {formErr && (
                <div style={{ marginBottom:16, padding:'12px 15px', background:'#FFF0EF', borderRadius:11, fontSize:13.5, color:T.red, display:'flex', gap:8, alignItems:'center' }}>
                  <AlertTriangle size={14}/> {formErr}
                </div>
              )}

              {/* ── Step 1: Chit Details ── */}
              {(step===1 || editTarget) && (
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                  {/* Chit Name */}
                  <Field label="Chit Fund Name" required>
                    <Inp value={form.companyName} onChange={e=>sf('companyName',e.target.value)} placeholder="e.g. Sri Murugan Chit Fund — Group A" autoFocus/>
                  </Field>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <Field label="Chit Value (₹)" required>
                      <Inp type="number" value={form.totalChitValue} onChange={e=>sf('totalChitValue',e.target.value)} placeholder="e.g. 2500000"/>
                    </Field>
                    <Field label="Total Members (incl. co.)" required hint={form.companyIncluded ? `External members: ${externalSlots}` : 'All are external members'}>
                      <Inp type="number" value={form.totalMembers} onChange={e=>sf('totalMembers',e.target.value)} placeholder="e.g. 20"/>
                    </Field>
                  </div>

                  {/* Per head display */}
                  {sub > 0 && (
                    <div style={{ padding:'10px 14px', background:'#F0F5FF', borderRadius:11, border:`1px solid ${T.accent}20`, display:'flex', gap:20, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:11, color:T.accent, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Per Head / Subscription</div>
                        <div style={{ fontSize:20, fontWeight:700, color:T.accent }}>{fmt(sub)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:T.text4, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Total Auctions</div>
                        <div style={{ fontSize:20, fontWeight:700, color:T.text2 }}>{form.totalMembers}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:T.text4, fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>Duration</div>
                        <div style={{ fontSize:20, fontWeight:700, color:T.text2 }}>{form.totalMembers && form.auctionInterval ? (+form.totalMembers * +form.auctionInterval) + ' mo' : '—'}</div>
                      </div>
                    </div>
                  )}

                  {/* Company included toggle — THE KEY NEW FEATURE */}
                  <Toggle
                    checked={form.companyIncluded}
                    onChange={v => sf('companyIncluded', v)}
                    label="Company is a Member"
                    hint={form.companyIncluded
                      ? `Company holds 1 slot → you add ${externalSlots} external members. In auctions, company appears as a winner option.`
                      : 'Company is NOT a member — all slots are external members. No "company wins" in auctions.'}
                  />

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <Field label="Start Date" required>
                      <Inp type="date" value={form.startDate} onChange={e=>sf('startDate',e.target.value)}/>
                    </Field>
                    <Field label="Auction Every (months)">
                      <Inp type="number" value={form.auctionInterval} onChange={e=>sf('auctionInterval',e.target.value)} placeholder="1"/>
                    </Field>
                    <Field label="Organiser Fee" hint={parseFloat(form.managerCommissionPct) > 0 ? 'Manager earns a commission each round' : 'Interest-free chit — no organiser fee'}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div onClick={()=>sf('managerCommissionPct', parseFloat(form.managerCommissionPct) > 0 ? '0' : '5')} style={{ width:51, height:31, borderRadius:999, background: parseFloat(form.managerCommissionPct) > 0 ? T.accent : '#E5E5EA', padding:2, display:'flex', alignItems:'center', justifyContent: parseFloat(form.managerCommissionPct) > 0 ? 'flex-end':'flex-start', transition:'all .22s', flexShrink:0, cursor:'pointer' }}><div style={{ width:27, height:27, borderRadius:'50%', background:'#fff', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}/></div>
                        <span style={{ fontSize:13.5, fontWeight:700, color: parseFloat(form.managerCommissionPct) > 0 ? T.accent : T.text4, minWidth:28 }}>{parseFloat(form.managerCommissionPct) > 0 ? 'Yes' : 'No'}</span>
                        {parseFloat(form.managerCommissionPct) > 0 && (<div style={{ flex:1, display:'flex', alignItems:'center', gap:6, maxWidth:130 }}><Inp type="number" step="0.1" min="0" max="5" value={form.managerCommissionPct} onChange={e=>sf('managerCommissionPct',e.target.value)} placeholder="5"/><span style={{ fontSize:14, fontWeight:600, color:T.text4 }}>%</span></div>)}
                      </div>
                    </Field>
                    <Field label="Commission Type">
                      <Sel value={form.commissionType} onChange={e=>sf('commissionType',e.target.value)}>
                        <option value="Single">Single commission</option>
                        <option value="Double">Double commission</option>
                      </Sel>
                    </Field>
                    <Field label="Slab Type" hint="Investment when not yet taken">
                      <Sel value={form.slabType} onChange={e=>sf('slabType',e.target.value)}>
                        <option value="Fixed">Fixed Amount (₹)</option>
                        <option value="Percentage">Percentage (%)</option>
                      </Sel>
                    </Field>
                    <Field label={form.slabType==='Fixed'?'Slab Amount (₹)':'Slab (%)'} required>
                      <Inp type="number" step="0.1" value={form.slabValue} onChange={e=>sf('slabValue',e.target.value)} placeholder={form.slabType==='Fixed'?'e.g. 45000':'e.g. 5'}/>
                    </Field>
                    <Field label="Auction Day of Month">
                      <Inp type="number" value={form.auctionDay} onChange={e=>sf('auctionDay',e.target.value)} placeholder="15"/>
                    </Field>
                    <Field label="Branch">
                      <Inp value={form.branch} onChange={e=>sf('branch',e.target.value)} placeholder="Head Office"/>
                    </Field>
                  </div>

                  {/* Phase ranges */}
                  {phases.length > 0 && (
                    <div style={{ padding:'14px', background:T.surface2, borderRadius:12, border:`1px solid ${T.border}` }}>
                      <div style={{ fontSize:12, fontWeight:700, color:T.label, textTransform:'uppercase', letterSpacing:'.04em', marginBottom:6 }}>
                        Commission Range Estimates
                      </div>
                      <div style={{ fontSize:13, color:T.text3, marginBottom:12, lineHeight:1.6 }}>
                        Enter <strong style={{ color:T.text }}>what you pay per round</strong> (net after commission). Phases split evenly.{' '}
                        {sub > 0 && <span style={{ color:T.accent, fontWeight:500 }}>Sub = {fmt(sub)} · Phase size = {Math.ceil(+form.totalMembers/4)} rounds each</span>}
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                        {phases.map((p,i) => {
                          const keys = ['range1','range2','range3','range4'];
                          const phs  = ['e.g. 45000','e.g. 50000','e.g. 55000','e.g. 60000'];
                          const v = +form[keys[i]] || 0;
                          const comm = sub > 0 && v > 0 ? Math.round(sub - v) : 0;
                          return (
                            <Field key={i} label={`Rounds ${p.startRound}–${p.endRound}${comm>0?` (+${comm.toLocaleString('en-IN')} commission)`:''}`}>
                              <Inp type="number" value={form[keys[i]]} onChange={e=>sf(keys[i],e.target.value)} placeholder={phs[i]}/>
                            </Field>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 2: Members ── */}
              {step===2 && !editTarget && (
                <div>
                  {/* Summary */}
                  <div style={{ padding:'13px 16px', background:'#F0F5FF', borderRadius:12, marginBottom:16, display:'flex', gap:20, flexWrap:'wrap', border:`1px solid ${T.accent}20` }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:T.accent }}>{fmt(sub)}</div>
                      <div style={{ fontSize:11, color:T.text4, marginTop:1 }}>Per Head</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:T.text }}>{form.totalMembers}</div>
                      <div style={{ fontSize:11, color:T.text4, marginTop:1 }}>Total Members</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:form.companyIncluded?T.accent:T.text }}>{externalSlots}</div>
                      <div style={{ fontSize:11, color:T.text4, marginTop:1 }}>External Slots</div>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:700, color:T.green }}>{members.filter(m=>m.name.trim()).length}</div>
                      <div style={{ fontSize:11, color:T.text4, marginTop:1 }}>Named</div>
                    </div>
                  </div>

                  {/* Company slot notice */}
                  {form.companyIncluded && (
                    <div style={{ marginBottom:14, padding:'11px 14px', background:'#F0F5FF', borderRadius:11, fontSize:13, color:T.accent, border:`1px solid ${T.accent}25`, display:'flex', gap:8, alignItems:'center' }}>
                      <Building2 size={14}/>
                      Company holds 1 slot (slot #{+form.totalMembers}). Add up to <strong>{externalSlots}</strong> external members below.
                    </div>
                  )}

                  {/* Header row */}
                  <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 1fr 30px', gap:8, marginBottom:6, fontSize:11, fontWeight:600, color:T.text4, textTransform:'uppercase', letterSpacing:'.04em' }}>
                    <span/><span>Name</span><span>Phone (optional)</span><span/>
                  </div>
                  <div style={{ maxHeight:300, overflowY:'auto' }}>
                    {members.map((m,i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 1fr 1fr 30px', gap:8, alignItems:'center', marginBottom:7 }}>
                        <span style={{ fontSize:12, color:T.text4, textAlign:'center', fontWeight:500 }}>{i+1}</span>
                        <Inp value={m.name} onChange={e=>setMembers(ms=>ms.map((r,j)=>j===i?{...r,name:e.target.value}:r))} placeholder={`Member ${i+1}`} style={{ height:38, fontSize:13.5 }}/>
                        <Inp value={m.phone} onChange={e=>setMembers(ms=>ms.map((r,j)=>j===i?{...r,phone:e.target.value}:r))} placeholder="Phone" style={{ height:38, fontSize:13.5 }}/>
                        <button onClick={()=>setMembers(ms=>ms.filter((_,j)=>j!==i))} disabled={members.length<=1}
                          style={{ width:30, height:30, borderRadius:8, border:`1px solid ${members.length>1?T.red+'30':T.border}`, background:members.length>1?'#FFF0EF':T.surface2, cursor:members.length>1?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', opacity:members.length>1?1:.35 }}>
                          <X size={12} color={T.red}/>
                        </button>
                      </div>
                    ))}
                  </div>
                  {members.length < externalSlots && (
                    <button onClick={()=>setMembers(ms=>[...ms,{name:'',phone:''}])}
                      style={{ marginTop:10, width:'100%', padding:'10px', background:'none', border:`1.5px dashed ${T.border}`, borderRadius:11, color:T.accent, fontSize:13.5, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
                      + Add Member
                    </button>
                  )}
                  <p style={{ margin:'10px 0 0', fontSize:12, color:T.text4, lineHeight:1.5 }}>
                    Empty rows are skipped. You can add more members later from the chit detail page.
                  </p>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display:'flex', gap:8, marginTop:22, justifyContent:'flex-end', flexWrap:'wrap' }}>
                {step===2 && !editTarget && (
                  <button onClick={() => {setStep(1);setFormErr('');}}
                    style={{ padding:'11px 18px', borderRadius:11, border:`1.5px solid ${T.border}`, background:T.surface, fontSize:14, cursor:'pointer', fontFamily:'inherit', color:T.text3 }}>
                    ← Back
                  </button>
                )}
                <button onClick={closeCreate}
                  style={{ padding:'11px 18px', borderRadius:11, border:`1.5px solid ${T.border}`, background:T.surface, fontSize:14, cursor:'pointer', fontFamily:'inherit', color:T.text3 }}>
                  Cancel
                </button>
                <button
                  onClick={editTarget ? handleSave : step===2 ? handleSave : handleNext}
                  disabled={saving}
                  style={{ padding:'11px 24px', borderRadius:11, border:'none', background:saving?T.accent+'80':T.accent, color:'#fff', fontSize:14.5, fontWeight:600, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', boxShadow:`0 4px 14px ${T.accent}35` }}>
                  {saving ? 'Saving…' : editTarget ? 'Save Changes' : step===1 ? 'Next: Add Members →' : '✓ Create Chit Fund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ─── */}
      {delTarget && (
        <div onClick={() => setDelTarget(null)} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, borderRadius:'20px 20px 0 0', width:'100%', maxWidth:500, padding:'22px 22px 32px', boxShadow:'0 -8px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
              <div style={{ width:36, height:4, borderRadius:2, background:T.border }}/>
            </div>
            <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:18 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:'#FFF0EF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Trash2 size={19} color={T.red}/>
              </div>
              <div>
                <p style={{ margin:'0 0 7px', fontSize:16, fontWeight:700, color:T.text }}>Delete "{delTarget.companyName}"?</p>
                <p style={{ margin:0, fontSize:13.5, color:T.text3, lineHeight:1.7 }}>
                  Permanently deletes all member records and auction schedule.
                  {(delTarget.auctionsCompleted||0) > 0 && ` This chit has ${delTarget.auctionsCompleted} completed auction${delTarget.auctionsCompleted>1?'s':''} — their payment records will also be deleted.`}
                </p>
              </div>
            </div>
            <button onClick={confirmDelete} disabled={deleting}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:T.red, color:'#fff', fontSize:15, fontWeight:700, cursor:deleting?'not-allowed':'pointer', fontFamily:'inherit', marginBottom:10, opacity:deleting?.7:1 }}>
              {deleting?'Deleting…':'Delete Permanently'}
            </button>
            <button onClick={() => setDelTarget(null)}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:`1.5px solid ${T.border}`, background:T.surface, color:T.text3, fontSize:15, cursor:'pointer', fontFamily:'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
