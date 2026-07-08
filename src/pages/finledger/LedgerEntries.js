import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,deleteDoc,doc,query,orderBy,serverTimestamp} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,StatCard,Button,SearchBar,FilterTabs,Modal,formatCurrency,formatDate,Loader,SectionHeader} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';

export default function LedgerEntries(){
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

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db,'finance_ledger_entries'),orderBy('createdAt','desc')),
      snap=>{setEntries(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
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
        await addDoc(collection(db,'finance_ledger_entries'),data);
        toast.success('Entry added!');
      }
      setShowModal(false);
      // Use onSnapshot - auto refreshes, no manual load needed
    }catch(err){toast.error('Failed: '+err.message);}finally{setSaving(false);}
  }

  async function deleteEntry(entry){
    if(!window.confirm(`Delete this ${entry.type} entry of ${formatCurrency(entry.amount)}?\n\nNote: This will NOT automatically revert linked interest/payment records.`))return;
    setDeleting(entry.id);
    try{
      await deleteDoc(doc(db,'finance_ledger_entries',entry.id));
      // If linked to a payment, mark it unpaid
      if(entry.linkedPaymentId){
        try{await updateDoc(doc(db,'borrower_interest_payments',entry.linkedPaymentId),{status:'Unpaid',amountPaid:0,paymentDate:null,updatedAt:serverTimestamp()});}catch{}
      }
      if(entry.linkedDepositPaymentId){
        try{await updateDoc(doc(db,'deposit_payments',entry.linkedDepositPaymentId),{status:'Unpaid',amountPaid:0,paymentDate:null,updatedAt:serverTimestamp()});}catch{}
      }
      if(entry.linkedRepaymentId){
        try{await updateDoc(doc(db,'loan_repayments',entry.linkedRepaymentId),{deleted:true,updatedAt:serverTimestamp()});}catch{}
      }
      setEntries(prev=>prev.filter(e=>e.id!==entry.id));
      toast.success('Entry deleted and linked records reverted');
    }catch(err){toast.error('Delete failed: '+err.message);}finally{setDeleting(null);}
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

  if(loading)return <PageLoader stats={4}/>;
  return(
    <div className="page-enter">
      <PageHeader title="Ledger" subtitle="Complete financial audit trail with full edit & delete"
        action={<Button onClick={openAdd}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Entry</Button>}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Total Credits" value={formatCurrency(Math.round(totalC))} sub={`${entries.filter(e=>e.type==='Credit').length} entries`} color="#34c759"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>}/>
        <StatCard label="Total Debits" value={formatCurrency(Math.round(totalD))} sub={`${entries.filter(e=>e.type==='Debit').length} entries`} color="#ff3b30"
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/></svg>}/>
        <StatCard label="Net Balance" value={formatCurrency(Math.round(Math.abs(net)))} sub={net>=0?'↑ Surplus':'↓ Deficit'} color={net>=0?'#34c759':'#ff3b30'}
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
      </div>

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
              {['Date','Type','Category','Description','Party','Mode','Amount','Running Balance','Actions'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:'1px solid var(--divider)',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0?<tr><td colSpan={9} style={{padding:48,textAlign:'center',color:'var(--text-tertiary)'}}><div style={{fontSize:32,marginBottom:8}}>📒</div><p style={{fontSize:14}}>No ledger entries found</p></td></tr>
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
