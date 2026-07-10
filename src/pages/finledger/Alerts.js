import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {PageHeader,Card,Badge,Button,formatCurrency,FilterTabs,SearchBar,Modal,InfoRow} from '../../components/finledger/UI';
import {printAlertsReport} from '../../utils/pdfReport';
import {PageLoader} from '../../components/Skeleton';

// ── Helpers ────────────────────────────────────────────────────────────────

function _toD(x){ if(!x) return null; if(x&&x.seconds) return new Date(x.seconds*1000); const d=new Date(x); return isNaN(d)?null:d; }
function daysBetween(dateA,dateB){
  const A=_toD(dateA),B=_toD(dateB); if(!A||!B) return 0;
  return Math.floor((B-A)/(1000*60*60*24));
}

function monthsBetween(dateA,dateB){
  const a=_toD(dateA),b=_toD(dateB); if(!a||!b) return 0;
  return(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());
}

function fmtDate(d){
  if(!d)return'—';
  try{return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;}
}

export default function Alerts(){
  const[borrowers,setBorrowers]=useState([]);
  const[repayments,setRepayments]=useState({});
  const[interests,setInterests]=useState({});
  const[loading,setLoading]=useState(true);
  const[tab,setTab]=useState('overdue');
  const[search,setSearch]=useState('');
  const[contactModal,setContactModal]=useState(null);
  const[photoPopup,setPhotoPopup]=useState(null);

  useEffect(()=>{
    const b=onSnapshot(
      query(collection(db,'borrower_master'),orderBy('createdAt','desc')),
      snap=>{setBorrowers(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);}
    );
    const r=onSnapshot(collection(db,'loan_repayments'),snap=>{
      const rm={};
      snap.docs.forEach(d=>{
        const x={id:d.id,...d.data()};
        if(x.deleted)return;
        if(!rm[x.borrowerId])rm[x.borrowerId]=[];
        rm[x.borrowerId].push(x);
      });
      setRepayments(rm);
    });
    const i=onSnapshot(collection(db,'borrower_interest_payments'),snap=>{
      // Key: borrowerId_YYYY-MM → payment record
      const im={};
      snap.docs.forEach(d=>{
        const x=d.data();
        const key=`${x.borrowerId}_${x.month}`;
        im[key]={id:d.id,...x};
      });
      setInterests(im);
    });
    return()=>{b();r();i();};
  },[]);

  // ── Computed values ──────────────────────────────────────────────────────

  function getBalance(b){
    // FIXED: use repaidAmount (set by LoanRepayment.js), fall back to amount for old records
    const repaid=(repayments[b.id]||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
    return Math.max(0,(b.loanAmount||0)-repaid);
  }

  function getLastRepaymentDate(b){
    const rps=repayments[b.id]||[];
    if(!rps.length)return null;
    return rps.reduce((latest,r)=>r.date>latest?r.date:latest,rps[0].date);
  }

  function getLastInterestPaidDate(b){
    // Scan months backwards from now to find last paid month
    const now=new Date();
    for(let m=0;m<36;m++){
      const d=new Date(now.getFullYear(),now.getMonth()-m,1);
      const key=`${b.id}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const rec=interests[key];
      // FIXED: check status === 'Paid' not .paid boolean
      if(rec&&rec.status==='Paid'){
        return rec.paymentDate||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      }
    }
    return null;
  }

  function getUnpaidInterestMonths(b){
    // Count how many consecutive months from now have no paid interest
    const now=new Date();
    let count=0;
    for(let m=0;m<24;m++){
      const d=new Date(now.getFullYear(),now.getMonth()-m,1);
      const key=`${b.id}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const rec=interests[key];
      // If this month has no record OR record exists but status is not 'Paid'
      if(!rec||rec.status!=='Paid'){
        count++;
      } else {
        break; // found a paid month, stop counting
      }
    }
    return count;
  }

  const today=new Date().toISOString().split('T')[0];
  const _closed=['Closed','Completed','Settled','Paid Off','Repaid','Inactive'];
  const active=borrowers.filter(b=>!_closed.includes(b.status));

  // 1. PRINCIPAL OVERDUE — no repayment for 2+ months AND has balance
  const principalOverdue=active.filter(b=>{
    const bal=getBalance(b);
    if(bal<=0)return false;
    // Use last repayment date if exists, else use loan start date
    const lastDate=getLastRepaymentDate(b)||b.loanStartDate;
    if(!lastDate)return false;
    const monthsAgo=monthsBetween(lastDate,today);
    return monthsAgo>=2;
  });

  // 2. INTEREST OVERDUE — FIXED: check status==='Paid' not .paid boolean
  //    Alert if 2 or more consecutive months unpaid
  const interestOverdue=active.filter(b=>{
    const bal=getBalance(b);
    if(bal<=0)return false; // fully repaid, no interest due
    const unpaidMonths=getUnpaidInterestMonths(b);
    return unpaidMonths>=2;
  });

  // 3. AGREEMENT EXPIRING SOON — within 30 days
  //    Uses agreementExpiryDate (exact expiry) OR agreementDate (signing date, treated as expiry itself)
  const agreementExpiring=active.filter(b=>{
    // Prefer explicit expiry date field
    const expiryDate=b.agreementExpiryDate||b.agreementDate;
    if(!expiryDate)return false;
    const days=daysBetween(today,expiryDate);
    return days>=0&&days<=30;
  });

  // 4. AGREEMENT EXPIRED
  const agreementExpired=active.filter(b=>{
    const expiryDate=b.agreementExpiryDate||b.agreementDate;
    if(!expiryDate)return false;
    const days=daysBetween(today,expiryDate);
    return days<0;
  });

  // 5. HIGH OUTSTANDING — loans where outstanding > 80% of original (barely any repayment)
  const highOutstanding=active.filter(b=>{
    const bal=getBalance(b);
    const loan=b.loanAmount||0;
    if(loan<=0)return false;
    const months=monthsBetween(b.loanStartDate||today,today);
    return months>=2&&(bal/loan)>=0.8; // 2+ months old, 80%+ still owed
  });

  // Missing mandatory security documents (Check / Bond / Agreement) — flags active borrowers only
  const missingDocs=active.filter(b=>!b.hasCheck||!b.hasBond||!b.hasAgreement);

  const tabOpts=[
    {value:'overdue',label:'Principal Overdue',count:principalOverdue.length},
    {value:'interest',label:'Interest Overdue',count:interestOverdue.length},
    {value:'expiring',label:'Agreement Expiring',count:agreementExpiring.length},
    {value:'expired',label:'Agreement Expired',count:agreementExpired.length},
    {value:'high',label:'High Outstanding',count:highOutstanding.length},
    {value:'docs',label:'Missing Documents',count:missingDocs.length},
  ];

  let list=[];
  if(tab==='overdue')list=principalOverdue;
  else if(tab==='interest')list=interestOverdue;
  else if(tab==='expiring')list=agreementExpiring;
  else if(tab==='expired')list=agreementExpired;
  else if(tab==='high')list=highOutstanding;
  else if(tab==='docs')list=missingDocs;

  const filtered=list.filter(b=>{
    if(!search)return true;
    const s=search.toLowerCase();
    return [b.borrowerName,b.phone,b.loanId,b.guardianName,b.guardianPhone].some(v=>String(v||'').toLowerCase().includes(s));
  });

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
      <PageHeader title="Alerts" subtitle="Overdue payments, interest dues and agreement expirations"/>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:20}}>
        {[
          {label:'Principal Overdue',val:principalOverdue.length,color:'#ff3b30',icon:'⚠️'},
          {label:'Interest Overdue',val:interestOverdue.length,color:'#ff9500',icon:'💰'},
          {label:'Agr. Expiring (30d)',val:agreementExpiring.length,color:'#ff9500',icon:'📋'},
          {label:'Agr. Expired',val:agreementExpired.length,color:'#ff3b30',icon:'❌'},
          {label:'High Outstanding',val:highOutstanding.length,color:'#5856d6',icon:'📈'},
          {label:'Missing Documents',val:missingDocs.length,color:'#af52de',icon:'📁'},
        ].map((c,i)=>(
          <button key={i} onClick={()=>setTab(tabOpts[i].value)}
            style={{background:'#fff',borderRadius:14,border:`2px solid ${tab===tabOpts[i].value?c.color:'rgba(0,0,0,0.07)'}`,padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)',borderLeft:`4px solid ${c.color}`,textAlign:'left',cursor:'pointer',transition:'all 0.15s',fontFamily:'inherit'}}>
            <div style={{fontSize:20,marginBottom:4}}>{c.icon}</div>
            <div style={{fontSize:24,fontWeight:800,color:c.color}}>{c.val}</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2,fontWeight:500}}>{c.label}</div>
          </button>
        ))}
      </div>

      <Card>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
          <FilterTabs options={tabOpts} value={tab} onChange={setTab}/>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone or loan ID…"/>
          <button
            onClick={()=>printAlertsReport(filtered,tab,repayments,interests)}
            style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:9,border:'1px solid rgba(220,38,38,.25)',background:'rgba(220,38,38,.05)',color:'#dc2626',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
            Export PDF
          </button>
          <button onClick={()=>{
            const rows=filtered.map(b=>{
              const reps=(repayments[b.id]||[]).reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
              const out=Math.max(0,(b.loanAmount||0)-reps);
              return [b.borrowerName||'',b.phone||'',b.loanId||'',b.guardianName||'',b.guardianPhone||'',b.loanAmount||0,out,(b.interestRate||0)+'%/mo',b.status||'',b.loanStartDate||'',b.agreementExpiryDate||b.agreementDate||''];
            });
            const head=['Name','Phone','Loan ID','Guardian','Guardian Phone','Loan Amount','Outstanding','Rate','Status','Loan Start','Agreement Expiry'];
            const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
            const csv=[head,...rows].map(r=>r.map(esc).join(',')).join('\n');
            const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
            const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`alerts-${tab}-${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(a.href);
          }} /* exportAlertsCsv */
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:9,border:'1px solid rgba(52,199,89,.3)',background:'rgba(52,199,89,.06)',color:'#248a3d',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
        </div>

        {filtered.length===0?(
          <div style={{textAlign:'center',padding:'44px 20px',color:'var(--text-secondary)'}}>
            <div style={{fontSize:44,marginBottom:10}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>All clear!</div>
            <div style={{fontSize:13}}>No alerts in this category</div>
          </div>
        ):(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(118,118,128,0.07)',borderBottom:'1px solid rgba(0,0,0,.08)'}}>
                  {['Borrower','Phone','Loan Amt','Outstanding','Last Repayment','Interest Paid','Alert Info','Status','Action'].map(h=>(
                    <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b=>{
                  const bal=getBalance(b);
                  const lastRep=getLastRepaymentDate(b);
                  const lastInt=getLastInterestPaidDate(b);
                  const unpaidMo=getUnpaidInterestMonths(b);
                  const expiryDate=b.agreementExpiryDate||b.agreementDate;
                  const daysToExpiry=expiryDate?daysBetween(today,expiryDate):null;
                  const repMonthsAgo=lastRep?monthsBetween(lastRep,today):null;

                  // Build alert info string for current tab
                  let alertInfo='—';
                  if(tab==='overdue'&&repMonthsAgo!==null)alertInfo=`${repMonthsAgo} months since last repayment`;
                  else if(tab==='interest')alertInfo=`${unpaidMo} months interest not collected`;
                  else if(tab==='expiring'&&daysToExpiry!==null)alertInfo=`Expires in ${daysToExpiry} days (${fmtDate(expiryDate)})`;
                  else if(tab==='expired'&&daysToExpiry!==null)alertInfo=`Expired ${Math.abs(daysToExpiry)} days ago`;
                  else if(tab==='high')alertInfo=`${b.loanAmount>0?Math.round((bal/b.loanAmount)*100):0}% still outstanding`;

                  return(
                    <tr key={b.id} style={{borderBottom:'1px solid rgba(0,0,0,.05)'}}>
                      <td style={{padding:'11px 12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          {b.photo?<img src={b.photo} alt="" onClick={()=>setPhotoPopup({src:b.photo,name:b.borrowerName})} style={{width:28,height:28,borderRadius:'50%',objectFit:'cover',flexShrink:0,cursor:'pointer',border:'2px solid rgba(0,122,255,0.15)',transition:'transform 0.15s'}} onMouseEnter={e=>e.currentTarget.style.transform='scale(1.15)'} onMouseLeave={e=>e.currentTarget.style.transform='scale(1)'}/>
                            :<div style={{width:28,height:28,borderRadius:'50%',background:'rgba(0,122,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--accent)',flexShrink:0}}>{b.borrowerName?.[0]?.toUpperCase()}</div>}
                          <div>
                            <div style={{fontWeight:600,fontSize:13}}>{b.borrowerName}</div>
                            <div style={{fontSize:10,color:'var(--text-secondary)'}}>{b.loanId||b.id.slice(-8)}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{padding:'11px 12px',fontSize:13}}>{b.phone}</td>
                      <td style={{padding:'11px 12px',fontSize:13,fontWeight:600}}>{formatCurrency(b.loanAmount||0)}</td>
                      <td style={{padding:'11px 12px',fontSize:13,color:'#ff9500',fontWeight:700}}>{formatCurrency(Math.round(bal))}</td>
                      <td style={{padding:'11px 12px',fontSize:12,color:'var(--text-secondary)'}}>{lastRep?fmtDate(lastRep):'Never'}</td>
                      <td style={{padding:'11px 12px',fontSize:12,color:'var(--text-secondary)'}}>{lastInt?fmtDate(lastInt):'Never'}</td>
                      <td style={{padding:'11px 12px'}}>
                        <div style={{fontSize:12,fontWeight:600,color:tab==='overdue'?'#ff3b30':tab==='interest'?'#ff9500':tab==='expiring'?'#ff9500':tab==='expired'?'#ff3b30':'#5856d6',maxWidth:180,lineHeight:1.4}}>{alertInfo}</div>
                      </td>
                      <td style={{padding:'11px 12px'}}><Badge label={b.status} type={b.status==='Active'?'success':'warning'}/></td>
                      <td style={{padding:'11px 12px'}}>
                        <Button size="sm" onClick={()=>setContactModal(b)}>📞 Contact</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Contact Modal */}
      <Modal open={!!contactModal} onClose={()=>setContactModal(null)} title={`Contact — ${contactModal?.borrowerName}`} width={440}
        footer={contactModal&&<Button full onClick={()=>setContactModal(null)}>Close</Button>}>
        {contactModal&&(()=>{
          const bal=getBalance(contactModal);
          const unpaidMo=getUnpaidInterestMonths(contactModal);
          const lastRep=getLastRepaymentDate(contactModal);
          const expiryDate=contactModal.agreementExpiryDate||contactModal.agreementDate;
          const daysToExpiry=expiryDate?daysBetween(today,expiryDate):null;
          const Section=({title,accent,children})=>(
            <div style={{border:`1px solid ${accent}33`,borderRadius:12,marginBottom:10,overflow:'hidden'}}>
              <div style={{padding:'7px 14px',background:`${accent}0d`,fontSize:11,fontWeight:800,color:accent,textTransform:'uppercase',letterSpacing:'.05em'}}>{title}</div>
              <div style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px'}}>{children}</div>
            </div>
          );
          const F=({label,value,color,full})=>(
            <div style={{gridColumn:full?'1 / -1':'auto'}}>
              <div style={{fontSize:10,color:'var(--text-secondary)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.03em',marginBottom:2}}>{label}</div>
              <div style={{fontSize:13,fontWeight:600,color:color||'var(--text-primary)'}}>{value??'—'}</div>
            </div>
          );
          return(
            <div>
              {/* Identity strip */}
              <div style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:14,marginBottom:14,background:'linear-gradient(135deg,rgba(255,59,48,0.08),rgba(255,149,0,0.08))',border:'1px solid rgba(255,59,48,0.18)'}}>
                {contactModal.photo
                  ?<img src={contactModal.photo} alt="" style={{width:56,height:56,borderRadius:'50%',objectFit:'cover',border:'3px solid rgba(255,59,48,0.25)',flexShrink:0}}/>
                  :<div style={{width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,#ff3b30,#ff9500)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'#fff',flexShrink:0}}>{(contactModal.borrowerName||'?')[0].toUpperCase()}</div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:15,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{contactModal.borrowerName}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{contactModal.phone}{contactModal.loanId?' · '+contactModal.loanId:''}</div>
                  <div style={{marginTop:5,display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:'#fff',background:'#ff3b30',padding:'2px 9px',borderRadius:99}}>
                    ⚠ {formatCurrency(Math.round(bal))} due{unpaidMo>=2?` · ${unpaidMo}mo overdue`:''}{daysToExpiry!==null&&daysToExpiry<0?' · Expired':''}
                  </div>
                </div>
              </div>

              <Section title="Contact" accent="#007aff">
                <F label="Phone" value={<a href={`tel:${contactModal.phone}`} style={{color:'var(--accent)',fontWeight:700,textDecoration:'none'}}>📞 {contactModal.phone}</a>}/>
                {contactModal.email&&<F label="Email" value={<a href={`mailto:${contactModal.email}`} style={{color:'var(--accent)'}}>{contactModal.email}</a>}/>}
                {contactModal.address&&<F label="Address" value={contactModal.address} full/>}
              </Section>

              {contactModal.guardianName&&(
                <Section title="Guardian" accent="#5856d6">
                  <F label="Name" value={contactModal.guardianName}/>
                  {contactModal.guardianPhone&&<F label="Phone" value={<a href={`tel:${contactModal.guardianPhone}`} style={{color:'var(--accent)',fontWeight:700,textDecoration:'none'}}>📞 {contactModal.guardianPhone}</a>}/>}
                  {contactModal.guardianAddress&&<F label="Address" value={contactModal.guardianAddress} full/>}
                </Section>
              )}

              <Section title="Loan Details" accent="#ff9500">
                <F label="Loan ID" value={contactModal.loanId||contactModal.id.slice(-8)}/>
                <F label="Original Loan" value={formatCurrency(contactModal.loanAmount||0)}/>
                <F label="Outstanding" value={formatCurrency(Math.round(bal))} color="#ff9500"/>
                <F label="Monthly Interest" value={formatCurrency(Math.round(bal*(contactModal.interestRate||0)/100))} color="#007aff"/>
                {lastRep&&<F label="Last Repayment" value={fmtDate(lastRep)}/>}
                {contactModal.loanStartDate&&<F label="Loan Start" value={fmtDate(contactModal.loanStartDate)}/>}
                {expiryDate&&<F label="Agreement Expiry" value={fmtDate(expiryDate)} color={daysToExpiry!==null&&daysToExpiry<0?'#ff3b30':'var(--text-primary)'} full/>}
              </Section>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function Row({label,value,color}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,.05)'}}>
      <span style={{fontSize:12,color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,color:color||'var(--text-primary)',textAlign:'right',maxWidth:'65%'}}>{value??'—'}</span>
    </div>
  );
}
