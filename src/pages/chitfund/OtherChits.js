/**
 * OtherChits.js
 * Track chits put on other people / organizations.
 * Each "other chit" = a chit you participate in (not manage).
 * You track: which company runs it, your member number, monthly contribution,
 * when you've taken (or plan to take), and all monthly payments.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, CheckCircle, Clock, TrendingUp, Wallet, AlertTriangle, X, Calendar, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getOtherChits, addOtherChit, updateOtherChit, deleteOtherChit,
  getOtherChitPayments, addOtherChitPayment, updateOtherChitPayment,
} from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import { Card, PageHeader, StatCard, SectionHeader, Badge, tokens, Button, FormField, Input, Select, Modal } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

function today() { return new Date().toISOString().split('T')[0]; }
function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
function fmtMo(m) { if (!m) return '—'; try { return new Date(m+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'}); } catch { return m; } }
function fmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d; } }
function fmt(v) { return formatCurrency(v||0); }
function IBtn({ icon: Icon, onClick, danger, title }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={e=>{e.stopPropagation();onClick(e);}}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{width:28,height:28,borderRadius:7,border:`1px solid ${h?(danger?tokens.red:'#c8d0e2'):tokens.border}`,background:h?(danger?tokens.redLight:tokens.blueLight):'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.12s'}}>
      <Icon size={12} color={h?(danger?tokens.red:tokens.blue):tokens.textSub} strokeWidth={2}/>
    </button>
  );
}

const BLANK = {
  companyName:'', organiserName:'', organiserPhone:'',
  totalChitValue:'', totalMembers:'', myMemberNumber:'',
  monthlyContribution:'', startDate:'', auctionInterval:'1',
  expectedTakeMonth:'', status:'Active', notes:'',
};

export default function OtherChits() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  // Modals
  const [addModal, setAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [delTarget, setDelTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Payment modal
  const [payChit, setPayChit] = useState(null);
  const [payMonth, setPayMonth] = useState(curMonth());
  const [payAmount, setPayAmount] = useState('');
  const [payStatus, setPayStatus] = useState('Paid');
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getOtherChits(user.uid);
    setChits(list);
    const pm = {};
    await Promise.all(list.map(async c => {
      pm[c.id] = await getOtherChitPayments(c.id);
    }));
    setPaymentsMap(pm);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const setF = (k,v) => setForm(f => ({...f,[k]:v}));

  function openAdd() { setForm(BLANK); setFormErr(''); setAddModal(true); }
  function openEdit(c) { setEditTarget(c); setForm({ companyName:c.companyName||'', organiserName:c.organiserName||'', organiserPhone:c.organiserPhone||'', totalChitValue:String(c.totalChitValue||''), totalMembers:String(c.totalMembers||''), myMemberNumber:String(c.myMemberNumber||''), monthlyContribution:String(c.monthlyContribution||''), startDate:c.startDate||'', auctionInterval:String(c.auctionInterval||'1'), expectedTakeMonth:c.expectedTakeMonth||'', status:c.status||'Active', notes:c.notes||'' }); setFormErr(''); }

  async function handleSave() {
    if (!form.companyName.trim()) return setFormErr('Company name is required');
    if (!form.totalChitValue || !form.monthlyContribution) return setFormErr('Chit value and monthly contribution are required');
    setSaving(true);
    try {
      const data = { ...form, totalChitValue:+form.totalChitValue, totalMembers:+form.totalMembers||0, myMemberNumber:+form.myMemberNumber||0, monthlyContribution:+form.monthlyContribution, auctionInterval:+form.auctionInterval||1 };
      if (editTarget) { await updateOtherChit(editTarget.id, data, user.uid); setEditTarget(null); }
      else { await addOtherChit(data, user.uid); setAddModal(false); }
      load();
    } catch(e) { setFormErr(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await deleteOtherChit(delTarget.id, user.uid); setDelTarget(null); load(); }
    catch(e) { alert(e.message); }
    finally { setDeleting(false); }
  }

  async function handleAddPayment() {
    if (!payChit || !payMonth || !payAmount) return;
    setPaySaving(true);
    try {
      // Check if payment for this month exists
      const existing = (paymentsMap[payChit.id]||[]).find(p=>p.month===payMonth);
      if (existing) {
        await updateOtherChitPayment(existing.id, { amount:+payAmount, status:payStatus, notes:payNote });
      } else {
        await addOtherChitPayment(payChit.id, { month:payMonth, amount:+payAmount, status:payStatus, notes:payNote, date:today() }, user.uid);
      }
      setPayChit(null);
      load();
    } catch(e) { alert(e.message); }
    finally { setPaySaving(false); }
  }

  async function togglePayment(chitId, payment) {
    const next = payment.status === 'Paid' ? 'Pending' : 'Paid';
    await updateOtherChitPayment(payment.id, { status: next });
    setPaymentsMap(pm => ({ ...pm, [chitId]: pm[chitId].map(p => p.id===payment.id ? {...p,status:next} : p) }));
  }

  // ── Urgency logic ─────────────────────────────────────────────────────────
  function getUrgency(chit) {
    const paysArr = paymentsMap[chit.id] || [];
    const cur = curMonth();
    const thisMoPaid = paysArr.find(p => p.month === cur && p.status === 'Paid');
    const prevMo = (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
    const prevMoPaid = paysArr.find(p => p.month === prevMo && p.status === 'Paid');
    const unpaidMonths = [!thisMoPaid && cur, !prevMoPaid && prevMo].filter(Boolean);

    // Should take chit suggestion
    const totalPaid = paysArr.filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.amount||0),0);
    const monthsElapsed = paysArr.length;
    const paidFraction = chit.totalMembers > 0 ? monthsElapsed / chit.totalMembers : 0;
    const shouldConsiderTaking = !chit.expectedTakeMonth && paidFraction > 0.5 && chit.status === 'Active';
    const takeSoon = chit.expectedTakeMonth && chit.expectedTakeMonth <= curMonth() && !chit.actualTakeMonth;

    return { unpaidMonths, totalPaid, shouldConsiderTaking, takeSoon };
  }

  // ── Derived totals ────────────────────────────────────────────────────────
  const activeChits = chits.filter(c => c.status === 'Active');
  const totalMonthly = activeChits.reduce((s,c) => s + (c.monthlyContribution||0), 0);
  const totalTakenValue = chits.filter(c=>c.actualTakeMonth).reduce((s,c)=>s+(c.totalChitValue||0),0);
  const totalPaidAll = Object.values(paymentsMap).flat().filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.amount||0),0);

  const FormContent = () => (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        <div style={{gridColumn:'1/-1'}}>
          <FormField label="Chit Company / Organisation Name" required>
            <Input value={form.companyName} onChange={e=>setF('companyName',e.target.value)} placeholder="e.g. Shriram Chit Fund"/>
          </FormField>
        </div>
        <FormField label="Organiser / Agent Name">
          <Input value={form.organiserName} onChange={e=>setF('organiserName',e.target.value)} placeholder="Organiser name"/>
        </FormField>
        <FormField label="Organiser Phone">
          <Input value={form.organiserPhone} onChange={e=>setF('organiserPhone',e.target.value)} type="tel" placeholder="9876543210"/>
        </FormField>
        <FormField label="Total Chit Value (₹)" required>
          <Input type="number" value={form.totalChitValue} onChange={e=>setF('totalChitValue',e.target.value)} placeholder="500000"/>
        </FormField>
        <FormField label="Total Members">
          <Input type="number" value={form.totalMembers} onChange={e=>setF('totalMembers',e.target.value)} placeholder="20"/>
        </FormField>
        <FormField label="My Member Number">
          <Input type="number" value={form.myMemberNumber} onChange={e=>setF('myMemberNumber',e.target.value)} placeholder="5"/>
        </FormField>
        <FormField label="Monthly Contribution (₹)" required>
          <Input type="number" value={form.monthlyContribution} onChange={e=>setF('monthlyContribution',e.target.value)} placeholder="25000"/>
        </FormField>
        <FormField label="Start Date" required>
          <Input type="date" value={form.startDate} onChange={e=>setF('startDate',e.target.value)}/>
        </FormField>
        <FormField label="Auction Every (months)">
          <Input type="number" value={form.auctionInterval} onChange={e=>setF('auctionInterval',e.target.value)} placeholder="1"/>
        </FormField>
        <FormField label="Plan to Take Chit (Month)" hint="YYYY-MM format">
          <Input type="month" value={form.expectedTakeMonth} onChange={e=>setF('expectedTakeMonth',e.target.value)}/>
        </FormField>
        <FormField label="Status">
          <Select value={form.status} onChange={e=>setF('status',e.target.value)}>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="Withdrawn">Withdrawn</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Notes">
        <Input value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Any notes about this chit…"/>
      </FormField>
      {form.totalChitValue && form.monthlyContribution && (
        <div style={{marginTop:12,padding:'12px 16px',background:tokens.blueLight,borderRadius:10,display:'flex',gap:20,flexWrap:'wrap'}}>
          {[
            {label:'Monthly', val:fmt(+form.monthlyContribution)},
            {label:'Total to Pay', val:fmt(+form.totalChitValue)},
            {label:'Expected Profit', val:fmt((+form.totalChitValue)-(+form.monthlyContribution*(+form.totalMembers||1)))},
          ].map((k,i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{fontSize:15,fontWeight:800,color:tokens.blue}}>{k.val}</div>
              <div style={{fontSize:10.5,color:tokens.textMuted,marginTop:2}}>{k.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) return <PageLoader stats={4}/>;

  return (
    <div>
      <PageHeader title="My Chits (Put on Others)"
        subtitle="Track chit funds where you are a member — monitor payments, urgency and take decisions"
        action={<Button icon={Plus} onClick={openAdd}>Add Chit on Others</Button>}/>

      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Active Chits" value={activeChits.length} sub={`${chits.length} total`} icon={Wallet} accent={tokens.blue}/>
        <StatCard label="Monthly Outflow" value={fmt(totalMonthly)} sub="total contributions" icon={Calendar} accent={tokens.amber}/>
        <StatCard label="Total Paid" value={fmt(totalPaidAll)} sub="all payments" icon={TrendingUp} accent={tokens.purple}/>
        <StatCard label="Chits Taken" value={chits.filter(c=>c.actualTakeMonth).length} sub={`${fmt(totalTakenValue)} received`} icon={CheckCircle} accent={tokens.green}/>
      </div>

      {chits.length === 0 ? (
        <Card>
          <div style={{textAlign:'center',padding:'52px 24px'}}>
            <div style={{fontSize:44,marginBottom:14}}>🏦</div>
            <div style={{fontSize:16,fontWeight:700,color:tokens.textSub,marginBottom:6}}>No chits on others yet</div>
            <div style={{fontSize:13,color:tokens.textMuted,marginBottom:20}}>Add chit funds you participate in (as a member) to track your payments and take decisions</div>
            <Button icon={Plus} onClick={openAdd}>Add My First Chit</Button>
          </div>
        </Card>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {chits.map(c => {
            const pays = paymentsMap[c.id] || [];
            const urg = getUrgency(c);
            const paidCount = pays.filter(p=>p.status==='Paid').length;
            const totalPaid = pays.filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.amount||0),0);
            const isExpanded = !!expanded[c.id];
            const pct = c.totalMembers > 0 ? Math.round((paidCount/c.totalMembers)*100) : 0;
            const thisMonthPay = pays.find(p=>p.month===curMonth());
            const isThisMonthPaid = thisMonthPay?.status==='Paid';

            return (
              <Card key={c.id} noPad style={{border: urg.unpaidMonths.length>0 ? `1.5px solid ${tokens.amber}40` : urg.takeSoon ? `1.5px solid ${tokens.red}40` : undefined}}>
                {/* Card header */}
                <div style={{padding:'16px 20px',display:'flex',gap:14,alignItems:'flex-start'}}>
                  <div style={{flex:1,minWidth:0}}>
                    {/* Urgency alerts */}
                    {urg.takeSoon && (
                      <div style={{marginBottom:8,padding:'6px 12px',background:tokens.redLight,borderRadius:8,fontSize:12,fontWeight:700,color:tokens.red,display:'flex',alignItems:'center',gap:6}}>
                        <AlertTriangle size={13}/> Plan to take this chit in {fmtMo(c.expectedTakeMonth)} — confirm your decision!
                      </div>
                    )}
                    {urg.shouldConsiderTaking && (
                      <div style={{marginBottom:8,padding:'6px 12px',background:tokens.amberLight,borderRadius:8,fontSize:12,fontWeight:600,color:tokens.amber,display:'flex',alignItems:'center',gap:6}}>
                        <TrendingUp size={13}/> 💡 You've paid &gt;50% — consider taking the chit now for maximum benefit
                      </div>
                    )}
                    {urg.unpaidMonths.length>0 && (
                      <div style={{marginBottom:8,padding:'6px 12px',background:'rgba(255,149,0,0.1)',borderRadius:8,fontSize:12,fontWeight:600,color:tokens.amber,display:'flex',alignItems:'center',gap:6}}>
                        <Clock size={13}/> Payment pending: {urg.unpaidMonths.map(fmtMo).join(', ')}
                      </div>
                    )}

                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:16,fontWeight:800,color:tokens.text}}>{c.companyName}</span>
                      <Badge status={c.status}/>
                      {c.actualTakeMonth && <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:tokens.greenLight,color:tokens.green}}>✓ TAKEN {fmtMo(c.actualTakeMonth)}</span>}
                    </div>
                    <div style={{fontSize:12,color:tokens.textSub,display:'flex',gap:12,flexWrap:'wrap'}}>
                      {c.organiserName && <span>Agent: <strong>{c.organiserName}</strong></span>}
                      <span>Member #{c.myMemberNumber||'—'}</span>
                      <span>Started: {fmtDate(c.startDate)}</span>
                      {c.expectedTakeMonth && !c.actualTakeMonth && <span style={{color:tokens.blue}}>Plan to take: <strong>{fmtMo(c.expectedTakeMonth)}</strong></span>}
                    </div>
                  </div>

                  {/* CRUD buttons */}
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <IBtn icon={Edit2} onClick={()=>openEdit(c)} title="Edit"/>
                    <IBtn icon={Trash2} onClick={()=>setDelTarget(c)} title="Delete" danger/>
                    <button onClick={()=>setExpanded(e=>({...e,[c.id]:!e[c.id]}))}
                      style={{width:28,height:28,borderRadius:7,border:`1px solid ${tokens.border}`,background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {isExpanded?<ChevronDown size={13} color={tokens.textSub}/>:<ChevronRight size={13} color={tokens.textSub}/>}
                    </button>
                  </div>
                </div>

                {/* Key numbers */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',borderTop:`1px solid ${tokens.border}`,borderBottom:`1px solid ${tokens.border}`}}>
                  {[
                    {label:'Chit Value',val:fmt(c.totalChitValue),color:tokens.text},
                    {label:'Monthly',val:fmt(c.monthlyContribution),color:tokens.blue},
                    {label:'Total Paid',val:fmt(totalPaid),color:tokens.green},
                    {label:'This Month',val:isThisMonthPaid?'✓ Paid':'⏳ Pending',color:isThisMonthPaid?tokens.green:tokens.amber},
                  ].map((k,i)=>(
                    <div key={i} style={{padding:'10px 14px',borderRight:i<3?`1px solid ${tokens.border}`:'none',textAlign:'center'}}>
                      <div style={{fontSize:14,fontWeight:800,color:k.color}}>{k.val}</div>
                      <div style={{fontSize:10.5,color:tokens.textMuted,marginTop:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>{k.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{padding:'10px 20px',borderBottom:`1px solid ${tokens.border}`}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:11.5,color:tokens.textSub}}>
                    <span>Payment progress: {paidCount}/{c.totalMembers||'?'} months paid</span>
                    <span style={{fontWeight:700,color:pct>75?tokens.green:pct>40?tokens.amber:tokens.blue}}>{pct}%</span>
                  </div>
                  <div style={{height:5,background:tokens.slateLight,borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:`${pct}%`,height:'100%',background:pct>75?tokens.green:pct>40?tokens.amber:tokens.blue,borderRadius:3,transition:'width 0.5s'}}/>
                  </div>
                </div>

                {/* Action bar */}
                <div style={{padding:'10px 20px',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <button onClick={()=>{setPayChit(c);setPayMonth(curMonth());setPayAmount(String(c.monthlyContribution||''));setPayStatus('Paid');setPayNote('');}}
                    style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,border:`1px solid ${tokens.blue}30`,background:tokens.blueLight,color:tokens.blue,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                    <Plus size={12}/> Add Payment
                  </button>
                  {!c.actualTakeMonth && (
                    <button onClick={async()=>{await updateOtherChit(c.id,{actualTakeMonth:curMonth(),status:'Completed'},user.uid);load();}}
                      style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:8,border:`1px solid ${tokens.green}30`,background:tokens.greenLight,color:tokens.green,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                      <CheckCircle size={12}/> Mark as Taken (this month)
                    </button>
                  )}
                  <span style={{fontSize:11.5,color:tokens.textMuted,marginLeft:'auto'}}>
                    Profit if taken now: <strong style={{color:c.totalChitValue-(c.monthlyContribution*(paidCount+1))>0?tokens.green:tokens.red}}>
                      {fmt(c.totalChitValue-(c.monthlyContribution*(paidCount+1)))}
                    </strong>
                  </span>
                </div>

                {/* Payment history */}
                {isExpanded && (
                  <div style={{borderTop:`1px solid ${tokens.border}`}}>
                    <div style={{padding:'10px 20px',background:tokens.slateLight,fontSize:11,fontWeight:700,color:tokens.textMuted,textTransform:'uppercase',letterSpacing:'0.06em'}}>
                      Payment History ({pays.length} records)
                    </div>
                    {pays.length===0 ? (
                      <div style={{padding:'20px',textAlign:'center',fontSize:13,color:tokens.textMuted}}>
                        No payments recorded yet. Click "Add Payment" to start.
                      </div>
                    ) : (
                      <div style={{maxHeight:280,overflowY:'auto'}}>
                        {pays.map((p,i)=>(
                          <div key={p.id||i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 20px',borderBottom:i<pays.length-1?`1px solid ${tokens.border}`:'none',background:p.status==='Paid'?'rgba(5,122,85,0.025)':'transparent'}}>
                            <div style={{width:36,height:36,borderRadius:9,background:p.status==='Paid'?tokens.greenLight:tokens.amberLight,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              {p.status==='Paid'?<CheckCircle size={14} color={tokens.green}/>:<Clock size={14} color={tokens.amber}/>}
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:600}}>{fmtMo(p.month)}</div>
                              {p.notes&&<div style={{fontSize:11,color:tokens.textSub}}>{p.notes}</div>}
                            </div>
                            <div style={{fontSize:14,fontWeight:800,color:p.status==='Paid'?tokens.green:tokens.amber}}>{fmt(p.amount)}</div>
                            <button onClick={()=>togglePayment(c.id,p)}
                              style={{display:'inline-flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:20,border:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700,background:p.status==='Paid'?tokens.greenLight:tokens.amberLight,color:p.status==='Paid'?tokens.green:tokens.amber}}>
                              {p.status==='Paid'?<CheckCircle size={10}/>:<Clock size={10}/>}
                              {p.status==='Paid'?'Paid':'Pending'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={addModal||!!editTarget} onClose={()=>{setAddModal(false);setEditTarget(null);}}
        title={editTarget?`✏️ Edit — ${editTarget.companyName}`:'🏦 Add Chit on Others'} width={600}
        footer={
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,width:'100%'}}>
            <Button variant="secondary" size="sm" onClick={()=>{setAddModal(false);setEditTarget(null);}}>Cancel</Button>
            <Button size="sm" onClick={handleSave} loading={saving}>{editTarget?'Save Changes':'Add Chit'}</Button>
          </div>
        }>
        {formErr&&<div style={{marginBottom:12,padding:'10px 14px',background:tokens.redLight,borderRadius:9,fontSize:13,color:tokens.red,fontWeight:500}}>⚠ {formErr}</div>}
        <FormContent/>
      </Modal>

      {/* Delete Confirm */}
      <Modal open={!!delTarget} onClose={()=>setDelTarget(null)} title="Delete Chit" width={400}
        footer={<><Button variant="secondary" size="sm" onClick={()=>setDelTarget(null)}>Cancel</Button><Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Delete</Button></>}>
        <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{width:40,height:40,borderRadius:11,background:tokens.redLight,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><AlertTriangle size={19} color={tokens.red}/></div>
          <div>
            <p style={{margin:'0 0 6px',fontSize:14,fontWeight:700}}>Delete "{delTarget?.companyName}"?</p>
            <p style={{margin:0,fontSize:13,color:tokens.textSub,lineHeight:1.6}}>All payment records for this chit will also be deleted. This cannot be undone.</p>
          </div>
        </div>
      </Modal>

      {/* Add Payment Modal */}
      <Modal open={!!payChit} onClose={()=>setPayChit(null)} title={`Add Payment — ${payChit?.companyName}`} width={420}
        footer={<><Button variant="secondary" size="sm" onClick={()=>setPayChit(null)}>Cancel</Button><Button size="sm" onClick={handleAddPayment} loading={paySaving}>Save Payment</Button></>}>
        {payChit&&(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{padding:'10px 14px',background:tokens.blueLight,borderRadius:9,fontSize:12,color:tokens.blue,fontWeight:500}}>
              Monthly contribution: <strong>{fmt(payChit.monthlyContribution)}</strong>
            </div>
            <FormField label="Month" required>
              <Input type="month" value={payMonth} onChange={e=>setPayMonth(e.target.value)}/>
            </FormField>
            <FormField label="Amount Paid (₹)" required>
              <Input type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} placeholder={String(payChit.monthlyContribution||'')}/>
            </FormField>
            <FormField label="Status">
              <Select value={payStatus} onChange={e=>setPayStatus(e.target.value)}>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
              </Select>
            </FormField>
            <FormField label="Notes">
              <Input value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Receipt no., mode, etc."/>
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
