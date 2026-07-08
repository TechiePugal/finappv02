import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {useAuth} from '../../contexts/AuthContext';
import {Card,PageHeader,Badge,Button} from '../../components/chitfund/UI';

const tokens={blue:'#007AFF',green:'#34C759',red:'#FF3B30',purple:'#5856D6',amber:'#FF9500',text:'#1C1C1E',textSub:'#6B7280',textMuted:'#9CA3AF',border:'rgba(0,0,0,0.08)',slateLight:'#F9F9FB',surface:'#fff'};
const fmt=v=>'₹'+Math.round(Math.abs(v||0)).toLocaleString('en-IN');
const PRESETS=['This Month','Last Month','This Year','Custom'];

export default function CFJournal(){
  const {user}=useAuth();
  const[entries,setEntries]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[typeF,setTypeF]=useState('All');
  const[sourceF,setSourceF]=useState('All'); // All / Formed / Joined
  const[preset,setPreset]=useState('This Month');
  const now=new Date();
  const[fromDate,setFromDate]=useState(new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0]);
  const[toDate,setToDate]=useState(new Date(now.getFullYear(),now.getMonth()+1,0).toISOString().split('T')[0]);

  useEffect(()=>{
    if(!user)return;
    let ledgerRows=[],paymentRows=[],chitNames={},otherNames={};
    async function load(){
      setLoading(true);
      const [chitsSnap,othersSnap,ledgerSnap,paySnap]=await Promise.all([
        getDocs(query(collection(db,'chit_master'))),
        getDocs(query(collection(db,'chit_others'))),
        getDocs(query(collection(db,'chit_ledger_entries'))),
        getDocs(query(collection(db,'chit_others_payments'))),
      ]);
      chitsSnap.docs.forEach(d=>{chitNames[d.id]=d.data().companyName||'Chit';});
      othersSnap.docs.forEach(d=>{otherNames[d.id]=d.data().chitName||'Joined Chit';});

      ledgerRows=ledgerSnap.docs.map(d=>{
        const x=d.data();
        return{
          id:d.id, date:x.date||(x.createdAt?.seconds?new Date(x.createdAt.seconds*1000).toISOString().split('T')[0]:''),
          type:(x.debit>0)?'Debit':'Credit', category:x.type||'Other', source:'Formed',
          chitName:chitNames[x.chitId]||'Formed Chit',
          description:`${x.type||'Entry'} — Auction #${x.auctionNumber||''}`,
          amount:x.amount||Math.max(x.debit||0,x.credit||0),
        };
      });

      paymentRows=[];
      paySnap.docs.forEach(d=>{
        const x=d.data();
        const dt=x.month?x.month+'-01':(x.createdAt?.seconds?new Date(x.createdAt.seconds*1000).toISOString().split('T')[0]:'');
        const name=otherNames[x.otherId]||'Joined Chit';
        paymentRows.push({
          id:d.id+'_pay', date:dt, type:'Debit', category:'Chit Subscription (Joined)', source:'Joined',
          chitName:name, description:`Subscription paid — ${x.month||''}`, amount:x.amount||0,
        });
        if(x.iWon&&x.prizeReceived>0){
          paymentRows.push({
            id:d.id+'_prize', date:dt, type:'Credit', category:'Chit Prize Received (Joined)', source:'Joined',
            chitName:name, description:`Prize received — ${x.month||''}`, amount:x.prizeReceived||0,
          });
        }
      });

      setEntries([...ledgerRows,...paymentRows]);
      setLoading(false);
    }
    load();
  },[user]);

  function applyPreset(p){
    setPreset(p);
    const n=new Date();
    if(p==='This Month'){setFromDate(new Date(n.getFullYear(),n.getMonth(),1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),n.getMonth()+1,0).toISOString().split('T')[0]);}
    else if(p==='Last Month'){setFromDate(new Date(n.getFullYear(),n.getMonth()-1,1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),n.getMonth(),0).toISOString().split('T')[0]);}
    else if(p==='This Year'){setFromDate(new Date(n.getFullYear(),0,1).toISOString().split('T')[0]);setToDate(new Date(n.getFullYear(),11,31).toISOString().split('T')[0]);}
  }

  const filtered=entries.filter(e=>{
    const d=e.date||'';
    const inRange=(!fromDate||d>=fromDate)&&(!toDate||d<=toDate);
    const q=search.trim().toLowerCase();
    const mq=!q||[e.description,e.category,e.chitName].some(v=>String(v||'').toLowerCase().includes(q));
    const mt=typeF==='All'||e.type===typeF;
    const ms=sourceF==='All'||e.source===sourceF;
    return inRange&&mq&&mt&&ms;
  }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));

  const totalCredit=filtered.filter(e=>e.type==='Credit').reduce((s,e)=>s+(e.amount||0),0);
  const totalDebit=filtered.filter(e=>e.type==='Debit').reduce((s,e)=>s+(e.amount||0),0);
  const netPL=totalCredit-totalDebit;

  const byCategory={};
  filtered.forEach(e=>{
    const k=e.category||'Other';
    if(!byCategory[k])byCategory[k]={credit:0,debit:0};
    if(e.type==='Credit')byCategory[k].credit+=(e.amount||0);
    else byCategory[k].debit+=(e.amount||0);
  });

  function exportCsv(){
    const head=['Date','Source','Chit','Type','Category','Description','Amount'];
    const rows=filtered.map(e=>[e.date||'',e.source,e.chitName,e.type,e.category,e.description,e.amount]);
    const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`chit-journal-${fromDate}_to_${toDate}.csv`;a.click();URL.revokeObjectURL(a.href);
  }

  if(loading)return<div style={{padding:40,textAlign:'center',color:tokens.textSub}}>Loading journal…</div>;
  return(
    <div>
      <PageHeader title="Journal" subtitle="Complete transaction history — formed and joined chits combined"
        action={<Button variant="secondary" onClick={exportCsv}>Export CSV</Button>}/>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:14}}>
        {[
          {l:'Total Income',v:fmt(totalCredit),c:tokens.green},
          {l:'Total Outflow',v:fmt(totalDebit),c:tokens.red},
          {l:'Net P&L',v:fmt(netPL),c:netPL>=0?tokens.green:tokens.red},
          {l:'Entries',v:filtered.length,c:tokens.purple},
        ].map((s,i)=>(
          <div key={i} style={{background:tokens.surface,border:`1px solid ${tokens.border}`,borderRadius:14,padding:'14px 16px'}}>
            <div style={{fontSize:11,color:tokens.textSub,fontWeight:600,textTransform:'uppercase'}}>{s.l}</div>
            <div style={{fontSize:20,fontWeight:900,color:s.c,marginTop:4}}>{s.v}</div>
          </div>
        ))}
      </div>

      <Card style={{marginBottom:14}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {PRESETS.map(p=>(
            <button key={p} onClick={()=>applyPreset(p)} style={{padding:'6px 14px',borderRadius:8,border:'none',background:preset===p?'#fff':'transparent',color:preset===p?tokens.text:tokens.textSub,fontWeight:preset===p?600:400,fontSize:12.5,cursor:'pointer',fontFamily:'inherit',boxShadow:preset===p?'0 1px 4px rgba(0,0,0,0.12)':'none'}}>{p}</button>
          ))}
          <input type="date" value={fromDate} onChange={e=>{setFromDate(e.target.value);setPreset('Custom');}} style={{padding:'7px 10px',borderRadius:9,border:`1px solid ${tokens.border}`,fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <span style={{fontSize:12,color:tokens.textSub}}>to</span>
          <input type="date" value={toDate} onChange={e=>{setToDate(e.target.value);setPreset('Custom');}} style={{padding:'7px 10px',borderRadius:9,border:`1px solid ${tokens.border}`,fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search chit, category, description…" style={{flex:'1 1 180px',minWidth:160,padding:'7px 12px',borderRadius:9,border:`1px solid ${tokens.border}`,fontSize:12.5,fontFamily:'inherit',outline:'none'}}/>
          <select value={sourceF} onChange={e=>setSourceF(e.target.value)} style={{padding:'7px 10px',borderRadius:9,border:`1px solid ${tokens.border}`,fontSize:12.5,fontFamily:'inherit',cursor:'pointer'}}>
            <option value="All">All Chits</option><option value="Formed">Formed Only</option><option value="Joined">Joined Only</option>
          </select>
          <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={{padding:'7px 10px',borderRadius:9,border:`1px solid ${tokens.border}`,fontSize:12.5,fontFamily:'inherit',cursor:'pointer'}}>
            <option value="All">All Types</option><option value="Credit">Credit</option><option value="Debit">Debit</option>
          </select>
        </div>
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:tokens.text}}>Profit &amp; Loss by Category</div>
        <div style={{display:'grid',gap:8}}>
          {Object.entries(byCategory).sort((a,b)=>(b[1].credit-b[1].debit)-(a[1].credit-a[1].debit)).map(([k,v])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',borderRadius:9,background:tokens.slateLight}}>
              <span style={{fontSize:13,fontWeight:600,color:tokens.text}}>{k}</span>
              <div style={{display:'flex',gap:16,fontSize:12.5}}>
                <span style={{color:tokens.green}}>+{fmt(v.credit)}</span>
                <span style={{color:tokens.red}}>-{fmt(v.debit)}</span>
                <span style={{fontWeight:800,color:(v.credit-v.debit)>=0?tokens.green:tokens.red,minWidth:90,textAlign:'right'}}>{fmt(v.credit-v.debit)}</span>
              </div>
            </div>
          ))}
          {Object.keys(byCategory).length===0&&<div style={{color:tokens.textSub,fontSize:13,padding:'10px 0'}}>No entries in this period.</div>}
        </div>
      </Card>

      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:12,color:tokens.text}}>Transaction Journal ({filtered.length})</div>
        {filtered.length===0?<div style={{textAlign:'center',padding:36,color:tokens.textSub}}>No transactions in this period.</div>:(
          <div style={{display:'grid',gap:6}}>
            {filtered.map(e=>(
              <div key={e.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',borderRadius:9,background:tokens.slateLight,flexWrap:'wrap'}}>
                <span style={{fontSize:11.5,color:tokens.textSub,width:82,flexShrink:0}}>{e.date||'—'}</span>
                <span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:99,background:e.type==='Credit'?'rgba(52,199,89,0.12)':'rgba(255,59,48,0.12)',color:e.type==='Credit'?tokens.green:tokens.red}}>{e.type}</span>
                <span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:99,background:e.source==='Formed'?'rgba(0,122,255,0.1)':'rgba(88,86,214,0.1)',color:e.source==='Formed'?tokens.blue:tokens.purple}}>{e.source}</span>
                <span style={{fontSize:11.5,color:tokens.textSub,minWidth:100}}>{e.chitName}</span>
                <span style={{flex:1,fontSize:13,minWidth:150,color:tokens.text}}>{e.description}</span>
                <span style={{fontSize:14,fontWeight:700,color:e.type==='Credit'?tokens.green:tokens.red,minWidth:100,textAlign:'right'}}>{e.type==='Credit'?'+':'-'}{fmt(e.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
