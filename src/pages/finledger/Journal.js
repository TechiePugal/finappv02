import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {PageHeader,Card,Badge,Button,StatCard,SearchBar,FilterTabs,formatCurrency} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';
import {printJournalReport} from '../../utils/pdfReport';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

const PRESETS=['This Month','Last Month','This Year','Custom'];

export default function Journal(){
  const {user}=useAuth();
  const[entries,setEntries]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[typeF,setTypeF]=useState('All');
  const[preset,setPreset]=useState('This Month');
  const now=new Date();
  const[fromDate,setFromDate]=useState(new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0]);
  const[toDate,setToDate]=useState(new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split('T')[0]);

  useEffect(()=>{
    const u=onSnapshot(query(collection(db,'finance_ledger_entries'),orderBy('date','desc')),
      s=>{
        // BUG FIX: this used to load EVERY doc regardless of `deleted` — so an
        // entry that was undone/moved to Trash in the Ledger (soft-deleted,
        // same as everywhere else in the app) kept counting here forever. A
        // settlement that was undone still inflated Total Income on this page
        // even though the Ledger itself correctly stopped showing it.
        const all=scopeToUser(s.docs.map(d=>{
          const x=d.data();
          const time=x.createdAt?.seconds?new Date(x.createdAt.seconds*1000).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'';
          return {id:d.id,...x,time};
        }),user?.uid);
        setEntries(all.filter(e=>!e.deleted));
        setLoading(false);
      },
      ()=>setLoading(false));
    return()=>u();
  },[]);

  function applyPreset(p){
    setPreset(p);
    const n=new Date();
    if(p==='This Month'){setFromDate(new Date(n.getFullYear(),n.getMonth(),1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),n.getMonth()+1,0).toISOString().split('T')[0]);}
    else if(p==='Last Month'){setFromDate(new Date(n.getFullYear(),n.getMonth()-1,1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),n.getMonth(),0).toISOString().split('T')[0]);}
    else if(p==='This Year'){setFromDate(new Date(n.getFullYear(),0,1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),11,31).toISOString().split('T')[0]);}
    // Custom leaves fromDate/toDate as-is for manual editing
  }

  const filtered=entries.filter(e=>{
    const d=e.date||'';
    const inRange=(!fromDate||d>=fromDate)&&(!toDate||d<=toDate);
    const q=search.trim().toLowerCase();
    const mq=!q||[e.description,e.category,e.borrowerName,e.paymentMode].some(v=>String(v||'').toLowerCase().includes(q));
    const mt=typeF==='All'||e.type===typeF;
    return inRange&&mq&&mt;
  });

  // ── Total Income / Total Outgoing / Net Profit — must mean the SAME thing
  // here as on the Overall Dashboard and the Ledger's own Net Profit tile, not
  // a generic "all credits minus all debits" (that was the old totalCredit/
  // totalDebit/netPL below, which lumped genuinely different things together:
  // a deposit CREATED, a loan repayment coming back, an interest payout given
  // to a depositor, and an operational expense were all just "a debit").
  //   Total Income   = interest actually collected IN CASH (loan + EMI) + fine
  //                     income (loan + EMI). PROFIT FIX: 'Interest Added to
  //                     Loan' (compounded back into the loan's principal, no
  //                     cash received) is deliberately EXCLUDED here — it isn't
  //                     profit yet, only a bigger balance to be collected later.
  //                     Only the 'Loan Interest' category (the cash-collected
  //                     side of Interest Collection) counts.
  //   Total Outgoing = interest actually PAID IN CASH to depositors. Symmetric
  //                     fix: 'Interest Compounded' (folded back into a
  //                     deposit's principal, no cash paid out) is excluded —
  //                     it isn't a real expense yet either.
  //   Total Expense  = real operational costs only (Expense / Finance Expense
  //                     category) — not every debit entry
  //   Net Profit     = Total Income − Total Expense − Total Outgoing
  const nonMilestone=filtered.filter(e=>e.type!=='Milestone');
  const loanInterestCredit=nonMilestone.filter(e=>e.type==='Credit'&&e.category==='Loan Interest').reduce((s,e)=>s+(e.amount||0),0);
  const emiCollectionCredit=nonMilestone.filter(e=>e.type==='Credit'&&e.category==='EMI Collection').reduce((s,e)=>s+(e.amount||0),0);
  const loanFineIncome=nonMilestone.filter(e=>e.category==='Fine Income'&&!!e.borrowerId).reduce((s,e)=>s+(e.amount||0),0);
  const emiFineIncome=nonMilestone.filter(e=>e.category==='Fine Income'&&!!e.loanId).reduce((s,e)=>s+(e.amount||0),0);
  const totalIncome=loanInterestCredit+emiCollectionCredit+loanFineIncome+emiFineIncome;
  const totalOutgoing=nonMilestone.filter(e=>e.type==='Debit'&&e.category==='Deposit Settlement').reduce((s,e)=>s+(e.amount||0),0);
  const totalExpense=nonMilestone.filter(e=>e.type==='Debit'&&['Expense','Finance Expense'].includes(e.category)).reduce((s,e)=>s+(e.amount||0),0);
  const netProfit=totalIncome-totalExpense-totalOutgoing;
  const milestones=filtered.filter(e=>e.type==='Milestone'); // lifecycle events — created/closed loans, deposits, EMI
  const milestonesValue=milestones.reduce((s,m)=>s+(m.amount||0),0);

  // Category breakdown for P&L
  const byCategory={};
  filtered.filter(e=>e.type!=='Milestone').forEach(e=>{
    const k=e.category||'Other';
    if(!byCategory[k])byCategory[k]={credit:0,debit:0};
    if(e.type==='Credit')byCategory[k].credit+=(e.amount||0);
    else byCategory[k].debit+=(e.amount||0);
  });

  function exportCsv(){
    const head=['Date','Type','Category','Description','Mode','Amount'];
    const rows=filtered.map(e=>[e.date||'',e.type||'',e.category||'',e.description||'',e.paymentMode||'',e.amount||0]);
    const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`journal-${fromDate}_to_${toDate}.csv`;a.click();URL.revokeObjectURL(a.href);
  }


  if(loading)return<PageLoader stats={4}/>;
  return(
    <div>
      <PageHeader title="Journal" subtitle="Complete transaction history, expenses and Profit &amp; Loss — all in one place"
        action={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button onClick={()=>printJournalReport(filtered, fromDate, toDate)}>🖨 Export PDF</Button></div>}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14,marginBottom:14}}>
        <StatCard label="Total Income" value={formatCurrency(Math.round(totalIncome))} sub="Interest collected + fine (loan+EMI)" color="#34c759"/>
        <StatCard label="Total Outgoing" value={formatCurrency(Math.round(totalOutgoing))} sub="Interest given to depositors" color="#5e5ce6"/>
        <StatCard label="Total Expense" value={formatCurrency(Math.round(totalExpense))} sub="Operational expenses" color="#ff3b30"/>
        <StatCard label="Net Profit" value={`${netProfit>=0?'+':'-'}${formatCurrency(Math.round(Math.abs(netProfit)))}`} sub="Income − (Expense + Outgoing)" color={netProfit>=0?'#34c759':'#ff3b30'}/>
        <StatCard label="Lifecycle Events" value={milestones.length} sub={`${formatCurrency(Math.round(milestonesValue))} total value`} color="#bf5af2"/>
      </div>

      <Card style={{marginBottom:14}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <FilterTabs options={PRESETS} value={preset} onChange={applyPreset}/>
          <input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPreset('Custom');}}
            style={{padding:'7px 10px',borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <span style={{fontSize:12,color:'var(--text-secondary)'}}>to</span>
          <input type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPreset('Custom');}}
            style={{padding:'7px 10px',borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <SearchBar value={search} onChange={setSearch} placeholder="Search description, category, borrower…"/>
          <FilterTabs options={['All','Credit','Debit']} value={typeF} onChange={setTypeF}/>
        </div>
      </Card>

      {/* P&L by category */}
      <Card style={{marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Profit &amp; Loss by Category</div>
        <div style={{display:'grid',gap:8}}>
          {Object.entries(byCategory).sort((a,b)=>(b[1].credit-b[1].debit)-(a[1].credit-a[1].debit)).map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:9,background:'rgba(0,0,0,0.025)'}}>
              <span style={{fontSize:13,fontWeight:600}}>{k}</span>
              <div style={{display:'flex',gap:16,fontSize:12.5}}>
                <span style={{color:'#34c759'}}>+{formatCurrency(Math.round(v.credit))}</span>
                <span style={{color:'#ff3b30'}}>-{formatCurrency(Math.round(v.debit))}</span>
                <span style={{fontWeight:800,color:(v.credit-v.debit)>=0?'#34c759':'#ff3b30',minWidth:90,textAlign:'right'}}>{formatCurrency(Math.round(v.credit-v.debit))}</span>
              </div>
            </div>
          ))}
          {Object.keys(byCategory).length===0&&<div style={{color:'var(--text-secondary)',fontSize:13,padding:'10px 0'}}>No entries in this period.</div>}
        </div>
      </Card>

      {/* Lifecycle Events — Loan/Deposit/EMI Created & Closed */}
      {milestones.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Lifecycle Events</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>Loans, deposits and EMI accounts created or closed in this period — kept separate from income/expense totals.</div>
          <div style={{display:'grid',gap:6}}>
            {milestones.map(m=>{
              const isClosed=m.category?.includes('Closed');
              const icon=m.category?.includes('Loan')&&!m.category?.includes('EMI')?'💰':m.category?.includes('Deposit')?'🏦':'📅';
              return(
                <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,background:isClosed?'rgba(255,149,0,0.06)':'rgba(88,86,214,0.06)',flexWrap:'wrap'}}>
                  <div style={{width:82,flexShrink:0}}>
                    <div style={{fontSize:11.5,color:'var(--text-secondary)'}}>{m.date||'—'}</div>
                    {m.time&&<div style={{fontSize:9.5,color:'var(--text-tertiary)',marginTop:1}}>{m.time}</div>}
                  </div>
                  <span style={{fontSize:16}}>{icon}</span>
                  <span style={{fontSize:10.5,fontWeight:700,padding:'2px 9px',borderRadius:99,background:isClosed?'rgba(255,149,0,0.15)':'rgba(88,86,214,0.15)',color:isClosed?'#92400E':'#5856D6'}}>{m.category}</span>
                  <span style={{flex:1,fontSize:13,minWidth:150}}>{m.description}</span>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{formatCurrency(Math.round(m.amount||0))}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Transaction list — now includes Milestones (Loan Created, Deposit Created,
          EMI Loan Created, closures, etc.) inline instead of hiding them in a
          separate section only; the "Lifecycle Events" card above stays as a
          quick highlight, but the full journal below is the complete record. */}
      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Transaction Journal ({filtered.length})</div>
        {filtered.length===0?<div style={{textAlign:'center',padding:36,color:'var(--text-secondary)'}}>No transactions in this period.</div>:(
          <div style={{display:'grid',gap:6}}>
            {filtered.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,background:e.type==='Milestone'?'rgba(88,86,214,0.05)':'rgba(0,0,0,0.02)',flexWrap:'wrap'}}>
                <div style={{width:82,flexShrink:0}}>
                  <div style={{fontSize:11.5,color:'var(--text-secondary)'}}>{e.date||'—'}</div>
                  {e.time&&<div style={{fontSize:9.5,color:'var(--text-tertiary)',marginTop:1}}>{e.time}</div>}
                </div>
                <Badge label={e.type==='Milestone'?e.category:e.type} type={e.type==='Credit'?'success':e.type==='Milestone'?'info':'danger'}/>
                <span style={{fontSize:11.5,color:'var(--text-secondary)',minWidth:110}}>{e.category||'—'}</span>
                <span style={{flex:1,fontSize:13,minWidth:150}}>{e.description||'—'}</span>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{e.paymentMode||''}</span>
                <span style={{fontSize:14,fontWeight:700,color:e.type==='Credit'?'#34c759':e.type==='Milestone'?'#5856D6':'#ff3b30',minWidth:100,textAlign:'right'}}>{e.type==='Milestone'?'':e.type==='Credit'?'+':'-'}{formatCurrency(Math.round(e.amount||0))}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
