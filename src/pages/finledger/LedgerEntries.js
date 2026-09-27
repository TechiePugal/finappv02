import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,deleteDoc,doc,query,orderBy,where,getDocs,serverTimestamp,getDoc} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,StatCard,Button,SearchBar,FilterTabs,Modal,formatCurrency,formatDate,Loader,SectionHeader} from '../../components/finledger/UI';
import {useAuth} from '../../contexts/AuthContext';
import { PageLoader } from '../../components/Skeleton';
import {scopeToUser} from '../../utils/scopeHelper';

export default function LedgerEntries(){
  const {user}=useAuth();
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [amtRange,setAmtRange]=useState('all');
  const AMT_RANGES=[
    {value:'all',label:'All Amounts'},
    {value:'0-10000',label:'₹0 – ₹10K'},
    {value:'10000-50000',label:'₹10K – ₹50K'},
    {value:'50000-100000',label:'₹50K – ₹1L'},
    {value:'100000+',label:'₹1L+'},
  ];
  function matchAmt(e){
    const a=e.amount||0;
    if(amtRange==='all')return true;
    if(amtRange==='0-10000')return a<10000;
    if(amtRange==='10000-50000')return a>=10000&&a<50000;
    if(amtRange==='50000-100000')return a>=50000&&a<100000;
    if(amtRange==='100000+')return a>=100000;
    return true;
  }
  const [tf,setTf]=useState('All');
  const [catFilter,setCatFilter]=useState('All');
  const [showModal,setShowModal]=useState(false);
  const [editItem,setEditItem]=useState(null);
  const [form,setForm]=useState({type:'Credit',category:'Loan Interest',description:'',amount:'',paymentMode:'Cash',date:new Date().toISOString().split('T')[0]});
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(null);
  const [trashedEntries,setTrashedEntries]=useState([]);
  const [showTrash,setShowTrash]=useState(false);

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db,'finance_ledger_entries'),orderBy('createdAt','desc')),
      snap=>{
        const all=scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
        setEntries(all.filter(e=>!e.deleted));
        setTrashedEntries(all.filter(e=>e.deleted));
        setLoading(false);
      },
      ()=>{toast.error('Failed to load');setLoading(false);}
    );
    return unsub;
  },[]);
  async function load(){}// kept for compat

  function openAdd(){setEditItem(null);setForm({type:'Credit',category:'Loan Interest',description:'',amount:'',paymentMode:'Cash',date:new Date().toISOString().split('T')[0]});setShowModal(true);}
  function openEdit(e){setEditItem(e);setForm({type:e.type,category:e.category,description:e.description,amount:String(e.amount),paymentMode:e.paymentMode||'Cash',date:e.date||new Date().toISOString().split('T')[0]});setShowModal(true);}

  async function saveEntry(e){
    if(e&&e.preventDefault)e.preventDefault();
    e.preventDefault();
    if(!form.description||!form.amount) return toast.error('Fill all required fields');
    setSaving(true);
    try{
      const data={...form,amount:parseFloat(form.amount),updatedAt:serverTimestamp()};
      if(editItem){
        await updateDoc(doc(db,'finance_ledger_entries',editItem.id),data);
        // Update linked interest payment record
        if(editItem.linkedPaymentId){
          try{
            await updateDoc(doc(db,'borrower_interest_payments',editItem.linkedPaymentId),{
              amountPaid:parseFloat(form.amount),
              paymentMode:form.paymentMode,
              paymentDate:form.date,
              updatedAt:serverTimestamp()
            });
          }catch{}
        }
        // Update linked deposit payment record
        if(editItem.linkedDepositPaymentId){
          try{
            await updateDoc(doc(db,'deposit_payments',editItem.linkedDepositPaymentId),{
              amountPaid:parseFloat(form.amount),
              paymentMode:form.paymentMode,
              paymentDate:form.date,
              updatedAt:serverTimestamp()
            });
          }catch{}
        }
        // Update linked loan repayment record
        if(editItem.linkedRepaymentId){
          try{
            await updateDoc(doc(db,'loan_repayments',editItem.linkedRepaymentId),{
              repaidAmount:parseFloat(form.amount),
              paymentMode:form.paymentMode,
              date:form.date,
              updatedAt:serverTimestamp()
            });
          }catch{}
        }
        toast.success('Entry and all linked records updated!');
      } else {
        data.createdAt=serverTimestamp();
        data.createdBy=user?.uid||null;
        await addDoc(collection(db,'finance_ledger_entries'),data);
        toast.success('Entry added!');
      }
      setShowModal(false);
      // Use onSnapshot - auto refreshes, no manual load needed
    }catch(err){toast.error('Failed: '+err.message);}finally{setSaving(false);}
  }

  async function deleteEntry(entry){
    if(!window.confirm(`Delete this ${entry.type} entry of ${formatCurrency(entry.amount)}?\n\nThis moves it to Trash — you can restore it later if needed.`))return;
    setDeleting(entry.id);
    try{
      // Soft delete: never actually erase the entry — mark it hidden and capture
      // a snapshot of whatever linked record gets reverted, so "Restore" can put
      // everything back exactly as it was, not just undelete the ledger line itself.
      const revertedLinkedData = {};
      if(entry.linkedPaymentId){
        try{
          const snap = await getDoc(doc(db,'borrower_interest_payments',entry.linkedPaymentId));
          if(snap.exists()){
            const payData=snap.data();
            revertedLinkedData.borrowerPayment = { id: entry.linkedPaymentId, ...payData };
            // BUG FIX: same as the deposit side below — deleting a settlement entry
            // reset the payment record but never reversed a compounded amount back
            // out of the loan's real principal, leaving the loan inflated even after
            // the settlement that grew it was deleted.
            if((payData.addedAmount||0)>0 && payData.borrowerId){
              const borSnap=await getDoc(doc(db,'borrower_master',payData.borrowerId));
              if(borSnap.exists()){
                const borData=borSnap.data();
                revertedLinkedData.loanPrincipalBefore=borData.loanAmount||0;
                const revertedAmt=Math.max(0,(borData.loanAmount||0)-(payData.addedAmount||0));
                await updateDoc(doc(db,'borrower_master',payData.borrowerId),{
                  loanAmount:revertedAmt,monthlyInterest:revertedAmt*(borData.interestRate||0)/100,updatedAt:serverTimestamp()
                });
              }
            }
          }
          await updateDoc(doc(db,'borrower_interest_payments',entry.linkedPaymentId),{status:'Unpaid',amountPaid:0,addedAmount:0,addedToLoan:false,paymentDate:null,updatedAt:serverTimestamp()});
        }catch{}
      }
      if(entry.linkedDepositPaymentId){
        try{
          const snap = await getDoc(doc(db,'deposit_payments',entry.linkedDepositPaymentId));
          if(snap.exists()){
            const payData=snap.data();
            revertedLinkedData.depositPayment = { id: entry.linkedDepositPaymentId, ...payData };
            // BUG FIX: deleting a settlement entry from the Ledger reset the payment
            // record back to Unpaid, but never actually reversed a compounded amount
            // back out of the deposit's real principal — the deposit stayed inflated
            // even after the settlement that grew it was deleted. Snapshot the
            // principal now (so Restore can put it back exactly) and reverse it.
            if((payData.addedAmount||0)>0 && payData.depositId){
              const depSnap=await getDoc(doc(db,'deposit_master',payData.depositId));
              if(depSnap.exists()){
                const depData=depSnap.data();
                revertedLinkedData.depositPrincipalBefore=depData.depositAmount||0;
                const revertedAmt=Math.max(0,(depData.depositAmount||0)-(payData.addedAmount||0));
                await updateDoc(doc(db,'deposit_master',payData.depositId),{
                  depositAmount:revertedAmt,updatedAt:serverTimestamp()
                });
              }
            }
          }
          await updateDoc(doc(db,'deposit_payments',entry.linkedDepositPaymentId),{status:'Unpaid',amountPaid:0,addedAmount:0,addedToDeposit:false,paymentDate:null,updatedAt:serverTimestamp()});
        }catch{}
      }
      if(entry.linkedRepaymentId){
        try{
          const snap = await getDoc(doc(db,'loan_repayments',entry.linkedRepaymentId));
          if(snap.exists()) revertedLinkedData.repayment = { id: entry.linkedRepaymentId, ...snap.data() };
          await updateDoc(doc(db,'loan_repayments',entry.linkedRepaymentId),{deleted:true,updatedAt:serverTimestamp()});
        }catch{}
      }
      // A combined bulk-settlement entry ("5 periods settled today") has no single
      // linkedDepositPaymentId — it covers several deposit_payments records at once,
      // tied together by settlementBatchId instead. Reverse all of them together,
      // plus the one dated compound addition (if any) the whole batch created.
      if(entry.settlementBatchId && !entry.linkedDepositPaymentId){
        try{
          const paySnap=await getDocs(query(collection(db,'deposit_payments'),where('settlementBatchId','==',entry.settlementBatchId)));
          const touchedPayments=paySnap.docs.map(d=>({id:d.id,...d.data()}));
          for(const p of touchedPayments){
            await updateDoc(doc(db,'deposit_payments',p.id),{amountPaid:0,addedAmount:0,fine:0,totalPayout:0,status:'Unpaid',addedToDeposit:false,paymentDate:null,compoundAdditionId:null,compoundLedgerEntryId:null,updatedAt:serverTimestamp()});
          }
          const addSnap=await getDocs(query(collection(db,'deposit_additions'),where('settlementBatchId','==',entry.settlementBatchId)));
          let totalAdded=0;
          for(const ad of addSnap.docs){ totalAdded+=ad.data().amount||0; await deleteDoc(doc(db,'deposit_additions',ad.id)); }
          if(totalAdded>0 && entry.depositId){
            const depSnap=await getDoc(doc(db,'deposit_master',entry.depositId));
            if(depSnap.exists()){
              const depData=depSnap.data();
              revertedLinkedData.depositPrincipalBefore=depData.depositAmount||0;
              const revertedAmt=Math.max(0,(depData.depositAmount||0)-totalAdded);
              await updateDoc(doc(db,'deposit_master',entry.depositId),{depositAmount:revertedAmt,updatedAt:serverTimestamp()});
            }
          }
          revertedLinkedData.depositBatch={payments:touchedPayments,additionsTotal:totalAdded};
          // A whole batch usually has more than one ledger row (cash + compound + fine)
          // sharing this same settlementBatchId — soft-delete its siblings too, or
          // deleting just the row the person clicked would leave the others behind.
          const siblingSnap=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',entry.settlementBatchId)));
          for(const sib of siblingSnap.docs){
            if(sib.id===entry.id)continue;
            await updateDoc(doc(db,'finance_ledger_entries',sib.id),{deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null});
          }
        }catch{}
      }
      // Same combined-entry reversal as above, for a loan-side bulk Interest
      // Collection settlement (borrower_interest_payments + loan_additions) instead
      // of the deposit collections.
      if(entry.settlementBatchId && !entry.linkedPaymentId && entry.borrowerId){
        try{
          const paySnap=await getDocs(query(collection(db,'borrower_interest_payments'),where('settlementBatchId','==',entry.settlementBatchId)));
          const touchedPayments=paySnap.docs.map(d=>({id:d.id,...d.data()}));
          for(const p of touchedPayments){
            await updateDoc(doc(db,'borrower_interest_payments',p.id),{amountPaid:0,addedAmount:0,fine:0,totalCollected:0,status:'Unpaid',addedToLoan:false,paymentDate:null,addAdditionId:null,addLedgerEntryId:null,updatedAt:serverTimestamp()});
          }
          const addSnap=await getDocs(query(collection(db,'loan_additions'),where('settlementBatchId','==',entry.settlementBatchId)));
          let totalAdded2=0;
          for(const ad of addSnap.docs){ totalAdded2+=ad.data().amount||0; await deleteDoc(doc(db,'loan_additions',ad.id)); }
          if(totalAdded2>0 && entry.borrowerId){
            const borSnap=await getDoc(doc(db,'borrower_master',entry.borrowerId));
            if(borSnap.exists()){
              const borData=borSnap.data();
              revertedLinkedData.loanPrincipalBefore=borData.loanAmount||0;
              const revertedAmt=Math.max(0,(borData.loanAmount||0)-totalAdded2);
              await updateDoc(doc(db,'borrower_master',entry.borrowerId),{loanAmount:revertedAmt,monthlyInterest:revertedAmt*(borData.interestRate||0)/100,updatedAt:serverTimestamp()});
            }
          }
          revertedLinkedData.loanBatch={payments:touchedPayments,additionsTotal:totalAdded2};
          const siblingSnap2=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',entry.settlementBatchId)));
          for(const sib of siblingSnap2.docs){
            if(sib.id===entry.id)continue;
            await updateDoc(doc(db,'finance_ledger_entries',sib.id),{deleted:true,deletedAt:serverTimestamp(),deletedBy:user?.uid||null});
          }
        }catch{}
      }
      await updateDoc(doc(db,'finance_ledger_entries',entry.id),{
        deleted:true, deletedAt:serverTimestamp(), deletedBy:user?.uid||null,
        revertedLinkedData: Object.keys(revertedLinkedData).length>0 ? revertedLinkedData : null,
      });
      setEntries(prev=>prev.filter(e=>e.id!==entry.id));
      toast.success('Entry moved to Trash — restorable anytime');
    }catch(err){toast.error('Delete failed: '+err.message);}finally{setDeleting(null);}
  }

  async function restoreEntry(entry){
    setDeleting(entry.id);
    try{
      const rd = entry.revertedLinkedData;
      if(rd?.borrowerPayment){
        const { id, ...data } = rd.borrowerPayment;
        try{await updateDoc(doc(db,'borrower_interest_payments',id),{...data,updatedAt:serverTimestamp()});}catch{}
        if(typeof rd.loanPrincipalBefore==='number' && data.borrowerId){
          try{await updateDoc(doc(db,'borrower_master',data.borrowerId),{loanAmount:rd.loanPrincipalBefore,updatedAt:serverTimestamp()});}catch{}
        }
      }
      if(rd?.depositPayment){
        const { id, ...data } = rd.depositPayment;
        try{await updateDoc(doc(db,'deposit_payments',id),{...data,updatedAt:serverTimestamp()});}catch{}
        // Put the deposit's real principal back exactly as it was before the delete
        // reversed it — not just the payment row, or the two would go out of sync again.
        if(typeof rd.depositPrincipalBefore==='number' && data.depositId){
          try{await updateDoc(doc(db,'deposit_master',data.depositId),{depositAmount:rd.depositPrincipalBefore,updatedAt:serverTimestamp()});}catch{}
        }
      }
      if(rd?.repayment){
        const { id, ...data } = rd.repayment;
        try{await updateDoc(doc(db,'loan_repayments',id),{...data,updatedAt:serverTimestamp()});}catch{}
      }
      // A combined bulk-settlement entry restores every period it covered, puts the
      // exact same compound amount back as a fresh dated addition, and un-deletes
      // its sibling ledger rows (cash/compound/fine) that were soft-deleted together.
      if(rd?.depositBatch){
        for(const p of rd.depositBatch.payments||[]){
          const { id, ...data } = p;
          try{await updateDoc(doc(db,'deposit_payments',id),{...data,updatedAt:serverTimestamp()});}catch{}
        }
        if(typeof rd.depositPrincipalBefore==='number' && entry.depositId){
          try{await updateDoc(doc(db,'deposit_master',entry.depositId),{depositAmount:rd.depositPrincipalBefore,updatedAt:serverTimestamp()});}catch{}
        }
        if((rd.depositBatch.additionsTotal||0)>0 && entry.depositId){
          try{await addDoc(collection(db,'deposit_additions'),{
            depositorId:entry.depositId,depositorName:entry.depositorName,depositId:entry.depositId,
            amount:rd.depositBatch.additionsTotal,date:entry.date,remarks:'Restored from Ledger Trash',
            settlementBatchId:entry.settlementBatchId,createdAt:serverTimestamp(),createdBy:user?.uid||null
          });}catch{}
        }
        if(entry.settlementBatchId){
          try{
            const sibSnap=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',entry.settlementBatchId)));
            for(const sib of sibSnap.docs){ if(sib.id!==entry.id) await updateDoc(doc(db,'finance_ledger_entries',sib.id),{deleted:false,deletedAt:null,deletedBy:null}); }
          }catch{}
        }
      }
      // Loan-side equivalent of the depositBatch restore above.
      if(rd?.loanBatch){
        for(const p of rd.loanBatch.payments||[]){
          const { id, ...data } = p;
          try{await updateDoc(doc(db,'borrower_interest_payments',id),{...data,updatedAt:serverTimestamp()});}catch{}
        }
        if(typeof rd.loanPrincipalBefore==='number' && entry.borrowerId){
          try{await updateDoc(doc(db,'borrower_master',entry.borrowerId),{loanAmount:rd.loanPrincipalBefore,updatedAt:serverTimestamp()});}catch{}
        }
        if((rd.loanBatch.additionsTotal||0)>0 && entry.borrowerId){
          try{await addDoc(collection(db,'loan_additions'),{
            borrowerId:entry.borrowerId,borrowerName:entry.borrowerName,loanId:entry.borrowerId,
            amount:rd.loanBatch.additionsTotal,date:entry.date,remarks:'Restored from Ledger Trash',
            settlementBatchId:entry.settlementBatchId,createdAt:serverTimestamp(),createdBy:user?.uid||null
          });}catch{}
        }
        if(entry.settlementBatchId){
          try{
            const sibSnap2=await getDocs(query(collection(db,'finance_ledger_entries'),where('settlementBatchId','==',entry.settlementBatchId)));
            for(const sib of sibSnap2.docs){ if(sib.id!==entry.id) await updateDoc(doc(db,'finance_ledger_entries',sib.id),{deleted:false,deletedAt:null,deletedBy:null}); }
          }catch{}
        }
      }
      await updateDoc(doc(db,'finance_ledger_entries',entry.id),{
        deleted:false, deletedAt:null, deletedBy:null, revertedLinkedData:null, updatedAt:serverTimestamp(),
      });
      setTrashedEntries(prev=>prev.filter(e=>e.id!==entry.id));
      toast.success('Entry and linked records restored');
    }catch(err){toast.error('Restore failed: '+err.message);}finally{setDeleting(null);}
  }

  // Permanently removes a trashed entry — the soft-delete (deleteEntry above) only
  // marks it deleted:true so it can be restored; this is the actual, unrecoverable
  // Firestore delete the person asked for from the Trash view.
  async function permanentlyDelete(entry){
    if(!window.confirm(`Permanently delete this ledger entry? This cannot be undone.\n\n${entry.description||entry.category} — ${formatCurrency(entry.amount)}`)) return;
    setDeleting(entry.id);
    try{
      await deleteDoc(doc(db,'finance_ledger_entries',entry.id));
      setTrashedEntries(prev=>prev.filter(e=>e.id!==entry.id));
      toast.success('Entry permanently deleted');
    }catch(err){toast.error('Delete failed: '+err.message);}finally{setDeleting(null);}
  }

  async function emptyTrash(){
    if(trashedEntries.length===0) return;
    if(!window.confirm(`Permanently delete all ${trashedEntries.length} trashed entr${trashedEntries.length===1?'y':'ies'}? This cannot be undone.`)) return;
    setDeleting('__all__');
    try{
      await Promise.all(trashedEntries.map(e=>deleteDoc(doc(db,'finance_ledger_entries',e.id))));
      setTrashedEntries([]);
      toast.success('Trash emptied');
    }catch(err){toast.error('Failed to empty trash: '+err.message);}finally{setDeleting(null);}
  }

  const CATS=['All','Loan Interest','Deposit Interest','Loan Repayment','Deposit Received','Deposit Settlement','Expense','Other'];
  const filtered=entries.filter(e=>{
    const q=search.toLowerCase();
    return(
      (!q||e.description?.toLowerCase().includes(q)||e.category?.toLowerCase().includes(q)||e.borrowerName?.toLowerCase().includes(q)||(e.loanId||'').toLowerCase().includes(q))
      &&(tf==='All'||e.type===tf)
      &&(catFilter==='All'||e.category===catFilter)
      &&matchAmt(e)
    );
  });
  const totalC=entries.filter(e=>e.type==='Credit').reduce((s,e)=>s+(e.amount||0),0);
  const totalD=entries.filter(e=>e.type==='Debit').reduce((s,e)=>s+(e.amount||0),0);
  const net=totalC-totalD;

  // Split by module — same grouping logic as the Overall Dashboard (borrowerId =
  // Loan, depositId = Deposit, loanId = EMI, Finance Expense category = Expense)
  // so this view lines up with the dashboard's own numbers, not a different cut.
  const moduleGroups=[
    {key:'loan',label:'📋 Loan',match:e=>!!e.borrowerId,color:'#ff9500'},
    {key:'deposit',label:'🏦 Deposit',match:e=>!!e.depositId,color:'#bf5af2'},
    {key:'emi',label:'📆 EMI',match:e=>!!e.loanId,color:'#5e5ce6'},
    {key:'expense',label:'💸 Expense',match:e=>e.category==='Finance Expense',color:'#ff453a'},
  ].map(g=>{
    const rows=entries.filter(g.match);
    const c=rows.filter(e=>e.type==='Credit').reduce((s,e)=>s+(e.amount||0),0);
    const dd=rows.filter(e=>e.type==='Debit').reduce((s,e)=>s+(e.amount||0),0);
    return {...g,count:rows.length,credit:c,debit:dd};
  });

  if(loading)return <PageLoader stats={4}/>;
  return(
    <div className="page-enter">
      <PageHeader title="Ledger" subtitle="Complete financial audit trail with full edit & delete"
        action={<div style={{display:'flex',gap:8}}>
          <Button variant="secondary" onClick={()=>setShowTrash(s=>!s)}>
            🗑 {showTrash?'Back to Ledger':`Trash${trashedEntries.length>0?` (${trashedEntries.length})`:''}`}
          </Button>
          <Button onClick={openAdd}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Entry</Button>
        </div>}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Total Credits" value={formatCurrency(Math.round(totalC))} sub={`${entries.filter(e=>e.type==='Credit').length} entries`} color="#34c759"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>}/>
        <StatCard label="Total Debits" value={formatCurrency(Math.round(totalD))} sub={`${entries.filter(e=>e.type==='Debit').length} entries`} color="#ff3b30"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/></svg>}/>
        <StatCard label="Net Balance" value={formatCurrency(Math.round(Math.abs(net)))} sub={net>=0?'↑ Surplus':'↓ Deficit'} color={net>=0?'#34c759':'#ff3b30'}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
      </div>

      {/* Split by module — mirrors the Overall Dashboard's Loan/Deposit/EMI/Expense cut */}
      <Card style={{marginBottom:20}}>
        <SectionHeader title="Split by Module"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
          {moduleGroups.map(g=>(
            <div key={g.key} style={{padding:'12px 14px',borderRadius:10,background:'var(--bg-secondary)',borderLeft:`3px solid ${g.color}`}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',marginBottom:6}}>{g.label} <span style={{color:'var(--text-tertiary)',fontWeight:400}}>({g.count})</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5}}>
                <span style={{color:'#34c759',fontWeight:700}}>+{formatCurrency(Math.round(g.credit))}</span>
                <span style={{color:'#ff3b30',fontWeight:700}}>-{formatCurrency(Math.round(g.debit))}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {showTrash ? (
        <Card>
          {trashedEntries.length===0 ? (
            <div style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}>
              <div style={{fontSize:32,marginBottom:8}}>🗑</div>
              <p style={{fontSize:14}}>Trash is empty</p>
            </div>
          ) : (
            <>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
              <Button size="sm" onClick={emptyTrash} disabled={deleting==='__all__'}
                style={{background:'rgba(255,59,48,0.08)',color:'#ff3b30',border:'1px solid rgba(255,59,48,0.25)'}}>
                {deleting==='__all__'?'Emptying…':`🗑 Empty Trash (${trashedEntries.length})`}
              </Button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {trashedEntries.map(e=>(
                <div key={e.id} style={{display:'flex',alignItems:'center',gap:14,padding:'13px 16px',borderRadius:12,border:'1px solid rgba(0,0,0,0.07)',opacity:0.85}}>
                  <div style={{width:36,height:36,borderRadius:9,flexShrink:0,background:e.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>{e.type==='Credit'?'↑':'↓'}</div>
                  <div style={{flex:1,minWidth:200}}>
                    <div style={{fontWeight:600,fontSize:13.5}}>{e.description||e.category}</div>
                    <div style={{fontSize:11.5,color:'var(--text-secondary)',marginTop:2}}>{e.category} · {formatCurrency(e.amount)} · Deleted {e.deletedAt?.toDate?.()?.toLocaleDateString('en-IN')||'—'}</div>
                  </div>
                  <Button size="sm" onClick={()=>restoreEntry(e)} disabled={!!deleting}>{deleting===e.id?'Restoring…':'↩ Restore'}</Button>
                  <Button size="sm" onClick={()=>permanentlyDelete(e)} disabled={!!deleting}
                    style={{background:'rgba(255,59,48,0.08)',color:'#ff3b30',border:'1px solid rgba(255,59,48,0.25)'}}>
                    {deleting===e.id?'Deleting…':'🗑 Delete Permanently'}
                  </Button>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>
      ) : (
      <Card>
        <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search description, category, name…"/>
          <FilterTabs options={['All','Credit','Debit']} value={tf} onChange={setTf}/>
        </div>
        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
          {CATS.map(c=>(
            <button key={c} onClick={()=>setCatFilter(c)}
              style={{padding:'4px 12px',borderRadius:20,border:'1px solid',borderColor:catFilter===c?'#007aff':'rgba(0,0,0,0.08)',background:catFilter===c?'rgba(0,122,255,0.08)':'transparent',color:catFilter===c?'#007aff':'var(--text-secondary)',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
              {c}
            </button>
          ))}
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'rgba(118,118,128,0.06)'}}>
              {['Date','Type','Category','Description','Remarks','Party','Mode','Amount','Running Balance','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--divider)',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0?<tr><td colSpan={10} style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}><div style={{fontSize:32,marginBottom:8}}>📒</div><p style={{fontSize:14}}>No ledger entries found</p></td></tr>
              :(() => {
                let rb=0;
                return [...filtered].reverse().map(e=>{rb+=e.type==='Credit'?(e.amount||0):-(e.amount||0);return {...e,rb};}).reverse().map(e=>(
                  <tr key={e.id} style={{borderBottom:'1px solid var(--divider)',opacity:deleting===e.id?0.4:1,transition:'opacity 0.2s'}}
                    onMouseEnter={ev=>ev.currentTarget.style.background='rgba(0,122,255,0.02)'}
                    onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                    <td style={{padding:'11px 14px',fontSize:13,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{e.date||formatDate(e.createdAt)}</td>
                    <td style={{padding:'11px 14px'}}><span style={{padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600,background:e.type==='Credit'?'rgba(52,199,89,0.1)':'rgba(255,59,48,0.1)',color:e.type==='Credit'?'#1a7a34':'#c0392b'}}>{e.type}</span></td>
                    <td style={{padding:'11px 14px',fontSize:12,color:'#5856d6',maxWidth:120}}><span style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.category}</span></td>
                    <td style={{padding:'11px 14px',fontSize:13,color:'var(--text-primary)',maxWidth:180}}><p style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description}</p></td>
                    <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)',maxWidth:150}}><p style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={e.remarks||''}>{e.remarks||'—'}</p></td>
                    <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>{e.borrowerName||e.depositorName||e.partyName||'—'}</td>
                    <td style={{padding:'11px 14px',fontSize:12,color:'var(--text-secondary)'}}>{e.paymentMode||'—'}</td>
                    <td style={{padding:'11px 14px',fontSize:14,fontWeight:700,color:e.type==='Credit'?'#34c759':'#ff3b30',whiteSpace:'nowrap'}} className="num">{e.type==='Credit'?'+':'-'}{formatCurrency(e.amount)}</td>
                    <td style={{padding:'11px 14px',fontSize:13,fontWeight:600,color:e.rb>=0?'#34c759':'#ff3b30',whiteSpace:'nowrap'}} className="num">{formatCurrency(Math.round(Math.abs(e.rb)))}</td>
                    <td style={{padding:'11px 14px'}}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>openEdit(e)} title="Edit entry"
                          style={{width:30,height:30,borderRadius:8,border:'1px solid rgba(0,0,0,0.1)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#007aff',transition:'all 0.15s'}}
                          onMouseEnter={ev=>ev.currentTarget.style.background='rgba(0,122,255,0.08)'}
                          onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={()=>deleteEntry(e)} disabled={deleting===e.id} title="Delete entry"
                          style={{width:30,height:30,borderRadius:8,border:'1px solid rgba(255,59,48,0.2)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#ff3b30',transition:'all 0.15s'}}
                          onMouseEnter={ev=>ev.currentTarget.style.background='rgba(255,59,48,0.08)'}
                          onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        <p style={{fontSize:12,color:'var(--text-tertiary)',marginTop:12,textAlign:'right'}}>{filtered.length} of {entries.length} entries</p>
      </Card>
      )}

      <Modal open={showModal} onClose={()=>setShowModal(false)} title={editItem?'Edit Ledger Entry':'Add Ledger Entry'}
        footer={showModal&&(
          <div style={{display:'flex',gap:10,width:'100%'}}>
            <Button onClick={()=>saveEntry()} disabled={saving} style={{flex:1,justifyContent:'center'}}>{saving?'Saving…':editItem?'Update Entry':'Add Entry'}</Button>
            <Button variant="secondary" onClick={()=>setShowModal(false)}>Cancel</Button>
          </div>
        )}>
        <form onSubmit={saveEntry} style={{display:'flex',flexDirection:'column',gap:14}}>
          {editItem&&<div style={{padding:'10px 14px',background:'rgba(255,149,0,0.08)',borderRadius:10,border:'1px solid rgba(255,149,0,0.2)'}}>
            <p style={{fontSize:12,color:'#a05a00'}}>⚠️ Editing this entry will also update linked payment records if applicable.</p>
          </div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={lbl}>Type</label><select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={inp}><option>Credit</option><option>Debit</option></select></div>
            <div><label style={lbl}>Category</label><select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
              <option>Loan Interest</option><option>Deposit Interest</option><option>Loan Repayment</option><option>Deposit Received</option><option>Deposit Settlement</option><option>Expense</option><option>Other</option>
            </select></div>
          </div>
          <div><label style={lbl}>Description</label><input value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Transaction description…" required style={inp}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={lbl}>Amount (₹)</label><input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="0" required min="1" step="0.01" style={inp}/></div>
            <div><label style={lbl}>Payment Mode</label><select value={form.paymentMode} onChange={e=>setForm(p=>({...p,paymentMode:e.target.value}))} style={inp}><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></div>
          </div>
          <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={inp}/></div>
        </form>
      </Modal>
    </div>
  );
}
const lbl={fontSize:13,fontWeight:500,color:'var(--text-primary)',display:'block',marginBottom:6};
const inp={padding:'10px 12px',background:'var(--bg-input)',border:'1.5px solid var(--border-strong)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',width:'100%',fontFamily:'inherit'};
