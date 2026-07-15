import React,{useEffect,useState} from 'react';
import {collection,getDocs,addDoc,updateDoc,doc,serverTimestamp,onSnapshot,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,SearchBar,FilterTabs,Modal,FormField,Input,Select,Textarea,formatCurrency} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

const BLANK={name:'',phone:'',address:'',idNumber:'',dob:'',occupation:'',nomineeName:'',nomineePhone:'',status:'Active',notes:''};

export default function Customers(){
  const {user}=useAuth();
  const[customers,setCustomers]=useState([]);
  const[loans,setLoans]=useState([]);
  const[deposits,setDeposits]=useState([]);
  const[emis,setEmis]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[statusF,setStatusF]=useState('All');
  const[modal,setModal]=useState(null);      // 'add' | customer obj
  const[form,setForm]=useState(BLANK);
  const[saving,setSaving]=useState(false);
  const[history,setHistory]=useState(null);  // {cust, txns, loading}
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    const u=onSnapshot(query(collection(db,'customer_master'),orderBy('createdAt','desc')),s=>{setCustomers(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid));setLoading(false);},()=>setLoading(false));
    Promise.all([getDocs(collection(db,'borrower_master')),getDocs(collection(db,'deposit_master')),getDocs(collection(db,'emi_loans'))]).then(([b,d,e])=>{
      setLoans(scopeToUser(b.docs.map(x=>({id:x.id,...x.data()})),user?.uid));
      setDeposits(scopeToUser(d.docs.map(x=>({id:x.id,...x.data()})),user?.uid));
      setEmis(scopeToUser(e.docs.map(x=>({id:x.id,...x.data()})),user?.uid));
    }).catch(()=>{});
    return()=>u();
  },[]);

  const linked=c=>({
    loans:loans.filter(l=>l.customerId===c.id||(c.phone&&l.phone===c.phone)),
    deposits:deposits.filter(d=>d.customerId===c.id||(c.phone&&d.phone===c.phone)),
    emis:emis.filter(e=>e.customerId===c.id||(c.phone&&e.phone===c.phone)),
  });

  async function save(){
    if(!form.name.trim()||!form.phone.trim())return toast.error('Name and phone are required.');
    setSaving(true);
    try{
      if(modal==='add'){
        await addDoc(collection(db,'customer_master'),{...form,customerId:`CUST-${Date.now().toString(36).toUpperCase()}`,createdBy:user?.uid||null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        toast.success('User enrolled!');
      }else{
        await updateDoc(doc(db,'customer_master',modal.id),{...form,updatedAt:serverTimestamp()});
        toast.success('User updated!');
      }
      setModal(null);setForm(BLANK);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  async function openHistory(c){
    setHistory({cust:c,loading:true,txns:[],lk:linked(c)});
    try{
      const lk=linked(c);
      const [ipRaw,lrRaw,dpRaw,ecRaw]=await Promise.all([
        getDocs(collection(db,'borrower_interest_payments')),
        getDocs(collection(db,'loan_repayments')),
        getDocs(collection(db,'deposit_payments')),
        getDocs(collection(db,'emi_collections')).catch(()=>({docs:[]})),
      ]);
      const ip={docs:scopeToUser(ipRaw.docs.map(d=>({id:d.id,...d.data()})),user?.uid).map(x=>({data:()=>x}))};
      const lr={docs:scopeToUser(lrRaw.docs.map(d=>({id:d.id,...d.data()})),user?.uid).map(x=>({data:()=>x}))};
      const dp={docs:scopeToUser(dpRaw.docs.map(d=>({id:d.id,...d.data()})),user?.uid).map(x=>({data:()=>x}))};
      const ec={docs:scopeToUser(ecRaw.docs.map(d=>({id:d.id,...d.data()})),user?.uid).map(x=>({data:()=>x}))};
      const lids=new Set(lk.loans.map(l=>l.id)),dids=new Set(lk.deposits.map(d=>d.id)),eids=new Set(lk.emis.map(e=>e.id));
      const T=[];
      lk.loans.forEach(l=>{if(l.loanStartDate)T.push({date:l.loanStartDate,label:`Loan created — ${l.loanId||l.id}`,amount:l.loanAmount||0,type:'loan',parentId:l.id});if(['Closed','Repaid','Paid Off'].includes(l.status))T.push({date:l.updatedAt?.seconds?new Date(l.updatedAt.seconds*1000).toISOString().split('T')[0]:'',label:`Loan closed — ${l.loanId||l.id}`,amount:0,type:'close',parentId:l.id});});
      lk.deposits.forEach(d=>{if(d.startDate)T.push({date:d.startDate,label:`Deposit created — ${d.depositId||d.id}`,amount:d.depositAmount||0,type:'deposit',parentId:d.id});});
      lk.emis.forEach(e=>{if(e.startDate)T.push({date:e.startDate,label:`EMI loan created — ${e.emiId||e.id}`,amount:e.loanAmount||0,type:'emi',parentId:e.id});});
      ip.docs.forEach(x=>{const r=x.data();if(lids.has(r.borrowerId)&&['Paid','Partial'].includes(r.status))T.push({date:r.paymentDate||r.month,label:`Interest ${r.status==='Partial'?'(partial) ':''}— ${r.month}`,amount:r.totalCollected||r.amountPaid||0,type:'interest',parentId:r.borrowerId});});
      lr.docs.forEach(x=>{const r=x.data();if(lids.has(r.borrowerId)&&!r.deleted)T.push({date:r.date,label:'Loan repayment',amount:r.repaidAmount||r.amount||0,type:'repay',parentId:r.borrowerId});});
      dp.docs.forEach(x=>{const r=x.data();if((dids.has(r.depositorId)||dids.has(r.depositId))&&r.status==='Paid')T.push({date:r.paymentDate||r.month,label:`Deposit interest — ${r.month||''}`,amount:r.totalPayout||r.amountPaid||0,type:'depint',parentId:r.depositorId||r.depositId});});
      ec.docs.forEach(x=>{const r=x.data();if(eids.has(r.loanId))T.push({date:r.date,label:`EMI #${r.periodNo||''} ${r.status==='Partial'?'(partial)':''}`,amount:r.amount||0,type:'emipay',parentId:r.loanId});});
      T.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      setHistory({cust:c,loading:false,txns:T,lk});
    }catch(e){toast.error('History load failed: '+e.message);setHistory(h=>h?{...h,loading:false}:null);}
  }

  function printReport(){
    if(!history)return;
    const {cust,txns,lk}=history;
    const out=lk.loans.reduce((s,l)=>s+Math.max(0,(l.loanAmount||0)),0);
    const w=window.open('','_blank');
    const row=(t)=>`<tr><td>${t.date||''}</td><td>${t.label}</td><td style="text-align:right">${t.amount?'₹'+Math.round(t.amount).toLocaleString('en-IN'):''}</td></tr>`;
    w.document.write(`<html><head><title>${cust.name} — Financial History</title><style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:20px}h2{font-size:14px;margin-top:20px;border-bottom:1px solid #ddd;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}.meta{font-size:12px;color:#555}</style></head><body>
      <h1>${cust.name} <span class="meta">(${cust.customerId||cust.id})</span></h1>
      <div class="meta">Phone: ${cust.phone||'—'} · ${cust.occupation||''} · Status: ${cust.status||'Active'} · Generated ${new Date().toLocaleDateString('en-IN')}</div>
      <h2>Loans (${lk.loans.length})</h2><table><tr><th>ID</th><th>Amount</th><th>Rate</th><th>Start</th><th>Status</th></tr>${lk.loans.map(l=>`<tr><td>${l.loanId||l.id}</td><td>₹${(l.loanAmount||0).toLocaleString('en-IN')}</td><td>${l.interestRate||0}%/mo</td><td>${l.loanStartDate||''}</td><td>${l.status||''}</td></tr>`).join('')||'<tr><td colspan=5>None</td></tr>'}</table>
      <h2>Deposits (${lk.deposits.length})</h2><table><tr><th>ID</th><th>Amount</th><th>Rate</th><th>Start</th><th>Status</th></tr>${lk.deposits.map(d=>`<tr><td>${d.depositId||d.id}</td><td>₹${(d.depositAmount||0).toLocaleString('en-IN')}</td><td>${d.interestRate||0}%/mo</td><td>${d.startDate||''}</td><td>${d.status||''}</td></tr>`).join('')||'<tr><td colspan=5>None</td></tr>'}</table>
      <h2>EMI Loans (${lk.emis.length})</h2><table><tr><th>ID</th><th>Amount</th><th>EMI</th><th>Paid/Total</th><th>Status</th></tr>${lk.emis.map(e=>`<tr><td>${e.emiId||e.id}</td><td>₹${(e.loanAmount||0).toLocaleString('en-IN')}</td><td>₹${Math.round(e.emiAmount||0).toLocaleString('en-IN')}</td><td>${e.paidPeriods||0}/${e.totalPeriods||0}</td><td>${e.status||''}</td></tr>`).join('')||'<tr><td colspan=5>None</td></tr>'}</table>
      <h2>Transaction Timeline (${txns.length})</h2><table><tr><th>Date</th><th>Event</th><th style="text-align:right">Amount</th></tr>${txns.map(row).join('')}</table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  }

  const filtered=customers.filter(c=>{
    const q=search.trim().toLowerCase();
    const mq=!q||[c.name,c.phone,c.customerId,c.idNumber].some(v=>String(v||'').toLowerCase().includes(q));
    const mf=statusF==='All'||c.status===statusF;
    return mq&&mf;
  });
  const withLoans=customers.filter(c=>linked(c).loans.length>0).length;
  const withDeps=customers.filter(c=>linked(c).deposits.length>0).length;

  if(loading)return<PageLoader stats={4}/>;
  return(
    <div>
      <PageHeader title="Users" subtitle="Common user master — link a User to create their Deposit or Loan/EMI. One user can have multiple deposits and loans."
        action={<Button onClick={()=>{setModal('add');setForm(BLANK);}}>+ Enroll User</Button>}/>
      <div className="grid-4" style={{marginBottom:14}}>
        <StatCard label="Total Users" value={customers.length} color="#0a84ff"/>
        <StatCard label="Active" value={customers.filter(c=>c.status==='Active').length} color="#34c759"/>
        <StatCard label="With Loans" value={withLoans} color="#ff9500"/>
        <StatCard label="With Deposits" value={withDeps} color="#5856d6"/>
      </div>
      <Card>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, phone, customer ID, Aadhaar…"/>
          <FilterTabs options={['All','Active','Inactive']} value={statusF} onChange={setStatusF}/>
        </div>
        {filtered.length===0?<div style={{textAlign:'center',padding:40,color:'var(--text-secondary)'}}>No users yet — enroll your first user, then create their deposit or loan.</div>:(
          <div style={{display:'grid',gap:8}}>
            {filtered.map(c=>{const lk=linked(c);return(
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:12,border:'1px solid var(--border)',flexWrap:'wrap'}}>
                <div style={{width:42,height:42,borderRadius:'50%',background:'linear-gradient(135deg,#0a84ff,#5856d6)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,flexShrink:0}}>{(c.name||'?')[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontWeight:700,fontSize:14}}>{c.name} <span style={{fontSize:11,color:'var(--text-secondary)',fontWeight:400}}>{c.customerId}</span></div>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>{c.phone} · {c.occupation||'—'} · {lk.loans.length} loan{lk.loans.length!==1?'s':''} · {lk.deposits.length} deposit{lk.deposits.length!==1?'s':''} · {lk.emis.length} EMI</div>
                </div>
                <Badge label={c.status||'Active'} type={c.status==='Active'?'success':'default'}/>
                <Button size="sm" variant="secondary" onClick={()=>openHistory(c)}>Full History</Button>
                <Button size="sm" variant="secondary" onClick={()=>{setModal(c);setForm({...BLANK,...c});}}>Edit</Button>
              </div>);})}
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='add'?'Enroll New User':'Edit User'} width={560}
        footer={<><Button variant="secondary" onClick={()=>setModal(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?'Saving…':'Save User'}</Button></>}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <FormField label="Full Name" required><Input value={form.name} onChange={e=>set('name',e.target.value)}/></FormField>
          <FormField label="Mobile Number" required><Input type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)}/></FormField>
          <FormField label="Aadhaar / ID"><Input value={form.idNumber} onChange={e=>set('idNumber',e.target.value)}/></FormField>
          <FormField label="Date of Birth"><Input type="date" value={form.dob} onChange={e=>set('dob',e.target.value)}/></FormField>
          <FormField label="Occupation"><Input value={form.occupation} onChange={e=>set('occupation',e.target.value)}/></FormField>
          <FormField label="Status"><Select value={form.status} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Inactive</option></Select></FormField>
          <FormField label="Nominee Name"><Input value={form.nomineeName} onChange={e=>set('nomineeName',e.target.value)}/></FormField>
          <FormField label="Nominee Phone"><Input type="tel" value={form.nomineePhone} onChange={e=>set('nomineePhone',e.target.value)}/></FormField>
        </div>
        <div style={{marginTop:12}}><FormField label="Address"><Textarea value={form.address} onChange={e=>set('address',e.target.value)}/></FormField></div>
        <div style={{marginTop:12}}><FormField label="Notes"><Textarea value={form.notes} onChange={e=>set('notes',e.target.value)}/></FormField></div>
      </Modal>

      <Modal open={!!history} onClose={()=>setHistory(null)} title={history?`${history.cust.name} — Full Financial History`:''} width={720}
        footer={history&&!history.loading?<><Button variant="secondary" onClick={()=>setHistory(null)}>Close</Button><Button onClick={printReport}>🖨 Print / PDF Report</Button></>:null}>
        {history&&(history.loading?<div style={{textAlign:'center',padding:30,color:'var(--text-secondary)'}}>Loading history…</div>:(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10,marginBottom:18}}>
              {[
                {l:'Loans',v:`${history.lk.loans.length} (${history.lk.loans.filter(l=>!['Closed','Repaid','Paid Off'].includes(l.status)).length} active)`,c:'#ff9500'},
                {l:'Deposits',v:`${history.lk.deposits.length} (${history.lk.deposits.filter(d=>d.status==='Active').length} active)`,c:'#5856d6'},
                {l:'EMI Loans',v:`${history.lk.emis.length} (${history.lk.emis.filter(e=>e.status==='Active').length} active)`,c:'#0a84ff'},
                {l:'Transactions',v:history.txns.length,c:'#34c759'},
              ].map((s,i)=>(<div key={i} style={{padding:'10px 12px',borderRadius:10,background:`${s.c}0d`,textAlign:'center'}}><div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase'}}>{s.l}</div><div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div></div>))}
            </div>

            {/* ── LOANS — split one section per loan ── */}
            {history.lk.loans.length>0&&(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:12,fontWeight:800,color:'#ff9500',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>💰 Loans ({history.lk.loans.length})</div>
                {history.lk.loans.map(loan=>{
                  const loanTxns=history.txns.filter(t=>t.parentId===loan.id);
                  const paidTotal=loanTxns.filter(t=>t.type==='interest'||t.type==='repay').reduce((s,t)=>s+(t.amount||0),0);
                  const isActive=!['Closed','Repaid','Paid Off'].includes(loan.status);
                  return(
                    <div key={loan.id} style={{border:'1px solid rgba(255,149,0,0.2)',borderRadius:12,marginBottom:10,overflow:'hidden'}}>
                      <div style={{padding:'10px 14px',background:'rgba(255,149,0,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:13.5}}>{loan.loanId||loan.id.slice(-8)}</span>
                          <span style={{marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:99,background:isActive?'rgba(52,199,89,0.15)':'rgba(120,120,120,0.15)',color:isActive?'#1a7a34':'#666',fontWeight:600}}>{loan.status||'Active'}</span>
                        </div>
                        <div style={{display:'flex',gap:14,fontSize:12}}>
                          <span>Loan: <strong>{formatCurrency(loan.loanAmount||0)}</strong></span>
                          <span>Rate: <strong>{loan.interestRate||0}%/mo</strong></span>
                          <span>Paid: <strong style={{color:'#34c759'}}>{formatCurrency(Math.round(paidTotal))}</strong></span>
                        </div>
                      </div>
                      {loanTxns.length>0?(
                        <div style={{padding:'8px 14px'}}>
                          {loanTxns.map((t,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:i<loanTxns.length-1?'1px solid rgba(0,0,0,0.04)':'none'}}>
                              <span style={{fontSize:11.5,color:'var(--text-secondary)',width:82,flexShrink:0}}>{t.date||'—'}</span>
                              <span style={{flex:1,fontSize:12.5}}>{t.label}</span>
                              {t.amount>0&&<span style={{fontSize:12.5,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(t.amount))}</span>}
                            </div>
                          ))}
                        </div>
                      ):<div style={{padding:'10px 14px',fontSize:12,color:'var(--text-secondary)'}}>No payments recorded yet for this loan.</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── DEPOSITS — split one section per deposit ── */}
            {history.lk.deposits.length>0&&(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:12,fontWeight:800,color:'#5856d6',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>🏦 Deposits ({history.lk.deposits.length})</div>
                {history.lk.deposits.map(dep=>{
                  const depTxns=history.txns.filter(t=>t.parentId===dep.id);
                  const paidTotal=depTxns.reduce((s,t)=>s+(t.amount||0),0);
                  return(
                    <div key={dep.id} style={{border:'1px solid rgba(88,86,214,0.2)',borderRadius:12,marginBottom:10,overflow:'hidden'}}>
                      <div style={{padding:'10px 14px',background:'rgba(88,86,214,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:13.5}}>{dep.depositId||dep.id.slice(-8)}</span>
                          <span style={{marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:99,background:dep.status==='Active'?'rgba(52,199,89,0.15)':'rgba(120,120,120,0.15)',color:dep.status==='Active'?'#1a7a34':'#666',fontWeight:600}}>{dep.status||'Active'}</span>
                        </div>
                        <div style={{display:'flex',gap:14,fontSize:12}}>
                          <span>Principal: <strong>{formatCurrency(dep.depositAmount||0)}</strong></span>
                          <span>Rate: <strong>{dep.interestRate||0}%/mo</strong></span>
                          <span>Interest Collected: <strong style={{color:'#34c759'}}>{formatCurrency(Math.round(paidTotal))}</strong></span>
                        </div>
                      </div>
                      {depTxns.length>0?(
                        <div style={{padding:'8px 14px'}}>
                          {depTxns.map((t,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:i<depTxns.length-1?'1px solid rgba(0,0,0,0.04)':'none'}}>
                              <span style={{fontSize:11.5,color:'var(--text-secondary)',width:82,flexShrink:0}}>{t.date||'—'}</span>
                              <span style={{flex:1,fontSize:12.5}}>{t.label}</span>
                              {t.amount>0&&<span style={{fontSize:12.5,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(t.amount))}</span>}
                            </div>
                          ))}
                        </div>
                      ):<div style={{padding:'10px 14px',fontSize:12,color:'var(--text-secondary)'}}>No interest collected yet for this deposit.</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── EMI LOANS — split one section per EMI loan ── */}
            {history.lk.emis.length>0&&(
              <div style={{marginBottom:6}}>
                <div style={{fontSize:12,fontWeight:800,color:'#0a84ff',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>📅 EMI Loans ({history.lk.emis.length})</div>
                {history.lk.emis.map(emi=>{
                  const emiTxns=history.txns.filter(t=>t.parentId===emi.id);
                  const paidTotal=emiTxns.reduce((s,t)=>s+(t.amount||0),0);
                  return(
                    <div key={emi.id} style={{border:'1px solid rgba(10,132,255,0.2)',borderRadius:12,marginBottom:10,overflow:'hidden'}}>
                      <div style={{padding:'10px 14px',background:'rgba(10,132,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:13.5}}>{emi.emiId||emi.id.slice(-8)}</span>
                          <span style={{marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:99,background:emi.status==='Active'?'rgba(52,199,89,0.15)':'rgba(120,120,120,0.15)',color:emi.status==='Active'?'#1a7a34':'#666',fontWeight:600}}>{emi.status||'Active'}</span>
                        </div>
                        <div style={{display:'flex',gap:14,fontSize:12}}>
                          <span>Loan: <strong>{formatCurrency(emi.loanAmount||0)}</strong></span>
                          <span>EMI: <strong>{formatCurrency(Math.round(emi.emiAmount||0))}</strong></span>
                          <span>Paid: <strong style={{color:'#34c759'}}>{emi.paidPeriods||0}/{emi.totalPeriods||0}</strong></span>
                        </div>
                      </div>
                      {emiTxns.length>0?(
                        <div style={{padding:'8px 14px'}}>
                          {emiTxns.map((t,i)=>(
                            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:i<emiTxns.length-1?'1px solid rgba(0,0,0,0.04)':'none'}}>
                              <span style={{fontSize:11.5,color:'var(--text-secondary)',width:82,flexShrink:0}}>{t.date||'—'}</span>
                              <span style={{flex:1,fontSize:12.5}}>{t.label}</span>
                              {t.amount>0&&<span style={{fontSize:12.5,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(t.amount))}</span>}
                            </div>
                          ))}
                        </div>
                      ):<div style={{padding:'10px 14px',fontSize:12,color:'var(--text-secondary)'}}>No EMI collected yet for this loan.</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {history.lk.loans.length===0&&history.lk.deposits.length===0&&history.lk.emis.length===0&&(
              <div style={{color:'var(--text-secondary)',fontSize:13,padding:'16px 0',textAlign:'center'}}>No loans, deposits or EMI loans found (linked by User ID or matching phone number).</div>
            )}
          </div>
        ))}
      </Modal>
    </div>
  );
}
