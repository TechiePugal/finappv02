import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {PageHeader,Card,Button,StatCard,SearchBar,FilterTabs,formatCurrency} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';
import {printJournalReport} from '../../utils/pdfReport';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';
import {ledgerDirection,summarizeLedger,flowColor,flowSign,FLOW_GREEN,FLOW_RED} from '../../utils/cashFlow';
import CashFlowCard from '../../components/finledger/CashFlowCard';

const PRESETS=['This Month','Last Month','This Year','Custom'];
// BUG FIX: ranges were built with new Date(y,m,1).toISOString() split on 'T'.
// toISOString() converts to UTC first, so in India (UTC+5:30) local midnight of
// the 1st becomes 18:30 UTC of the PREVIOUS day — "This Month" started on the
// last day of last month (pulling that day's entries in) and ended a day early
// (dropping the last day of the month). Format the LOCAL date instead.
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export default function Journal(){
  const {user}=useAuth();
  const[entries,setEntries]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[typeF,setTypeF]=useState('All'); // All | Money In | Money Out — by real money direction, not the raw Credit/Debit label
  const[preset,setPreset]=useState('This Month');
  const now=new Date();
  const[fromDate,setFromDate]=useState(ymd(new Date(now.getFullYear(),now.getMonth(),1)));
  const[toDate,setToDate]=useState(ymd(new Date(now.getFullYear(),now.getMonth()+1,0)));

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
    if(p==='This Month'){setFromDate(ymd(new Date(n.getFullYear(),n.getMonth(),1)));setToDate(ymd(new Date(n.getFullYear(),n.getMonth()+1,0)));}
    else if(p==='Last Month'){setFromDate(ymd(new Date(n.getFullYear(),n.getMonth()-1,1)));setToDate(ymd(new Date(n.getFullYear(),n.getMonth(),0)));}
    else if(p==='This Year'){setFromDate(ymd(new Date(n.getFullYear(),0,1)));setToDate(ymd(new Date(n.getFullYear(),11,31)));}
    // Custom leaves fromDate/toDate as-is for manual editing
  }

  // ── Filtering ── Money In / Money Out is decided by what actually happened
  // (utils/cashFlow.js ledgerDirection), so a loan/EMI being GIVEN (a lifecycle
  // "Created" row) counts as money out and a deposit being RECEIVED as money in,
  // instead of vanishing from the Credit/Debit tabs the way they used to.
  const filtered=entries.filter(e=>{
    const d=e.date||'';
    const inRange=(!fromDate||d>=fromDate)&&(!toDate||d<=toDate);
    const q=search.trim().toLowerCase();
    const mq=!q||[e.description,e.category,e.borrowerName,e.paymentMode].some(v=>String(v||'').toLowerCase().includes(q));
    const dir=ledgerDirection(e);
    const mt=typeF==='All'||(typeF==='Money In'&&dir==='in')||(typeF==='Money Out'&&dir==='out');
    return inRange&&mq&&mt;
  });

  // ── SUMMARY — computed from EXACTLY the rows listed below (date range +
  // search + direction filter all apply), so what the summary says and what the
  // list shows can never disagree.
  //   Money In / Money Out / Net  — every real rupee movement (see cashFlow.js)
  //   Total Income   = interest collected IN CASH (loan + EMI) + fine income
  //   Total Outgoing = interest paid IN CASH to depositors
  //   Total Expense  = operational expenses
  //   Net Profit     = Total Income − Total Expense − Total Outgoing
  // 'Interest Added to Loan' / 'Interest Compounded' (folded into principal, no
  // cash moved) are excluded from all of it.
  const flow=summarizeLedger(filtered);
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

  // Money In / Out by category (real movements only)
  const byCategory={};
  filtered.forEach(e=>{
    const dir=ledgerDirection(e);
    if(dir==='none')return;
    const k=e.category||'Other';
    if(!byCategory[k])byCategory[k]={credit:0,debit:0};
    if(dir==='in')byCategory[k].credit+=(e.amount||0);
    else byCategory[k].debit+=(e.amount||0);
  });

  const activeChips=[
    {k:'range',on:true,label:`📅 ${fromDate||'start'} → ${toDate||'today'}`},
    {k:'dir',on:typeF!=='All',label:typeF==='Money In'?'⬆ Money In only':'⬇ Money Out only'},
    {k:'q',on:!!search.trim(),label:`🔍 “${search.trim()}”`},
  ].filter(c=>c.on);

  function exportCsv(){
    const head=['Date','Direction','Category','Description','Mode','Signed Amount'];
    const rows=filtered.map(e=>{
      const dir=ledgerDirection(e);
      const amt=e.amount||0;
      return [e.date||'',dir==='in'?'Money In':dir==='out'?'Money Out':'Non-cash',e.category||'',e.description||'',e.paymentMode||'',dir==='out'?-amt:dir==='in'?amt:0];
    });
    const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\n');
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`journal-${fromDate}_to_${toDate}.csv`;a.click();URL.revokeObjectURL(a.href);
  }

  const money=n=>formatCurrency(Math.round(Math.abs(n||0)));

  if(loading)return<PageLoader stats={4}/>;
  return(
    <div>
      <PageHeader title="Journal" subtitle="Complete transaction history, expenses and Profit &amp; Loss — all in one place"
        action={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button onClick={()=>printJournalReport(filtered, fromDate, toDate)}>🖨 Export PDF</Button></div>}/>

      {/* FILTERS FIRST — the summary right below always describes exactly what is filtered here */}
      <Card style={{marginBottom:14}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <FilterTabs options={PRESETS} value={preset} onChange={applyPreset}/>
          <input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPreset('Custom');}}
            style={{padding:'7px 10px',borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <span style={{fontSize:12,color:'var(--text-secondary)'}}>to</span>
          <input type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPreset('Custom');}}
            style={{padding:'7px 10px',borderRadius:9,border:'1px solid rgba(0,0,0,0.1)',fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <SearchBar value={search} onChange={setSearch} placeholder="Search description, category, borrower…"/>
          <FilterTabs options={['All','Money In','Money Out']} value={typeF} onChange={setTypeF}/>
        </div>
      </Card>

      {/* SUMMARY — first section, follows the filters above exactly */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,margin:'4px 2px 10px'}}>
        <div style={{fontSize:15,fontWeight:800,color:'var(--text-primary)'}}>Summary <span style={{fontWeight:500,fontSize:12.5,color:'var(--text-secondary)'}}>· {filtered.length} transaction{filtered.length!==1?'s':''} matching your filters</span></div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {activeChips.map(c=><span key={c.k} style={{fontSize:11.5,fontWeight:600,padding:'3px 10px',borderRadius:99,background:'rgba(0,122,255,0.08)',color:'#0a64d6'}}>{c.label}</span>)}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:14}}>
        <StatCard label="Money In" value={`+${money(flow.totalIn)}`} sub="Everything received" color={FLOW_GREEN}/>
        <StatCard label="Money Out" value={`−${money(flow.totalOut)}`} sub="Everything paid / given out" color={FLOW_RED}/>
        <StatCard label="Net Cash Flow" value={`${flow.net>=0?'+':'−'}${money(flow.net)}`} sub="Money In − Money Out" color={flow.net>=0?FLOW_GREEN:FLOW_RED}/>
        <StatCard label="Net Profit" value={`${netProfit>=0?'+':'−'}${money(netProfit)}`} sub="Income − (Expense + Interest paid)" color={netProfit>=0?FLOW_GREEN:FLOW_RED}/>
      </div>

      <CashFlowCard title="Money In vs Money Out — itemised" subtitle="Same rules as the Overall and Monthly dashboards." flow={flow} style={{marginBottom:14}}
        note={flow.nonCash>0?`Interest of ${money(flow.nonCash)} was added to loan/deposit principal in these rows — no money moved, so it is not counted above.`:null}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:14,marginBottom:14}}>
        <StatCard label="Total Income" value={money(totalIncome)} sub="Interest collected + fine (loan+EMI)" color={FLOW_GREEN}/>
        <StatCard label="Total Outgoing" value={money(totalOutgoing)} sub="Interest paid to depositors" color="#5e5ce6"/>
        <StatCard label="Total Expense" value={money(totalExpense)} sub="Operational expenses" color={FLOW_RED}/>
        <StatCard label="Lifecycle Events" value={milestones.length} sub="Accounts created / closed" color="#bf5af2"/>
      </div>

      {/* Money in / out by category */}
      <Card style={{marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Money In / Out by Category</div>
        <div style={{display:'grid',gap:8}}>
          {Object.entries(byCategory).sort((a,b)=>(b[1].credit-b[1].debit)-(a[1].credit-a[1].debit)).map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:9,background:'rgba(0,0,0,0.025)',flexWrap:'wrap',gap:6}}>
              <span style={{fontSize:13,fontWeight:600}}>{k}</span>
              <div style={{display:'flex',gap:16,fontSize:12.5}}>
                <span style={{color:FLOW_GREEN,fontWeight:600}}>{v.credit?`+${money(v.credit)}`:'—'}</span>
                <span style={{color:FLOW_RED,fontWeight:600}}>{v.debit?`−${money(v.debit)}`:'—'}</span>
                <span style={{fontWeight:800,color:(v.credit-v.debit)>=0?FLOW_GREEN:FLOW_RED,minWidth:96,textAlign:'right'}}>{(v.credit-v.debit)>=0?'+':'−'}{money(v.credit-v.debit)}</span>
              </div>
            </div>
          ))}
          {Object.keys(byCategory).length===0&&<div style={{color:'var(--text-secondary)',fontSize:13,padding:'10px 0'}}>No money movement in this selection.</div>}
        </div>
      </Card>

      {/* Lifecycle Events — Loan/Deposit/EMI Created & Closed */}
      {milestones.length>0&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Lifecycle Events</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>Accounts created or closed in this selection. Opening an account moves money (loan / EMI given = out, deposit received = in) and is counted in the summary above; closing events are status changes only.</div>
          <div style={{display:'grid',gap:6}}>
            {milestones.map(m=>{
              const isClosed=m.category?.includes('Closed');
              const dir=ledgerDirection(m);
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
                  <span style={{fontSize:13,fontWeight:700,color:dir==='none'?'var(--text-primary)':flowColor(dir)}}>{flowSign(dir)}{money(m.amount)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Transaction list — every row: money in = + green, money out = − red,
          interest added to principal (no money moved) = neutral, no sign. */}
      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Transaction Journal ({filtered.length})</div>
        {filtered.length===0?<div style={{textAlign:'center',padding:36,color:'var(--text-secondary)'}}>No transactions in this period.</div>:(
          <div style={{display:'grid',gap:6}}>
            {filtered.map(e=>{
              const dir=ledgerDirection(e);
              const col=dir==='none'?'#5856D6':flowColor(dir);
              return(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,background:dir==='in'?'rgba(52,199,89,0.06)':dir==='out'?'rgba(255,59,48,0.05)':'rgba(88,86,214,0.05)',borderLeft:`3px solid ${col}`,flexWrap:'wrap'}}>
                <div style={{width:82,flexShrink:0}}>
                  <div style={{fontSize:11.5,color:'var(--text-secondary)'}}>{e.date||'—'}</div>
                  {e.time&&<div style={{fontSize:9.5,color:'var(--text-tertiary)',marginTop:1}}>{e.time}</div>}
                </div>
                <span style={{fontSize:10.5,fontWeight:800,padding:'2px 9px',borderRadius:99,background:col+'1f',color:col,minWidth:68,textAlign:'center'}}>{dir==='in'?'MONEY IN':dir==='out'?'MONEY OUT':'NON-CASH'}</span>
                <span style={{fontSize:11.5,color:'var(--text-secondary)',minWidth:110}}>{e.category||'—'}</span>
                <span style={{flex:1,fontSize:13,minWidth:150}}>{e.description||'—'}</span>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{e.paymentMode||''}</span>
                <span className="num" style={{fontSize:14,fontWeight:800,color:col,minWidth:110,textAlign:'right'}}>{flowSign(dir)}{money(e.amount)}</span>
              </div>
            );})}
          </div>
        )}
      </Card>
    </div>
  );
}
