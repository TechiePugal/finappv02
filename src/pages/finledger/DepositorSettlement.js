import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,doc,serverTimestamp} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {printSettleInterestSummary} from '../../utils/pdfReport';
import {scopeToUser} from '../../utils/scopeHelper';
import {PageHeader,Card,Badge,Button,StatCard,Modal,SectionHeader,formatCurrency} from '../../components/finledger/UI';
import {useAuth} from '../../contexts/AuthContext';
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
  const futureLimit=new Date(now);futureLimit.setMonth(futureLimit.getMonth()+3); // extend 3mo ahead
  let idx=0;
  while(cur<=futureLimit){
    const next=new Date(cur);next.setMonth(next.getMonth()+t);
    const slotMo=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
    const curMoStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    slots.push({
      idx:++idx,
      month:slotMo,
      label:cur.toLocaleDateString('en-IN',{month:'long',year:'numeric'}),
      dueDate:next.toISOString().split('T')[0],
      isFuture:slotMo>curMoStr,
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
  const {user}=useAuth();
  const[depositors,setDepositors]=useState([]);
  const[payments,setPayments]=useState({});
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[modal,setModal]=useState(null);
  const[pf,setPf]=useState({date:'',mode:'Cash',amount:'',addToDeposit:false,fine:'0',collectFine:false,remarks:''});
  const[saving,setSaving]=useState(false);
  const[search,setSearch]=useState('');
  const[amtRange,setAmtRange]=useState('all');
  const[sortBy,setSortBy]=useState('name');
  const[windowStarts,setWindowStarts]=useState({}); // per-depositor sliding-window offset for period cards
  const[month,setMonth]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;});
  const DAILY_FINE=50;

  useEffect(()=>{
    const d=onSnapshot(collection(db,'deposit_master'),snap=>{
      setDepositors(scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).filter(d=>d.status==='Active').sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)));
      setLoading(false);
    },()=>setLoading(false));
    const p=onSnapshot(collection(db,'deposit_payments'),snap=>{
      const pm={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(r=>{const k=`${r.depositId}_${r.month}`;pm[k]=r;});
      setPayments(pm);
    });
    return()=>{d();p();};
  },[]);

  function calcPeriodInt(dep){
    // monthlyRate: rate entered as % per month (not annual)
    const p=dep.depositAmount||0,r=dep.interestRate||0,t=parseInt(dep.interestTenure)||1;
    // Simple: principal × monthly rate × months. Compound: principal × ((1+r)^t − 1)
    return dep.compounding?p*(Math.pow(1+r/100,t)-1):(p*(r/100)*t);
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
      addToDeposit:existing?.addedToDeposit||false,
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
      const addAmt=Math.round(interest);
      const wasAdded=existing?.addedToDeposit===true;
      const wantAdd=pf.addToDeposit&&!paid;
      let principalDelta=0;
      if(wantAdd&&!wasAdded)principalDelta=addAmt;
      else if(!wantAdd&&wasAdded)principalDelta=-(existing.addedAmount||addAmt);
      const finalAddedAmount=wantAdd?(wasAdded?(existing.addedAmount||addAmt):addAmt):0;
      const fine=pf.collectFine?parseFloat(pf.fine)||0:0;
      const totalPayout=paid?(parseFloat(pf.amount)||0)+fine:0;

      const data={
        depositId:depositor.id,depositorName:depositor.name,
        depositAmount:depositor.depositAmount,interestRate:depositor.interestRate,
        amountDue:Math.round(interest),
        amountPaid:paid?(parseFloat(pf.amount)||0):0,
        fine:paid?fine:0,totalPayout,
        status:paid?'Paid':'Unpaid',addedToDeposit:wantAdd,addedAmount:finalAddedAmount,
        paymentDate:paid?pf.date:null,paymentMode:paid?pf.mode:null,
        remarks:pf.remarks,month:slot.month,updatedAt:serverTimestamp()
      };

      let payDocId=existing?.id;
      if(existing){await updateDoc(doc(db,'deposit_payments',existing.id),data);}
      else{data.createdAt=serverTimestamp();data.createdBy=user?.uid||null;const r=await addDoc(collection(db,'deposit_payments'),data);payDocId=r.id;}

      if(paid){
        const lData={
          type:'Debit',category:'Deposit Settlement',
          description:`Interest payout to ${depositor.name} — ${slot.label}${fine>0?` + Fine ₹${fine}`:''}`,
          amount:totalPayout,paymentMode:pf.mode,date:pf.date,
          depositorName:depositor.name,depositId:depositor.id,
          linkedDepositPaymentId:payDocId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        };
        if(existing?.ledgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',existing.ledgerEntryId),{...lData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else{await addDoc(collection(db,'finance_ledger_entries'),lData);}
      }

      // Compound: apply principal delta ONCE, reverse when marked unpaid
      if(principalDelta!==0){
        const newAmt=Math.max(0,(depositor.depositAmount||0)+principalDelta);
        await updateDoc(doc(db,'deposit_master',depositor.id),{
          depositAmount:newAmt,
          periodInterest:calcPeriodInt({...depositor,depositAmount:newAmt}),
          updatedAt:serverTimestamp()
        });
        toast.success(principalDelta>0?`Interest ${formatCurrency(addAmt)} added once → principal ${formatCurrency(newAmt)}`:`Reversed ${formatCurrency(-principalDelta)} → principal ${formatCurrency(newAmt)}`);
      } else {
        toast.success(paid?'Settlement recorded!':(wantAdd&&wasAdded?'Already added once — no double credit':'Marked as unpaid'));
      }
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  const totalDue=depositors.reduce((s,d)=>s+Math.round(calcPeriodInt(d)),0);
  const totalPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure);
    return s+slots.filter(sl=>{const pp=payments[`${d.id}_${sl.month}`];return pp?.status==='Paid'||pp?.addedToDeposit;}).reduce((a,sl)=>{const pp=payments[`${d.id}_${sl.month}`];return a+(pp?.addedToDeposit?(pp.addedAmount||0):(pp?.totalPayout||pp?.amountPaid||0));},0);
  },0);
  const monthPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure);
    const moSlot=slots.find(sl=>sl.month===month);
    if(!moSlot)return s;
    const mp=payments[`${d.id}_${moSlot.month}`];
    return s+((mp?.status==='Paid'||mp?.addedToDeposit)?(mp?.addedToDeposit?(mp.addedAmount||0):(mp?.totalPayout||mp?.amountPaid||0)):0);
  },0);
  const filtered=depositors.filter(d=>{
    const s=search.trim().toLowerCase();
    const matchS=!s||[d.name,d.phone,d.depositId,d.guardianName,d.guardianPhone,d.nomineeName,d.nomineePhone].some(v=>String(v||'').toLowerCase().includes(s));
    const amt=d.depositAmount||0;
    let matchA=true;
    if(amtRange==='0-10000')matchA=amt<=10000;
    else if(amtRange==='10000-50000')matchA=amt>10000&&amt<=50000;
    else if(amtRange==='50000-100000')matchA=amt>50000&&amt<=100000;
    else if(amtRange==='100000+')matchA=amt>100000;
    return matchS&&matchA;
  }).sort((a,b)=>{
    if(sortBy==='amount')return(b.depositAmount||0)-(a.depositAmount||0);
    if(sortBy==='rate')return(b.interestRate||0)-(a.interestRate||0);
    return String(a.name||'').localeCompare(String(b.name||''));
  });

  if(loading)return<PageLoader stats={4}/>;

  return(
    <div className="page-enter">
      <PageHeader title="Settle Interest" subtitle="Pay out interest to depositors or reinvest via compound"
        action={
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              style={{padding:'8px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}}/>
            <Button variant="secondary" onClick={()=>printSettleInterestSummary(filtered, payments, month)}>Export PDF</Button>
          </div>
        }/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Active Depositors" value={depositors.length} sub="Requiring payouts" color="#5856d6"/>
        <StatCard label="This Month Due" value={formatCurrency(totalDue)} sub="Period interest payable" color="#ff9500"/>
        <StatCard label="This Month Settled" value={formatCurrency(Math.round(monthPaid))} sub="Already paid out" color="#34c759"/>
        <StatCard label="All Time Settled" value={formatCurrency(Math.round(totalPaid))} sub="Total interest paid" color="#007aff"/>
      </div>

      {/* Search + filter bar — matches Depositors/Borrowers layout */}
      <Card style={{marginBottom:20}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, phone, ID, guardian…"
            style={{flex:'1 1 220px',padding:'9px 14px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:13,color:'var(--text-primary)',outline:'none',fontFamily:'inherit'}}/>
          <select value={amtRange} onChange={e=>setAmtRange(e.target.value)} style={{padding:'9px 12px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
            <option value="all">All Amounts</option><option value="0-10000">₹0 – ₹10K</option><option value="10000-50000">₹10K – ₹50K</option><option value="50000-100000">₹50K – ₹1L</option><option value="100000+">₹1L+</option>
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:'9px 12px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}>
            <option value="name">Sort: Name A–Z</option><option value="amount">Sort: Highest Deposit First</option><option value="rate">Sort: Highest Rate First</option>
          </select>
        </div>
      </Card>

      {/* Depositor cards */}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {filtered.map(dep=>{
          const slots=genSlots(dep.startDate,dep.interestTenure);
          const isOpen=selected===dep.id;
          const paidCount=slots.filter(sl=>{const pp=payments[`${dep.id}_${sl.month}`];return pp?.status==='Paid'||pp?.addedToDeposit;}).length;
          const totalColl=slots.reduce((s,sl)=>s+(payments[`${dep.id}_${sl.month}`]?.totalPayout||payments[`${dep.id}_${sl.month}`]?.amountPaid||0),0);
          const pendingSlots=slots.filter(sl=>{const pp=payments[`${dep.id}_${sl.month}`];return !(pp?.status==='Paid'||pp?.addedToDeposit);});
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
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>{dep.depositId} · {formatCurrency(dep.depositAmount)} · {dep.interestRate}%/mo · {tenureLabel} · {dep.compounding?'Compound':'Simple'}</div>
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

              {isOpen&&(()=>{
                const WIN=5;
                const now=new Date();
                const curMo=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                const curIdx=slots.findIndex(s=>s.month===curMo);
                const defaultStart=Math.max(0, (curIdx>=0?curIdx:slots.length-1) - 2);
                const winStart=Math.min(Math.max(0,slots.length-WIN), windowStarts[dep.id]??defaultStart);
                const visible=slots.slice(winStart,winStart+WIN);
                const canPrev=winStart>0;
                const canNext=winStart+WIN<slots.length;
                return(
                <div style={{borderTop:'1px solid rgba(0,0,0,0.07)',padding:'14px 20px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <button onClick={()=>setWindowStarts(w=>({...w,[dep.id]:Math.max(0,winStart-1)}))} disabled={!canPrev}
                      style={{width:32,height:32,flexShrink:0,borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:canPrev?'#fff':'#f5f5f5',color:canPrev?'var(--text-primary)':'var(--text-tertiary)',cursor:canPrev?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,flex:1}}>
                      {visible.map(slot=>{
                        const key=`${dep.id}_${slot.month}`;
                        const p=payments[key];
                        const isPaid=p?.status==='Paid';
                        const isAdded=p?.addedToDeposit;
                        const isCur=slot.month===curMo;
                        const isFut=slot.isFuture;
                        const dOD=isFut?0:getDaysOverdue(slot.dueDate);
                        const bg=isPaid?'rgba(52,199,89,0.08)':isAdded?'rgba(88,86,214,0.08)':isFut?'rgba(0,0,0,0.02)':isCur?'rgba(0,122,255,0.08)':dOD>2?'rgba(255,59,48,0.06)':'rgba(0,0,0,0.02)';
                        const border=isPaid?'1.5px solid rgba(52,199,89,0.3)':isAdded?'1.5px solid rgba(88,86,214,0.3)':isFut?'1px dashed rgba(0,0,0,0.12)':isCur?'2px solid rgba(0,122,255,0.4)':dOD>2?'1.5px solid rgba(255,59,48,0.25)':'1px solid rgba(0,0,0,0.08)';
                        const col=isPaid?'#34c759':isAdded?'#5856d6':isFut?'var(--text-secondary)':isCur?'#007aff':dOD>2?'#ff3b30':'var(--text-primary)';
                        return(
                          <div key={slot.month} onClick={()=>openPay(dep,slot)} style={{padding:'10px 11px',borderRadius:10,border,background:bg,cursor:'pointer',position:'relative',opacity:isFut?0.7:1}}>
                            {isCur&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'#007aff',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>CURRENT</div>}
                            {isFut&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.3)',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>UPCOMING</div>}
                            <div style={{fontSize:11,fontWeight:700,color:col,marginBottom:2}}>{slot.label}</div>
                            <div style={{fontSize:13,fontWeight:800,color:col}}>{isPaid?formatCurrency(p.totalPayout||p.amountPaid):isAdded?'+ Principal':formatCurrency(Math.round(periodInt))}</div>
                            {isPaid&&<div style={{fontSize:9.5,color:'#34c759',marginTop:2}}>✓ paid</div>}
                            {isFut&&!isPaid&&<div style={{fontSize:9.5,color:'var(--text-secondary)',marginTop:2}}>advance allowed</div>}
                            {!isFut&&!isPaid&&dOD>2&&!isAdded&&<div style={{fontSize:9.5,color:'#ff3b30',fontWeight:600,marginTop:2}}>{dOD}d late</div>}
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={()=>setWindowStarts(w=>({...w,[dep.id]:Math.min(slots.length-WIN,winStart+1)}))} disabled={!canNext}
                      style={{width:32,height:32,flexShrink:0,borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:canNext?'#fff':'#f5f5f5',color:canNext?'var(--text-primary)':'var(--text-tertiary)',cursor:canNext?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
                  </div>
                </div>
                );
              })()}
            </Card>
          );
        })}
        {filtered.length===0&&<div style={{textAlign:'center',padding:48,color:'var(--text-secondary)'}}>No active depositors</div>}
      </div>

      {/* Settlement Modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={`Settle Interest — ${modal?.depositor?.name}`} width={500}
        footer={modal&&(
          <div style={{display:'flex',gap:10,width:'100%'}}>
            {pf.addToDeposit
              ?<Button onClick={()=>savePay(false)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'Add to Deposit Principal'}</Button>
              :<><Button onClick={()=>savePay(true)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':'✓ Settle Payout'}</Button>
              <Button variant="danger" onClick={()=>savePay(false)} disabled={saving}>Mark Unpaid</Button></>
            }
          </div>
        )}>
        {modal&&(()=>{
          const{depositor,slot}=modal;
          const interest=calcPeriodInt(depositor);
          const daysOD=getDaysOverdue(slot.dueDate);
          const fineAmt=parseFloat(pf.fine)||0;
          return(
            <>
              {/* depSettleV3 — identity + stats strip */}
              <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:14,marginBottom:14,background:'rgba(88,86,214,0.06)',border:'1px solid rgba(88,86,214,0.18)'}}>
                <div style={{width:52,height:52,borderRadius:'50%',background:'linear-gradient(135deg,#5856d6,#bf5af2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:800,color:'#fff',flexShrink:0}}>{(depositor.name||'?')[0].toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>{depositor.name}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{depositor.depositId} · {slot.label} · Period #{slot.idx}</div>
                  {daysOD>2&&<div style={{marginTop:4,display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:'#fff',background:'#ff3b30',padding:'2px 8px',borderRadius:99}}>⚠ {daysOD} days overdue</div>}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
                {[{l:'Principal',v:formatCurrency(depositor.depositAmount),c:'var(--text-primary)'},{l:'Interest Due',v:formatCurrency(Math.round(interest)),c:'#5856d6'},{l:'Rate',v:`${depositor.interestRate}%/mo`,c:'#ff9500'}].map((s,i)=>(
                  <div key={i} style={{padding:'10px 12px',borderRadius:10,background:i===1?'rgba(88,86,214,0.06)':'rgba(0,0,0,0.03)',textAlign:'center'}}>
                    <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',marginBottom:3}}>{s.l}</div>
                    <div style={{fontSize:14,fontWeight:800,color:s.c}}>{s.v}</div>
                  </div>
                ))}
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

            </>
          );
        })()}
      </Modal>
    </div>
  );
}
