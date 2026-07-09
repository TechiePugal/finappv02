import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,serverTimestamp,doc,updateDoc} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {printCollectInterestSummary} from '../../utils/pdfReport';
import {PageHeader,Badge,Button,Card,StatCard,Modal,formatCurrency,SectionHeader,Divider} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';

// All months from startDate to now
function getMonths(startDate){
  if(!startDate)return[];
  const slots=[];let cur=new Date(startDate);const now=new Date();
  while(cur<=now){
    slots.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`);
    cur.setMonth(cur.getMonth()+1);
  }
  return slots;
}

// Days past due date (1st of following month)
function getDaysOverdue(monthStr){
  const[y,m]=monthStr.split('-');
  const dueDate=new Date(parseInt(y),parseInt(m),1); // 1st of next month
  const diff=Math.floor((new Date()-dueDate)/(1000*60*60*24));
  return Math.max(0,diff);
}

export default function InterestCollection(){
  const[borrowers,setBorrowers]=useState([]);
  const[payments,setPayments]=useState({});
  const[repayments,setRepayments]=useState({});
  const[loading,setLoading]=useState(true);
  const[modal,setModal]=useState(null); // borrower
  const[pf,setPf]=useState({date:'',mode:'Cash',amount:'',fine:'0',collectFine:false,addToLoan:false,remarks:''});
  const[saving,setSaving]=useState(false);
  const _flt=(()=>{try{return JSON.parse(localStorage.getItem('fl_ic_filters'))||{}}catch(e){return{}}})();
  const[viewMode,setViewMode]=useState(_flt.viewMode||'month');
  const[search,setSearch]=useState('');
  const[statusFilter,setStatusFilter]=useState(_flt.statusFilter||'all');
  const[amtRange,setAmtRange]=useState(_flt.amtRange||'all');
  const[monthsFilter,setMonthsFilter]=useState(_flt.monthsFilter||'all');
  const[sortBy,setSortBy]=useState(_flt.sortBy||'name'); // intFilterAdded
  useEffect(()=>{try{localStorage.setItem('fl_ic_filters',JSON.stringify({viewMode,statusFilter,amtRange,monthsFilter,sortBy}))}catch(e){}},[viewMode,statusFilter,amtRange,monthsFilter,sortBy]);
  const[month,setMonth]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;});
  const[selected,setSelected]=useState(null);
  const DAILY_FINE=50;

  useEffect(()=>{
    const b=onSnapshot(collection(db,'borrower_master'),snap=>{
      setBorrowers(snap.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.status!=='Closed'));
      setLoading(false);
    },()=>{toast.error('Failed');setLoading(false);});
    const p=onSnapshot(collection(db,'borrower_interest_payments'),snap=>{
      const pm={};
      snap.docs.forEach(d=>{const r=d.data();if(!pm[r.borrowerId])pm[r.borrowerId]={};pm[r.borrowerId][r.month]={id:d.id,...r};});
      setPayments(pm);
    });
    const r=onSnapshot(collection(db,'loan_repayments'),snap=>{
      const rm={};
      snap.docs.forEach(d=>{const r=d.data();if(!r.deleted){if(!rm[r.borrowerId])rm[r.borrowerId]=[];rm[r.borrowerId].push(r);}});
      setRepayments(rm);
    });
    return()=>{b();p();r();};
  },[]);

  function getOutstanding(b){
    const reps=repayments[b.id]||[];
    const repaid=reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
    return Math.max(0,(b.loanAmount||0)-repaid);
  }

  function calcInterest(b,overrideOutstanding){
    const outstanding=overrideOutstanding!==undefined?overrideOutstanding:getOutstanding(b);
    return outstanding*(b.interestRate||0)/100;
  }

  function openModal(b,forMonth){
    const m=forMonth||month;
    if(forMonth&&forMonth!==month) setMonth(forMonth); // keep 'month' state in sync for calc, without forcing view
    const outstanding=getOutstanding(b);
    const interest=calcInterest(b,outstanding);
    const daysOverdue=getDaysOverdue(m);
    const fine=daysOverdue>2?(daysOverdue-2)*DAILY_FINE:0;
    setModal(b);
    setPf({
      date:new Date().toISOString().split('T')[0],
      mode:'Cash',
      amount:String(Math.round(interest)),
      fine:'',  // empty — user enters manually
      collectFine:false, // OFF by default
      addToLoan:false, // for compound — add interest to loan principal
      remarks:''
    });
  }

  async function savePay(paid){
    if(!modal)return;
    setSaving(true);
    try{
      const isPartial=paid==='partial';const isPaid=paid===true;
      const collected=isPaid||isPartial;
      const bPays=payments[modal.id]||{};
      const existing=bPays[month];
      const outstanding=getOutstanding(modal);
      const interest=calcInterest(modal,outstanding);
      const fine=pf.collectFine?parseFloat(pf.fine)||0:0;
      const totalCollected=collected?(parseFloat(pf.amount)||0)+fine:0;

      const data={
        borrowerId:modal.id,borrowerName:modal.borrowerName,
        loanAmount:modal.loanAmount,outstandingBalance:outstanding,
        interestRate:modal.interestRate,amountDue:Math.round(interest),
        amountPaid:collected?(parseFloat(pf.amount)||0):0,
        fine:collected?fine:0,totalCollected,
        status:isPaid?'Paid':isPartial?'Partial':'Unpaid',
        paymentDate:collected?pf.date:null,paymentMode:collected?pf.mode:null,
        remarks:pf.remarks,month,addedToLoan:pf.addToLoan&&!collected,
        updatedAt:serverTimestamp()
      };

      let payId=existing?.id;
      if(existing){await updateDoc(doc(db,'borrower_interest_payments',existing.id),data);}
      else{data.createdAt=serverTimestamp();const r=await addDoc(collection(db,'borrower_interest_payments'),data);payId=r.id;}

      if(collected){
        // Ledger entry
        const lData={
          type:'Credit',category:'Loan Interest',
          description:`Interest${isPartial?' (partial)':''} from ${modal.borrowerName} — ${month}${fine>0?` + Fine ₹${fine}`:''}`,
          amount:totalCollected,paymentMode:pf.mode,date:pf.date,
          borrowerName:modal.borrowerName,borrowerId:modal.id,
          linkedPaymentId:payId,createdAt:serverTimestamp()
        };
        if(existing?.ledgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',existing.ledgerEntryId),{...lData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else await addDoc(collection(db,'finance_ledger_entries'),lData);
      }

      // Compound interest: add interest amount to loan principal
      if(pf.addToLoan&&!collected){
        const newLoanAmount=(modal.loanAmount||0)+Math.round(interest);
        await updateDoc(doc(db,'borrower_master',modal.id),{
          loanAmount:newLoanAmount,
          monthlyInterest:newLoanAmount*(modal.interestRate||0)/100,
          updatedAt:serverTimestamp()
        });
        toast.success(`Interest ₹${Math.round(interest).toLocaleString('en-IN')} added to loan principal. New loan: ${formatCurrency(newLoanAmount)}`);
      } else {
        toast.success(isPaid?`Payment recorded!${fine>0?` (incl. fine ₹${fine})`:''}`:isPartial?'Partial payment recorded':'Marked as unpaid');
      }
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  const totalDue=borrowers.reduce((s,b)=>s+calcInterest(b),0);
  const totalColl=borrowers.filter(b=>['Paid','Partial'].includes(payments[b.id]?.[month]?.status)).reduce((s,b)=>s+(payments[b.id]?.[month]?.totalCollected||payments[b.id]?.[month]?.amountPaid||0),0);
  const pending=totalDue-totalColl;
  const rate=totalDue>0?Math.round((totalColl/totalDue)*100):0;

  const _today2=new Date();
  const _getMoUnpaid=b=>{
    const bPays=payments[b.id]||{};
    const paid=Object.keys(bPays).filter(mo=>bPays[mo]?.status==='Paid').sort();
    const last=paid.length?paid[paid.length-1]:null;
    return last?((_today2.getFullYear()-parseInt(last.slice(0,4)))*12+(_today2.getMonth()+1-parseInt(last.slice(5,7)))):(b.loanStartDate?Math.max(0,(_today2.getFullYear()-parseInt(b.loanStartDate.slice(0,4)))*12+(_today2.getMonth()+1-parseInt(b.loanStartDate.slice(5,7)))):0);
  };
  const filtBorrowers=borrowers.filter(b=>{
    const q=search.trim().toLowerCase();
    const ms=!q||[b.borrowerName,b.phone,b.loanId,b.guardianName,b.guardianPhone].some(v=>String(v||'').toLowerCase().includes(q));
    const p=payments[b.id]?.[month];
    const mst=statusFilter==='all'||(statusFilter==='paid'&&p?.status==='Paid')||(statusFilter==='partial'&&p?.status==='Partial')||(statusFilter==='pending'&&!p)||(statusFilter==='unpaid'&&p?.status==='Unpaid');
    const amt=b.loanAmount||0;let ma=true;
    if(amtRange==='0-10000')ma=amt<=10000;else if(amtRange==='10000-50000')ma=amt>10000&&amt<=50000;else if(amtRange==='50000-100000')ma=amt>50000&&amt<=100000;else if(amtRange==='100000+')ma=amt>100000;
    const mu=_getMoUnpaid(b);let mm=true;
    if(monthsFilter==='1mo')mm=mu>=1;else if(monthsFilter==='2mo')mm=mu>=2;else if(monthsFilter==='3mo')mm=mu>=3;else if(monthsFilter==='6mo')mm=mu>=6;
    return ms&&mst&&ma&&mm;
  }).sort((a,b2)=>{
    if(sortBy==='loan')return(b2.loanAmount||0)-(a.loanAmount||0);
    if(sortBy==='interest')return calcInterest(b2,getOutstanding(b2))-calcInterest(a,getOutstanding(a));
    if(sortBy==='unpaid')return _getMoUnpaid(b2)-_getMoUnpaid(a);
    return String(a.borrowerName||'').localeCompare(String(b2.borrowerName||''));
  });
  if(loading)return<PageLoader stats={4}/>;

  return(
    <div className="page-enter">
      <PageHeader title="Interest Collection" subtitle="Monthly interest tracking with fine and compound interest support"
        action={
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{display:'flex',background:'rgba(118,118,128,0.1)',borderRadius:10,padding:3}}>
              {['month','history'].map(v=>(
                <button key={v} onClick={()=>setViewMode(v)}
                  style={{padding:'6px 14px',borderRadius:8,border:'none',background:viewMode===v?'#fff':'transparent',color:viewMode===v?'var(--text-primary)':'var(--text-secondary)',fontWeight:viewMode===v?600:400,fontSize:13,cursor:'pointer',fontFamily:'inherit',boxShadow:viewMode===v?'0 1px 4px rgba(0,0,0,0.12)':'none',transition:'all 0.15s'}}>
                  {v==='month'?'This Month':'Full History'}
                </button>
              ))}
            </div>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              style={{padding:'8px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}}/>
            <Button variant="secondary" onClick={()=>printCollectInterestSummary(borrowers, payments, month, getOutstanding, calcInterest)}>Export PDF</Button>
          </div>
        }/>


      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Total Due" value={formatCurrency(Math.round(totalDue))} sub="Interest on outstanding" color="#ff9500"/>
        <StatCard label="Collected" value={formatCurrency(Math.round(totalColl))} sub="Received this month" color="#34c759"/>
        <StatCard label="Pending" value={formatCurrency(Math.round(pending))} sub="Still outstanding" color={pending>0?'#ff3b30':'#34c759'}/>
        <StatCard label="Collection Rate" value={`${rate}%`} sub="Of total due" color={rate>=90?'#34c759':rate>=60?'#ff9500':'#ff3b30'}/>
      </div>
      {/* icLayoutV2 */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, loan ID, guardian…"
          style={{padding:'8px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,fontSize:13,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',flex:'1 1 200px',minWidth:180}}/>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          <option value="all">All Status</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="unpaid">Unpaid</option>
        </select>
        <select value={monthsFilter} onChange={e=>setMonthsFilter(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          <option value="all">All Borrowers</option><option value="1mo">1+ Month Unpaid</option><option value="2mo">2+ Months Unpaid</option><option value="3mo">3+ Months Unpaid</option><option value="6mo">6+ Months Unpaid</option>
        </select>
        <select value={amtRange} onChange={e=>setAmtRange(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          <option value="all">All Amounts</option><option value="0-10000">₹0–₹10K</option><option value="10000-50000">₹10K–₹50K</option><option value="50000-100000">₹50K–₹1L</option><option value="100000+">₹1L+</option>
        </select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
          <option value="name">Sort: Name A–Z</option><option value="loan">Sort: Highest Loan</option><option value="interest">Sort: Highest Interest</option><option value="unpaid">Sort: Most Months Unpaid</option>
        </select>
      </div>

      {/* Progress bar */}
      <Card style={{marginBottom:16,padding:'16px 20px'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
          <span style={{fontSize:13,color:'var(--text-secondary)'}}>Collection Progress — {new Date(month+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</span>
          <span style={{fontSize:14,fontWeight:700,color:rate>=90?'#34c759':rate>=60?'#ff9500':'#ff3b30'}}>{rate}%</span>
        </div>
        <div style={{background:'rgba(118,118,128,0.1)',borderRadius:99,height:8,overflow:'hidden'}}>
          <div style={{width:`${rate}%`,height:'100%',background:rate>=90?'#34c759':rate>=60?'#ff9500':'#ff3b30',borderRadius:99,transition:'width 0.8s ease'}}/>
        </div>
      </Card>

      {/* Month view */}
      {viewMode==='month'&&(
        <Card>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'rgba(118,118,128,0.06)'}}>
                {['Borrower','Outstanding','Rate','Due','Days OD','Fine','Status','Action'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--divider)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtBorrowers.length===0&&<tr><td colSpan={8} style={{padding:48,textAlign:'center',color:'var(--text-secondary)'}}>No borrowers match filters</td></tr>}
                {filtBorrowers.map(b=>{
                  const p=payments[b.id]?.[month];
                  const outstanding=getOutstanding(b);
                  const interest=calcInterest(b,outstanding);
                  const daysOD=getDaysOverdue(month);
                  const fine=daysOD>2?(daysOD-2)*DAILY_FINE:0;
                  return(
                    <tr key={b.id} style={{borderBottom:'1px solid var(--divider)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(0,122,255,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'12px 14px'}}>
                        <div style={{fontWeight:600,fontSize:13}}>{b.borrowerName}</div>
                        <div style={{fontSize:11,color:'var(--text-secondary)'}}>{b.loanId}</div>
                      </td>
                      <td style={{padding:'12px 14px',fontWeight:700,fontSize:13,color:outstanding<b.loanAmount?'#ff9500':'var(--text-primary)'}}>{formatCurrency(Math.round(outstanding))}</td>
                      <td style={{padding:'12px 14px',color:'#ff9500',fontWeight:500}}>{b.interestRate}%</td>
                      <td style={{padding:'12px 14px',fontWeight:700,color:'#007aff',fontSize:14}}>{formatCurrency(Math.round(interest))}</td>
                      <td style={{padding:'12px 14px',fontSize:13,fontWeight:daysOD>2?700:400,color:daysOD>2?'#ff3b30':'var(--text-secondary)'}}>{daysOD>0?`${daysOD}d`:'—'}</td>
                      <td style={{padding:'12px 14px',fontSize:13,color:'#ff3b30',fontWeight:fine>0?700:400}}>{fine>0?formatCurrency(fine):'—'}</td>
                      <td style={{padding:'12px 14px'}}>{p?<Badge label={p.status} type={p.status.toLowerCase()}/>:<Badge label="Pending" type="pending"/>}</td>
                      <td style={{padding:'12px 14px'}}>
                        <Button size="sm" variant={['Paid','Partial'].includes(p?.status)?'secondary':'primary'} onClick={()=>openModal(b)}>{p?.status==='Paid'?'Update':p?.status==='Partial'?'Partial ✎':'Collect'}</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* History view */}
      {viewMode==='history'&&(
        <Card>
          <SectionHeader title="Full Interest History from Loan Start"/>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {borrowers.map(b=>{
              const slots=getMonths(b.loanStartDate);
              const isOpen=selected===b.id;
              const outstanding=getOutstanding(b);
              const totalColl=slots.reduce((s,mo)=>s+(payments[b.id]?.[mo]?.totalCollected||payments[b.id]?.[mo]?.amountPaid||0),0);
              const paidCount=slots.filter(mo=>payments[b.id]?.[mo]?.status==='Paid').length;
              return(
                <div key={b.id} style={{border:'1px solid rgba(0,0,0,0.07)',borderRadius:14,overflow:'hidden'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',cursor:'pointer'}} onClick={()=>setSelected(isOpen?null:b.id)}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontWeight:600,fontSize:15}}>{b.borrowerName}</span>
                        <Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/>
                      </div>
                      <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>
                        Loan from {b.loanStartDate||'—'} · {formatCurrency(b.loanAmount)} · Outstanding: <strong style={{color:'#ff9500'}}>{formatCurrency(Math.round(outstanding))}</strong>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:16,alignItems:'center'}}>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:11,color:'var(--text-secondary)'}}>{paidCount}/{slots.length} PAID</div>
                        <div style={{fontSize:15,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(totalColl))}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                  {isOpen&&(
                    <div style={{borderTop:'1px solid rgba(0,0,0,0.07)',padding:14}}>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                        {slots.map(mo=>{
                          const p=payments[b.id]?.[mo];
                          const isPaid=p?.status==='Paid';
                          const label=new Date(mo+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'});
                          return(
                            <div key={mo} onClick={()=>openModal(b,mo)} /* stays on History — no forced view switch */
                              style={{padding:'10px 12px',borderRadius:10,border:`1px solid ${isPaid?'rgba(52,199,89,0.25)':mo===month?'rgba(0,122,255,0.3)':'rgba(0,0,0,0.07)'}`,background:isPaid?'rgba(52,199,89,0.04)':mo===month?'rgba(0,122,255,0.04)':'#fafafa',cursor:'pointer'}}>
                              <div style={{fontSize:12,fontWeight:600,color:isPaid?'#1a7a34':mo===month?'#007aff':'var(--text-primary)',marginBottom:4}}>{label}</div>
                              <div style={{fontSize:13,fontWeight:700,color:isPaid?'#34c759':'var(--text-secondary)'}}>{isPaid?formatCurrency(p.totalCollected||p.amountPaid):'Pending'}</div>
                              {p?.addedToLoan&&<div style={{fontSize:10,color:'#5856d6',marginTop:2}}>Added to principal</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Collection Modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={`Collect Interest — ${modal?.borrowerName}`} width={500}
        footer={modal&&(
          <div style={{display:'flex',gap:10,width:'100%'}}>
            {pf.addToLoan
              ?<Button onClick={()=>savePay(false)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add Interest to Principal'}</Button>
              :<><Button onClick={()=>savePay(true)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'✓ Mark as Paid'}</Button>
              <Button variant="secondary" onClick={()=>savePay('partial')} disabled={saving}>Partial</Button>
              <Button variant="danger" onClick={()=>savePay(false)} disabled={saving}>Mark Unpaid</Button></>
            }
          </div>
        )}>
        {modal&&(()=>{
          const outstanding=getOutstanding(modal);
          const interest=calcInterest(modal,outstanding);
          const daysOD=getDaysOverdue(month);
          const fineAmt=parseFloat(pf.fine)||0;
          return(
            <> {/* intColV3 */}
              {/* identity strip */}
              <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:14,marginBottom:16,background:'rgba(255,149,0,0.06)',border:'1px solid rgba(255,149,0,0.2)'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'linear-gradient(135deg,#ff9500,#ff6b00)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'#fff',flexShrink:0}}>{(modal.borrowerName||'?')[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>{modal.borrowerName}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{modal.loanId} · {modal.phone}</div>
                </div>
              </div>
              {/* 3-col stats */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
                {[{l:'Outstanding',v:formatCurrency(Math.round(outstanding)),c:'#007aff'},{l:'Interest Due',v:formatCurrency(Math.round(interest)),c:'#ff9500'},{l:'Days OD',v:daysOD>0?`${daysOD} days`:'On time',c:daysOD>2?'#ff3b30':'#34c759'}].map((s,i)=>(
                  <div key={i} style={{padding:'10px 12px',borderRadius:10,background:`${s.c}0d`,textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',marginBottom:3}}>{s.l}</div>
                    <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Fine section */}
              {daysOD>2&&(
                <div style={{background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.15)',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
                  <div style={{fontSize:12,color:'#c0392b',fontWeight:600,marginBottom:10}}>
                    ⚠ {daysOD-2} days after grace — suggested fine: {formatCurrency((daysOD-2)*DAILY_FINE)}
                  </div>
                  {/* iOS toggle */}
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:pf.collectFine?10:0}}>
                    <div onClick={()=>setPf(p=>({...p,collectFine:!p.collectFine,fine:p.collectFine?'':''}))}
                      style={{width:44,height:26,borderRadius:999,padding:2,display:'flex',alignItems:'center',
                        justifyContent:pf.collectFine?'flex-end':'flex-start',
                        background:pf.collectFine?'#ff3b30':'#e5e5ea',
                        transition:'background .2s,justify-content .2s',cursor:'pointer',flexShrink:0}}>
                      <div style={{width:22,height:22,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,0.22)'}}/>
                    </div>
                    <span style={{fontSize:13,fontWeight:600,color:pf.collectFine?'#ff3b30':'var(--text-secondary)'}}>
                      {pf.collectFine?'Fine ON — enter amount below':'Fine OFF'}
                    </span>
                  </div>
                  {pf.collectFine&&(
                    <div>
                      <label style={{fontSize:12,color:'var(--text-secondary)',display:'block',marginBottom:5}}>Fine Amount (₹)</label>
                      <input type="number" value={pf.fine} onChange={e=>setPf(p=>({...p,fine:e.target.value}))}
                        placeholder="Enter fine amount…"
                        style={{height:36,padding:'0 12px',borderRadius:9,border:'1.5px solid rgba(255,59,48,0.3)',
                          fontSize:14,fontFamily:'inherit',background:'#fff',color:'var(--text-primary)',
                          outline:'none',width:'100%',boxSizing:'border-box'}}
                        autoFocus/>
                    </div>
                  )}
                </div>
              )}

              {/* Compound interest option */}
              {modal.compounding&&(
                <div style={{background:'rgba(88,86,214,0.06)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                  <div style={{fontSize:13,color:'#5856d6',fontWeight:600,marginBottom:6}}>Compound Interest Option</div>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={pf.addToLoan} onChange={e=>setPf(p=>({...p,addToLoan:e.target.checked,collectFine:e.target.checked?false:p.collectFine}))} style={{width:15,height:15,accentColor:'#5856d6'}}/>
                    <span>Add interest <strong>{formatCurrency(Math.round(interest))}</strong> to loan principal instead of collecting</span>
                  </label>
                  {pf.addToLoan&&(
                    <div style={{marginTop:8,fontSize:12,color:'#5856d6',background:'rgba(88,86,214,0.08)',borderRadius:8,padding:'8px 10px'}}>
                      New principal will be: {formatCurrency((modal.loanAmount||0)+Math.round(interest))}
                    </div>
                  )}
                </div>
              )}

              {!pf.addToLoan&&(
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Payment Date</label>
                      <input type="date" value={pf.date} onChange={e=>setPf(p=>({...p,date:e.target.value}))}
                        style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Mode</label>
                      <select value={pf.mode} onChange={e=>setPf(p=>({...p,mode:e.target.value}))}
                        style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none',appearance:'none',cursor:'pointer'}}>
                        <option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Amount (₹)</label>
                    <input type="number" value={pf.amount} onChange={e=>setPf(p=>({...p,amount:e.target.value}))}
                      style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
                  </div>
                  {(pf.collectFine&&fineAmt>0)&&(
                    <div style={{padding:'8px 12px',background:'rgba(52,199,89,0.06)',borderRadius:8,fontSize:13,color:'#1a7a34'}}>
                      Total collecting: {formatCurrency(parseFloat(pf.amount)||0)} + Fine {formatCurrency(fineAmt)} = <strong>{formatCurrency((parseFloat(pf.amount)||0)+fineAmt)}</strong>
                    </div>
                  )}
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Remarks</label>
                    <textarea value={pf.remarks} onChange={e=>setPf(p=>({...p,remarks:e.target.value}))} placeholder="Optional…"
                      style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:13,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none',minHeight:60,resize:'vertical'}}/>
                  </div>
                </div>
              )}

            </>
          );
        })()}
      </Modal>
    </div>
  );
}
