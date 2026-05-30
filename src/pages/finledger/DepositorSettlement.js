import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,doc,serverTimestamp} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,Modal,SectionHeader,formatCurrency} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';

function genSlots(startDate,tenureMonths){
  if(!startDate)return[];
  const slots=[];
  // tenureMonths can be number (new) or legacy string like 'Monthly','Quarterly'
  const legacyMap={'Monthly':1,'Quarterly':3,'Half-Yearly':6,'Yearly':12};
  const t=typeof tenureMonths==='string'&&isNaN(tenureMonths)?
    (legacyMap[tenureMonths]||1):
    (parseInt(tenureMonths)||1);
  let cur=new Date(startDate);
  const now=new Date();
  let idx=0;
  while(cur<=now){
    const next=new Date(cur);next.setMonth(next.getMonth()+t);
    slots.push({
      idx:++idx,
      month:`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`,
      label:cur.toLocaleDateString('en-IN',{month:'long',year:'numeric'}),
      dueDate:next.toISOString().split('T')[0],
    });
    cur=next;
  }
  return slots;
}

function getDaysOverdue(dueDate){
  if(!dueDate)return 0;
  return Math.max(0,Math.floor((new Date()-new Date(dueDate))/(1000*60*60*24)));
}

export default function DepositorSettlement(){
  const[depositors,setDepositors]=useState([]);
  const[payments,setPayments]=useState({});
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[modal,setModal]=useState(null);
  const[pf,setPf]=useState({date:'',mode:'Cash',amount:'',addToDeposit:false,fine:'0',collectFine:false,remarks:''});
  const[saving,setSaving]=useState(false);
  const[search,setSearch]=useState('');
  const[month,setMonth]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;});
  const DAILY_FINE=50;

  useEffect(()=>{
    const d=onSnapshot(collection(db,'deposit_master'),snap=>{
      setDepositors(snap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.status==='Active').sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)));
      setLoading(false);
    },()=>setLoading(false));
    const p=onSnapshot(collection(db,'deposit_payments'),snap=>{
      const pm={};
      snap.docs.forEach(d=>{const r=d.data();const k=`${r.depositId}_${r.month}`;pm[k]={id:d.id,...r};});
      setPayments(pm);
    });
    return()=>{d();p();};
  },[]);

  function calcPeriodInt(dep){
    const p=dep.depositAmount||0,r=dep.interestRate||0,t=parseInt(dep.interestTenure)||1;
    return dep.compounding?p*(r/100/12)*t:(p*r/100/12)*t;
  }

  function openPay(depositor,slot){
    const key=`${depositor.id}_${slot.month}`;
    const existing=payments[key];
    const daysOD=getDaysOverdue(slot.dueDate);
    const fine=daysOD>2?(daysOD-2)*DAILY_FINE:0;
    setModal({depositor,slot});
    setPf({
      date:new Date().toISOString().split('T')[0],
      mode:existing?.paymentMode||'Cash',
      amount:String(Math.round(calcPeriodInt(depositor))),
      addToDeposit:false,
      fine:String(fine),
      collectFine:false,
      remarks:existing?.remarks||''
    });
  }

  async function savePay(paid){
    if(!modal)return;setSaving(true);
    const{depositor,slot}=modal;
    try{
      const key=`${depositor.id}_${slot.month}`;
      const existing=payments[key];
      const interest=calcPeriodInt(depositor);
      const fine=pf.collectFine?parseFloat(pf.fine)||0:0;
      const totalPayout=paid?(parseFloat(pf.amount)||0)+fine:0;

      const data={
        depositId:depositor.id,depositorName:depositor.name,
        depositAmount:depositor.depositAmount,interestRate:depositor.interestRate,
        amountDue:Math.round(interest),
        amountPaid:paid?(parseFloat(pf.amount)||0):0,
        fine:paid?fine:0,totalPayout,
        status:paid?'Paid':'Unpaid',addedToDeposit:pf.addToDeposit&&!paid,
        paymentDate:paid?pf.date:null,paymentMode:paid?pf.mode:null,
        remarks:pf.remarks,month:slot.month,updatedAt:serverTimestamp()
      };

      let payDocId=existing?.id;
      if(existing){await updateDoc(doc(db,'deposit_payments',existing.id),data);}
      else{data.createdAt=serverTimestamp();const r=await addDoc(collection(db,'deposit_payments'),data);payDocId=r.id;}

      if(paid){
        const lData={
          type:'Debit',category:'Deposit Settlement',
          description:`Interest payout to ${depositor.name} — ${slot.label}${fine>0?` + Fine ₹${fine}`:''}`,
          amount:totalPayout,paymentMode:pf.mode,date:pf.date,
          depositorName:depositor.name,depositId:depositor.id,
          linkedDepositPaymentId:payDocId,createdAt:serverTimestamp()
        };
        if(existing?.ledgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',existing.ledgerEntryId),{...lData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else{await addDoc(collection(db,'finance_ledger_entries'),lData);}
      }

      // Compound: add interest to deposit principal
      if(pf.addToDeposit&&!paid){
        const newAmt=(depositor.depositAmount||0)+Math.round(interest);
        await updateDoc(doc(db,'deposit_master',depositor.id),{
          depositAmount:newAmt,
          periodInterest:calcPeriodInt({...depositor,depositAmount:newAmt}),
          updatedAt:serverTimestamp()
        });
        toast.success(`Interest ${formatCurrency(Math.round(interest))} added to deposit. New principal: ${formatCurrency(newAmt)}`);
      } else {
        toast.success(paid?'Settlement recorded!':'Marked as unpaid');
      }
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  const totalDue=depositors.reduce((s,d)=>s+Math.round(calcPeriodInt(d)),0);
  const totalPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure);
    return s+slots.filter(sl=>payments[`${d.id}_${sl.month}`]?.status==='Paid').reduce((a,sl)=>a+(payments[`${d.id}_${sl.month}`]?.totalPayout||payments[`${d.id}_${sl.month}`]?.amountPaid||0),0);
  },0);
  const monthPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure);
    const moSlot=slots.find(sl=>sl.month===month);
    if(!moSlot)return s;
    return s+(payments[`${d.id}_${moSlot.month}`]?.status==='Paid'?(payments[`${d.id}_${moSlot.month}`]?.totalPayout||payments[`${d.id}_${moSlot.month}`]?.amountPaid||0):0);
  },0);
  const filtered=depositors.filter(d=>!search||d.name?.toLowerCase().includes(search.toLowerCase())||d.depositId?.toLowerCase().includes(search.toLowerCase()));

  if(loading)return<PageLoader stats={4}/>;

  return(
    <div className="page-enter">
      <PageHeader title="Settle Interest" subtitle="Pay out interest to depositors or reinvest via compound"
        action={
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search depositor…"
              style={{padding:'8px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,fontSize:13,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',width:180}}/>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              style={{padding:'8px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}}/>
          </div>
        }/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Active Depositors" value={depositors.length} sub="Requiring payouts" color="#5856d6"/>
        <StatCard label="This Month Due" value={formatCurrency(totalDue)} sub="Period interest payable" color="#ff9500"/>
        <StatCard label="This Month Settled" value={formatCurrency(Math.round(monthPaid))} sub="Already paid out" color="#34c759"/>
        <StatCard label="All Time Settled" value={formatCurrency(Math.round(totalPaid))} sub="Total interest paid" color="#007aff"/>
      </div>

      {/* Depositor cards */}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {filtered.map(dep=>{
          const slots=genSlots(dep.startDate,dep.interestTenure);
          const isOpen=selected===dep.id;
          const paidCount=slots.filter(sl=>payments[`${dep.id}_${sl.month}`]?.status==='Paid').length;
          const totalColl=slots.reduce((s,sl)=>s+(payments[`${dep.id}_${sl.month}`]?.totalPayout||payments[`${dep.id}_${sl.month}`]?.amountPaid||0),0);
          const pendingSlots=slots.filter(sl=>payments[`${dep.id}_${sl.month}`]?.status!=='Paid');
          const periodInt=calcPeriodInt(dep);
          const t=parseInt(dep.interestTenure)||1;
          const tenureLabel=t===1?'Monthly':t===3?'Quarterly':t===6?'Half-Yearly':t===12?'Yearly':`Every ${t}mo`;

          return(
            <Card key={dep.id} style={{padding:0,overflow:'visible'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',cursor:'pointer',borderRadius:14}} onClick={()=>setSelected(isOpen?null:dep.id)}>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  {dep.photo
                    ?<img src={dep.photo} alt="" style={{width:44,height:44,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
                    :<div style={{width:44,height:44,borderRadius:'50%',background:'rgba(88,86,214,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#5856d6',flexShrink:0}}>{dep.name?.[0]?.toUpperCase()}</div>}
                  <div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>{dep.name}</div>
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>{dep.depositId} · {formatCurrency(dep.depositAmount)} · {dep.interestRate}% p.a. · {tenureLabel} · {dep.compounding?'Compound':'Simple'}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:20,alignItems:'center'}}>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:2}}>{paidCount}/{slots.length} SETTLED</div>
                    <div style={{fontSize:14,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(totalColl))}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:2}}>PER PERIOD</div>
                    <div style={{fontSize:14,fontWeight:700,color:'#ff9500'}}>{formatCurrency(Math.round(periodInt))}</div>
                  </div>
                  {pendingSlots.length>0&&(
                    <div style={{padding:'4px 10px',borderRadius:99,background:'rgba(255,59,48,0.08)',border:'1px solid rgba(255,59,48,0.2)',fontSize:12,fontWeight:700,color:'#ff3b30'}}>{pendingSlots.length} pending</div>
                  )}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.2s',flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
                </div>
              </div>

              {isOpen&&(
                <div style={{borderTop:'1px solid rgba(0,0,0,0.07)',padding:'14px 20px'}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))',gap:10}}>
                    {slots.map(slot=>{
                      const key=`${dep.id}_${slot.month}`;
                      const p=payments[key];
                      const isPaid=p?.status==='Paid';
                      const daysOD=getDaysOverdue(slot.dueDate);
                      const isAddedToDeposit=p?.addedToDeposit;
                      return(
                        <div key={slot.month} style={{padding:'12px',borderRadius:10,border:`1.5px solid ${isPaid?'rgba(52,199,89,0.3)':isAddedToDeposit?'rgba(88,86,214,0.3)':daysOD>2?'rgba(255,59,48,0.25)':'rgba(0,0,0,0.08)'}`,background:isPaid?'rgba(52,199,89,0.04)':isAddedToDeposit?'rgba(88,86,214,0.04)':'#fafafa',cursor:'pointer',transition:'all 0.15s'}}
                          onClick={()=>openPay(dep,slot)}>
                          <div style={{fontSize:12,fontWeight:600,color:isPaid?'#1a7a34':isAddedToDeposit?'#5856d6':'var(--text-primary)',marginBottom:3}}>{slot.label}</div>
                          <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:4}}>Due: {slot.dueDate}</div>
                          <div style={{fontSize:14,fontWeight:700,color:isPaid?'#34c759':isAddedToDeposit?'#5856d6':'#ff9500'}}>
                            {isPaid?formatCurrency(p.totalPayout||p.amountPaid):isAddedToDeposit?'+ Principal':formatCurrency(Math.round(periodInt))}
                          </div>
                          {daysOD>2&&!isPaid&&!isAddedToDeposit&&<div style={{fontSize:10,color:'#ff3b30',fontWeight:600,marginTop:2}}>{daysOD}d overdue</div>}
                          {isPaid&&<div style={{fontSize:10,color:'#34c759',marginTop:2}}>✓ {p.paymentMode}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length===0&&<div style={{textAlign:'center',padding:48,color:'var(--text-secondary)'}}>No active depositors</div>}
      </div>

      {/* Settlement Modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={`Settle Interest — ${modal?.depositor?.name}`} width={500}>
        {modal&&(()=>{
          const{depositor,slot}=modal;
          const interest=calcPeriodInt(depositor);
          const daysOD=getDaysOverdue(slot.dueDate);
          const fineAmt=parseFloat(pf.fine)||0;
          return(
            <>
              <div style={{background:'rgba(0,122,255,0.06)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:13,color:'var(--text-secondary)'}}>{slot.label} — Period #{slot.idx}</span>
                  <span style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>{formatCurrency(Math.round(interest))}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text-secondary)'}}>
                  Deposit: {formatCurrency(depositor.depositAmount)} · {depositor.interestRate}% p.a. · {depositor.compounding?'Compound':'Simple'}
                </div>
                {daysOD>2&&<div style={{fontSize:12,color:'#ff3b30',fontWeight:600,marginTop:4}}>⚠ {daysOD} days overdue</div>}
              </div>

              {/* Fine */}
              {daysOD>2&&(
                <div style={{background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.15)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,marginBottom:pf.collectFine?8:0}}>
                    <input type="checkbox" checked={pf.collectFine} onChange={e=>setPf(p=>({...p,collectFine:e.target.checked}))} style={{width:15,height:15,accentColor:'var(--accent)'}}/>
                    <span>Borrower owes a fine of <strong>{formatCurrency((daysOD-2)*DAILY_FINE)}</strong> for late pickup</span>
                  </label>
                  {pf.collectFine&&<input type="number" value={pf.fine} onChange={e=>setPf(p=>({...p,fine:e.target.value}))}
                    style={{height:34,padding:'0 10px',borderRadius:8,border:'1.5px solid rgba(0,0,0,.1)',fontSize:13,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none',width:160}}/>}
                </div>
              )}

              {/* Compound: add to deposit */}
              {depositor.compounding&&(
                <div style={{background:'rgba(88,86,214,0.06)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                    <input type="checkbox" checked={pf.addToDeposit} onChange={e=>setPf(p=>({...p,addToDeposit:e.target.checked}))} style={{width:15,height:15,accentColor:'#5856d6'}}/>
                    <span>Add interest <strong>{formatCurrency(Math.round(interest))}</strong> back to deposit principal (compound)</span>
                  </label>
                  {pf.addToDeposit&&(
                    <div style={{marginTop:8,fontSize:12,color:'#5856d6',background:'rgba(88,86,214,0.08)',borderRadius:8,padding:'8px 10px'}}>
                      New deposit principal: {formatCurrency((depositor.depositAmount||0)+Math.round(interest))}
                    </div>
                  )}
                </div>
              )}

              {!pf.addToDeposit&&(
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                    <div>
                      <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Date</label>
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
                  <div style={{marginBottom:12}}>
                    <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Amount (₹)</label>
                    <input type="number" value={pf.amount} onChange={e=>setPf(p=>({...p,amount:e.target.value}))}
                      style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
                  </div>
                  {pf.collectFine&&fineAmt>0&&(
                    <div style={{padding:'8px 12px',background:'rgba(52,199,89,0.06)',borderRadius:8,fontSize:13,color:'#1a7a34',marginBottom:12}}>
                      Total payout: {formatCurrency(parseFloat(pf.amount)||0)} + Fine {formatCurrency(fineAmt)} = <strong>{formatCurrency((parseFloat(pf.amount)||0)+fineAmt)}</strong>
                    </div>
                  )}
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Remarks</label>
                    <input value={pf.remarks} onChange={e=>setPf(p=>({...p,remarks:e.target.value}))}
                      style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
                  </div>
                </>
              )}

              <div style={{display:'flex',gap:10,marginTop:16}}>
                {pf.addToDeposit
                  ?<Button onClick={()=>savePay(false)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add to Deposit Principal'}</Button>
                  :<><Button onClick={()=>savePay(true)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'✓ Settle Payout'}</Button>
                  <Button variant="danger" onClick={()=>savePay(false)} disabled={saving}>Mark Unpaid</Button></>
                }
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
