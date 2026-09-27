import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,deleteDoc,doc,serverTimestamp,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {printSettleInterestSummary} from '../../utils/pdfReport';
import {scopeToUser} from '../../utils/scopeHelper';
import {PageHeader,Card,Badge,Button,StatCard,Modal,SectionHeader,formatCurrency,FormField,Input} from '../../components/finledger/UI';
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
  const[addModal,setAddModal]=useState(null); // depositor currently getting extra principal added
  const[af,setAf]=useState({amount:'',date:'',remarks:''});
  const[addSaving,setAddSaving]=useState(false);
  const[axisLedger,setAxisLedger]=useState([]); // this depositor's settlement ledger entries, shown inside the Accept Payment popup for one-click Undo
  const[axisLedgerLoading,setAxisLedgerLoading]=useState(false);
  const[month,setMonth]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;});
  const[scope,setScope]=useState('month'); // 'month' = selected month only, 'overall' = full history up to date — toggle for the header stat tiles + Export PDF
  const[additions,setAdditions]=useState({}); // extra deposit top-ups — keeps the current period's interest from jumping early
  const[bulkPendingDep,setBulkPendingDep]=useState(null); // when >1 period is pending, holds each period's own fixed amount for one-shot settlement
  const[payThroughMonth,setPayThroughMonth]=useState(null); // "pay through" month picked from the pending range — settlement only covers earliest-pending..this month (cumulative), shown in blue
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
    const ad=onSnapshot(collection(db,'deposit_additions'),snap=>{
      const am={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(x=>{if(!am[x.depositorId])am[x.depositorId]=[];am[x.depositorId].push(x);});
      setAdditions(am);
    });
    return()=>{d();p();ad();};
  },[]);

  function calcPeriodInt(dep,forMonth){
    // BUG FIX: the comment here always said "next month onward" but the code below
    // actually used `>` instead of `>=`, which made an addition effective the SAME
    // month it was made — exactly the double-counting the user kept running into.
    // An addition made DURING a given month hasn't been held for that whole month
    // yet, so it earns nothing for that month; it only starts counting from the
    // FOLLOWING month. This applies identically whether the addition was a manual
    // top-up or interest that got compounded back into the deposit on settlement.
    const targetMonth = forMonth || month;
    const adds = additions[dep.id]||[];
    const notYetEffective = adds.filter(a=>a.date && a.date.slice(0,7)>=targetMonth).reduce((s,a)=>s+(a.amount||0),0);
    const effectivePrincipal = Math.max(0,(dep.depositAmount||0)-notYetEffective);
    // monthlyRate: rate entered as % per month (not annual)
    const p=effectivePrincipal,r=dep.interestRate||0,t=parseInt(dep.interestTenure)||1;
    // Simple: principal × monthly rate × months. Compound: principal × ((1+r)^t − 1)
    return dep.compounding?p*(Math.pow(1+r/100,t)-1):(p*(r/100)*t);
  }

  // ── "Pay through" month — when several periods are pending (say Jan–Sep), the
  // person picks one target month (say May) from the calendar-style chip row and
  // settlement covers ONLY the cumulative range from the earliest pending month
  // through that target — not the whole Jan–Sep range. Everything after the
  // picked month is left untouched, still pending. Defaults to the full range
  // (the last pending month) so nothing changes unless a month is actually picked.
  function activeBulkPeriods(list,through){
    if(!list)return null;
    if(!through)return list;
    return list.filter(p=>p.month<=through);
  }

  // `throughMonth` is optional — omitted (as the ⋮ axis button still does), the
  // bulk default is unchanged: the full pending range. Passed explicitly (as the
  // calendar cards below now do, with the clicked card's own month), it scopes
  // the settlement to just the cumulative range up to that month — same engine,
  // same math, just a different starting selection. Nothing about the settlement
  // LOGIC itself changes here.
  function openPay(depositor,slot,throughMonth){
    const key=`${depositor.id}_${slot.month}`;
    const existing=payments[key];
    const daysOD=getDaysOverdue(slot.dueDate);
    const fine=daysOD>2?(daysOD-2)*DAILY_FINE:0;

    // If earlier periods are ALSO still pending, offer to settle them all
    // together — each still gets recorded at its own correct fixed amount.
    const allSlots=genSlots(depositor.startDate,depositor.interestTenure).filter(sl=>!sl.isFuture&&sl.month<=slot.month);
    const pendingSlots2=allSlots.filter(sl=>{
      const pp=payments[`${depositor.id}_${sl.month}`];
      return !(pp?.status==='Paid'||pp?.addedToDeposit);
    });
    const pendingBreakdown=pendingSlots2.map(sl=>({
      month:sl.month,label:sl.label,
      amount:Math.round(calcPeriodInt(depositor,sl.month)),
    }));

    setModal({depositor,slot});
    const isBulk=pendingBreakdown.length>1;
    setBulkPendingDep(isBulk?pendingBreakdown:null);
    // Default "pay through" = the full pending range (last pending month) unless a
    // specific target was passed in — nothing changes in behavior for the ⋮ button,
    // which never passes one.
    const resolvedThrough=isBulk?(throughMonth&&pendingBreakdown.some(p=>p.month===throughMonth)?throughMonth:pendingBreakdown[pendingBreakdown.length-1].month):null;
    setPayThroughMonth(resolvedThrough);
    const interestDue=Math.round(calcPeriodInt(depositor,slot.month)); // BUG FIX: was calcPeriodInt(depositor) with no month, which silently used whichever month the page happened to be viewing, not the specific period being opened
    // Split settlement: how much of the interest is paid out in cash vs added back to
    // the deposit principal (compound) — any ratio, not just all-or-nothing.
    const prevAdded=existing?.addedAmount||0;
    const prevCash=existing?.amountPaid||0;
    const combinedTotal=isBulk?pendingBreakdown.filter(p=>p.month<=resolvedThrough).reduce((s,p)=>s+p.amount,0):pendingBreakdown.reduce((s,p)=>s+p.amount,0);
    setPf({
      date:new Date().toISOString().split('T')[0],
      mode:existing?.paymentMode||'Cash',
      cashAmount:String(pendingBreakdown.length>1?combinedTotal:(existing?(prevCash):interestDue)),
      compoundAmount:String(pendingBreakdown.length>1?0:(existing?prevAdded:0)),
      fine:String(fine),
      collectFine:false,
      remarks:existing?.remarks||''
    });
  }

  async function savePay(paid){
    if(!modal)return;setSaving(true);
    const{depositor,slot}=modal;
    try{
      // Bulk settle — several periods were pending; close them all out in one
      // action. Each period is still recorded at its own correct fixed amount,
      // and (like the single-period flow) each can independently be cash,
      // compounded, or split — here we settle each fully in cash for simplicity,
      // matching the combined total the user confirmed.
      if(bulkPendingDep && paid){
        // One shared batch id ties every period + ledger entry created by THIS bulk
        // action together, so a later per-period Undo can find its siblings and the
        // Ledger can show which entries came from the same settlement click.
        const batchId=`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const fine=pf.collectFine?parseFloat(pf.fine)||0:0;
        const totalCash=parseFloat(pf.cashAmount)||0;
        const totalCompound=parseFloat(pf.compoundAmount)||0;
        // Only periods up to the picked "pay through" month are touched by this
        // action — anything after it (e.g. June–Sep when May was picked) stays
        // exactly as it was, still pending, untouched by this settlement at all.
        const periodsInScope=activeBulkPeriods(bulkPendingDep,payThroughMonth);
        const periodsBeyond=bulkPendingDep.filter(p=>!periodsInScope.includes(p));
        // BUG FIX (the "clitch" in the screenshot): this used to blend cash and
        // compound by a single RATIO applied to EVERY period alike — ₹3,500 cash +
        // ₹5,000 deposit against six ₹1,500 months turned into a same weird ₹618/₹882
        // split repeated six times, which doesn't read as "settled" at all.
        // Proper order, exactly as asked — first month, completely, then the next,
        // one at a time: cash covers as many WHOLE months as it reaches, oldest
        // first; once cash runs out, the deposit portion picks up from wherever cash
        // left off and keeps covering whole months the same way; whatever's left
        // over after that becomes a Partial on the next month, split however each
        // stream happened to leave off — never spread thin across every month.
        let cashBudget=totalCash, compoundBudget=totalCompound;
        const settledPeriods=[];
        const stillPendingPeriods=[];
        let partialPeriod=null, partialCash=0, partialCompound=0;
        let exhausted=false;
        for(const period of periodsInScope){
          if(exhausted){ stillPendingPeriods.push(period); continue; }
          const fromCash=Math.min(cashBudget,period.amount); cashBudget-=fromCash;
          let remaining=period.amount-fromCash;
          const fromCompound=Math.min(compoundBudget,remaining); compoundBudget-=fromCompound;
          remaining-=fromCompound;
          if(remaining<=0){
            settledPeriods.push({...period,cash:fromCash,compound:fromCompound});
          } else if(fromCash>0||fromCompound>0){
            partialPeriod=period; partialCash=fromCash; partialCompound=fromCompound;
            exhausted=true;
          } else {
            stillPendingPeriods.push(period);
            exhausted=true;
          }
        }
        const partialAmount=partialCash+partialCompound;
        // Every period's OWN payment record still gets saved individually — the
        // monthly view needs each month tracked on its own so it can show which
        // ones are Paid/Partial. What changes here is the LEDGER: instead of one
        // row per period ("June", "July", "August"...), this whole action becomes
        // ONE combined cash row and ONE combined compound row — the same total,
        // dated today, exactly like a real bank statement shows one line for one
        // transaction, not one line per month it happened to cover.
        let totalCompoundDelta=0,totalCashSettled=0,totalCompoundSettled=0;
        const touchedPayDocIds=[];
        for(const period of settledPeriods){
          const periodCash=period.cash, periodCompound=period.compound;
          const pKey=`${depositor.id}_${period.month}`;
          const existingP=payments[pKey];
          totalCompoundDelta += periodCompound - (existingP?.addedAmount||0);
          totalCashSettled += periodCash; totalCompoundSettled += periodCompound;
          const data={
            depositId:depositor.id,depositorName:depositor.name,
            depositAmount:depositor.depositAmount,interestRate:depositor.interestRate,
            amountDue:period.amount,amountPaid:periodCash,
            fine:0,totalPayout:periodCash,
            status:'Paid',addedToDeposit:periodCompound>0,addedAmount:periodCompound,
            paymentDate:pf.date,paymentMode:pf.mode,settlementBatchId:batchId,
            remarks:pf.remarks,month:period.month,updatedAt:serverTimestamp()
          };
          let payDocId=existingP?.id;
          if(existingP){await updateDoc(doc(db,'deposit_payments',existingP.id),data);}
          else{data.createdAt=serverTimestamp();data.createdBy=user?.uid||null;const r=await addDoc(collection(db,'deposit_payments'),data);payDocId=r.id;}
          touchedPayDocIds.push(payDocId);
        }
        if(partialPeriod){
          const periodPartialCash=partialCash, periodPartialCompound=partialCompound;
          const pKeyPartial=`${depositor.id}_${partialPeriod.month}`;
          const existingPartial=payments[pKeyPartial];
          totalCompoundDelta += periodPartialCompound - (existingPartial?.addedAmount||0);
          totalCashSettled += periodPartialCash; totalCompoundSettled += periodPartialCompound;
          const partialData={
            depositId:depositor.id,depositorName:depositor.name,
            depositAmount:depositor.depositAmount,interestRate:depositor.interestRate,
            amountDue:partialPeriod.amount,amountPaid:periodPartialCash,
            fine:0,totalPayout:periodPartialCash,
            status:'Partial',addedToDeposit:periodPartialCompound>0,addedAmount:periodPartialCompound,
            paymentDate:pf.date,paymentMode:pf.mode,settlementBatchId:batchId,
            remarks:pf.remarks?`${pf.remarks} (partial from bulk settlement)`:'Partial from bulk settlement',
            month:partialPeriod.month,updatedAt:serverTimestamp()
          };
          let partialPayDocId=existingPartial?.id;
          if(existingPartial){await updateDoc(doc(db,'deposit_payments',existingPartial.id),partialData);}
          else{partialData.createdAt=serverTimestamp();partialData.createdBy=user?.uid||null;const r=await addDoc(collection(db,'deposit_payments'),partialData);partialPayDocId=r.id;}
          touchedPayDocIds.push(partialPayDocId);
        }
        const periodCount=settledPeriods.length+(partialPeriod?1:0);
        const rangeLabel=periodCount>0?(periodCount===1?(settledPeriods[0]||partialPeriod).label:`${bulkPendingDep[0].label} – ${(partialPeriod||settledPeriods[settledPeriods.length-1]).label}`):'';
        // ONE combined ledger row for the whole cash payout, whatever it covers.
        if(totalCashSettled>0){
          await addDoc(collection(db,'finance_ledger_entries'),{
            type:'Debit',category:'Deposit Settlement',
            description:`Interest payout to ${depositor.name} — ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel}) settled today${totalCompoundSettled>0?` + ₹${totalCompoundSettled.toLocaleString('en-IN')} compounded`:''}`,
            amount:totalCashSettled,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
            depositorName:depositor.name,depositId:depositor.id,settlementBatchId:batchId,
            createdAt:serverTimestamp(),createdBy:user?.uid||null
          });
        }
        // Apply the actual principal change, AND record it as one dated addition
        // (like a manual top-up) so calcPeriodInt correctly excludes it from THIS
        // settlement month's own interest and only counts it starting next month —
        // this is the step that was missing entirely before.
        if(totalCompoundDelta!==0){
          const newDepositAmt=Math.max(0,(depositor.depositAmount||0)+totalCompoundDelta);
          await updateDoc(doc(db,'deposit_master',depositor.id),{
            depositAmount:newDepositAmt,
            periodInterest:calcPeriodInt({...depositor,depositAmount:newDepositAmt}),
            updatedAt:serverTimestamp()
          });
          if(totalCompoundDelta>0){
            await addDoc(collection(db,'deposit_additions'),{
              depositorId:depositor.id,depositorName:depositor.name,depositId:depositor.depositId||depositor.id,
              amount:totalCompoundDelta,previousAmount:depositor.depositAmount||0,newAmount:newDepositAmt,
              date:pf.date,remarks:`Compounded from settling ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel})`,
              settlementBatchId:batchId,createdAt:serverTimestamp(),createdBy:user?.uid||null
            });
          }
          if(totalCompoundSettled>0){
            await addDoc(collection(db,'finance_ledger_entries'),{
              type:'Debit',category:'Interest Compounded',
              description:`Interest added to ${depositor.name}'s deposit — ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel}), reinvested not paid out`,
              amount:totalCompoundSettled,paymentMode:'Compound',date:pf.date,remarks:pf.remarks||'',
              depositorName:depositor.name,depositId:depositor.id,settlementBatchId:batchId,
              createdAt:serverTimestamp(),createdBy:user?.uid||null
            });
          }
        }
        if(fine>0){
          await addDoc(collection(db,'finance_ledger_entries'),{
            type:'Credit',category:'Fine Income',
            description:`Late-settlement fine from ${depositor.name} — bulk settlement of ${settledPeriods.length} periods`,
            amount:fine,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
            depositorName:depositor.name,depositId:depositor.id,settlementBatchId:batchId,
            createdAt:serverTimestamp(),createdBy:user?.uid||null
          });
        }
        const stillPendingTotal=stillPendingPeriods.reduce((s,p)=>s+p.amount,0)+periodsBeyond.reduce((s,p)=>s+p.amount,0);
        const stillPendingCount=stillPendingPeriods.length+periodsBeyond.length;
        const partialNote=partialPeriod?` (${formatCurrency(partialAmount)} applied as a partial payment for ${partialPeriod.label})`:'';
        const throughNote=periodsBeyond.length>0?` Settled through ${periodsInScope[periodsInScope.length-1].label} — ${periodsBeyond.length} period${periodsBeyond.length!==1?'s':''} from ${periodsBeyond[0].label} onward left pending as chosen.`:'';
        if(stillPendingCount>0 || partialPeriod){
          toast.success(`✓ ${settledPeriods.length} period${settledPeriods.length!==1?'s':''} fully settled${partialNote}. ${formatCurrency(stillPendingTotal)} still pending for ${stillPendingCount} period${stillPendingCount!==1?'s':''}.${throughNote}`);
        } else {
          toast.success(`✓ All ${settledPeriods.length} pending periods settled — ${formatCurrency(settledPeriods.reduce((s,p)=>s+p.amount,0)+fine)} total`);
        }
        setModal(null);setBulkPendingDep(null);setPayThroughMonth(null);setSaving(false);
        return;
      }

      const key=`${depositor.id}_${slot.month}`;
      const existing=payments[key];
      const interest=calcPeriodInt(depositor,slot.month); // BUG FIX: was missing the month, silently using the page's globally-selected month
      const fine=pf.collectFine?parseFloat(pf.fine)||0:0;

      // Split settlement: cash portion (paid out) + compound portion (added to principal).
      // Both can be any amount — e.g. ₹12,000 due → ₹2,000 cash + ₹10,000 compounded,
      // or the depositor tops up with their OWN extra cash to compound a larger amount.
      const cashVal=paid?(parseFloat(pf.cashAmount)||0):0;
      const compoundVal=paid?(parseFloat(pf.compoundAmount)||0):0;
      const totalPayout=cashVal; // fine is recorded SEPARATELY below — never mixed into the payout itself

      const prevCompound=existing?.addedAmount||0;
      const principalDelta=compoundVal-prevCompound; // reverses cleanly if edited or unpaid

      // BUG FIX: this used to mark status:'Paid' the moment the person clicked Settle,
      // even if cash+deposit came nowhere near the interest actually due — e.g. ₹2,000
      // cash + ₹5,000 deposit against ₹12,000 due was silently recorded as fully Paid.
      // The real, un-forced total actually given decides the status now.
      const totalGiven=cashVal+compoundVal;
      const dueRounded=Math.round(interest);
      const newStatus=!paid?'Unpaid':(totalGiven>=dueRounded?'Paid':(totalGiven>0?'Partial':'Unpaid'));
      const batchId=paid?`${Date.now()}_${Math.random().toString(36).slice(2,8)}`:(existing?.settlementBatchId||null);

      const data={
        depositId:depositor.id,depositorName:depositor.name,
        depositAmount:depositor.depositAmount,interestRate:depositor.interestRate,
        amountDue:Math.round(interest),
        amountPaid:cashVal,
        fine:paid?fine:0,totalPayout,
        status:newStatus,addedToDeposit:compoundVal>0,addedAmount:compoundVal,
        paymentDate:paid?pf.date:null,paymentMode:paid?pf.mode:null,
        settlementBatchId:batchId,
        remarks:pf.remarks,month:slot.month,updatedAt:serverTimestamp()
      };

      let payDocId=existing?.id;
      if(existing){await updateDoc(doc(db,'deposit_payments',existing.id),data);}
      else{data.createdAt=serverTimestamp();data.createdBy=user?.uid||null;const r=await addDoc(collection(db,'deposit_payments'),data);payDocId=r.id;}

      if(paid&&cashVal>0){
        const lData={
          type:'Debit',category:'Deposit Settlement',
          description:`Interest payout to ${depositor.name} — ${slot.label}${compoundVal>0?` (₹${compoundVal} compounded separately)`:''}`,
          amount:totalPayout,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
          depositorName:depositor.name,depositId:depositor.id,
          settlementBatchId:batchId,
          linkedDepositPaymentId:payDocId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        };
        if(existing?.ledgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',existing.ledgerEntryId),{...lData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else{await addDoc(collection(db,'finance_ledger_entries'),lData);}
      }
      // BUG FIX: this used to addDoc a fresh "Interest Compounded" ledger row every
      // time you re-opened and re-saved the SAME period, leaving old duplicate rows
      // behind. It now updates the same row in place (like the cash entry above),
      // and removes it if the compound amount is edited back down to zero.
      let compoundLedgerEntryId=existing?.compoundLedgerEntryId||null;
      if(paid&&compoundVal>0){
        const cData={
          type:'Debit',category:'Interest Compounded',
          description:`Interest added to ${depositor.name}'s deposit — ${slot.label} (reinvested, not paid out)`,
          amount:compoundVal,paymentMode:'Compound',date:pf.date,remarks:pf.remarks||'',
          depositorName:depositor.name,depositId:depositor.id,
          settlementBatchId:batchId,
          linkedDepositPaymentId:payDocId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        };
        if(compoundLedgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',compoundLedgerEntryId),{...cData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else{const r=await addDoc(collection(db,'finance_ledger_entries'),cData);compoundLedgerEntryId=r.id;}
      } else if(compoundLedgerEntryId){
        await updateDoc(doc(db,'finance_ledger_entries',compoundLedgerEntryId),{deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null});
        compoundLedgerEntryId=null;
      }
      await updateDoc(doc(db,'deposit_payments',payDocId),{compoundLedgerEntryId});
      if(paid&&fine>0){
        await addDoc(collection(db,'finance_ledger_entries'),{
          type:'Credit',category:'Fine Income',
          description:`Late-settlement fine from ${depositor.name} — ${slot.label}`,
          amount:fine,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
          depositorName:depositor.name,depositId:depositor.id,
          settlementBatchId:batchId,
          linkedDepositPaymentId:payDocId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        });
      }

      // Compound portion: apply the principal delta, cleanly reversible if edited/unpaid.
      // ALSO record it as a dated addition (like a manual top-up) so calcPeriodInt
      // correctly excludes it from THIS settlement month's own interest and only
      // starts counting it from next month onward — this is the step that was
      // missing before, which is exactly why "which date does the added amount
      // start counting" looked inconsistent.
      let compoundAdditionId=existing?.compoundAdditionId||null;
      if(principalDelta!==0){
        const newAmt=Math.max(0,(depositor.depositAmount||0)+principalDelta);
        await updateDoc(doc(db,'deposit_master',depositor.id),{
          depositAmount:newAmt,
          periodInterest:calcPeriodInt({...depositor,depositAmount:newAmt}),
          updatedAt:serverTimestamp()
        });
      }
      if(compoundVal>0){
        const aData={
          depositorId:depositor.id,depositorName:depositor.name,depositId:depositor.depositId||depositor.id,
          amount:compoundVal,date:pf.date,
          remarks:`Compounded from settling ${slot.label}`,
          settlementBatchId:batchId,updatedAt:serverTimestamp()
        };
        if(compoundAdditionId){await updateDoc(doc(db,'deposit_additions',compoundAdditionId),aData);}
        else{aData.createdAt=serverTimestamp();aData.createdBy=user?.uid||null;const r=await addDoc(collection(db,'deposit_additions'),aData);compoundAdditionId=r.id;}
      } else if(compoundAdditionId){
        await deleteDoc(doc(db,'deposit_additions',compoundAdditionId));
        compoundAdditionId=null;
      }
      await updateDoc(doc(db,'deposit_payments',payDocId),{compoundAdditionId});
      const partialNote2=newStatus==='Partial'?` — ₹${(dueRounded-totalGiven).toLocaleString('en-IN')} still pending for this period`:'';
      toast.success(paid
        ?(compoundVal>0&&cashVal>0?`✓ Settled — ${formatCurrency(cashVal)} in hand + ${formatCurrency(compoundVal)} compounded${partialNote2}`:compoundVal>0?`✓ ${formatCurrency(compoundVal)} added to deposit principal${partialNote2}`:`✓ Settlement recorded!${partialNote2}`)
        :'Marked as unpaid'
      );
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  // ── Undo an ENTIRE settlement action (one click = one Accept Payment = one
  // settlementBatchId, whether it covered 1 month or 10) — reverses it EVERYWHERE
  // it touched: every period it settled goes back to Pending, the compounded
  // amount's own dated addition record is deleted and subtracted back out of the
  // deposit's real principal, and every ledger entry the action created is
  // soft-deleted (same convention as the Ledger's own Trash/Restore) so it's
  // recoverable there if the undo itself turns out to be wrong.
  const[undoingKey,setUndoingKey]=useState(null);
  async function undoBatch(depositor,batchId,label){
    if(!batchId)return toast.error('This entry has no settlement to undo (older data from before Undo existed).');
    if(!window.confirm(`Undo this settlement${label?` — ${label}`:''}?\n\nThis reverses the deposit principal, deletes every ledger entry it created, and puts every period it covered back to Pending.`))return;
    setUndoingKey(batchId);
    try{
      // 1) Every period this action settled goes back to Pending.
      const touchedPayments=Object.values(payments).filter(p=>p.settlementBatchId===batchId);
      for(const p of touchedPayments){
        await updateDoc(doc(db,'deposit_payments',p.id),{
          amountPaid:0,addedAmount:0,fine:0,totalPayout:0,
          status:'Unpaid',addedToDeposit:false,
          paymentDate:null,paymentMode:null,compoundAdditionId:null,compoundLedgerEntryId:null,
          remarks:p.remarks?`${p.remarks} (undone)`:'Undone',
          updatedAt:serverTimestamp()
        });
      }
      // 2) Delete the dated addition(s) this action created and subtract that exact
      // amount back out of the real principal — reversing the SAME number that was
      // added, not recomputing from scratch.
      const addSnap=await getDocs(query(collection(db,'deposit_additions'),where('settlementBatchId','==',batchId)));
      let totalAdded=0;
      for(const ad of addSnap.docs){ totalAdded+=ad.data().amount||0; await deleteDoc(doc(db,'deposit_additions',ad.id)); }
      if(totalAdded>0){
        const revertedAmt=Math.max(0,(depositor.depositAmount||0)-totalAdded);
        await updateDoc(doc(db,'deposit_master',depositor.id),{
          depositAmount:revertedAmt,
          periodInterest:calcPeriodInt({...depositor,depositAmount:revertedAmt}),
          updatedAt:serverTimestamp()
        });
      }
      // 3) Soft-delete every ledger entry this action created, snapshotting enough
      // to restore from the Ledger's own Trash if the undo turns out to be wrong.
      const ledgerSnap=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',batchId)));
      for(const ld of ledgerSnap.docs){
        await updateDoc(doc(db,'finance_ledger_entries',ld.id),{
          deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null,
          revertedLinkedData:{depositBatch:{payments:touchedPayments,additionsTotal:totalAdded},depositPrincipalBefore:depositor.depositAmount}
        });
      }
      toast.success(`✓ Undone — ${touchedPayments.length} period${touchedPayments.length!==1?'s':''} back to Pending${totalAdded>0?`, ${formatCurrency(totalAdded)} removed from principal`:''}`);
    }catch(e){toast.error('Undo failed: '+e.message);}finally{setUndoingKey(null);}
  }

  // ── Loads this depositor's own settlement ledger entries so they can be undone
  // right here in the Accept Payment popup — no need to go hunting through the
  // (now read-only) monthly period cards or the Ledger page separately.
  async function loadAxisLedger(depositor){
    setAxisLedgerLoading(true);
    try{
      const snap=await getDocs(query(collection(db,'finance_ledger_entries'),where('depositId','==',depositor.id)));
      const list=scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid)
        .filter(e=>!e.deleted&&['Deposit Settlement','Interest Compounded','Fine Income'].includes(e.category))
        .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)));
      setAxisLedger(list);
    }catch(e){toast.error('Could not load ledger entries: '+e.message);}finally{setAxisLedgerLoading(false);}
  }

  // ── Add extra principal to an existing deposit — own audit-trail record with date
  // and note, plus a ledger entry, separate from regular interest settlements. ──
  async function saveAddAmount(e){
    if(e&&e.preventDefault) e.preventDefault();
    if(!af.amount||parseFloat(af.amount)<=0)return toast.error('Enter a valid amount');
    const extra=parseFloat(af.amount);
    const prevAmount=addModal.depositAmount||0;
    const newAmount=prevAmount+extra;
    setAddSaving(true);
    try{
      await addDoc(collection(db,'deposit_additions'),{
        depositorId:addModal.id, depositorName:addModal.name, depositId:addModal.depositId||addModal.id,
        amount:extra, previousAmount:prevAmount, newAmount, date:af.date, remarks:af.remarks,
        createdAt:serverTimestamp(), createdBy:user?.uid||null,
      });
      await addDoc(collection(db,'finance_ledger_entries'),{
        type:'Debit', category:'Deposit Amount Increased',
        description:`Additional ${formatCurrency(extra)} deposited by ${addModal.name} — ${formatCurrency(prevAmount)} → ${formatCurrency(newAmount)}${af.remarks?' · '+af.remarks:''}`,
        amount:extra, date:af.date,
        borrowerName:addModal.name, depositorId:addModal.id, depositId:addModal.depositId||addModal.id,
        createdAt:serverTimestamp(), createdBy:user?.uid||null,
      });
      await updateDoc(doc(db,'deposit_master',addModal.id),{
        depositAmount:newAmount, updatedAt:serverTimestamp(),
      });
      toast.success(`✓ ₹${extra.toLocaleString('en-IN')} added — new deposit total: ${formatCurrency(newAmount)}`);
      setAddModal(null);
    }catch(err){toast.error('Failed: '+err.message);}finally{setAddSaving(false);}
  }

  // THIS MONTH — the selected month only.
  const monthDue=depositors.reduce((s,d)=>s+Math.round(calcPeriodInt(d)),0);
  const monthPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure);
    const moSlot=slots.find(sl=>sl.month===month);
    if(!moSlot)return s;
    const mp=payments[`${d.id}_${moSlot.month}`];
    // A period can be split between cash-in-hand AND added-to-deposit at the same
    // time — sum BOTH, never an either/or, and include 'Partial' settlements too.
    if(mp&&(mp.status==='Paid'||mp.status==='Partial'||mp.addedToDeposit)) return s+(mp.amountPaid||0)+(mp.addedAmount||0);
    return s;
  },0);
  const monthPending=Math.max(0,monthDue-monthPaid);

  // OVERALL — every period from each deposit's start date up to today, using the
  // stored amountDue when a doc exists (historically accurate) or recomputing via
  // calcPeriodInt for a period that was never opened in the UI yet — matching the
  // same "up to date" logic used in the Export PDF (depositDueUpToDate).
  const overallDue=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure).filter(sl=>!sl.isFuture);
    return s+slots.reduce((ss,sl)=>{
      const pp=payments[`${d.id}_${sl.month}`];
      return ss+(pp&&pp.amountDue!=null?pp.amountDue:Math.round(calcPeriodInt(d,sl.month)));
    },0);
  },0);
  const totalPaid=depositors.reduce((s,d)=>{
    const slots=genSlots(d.startDate,d.interestTenure).filter(sl=>!sl.isFuture);
    return s+slots.reduce((ss,sl)=>{
      const pp=payments[`${d.id}_${sl.month}`];
      if(pp&&(pp.status==='Paid'||pp.status==='Partial'||pp.addedToDeposit)) return ss+(pp.amountPaid||0)+(pp.addedAmount||0);
      return ss;
    },0);
  },0);
  const overallPending=Math.max(0,overallDue-totalPaid);

  const isOverall=scope==='overall';
  const totalDue=isOverall?overallDue:monthDue;
  const dispPaid=isOverall?totalPaid:monthPaid;
  const dispPending=isOverall?overallPending:monthPending;
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
            <div style={{display:'flex',background:'rgba(118,118,128,0.1)',borderRadius:10,padding:3}}>
              {['month','overall'].map(sc=>(
                <button key={sc} onClick={()=>setScope(sc)}
                  style={{padding:'6px 14px',borderRadius:8,border:'none',background:scope===sc?'#fff':'transparent',boxShadow:scope===sc?'0 1px 3px rgba(0,0,0,0.15)':'none',fontSize:12.5,fontWeight:700,color:scope===sc?'var(--text-primary)':'var(--text-secondary)',cursor:'pointer',fontFamily:'inherit'}}>
                  {sc==='month'?'This Month':'Overall'}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={()=>printSettleInterestSummary(filtered, payments, month, additions, scope)}>Export PDF</Button>
          </div>
        }/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Active Depositors" value={depositors.length} sub="Requiring payouts" color="#5856d6"/>
        <StatCard label={isOverall?'Total Interest Up to Date':`Interest Due — ${new Date(month+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`} value={formatCurrency(totalDue)} sub={isOverall?'All deposits, from start to today':'Period interest payable, this month only'} color="#ff9500"/>
        <StatCard label="Settled" value={formatCurrency(Math.round(dispPaid))} sub={isOverall?'Settled all-time':'Already paid out this month'} color="#34c759"/>
        <StatCard label="Balance to Give" value={formatCurrency(Math.round(dispPending))} sub={isOverall?'Still owed, up to date':'Still owed, this month'} color={dispPending>0?'#ff453a':'#34c759'}/>
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
        {filtered.map((dep,depIdx)=>{
          const slots=genSlots(dep.startDate,dep.interestTenure);
          const isOpen=selected===dep.id;
          const paidCount=slots.filter(sl=>{const pp=payments[`${dep.id}_${sl.month}`];return pp?.status==='Paid'||pp?.addedToDeposit;}).length;
          const totalColl=slots.reduce((s,sl)=>{
            const p=payments[`${dep.id}_${sl.month}`];
            if(!p)return s;
            // A period settled by adding to the deposit (compounding) is JUST AS
            // SETTLED as one paid in cash — it must count as collected here too,
            // or it wrongly keeps showing as "pending" even after being handled.
            return s+(p.amountPaid||0)+(p.addedAmount||0);
          },0);
          const pendingSlots=slots.filter(sl=>{const pp=payments[`${dep.id}_${sl.month}`];return !(pp?.status==='Paid'||pp?.addedToDeposit);});
          const periodInt=calcPeriodInt(dep); // current month's rate — only for the "PER PERIOD" summary tile, not per-period math below
          const t=parseInt(dep.interestTenure)||1;
          const tenureLabel=t===1?'Monthly':t===3?'Quarterly':t===6?'Half-Yearly':t===12?'Yearly':`Every ${t}mo`;
          // Same clear format as Borrowers: Total Due − Collected = Remaining
          // BUG FIX: this used to be nonFutureSlots.length × periodInt — a plain count
          // times the CURRENT month's rate, applied to every past month alike. After a
          // mid-year top-up, that overstated every month before the addition (e.g. 9
          // months × the new higher rate, when only the months after the top-up should
          // use it). Now sums each month's own correct, date-aware amount instead.
          const nonFutureSlots=slots.filter(sl=>!sl.isFuture);
          const totalInterestDue=nonFutureSlots.reduce((s,sl)=>s+calcPeriodInt(dep,sl.month),0);
          const remainingInterestToPay=Math.max(0,totalInterestDue-totalColl);

          return(
            <Card key={dep.id} style={{padding:0,overflow:'visible'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',cursor:'pointer',borderRadius:14}} onClick={()=>setSelected(isOpen?null:dep.id)}>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  {dep.photo
                    ?<img src={dep.photo} alt="" style={{width:44,height:44,borderRadius:'50%',objectFit:'cover',flexShrink:0}}/>
                    :<div style={{width:44,height:44,borderRadius:'50%',background:'rgba(88,86,214,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#5856d6',flexShrink:0}}>{dep.name?.[0]?.toUpperCase()}</div>}
                  <div>
                    <div style={{fontWeight:700,fontSize:15,marginBottom:2}}><span style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',marginRight:8}}>#{depIdx+1}</span>{dep.name}</div>
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>
                      Deposit from {dep.startDate||'—'} · {formatCurrency(dep.depositAmount)} · {dep.interestRate}%/mo · {tenureLabel} · {dep.compounding?'Compound':'Simple'}
                    </div>
                    <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:3}}>
                      Interest — Total Due: <strong style={{color:'var(--text-primary)'}}>₹{totalInterestDue.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                      {' − '}Collected: <strong style={{color:'#34c759'}}>₹{totalColl.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                      {' = '}Remaining to Pay: <strong style={{color:remainingInterestToPay>0?'#ff3b30':'#34c759'}}>₹{remainingInterestToPay.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                    </div>
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
                  {/* Axis (⋮) button — the ONLY way to accept a payment or undo one. The
                      monthly cards below are now a pure read-only status view; nothing there
                      is clickable, so nothing gets triggered by accidentally tapping a card. */}
                  {slots.length>0&&(
                    <button title="Accept Payment / Undo" onClick={e=>{
                      e.stopPropagation();
                      const targetSlot=pendingSlots.length>0?pendingSlots[pendingSlots.length-1]:slots[slots.length-1];
                      openPay(dep,targetSlot);
                      loadAxisLedger(dep);
                    }}
                      style={{width:30,height:30,flexShrink:0,borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#3c3c43'}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
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
                        // BUG FIX: every card in this row was showing the SAME figure — periodInt,
                        // computed once for the whole depositor using the CURRENT month's principal
                        // — instead of each card computing its own month's amount. So April, May,
                        // June all wrongly showed July's post-addition rate. Each card now works out
                        // what was actually due for ITS OWN month.
                        const slotInt=calcPeriodInt(dep,slot.month);
                        const isPaid=p?.status==='Paid';
                        const isPartial=p?.status==='Partial';
                        const isAdded=p?.addedToDeposit;
                        const isCur=slot.month===curMo;
                        const isFut=slot.isFuture;
                        const dOD=isFut?0:getDaysOverdue(slot.dueDate);
                        // Click a card to pay through it — same calendar-picker logic as inside
                        // the Accept Payment popup, just started from here: clicking, say, August
                        // opens the popup already scoped to settle everything from the earliest
                        // pending month cumulatively up through August, and this card turns blue
                        // to show it's the one selected. Only pending/overdue/partial cards are
                        // clickable — a fully Paid or fully-compounded month has nothing to do.
                        const isClickable=!isFut&&!isPaid&&!isAdded;
                        const isPayTarget=modal&&modal.depositor?.id===dep.id&&(payThroughMonth?payThroughMonth===slot.month:modal.slot?.month===slot.month);
                        const bg=isPayTarget?'rgba(0,122,255,0.14)':isPaid?'rgba(52,199,89,0.08)':isPartial?'rgba(255,149,0,0.08)':isAdded?'rgba(88,86,214,0.08)':isFut?'rgba(0,0,0,0.02)':isCur?'rgba(0,122,255,0.08)':dOD>2?'rgba(255,59,48,0.06)':'rgba(0,0,0,0.02)';
                        const border=isPayTarget?'2px solid #007aff':isPaid?'1.5px solid rgba(52,199,89,0.3)':isPartial?'1.5px solid rgba(255,149,0,0.3)':isAdded?'1.5px solid rgba(88,86,214,0.3)':isFut?'1px dashed rgba(0,0,0,0.12)':isCur?'2px solid rgba(0,122,255,0.4)':dOD>2?'1.5px solid rgba(255,59,48,0.25)':'1px solid rgba(0,0,0,0.08)';
                        const col=isPayTarget?'#007aff':isPaid?'#34c759':isPartial?'#ff9500':isAdded?'#5856d6':isFut?'var(--text-secondary)':isCur?'#007aff':dOD>2?'#ff3b30':'var(--text-primary)';
                        return(
                          <div key={slot.month} onClick={isClickable?()=>{openPay(dep,slot,slot.month);loadAxisLedger(dep);}:undefined}
                            style={{padding:'10px 11px',borderRadius:10,border,background:bg,position:'relative',opacity:isFut?0.7:1,cursor:isClickable?'pointer':'default',transition:'box-shadow 0.15s'}}
                            onMouseEnter={isClickable?e=>{e.currentTarget.style.boxShadow='0 0 0 2px rgba(0,122,255,0.25)';}:undefined}
                            onMouseLeave={isClickable?e=>{e.currentTarget.style.boxShadow='none';}:undefined}>
                            {isPayTarget&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'#007aff',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>📅 PAYING TO</div>}
                            {!isPayTarget&&isCur&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'#007aff',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>CURRENT</div>}
                            {!isPayTarget&&isFut&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.3)',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>UPCOMING</div>}
                            <div style={{fontSize:11,fontWeight:700,color:col,marginBottom:2}}>{slot.label}</div>
                            {/* BUG FIX: a period settled with a cash+compound split was showing only
                                the cash SLICE here (e.g. ₹618) instead of the full amount actually
                                settled for that month (e.g. ₹1,500 = ₹618 cash + ₹882 compounded) —
                                looked like the month was barely paid when it was fully covered. */}
                            <div style={{fontSize:13,fontWeight:800,color:col}}>{(isPaid||isPartial)?formatCurrency((p.amountPaid||0)+(p.addedAmount||0)):isAdded?'+ Principal':formatCurrency(Math.round(slotInt))}</div>
                            {isPaid&&<div style={{fontSize:9.5,color:'#34c759',marginTop:2}}>✓ paid</div>}
                            {isPartial&&<div style={{fontSize:9.5,color:'#ff9500',marginTop:2}}>{formatCurrency(Math.max(0,(p.amountDue||0)-(p.amountPaid||0)-(p.addedAmount||0)))} remaining</div>}
                            {isFut&&!isPaid&&<div style={{fontSize:9.5,color:'var(--text-secondary)',marginTop:2}}>advance allowed</div>}
                            {!isFut&&!isPaid&&!isPartial&&dOD>2&&!isAdded&&<div style={{fontSize:9.5,color:'#ff3b30',fontWeight:600,marginTop:2}}>{dOD}d late</div>}
                            {p?.remarks&&<div style={{fontSize:9,color:'var(--text-tertiary)',marginTop:3,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={p.remarks}>📝 {p.remarks}</div>}
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

      {/* Add Extra Amount modal */}
      <Modal open={!!addModal} onClose={()=>setAddModal(null)} title={`Add Amount — ${addModal?.name}`} width={460}
        footer={addModal&&(
          <Button full onClick={saveAddAmount} disabled={addSaving}>{addSaving?'Saving…':'✓ Add to Deposit'}</Button>
        )}>
        {addModal&&(
          <div>
            <div style={{padding:'12px 14px',background:'rgba(88,86,214,0.06)',borderRadius:10,marginBottom:16,fontSize:13}}>
              Current deposit: <strong>{formatCurrency(addModal.depositAmount||0)}</strong>
              {af.amount&&parseFloat(af.amount)>0&&(<> → New total: <strong style={{color:'#5856d6'}}>{formatCurrency((addModal.depositAmount||0)+parseFloat(af.amount))}</strong></>)}
            </div>
            <FormField label="Extra Amount (₹)">
              <Input type="number" value={af.amount} onChange={e=>setAf(f=>({...f,amount:e.target.value}))} placeholder="e.g. 50000" autoFocus/>
            </FormField>
            <FormField label="Date">
              <Input type="date" value={af.date} onChange={e=>setAf(f=>({...f,date:e.target.value}))}/>
            </FormField>
            <FormField label="Remarks (optional)">
              <Input value={af.remarks} onChange={e=>setAf(f=>({...f,remarks:e.target.value}))} placeholder="Reason for the additional deposit…"/>
            </FormField>
          </div>
        )}
      </Modal>

      {/* Settlement Modal */}
      <Modal open={!!modal} onClose={()=>{setModal(null);setBulkPendingDep(null);setPayThroughMonth(null);setAxisLedger([]);}} title={`Accept Payment — ${modal?.depositor?.name}`} width={500}
        footer={modal&&(
          <div style={{display:'flex',gap:10,width:'100%'}}>
            <Button onClick={()=>savePay(true)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':bulkPendingDep?(()=>{
              const scoped=activeBulkPeriods(bulkPendingDep,payThroughMonth);
              let budget=(parseFloat(pf.cashAmount)||0)+(parseFloat(pf.compoundAmount)||0),covered=0;
              for(const p of scoped){if(budget>=p.amount){budget-=p.amount;covered++;}else break;}
              const throughLabel=scoped[scoped.length-1]?.label||'';
              return covered===scoped.length?`✓ Settle All ${scoped.length} Periods (through ${throughLabel})`:`✓ Settle ${covered} of ${scoped.length} Periods (through ${throughLabel})`;
            })():'✓ Settle'}</Button>
            {!bulkPendingDep&&<Button variant="danger" onClick={()=>savePay(false)} disabled={saving}>Mark Unpaid</Button>}
          </div>
        )}>
        {modal&&(()=>{
          const{depositor,slot}=modal;
          const interest=calcPeriodInt(depositor,slot.month); // BUG FIX: was missing the month, silently using the page's globally-selected month
          // BUG FIX: every display below (the "Interest Due" tile, the cash+deposit
          // mismatch message, the "fill full amount" shortcuts) was always comparing
          // against THIS ONE slot's interest, even when several periods were pending
          // and being settled together — so the popup would say things like "more
          // than the interest due (₹1,575)" while the person had correctly typed the
          // COMBINED total for 3 periods. Use the real total that's actually due here.
          const scopedBulk=bulkPendingDep?activeBulkPeriods(bulkPendingDep,payThroughMonth):null;
          const effectiveDue=scopedBulk?scopedBulk.reduce((s,p)=>s+p.amount,0):interest;
          const daysOD=getDaysOverdue(slot.dueDate);
          const fineAmt=parseFloat(pf.fine)||0;
          const existingKey=`${depositor.id}_${slot.month}`;
          const existingPay=payments[existingKey];
          const payStatus=existingPay?.status; // 'Paid' | undefined (pending)
          return(
            <>
              {/* Status shown first — before anything else */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'10px 14px',borderRadius:10,background:payStatus==='Paid'?'rgba(52,199,89,0.08)':'rgba(255,149,0,0.08)',border:`1px solid ${payStatus==='Paid'?'rgba(52,199,89,0.25)':'rgba(255,149,0,0.25)'}`}}>
                <span style={{fontSize:16}}>{payStatus==='Paid'?'✅':'⏳'}</span>
                <span style={{fontSize:14,fontWeight:800,color:payStatus==='Paid'?'#1a7a34':'#b45309'}}>{payStatus==='Paid'?'Paid':'Pending'}</span>
                <span style={{fontSize:12,color:'var(--text-secondary)',marginLeft:'auto'}}>{slot.label}</span>
              </div>
              {bulkPendingDep && (
                <div style={{marginBottom:14,padding:'12px 14px',borderRadius:12,background:'rgba(255,149,0,0.06)',border:'1px solid rgba(255,149,0,0.25)'}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:'#b45309',marginBottom:4}}>⚠ {bulkPendingDep.length} periods pending, {bulkPendingDep[0].label} – {bulkPendingDep[bulkPendingDep.length-1].label}</div>
                  <div style={{fontSize:11.5,color:'var(--text-secondary)',marginBottom:8}}>Click a month below to pay through it — settles the cumulative total from {bulkPendingDep[0].label} up to the month you pick (the picked month shows in blue), leaving anything after it pending.</div>
                  {/* Calendar-style month picker — clicking a chip sets the "pay through"
                      month. Every month up to and including the picked one is included
                      (light blue = included, solid blue = the picked month itself);
                      anything after it is dimmed to show it stays untouched this time. */}
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {bulkPendingDep.map(p=>{
                      const isThrough=p.month===payThroughMonth;
                      const isIncluded=payThroughMonth?p.month<=payThroughMonth:true;
                      return(
                        <button key={p.month} type="button" onClick={()=>{
                          setPayThroughMonth(p.month);
                          const newScoped=activeBulkPeriods(bulkPendingDep,p.month);
                          const newTotal=newScoped.reduce((s,x)=>s+x.amount,0);
                          setPf(pf=>({...pf,cashAmount:String(newTotal),compoundAmount:'0'}));
                        }}
                          style={{padding:'5px 11px',borderRadius:99,cursor:'pointer',fontSize:11.5,fontWeight:700,
                            background:isThrough?'#007aff':isIncluded?'rgba(0,122,255,0.1)':'#fff',
                            border:isThrough?'1.5px solid #007aff':isIncluded?'1px solid rgba(0,122,255,0.3)':'1px solid rgba(0,0,0,0.12)',
                            color:isThrough?'#fff':isIncluded?'#007aff':'var(--text-tertiary)',
                            opacity:isIncluded?1:0.55}}>
                          {isThrough?'📅 ':''}{new Date(p.month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}: {formatCurrency(p.amount)}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{fontSize:12.5,marginTop:8,color:'var(--text-secondary)'}}>
                    Paying through <strong style={{color:'#007aff'}}>{(scopedBulk[scopedBulk.length-1]||bulkPendingDep[bulkPendingDep.length-1]).label}</strong> — combined total: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(effectiveDue)}</strong> — settled oldest month first, each at its own correct amount; any leftover after whole months become a Partial on the next one.
                    {payThroughMonth!==bulkPendingDep[bulkPendingDep.length-1].month&&<> {bulkPendingDep.length-scopedBulk.length} period{bulkPendingDep.length-scopedBulk.length!==1?'s':''} after this stay pending.</>}
                  </div>
                </div>
              )}
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
                {[{l:'Principal',v:formatCurrency(depositor.depositAmount),c:'var(--text-primary)'},{l:bulkPendingDep?'Total Pending Interest':'Interest Due',v:formatCurrency(Math.round(effectiveDue)),c:'#5856d6'},{l:'Rate',v:`${depositor.interestRate}%/mo`,c:'#ff9500'}].map((s,i)=>(
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

              {/* Split settlement — cash in hand vs added to deposit (compound), any ratio */}
              {(() => {
                const cashV=parseFloat(pf.cashAmount)||0, compV=parseFloat(pf.compoundAmount)||0;
                const splitTotal=cashV+compV;
                const mismatch=Math.round(splitTotal)!==Math.round(effectiveDue);
                return (
                <div style={{background:'rgba(88,86,214,0.05)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10}}>Split how the {bulkPendingDep?'total pending interest is':'interest is'} handled — cash in hand vs added back to the deposit{depositor.compounding?' (compound)':''}. Whole periods are settled oldest first: cash covers as many full months as it can, then the deposit portion continues from there — any leftover becomes a Partial on the next month.</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:mismatch?8:0}}>
                    <div>
                      <label style={{fontSize:11.5,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>💵 Cash in Hand (₹)</label>
                      {/* Independent field — typing here no longer force-fills the other field with
                          "the remainder". Enter exactly what was actually handed over; whatever's
                          left unaddressed simply stays pending (shown as Partial), never auto-corrected. */}
                      <input type="number" value={pf.cashAmount} onChange={e=>{
                        const v=e.target.value;
                        setPf(p=>({...p,cashAmount:v}));
                      }}
                        style={{width:'100%',boxSizing:'border-box',height:38,padding:'0 12px',borderRadius:9,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11.5,fontWeight:700,color:'#5856d6',display:'block',marginBottom:5}}>🏦 Add to Deposit (₹)</label>
                      <input type="number" value={pf.compoundAmount} onChange={e=>{
                        const v=e.target.value;
                        setPf(p=>({...p,compoundAmount:v}));
                      }}
                        style={{width:'100%',boxSizing:'border-box',height:38,padding:'0 12px',borderRadius:9,border:'1.5px solid rgba(88,86,214,0.3)',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:mismatch?8:0}}>
                    <button type="button" onClick={()=>setPf(p=>({...p,cashAmount:String(Math.round(effectiveDue)),compoundAmount:'0'}))}
                      style={{fontSize:10.5,fontWeight:600,color:'var(--text-secondary)',background:'rgba(0,0,0,0.04)',border:'1px solid rgba(0,0,0,0.08)',borderRadius:7,padding:'4px 9px',cursor:'pointer'}}>Fill full amount as cash</button>
                    <button type="button" onClick={()=>setPf(p=>({...p,cashAmount:'0',compoundAmount:String(Math.round(effectiveDue))}))}
                      style={{fontSize:10.5,fontWeight:600,color:'#5856d6',background:'rgba(88,86,214,0.06)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:7,padding:'4px 9px',cursor:'pointer'}}>Fill full amount as deposit</button>
                  </div>
                  {mismatch && (
                    <div style={{fontSize:11.5,color:splitTotal<Math.round(effectiveDue)?'#b45309':'#1a7a34'}}>
                      {splitTotal<Math.round(effectiveDue)
                        ?<>⚠ ₹{(Math.round(effectiveDue)-splitTotal).toLocaleString('en-IN')} of the {bulkPendingDep?'total pending interest':"this period's interest"} will stay pending — recorded as Partial. That's fine if this is intentional.</>
                        :<>ℹ Cash + Deposit ({formatCurrency(splitTotal)}) is more than the interest due ({formatCurrency(Math.round(effectiveDue))}) — the extra will be recorded as-is (e.g. topping up with own cash).</>
                      }
                    </div>
                  )}
                  {compV>0 && (
                    <div style={{marginTop:8,fontSize:12,color:'#5856d6',background:'rgba(88,86,214,0.08)',borderRadius:8,padding:'8px 10px'}}>
                      New deposit principal: {formatCurrency((depositor.depositAmount||0)+compV)}
                    </div>
                  )}
                </div>
                );
              })()}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Date</label>
                  <input type="date" value={pf.date} onChange={e=>setPf(p=>({...p,date:e.target.value}))}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
                </div>
                <div>
                  <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Mode (for cash portion)</label>
                  <select value={pf.mode} onChange={e=>setPf(p=>({...p,mode:e.target.value}))}
                    style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none',appearance:'none',cursor:'pointer'}}>
                    <option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option>
                  </select>
                </div>
              </div>
              {pf.collectFine&&fineAmt>0&&(
                <div style={{padding:'8px 12px',background:'rgba(52,199,89,0.06)',borderRadius:8,fontSize:13,color:'#1a7a34',marginBottom:12}}>
                  Cash payout: {formatCurrency(parseFloat(pf.cashAmount)||0)} + Fine {formatCurrency(fineAmt)} = <strong>{formatCurrency((parseFloat(pf.cashAmount)||0)+fineAmt)}</strong>
                </div>
              )}
              <div>
                <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Remarks</label>
                <input value={pf.remarks} onChange={e=>setPf(p=>({...p,remarks:e.target.value}))}
                  style={{width:'100%',height:38,padding:'0 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:14,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none'}}/>
              </div>

              {/* Scroll down from Accept Payment to find this depositor's settlement ledger
                  entries, each with its own separate Undo — reverses that one entry's payment
                  everywhere (deposit principal, payment record, ledger) without touching the
                  monthly cards at all. */}
              <div style={{marginTop:22,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.08)'}}>
                <div style={{fontSize:12.5,fontWeight:700,color:'var(--text-secondary)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.02em'}}>Ledger Entries — Undo</div>
                {axisLedgerLoading&&<div style={{fontSize:12.5,color:'var(--text-secondary)',padding:'8px 0'}}>Loading…</div>}
                {!axisLedgerLoading&&axisLedger.length===0&&<div style={{fontSize:12.5,color:'var(--text-secondary)',padding:'8px 0'}}>No settlement entries yet for this depositor.</div>}
                {!axisLedgerLoading&&axisLedger.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:220,overflowY:'auto'}}>
                    {axisLedger.map(entry=>(
                      <div key={entry.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:9,background:'rgba(0,0,0,0.03)',border:'1px solid rgba(0,0,0,0.06)'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={entry.description}>{entry.description}</div>
                          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:1}}>{entry.category} · {formatCurrency(entry.amount)} · {entry.date}</div>
                        </div>
                        <button onClick={async()=>{await undoBatch(depositor,entry.settlementBatchId,entry.description);loadAxisLedger(depositor);}} disabled={!!undoingKey}
                          style={{flexShrink:0,fontSize:11,fontWeight:700,color:'#ff3b30',background:'#fff',border:'1px solid rgba(255,59,48,0.3)',borderRadius:7,padding:'5px 10px',cursor:undoingKey?'wait':'pointer'}}>
                          {undoingKey===entry.settlementBatchId?'…':'↺ Undo'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
