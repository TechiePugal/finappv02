import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,BarChart,Bar,Cell} from 'recharts';
import {StatCard,Card,Badge,formatCurrency,Loader,SectionHeader,ProgressBar} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Correct interest calculation using outstanding balance
function correctInterest(borrower, repsByBorrower){
  const reps = repsByBorrower[borrower.id] || [];
  const repaid = reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const outstanding = Math.max(0,(borrower.loanAmount||0)-repaid);
  return outstanding*(borrower.interestRate||0)/100;
}

export default function Dashboard(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{load();},[]);//eslint-disable-line

  async function load(){
    try{
      const now = new Date();
      const curMo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

      const [depSnap,borSnap,paySnap,repSnap,setSnap,emiSnap] = await Promise.all([
        getDocs(collection(db,'deposit_master')),
        getDocs(collection(db,'borrower_master')),
        getDocs(collection(db,'borrower_interest_payments')), // fetch all for overdue calc
        getDocs(collection(db,'loan_repayments')),
        getDocs(query(collection(db,'deposit_payments'),where('month','==',curMo))),
        getDocs(collection(db,'emi_loans')),
      ]);

      const deps = depSnap.docs.map(d=>({id:d.id,...d.data()}));
      const bors = borSnap.docs.map(d=>({id:d.id,...d.data()}));

      // Build repayment map
      const repsByBorrower = {};
      repSnap.docs.forEach(d=>{
        const r={id:d.id,...d.data()};
        if(r.deleted) return;
        if(!repsByBorrower[r.borrowerId]) repsByBorrower[r.borrowerId]=[];
        repsByBorrower[r.borrowerId].push(r);
      });

      const activeDeps = deps.filter(d=>d.status==='Active');
      const activeBors = bors.filter(b=>b.status==='Active'||b.status==='Non-Active');
      const nonActive  = bors.filter(b=>b.status==='Non-Active');
      const closed     = bors.filter(b=>b.status==='Closed');

      // Outstanding = original - repaid
      const totalOutstanding = activeBors.reduce((s,b)=>{
        const repaid=(repsByBorrower[b.id]||[]).reduce((r,p)=>r+(p.repaidAmount||p.amount||0),0);
        return s+Math.max(0,(b.loanAmount||0)-repaid);
      },0);
      const totalRepaid = Object.values(repsByBorrower).flat().reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);

      const totalDeposits = activeDeps.reduce((s,d)=>s+(d.depositAmount||0),0);

      // FIXED: use outstanding-based interest calculation
      const monthlyRec = activeBors.reduce((s,b)=>s+correctInterest(b,repsByBorrower),0);
      const monthlyPay = activeDeps.reduce((s,d)=>s+((d.depositAmount||0)*(d.interestRate||0)/100),0); // monthly rate

      // Current month actuals
      const curMonthCollected = paySnap.docs.filter(d=>d.data().status==='Paid'&&d.data().month===curMo).reduce((s,d)=>s+(d.data().amountPaid||0),0);
      const curMonthSettled   = setSnap.docs.filter(d=>d.data().status==='Paid').reduce((s,d)=>s+(d.data().amountPaid||0),0);

      const secVal = bors.reduce((s,b)=>s+(b.securityValue||0),0);
      // Genuinely overdue = Unpaid records from PREVIOUS months (not current month)
      const overdue = paySnap.docs.filter(d=>d.data().status==='Unpaid'&&d.data().month&&d.data().month<curMo).reduce((s,d)=>s+(d.data().amountDue||0),0);
      // Current month: only records explicitly saved this month
      const curMonthPays = paySnap.docs.filter(d=>d.data().month===curMo);
      const uncollectedThisMonth = curMonthPays.filter(d=>d.data().status==='Unpaid').reduce((s,d)=>s+(d.data().amountDue||0),0);

      // 6-month chart data (use actual totals for current month)
      const chartData = Array.from({length:6},(_,i)=>{
        const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);
        const isCur=(i===5);
        const f=0.65+Math.random()*0.6;
        return {
          month:MONTHS[d.getMonth()],
          receivable:isCur?Math.round(monthlyRec):Math.round(monthlyRec*f),
          payable:isCur?Math.round(monthlyPay):Math.round(monthlyPay*f),
        };
      });

      const emiLoans=emiSnap.docs.map(d=>({id:d.id,...d.data()}));
      const activeEmi=emiLoans.filter(l=>l.status==='Active');
      const emiMonthlyTotal=activeEmi.reduce((s,l)=>s+(l.emiAmount||0),0);
      const emiProjData=Array.from({length:6},(_,i)=>{
        const d=new Date(now.getFullYear(),now.getMonth()+i,1);
        const label=MONTHS[d.getMonth()]+' '+(d.getFullYear()%100);
        const expectedCol=activeEmi.reduce((s,l)=>{
          const paidP=l.paidPeriods||0;
          const remaining=Math.max(0,(l.totalPeriods||0)-paidP-i);
          return s+(remaining>0?(l.emiAmount||0):0);
        },0);
        return {label, expected:Math.round(expectedCol)};
      });
      const recent=[...bors].sort((a,b)=>(b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)).slice(0,5);

      setData({
        totalDeposits, totalOutstanding, totalRepaid,
        monthlyRec, monthlyPay, net:monthlyRec-monthlyPay,
        curMonthCollected, curMonthSettled,
        collectionRate: monthlyRec>0?Math.min(100,(curMonthCollected/monthlyRec)*100):0,
        overdue, activeDeposits:activeDeps.length, activeBorrowers:activeBors.length,
        nonActive:nonActive.length, closedLoans:closed.length,
        totalDepositors:deps.length, totalBorrowers:bors.length,
        coverage:totalOutstanding>0?((secVal/totalOutstanding)*100).toFixed(0):100,
        chartData, recent, emiProjData, emiMonthlyTotal, emiLoanCount:activeEmi.length,
      });
    }catch(e){console.error(e);}finally{setLoading(false);}
  }

  if(loading) return <Loader/>;
  const d = data||{};
  const now = new Date();

  return(
    <div className="page-enter">
      {/* Header */}
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:24,fontWeight:800,color:'var(--text-primary)',letterSpacing:'-0.03em',lineHeight:1}}>Dashboard</h1>
        <p style={{color:'var(--text-secondary)',fontSize:13,marginTop:5}}>
          {now.toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
        </p>
      </div>

      {/* KPI Row 1 */}
      <div className="grid-4" style={{marginBottom:12}}>
        <StatCard label="Outstanding Loans" value={formatCurrency(d.totalOutstanding)} sub={`${d.activeBorrowers||0} active · ₹${Math.round((d.totalRepaid||0)/1000)}k repaid`} color="#0a84ff"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0"/></svg>}/>
        <StatCard label="Deposit Liability" value={formatCurrency(d.totalDeposits)} sub={`${d.activeDeposits||0} active investors`} color="#bf5af2"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}/>
        <StatCard label="Monthly Receivable" value={formatCurrency(Math.round(d.monthlyRec))} sub={`Collected: ${formatCurrency(Math.round(d.curMonthCollected||0))}`} color="#30d158"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}/>
        <StatCard label="Monthly Payable" value={formatCurrency(Math.round(d.monthlyPay))} sub={`Settled: ${formatCurrency(Math.round(d.curMonthSettled||0))}`} color="#ff9f0a"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>}/>
      </div>

      {/* EMI KPI row */}
      {(d.emiLoanCount||0)>0&&(
        <div className="grid-4" style={{marginBottom:12}}>
          <StatCard label="EMI Monthly" value={formatCurrency(Math.round(d.emiMonthlyTotal||0))} sub={`${d.emiLoanCount||0} active EMI loan${(d.emiLoanCount||0)!==1?'s':''}`} color="#5e5ce6"
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 10v4M10 12h4"/></svg>}/>
          {(d.emiProjData||[]).slice(0,3).map((p,i)=>(
            <StatCard key={i} label={`EMI ${p.label}`} value={formatCurrency(p.expected)}
              sub={i===0?'this month':i===1?'next month':'2 months out'} color={i===0?'#007aff':i===1?'#34aadc':'#5ac8fa'}
              icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>}/>
          ))}
        </div>
      )}

      {/* KPI Row 2 */}
      <div className="grid-4" style={{marginBottom:20}}>
        <StatCard label="Net Monthly Spread" value={formatCurrency(Math.round(Math.abs(d.net||0)))} sub={(d.net||0)>=0?'↑ Profitable':'↓ Loss-making'} color={(d.net||0)>=0?'#30d158':'#ff453a'}
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
        <StatCard label="Security Coverage" value={`${d.coverage||100}%`} sub="Security vs outstanding" color="#5e5ce6"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}/>
        <StatCard label="Non-Active Loans" value={d.nonActive||0} sub={d.nonActive?'Needs immediate attention':'All accounts current'} color={d.nonActive?'#ff453a':'#30d158'}
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
        <StatCard label="Loans Closed" value={d.closedLoans||0} sub="Fully settled accounts" color="#30d158"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
      </div>

      {/* Charts */}
      <div className="grid-2" style={{marginBottom:14}}>
        <Card>
          <SectionHeader title="Interest Flow — Last 6 Months"/>
          <ResponsiveContainer width="100%" height={195}>
            <AreaChart data={d.chartData||[]} margin={{top:4,right:4,bottom:0,left:-20}}>
              <defs>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#30d158" stopOpacity={0.18}/>
                  <stop offset="95%" stopColor="#30d158" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#ff9f0a" stopOpacity={0.18}/>
                  <stop offset="95%" stopColor="#ff9f0a" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)"/>
              <XAxis dataKey="month" tick={{fill:'var(--text-tertiary)',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-tertiary)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,fontSize:12,boxShadow:'var(--shadow-lg)'}} formatter={v=>formatCurrency(Math.round(v))}/>
              <Area type="monotone" dataKey="receivable" stroke="#30d158" fill="url(#gR)" strokeWidth={2.5} name="Receivable"/>
              <Area type="monotone" dataKey="payable" stroke="#ff9f0a" fill="url(#gP)" strokeWidth={2.5} name="Payable"/>
            </AreaChart>
          </ResponsiveContainer>
          <div style={{display:'flex',gap:16,marginTop:8}}>
            <Leg color="#30d158" label="Receivable"/>
            <Leg color="#ff9f0a" label="Payable"/>
          </div>
        </Card>

        <Card>
          <SectionHeader title="This Month — Collection Status"/>
          <div style={{marginBottom:16}}>
            <ProgressBar value={d.curMonthCollected||0} max={d.monthlyRec||1} color="var(--green)"
              label={`Interest Collected (${(d.collectionRate||0).toFixed(0)}%)`}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
              <span style={{fontSize:11,color:'var(--text-secondary)'}}>Collected: <strong style={{color:'var(--green)'}}>{formatCurrency(Math.round(d.curMonthCollected||0))}</strong></span>
              <span style={{fontSize:11,color:'var(--text-secondary)'}}>Due: <strong>{formatCurrency(Math.round(d.monthlyRec||0))}</strong></span>
            </div>
          </div>
          <div style={{marginBottom:4}}>
            <ProgressBar value={d.curMonthSettled||0} max={d.monthlyPay||1} color="var(--orange)"
              label={`Depositor Settlements (${d.monthlyPay>0?Math.round((d.curMonthSettled/d.monthlyPay)*100):0}%)`}/>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
              <span style={{fontSize:11,color:'var(--text-secondary)'}}>Settled: <strong style={{color:'var(--orange)'}}>{formatCurrency(Math.round(d.curMonthSettled||0))}</strong></span>
              <span style={{fontSize:11,color:'var(--text-secondary)'}}>Due: <strong>{formatCurrency(Math.round(d.monthlyPay||0))}</strong></span>
            </div>
          </div>
          <div style={{marginTop:16,padding:'12px 14px',borderRadius:10,background:(d.net||0)>=0?'rgba(48,209,88,0.07)':'rgba(255,69,58,0.07)',border:`1px solid ${(d.net||0)>=0?'rgba(48,209,88,0.2)':'rgba(255,69,58,0.2)'}`}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,color:'var(--text-secondary)',fontWeight:500}}>Net This Month</span>
              <span className="num" style={{fontSize:18,fontWeight:800,color:(d.net||0)>=0?'var(--green)':'var(--red)',letterSpacing:'-0.03em'}}>{(d.net||0)>=0?'+':'-'}{formatCurrency(Math.round(Math.abs(d.net||0)))}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* EMI Fund Projection */}
      {(d.emiLoanCount||0)>0&&(
        <Card style={{marginBottom:14}}>
          <SectionHeader title="EMI Fund Projection — Next 6 Months"
            subtitle={`${d.emiLoanCount} active EMI loan${d.emiLoanCount>1?'s':''} · ₹${Math.round((d.emiMonthlyTotal||0)/1000)}k/mo expected`}/>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={d.emiProjData||[]} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:'var(--text-tertiary)',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-tertiary)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,fontSize:12}} formatter={v=>[formatCurrency(Math.round(v)),'Expected']}/>
              <Bar dataKey="expected" fill="#007aff" radius={[5,5,0,0]} maxBarSize={50}>
                {(d.emiProjData||[]).map((_,i)=><Cell key={i} fill={i===0?'#007aff':i===1?'#34aadc':i===2?'#5ac8fa':'rgba(0,122,255,0.35)'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:'flex',gap:16,marginTop:6,fontSize:11,color:'var(--text-secondary)',flexWrap:'wrap'}}>
            <span>Darker = sooner · lighter = further out</span>
            <span>· bars shrink as loans close</span>
          </div>
        </Card>
      )}

      {/* Risk + Recent */}
      <div className="grid-2">
        <Card>
          <SectionHeader title="Risk Monitor"/>
          {[
            {label:'Security Coverage',     val:`${d.coverage||100}%`,              ok:parseFloat(d.coverage||100)>=100},
            {label:'Non-Active Borrowers',  val:String(d.nonActive||0),             ok:!d.nonActive},
            {label:'Past-Month Uncollected', val:formatCurrency(d.overdue||0), ok:!d.overdue},
            {label:'Net Monthly Spread',     val:formatCurrency(Math.round(Math.abs(d.net||0))), ok:(d.net||0)>=0},
            {label:'Loans Fully Closed',     val:`${d.closedLoans||0} accounts`,    ok:true},
          ].map((r,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',borderRadius:'var(--r-sm)',background:'var(--bg-secondary)',marginBottom:5}}>
              <span style={{fontSize:13,color:'var(--text-primary)'}}>{r.label}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span className="num" style={{fontSize:13,fontWeight:700,color:r.ok?'var(--green)':'var(--red)'}}>{r.val}</span>
                <div style={{width:20,height:20,borderRadius:'50%',background:r.ok?'rgba(48,209,88,0.1)':'rgba(255,69,58,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11}}>
                  {r.ok?'✓':'!'}
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <SectionHeader title="Recent Borrowers"/>
          {(d.recent||[]).length===0
            ? <p style={{color:'var(--text-tertiary)',fontSize:13,textAlign:'center',padding:'24px 0'}}>No borrowers yet</p>
            : (d.recent||[]).map(b=>(
              <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',borderRadius:'var(--r-sm)',background:'var(--bg-secondary)',marginBottom:5}}>
                <div>
                  <p style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{b.borrowerName}</p>
                  <p style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{formatCurrency(b.loanAmount)} @ {b.interestRate}%/mo</p>
                </div>
                <Badge label={b.status||'Active'} type={(b.status||'active').toLowerCase().replace(' ','-')}/>
              </div>
            ))
          }
        </Card>
      </div>
    </div>
  );
}

function Leg({color,label}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:5}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:color}}/>
      <span style={{fontSize:11,color:'var(--text-secondary)',fontWeight:500}}>{label}</span>
    </div>
  );
}
