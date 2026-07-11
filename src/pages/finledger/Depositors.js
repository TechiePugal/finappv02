import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {collection,onSnapshot,getDocs,deleteDoc,doc,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,SearchBar,FilterTabs,formatCurrency,formatDate,Loader} from '../../components/finledger/UI';
import {printDepositorReport, printDepositorsSummary} from '../../utils/pdfReport';
import { PageLoader } from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

export default function Depositors(){
  const {user}=useAuth();
  const [data,setData]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('All');
  const [depPays,setDepPays]=useState({});
  const nav=useNavigate();

  useEffect(()=>{
    const q = query(collection(db,'deposit_master'),orderBy('createdAt','desc'));
    const unsub = onSnapshot(q, snap => {
      setData(scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid));
      setLoading(false);
    }, err => { toast.error('Failed to load'); setLoading(false); });
    const pUnsub=onSnapshot(collection(db,'deposit_payments'),snap=>{
      const pm={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(x=>{if(!pm[x.depositId])pm[x.depositId]=[];pm[x.depositId].push(x);});
      setDepPays(pm);
    });
    return () => { unsub(); pUnsub(); };
  },[]);
  async function load(){ /* kept for compat */ }
  async function del(id,e){
    e.stopPropagation();
    if(!window.confirm('Delete this depositor? This cannot be undone.'))return;
    try{await deleteDoc(doc(db,'deposit_master',id));setData(p=>p.filter(d=>d.id!==id));toast.success('Deleted');}
    catch{toast.error('Cannot delete — payment records may exist');}
  }

  const filtered=data.filter(d=>{
    const q=search.toLowerCase();
    return(!q||d.name?.toLowerCase().includes(q)||d.phone?.includes(q)||d.depositId?.toLowerCase().includes(q))
      &&(filter==='All'||d.status===filter);
  });
  const active=data.filter(d=>d.status==='Active');
  const totalAmt=active.reduce((s,d)=>s+(d.depositAmount||0),0);
  const monthlyPay=active.reduce((s,d)=>s+((d.depositAmount||0)*(d.interestRate||0)/100),0); // monthly basis

  if(loading) return <PageLoader stats={4}/>;
  return(
    <div className="page-enter">
      <PageHeader title="Depositors" subtitle="Manage investor deposits and interest liabilities"
        action={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Button variant="secondary" onClick={()=>printDepositorsSummary(data)}>Export PDF</Button>
          <Button onClick={()=>nav('/fl/depositors/new')}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Depositor</Button>
        </div>}/>

      <div className="grid-3" style={{marginBottom:20}}>
        <StatCard label="Total Depositors" value={data.length} sub={`${active.length} active`} color="#bf5af2"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}/>
        <StatCard label="Active Deposits" value={formatCurrency(totalAmt)} sub="Total under management" color="#0a84ff"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 12h.01"/></svg>}/>
        <StatCard label="Monthly Payout" value={formatCurrency(Math.round(monthlyPay))} sub="Interest owed this month" color="#ff9f0a"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
      </div>

      <Card noPad>
        <div style={{padding:'16px 18px 12px',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone, ID…"/>
          <FilterTabs options={['All','Active','Closed']} value={filter} onChange={setFilter}/>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
            <thead><tr style={{background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)'}}>
              {['ID','Investor','Amount','Rate','Monthly Int.','Type','Start Date','Status',''].map(h=>(
                <th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={9} style={{padding:48,textAlign:'center',color:'var(--text-tertiary)',fontSize:14}}>No depositors found. Add your first investor.</td></tr>
                :filtered.map(dep=>(
                  <tr key={dep.id} style={{borderBottom:'1px solid var(--divider)',cursor:'pointer'}}
                    onClick={()=>nav(`/fl/depositors/edit/${dep.id}`)}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(10,132,255,0.025)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{padding:'12px 16px'}}><span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--accent)',fontWeight:600}}>{dep.depositId}</span></td>
                    <td style={{padding:'12px 16px'}}>
                      <p style={{fontWeight:600,color:'var(--text-primary)',fontSize:14}}>{dep.name}</p>
                      <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:1}}>{dep.phone}</p>
                    </td>
                    <td style={{padding:'12px 16px'}} className="num"><span style={{fontWeight:700,fontSize:14}}>{formatCurrency(dep.depositAmount)}</span></td>
                    <td style={{padding:'12px 16px',color:'var(--orange)',fontWeight:600,fontSize:13}}>{dep.interestRate}% p.a.</td>
                    <td style={{padding:'12px 16px',color:'var(--green)',fontWeight:700,fontSize:14}} className="num">{formatCurrency(Math.round(dep.monthlyInterest||0))}</td>
                    <td style={{padding:'12px 16px',fontSize:12,color:'var(--accent)'}}>{dep.compounding?'Compound':'Simple'}</td>
                    <td style={{padding:'12px 16px',fontSize:12,color:'var(--text-secondary)'}}>{formatDate(dep.startDate)||dep.startDate||'—'}</td>
                    <td style={{padding:'12px 16px'}}><Badge label={dep.status||'Active'} type={(dep.status||'active').toLowerCase()}/></td>
                    <td style={{padding:'12px 16px'}} onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={e=>{e.stopPropagation();printDepositorReport(dep, depPays[dep.id]||[]);}} title="Download PDF Report"
                          style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(220,38,38,.2)',background:'rgba(220,38,38,.04)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#dc2626'}}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
                        </button>
                        <Button size="sm" variant="secondary" onClick={()=>nav(`/fl/depositors/edit/${dep.id}`)}>Edit</Button>
                        <Button size="sm" variant="danger" onClick={e=>del(dep.id,e)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div style={{padding:'10px 18px',borderTop:'1px solid var(--divider)'}}>
          <p style={{fontSize:12,color:'var(--text-tertiary)'}}>{filtered.length} of {data.length} records</p>
        </div>
      </Card>
    </div>
  );
}
