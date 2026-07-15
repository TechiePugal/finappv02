import { openDocument } from '../../utils/fileStore';
import { getBorrowerDocs } from '../../utils/borrowerFiles';
import { getDepositorDocs } from '../../utils/depositorFiles';
import { getEmiDocs } from '../../utils/emiFiles';
import React,{useEffect,useState} from 'react';
import {collection,getDocs,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,StatCard,SearchBar,FilterTabs,formatCurrency} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

export default function SecurityDocuments(){
  const {user}=useAuth();
  const [bors,setBors]=useState([]);
  const [borDocs,setBorDocs]=useState({});
  const [deps,setDeps]=useState([]);
  const [depDocs,setDepDocs]=useState({});
  const [emis,setEmis]=useState([]);
  const [emiDocs,setEmiDocs]=useState({});
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [recordType,setRecordType]=useState('All'); // All | Borrowers | Depositors | EMI Loans

  useEffect(()=>{load();},[]);//eslint-disable-line
  async function load(){
    try{
      const [bs,ds,es]=await Promise.all([
        getDocs(query(collection(db,'borrower_master'),orderBy('createdAt','desc'))),
        getDocs(query(collection(db,'deposit_master'),orderBy('createdAt','desc'))),
        getDocs(query(collection(db,'emi_loans'),orderBy('createdAt','desc'))),
      ]);
      const borList=scopeToUser(bs.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      const depList=scopeToUser(ds.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      const emiList=scopeToUser(es.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      setBors(borList); setDeps(depList); setEmis(emiList);
      // Fetch actual file blobs — each record type has its own safe collection
      const [borPairs,depPairs,emiPairs]=await Promise.all([
        Promise.all(borList.map(b=>getBorrowerDocs(b.id).then(docs=>[b.id,docs]))),
        Promise.all(depList.map(d=>getDepositorDocs(d.id).then(docs=>[d.id,docs]))),
        Promise.all(emiList.map(e=>getEmiDocs(e.id).then(docs=>[e.id,docs]))),
      ]);
      setBorDocs(Object.fromEntries(borPairs));
      setDepDocs(Object.fromEntries(depPairs));
      setEmiDocs(Object.fromEntries(emiPairs));
    }
    catch(e){toast.error('Failed to load documents');}
    finally{setLoading(false);}
  }

  const q = search.toLowerCase();
  const filteredBors = bors.filter(b=>!q||b.borrowerName?.toLowerCase().includes(q)||b.loanId?.toLowerCase().includes(q));
  const filteredDeps = deps.filter(d=>!q||d.name?.toLowerCase().includes(q)||d.depositId?.toLowerCase().includes(q));
  const filteredEmis = emis.filter(e=>!q||e.borrowerName?.toLowerCase().includes(q)||e.emiId?.toLowerCase().includes(q));

  const showBorrowers = recordType==='All'||recordType==='Borrowers';
  const showDepositors = recordType==='All'||recordType==='Depositors';
  const showEmis = recordType==='All'||recordType==='EMI Loans';

  // Missing-mandatory-document counts per category (Borrowers: check/bond/agreement are mandatory;
  // Depositors and EMI Loans: documents are optional, so "missing" only counts if NONE uploaded at all)
  const borMissing = bors.filter(b=>{const f=borDocs[b.id]||{};return !f.check||!f.bond||!f.agreement;}).length;
  const depMissing = deps.filter(d=>{const f=depDocs[d.id]||{};return !f.check&&!f.bond;}).length;
  const emiMissing = emis.filter(e=>{const f=emiDocs[e.id]||{};return !f.check&&!f.bond&&!f.agreement;}).length;

  const totalRecords = bors.length+deps.length+emis.length;
  const totalMissing = borMissing+depMissing+emiMissing;

  if(loading)return <PageLoader stats={4}/>;
  return(
    <div className="page-enter">
      <PageHeader title="Documents" subtitle="Document repository — borrowers, depositors and EMI loans"/>

      {totalMissing>0&&(
        <div style={{marginBottom:16,padding:'14px 18px',background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.15)',borderRadius:14,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style={{color:'#c0392b',fontWeight:500,fontSize:14}}>
            {borMissing>0&&`${borMissing} borrower${borMissing>1?'s':''} missing mandatory documents`}
            {borMissing>0&&(depMissing>0||emiMissing>0)&&' · '}
            {depMissing>0&&`${depMissing} depositor${depMissing>1?'s':''} with no documents`}
            {depMissing>0&&emiMissing>0&&' · '}
            {emiMissing>0&&`${emiMissing} EMI loan${emiMissing>1?'s':''} with no documents`}
          </p>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:20}}>
        <StatCard label="Total Records" value={totalRecords} sub={`${bors.length} borrowers · ${deps.length} depositors · ${emis.length} EMI`} color="var(--accent)"/>
        <StatCard label="Borrowers — Complete" value={bors.length-borMissing} sub={`${borMissing} missing`} color={borMissing===0?'var(--green)':'#ff9500'}/>
        <StatCard label="Depositors — With Docs" value={deps.length-depMissing} sub={`${depMissing} none uploaded`} color={depMissing===0?'var(--green)':'#ff9500'}/>
        <StatCard label="EMI Loans — With Docs" value={emis.length-emiMissing} sub={`${emiMissing} none uploaded`} color={emiMissing===0?'var(--green)':'#ff9500'}/>
      </div>

      <Card>
        <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search borrowers, depositors or EMI loans…"/>
          <FilterTabs options={['All','Borrowers','Depositors','EMI Loans']} value={recordType} onChange={setRecordType}/>
        </div>

        {(!showBorrowers||filteredBors.length===0)&&(!showDepositors||filteredDeps.length===0)&&(!showEmis||filteredEmis.length===0)&&(
          <div style={{textAlign:'center',padding:48,color:'var(--text-tertiary)'}}><div style={{fontSize:40,marginBottom:10}}>📁</div><p>No records found</p></div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {showBorrowers&&filteredBors.map(b=>{
            const cov=b.securityValue&&b.loanAmount?((b.securityValue/b.loanAmount)*100).toFixed(0):null;
            const files=borDocs[b.id]||{};
            const docs=[
              {key:'check',label:'Check Copy',icon:'🏦',req:true},
              {key:'bond',label:'Bond Copy',icon:'📜',req:true},
              {key:'agreement',label:'Agreement',icon:'📋',req:true},
              {key:'land',label:'Land Docs',icon:'🏠',req:false},
            ];
            return(
              <div key={b.id} style={{background:'#fafafa',border:'1px solid rgba(0,0,0,0.06)',borderRadius:14,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                      <p style={{fontSize:15,fontWeight:600,color:'var(--text-primary)'}}>{b.borrowerName}</p>
                      <Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'rgba(0,122,255,0.1)',color:'var(--accent)'}}>BORROWER</span>
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
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>
                  {docs.map(d=>(
                    <DocTile key={d.key} icon={d.icon} label={d.label} url={files[d.key]} required={d.req}/>
                  ))}
                </div>
              </div>
            );
          })}

          {showDepositors&&filteredDeps.map(d=>{
            const files=depDocs[d.id]||{};
            const docs=[
              {key:'check',label:'Check Copy',icon:'🏦',req:false},
              {key:'bond',label:'Bond Copy',icon:'📜',req:false},
            ];
            return(
              <div key={d.id} style={{background:'#fafafa',border:'1px solid rgba(88,86,214,0.1)',borderRadius:14,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                      <p style={{fontSize:15,fontWeight:600,color:'var(--text-primary)'}}>{d.name}</p>
                      <Badge label={d.status||'Active'} type={(d.status||'active').toLowerCase().replace(' ','-')}/>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'rgba(88,86,214,0.1)',color:'#5856d6'}}>DEPOSITOR</span>
                    </div>
                    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,color:'#5856d6',fontFamily:'monospace'}}>{d.depositId}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>📞 {d.phone}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>Deposit: {formatCurrency(d.depositAmount)}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>
                  {docs.map(dd=>(
                    <DocTile key={dd.key} icon={dd.icon} label={dd.label} url={files[dd.key]} required={dd.req}/>
                  ))}
                </div>
              </div>
            );
          })}

          {showEmis&&filteredEmis.map(e=>{
            const files=emiDocs[e.id]||{};
            const docs=[
              {key:'check',label:'Check Copy',icon:'🏦',req:false},
              {key:'bond',label:'Bond Copy',icon:'📜',req:false},
              {key:'agreement',label:'Agreement',icon:'📋',req:false},
            ];
            return(
              <div key={e.id} style={{background:'#fafafa',border:'1px solid rgba(0,122,255,0.1)',borderRadius:14,padding:16}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                      <p style={{fontSize:15,fontWeight:600,color:'var(--text-primary)'}}>{e.borrowerName}</p>
                      <Badge label={e.status||'Active'} type={(e.status||'active').toLowerCase().replace(' ','-')}/>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'rgba(0,122,255,0.1)',color:'#007aff'}}>EMI LOAN</span>
                    </div>
                    <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                      <span style={{fontSize:12,color:'#007aff',fontFamily:'monospace'}}>{e.emiId}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>📞 {e.phone}</span>
                      <span style={{fontSize:12,color:'var(--text-secondary)'}}>Loan: {formatCurrency(e.loanAmount)}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>
                  {docs.map(dd=>(
                    <DocTile key={dd.key} icon={dd.icon} label={dd.label} url={files[dd.key]} required={dd.req}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
