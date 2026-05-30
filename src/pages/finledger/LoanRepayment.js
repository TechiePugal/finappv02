import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,doc,query,orderBy,serverTimestamp} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,Modal,SectionHeader,InfoRow,formatCurrency,Loader,Divider,FilterTabs,SearchBar} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';

const PAY_MODES=['Cash','Bank Transfer','UPI','Cheque','DD'];

export default function LoanRepayment(){
  const[borrowers,setBorrowers]=useState([]);
  const[repayments,setRepayments]=useState({});
  const[loading,setLoading]=useState(true);
  const[modal,setModal]=useState(null);
  const[pf,setPf]=useState({date:'',mode:'Cash',amount:'',type:'Partial',remarks:''});
  const[saving,setSaving]=useState(false);
  const[search,setSearch]=useState('');
  const[statusFilter,setStatusFilter]=useState('active');
  const[histModal,setHistModal]=useState(null);

  useEffect(()=>{
    const bUnsub=onSnapshot(
      query(collection(db,'borrower_master'),orderBy('createdAt','desc')),
      snap=>{setBorrowers(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      err=>{toast.error('Failed: '+err.message);setLoading(false);}
    );
    const rUnsub=onSnapshot(collection(db,'loan_repayments'),snap=>{
      const rm={};
      snap.docs.forEach(d=>{
        const r={id:d.id,...d.data()};
        if(!rm[r.borrowerId])rm[r.borrowerId]=[];
        if(!r.deleted)rm[r.borrowerId].push(r);
      });
      setRepayments(rm);
    });
    return()=>{bUnsub();rUnsub();};
  },[]);

  function getRepaid(borrower){
    return(repayments[borrower.id]||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  }
  function getBalance(borrower){
    return Math.max(0,(borrower.loanAmount||0)-getRepaid(borrower));
  }

  function openPay(borrower){
    setModal(borrower);
    setPf({date:new Date().toISOString().split('T')[0],mode:'Cash',amount:'',type:'Partial',remarks:''});
  }

  async function savePay(e){
    e.preventDefault();
    if(!pf.amount||parseFloat(pf.amount)<=0)return toast.error('Enter a valid amount');
    const balance=getBalance(modal);
    const amount=parseFloat(pf.amount);
    if(amount>balance)return toast.error(`Amount ₹${amount.toLocaleString('en-IN')} exceeds outstanding balance of ${formatCurrency(balance)}`);
    setSaving(true);
    try{
      const isFullClose=pf.type==='Full'||amount>=balance;
      const newBalance=Math.max(0,balance-amount);

      // Save repayment record
      const repData={
        borrowerId:modal.id, borrowerName:modal.borrowerName, loanId:modal.loanId||modal.id,
        originalLoan:modal.loanAmount, repaidAmount:amount,
        balanceAfter:newBalance, paymentMode:pf.mode,
        date:pf.date, type:isFullClose?'Full':'Partial',
        remarks:pf.remarks, createdAt:serverTimestamp()
      };
      const repRef=await addDoc(collection(db,'loan_repayments'),repData);

      // Ledger entry
      await addDoc(collection(db,'finance_ledger_entries'),{
        type:'Credit', category:'Loan Repayment',
        description:`Repayment from ${modal.borrowerName} — ${isFullClose?'FULL CLOSURE':'Partial'} (Bal: ${formatCurrency(Math.round(newBalance))})`,
        amount, paymentMode:pf.mode, date:pf.date,
        borrowerName:modal.borrowerName, borrowerId:modal.id,
        loanId:modal.loanId||modal.id, linkedRepaymentId:repRef.id,
        createdAt:serverTimestamp()
      });

      // Update borrower record
      const upd=isFullClose
        ?{status:'Closed',closedAt:serverTimestamp(),outstandingBalance:0,updatedAt:serverTimestamp()}
        :{outstandingBalance:newBalance,updatedAt:serverTimestamp()};
      await updateDoc(doc(db,'borrower_master',modal.id),upd);

      toast.success(isFullClose
        ?`✓ Loan fully closed! ${modal.borrowerName}'s account settled.`
        :`✓ ₹${amount.toLocaleString('en-IN')} recorded. Outstanding: ${formatCurrency(Math.round(newBalance))}`
      );
      setModal(null);
    }catch(err){toast.error('Failed: '+err.message);}finally{setSaving(false);}
  }

  const allActive=borrowers.filter(b=>b.status==='Active'||b.status==='Non-Active');
  const totalOriginal=allActive.reduce((s,b)=>s+(b.loanAmount||0),0);
  const totalRepaid=allActive.reduce((s,b)=>s+getRepaid(b),0);
  const totalOutstanding=allActive.reduce((s,b)=>s+getBalance(b),0);

  const filtered=borrowers.filter(b=>{
    const ms=!search||b.borrowerName?.toLowerCase().includes(search.toLowerCase())||b.loanId?.toLowerCase().includes(search.toLowerCase());
    const mf=statusFilter==='all'||(statusFilter==='active'&&(b.status==='Active'||b.status==='Non-Active'))||(statusFilter==='closed'&&b.status==='Closed');
    return ms&&mf;
  });

  if(loading)return<PageLoader stats={4}/>;

  const tabs=[
    {value:'active',label:'Active Loans',count:allActive.length},
    {value:'closed',label:'Closed',count:borrowers.filter(b=>b.status==='Closed').length},
    {value:'all',label:'All',count:borrowers.length},
  ];

  return(
    <div className="page-enter">
      <PageHeader title="Loan Repayment" subtitle="Track principal repayments and loan closures"/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Original Loans" value={formatCurrency(totalOriginal)} sub={`${allActive.length} active`} color="#007aff"/>
        <StatCard label="Total Repaid" value={formatCurrency(Math.round(totalRepaid))} sub="Principal recovered" color="#34c759"/>
        <StatCard label="Outstanding" value={formatCurrency(Math.round(totalOutstanding))} sub="Still owed" color={totalOutstanding>0?'#ff9500':'#34c759'}/>
        <StatCard label="Fully Closed" value={borrowers.filter(b=>b.status==='Closed').length} sub="Loans settled" color="#5856d6"/>
      </div>

      <Card>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
          <FilterTabs options={tabs} value={statusFilter} onChange={setStatusFilter}/>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or loan ID…"/>
        </div>

        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'rgba(118,118,128,0.07)',borderBottom:'1px solid rgba(0,0,0,.08)'}}>
                {['Loan ID','Borrower','Phone','Loan Amt','Repaid','Outstanding','Status','Actions'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&(
                <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'var(--text-secondary)'}}>No records found</td></tr>
              )}
              {filtered.map(b=>{
                const repaid=getRepaid(b);
                const bal=getBalance(b);
                const pct=b.loanAmount>0?Math.round((repaid/b.loanAmount)*100):0;
                const reps=repayments[b.id]||[];
                return(
                  <tr key={b.id} style={{borderBottom:'1px solid rgba(0,0,0,.05)'}}>
                    <td style={{padding:'11px 12px',fontSize:12,fontFamily:'monospace',color:'var(--accent)',fontWeight:600}}>{b.loanId||b.id.slice(-8)}</td>
                    <td style={{padding:'11px 12px'}}>
                      <div style={{fontWeight:600,fontSize:13}}>{b.borrowerName}</div>
                      {b.guardianName&&<div style={{fontSize:11,color:'var(--text-secondary)'}}>G: {b.guardianName}</div>}
                    </td>
                    <td style={{padding:'11px 12px',fontSize:13}}>{b.phone}</td>
                    <td style={{padding:'11px 12px',fontSize:13,fontWeight:600}}>{formatCurrency(b.loanAmount||0)}</td>
                    <td style={{padding:'11px 12px'}}>
                      <div style={{fontSize:13,color:'#34c759',fontWeight:600}}>{formatCurrency(Math.round(repaid))}</div>
                      <div style={{width:80,height:4,background:'rgba(0,0,0,.08)',borderRadius:2,marginTop:4}}>
                        <div style={{width:`${pct}%`,height:'100%',background:'#34c759',borderRadius:2,transition:'width .3s'}}/>
                      </div>
                      <div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>{pct}%</div>
                    </td>
                    <td style={{padding:'11px 12px',fontSize:13,color:bal>0?'#ff9500':'#34c759',fontWeight:600}}>{formatCurrency(Math.round(bal))}</td>
                    <td style={{padding:'11px 12px'}}><Badge label={b.status} type={b.status==='Active'?'success':b.status==='Closed'?'neutral':'warning'}/></td>
                    <td style={{padding:'11px 12px'}}>
                      <div style={{display:'flex',gap:6}}>
                        {(b.status==='Active'||b.status==='Non-Active')&&(
                          <Button size="sm" onClick={()=>openPay(b)}>Pay</Button>
                        )}
                        {reps.length>0&&(
                          <Button size="sm" variant="secondary" onClick={()=>setHistModal({borrower:b,reps})}>History</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payment modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={`Record Repayment — ${modal?.borrowerName}`} width={480}>
        {modal&&(
          <>
            {/* Balance summary */}
            <div style={{background:'rgba(0,122,255,0.06)',borderRadius:12,padding:'12px 16px',marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                <div><div style={{fontSize:11,color:'var(--text-secondary)'}}>Original Loan</div><div style={{fontSize:16,fontWeight:700}}>{formatCurrency(modal.loanAmount||0)}</div></div>
                <div><div style={{fontSize:11,color:'var(--text-secondary)'}}>Total Repaid</div><div style={{fontSize:16,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(getRepaid(modal)))}</div></div>
                <div><div style={{fontSize:11,color:'var(--text-secondary)'}}>Outstanding</div><div style={{fontSize:16,fontWeight:700,color:'#ff9500'}}>{formatCurrency(Math.round(getBalance(modal)))}</div></div>
              </div>
              {/* Progress bar */}
              <div style={{height:6,background:'rgba(0,0,0,.1)',borderRadius:3,marginTop:10,overflow:'hidden'}}>
                <div style={{width:`${modal.loanAmount>0?Math.round((getRepaid(modal)/modal.loanAmount)*100):0}%`,height:'100%',background:'#34c759',borderRadius:3,transition:'width .3s'}}/>
              </div>
            </div>

            <form onSubmit={savePay} style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Amount (₹) *</label>
                  <input type="number" min="1" step="0.01" required
                    value={pf.amount} onChange={e=>setPf(p=>({...p,amount:e.target.value}))}
                    placeholder={`Max: ${formatCurrency(Math.round(getBalance(modal)))}`}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)'}}
                    onFocus={e=>{e.target.style.borderColor='#007aff';e.target.style.boxShadow='0 0 0 3px rgba(0,122,255,0.1)';}}
                    onBlur={e=>{e.target.style.borderColor='rgba(0,0,0,0.1)';e.target.style.boxShadow='none';}}
                  />
                  {pf.amount&&getBalance(modal)>0&&(
                    <div style={{fontSize:11,marginTop:4,color:parseFloat(pf.amount)>=getBalance(modal)?'#34c759':'var(--text-secondary)'}}>
                      {parseFloat(pf.amount)>=getBalance(modal)?'✓ Fully closes this loan':`Remaining after: ${formatCurrency(Math.max(0,Math.round(getBalance(modal)-parseFloat(pf.amount))))}`}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Date *</label>
                  <input type="date" required value={pf.date} onChange={e=>setPf(p=>({...p,date:e.target.value}))}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)'}}/>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Payment Mode</label>
                  <select value={pf.mode} onChange={e=>setPf(p=>({...p,mode:e.target.value}))}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none',background:'rgba(118,118,128,0.07)',appearance:'none',cursor:'pointer',color:'var(--text-primary)'}}>
                    {PAY_MODES.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Type</label>
                  <select value={pf.type} onChange={e=>setPf(p=>({...p,type:e.target.value}))}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none',background:'rgba(118,118,128,0.07)',appearance:'none',cursor:'pointer',color:'var(--text-primary)'}}>
                    <option value="Partial">Partial Payment</option>
                    <option value="Full">Full & Close Loan</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Remarks</label>
                <input value={pf.remarks} onChange={e=>setPf(p=>({...p,remarks:e.target.value}))} placeholder="Optional remarks"
                  style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)'}}/>
              </div>

              <div style={{display:'flex',gap:10,paddingTop:4}}>
                <Button type="submit" disabled={saving} full>{saving?'Saving…':'Record Repayment'}</Button>
                <Button variant="secondary" onClick={()=>setModal(null)}>Cancel</Button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* Repayment history modal */}
      <Modal open={!!histModal} onClose={()=>setHistModal(null)} title={`Repayment History — ${histModal?.borrower?.borrowerName}`} width={560}>
        {histModal&&(
          <>
            <div style={{background:'rgba(0,122,255,0.06)',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13,color:'var(--accent)'}}>
              Original Loan: {formatCurrency(histModal.borrower.loanAmount||0)} · Repaid: {formatCurrency(Math.round(getRepaid(histModal.borrower)))} · Balance: {formatCurrency(Math.round(getBalance(histModal.borrower)))}
            </div>
            {[...histModal.reps].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(0,0,0,.06)'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{r.date}</div>
                  <div style={{fontSize:11.5,color:'var(--text-secondary)'}}>{r.paymentMode} · {r.type==='Full'?'Full Closure':'Partial'}{r.remarks?` · ${r.remarks}`:''}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#34c759'}}>{formatCurrency(r.repaidAmount||r.amount||0)}</div>
                  <div style={{fontSize:11,color:'var(--text-secondary)'}}>Bal after: {formatCurrency(r.balanceAfter||0)}</div>
                </div>
              </div>
            ))}
          </>
        )}
      </Modal>
    </div>
  );
}
