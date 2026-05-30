import { openDocument } from '../../utils/fileStore';
import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,StatCard,SearchBar,FilterTabs,formatCurrency,Loader} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';

export default function SecurityDocuments(){
  const [bors,setBors]=useState([]);const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');const [filter,setFilter]=useState('All');
  useEffect(()=>{load();},[]);//eslint-disable-line
  async function load(){
    try{const s=await getDocs(query(collection(db,'borrower_master'),orderBy('createdAt','desc')));setBors(s.docs.map(d=>({id:d.id,...d.data()})));}
    catch{toast.error('Failed to load');}finally{setLoading(false);}
  }
  const filtered=bors.filter(b=>{
    const q=search.toLowerCase();
    return(!q||b.borrowerName?.toLowerCase().includes(q)||b.loanId?.toLowerCase().includes(q))&&(filter==='All'||b.securityType===filter);
  });
  const stats={total:bors.length,check:bors.filter(b=>b.checkCopyUrl).length,bond:bors.filter(b=>b.bondCopyUrl).length,agreement:bors.filter(b=>b.agreementCopyUrl).length,land:bors.filter(b=>b.landDocumentsUrl).length};
  const missing=bors.filter(b=>!b.checkCopyUrl||!b.bondCopyUrl||!b.agreementCopyUrl).length;

  if(loading)return <PageLoader stats={4}/>;
  return(
    <div className="page-enter">
      <PageHeader title="Security Documents" subtitle="Legal document repository for all borrower accounts"/>
      {missing>0&&(
        <div style={{marginBottom:16,padding:'14px 18px',background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.15)',borderRadius:14,display:'flex',alignItems:'center',gap:12}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style={{color:'#c0392b',fontWeight:500,fontSize:14}}>{missing} borrower{missing>1?'s':''} have missing mandatory documents</p>
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        <StatCard label="Total" value={stats.total} color="var(--accent)" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}/>
        <StatCard label="Check Copies" value={stats.check} sub={`${stats.total-stats.check} missing`} color={stats.check===stats.total?'var(--green)':'#ff9500'} icon={<span style={{fontSize:16}}>🏦</span>}/>
        <StatCard label="Bond Copies" value={stats.bond} sub={`${stats.total-stats.bond} missing`} color={stats.bond===stats.total?'var(--green)':'#ff9500'} icon={<span style={{fontSize:16}}>📜</span>}/>
        <StatCard label="Agreements" value={stats.agreement} sub={`${stats.total-stats.agreement} missing`} color={stats.agreement===stats.total?'var(--green)':'#ff9500'} icon={<span style={{fontSize:16}}>📋</span>}/>
        <StatCard label="Land Docs" value={stats.land} sub="Optional" color="#af52de" icon={<span style={{fontSize:16}}>🏠</span>}/>
      </div>
      <Card>
        <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search borrowers…"/>
          <FilterTabs options={['All','Documents Collected','Property Registered to Company']} value={filter} onChange={setFilter}/>
        </div>
        {filtered.length===0?<div style={{textAlign:'center',padding:48,color:'var(--text-tertiary)'}}><div style={{fontSize:40,marginBottom:10}}>📁</div><p>No records found</p></div>
        :<div style={{display:'flex',flexDirection:'column',gap:12}}>
          {filtered.map(b=>{
            const cov=b.securityValue&&b.loanAmount?((b.securityValue/b.loanAmount)*100).toFixed(0):null;
            const docs=[{key:'checkCopyUrl',label:'Check Copy',icon:'🏦',req:true},{key:'bondCopyUrl',label:'Bond Copy',icon:'📜',req:true},{key:'agreementCopyUrl',label:'Agreement',icon:'📋',req:true},{key:'landDocumentsUrl',label:'Land Docs',icon:'🏠',req:false}];
            return(
              <div key={b.id} style={{background:'#fafafa',border:'1px solid rgba(0,0,0,0.06)',borderRadius:14,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                      <p style={{fontSize:15,fontWeight:600,color:'var(--text-primary)'}}>{b.borrowerName}</p>
                      <Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/>
                    </div>
                    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,color:'var(--accent)',fontFamily:'monospace'}}>{b.loanId}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>📞 {b.phone}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>Loan: {formatCurrency(b.loanAmount)}</span>
                      {cov&&<span style={{fontSize:12,fontWeight:600,color:parseFloat(cov)>=100?'var(--green)':'var(--red)'}}>Coverage: {cov}%</span>}
                    </div>
                  </div>
                  <span style={{fontSize:11,color:'var(--text-secondary)',background:'rgba(118,118,128,0.1)',padding:'4px 10px',borderRadius:20}}>{b.securityType}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {docs.map(d=>(
                    <DocTile key={d.key} icon={d.icon} label={d.label} url={b[d.key]} required={d.req}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>}
      </Card>
    </div>
  );
}

function DocTile({icon,label,url,required}){
  if(!url)return(
    <div style={{padding:'14px 12px',background:required?'rgba(255,59,48,0.04)':'rgba(118,118,128,0.04)',border:`1px solid ${required?'rgba(255,59,48,0.15)':'rgba(0,0,0,0.06)'}`,borderRadius:10,textAlign:'center'}}>
      <p style={{fontSize:22,marginBottom:6}}>{icon}</p>
      <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:4}}>{label}</p>
      <p style={{fontSize:11,fontWeight:600,color:required?'var(--red)':'var(--text-tertiary)'}}>{required?'Missing ⚠':'Not uploaded'}</p>
    </div>
  );
  return(
    <button type="button" onClick={()=>openDocument(url,label)} style={{padding:'14px 12px',background:'rgba(52,199,89,0.06)',border:'1px solid rgba(52,199,89,0.2)',borderRadius:10,textAlign:'center',cursor:'pointer',width:'100%',transition:'all 0.15s',fontFamily:'inherit'}}
      onMouseEnter={e=>e.currentTarget.style.background='rgba(52,199,89,0.12)'}
      onMouseLeave={e=>e.currentTarget.style.background='rgba(52,199,89,0.06)'}>
      <p style={{fontSize:22,marginBottom:6}}>{icon}</p>
      <p style={{fontSize:12,color:'var(--text-primary)',marginBottom:4}}>{label}</p>
      <p style={{fontSize:11,fontWeight:600,color:'var(--green)'}}>View →</p>
    </button>
  );
}
