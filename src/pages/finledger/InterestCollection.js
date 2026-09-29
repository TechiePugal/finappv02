import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,serverTimestamp,doc,updateDoc,deleteDoc,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {scopeToUser} from '../../utils/scopeHelper';
import {printCollectInterestSummary} from '../../utils/pdfReport';
import {PageHeader,Badge,Button,Card,StatCard,Modal,formatCurrency,SectionHeader,Divider} from '../../components/finledger/UI';
import {useAuth} from '../../contexts/AuthContext';
import {PageLoader} from '../../components/Skeleton';

// All months from startDate to now
function getMonths(startDate,aheadCount=4){
  if(!startDate)return[];
  const slots=[];let cur=new Date(startDate);const now=new Date();
  // Include a few months AHEAD of today too — shown in the same grid as past
  // months, clickable to pay in advance, matching how Settle Interest already
  // shows upcoming periods inline instead of behind a separate toggle.
  const end=new Date(now);end.setMonth(end.getMonth()+aheadCount);
  while(cur<=end){
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
  const {user}=useAuth();
  const [windowStarts,setWindowStarts]=useState({}); // per-borrower sliding-window offset for the month cards
  const[borrowers,setBorrowers]=useState([]);
  const[payments,setPayments]=useState({});
  const[repayments,setRepayments]=useState({});
  const[additions,setAdditions]=useState({}); // extra amounts added, per borrower — used to keep the CURRENT month's interest from jumping early
  const[bulkPending,setBulkPending]=useState(null); // when >1 period is pending, holds each period's own fixed amount for one-shot settlement
  const[payThroughMonth,setPayThroughMonth]=useState(null); // "pay through" month picked from the pending range — same calendar-picker logic as Depositor Settlement: settlement only covers earliest-pending..this month (cumulative), shown in blue
  const[loading,setLoading]=useState(true);
  const[modal,setModal]=useState(null); // borrower
  // cashAmount / addAmount — independent split, exactly like Depositor Settlement's
  // Cash in Hand / Add to Deposit: cash paid out vs interest added back into the
  // loan principal (compound), any ratio, not an all-or-nothing checkbox anymore.
  const[pf,setPf]=useState({date:'',mode:'Cash',cashAmount:'',addAmount:'',fine:'0',collectFine:false,remarks:''});
  const[saving,setSaving]=useState(false);
  const[axisLedger,setAxisLedger]=useState([]); // this borrower's settlement ledger entries, shown inside the Collect Interest popup for one-click Undo
  const[axisLedgerLoading,setAxisLedgerLoading]=useState(false);
  const[undoingKey,setUndoingKey]=useState(null);
  const _flt=(()=>{try{return JSON.parse(localStorage.getItem('fl_ic_filters'))||{}}catch(e){return{}}})();
  const[viewMode]=useState('history'); // "This Month" view removed — always shows full history now
  const[search,setSearch]=useState('');
  const[statusFilter,setStatusFilter]=useState(_flt.statusFilter||'all');
  const[amtRange,setAmtRange]=useState(_flt.amtRange||'all');
  const[monthsFilter,setMonthsFilter]=useState(_flt.monthsFilter||'all');
  const[sortBy,setSortBy]=useState(_flt.sortBy||'name'); // intFilterAdded
  useEffect(()=>{try{localStorage.setItem('fl_ic_filters',JSON.stringify({viewMode,statusFilter,amtRange,monthsFilter,sortBy}))}catch(e){}},[viewMode,statusFilter,amtRange,monthsFilter,sortBy]);
  const[month,setMonth]=useState(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;});
  const[selected,setSelected]=useState(null);
  const[scope,setScope]=useState('month'); // 'month' = selected month only, 'overall' = full history up to date — toggle for the header stat tiles + Export PDF
  const DAILY_FINE=50;

  useEffect(()=>{
    const b=onSnapshot(collection(db,'borrower_master'),snap=>{
      setBorrowers(scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).filter(b=>b.status!=='Closed'));
      setLoading(false);
    },()=>{toast.error('Failed');setLoading(false);});
    const p=onSnapshot(collection(db,'borrower_interest_payments'),snap=>{
      const pm={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(r=>{if(!pm[r.borrowerId])pm[r.borrowerId]={};pm[r.borrowerId][r.month]=r;});
      setPayments(pm);
    });
    const r=onSnapshot(collection(db,'loan_repayments'),snap=>{
      const rm={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(r=>{if(!r.deleted){if(!rm[r.borrowerId])rm[r.borrowerId]=[];rm[r.borrowerId].push(r);}});
      setRepayments(rm);
    });
    const a=onSnapshot(collection(db,'loan_additions'),snap=>{
      const am={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(x=>{if(!am[x.borrowerId])am[x.borrowerId]=[];am[x.borrowerId].push(x);});
      setAdditions(am);
    });
    return()=>{b();p();r();a();};
  },[]);

  // The plain, right-now balance — NO date lag. b.loanAmount already includes
  // every addition made to date (compounding updates it immediately via
  // savePay), so "current outstanding" is simply that minus whatever's been
  // repaid. This is what the card headers show — never a lagged "preview" of
  // what a future month's own interest calculation will use.
  function getCurrentOutstanding(b){
    const reps=repayments[b.id]||[];
    const repaid=reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
    return Math.max(0,(b.loanAmount||0)-repaid);
  }
  function getOutstanding(b,forMonth){
    // An addition made THIS month (or later) should only start counting toward
    // interest from NEXT month onward — the period already in progress when the
    // extra amount was added keeps using the old, smaller principal. This is
    // ONLY for INTEREST math (calcInterest below) — never for a plain balance
    // display, which should show the true current amount (getCurrentOutstanding).
    const targetMonth = forMonth || month;
    const reps=repayments[b.id]||[];
    const repaid=reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
    let outstanding = Math.max(0,(b.loanAmount||0)-repaid);
    const adds = additions[b.id]||[];
    // BUG FIX: the comment above always said "next month onward" but this line used
    // `>` instead of `>=`, so an addition was actually taking effect the SAME month
    // it was made. An addition made DURING a month hasn't been held all month, so
    // it only starts counting from the FOLLOWING month.
    const notYetEffective = adds.filter(a=>a.date && a.date.slice(0,7)>=targetMonth).reduce((s,a)=>s+(a.amount||0),0);
    return Math.max(0, outstanding-notYetEffective);
  }

  function calcInterest(b,overrideOutstanding){
    const outstanding=overrideOutstanding!==undefined?overrideOutstanding:getOutstanding(b);
    return outstanding*(b.interestRate||0)/100;
  }

  // `throughMonth` mirrors Depositor Settlement's openPay(): omitted, the bulk
  // default is unchanged — the full pending range (the ⋮ axis button never
  // passes one). Passed explicitly (as the calendar cards below now do, with the
  // clicked card's own month), it scopes settlement to the cumulative range up
  // to that month only. Same engine either way — nothing about the underlying
  // settlement math changes based on how it was opened.
  function activeBulkPeriods(list,through){
    if(!list)return null;
    if(!through)return list;
    return list.filter(p=>p.month<=through);
  }

  function openModal(b,forMonth,throughMonth){
    const m=forMonth||month;
    if(forMonth&&forMonth!==month) setMonth(forMonth); // keep 'month' state in sync for the view, but don't rely on it below — state updates are async
    const outstanding=getOutstanding(b,m); // BUG FIX: was getOutstanding(b) with no month, which silently used the OLD selected month (a stale closure) instead of the month actually being opened
    const interest=calcInterest(b,outstanding);
    const daysOverdue=getDaysOverdue(m);
    const fine=daysOverdue>2?(daysOverdue-2)*DAILY_FINE:0;

    // If several earlier periods are ALSO still pending, offer to settle them
    // all together in one action instead of one at a time — each period still
    // gets its own correct fixed interest amount recorded, just entered as a
    // single combined total for convenience.
    const allMonths=getMonths(b.loanStartDate).filter(mo=>mo<=m);
    const pendingMonths=allMonths.filter(mo=>{
      const pp=payments[b.id]?.[mo];
      return !(pp?.status==='Paid');
    });
    const pendingBreakdown=pendingMonths.map(mo=>({
      month:mo,
      amount:Math.round(calcInterest(b,getOutstanding(b,mo))),
    }));

    setModal(b);
    const isBulk=pendingBreakdown.length>1;
    setBulkPending(isBulk?pendingBreakdown:null);
    // Default "pay through" = the full pending range (last pending month) unless a
    // specific target was passed in — nothing changes for the ⋮ button, which
    // never passes one.
    const resolvedThrough=isBulk?(throughMonth&&pendingBreakdown.some(p=>p.month===throughMonth)?throughMonth:pendingBreakdown[pendingBreakdown.length-1].month):null;
    setPayThroughMonth(resolvedThrough);
    const combinedTotal=isBulk?pendingBreakdown.filter(p=>p.month<=resolvedThrough).reduce((s,p)=>s+p.amount,0):pendingBreakdown.reduce((s,p)=>s+p.amount,0);
    const existing=payments[b.id]?.[m];
    setPf({
      date:new Date().toISOString().split('T')[0],
      mode:existing?.paymentMode||'Cash',
      cashAmount:String(isBulk?combinedTotal:(existing?(existing.amountPaid||0):Math.round(interest))),
      addAmount:String(isBulk?0:(existing?.addedAmount||0)),
      fine:'',  // empty — user enters manually
      collectFine:false, // OFF by default
      remarks:existing?.remarks||''
    });
  }

  async function savePay(paid){
    if(!modal)return;
    setSaving(true);
    try{
      // Bulk settle — several periods were pending, closed out in one action.
      // Exactly the Depositor Settlement engine: cash covers as many WHOLE
      // periods as it reaches, oldest first; once cash runs out, the "add to
      // loan" portion continues covering whole periods the same way; whatever's
      // left over becomes ONE Partial on the next period. Only periods up to the
      // picked "pay through" month are touched — anything after stays pending.
      if(bulkPending && paid===true){
        const batchId=`${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        const fine=pf.collectFine?parseFloat(pf.fine)||0:0;
        const totalCash=parseFloat(pf.cashAmount)||0;
        const totalAdd=parseFloat(pf.addAmount)||0;
        const periodsInScope=activeBulkPeriods(bulkPending,payThroughMonth);
        const periodsBeyond=bulkPending.filter(p=>!periodsInScope.includes(p));
        let cashBudget=totalCash, addBudget=totalAdd;
        const settledPeriods=[];
        const stillPendingPeriods=[];
        let partialPeriod=null, partialCash=0, partialAdd=0;
        let exhausted=false;
        for(const period of periodsInScope){
          if(exhausted){ stillPendingPeriods.push(period); continue; }
          const fromCash=Math.min(cashBudget,period.amount); cashBudget-=fromCash;
          let remaining=period.amount-fromCash;
          const fromAdd=Math.min(addBudget,remaining); addBudget-=fromAdd;
          remaining-=fromAdd;
          if(remaining<=0){
            settledPeriods.push({...period,cash:fromCash,add:fromAdd});
          } else if(fromCash>0||fromAdd>0){
            partialPeriod=period; partialCash=fromCash; partialAdd=fromAdd;
            exhausted=true;
          } else {
            stillPendingPeriods.push(period);
            exhausted=true;
          }
        }
        const partialAmount=partialCash+partialAdd;
        let totalAddDelta=0,totalCashSettled=0,totalAddSettled=0;
        for(const period of settledPeriods){
          const bPays=payments[modal.id]||{};
          const existing=bPays[period.month];
          totalAddDelta += period.add - (existing?.addedAmount||0);
          totalCashSettled += period.cash; totalAddSettled += period.add;
          const data={
            borrowerId:modal.id,borrowerName:modal.borrowerName,
            loanAmount:modal.loanAmount,
            interestRate:modal.interestRate,amountDue:period.amount,
            amountPaid:period.cash,
            fine:0,totalCollected:period.cash, // fine (if any) recorded once, separately, below — not per period
            status:'Paid',addedToLoan:period.add>0,addedAmount:period.add,
            paymentDate:pf.date,paymentMode:pf.mode,settlementBatchId:batchId,
            remarks:pf.remarks,month:period.month,
            wasUndone:false, // fresh Settle clears any earlier Undo marker
            updatedAt:serverTimestamp()
          };
          let payId=existing?.id;
          if(existing){await updateDoc(doc(db,'borrower_interest_payments',existing.id),data);}
          else{data.createdAt=serverTimestamp();data.createdBy=user?.uid||null;const r=await addDoc(collection(db,'borrower_interest_payments'),data);payId=r.id;}
        }
        if(partialPeriod){
          const bPays=payments[modal.id]||{};
          const existingPartial=bPays[partialPeriod.month];
          totalAddDelta += partialAdd - (existingPartial?.addedAmount||0);
          totalCashSettled += partialCash; totalAddSettled += partialAdd;
          const partialData={
            borrowerId:modal.id,borrowerName:modal.borrowerName,
            loanAmount:modal.loanAmount,
            interestRate:modal.interestRate,amountDue:partialPeriod.amount,
            amountPaid:partialCash,
            fine:0,totalCollected:partialCash,
            status:'Partial',addedToLoan:partialAdd>0,addedAmount:partialAdd,
            paymentDate:pf.date,paymentMode:pf.mode,settlementBatchId:batchId,
            remarks:pf.remarks?`${pf.remarks} (partial from bulk settlement)`:'Partial from bulk settlement',
            month:partialPeriod.month,
            wasUndone:false, // fresh Settle clears any earlier Undo marker
            updatedAt:serverTimestamp()
          };
          let partialPayId=existingPartial?.id;
          if(existingPartial){await updateDoc(doc(db,'borrower_interest_payments',existingPartial.id),partialData);}
          else{partialData.createdAt=serverTimestamp();partialData.createdBy=user?.uid||null;const r=await addDoc(collection(db,'borrower_interest_payments'),partialData);partialPayId=r.id;}
        }
        const periodCount=settledPeriods.length+(partialPeriod?1:0);
        const rangeLabel=periodCount>0?(periodCount===1?(settledPeriods[0]||partialPeriod).month:`${bulkPending[0].month} – ${(partialPeriod||settledPeriods[settledPeriods.length-1]).month}`):'';
        // ONE combined ledger row for the whole cash payout, whatever it covers —
        // matches Depositor Settlement's single-row-per-action ledger model.
        if(totalCashSettled>0){
          await addDoc(collection(db,'finance_ledger_entries'),{
            type:'Credit',category:'Loan Interest',
            description:`Interest collected from ${modal.borrowerName} — ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel}) settled today${totalAddSettled>0?` + ₹${totalAddSettled.toLocaleString('en-IN')} added to loan`:''}`,
            amount:totalCashSettled,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
            borrowerName:modal.borrowerName,borrowerId:modal.id,settlementBatchId:batchId,
            createdAt:serverTimestamp(),createdBy:user?.uid||null
          });
        }
        // Apply the actual principal change, AND record it as one dated addition
        // (like loan_additions elsewhere) so getOutstanding correctly excludes it
        // from THIS settlement month's own interest and only counts it starting
        // next month — same fix v152 gave the deposit side.
        if(totalAddDelta!==0){
          const newLoanAmt=Math.max(0,(modal.loanAmount||0)+totalAddDelta);
          await updateDoc(doc(db,'borrower_master',modal.id),{
            loanAmount:newLoanAmt,
            monthlyInterest:newLoanAmt*(modal.interestRate||0)/100,
            updatedAt:serverTimestamp()
          });
          if(totalAddDelta>0){
            await addDoc(collection(db,'loan_additions'),{
              borrowerId:modal.id,borrowerName:modal.borrowerName,loanId:modal.loanId||modal.id,
              amount:totalAddDelta,previousAmount:modal.loanAmount||0,newAmount:newLoanAmt,
              date:pf.date,remarks:`Interest added to loan from settling ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel})`,
              settlementBatchId:batchId,createdAt:serverTimestamp(),createdBy:user?.uid||null
            });
          }
          if(totalAddSettled>0){
            await addDoc(collection(db,'finance_ledger_entries'),{
              type:'Credit',category:'Interest Added to Loan',
              description:`Interest added to ${modal.borrowerName}'s loan principal — ${periodCount} period${periodCount!==1?'s':''} (${rangeLabel}), not collected in cash`,
              amount:totalAddSettled,paymentMode:'Compound',date:pf.date,remarks:pf.remarks||'',
              borrowerName:modal.borrowerName,borrowerId:modal.id,settlementBatchId:batchId,
              createdAt:serverTimestamp(),createdBy:user?.uid||null
            });
          }
        }
        if(fine>0){
          await addDoc(collection(db,'finance_ledger_entries'),{
            type:'Credit',category:'Fine Income',
            description:`Late-payment fine from ${modal.borrowerName} — bulk settlement of ${settledPeriods.length} periods`,
            amount:fine,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
            borrowerName:modal.borrowerName,borrowerId:modal.id,settlementBatchId:batchId,
            createdAt:serverTimestamp(),createdBy:user?.uid||null
          });
        }
        const stillPendingTotal=stillPendingPeriods.reduce((s,p)=>s+p.amount,0)+periodsBeyond.reduce((s,p)=>s+p.amount,0);
        const stillPendingCount=stillPendingPeriods.length+periodsBeyond.length;
        const partialNote=partialPeriod?` (${formatCurrency(partialAmount)} applied as a partial payment for ${partialPeriod.month})`:'';
        const throughNote=periodsBeyond.length>0?` Settled through ${periodsInScope[periodsInScope.length-1].month} — ${periodsBeyond.length} period${periodsBeyond.length!==1?'s':''} from ${periodsBeyond[0].month} onward left pending as chosen.`:'';
        if(stillPendingCount>0 || partialPeriod){
          toast.success(`✓ ${settledPeriods.length} period${settledPeriods.length!==1?'s':''} fully settled${partialNote}. ${formatCurrency(stillPendingTotal)} still pending for ${stillPendingCount} period${stillPendingCount!==1?'s':''}.${throughNote}`);
        } else {
          toast.success(`✓ All ${settledPeriods.length} pending periods settled — ${formatCurrency(settledPeriods.reduce((s,p)=>s+p.amount,0)+fine)} total`);
        }
        setModal(null);setBulkPending(null);setPayThroughMonth(null);setSaving(false);
        return;
      }

      const isPartial=paid==='partial';const isPaid=paid===true;
      const bPays=payments[modal.id]||{};
      const existing=bPays[month];
      const outstanding=getOutstanding(modal);
      const interest=calcInterest(modal,outstanding);
      const fine=pf.collectFine?parseFloat(pf.fine)||0:0;

      // Independent split — cash collected vs interest added back to the loan
      // principal (compound), any ratio, exactly like Depositor Settlement's
      // Cash in Hand / Add to Deposit split (no longer an all-or-nothing toggle).
      const cashVal=(isPaid||isPartial)?(parseFloat(pf.cashAmount)||0):0;
      const addVal=(isPaid||isPartial)?(parseFloat(pf.addAmount)||0):0;
      const prevAdd=existing?.addedAmount||0;
      const principalDelta=addVal-prevAdd; // reverses cleanly if edited or unpaid

      const totalGiven=cashVal+addVal;
      const dueRounded=Math.round(interest);
      const newStatus=(!isPaid&&!isPartial)?'Unpaid':(totalGiven>=dueRounded?'Paid':(totalGiven>0?'Partial':'Unpaid'));
      const collected=newStatus==='Paid'||newStatus==='Partial';
      const batchId=collected?`${Date.now()}_${Math.random().toString(36).slice(2,8)}`:(existing?.settlementBatchId||null);
      const totalCollected=collected?cashVal+fine:0;

      const data={
        borrowerId:modal.id,borrowerName:modal.borrowerName,
        loanAmount:modal.loanAmount,outstandingBalance:outstanding,
        interestRate:modal.interestRate,amountDue:dueRounded,
        amountPaid:cashVal,
        fine:collected?fine:0,totalCollected,
        status:newStatus,addedToLoan:addVal>0,addedAmount:addVal,
        paymentDate:collected?pf.date:null,paymentMode:collected?pf.mode:null,
        settlementBatchId:batchId,
        remarks:pf.remarks,month,
        wasUndone:false, // any save here (Settle or manual Mark Unpaid) clears the Undo marker
        updatedAt:serverTimestamp()
      };

      let payId=existing?.id;
      if(existing){await updateDoc(doc(db,'borrower_interest_payments',existing.id),data);}
      else{data.createdAt=serverTimestamp();data.createdBy=user?.uid||null;const r=await addDoc(collection(db,'borrower_interest_payments'),data);payId=r.id;}

      if(collected&&cashVal>0){
        // Ledger entry for the cash interest itself — fine is recorded SEPARATELY
        // below, so it never gets mixed into loan/interest accounting.
        const lData={
          type:'Credit',category:'Loan Interest',
          description:`Interest${isPartial?' (partial)':''} from ${modal.borrowerName} — ${month}${addVal>0?` (₹${addVal} added to loan separately)`:''}`,
          amount:cashVal,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
          borrowerName:modal.borrowerName,borrowerId:modal.id,
          settlementBatchId:batchId,
          linkedPaymentId:payId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        };
        if(existing?.ledgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',existing.ledgerEntryId),{...lData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else await addDoc(collection(db,'finance_ledger_entries'),lData);
      }
      // Interest-added-to-loan ledger row — update in place on re-edit, remove if
      // the add amount is edited back down to zero. Same pattern as Depositor
      // Settlement's compoundLedgerEntryId.
      let addLedgerEntryId=existing?.addLedgerEntryId||null;
      if(collected&&addVal>0){
        const aData={
          type:'Credit',category:'Interest Added to Loan',
          description:`Interest added to ${modal.borrowerName}'s loan principal — ${month} (not collected in cash)`,
          amount:addVal,paymentMode:'Compound',date:pf.date,remarks:pf.remarks||'',
          borrowerName:modal.borrowerName,borrowerId:modal.id,
          settlementBatchId:batchId,
          linkedPaymentId:payId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        };
        if(addLedgerEntryId){await updateDoc(doc(db,'finance_ledger_entries',addLedgerEntryId),{...aData,createdAt:undefined,updatedAt:serverTimestamp()});}
        else{const r=await addDoc(collection(db,'finance_ledger_entries'),aData);addLedgerEntryId=r.id;}
      } else if(addLedgerEntryId){
        await updateDoc(doc(db,'finance_ledger_entries',addLedgerEntryId),{deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null});
        addLedgerEntryId=null;
      }
      await updateDoc(doc(db,'borrower_interest_payments',payId),{addLedgerEntryId});

      if(collected&&fine>0){
        await addDoc(collection(db,'finance_ledger_entries'),{
          type:'Credit',category:'Fine Income',
          description:`Late-payment fine from ${modal.borrowerName} — ${month}`,
          amount:fine,paymentMode:pf.mode,date:pf.date,remarks:pf.remarks||'',
          borrowerName:modal.borrowerName,borrowerId:modal.id,
          settlementBatchId:batchId,
          linkedPaymentId:payId,createdAt:serverTimestamp(),createdBy:user?.uid||null
        });
      }

      // Compound portion: apply the principal delta, cleanly reversible if
      // edited/unpaid. ALSO record it as a dated loan_additions entry so
      // getOutstanding correctly excludes it from THIS month's own interest and
      // only starts counting it from next month onward.
      let addAdditionId=existing?.addAdditionId||null;
      if(principalDelta!==0){
        const newAmt=Math.max(0,(modal.loanAmount||0)+principalDelta);
        await updateDoc(doc(db,'borrower_master',modal.id),{
          loanAmount:newAmt,
          monthlyInterest:newAmt*(modal.interestRate||0)/100,
          updatedAt:serverTimestamp()
        });
      }
      if(addVal>0){
        const adData={
          borrowerId:modal.id,borrowerName:modal.borrowerName,loanId:modal.loanId||modal.id,
          amount:addVal,date:pf.date,
          remarks:`Interest added to loan from settling ${month}`,
          settlementBatchId:batchId,updatedAt:serverTimestamp()
        };
        if(addAdditionId){await updateDoc(doc(db,'loan_additions',addAdditionId),adData);}
        else{adData.createdAt=serverTimestamp();adData.createdBy=user?.uid||null;const r=await addDoc(collection(db,'loan_additions'),adData);addAdditionId=r.id;}
      } else if(addAdditionId){
        await deleteDoc(doc(db,'loan_additions',addAdditionId));
        addAdditionId=null;
      }
      await updateDoc(doc(db,'borrower_interest_payments',payId),{addAdditionId});

      const partialNote2=newStatus==='Partial'?` — ₹${(dueRounded-totalGiven).toLocaleString('en-IN')} still pending for this period`:'';
      toast.success(collected
        ?(addVal>0&&cashVal>0?`✓ Settled — ${formatCurrency(cashVal)} collected + ${formatCurrency(addVal)} added to loan${partialNote2}`:addVal>0?`✓ ${formatCurrency(addVal)} added to loan principal${partialNote2}`:`✓ Payment recorded!${fine>0?` (incl. fine ₹${fine})`:''}${partialNote2}`)
        :'Marked as unpaid'
      );
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  // ── Undo an ENTIRE settlement action (one click = one Collect Interest = one
  // settlementBatchId, whether it covered 1 month or 10) — reverses it EVERYWHERE
  // it touched: every period it settled goes back to Unpaid, the added-to-loan
  // amount's own dated addition record is deleted and subtracted back out of the
  // real loan principal, and every ledger entry the action created is
  // soft-deleted (same Trash/Restore convention used elsewhere) so it's
  // recoverable there if the undo itself turns out to be wrong.
  async function undoBatch(borrower,batchId,label){
    if(!batchId)return toast.error('This entry has no settlement to undo (older data from before Undo existed).');
    if(!window.confirm(`Undo this settlement${label?` — ${label}`:''}?\n\nThis reverses the loan principal, deletes every ledger entry it created, and puts every period it covered back to Unpaid.`))return;
    setUndoingKey(batchId);
    try{
      const bPays=payments[borrower.id]||{};
      const touchedPayments=Object.values(bPays).filter(p=>p.settlementBatchId===batchId);
      // BUG FIX: this used to bake "(undone)" / "Undone" straight into the shared
      // `remarks` field. That field is also what pre-fills the Collect Interest
      // popup's Remarks box (and what a fresh Settle writes straight back out) —
      // so once a period was undone, "Undone" stuck around as its remark FOREVER,
      // including after the person went and actually collected the payment again,
      // making an already-paid period look permanently stuck on "Undone". Undo is
      // a status change (Paid → Unpaid), not a note the person wrote, so it no
      // longer touches `remarks` at all — any real remark the person typed stays
      // exactly as it was, and a fresh Settle now correctly shows Paid with nothing
      // left over. `wasUndone`/`undoneAt` record that this period was reversed, for
      // its own sake, without hijacking the remarks the person actually owns.
      for(const p of touchedPayments){
        await updateDoc(doc(db,'borrower_interest_payments',p.id),{
          amountPaid:0,addedAmount:0,fine:0,totalCollected:0,
          status:'Unpaid',addedToLoan:false,
          paymentDate:null,paymentMode:null,addAdditionId:null,addLedgerEntryId:null,
          wasUndone:true,undoneAt:serverTimestamp(),
          updatedAt:serverTimestamp()
        });
      }
      const addSnap=await getDocs(query(collection(db,'loan_additions'),where('settlementBatchId','==',batchId)));
      let totalAdded=0;
      for(const ad of addSnap.docs){ totalAdded+=ad.data().amount||0; await deleteDoc(doc(db,'loan_additions',ad.id)); }
      if(totalAdded>0){
        const revertedAmt=Math.max(0,(borrower.loanAmount||0)-totalAdded);
        await updateDoc(doc(db,'borrower_master',borrower.id),{
          loanAmount:revertedAmt,
          monthlyInterest:revertedAmt*(borrower.interestRate||0)/100,
          updatedAt:serverTimestamp()
        });
      }
      const ledgerSnap=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',batchId)));
      for(const ld of ledgerSnap.docs){
        await updateDoc(doc(db,'finance_ledger_entries',ld.id),{
          deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null,
          revertedLinkedData:{loanBatch:{payments:touchedPayments,additionsTotal:totalAdded},loanPrincipalBefore:borrower.loanAmount}
        });
      }
      toast.success(`✓ Undone — ${touchedPayments.length} period${touchedPayments.length!==1?'s':''} back to Unpaid${totalAdded>0?`, ${formatCurrency(totalAdded)} removed from principal`:''}`);
    }catch(e){toast.error('Undo failed: '+e.message);}finally{setUndoingKey(null);}
  }

  // ── Loads this borrower's own settlement ledger entries so they can be undone
  // right here in the Collect Interest popup — no need to hunt through the
  // (now read-only-for-settled) monthly cards or the Ledger page separately.
  async function loadAxisLedger(borrower){
    setAxisLedgerLoading(true);
    try{
      const snap=await getDocs(query(collection(db,'finance_ledger_entries'),where('borrowerId','==',borrower.id)));
      const list=scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid)
        .filter(e=>!e.deleted&&['Loan Interest','Interest Added to Loan','Fine Income'].includes(e.category))
        .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||((b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)));
      setAxisLedger(list);
    }catch(e){toast.error('Could not load ledger entries: '+e.message);}finally{setAxisLedgerLoading(false);}
  }

  // THIS MONTH — the selected month only.
  const monthDue=borrowers.reduce((s,b)=>{
    const pp=payments[b.id]?.[month];
    return s+(pp&&pp.amountDue!=null?pp.amountDue:calcInterest(b,getOutstanding(b,month)));
  },0);
  const monthColl=borrowers.reduce((s,b)=>{
    const pp=payments[b.id]?.[month];
    if(!pp)return s;
    if(pp.status==='Paid'||pp.status==='Partial'||pp.addedToLoan)return s+(pp.amountPaid||0)+(pp.addedAmount||0);
    return s;
  },0); // fine excluded
  const monthPending=Math.max(0,monthDue-monthColl);
  const monthRate=monthDue>0?Math.round((monthColl/monthDue)*100):0;

  // OVERALL — every month from each loan's start date up to today, matching the
  // exact same "up to date" logic used in the Export PDF and the per-borrower
  // Full History rows below (falls back to calcInterest for months with no
  // stored payment doc yet, so untouched pending months are never dropped).
  const _curActualMo=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;})();
  const overallDue=borrowers.reduce((s,b)=>{
    const slots=getMonths(b.loanStartDate).filter(mo=>mo<=_curActualMo);
    return s+slots.reduce((ss,mo)=>{
      const pp=payments[b.id]?.[mo];
      return ss+(pp&&pp.amountDue!=null?pp.amountDue:calcInterest(b,getOutstanding(b,mo)));
    },0);
  },0);
  const overallColl=borrowers.reduce((s,b)=>{
    const slots=getMonths(b.loanStartDate).filter(mo=>mo<=_curActualMo);
    return s+slots.reduce((ss,mo)=>{
      const pp=payments[b.id]?.[mo];
      if(!pp)return ss;
      if(pp.status==='Paid'||pp.status==='Partial'||pp.addedToLoan)return ss+(pp.amountPaid||0)+(pp.addedAmount||0);
      return ss;
    },0);
  },0);
  const overallPending=Math.max(0,overallDue-overallColl);
  const overallRate=overallDue>0?Math.round((overallColl/overallDue)*100):0;

  const isOverall=scope==='overall';
  const totalDue=isOverall?overallDue:monthDue;
  const totalColl=isOverall?overallColl:monthColl;
  const pending=isOverall?overallPending:monthPending;
  const rate=isOverall?overallRate:monthRate;

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
      <PageHeader title="Interest Collection" subtitle="Full interest history from loan start — with fine and compound interest support"
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
            <Button variant="secondary" onClick={()=>printCollectInterestSummary(filtBorrowers, payments, month, getOutstanding, calcInterest, scope)}>Export PDF</Button>
          </div>
        }/>


      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label={isOverall?'Total Interest Up to Date':`Interest Due — ${new Date(month+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'})}`} value={formatCurrency(Math.round(totalDue))} sub={isOverall?'All loans, from start to today':'Interest on outstanding, this month only'} color="#ff9500"/>
        <StatCard label="Collected" value={formatCurrency(Math.round(totalColl))} sub={isOverall?'Collected all-time':'Received this month'} color="#34c759"/>
        <StatCard label="Balance to Collect" value={formatCurrency(Math.round(pending))} sub={isOverall?'Still outstanding, up to date':'Still outstanding, this month'} color={pending>0?'#ff3b30':'#34c759'}/>
        <StatCard label="Collection Rate" value={`${rate}%`} sub="Of total due" color={rate>=90?'#34c759':rate>=60?'#ff9500':'#ff3b30'}/>
      </div>

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

      {/* Month view */}
      {viewMode==='month'&&(
        <Card>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'rgba(118,118,128,0.06)'}}>
                {['Borrower','Outstanding','Uncollected Interest','Rate','Due','Days OD','Fine','Status','Action'].map(h=>(
                  <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--divider)',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtBorrowers.length===0&&<tr><td colSpan={9} style={{padding:48,textAlign:'center',color:'var(--text-secondary)'}}>No borrowers match filters</td></tr>}
                {filtBorrowers.map(b=>{
                  const p=payments[b.id]?.[month];
                  const outstanding=getOutstanding(b); // lagged — for THIS month's own interest calc only
                  const currentOutstanding=getCurrentOutstanding(b); // true right-now balance — for display
                  const interest=calcInterest(b,outstanding);
                  // Uncollected interest for THIS month: 0 if fully paid, remaining if partial, full amount if pending
                  const uncollected = p?.status==='Paid' ? 0 : p?.status==='Partial' ? Math.max(0, interest-(p.amountPaid||0)) : interest;
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
                      <td style={{padding:'12px 14px',fontWeight:700,fontSize:13,color:currentOutstanding<b.loanAmount?'#ff9500':'var(--text-primary)'}}>{formatCurrency(Math.round(currentOutstanding))}</td>
                      <td style={{padding:'12px 14px',fontWeight:700,fontSize:13,color:uncollected>0?'#ff3b30':'#34c759'}}>{formatCurrency(Math.round(uncollected))}</td>
                      <td style={{padding:'12px 14px',color:'#ff9500',fontWeight:500}}>{b.interestRate}%</td>
                      <td style={{padding:'12px 14px',fontWeight:700,color:'#007aff',fontSize:14}}>{formatCurrency(Math.round(interest))}</td>
                      <td style={{padding:'12px 14px',fontSize:13,fontWeight:daysOD>2?700:400,color:daysOD>2?'#ff3b30':'var(--text-secondary)'}}>{daysOD>0?`${daysOD}d`:'—'}</td>
                      <td style={{padding:'12px 14px',fontSize:13,color:'#ff3b30',fontWeight:fine>0?700:400}}>{fine>0?formatCurrency(fine):'—'}</td>
                      <td style={{padding:'12px 14px'}}>{p?<Badge label={p.status} type={p.status.toLowerCase()}/>:<Badge label="Pending" type="pending"/>}</td>
                      <td style={{padding:'12px 14px'}}>
                        <Button size="sm" variant={['Paid','Partial'].includes(p?.status)?'secondary':'primary'} onClick={()=>{openModal(b);loadAxisLedger(b);}}>{p?.status==='Paid'?'Update':p?.status==='Partial'?'Partial ✎':'Collect'}</Button>
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
          {filtBorrowers.length===0&&<div style={{padding:48,textAlign:'center',color:'var(--text-secondary)'}}>No borrowers match filters</div>}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {filtBorrowers.map((b,bIdx)=>{
              const slots=getMonths(b.loanStartDate);
              const isOpen=selected===b.id;
              // Card header shows the true CURRENT balance — not a lagged "preview"
              // of what next month's interest calculation will use.
              const outstanding=getCurrentOutstanding(b);
              // A month settled by adding to the loan (compounding) is JUST AS
              // SETTLED as one collected in cash — count it here too, matching the
              // same fix on the deposit side.
              const totalColl=slots.reduce((s,mo)=>{const p=payments[b.id]?.[mo];return s+(p?.amountPaid||0)+(p?.addedAmount||0);},0);
              const paidCount=slots.filter(mo=>{const p=payments[b.id]?.[mo];return p?.status==='Paid'||p?.addedToLoan;}).length;
              const curActualMo=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;})();
              const dueSlotsCount=slots.filter(mo=>mo<=curActualMo).length; // exclude future "advance allowed" slots from the X/Y count
              const pendingSlots=slots.filter(mo=>mo<=curActualMo&&(()=>{const p=payments[b.id]?.[mo];return !(p?.status==='Paid'||p?.addedToLoan);})());
              // Total interest owed from loan START to END (now): use the STORED amountDue for months
              // that already have a record (historically accurate for that point in time); for months
              // never touched yet, fall back to today's estimate. Then subtract what's actually been
              // collected — whatever's left is the true remaining interest to pay.
              const dueSlots=slots.filter(mo=>mo<=curActualMo); // Total Due should never include months that haven't come due yet
              const totalInterestDue=dueSlots.reduce((s,mo)=>{
                const pp=payments[b.id]?.[mo];
                const dueForMonth = pp?.amountDue!=null ? pp.amountDue : calcInterest(b,getOutstanding(b,mo));
                return s+dueForMonth;
              },0);
              const totalInterestCollected=dueSlots.reduce((s,mo)=>{
                const pp=payments[b.id]?.[mo];
                if(!pp)return s;
                if(pp.status==='Paid'||pp.status==='Partial'||pp.addedToLoan)return s+(pp.amountPaid||0)+(pp.addedAmount||0);
                return s;
              },0);
              const remainingInterestToPay=Math.max(0,totalInterestDue-totalInterestCollected);
              return(
                <div key={b.id} style={{border:'1px solid rgba(0,0,0,0.07)',borderRadius:14,overflow:'hidden'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 18px',cursor:'pointer'}} onClick={()=>setSelected(isOpen?null:b.id)}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <span style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',minWidth:22}}>#{bIdx+1}</span>
                        <span style={{fontWeight:600,fontSize:15}}>{b.borrowerName}</span>
                        <Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/>
                      </div>
                      <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>
                        Loan from {b.loanStartDate||'—'} · {formatCurrency(b.loanAmount)} · Outstanding: <strong style={{color:'#ff9500'}}>{formatCurrency(Math.round(outstanding))}</strong>
                      </div>
                      <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:3}}>
                        Interest — Total Due: <strong style={{color:'var(--text-primary)'}}>₹{totalInterestDue.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                        {' − '}Collected: <strong style={{color:'#34c759'}}>₹{totalInterestCollected.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                        {' = '}Remaining to Pay: <strong style={{color:remainingInterestToPay>0?'#ff3b30':'#34c759'}}>₹{remainingInterestToPay.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:16,alignItems:'center'}}>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:11,color:'var(--text-secondary)'}}>{paidCount}/{dueSlotsCount} PAID</div>
                        <div style={{fontSize:15,fontWeight:700,color:'#34c759'}}>{formatCurrency(Math.round(totalColl))}</div>
                      </div>
                      {pendingSlots.length>0&&(
                        <div style={{padding:'4px 10px',borderRadius:99,background:'rgba(255,59,48,0.08)',border:'1px solid rgba(255,59,48,0.2)',fontSize:12,fontWeight:700,color:'#ff3b30'}}>{pendingSlots.length} pending</div>
                      )}
                      {/* Axis (⋮) button — same as Depositor Settlement: opens Collect
                          Interest targeting the latest pending month (full pending
                          range by default) and loads this borrower's undo ledger. */}
                      {slots.length>0&&(
                        <button title="Collect Interest / Undo" onClick={e=>{
                          e.stopPropagation();
                          const targetMo=pendingSlots.length>0?pendingSlots[pendingSlots.length-1]:slots[slots.length-1];
                          openModal(b,targetMo);
                          loadAxisLedger(b);
                        }}
                          style={{width:30,height:30,flexShrink:0,borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',background:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#3c3c43'}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                        </button>
                      )}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2" style={{transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.2s'}}><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                  </div>
                  {isOpen&&(()=>{
                    const WIN=5;
                    // Center the default view on the CURRENT month, not the very end of the
                    // array — slots now extend a few months into the future too, so "the end"
                    // would jump straight past today into upcoming months on first open.
                    const curIdx=slots.indexOf(month);
                    const defaultStart=curIdx>=0?Math.max(0,Math.min(slots.length-WIN,curIdx-2)):Math.max(0,slots.length-WIN);
                    const winStart=windowStarts[b.id]??defaultStart;
                    const visible=slots.slice(winStart,winStart+WIN);
                    const canPrev=winStart>0;
                    const canNext=winStart+WIN<slots.length;
                    return(
                    <div style={{borderTop:'1px solid rgba(0,0,0,0.07)',padding:14}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <button onClick={()=>setWindowStarts(w=>({...w,[b.id]:Math.max(0,winStart-1)}))} disabled={!canPrev}
                          style={{width:32,height:32,flexShrink:0,borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:canPrev?'#fff':'#f5f5f5',color:canPrev?'var(--text-primary)':'var(--text-tertiary)',cursor:canPrev?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,flex:1}}>
                          {visible.map(mo=>{
                            const p=payments[b.id]?.[mo];
                            const isPaid=p?.status==='Paid';
                            const isPartial=p?.status==='Partial';
                            const isAdded=p?.addedToLoan;
                            const curActualMonth=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;})();
                            const isFuture=mo>curActualMonth;
                            const label=new Date(mo+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'});
                            // Click a card to pay through it — same calendar-picker logic as
                            // Depositor Settlement: clicking, say, August opens Collect Interest
                            // already scoped to settle everything from the earliest pending
                            // month cumulatively up through August, and this card turns blue.
                            // Future ("advance allowed") months keep their original single-month
                            // click-to-pay behavior — nothing changes there.
                            const isPayTarget=modal&&modal.id===b.id&&(payThroughMonth?payThroughMonth===mo:month===mo&&!!modal);
                            const monthInt=calcInterest(b,getOutstanding(b,mo)); // date-aware — each card computes its OWN month's amount, never a stale shared figure
                            return(
                              <div key={mo} onClick={()=>{openModal(b,mo,mo);loadAxisLedger(b);}}
                                style={{padding:'10px 12px',borderRadius:10,
                                  border:isPayTarget?'2px solid #007aff':`1px ${isFuture?'dashed':'solid'} ${isPaid?'rgba(52,199,89,0.25)':isPartial?'rgba(255,149,0,0.3)':isAdded?'rgba(88,86,214,0.3)':mo===curActualMonth?'rgba(0,122,255,0.3)':isFuture?'rgba(0,0,0,0.12)':'rgba(0,0,0,0.07)'}`,
                                  background:isPayTarget?'rgba(0,122,255,0.1)':isPaid?'rgba(52,199,89,0.04)':isPartial?'rgba(255,149,0,0.05)':isAdded?'rgba(88,86,214,0.05)':mo===curActualMonth?'rgba(0,122,255,0.04)':isFuture?'rgba(0,0,0,0.015)':'#fafafa',
                                  position:'relative',cursor:'pointer',opacity:isFuture&&!isPaid?0.85:1}}>
                                {isPayTarget&&<div style={{position:'absolute',top:-8,left:'50%',transform:'translateX(-50%)',background:'#007aff',color:'#fff',fontSize:8.5,fontWeight:800,padding:'2px 7px',borderRadius:99,whiteSpace:'nowrap'}}>📅 PAYING TO</div>}
                                <div style={{fontSize:12,fontWeight:600,color:isPayTarget?'#007aff':isPaid?'#1a7a34':isPartial?'#b45309':isAdded?'#5856d6':mo===curActualMonth?'#007aff':'var(--text-primary)',marginBottom:4}}>{label}</div>
                                <div style={{fontSize:13,fontWeight:700,color:isPaid?'#34c759':isPartial?'#ff9500':isAdded?'#5856d6':'var(--text-secondary)'}}>{(isPaid||isPartial)?formatCurrency((p.amountPaid||0)+(p.addedAmount||0)):isAdded?'+ Principal':formatCurrency(Math.round(monthInt))}</div>
                                {isPartial&&<div style={{fontSize:9.5,color:'#ff9500',marginTop:2}}>{formatCurrency(Math.max(0,(p.amountDue||0)-(p.amountPaid||0)-(p.addedAmount||0)))} remaining</div>}
                                {isFuture&&!isPaid&&!isPartial&&<div style={{fontSize:9.5,color:'var(--text-tertiary)',marginTop:2}}>advance allowed</div>}
                                {/* Undo history is its own small tag, separate from the person's own
                                    remarks — it clears itself the moment this period is settled again
                                    (wasUndone is reset to false on every fresh Settle/Mark Unpaid). */}
                                {p?.wasUndone&&!isPaid&&!isPartial&&<div style={{fontSize:9,color:'#8e8e93',marginTop:2}}>↺ previously undone</div>}
                                {p?.remarks&&<div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:3,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={p.remarks}>📝 {p.remarks}</div>}
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={()=>setWindowStarts(w=>({...w,[b.id]:Math.min(slots.length-WIN,winStart+1)}))} disabled={!canNext}
                          style={{width:32,height:32,flexShrink:0,borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:canNext?'#fff':'#f5f5f5',color:canNext?'var(--text-primary)':'var(--text-tertiary)',cursor:canNext?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
                      </div>
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Collection Modal */}
      <Modal open={!!modal} onClose={()=>{setModal(null);setBulkPending(null);setPayThroughMonth(null);setAxisLedger([]);}} title={`Collect Interest — ${modal?.borrowerName}`} width={500}
        footer={modal&&(
          <div style={{display:'flex',gap:10,width:'100%'}}>
            <Button onClick={()=>savePay(true)} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':bulkPending?(()=>{
              const scoped=activeBulkPeriods(bulkPending,payThroughMonth);
              let budget=(parseFloat(pf.cashAmount)||0)+(parseFloat(pf.addAmount)||0),covered=0;
              for(const p of scoped){if(budget>=p.amount){budget-=p.amount;covered++;}else break;}
              const throughLabel=scoped[scoped.length-1]?.month?new Date(scoped[scoped.length-1].month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'}):'';
              return covered===scoped.length?`✓ Settle All ${scoped.length} Periods (through ${throughLabel})`:`✓ Settle ${covered} of ${scoped.length} Periods (through ${throughLabel})`;
            })():'✓ Settle'}</Button>
            {!bulkPending&&<Button variant="secondary" onClick={()=>savePay('partial')} disabled={saving}>Partial</Button>}
            {!bulkPending&&<Button variant="danger" onClick={()=>savePay(false)} disabled={saving}>Mark Unpaid</Button>}
          </div>
        )}>
        {modal&&(()=>{
          const outstanding=getOutstanding(modal);
          const interest=calcInterest(modal,outstanding);
          const daysOD=getDaysOverdue(month);
          const fineAmt=parseFloat(pf.fine)||0;
          const existingPay=payments[modal.id]?.[month];
          const payStatus=existingPay?.status; // 'Paid' | 'Partial' | undefined (pending)
          const scopedBulk=bulkPending?activeBulkPeriods(bulkPending,payThroughMonth):null;
          const effectiveDue=scopedBulk?scopedBulk.reduce((s,p)=>s+p.amount,0):interest;
          return(
            <> {/* intColV3 */}
              {/* Status shown first — before anything else */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'10px 14px',borderRadius:10,background:payStatus==='Paid'?'rgba(52,199,89,0.08)':payStatus==='Partial'?'rgba(88,86,214,0.08)':'rgba(255,149,0,0.08)',border:`1px solid ${payStatus==='Paid'?'rgba(52,199,89,0.25)':payStatus==='Partial'?'rgba(88,86,214,0.25)':'rgba(255,149,0,0.25)'}`}}>
                <span style={{fontSize:16}}>{payStatus==='Paid'?'✅':payStatus==='Partial'?'◐':'⏳'}</span>
                <span style={{fontSize:14,fontWeight:800,color:payStatus==='Paid'?'#1a7a34':payStatus==='Partial'?'#5856d6':'#b45309'}}>
                  {payStatus==='Paid'?'Paid':payStatus==='Partial'?'Partially Paid':'Pending'}
                </span>
                <span style={{fontSize:12,color:'var(--text-secondary)',marginLeft:'auto'}}>{new Date(month+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</span>
              </div>
              {bulkPending && (
                <div style={{marginBottom:16,padding:'12px 14px',borderRadius:12,background:'rgba(255,149,0,0.06)',border:'1px solid rgba(255,149,0,0.25)'}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:'#b45309',marginBottom:4}}>⚠ {bulkPending.length} periods pending, {new Date(bulkPending[0].month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'})} – {new Date(bulkPending[bulkPending.length-1].month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</div>
                  <div style={{fontSize:11.5,color:'var(--text-secondary)',marginBottom:8}}>Click a month below to pay through it — settles the cumulative total up to the month you pick (shown in blue), leaving anything after it pending.</div>
                  {/* Same calendar-style "pay through" picker as Depositor Settlement */}
                  <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                    {bulkPending.map(p=>{
                      const isThrough=p.month===payThroughMonth;
                      const isIncluded=payThroughMonth?p.month<=payThroughMonth:true;
                      return(
                        <button key={p.month} type="button" onClick={()=>{
                          setPayThroughMonth(p.month);
                          const newScoped=activeBulkPeriods(bulkPending,p.month);
                          const newTotal=newScoped.reduce((s,x)=>s+x.amount,0);
                          setPf(pf=>({...pf,cashAmount:String(newTotal),addAmount:'0'}));
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
                    Paying through <strong style={{color:'#007aff'}}>{new Date((scopedBulk[scopedBulk.length-1]||bulkPending[bulkPending.length-1]).month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'})}</strong> — combined total: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(effectiveDue)}</strong> — settled oldest month first, each at its own correct amount; any leftover after whole months become a Partial on the next one.
                    {payThroughMonth!==bulkPending[bulkPending.length-1].month&&<> {bulkPending.length-scopedBulk.length} period{bulkPending.length-scopedBulk.length!==1?'s':''} after this stay pending.</>}
                  </div>
                </div>
              )}
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
                {[{l:'Outstanding',v:formatCurrency(Math.round(outstanding)),c:'#007aff'},{l:bulkPending?'Total Pending Interest':'Interest Due',v:formatCurrency(Math.round(effectiveDue)),c:'#ff9500'},{l:'Days OD',v:daysOD>0?`${daysOD} days`:'On time',c:daysOD>2?'#ff3b30':'#34c759'}].map((s,i)=>(
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

              {/* Split settlement — cash collected vs added back to the loan principal
                  (compound), any ratio. Same as Depositor Settlement's Cash in Hand /
                  Add to Deposit split — independent fields, no forced remainder. */}
              {(()=>{
                const cashV=parseFloat(pf.cashAmount)||0, addV=parseFloat(pf.addAmount)||0;
                const splitTotal=cashV+addV;
                const mismatch=Math.round(splitTotal)!==Math.round(effectiveDue);
                return(
                <div style={{background:'rgba(88,86,214,0.05)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:12,padding:'12px 14px',marginBottom:14}}>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:10}}>Split how the {bulkPending?'total pending interest is':'interest is'} handled — cash collected vs added back to the loan principal. Whole periods are settled oldest first: cash covers as many full months as it can, then the loan-principal portion continues from there — any leftover becomes a Partial on the next month.</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:mismatch?8:0}}>
                    <div>
                      <label style={{fontSize:11.5,fontWeight:700,color:'var(--text-secondary)',display:'block',marginBottom:5}}>💵 Cash Collected (₹)</label>
                      <input type="number" value={pf.cashAmount} onChange={e=>setPf(p=>({...p,cashAmount:e.target.value}))}
                        style={{width:'100%',boxSizing:'border-box',height:38,padding:'0 12px',borderRadius:9,border:'1.5px solid rgba(0,0,0,0.1)',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11.5,fontWeight:700,color:'#5856d6',display:'block',marginBottom:5}}>🏦 Add to Loan Amount (₹)</label>
                      <input type="number" value={pf.addAmount} onChange={e=>setPf(p=>({...p,addAmount:e.target.value}))}
                        style={{width:'100%',boxSizing:'border-box',height:38,padding:'0 12px',borderRadius:9,border:'1.5px solid rgba(88,86,214,0.3)',fontSize:14,fontFamily:'inherit',outline:'none'}}/>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:mismatch?8:0}}>
                    <button type="button" onClick={()=>setPf(p=>({...p,cashAmount:String(Math.round(effectiveDue)),addAmount:'0'}))}
                      style={{fontSize:10.5,fontWeight:600,color:'var(--text-secondary)',background:'rgba(0,0,0,0.04)',border:'1px solid rgba(0,0,0,0.08)',borderRadius:7,padding:'4px 9px',cursor:'pointer'}}>Fill full amount as cash</button>
                    <button type="button" onClick={()=>setPf(p=>({...p,cashAmount:'0',addAmount:String(Math.round(effectiveDue))}))}
                      style={{fontSize:10.5,fontWeight:600,color:'#5856d6',background:'rgba(88,86,214,0.06)',border:'1px solid rgba(88,86,214,0.15)',borderRadius:7,padding:'4px 9px',cursor:'pointer'}}>Fill full amount to loan</button>
                  </div>
                  {mismatch && (
                    <div style={{fontSize:11.5,color:splitTotal<Math.round(effectiveDue)?'#b45309':'#1a7a34'}}>
                      {splitTotal<Math.round(effectiveDue)
                        ?<>⚠ ₹{(Math.round(effectiveDue)-splitTotal).toLocaleString('en-IN')} of the {bulkPending?'total pending interest':"this period's interest"} will stay pending — recorded as Partial. That's fine if this is intentional.</>
                        :<>ℹ Cash + Loan addition ({formatCurrency(splitTotal)}) is more than the interest due ({formatCurrency(Math.round(effectiveDue))}) — the extra will be recorded as-is.</>
                      }
                    </div>
                  )}
                  {addV>0 && (
                    <div style={{marginTop:8,fontSize:12,color:'#5856d6',background:'rgba(88,86,214,0.08)',borderRadius:8,padding:'8px 10px'}}>
                      New loan principal: {formatCurrency((modal.loanAmount||0)+addV)}
                    </div>
                  )}
                </div>
                );
              })()}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <div>
                  <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Payment Date</label>
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
              {(pf.collectFine&&fineAmt>0)&&(
                <div style={{padding:'8px 12px',background:'rgba(52,199,89,0.06)',borderRadius:8,fontSize:13,color:'#1a7a34',marginBottom:12}}>
                  Cash collected: {formatCurrency(parseFloat(pf.cashAmount)||0)} + Fine {formatCurrency(fineAmt)} = <strong>{formatCurrency((parseFloat(pf.cashAmount)||0)+fineAmt)}</strong>
                </div>
              )}
              <div>
                <label style={{fontSize:12,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:5}}>Remarks</label>
                <textarea value={pf.remarks} onChange={e=>setPf(p=>({...p,remarks:e.target.value}))} placeholder="Optional…"
                  style={{width:'100%',padding:'10px 12px',borderRadius:10,border:'1.5px solid rgba(0,0,0,0.08)',fontSize:13,fontFamily:'inherit',background:'rgba(118,118,128,0.07)',color:'var(--text-primary)',outline:'none',minHeight:60,resize:'vertical'}}/>
              </div>

              {/* Scroll down to find this borrower's settlement ledger entries, each
                  with its own Undo — reverses that action's payment everywhere (loan
                  principal, payment record, ledger) — same as Depositor Settlement. */}
              <div style={{marginTop:22,paddingTop:16,borderTop:'1px solid rgba(0,0,0,0.08)'}}>
                <div style={{fontSize:12.5,fontWeight:700,color:'var(--text-secondary)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.02em'}}>Ledger Entries — Undo</div>
                {axisLedgerLoading&&<div style={{fontSize:12.5,color:'var(--text-secondary)',padding:'8px 0'}}>Loading…</div>}
                {!axisLedgerLoading&&axisLedger.length===0&&<div style={{fontSize:12.5,color:'var(--text-secondary)',padding:'8px 0'}}>No settlement entries yet for this borrower.</div>}
                {!axisLedgerLoading&&axisLedger.length>0&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:220,overflowY:'auto'}}>
                    {axisLedger.map(entry=>(
                      <div key={entry.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:9,background:'rgba(0,0,0,0.03)',border:'1px solid rgba(0,0,0,0.06)'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={entry.description}>{entry.description}</div>
                          <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:1}}>{entry.category} · {formatCurrency(entry.amount)} · {entry.date}</div>
                        </div>
                        <button onClick={async()=>{await undoBatch(modal,entry.settlementBatchId,entry.description);loadAxisLedger(modal);}} disabled={!!undoingKey}
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
