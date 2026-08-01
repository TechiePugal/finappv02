import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,BarChart,Bar,Cell} from 'recharts';
import {StatCard,Card,Badge,formatCurrency,Loader,SectionHeader,ProgressBar} from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Correct interest calculation using outstanding balance
function correctInterest(borrower, repsByBorrower){
  const reps = repsByBorrower[borrower.id] || [];
  const repaid = reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const outstanding = Math.max(0,(borrower.loanAmount||0)-repaid);
  return outstanding*(borrower.interestRate||0)/100;
}

export default function Dashboard(){
  const {user}=useAuth();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{load();},[]);//eslint-disable-line

  async function load(){
    try{
      const now = new Date();
      const curMo = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

      const [depSnap,borSnap,paySnap,repSnap,setAllSnap,emiSnap,emiColSnap,fineSnap] = await Promise.all([
        getDocs(collection(db,'deposit_master')),
        getDocs(collection(db,'borrower_master')),
        getDocs(collection(db,'borrower_interest_payments')), // fetch all — needed for both overall and monthly figures
        getDocs(collection(db,'loan_repayments')),
        getDocs(collection(db,'deposit_payments')), // fetch ALL, not just current month — overall dashboard needs full history
        getDocs(collection(db,'emi_loans')),
        getDocs(collection(db,'emi_collections')),
        getDocs(collection(db,'finance_ledger_entries')), // for Fine Income — kept separate from loan/EMI profit
      ]);

      const deps = scopeToUser(depSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      const bors = scopeToUser(borSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      const payDocs = scopeToUser(paySnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid); // ALL borrower_interest_payments
      const setDocs = scopeToUser(setAllSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid); // ALL deposit_payments
      const emiColDocs = scopeToUser(emiColSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid); // ALL emi_collections
      const fineDocs = scopeToUser(fineSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).filter(e=>e.category==='Fine Income');

      // Build repayment map
      const repsByBorrower = {};
      scopeToUser(repSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid).forEach(r=>{
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
      const curMonthCollected = payDocs.filter(d=>['Paid','Partial'].includes(d.status)&&d.month===curMo).reduce((s,d)=>s+(d.amountPaid||0),0);
      const curMonthSettled   = setDocs.filter(d=>d.status==='Paid'||d.addedToDeposit).reduce((s,d)=>s+(d.addedToDeposit?(d.addedAmount||0):(d.amountPaid||0)),0);

      const secVal = bors.reduce((s,b)=>s+(b.securityValue||0),0);
      const overdue = payDocs.filter(d=>d.status==='Unpaid'&&d.month&&d.month<curMo).reduce((s,d)=>s+(d.amountDue||0),0);
      const curMonthPays = payDocs.filter(d=>d.month===curMo);
      const uncollectedThisMonth = curMonthPays.filter(d=>d.status==='Unpaid').reduce((s,d)=>s+(d.amountDue||0),0);

      // ══ LOAN (interest business) — Total to Collect / Collected / Balance / Net Profit ══
      // Fine amounts are NEVER included here — amountPaid/amountDue already exclude fine
      // by design (fine is its own field on the payment record).
      const loanTotalDue = payDocs.reduce((s,p)=>s+(p.amountDue||0),0);
      const loanTotalCollected = payDocs.filter(p=>p.status==='Paid'||p.status==='Partial').reduce((s,p)=>s+(p.amountPaid||0),0);
      const loanBalance = Math.max(0,loanTotalDue-loanTotalCollected);
      const loanNetProfit = loanTotalCollected; // interest collected IS the profit on a loan

      // ══ DEPOSITOR — Total Deposit / Interest to Give / Interest Given / Remaining ══
      const depTotalDeposit = totalDeposits;
      const depInterestToGive = setDocs.reduce((s,p)=>s+(p.amountDue||0),0);
      const depInterestGiven = setDocs.filter(p=>p.status==='Paid'||p.addedToDeposit).reduce((s,p)=>s+(p.amountPaid||0)+(p.addedAmount||0),0);
      const depInterestRemaining = Math.max(0,depInterestToGive-depInterestGiven);

      // ══ FINE INCOME — kept OUT of loan/EMI/deposit figures above, flows ONLY into
      // the combined Net Profit bar at the very bottom, exactly as requested. ══
      const totalFineIncomeAllTime = fineDocs.reduce((s,e)=>s+(e.amount||0),0);
      const curMonthFineIncome = fineDocs.filter(e=>e.date&&e.date.startsWith(curMo)).reduce((s,e)=>s+(e.amount||0),0);

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

      const emiLoans=scopeToUser(emiSnap.docs.map(d=>({id:d.id,...d.data()})),user?.uid);
      const activeEmi=emiLoans.filter(l=>l.status==='Active');
      const closedEmi=emiLoans.filter(l=>l.status==='Closed');
      const emiMonthlyTotal=activeEmi.reduce((s,l)=>s+(l.emiAmount||0),0);
      // Overall (not monthly) EMI figures — total issued & outstanding across all EMI loans
      const emiTotalIssued=emiLoans.reduce((s,l)=>s+(l.loanAmount||0),0);
      const emiTotalOutstanding=activeEmi.reduce((s,l)=>{
        const perPeriodPrincipal=(l.loanAmount||0)/(l.totalPeriods||1);
        return s+Math.max(0,(l.loanAmount||0)-(perPeriodPrincipal*(l.paidPeriods||0)));
      },0);
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
      // ══ EMI LOAN — Total to Collect / Collected / Balance / Net Profit ══
      // Fine is stored separately on emi_collections (its own 'fine' field, distinct from
      // 'amount') and is NEVER counted here — matching the loan-side rule exactly.
      const emiTotalToCollect = emiLoans.reduce((s,l)=>s+((l.emiAmount||0)*(l.totalPeriods||0)),0); // full schedule value
      const emiTotalCollected = emiColDocs.filter(c=>c.status==='Paid').reduce((s,c)=>s+(c.amount||0),0); // fine excluded
      const emiBalance = Math.max(0,emiTotalToCollect-emiTotalCollected);
      // Net profit on EMI = collected amount minus the PRINCIPAL portion of what's been paid
      // (principal recovery isn't profit — only the interest portion collected is).
      const emiPrincipalCollected = emiLoans.reduce((s,l)=>{
        const perPeriodPrincipal=(l.loanAmount||0)/(l.totalPeriods||1);
        return s+(perPeriodPrincipal*(l.paidPeriods||0));
      },0);
      const emiNetProfit = Math.max(0,emiTotalCollected-emiPrincipalCollected);

      // ══ Combined Net Profit bar — Loan + EMI profit, minus interest paid to depositors,
      // PLUS fine income added separately here (never inside the per-category figures above) ══
      const combinedNetProfit = loanNetProfit + emiNetProfit - depInterestGiven + totalFineIncomeAllTime;

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
        emiClosedCount:closedEmi.length, emiTotalIssued, emiTotalOutstanding,
        loanTotalDue, loanTotalCollected, loanBalance, loanNetProfit,
        depTotalDeposit, depInterestToGive, depInterestGiven, depInterestRemaining,
        emiTotalToCollect, emiTotalCollected, emiBalance, emiNetProfit,
        totalFineIncomeAllTime, curMonthFineIncome, combinedNetProfit,
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

      {/* LOANS — Total to Collect / Collected / Balance / Net Profit (fine excluded) */}
      <SectionHeader title="📋 Loans — Overview"/>
      <div className="grid-4" style={{marginBottom:20}}>
        <StatCard label="Total to Collect" value={formatCurrency(Math.round(d.loanTotalDue||0))} sub="All-time interest recorded due" color="#ff9500"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>}/>
        <StatCard label="Total Collected" value={formatCurrency(Math.round(d.loanTotalCollected||0))} sub="Interest only — fine excluded" color="#0a84ff"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}/>
        <StatCard label="Balance to Collect" value={formatCurrency(Math.round(d.loanBalance||0))} sub={`${d.activeBorrowers||0} active loans`} color="#ff453a"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>}/>
        <StatCard label="Net Profit (Loans)" value={formatCurrency(Math.round(d.loanNetProfit||0))} sub="Interest collected = profit" color="#30d158"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}/>
      </div>

      {/* DEPOSITS — Total Deposit / Interest to Give / Interest Given / Remaining */}
      <SectionHeader title="🏦 Deposits — Overview"/>
      <div className="grid-4" style={{marginBottom:20}}>
        <StatCard label="Total Deposit Amount" value={formatCurrency(Math.round(d.depTotalDeposit||0))} sub={`${d.activeDeposits||0} active investors`} color="#bf5af2"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>}/>
        <StatCard label="Interest to Give" value={formatCurrency(Math.round(d.depInterestToGive||0))} sub="All-time, recorded due" color="#ff9500"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/></svg>}/>
        <StatCard label="Interest Given" value={formatCurrency(Math.round(d.depInterestGiven||0))} sub="Cash paid + compounded" color="#5e5ce6"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}/>
        <StatCard label="Interest Remaining" value={formatCurrency(Math.round(d.depInterestRemaining||0))} sub="Still owed to depositors" color="#ff453a"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>}/>
      </div>

      {/* EMI LOANS — Total to Collect / Collected / Balance / Net Profit (fine excluded) */}
      {(d.emiLoanCount||0)+(d.emiClosedCount||0)>0&&(
        <>
        <SectionHeader title="📆 EMI Loans — Overview"/>
        <div className="grid-4" style={{marginBottom:20}}>
          <StatCard label="Total to Collect" value={formatCurrency(Math.round(d.emiTotalToCollect||0))} sub="Full schedule value, all EMI loans" color="#ff9500"
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/></svg>}/>
          <StatCard label="Total Collected" value={formatCurrency(Math.round(d.emiTotalCollected||0))} sub="Fine excluded" color="#0a84ff"
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}/>
          <StatCard label="Balance to Collect" value={formatCurrency(Math.round(d.emiBalance||0))} sub={`${d.emiLoanCount||0} active EMI loan${(d.emiLoanCount||0)!==1?'s':''}`} color="#ff453a"
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 10v4M10 12h4"/></svg>}/>
          <StatCard label="Net Profit (EMI)" value={formatCurrency(Math.round(d.emiNetProfit||0))} sub="Collected minus principal recovered" color="#30d158"
            icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}/>
        </div>
        </>
      )}

      {/* Combined Net Profit bar — Loan + EMI profit − depositor interest paid,
          PLUS fine income (kept OUT of every figure above, added here only) */}
      <Card style={{marginBottom:20, background:'linear-gradient(135deg,rgba(48,209,88,0.06),rgba(10,132,255,0.04))', border:'1px solid rgba(48,209,88,0.18)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:14}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Combined Net Profit</div>
            <div style={{fontSize:30,fontWeight:900,color:(d.combinedNetProfit||0)>=0?'var(--green)':'var(--red)',letterSpacing:'-0.6px'}}>
              {(d.combinedNetProfit||0)>=0?'+':'-'}{formatCurrency(Math.round(Math.abs(d.combinedNetProfit||0)))}
            </div>
          </div>
          <div style={{display:'flex',gap:20,flexWrap:'wrap',fontSize:12.5,color:'var(--text-secondary)'}}>
            <span>Loan Profit: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(Math.round(d.loanNetProfit||0))}</strong></span>
            <span>EMI Profit: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(Math.round(d.emiNetProfit||0))}</strong></span>
            <span>− Interest Paid: <strong style={{color:'#ff453a'}}>{formatCurrency(Math.round(d.depInterestGiven||0))}</strong></span>
            <span>+ Fine Income: <strong style={{color:'#ff9500'}}>{formatCurrency(Math.round(d.totalFineIncomeAllTime||0))}</strong></span>
          </div>
        </div>
        <div style={{marginTop:14,height:10,borderRadius:99,background:'rgba(0,0,0,0.06)',overflow:'hidden',display:'flex'}}>
          {(() => {
            const parts=[
              {v:Math.max(0,d.loanNetProfit||0),c:'#0a84ff'},
              {v:Math.max(0,d.emiNetProfit||0),c:'#5e5ce6'},
              {v:Math.max(0,d.totalFineIncomeAllTime||0),c:'#ff9500'},
            ];
            const total=parts.reduce((s,p)=>s+p.v,0)||1;
            return parts.map((p,i)=>(<div key={i} style={{width:`${(p.v/total)*100}%`,background:p.c}}/>));
          })()}
        </div>
        <div style={{display:'flex',gap:16,marginTop:8}}>
          <Leg color="#0a84ff" label="Loan Interest"/>
          <Leg color="#5e5ce6" label="EMI Interest"/>
          <Leg color="#ff9500" label="Fine Income"/>
        </div>
      </Card>

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
          <SectionHeader title="Overall Position"/>
          <div style={{display:'grid',gap:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:'rgba(10,132,255,0.06)'}}>
              <span style={{fontSize:12.5,color:'var(--text-secondary)',fontWeight:500}}>Total Outstanding (Loans)</span>
              <span style={{fontSize:16,fontWeight:800,color:'#0a84ff'}}>{formatCurrency(Math.round(d.totalOutstanding||0))}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:'rgba(191,90,242,0.06)'}}>
              <span style={{fontSize:12.5,color:'var(--text-secondary)',fontWeight:500}}>Total Deposits Held</span>
              <span style={{fontSize:16,fontWeight:800,color:'#bf5af2'}}>{formatCurrency(Math.round(d.totalDeposits||0))}</span>
            </div>
            {(d.emiTotalOutstanding||0)>0&&(
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:10,background:'rgba(94,92,230,0.06)'}}>
                <span style={{fontSize:12.5,color:'var(--text-secondary)',fontWeight:500}}>EMI Outstanding</span>
                <span style={{fontSize:16,fontWeight:800,color:'#5e5ce6'}}>{formatCurrency(Math.round(d.emiTotalOutstanding||0))}</span>
              </div>
            )}
            <div style={{marginTop:4,padding:'12px 14px',borderRadius:10,background:(d.net||0)>=0?'rgba(48,209,88,0.07)':'rgba(255,69,58,0.07)',border:`1px solid ${(d.net||0)>=0?'rgba(48,209,88,0.2)':'rgba(255,69,58,0.2)'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:12,color:'var(--text-secondary)',fontWeight:500}}>Net Spread (Receivable − Payable)</span>
                <span className="num" style={{fontSize:18,fontWeight:800,color:(d.net||0)>=0?'var(--green)':'var(--red)',letterSpacing:'-0.03em'}}>{(d.net||0)>=0?'+':'-'}{formatCurrency(Math.round(Math.abs(d.net||0)))}</span>
              </div>
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
