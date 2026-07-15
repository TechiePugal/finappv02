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
      s=>{setEntries(scopeToUser(s.docs.map(d=>{
        const x=d.data();
        const time=x.createdAt?.seconds?new Date(x.createdAt.seconds*1000).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'';
        return {id:d.id,...x,time};
      }),user?.uid));setLoading(false);},
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

  const totalCredit=filtered.filter(e=>e.type==='Credit').reduce((s,e)=>s+(e.amount||0),0);
  const totalDebit=filtered.filter(e=>e.type==='Debit').reduce((s,e)=>s+(e.amount||0),0);
  const netPL=totalCredit-totalDebit;
  const milestones=filtered.filter(e=>e.type==='Milestone'); // lifecycle events — created/closed loans, deposits, EMI

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

      <div className="grid-4" style={{marginBottom:14}}>
        <StatCard label="Total Income" value={formatCurrency(Math.round(totalCredit))} color="#34c759"/>
        <StatCard label="Total Expense" value={formatCurrency(Math.round(totalDebit))} color="#ff3b30"/>
        <StatCard label="Net P&L" value={formatCurrency(Math.round(netPL))} color={netPL>=0?'#34c759':'#ff3b30'}/>
        <StatCard label="Lifecycle Events" value={milestones.length} sub={`${filtered.filter(e=>e.type!=='Milestone').length} transactions`} color="#5856d6"/>
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

      {/* Transaction list */}
      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Transaction Journal ({filtered.filter(e=>e.type!=='Milestone').length})</div>
        {filtered.filter(e=>e.type!=='Milestone').length===0?<div style={{textAlign:'center',padding:36,color:'var(--text-secondary)'}}>No transactions in this period.</div>:(
          <div style={{display:'grid',gap:6}}>
            {filtered.filter(e=>e.type!=='Milestone').map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,background:'rgba(0,0,0,0.02)',flexWrap:'wrap'}}>
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
