import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,query,orderBy} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {PageHeader,Card,Button,Badge,FilterTabs,SearchBar,formatCurrency,Modal} from '../../components/finledger/UI';
import {printEMIAlertsReport} from '../../utils/pdfReport';
import {PageLoader} from '../../components/Skeleton';

// ── helpers ────────────────────────────────────────────────────────────────
function todayStr(){return new Date().toISOString().split('T')[0];}

function safeDate(d){
  if(!d)return null;
  const dt=new Date(d);
  return isNaN(dt.getTime())?null:dt;
}

function safeDateStr(dt){
  // dt must already be a valid Date object
  try{return dt.toISOString().split('T')[0];}catch{return null;}
}

function daysBetween(dateStrA,dateStrB){
  const a=safeDate(dateStrA), b=safeDate(dateStrB);
  if(!a||!b)return 0;
  return Math.floor((b-a)/86400000);
}

function fmtDate(d){
  if(!d)return'—';
  const dt=safeDate(d);
  if(!dt)return d;
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}

/**
 * Calculate next-due info for an EMI loan.
 * Uses emiStartDate (new field) OR loanStartDate/startDate as fallback.
 * Returns safe values — never throws.
 */
function getDueInfo(loan,cols){
  const paid=cols.length;
  const total=parseInt(loan.totalPeriods)||0;
  const remaining=Math.max(0,total-paid);

  if(remaining===0) return{overdue:false,daysOverdue:0,nextDueDate:null,remaining:0,isValid:true};

  // Resolve start date — new field is emiStartDate, old was startDate
  const startStr=loan.emiStartDate||loan.startDate||loan.loanDate||null;
  const start=safeDate(startStr);

  if(!start) return{overdue:false,daysOverdue:0,nextDueDate:null,remaining,isValid:false};

  // Calculate next due date based on frequency
  let nextDue;
  const freq=loan.frequency||'monthly';

  try{
    if(freq==='daily'){
      nextDue=new Date(start);
      nextDue.setDate(nextDue.getDate()+paid);
    } else if(freq==='weekly'){
      nextDue=new Date(start);
      nextDue.setDate(nextDue.getDate()+paid*7);
    } else {
      // monthly — use setMonth to handle month lengths correctly
      nextDue=new Date(start);
      nextDue.setMonth(nextDue.getMonth()+paid);
    }
  } catch{
    return{overdue:false,daysOverdue:0,nextDueDate:null,remaining,isValid:false};
  }

  if(!nextDue||isNaN(nextDue.getTime()))
    return{overdue:false,daysOverdue:0,nextDueDate:null,remaining,isValid:false};

  const nextDueDateStr=safeDateStr(nextDue);
  if(!nextDueDateStr)
    return{overdue:false,daysOverdue:0,nextDueDate:null,remaining,isValid:false};

  const today=todayStr();
  const daysOverdue=Math.max(0,daysBetween(nextDueDateStr,today));

  return{
    overdue:daysOverdue>0,
    daysOverdue,
    nextDueDate:nextDueDateStr,
    remaining,
    isValid:true,
  };
}

const FREQ_LABEL={daily:'Daily',weekly:'Weekly',monthly:'Monthly'};
const AMT_RANGES=[
  {value:'all',    label:'All Amounts'},
  {value:'0-10000',label:'₹0 – ₹10K'},
  {value:'10000-50000',label:'₹10K – ₹50K'},
  {value:'50000-100000',label:'₹50K – ₹1L'},
  {value:'100000+',label:'₹1L+'},
];

export default function EMIAlerts(){
  const[loans,setLoans]=useState([]);
  const[collections,setCollections]=useState({});
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[filter,setFilter]=useState('all-due');
  const[sortBy,setSortBy]=useState('overdue');
  const[contactModal,setContactModal]=useState(null);
  const[amtFilter,setAmtFilter]=useState('all');

  useEffect(()=>{
    const l=onSnapshot(
      query(collection(db,'emi_loans'),orderBy('createdAt','desc')),
      snap=>{setLoans(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      ()=>setLoading(false)
    );
    const c=onSnapshot(collection(db,'emi_collections'),snap=>{
      const cm={};
      snap.docs.forEach(d=>{
        const x={id:d.id,...d.data()};
        if(!cm[x.loanId])cm[x.loanId]=[];
        cm[x.loanId].push(x);
      });
      setCollections(cm);
    });
    return()=>{l();c();};
  },[]);

  // Compute due info safely for every active loan
  const activeLoans=loans.filter(l=>l.status==='Active');
  const withDue=activeLoans.map(l=>{
    const info=getDueInfo(l,collections[l.id]||[]);
    return{...l,...info};
  });

  const today=todayStr();
  const overdueAll  =withDue.filter(l=>l.overdue);
  const dueToday    =withDue.filter(l=>l.nextDueDate===today);
  const dueSoon     =withDue.filter(l=>{
    if(!l.nextDueDate)return false;
    const d=daysBetween(today,l.nextDueDate);
    return d>=0&&d<=3;
  });
  const overdueWeek =withDue.filter(l=>l.daysOverdue>7);
  const overdueMonth=withDue.filter(l=>l.daysOverdue>30);

  function matchAmt(loan){
    const a=loan.loanAmount||0;
    if(amtFilter==='all')return true;
    if(amtFilter==='0-10000')return a<10000;
    if(amtFilter==='10000-50000')return a>=10000&&a<50000;
    if(amtFilter==='50000-100000')return a>=50000&&a<100000;
    if(amtFilter==='100000+')return a>=100000;
    return true;
  }

  const listMap={
    'all-due':overdueAll,
    'today':dueToday,
    'soon':dueSoon,
    'week':overdueWeek,
    'month':overdueMonth,
  };
  const list=listMap[filter]||overdueAll;

  const filtered=list
    .filter(l=>{
      const ms=!search
        ||l.borrowerName?.toLowerCase().includes(search.toLowerCase())
        ||(l.emiId||'').toLowerCase().includes(search.toLowerCase())
        ||(l.phone||'').includes(search);
      return ms&&matchAmt(l);
    })
    .sort((a,b)=>{
      if(sortBy==='overdue')return b.daysOverdue-a.daysOverdue;
      if(sortBy==='amount')return(b.loanAmount||0)-(a.loanAmount||0);
      // sort by date
      if(!a.nextDueDate)return 1;
      if(!b.nextDueDate)return -1;
      return a.nextDueDate.localeCompare(b.nextDueDate);
    });

  const tabs=[
    {value:'all-due', label:'All Overdue',      count:overdueAll.length},
    {value:'today',   label:'Due Today',         count:dueToday.length},
    {value:'soon',    label:'Due in 3 Days',     count:dueSoon.length},
    {value:'week',    label:'>7 Days Overdue',   count:overdueWeek.length},
    {value:'month',   label:'>30 Days Overdue',  count:overdueMonth.length},
  ];

  if(loading)return<PageLoader stats={4}/>;

  return(
    <div className="page-enter">
      <PageHeader title="EMI Alerts" subtitle="Uncollected EMI dues — filter by overdue period, amount and due date"/>

      {/* Summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {[
          {label:'Total Overdue',   val:overdueAll.length,    color:'#ff3b30'},
          {label:'Due Today',       val:dueToday.length,      color:'#ff9500'},
          {label:'Due in 3 Days',   val:dueSoon.length,       color:'#ff9500'},
          {label:'>7 Days Overdue', val:overdueWeek.length,   color:'#ff3b30'},
          {label:'>30 Days',        val:overdueMonth.length,  color:'#c0392b'},
        ].map((c,i)=>(
          <button key={i} onClick={()=>setFilter(tabs[i].value)}
            style={{background:'#fff',borderRadius:12,border:`2px solid ${filter===tabs[i].value?c.color:'rgba(0,0,0,.07)'}`,padding:'14px 14px',boxShadow:'0 1px 3px rgba(0,0,0,.04)',borderLeft:`4px solid ${c.color}`,textAlign:'left',cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s'}}>
            <div style={{fontSize:24,fontWeight:800,color:c.color,lineHeight:1}}>{c.val}</div>
            <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:4,fontWeight:500}}>{c.label}</div>
          </button>
        ))}
      </div>

      <Card>
        {/* Tabs */}
        <div style={{marginBottom:14}}>
          <FilterTabs options={tabs} value={filter} onChange={setFilter}/>
        </div>

        {/* Filters row */}
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, phone or EMI ID…"/>

          <select value={amtFilter} onChange={e=>setAmtFilter(e.target.value)}
            style={{height:36,padding:'0 32px 0 12px',borderRadius:9,border:'1.5px solid rgba(0,0,0,.1)',fontSize:13,fontFamily:'inherit',background:'#fff',color:'var(--text-primary)',cursor:'pointer',appearance:'none',outline:'none',backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center'}}>
            {AMT_RANGES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
          </select>

          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{height:36,padding:'0 32px 0 12px',borderRadius:9,border:'1.5px solid rgba(0,0,0,.1)',fontSize:13,fontFamily:'inherit',background:'#fff',color:'var(--text-primary)',cursor:'pointer',appearance:'none',outline:'none',backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,backgroundRepeat:'no-repeat',backgroundPosition:'right 10px center'}}>
            <option value="overdue">Sort: Most Overdue First</option>
            <option value="amount">Sort: Highest Loan First</option>
            <option value="date">Sort: Next Due Date</option>
          </select>

          <span style={{fontSize:12,color:'var(--text-secondary)',marginLeft:'auto',fontWeight:500}}>{filtered.length} record{filtered.length!==1?'s':''}</span>
          <button
            onClick={()=>printEMIAlertsReport(filtered,tabs.find(t=>t.value===filter)?.label||'Overdue EMIs',collections)}
            style={{display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:9,border:'1px solid rgba(220,38,38,.25)',background:'rgba(220,38,38,.05)',color:'#dc2626',cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit',whiteSpace:'nowrap'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
            Export PDF
          </button>
        </div>

        {/* Table */}
        {filtered.length===0?(
          <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text-secondary)'}}>
            <div style={{fontSize:44,marginBottom:12}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>No alerts in this category</div>
            <div style={{fontSize:13}}>All EMIs are up to date</div>
          </div>
        ):(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'rgba(118,118,128,0.07)',borderBottom:'1px solid rgba(0,0,0,.08)'}}>
                  {['','EMI ID','Borrower','Loan Amt','EMI','Freq','Next Due','Overdue','Paid/Total','Action'].map(h=>(
                    <th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l=>{
                  const cols=collections[l.id]||[];
                  const overColor=l.daysOverdue>30?'#ff3b30':l.daysOverdue>7?'#ff9500':'#ff6b00';
                  return(
                    <tr key={l.id} style={{borderBottom:'1px solid rgba(0,0,0,.04)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(255,59,48,0.02)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>

                      {/* Photo */}
                      <td style={{padding:'10px 8px'}}>
                        {l.photo
                          ?<img src={l.photo} alt="" style={{width:32,height:32,borderRadius:'50%',objectFit:'cover',border:'2px solid rgba(255,59,48,0.2)'}}/>
                          :<div style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,59,48,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#ff3b30'}}>{(l.borrowerName||'?')[0].toUpperCase()}</div>}
                      </td>

                      <td style={{padding:'10px 12px',fontSize:11.5,fontFamily:'monospace',color:'var(--accent)',fontWeight:700}}>
                        {l.emiId||l.id?.slice(-8)}
                      </td>

                      <td style={{padding:'10px 12px'}}>
                        <div style={{fontWeight:600,fontSize:13}}>{l.borrowerName}</div>
                        <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:1}}>{l.phone}</div>
                        {l.guardianName&&<div style={{fontSize:10,color:'var(--text-secondary)',marginTop:1}}>G: {l.guardianName}</div>}
                      </td>

                      <td style={{padding:'10px 12px',fontSize:13,fontWeight:600}}>{formatCurrency(l.loanAmount||0)}</td>
                      <td style={{padding:'10px 12px',fontSize:13,fontWeight:700,color:'var(--accent)'}}>{formatCurrency(l.emiAmount||0)}</td>
                      <td style={{padding:'10px 12px'}}>
                        <span style={{fontSize:12,padding:'2px 8px',borderRadius:99,background:'rgba(0,122,255,0.08)',color:'var(--accent)',fontWeight:600}}>
                          {FREQ_LABEL[l.frequency]||l.frequency||'—'}
                        </span>
                      </td>

                      <td style={{padding:'10px 12px',fontSize:13}}>
                        {l.nextDueDate?fmtDate(l.nextDueDate):'—'}
                      </td>

                      <td style={{padding:'10px 12px'}}>
                        {l.daysOverdue>0?(
                          <div>
                            <span style={{fontWeight:800,color:overColor,fontSize:14}}>{l.daysOverdue}d</span>
                            <span style={{fontSize:11,color:overColor,marginLeft:4}}>overdue</span>
                            {l.daysOverdue>2&&l.dailyFineRate>0&&(
                              <div style={{fontSize:10,color:'#c0392b',fontWeight:600,marginTop:2}}>
                                Fine: {formatCurrency((l.daysOverdue-2)*(l.dailyFineRate||50))}
                              </div>
                            )}
                          </div>
                        ):(
                          <span style={{color:'#34c759',fontSize:12,fontWeight:600}}>✓ On time</span>
                        )}
                      </td>

                      <td style={{padding:'10px 12px',fontSize:13}}>
                        <span style={{color:'#34c759',fontWeight:700}}>{cols.length}</span>
                        <span style={{color:'var(--text-secondary)'}}>/{l.totalPeriods||'?'}</span>
                        {l.totalPeriods>0&&(
                          <div style={{height:3,background:'rgba(0,0,0,.07)',borderRadius:2,marginTop:4,width:52}}>
                            <div style={{width:`${Math.round((cols.length/(l.totalPeriods||1))*100)}%`,height:'100%',background:'#34c759',borderRadius:2}}/>
                          </div>
                        )}
                      </td>

                      <td style={{padding:'10px 12px'}}>
                        <Button size="sm" onClick={()=>setContactModal(l)}>📞 Contact</Button>
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
      <Modal open={!!contactModal} onClose={()=>setContactModal(null)} title={`Contact — ${contactModal?.borrowerName||''}`} width={420}>
        {contactModal&&(()=>{
          const cols=collections[contactModal.id]||[];
          const fine=contactModal.daysOverdue>2?(contactModal.daysOverdue-2)*(contactModal.dailyFineRate||50):0;
          return(
            <div>
              {/* Alert summary */}
              <div style={{background:'rgba(255,59,48,0.06)',borderRadius:10,padding:'12px 14px',marginBottom:14,border:'1px solid rgba(255,59,48,0.15)'}}>
                <div style={{fontSize:14,fontWeight:700,color:'#c0392b',marginBottom:2}}>
                  ⚠ EMI overdue by {contactModal.daysOverdue} days
                </div>
                {fine>0&&<div style={{fontSize:12,color:'#c0392b'}}>Fine applicable: {formatCurrency(fine)}</div>}
              </div>

              {/* Photo + name */}
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                {contactModal.photo
                  ?<img src={contactModal.photo} alt="" style={{width:52,height:52,borderRadius:'50%',objectFit:'cover',border:'2px solid rgba(0,122,255,0.2)',flexShrink:0}}/>
                  :<div style={{width:52,height:52,borderRadius:'50%',background:'rgba(0,122,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:'var(--accent)',flexShrink:0}}>{(contactModal.borrowerName||'?')[0].toUpperCase()}</div>}
                <div>
                  <div style={{fontWeight:700,fontSize:16}}>{contactModal.borrowerName}</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)'}}>{contactModal.emiId}</div>
                </div>
              </div>

              {/* Contact details */}
              {[
                ['Primary Phone', <a key="ph" href={`tel:${contactModal.phone}`} style={{color:'var(--accent)',fontWeight:700,fontSize:15,textDecoration:'none'}}>📞 {contactModal.phone}</a>],
                contactModal.email&&['Email', <a key="em" href={`mailto:${contactModal.email}`} style={{color:'var(--accent)'}}>{contactModal.email}</a>],
                contactModal.address&&['Address', contactModal.address],
                contactModal.guardianName&&['Guardian Name', contactModal.guardianName],
                contactModal.guardianPhone&&['Guardian Phone', <a key="gph" href={`tel:${contactModal.guardianPhone}`} style={{color:'var(--accent)',fontWeight:700,fontSize:15,textDecoration:'none'}}>📞 {contactModal.guardianPhone}</a>],
                contactModal.guardianAddress&&['Guardian Address', contactModal.guardianAddress],
              ].filter(Boolean).map(([label,value],i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(0,0,0,.05)'}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)',flexShrink:0}}>{label}</span>
                  <span style={{fontSize:13,fontWeight:600,textAlign:'right',maxWidth:'65%'}}>{value||'—'}</span>
                </div>
              ))}

              {/* Loan info */}
              <div style={{height:1,background:'rgba(0,0,0,.07)',margin:'10px 0'}}/>
              {[
                ['EMI Amount',   formatCurrency(contactModal.emiAmount||0)],
                ['Frequency',    FREQ_LABEL[contactModal.frequency]||contactModal.frequency||'—'],
                ['Next Due',     fmtDate(contactModal.nextDueDate)],
                ['Paid / Total', `${cols.length} / ${contactModal.totalPeriods||'?'}`],
                ['Loan Amount',  formatCurrency(contactModal.loanAmount||0)],
                fine>0&&['Fine Due', formatCurrency(fine)],
              ].filter(Boolean).map(([label,value],i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid rgba(0,0,0,.04)'}}>
                  <span style={{fontSize:12,color:'var(--text-secondary)'}}>{label}</span>
                  <span style={{fontSize:13,fontWeight:600,color:label==='Fine Due'?'#ff3b30':'var(--text-primary)'}}>{value}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
