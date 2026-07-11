import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {collection,onSnapshot,deleteDoc,doc,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,SearchBar,FilterTabs,formatCurrency} from '../../components/finledger/UI';
import {printBorrowerReport, printBorrowersSummary} from '../../utils/pdfReport';
import {PageLoader} from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

export default function Borrowers(){
  const {user}=useAuth();
  const[data,setData]=useState([]);
  const[reps,setReps]=useState({});
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[amtRange,setAmtRange]=useState('all');
  const[sortBy,setSortBy]=useState('overdue');
  const[dueFilter,setDueFilter]=useState('all');
  // monthsUnpaid = months since last interest payment
  const[filter,setFilter]=useState('All');
  const[photoPopup,setPhotoPopup]=useState(null);
  const[intPays,setIntPays]=useState({});
  const nav=useNavigate();

  useEffect(()=>{
    const bUnsub=onSnapshot(
      query(collection(db,'borrower_master'),orderBy('createdAt','desc')),
      snap=>{setData(scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid));setLoading(false);},
      ()=>{toast.error('Failed to load');setLoading(false);}
    );
    const rUnsub=onSnapshot(collection(db,'loan_repayments'),snap=>{
      const rm={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(r=>{
        if(r.deleted)return;
        if(!rm[r.borrowerId])rm[r.borrowerId]=[];
        rm[r.borrowerId].push(r);
      });
      setReps(rm);
    });
    const iUnsub=onSnapshot(collection(db,'borrower_interest_payments'),snap=>{
      const im={};
      scopeToUser(snap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(x=>{if(!im[x.borrowerId])im[x.borrowerId]=[];im[x.borrowerId].push(x);});
      setIntPays(im);
    });
    return()=>{bUnsub();rUnsub();iUnsub();};
  },[]);

  async function del(id,e){
    e.stopPropagation();
    if(!window.confirm('Delete this borrower? This cannot be undone.'))return;
    try{await deleteDoc(doc(db,'borrower_master',id));toast.success('Deleted');}
    catch{toast.error('Cannot delete');}
  }

  // FIXED: use repaidAmount field (set by LoanRepayment.js), fall back to amount for old records
  function getOutstanding(b){
    const repaid=(reps[b.id]||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
    return Math.max(0,(b.loanAmount||0)-repaid);
  }

  function calcInterest(b){
    return getOutstanding(b)*(b.interestRate||0)/100;
  }

  const _today=new Date();_today.setHours(0,0,0,0);
  const _dueOf=b=>{const d=b.agreementExpiryDate||b.agreementDate;if(!d)return{due:null,od:null};const dd=new Date(d);if(isNaN(dd))return{due:null,od:null};dd.setHours(0,0,0,0);return{due:dd,od:Math.floor((_today-dd)/86400000)};};
  const filtered=data.filter(b=>{
    const q=search.toLowerCase().trim();
    const mq=!q||[b.borrowerName,b.phone,b.loanId,b.guardianName,b.guardianPhone].some(v=>String(v||'').toLowerCase().includes(q));
    const mf=filter==='All'||b.status===filter;
    const amt=b.loanAmount||0;let ma=true;
    if(amtRange==='0-10000')ma=amt<=10000;else if(amtRange==='10000-50000')ma=amt>10000&&amt<=50000;else if(amtRange==='50000-100000')ma=amt>50000&&amt<=100000;else if(amtRange==='100000+')ma=amt>100000;
    // monthsUnpaid_v2: months since last paid interest
    const bIntPays=intPays[b.id]||{};
    const paidMonths=Object.keys(bIntPays).filter(mo=>bIntPays[mo]?.status==='Paid').sort();
    const lastPaidMo=paidMonths.length?paidMonths[paidMonths.length-1]:null;
    const now2=new Date();
    const monthsUnpaid=lastPaidMo
      ?(now2.getFullYear()-parseInt(lastPaidMo.slice(0,4)))*12+(now2.getMonth()+1-parseInt(lastPaidMo.slice(5,7)))
      :(b.loanStartDate?Math.max(0,(now2.getFullYear()-parseInt(b.loanStartDate.slice(0,4)))*12+(now2.getMonth()+1-parseInt(b.loanStartDate.slice(5,7)))):0);
    let md=true;
    if(dueFilter==='1mo')md=monthsUnpaid>=1;else if(dueFilter==='2mo')md=monthsUnpaid>=2;else if(dueFilter==='3mo')md=monthsUnpaid>=3;else if(dueFilter==='6mo')md=monthsUnpaid>=6;
    return mq&&mf&&ma&&md;
  }).sort((a,b)=>{
    if(sortBy==='loan')return(b.loanAmount||0)-(a.loanAmount||0);
    if(sortBy==='name')return String(a.borrowerName||'').localeCompare(String(b.borrowerName||''));
    if(sortBy==='due'){const x=_dueOf(a).due,y=_dueOf(b).due;if(!x)return 1;if(!y)return -1;return x-y;}
    const oa=_dueOf(a).od,ob=_dueOf(b).od;return (ob===null?-1e9:ob)-(oa===null?-1e9:oa);
  });

  const active=data.filter(b=>b.status==='Active');
  const nonActive=data.filter(b=>b.status==='Non-Active');
  const totalOutstanding=active.reduce((s,b)=>s+getOutstanding(b),0);
  const monthlyInc=active.reduce((s,b)=>s+calcInterest(b),0);

  if(loading)return<PageLoader stats={4}/>;

  return(
    <div className="page-enter">
      {photoPopup&&(
        <div onClick={()=>setPhotoPopup(null)} style={{position:'fixed',inset:0,zIndex:2000,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <div onClick={e=>e.stopPropagation()} style={{position:'relative',textAlign:'center'}}>
            <img src={photoPopup.src} alt={photoPopup.name} style={{maxWidth:300,maxHeight:300,borderRadius:16,boxShadow:'0 24px 64px rgba(0,0,0,0.5)',border:'3px solid rgba(255,255,255,0.2)',display:'block'}}/>
            <div style={{color:'#fff',fontWeight:600,fontSize:15,marginTop:12}}>{photoPopup.name}</div>
            <button onClick={()=>setPhotoPopup(null)} style={{position:'absolute',top:-12,right:-12,width:30,height:30,borderRadius:'50%',background:'#fff',border:'none',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.3)'}}>×</button>
          </div>
        </div>
      )}
      <PageHeader title="Borrowers" subtitle="Loan accounts — interest calculated on outstanding balance after repayments"
        action={<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Button variant="secondary" onClick={()=>printBorrowersSummary(data, reps)}>Export PDF</Button>
          <Button onClick={()=>nav('/fl/borrowers/new')}>+ Add Borrower</Button>
        </div>}/>

      {nonActive.length>0&&(
        <div style={{marginBottom:16,padding:'12px 16px',background:'rgba(255,69,58,0.06)',border:'1px solid rgba(255,69,58,0.18)',borderRadius:12,display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:34,height:34,borderRadius:10,background:'rgba(255,69,58,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>⚠</div>
          <div>
            <p style={{color:'#c81e1e',fontWeight:700,fontSize:13}}>{nonActive.length} Non-Active Loan{nonActive.length>1?'s':''} — Attention required</p>
            <p style={{color:'var(--text-secondary)',fontSize:12,marginTop:2}}>{nonActive.map(b=>b.borrowerName).join(' · ')}</p>
          </div>
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
        <StatCard label="Total Borrowers" value={data.length} sub={`${active.length} active`} color="#0a84ff"/>
        <StatCard label="Outstanding Balance" value={formatCurrency(Math.round(totalOutstanding))} sub="After repayments" color="#5e5ce6"/>
        <StatCard label="Monthly Interest" value={formatCurrency(Math.round(monthlyInc))} sub="On outstanding balances" color="#30d158"/>
        <StatCard label="Non-Active" value={nonActive.length} sub={nonActive.length?'Needs attention':'All current'} color={nonActive.length?'#ff453a':'#30d158'}/>
      </div>

      <Card noPad>
        <div style={{padding:'16px 18px 12px',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, phone, loan ID, guardian…"/>
          <FilterTabs options={['All','Active','Closed','Non-Active']} value={filter} onChange={setFilter}/>
          <select value={dueFilter} onChange={e=>setDueFilter(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}><option value="all">All Borrowers</option><option value="1mo">1+ Month Unpaid</option><option value="2mo">2+ Months Unpaid</option><option value="3mo">3+ Months Unpaid</option><option value="6mo">6+ Months Unpaid</option></select>
          <select value={amtRange} onChange={e=>setAmtRange(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}><option value="all">All Amounts</option><option value="0-10000">₹0 – ₹10K</option><option value="10000-50000">₹10K – ₹50K</option><option value="50000-100000">₹50K – ₹1L</option><option value="100000+">₹1L+</option></select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:'7px 10px',background:'#fff',border:'1px solid rgba(0,0,0,0.1)',borderRadius:9,fontSize:12.5,color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer'}}><option value="overdue">Sort: Most Overdue First</option><option value="loan">Sort: Highest Loan First</option><option value="due">Sort: Next Due Date</option><option value="name">Sort: Name A–Z</option></select>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
            <thead><tr style={{background:'rgba(118,118,128,0.06)',borderBottom:'1px solid rgba(0,0,0,0.07)'}}>
              {['Loan ID','Borrower','Original Loan','Repaid','Outstanding','Rate','Interest/Mo','Agreement','Start','Status',''].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length===0
                ?<tr><td colSpan={11} style={{padding:48,textAlign:'center',color:'var(--text-secondary)',fontSize:14}}>No borrowers found.</td></tr>
                :filtered.map(b=>{
                  const outstanding=getOutstanding(b);
                  const repaid=(reps[b.id]||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
                  const interest=calcInterest(b);
                  // Agreement expiry alert
                  const agrExpiry=b.agreementExpiryDate||b.agreementDate;
                  const daysToExpiry=agrExpiry?Math.floor((new Date(agrExpiry)-new Date())/(1000*60*60*24)):null;
                  const isExpiring=daysToExpiry!==null&&daysToExpiry>=0&&daysToExpiry<=30;
                  const isExpired=daysToExpiry!==null&&daysToExpiry<0;
                  return(
                    <tr key={b.id} style={{borderBottom:'1px solid rgba(0,0,0,0.05)',cursor:'pointer'}}
                      onClick={()=>nav(`/fl/borrowers/edit/${b.id}`)}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(0,122,255,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'12px 14px',fontFamily:'monospace',fontSize:11,color:'var(--accent)',fontWeight:600}}>{b.loanId||b.id.slice(-8)}</td>
                      <td style={{padding:'12px 14px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:9}}>
                          {b.photo?<img src={b.photo} alt="" onClick={e=>{e.stopPropagation();setPhotoPopup({src:b.photo,name:b.borrowerName});}} style={{width:30,height:30,borderRadius:'50%',objectFit:'cover',flexShrink:0,cursor:'pointer',border:'2px solid rgba(0,122,255,0.2)',transition:'transform 0.15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}/>
                            :<div style={{width:30,height:30,borderRadius:'50%',background:'rgba(0,122,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--accent)',flexShrink:0}}>{b.borrowerName?.[0]?.toUpperCase()||'B'}</div>}
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{b.borrowerName}</div>
                            <div style={{fontSize:11,color:'var(--text-secondary)'}}>{b.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:'12px 14px',fontWeight:600,fontSize:13}}>{formatCurrency(b.loanAmount||0)}</td>
                      <td style={{padding:'12px 14px',fontSize:13,color:'#34c759',fontWeight:600}}>{formatCurrency(Math.round(repaid))}</td>
                      <td style={{padding:'12px 14px'}}>
                        <div style={{fontSize:13,fontWeight:700,color:outstanding>0?'#ff9500':'#34c759'}}>{formatCurrency(Math.round(outstanding))}</div>
                        {b.loanAmount>0&&<div style={{width:64,height:3,background:'rgba(0,0,0,.08)',borderRadius:2,marginTop:3}}><div style={{width:`${Math.round((repaid/b.loanAmount)*100)}%`,height:'100%',background:'#34c759',borderRadius:2}}/></div>}
                      </td>
                      <td style={{padding:'12px 14px',color:'#ff9500',fontWeight:500}}>{b.interestRate}%</td>
                      <td style={{padding:'12px 14px',fontWeight:700,color:'#007aff',fontSize:13}}>{formatCurrency(Math.round(interest))}</td>
                      <td style={{padding:'12px 14px'}}>
                        {agrExpiry?(
                          <div>
                            <div style={{fontSize:11,color:isExpired?'#ff3b30':isExpiring?'#ff9500':'var(--text-secondary)',fontWeight:isExpired||isExpiring?700:400}}>
                              {isExpired?'⚠ Expired':isExpiring?`⚡ ${daysToExpiry}d left`:agrExpiry}
                            </div>
                            <div style={{fontSize:10,color:'var(--text-secondary)'}}>{agrExpiry}</div>
                          </div>
                        ):'—'}
                      </td>
                      <td style={{padding:'12px 14px',fontSize:12,color:'var(--text-secondary)'}}>{b.loanStartDate||'—'}</td>
                      <td style={{padding:'12px 14px'}}><Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/></td>
                      <td style={{padding:'12px 14px'}} onClick={e=>e.stopPropagation()}>
                        <div style={{display:'flex',gap:5}}>
                          <button onClick={e=>{e.stopPropagation();printBorrowerReport(b,reps[b.id]||[],intPays[b.id]||[]);}} title="Download PDF Report"
                            style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(220,38,38,.2)',background:'rgba(220,38,38,.04)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#dc2626'}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
                          </button>
                          <button onClick={()=>nav(`/fl/borrowers/edit/${b.id}`)}
                            style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(0,0,0,.1)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--accent)'}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={e=>del(b.id,e)}
                            style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(255,59,48,.2)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#ff3b30'}}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
