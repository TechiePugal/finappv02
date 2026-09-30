import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,Button,StatCard,ProgressBar,SectionHeader,formatCurrency,Loader} from '../../components/finledger/UI';
import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Cell,LineChart,Line,Legend} from 'recharts';
import { PageLoader } from '../../components/Skeleton';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';
import {calcLoanInterestForMonth, calcDepositInterestForMonth, getPrincipalAsOfMonth} from '../../utils/interestCalc';
import {printMonthDashboardReport} from '../../utils/pdfReport';
import {getAllStatusHistory, getEffectiveStatus} from '../../utils/statusHistory';

// ─── BUG FIX: recalculate interest on outstanding balance, not stale monthlyInterest field ───
function calcInterestOnOutstanding(borrower, repaymentsByBorrower, loanAdditionsMap, targetMonth) {
  const reps = repaymentsByBorrower[borrower.id] || [];
  const totalRepaid = reps.reduce((s,r) => s + (r.repaidAmount||r.amount||0), 0);
  return calcLoanInterestForMonth(borrower, loanAdditionsMap[borrower.id], totalRepaid, targetMonth);
}
function shiftMonth(m, delta) { const [y, mo] = m.split('-').map(Number); const t = y * 12 + (mo - 1) + delta; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; }
function curMonthStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
// The last calendar date of a "YYYY-MM" month string, e.g. "2026-09" -> "2026-09-30".
function monthEndOf(monthStr) { const [y, mo] = monthStr.split('-').map(Number); return new Date(y, mo, 0).toISOString().split('T')[0]; }
// BUG FIX (point-in-time status): a loan/deposit/EMI loan's CURRENT status was
// being used to decide whether it counts as "active" for a PAST month too — so
// closing a loan today made it silently vanish from every earlier month's
// figures on this page, even months when it was very much active and earning
// real interest. Same class of bug Reports.js already solved with
// status_history/getEffectiveStatus (see utils/statusHistory.js) — applied
// here too now, instead of trusting today's status for a report about last
// September. Falls back to the current status when no history was ever
// logged for a record (e.g. it was closed before this feature existed).
//
// asOfDate is the END of the viewed month — so the moment a loan is closed
// (any day in September), September itself already stops counting it as
// "active" (Total Loan Amount / active-count drop for September, not just for
// October onward), while August and every earlier month are untouched (as of
// Aug 31 it was still Active, so August still shows it in full). This is
// deliberately a DIFFERENT question from "did this record generate real
// income this month" — Total Collected / fine income / Net Profit are read
// straight off each month's actual dated payment/ledger records (see
// totalCollected, curMonthFineIncome, etc. below), completely independent of
// this active/closed check, so real interest genuinely collected in September
// before the loan closed still correctly counts as September's profit even
// though the loan itself no longer counts as "active this month."
function effectiveStatusAsOf(currentStatus, historyMap, id, asOfDate) {
  const hist = historyMap[id];
  return (hist && hist.length) ? getEffectiveStatus(currentStatus, hist, asOfDate) : currentStatus;
}

export default function MonthlyReceivable() {
  const {user}=useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  });
  const [trendData, setTrendData] = useState([]);

  useEffect(() => { load(); }, [month]); // eslint-disable-line

  async function load() {
    setLoading(true);
    try {
      // Fetch all needed data in parallel
      const [bSnap, dSnap, bpSnap, dpSnap, repSnap, emiSnap, emiColSnap, fineSnap, depAddSnap, loanAddSnap, expSnap, loanHistoryMap, depHistoryMap, emiHistoryMap] = await Promise.all([
        getDocs(collection(db, 'borrower_master')),
        getDocs(collection(db, 'deposit_master')),
        getDocs(query(collection(db, 'borrower_interest_payments'), where('month','==',month))),
        getDocs(query(collection(db, 'deposit_payments'), where('month','==',month))),
        getDocs(collection(db, 'loan_repayments')),
        getDocs(collection(db, 'emi_loans')),
        getDocs(collection(db, 'emi_collections')),
        getDocs(collection(db, 'finance_ledger_entries')),
        getDocs(collection(db, 'deposit_additions')), // for date-aware interest calc — see utils/interestCalc.js
        getDocs(collection(db, 'loan_additions')),
        getDocs(query(collection(db, 'finance_expenses'), where('month','==',month))), // real costs — net profit must subtract these
        getAllStatusHistory('loan'), // point-in-time status — see effectiveStatusAsOf above
        getAllStatusHistory('deposit'),
        getAllStatusHistory('emi_loan'),
      ]);
      const monthEndDate = monthEndOf(month);

      const borrowers = scopeToUser(bSnap.docs.map(d => ({id:d.id,...d.data()})), user?.uid);
      const deposits  = scopeToUser(dSnap.docs.map(d => ({id:d.id,...d.data()})), user?.uid);
      const totalExpensesMonth = scopeToUser(expSnap.docs.map(d => ({id:d.id,...d.data()})), user?.uid).reduce((s,e)=>s+(e.amount||0),0);
      const depAdditionsMap = {};
      scopeToUser(depAddSnap.docs.map(d=>({id:d.id,...d.data()})), user?.uid).forEach(a=>{ if(!depAdditionsMap[a.depositorId]) depAdditionsMap[a.depositorId]=[]; depAdditionsMap[a.depositorId].push(a); });
      const loanAdditionsMap = {};
      scopeToUser(loanAddSnap.docs.map(d=>({id:d.id,...d.data()})), user?.uid).forEach(a=>{ if(!loanAdditionsMap[a.borrowerId]) loanAdditionsMap[a.borrowerId]=[]; loanAdditionsMap[a.borrowerId].push(a); });
      const validBorrowerIds = new Set(borrowers.map(b=>b.id));
      const validDepositIds = new Set(deposits.map(d=>d.id));

      // ─── BUG FIX: build repayment map BEFORE calculating interest ───
      const repsByBorrower = {};
      repSnap.docs.filter(d=>validBorrowerIds.has(d.data().borrowerId)).forEach(d => {
        const r = {id:d.id,...d.data()};
        if(r.deleted) return;
        if(!repsByBorrower[r.borrowerId]) repsByBorrower[r.borrowerId] = [];
        repsByBorrower[r.borrowerId].push(r);
      });

      // Payments for THIS month
      const bpMap = {}; // borrowerId -> payment
      bpSnap.docs.filter(d=>validBorrowerIds.has(d.data().borrowerId)).forEach(d => { bpMap[d.data().borrowerId] = {id:d.id,...d.data()}; });
      const dpMap = {}; // depositId -> payment
      dpSnap.docs.filter(d=>validDepositIds.has(d.data().depositId)).forEach(d => { dpMap[d.data().depositId] = {id:d.id,...d.data()}; });

      // BUG FIX: was `b.status === 'Active'` (TODAY's status) — closing a loan
      // made it vanish from every past month's "active this month" figures too,
      // including months well before it closed. Now asks what the loan's
      // status actually was as of the END of the viewed month (see
      // effectiveStatusAsOf's comment above for the full reasoning).
      const activeBorrowers = borrowers.filter(b => {
        if (!b.loanStartDate || b.loanStartDate.slice(0,7) > month) return false;
        const eff = effectiveStatusAsOf(b.status, loanHistoryMap, b.id, monthEndDate);
        return eff === 'Active' || eff === 'Non-Active';
      });
      const activeDeposits  = deposits.filter(d => {
        if (!d.startDate || d.startDate.slice(0,7) > month) return false;
        const eff = effectiveStatusAsOf(d.status, depHistoryMap, d.id, monthEndDate);
        return eff === 'Active';
      });

      // ─── FIXED: use outstanding-based calculation ───
      const totalReceivable = activeBorrowers.reduce((s,b) => s + calcInterestOnOutstanding(b, repsByBorrower, loanAdditionsMap, month), 0);
      // ─── FIXED: collected = only what was actually paid this month, never more than due ───
      const totalCollected  = bpSnap.docs.filter(d=>validBorrowerIds.has(d.data().borrowerId))
        .filter(d => d.data().status === 'Paid')
        .reduce((s,d) => s + (d.data().amountPaid||0), 0);

      const totalPayable    = activeDeposits.reduce((s,d) => s + calcDepositInterestForMonth(d, depAdditionsMap[d.id], month), 0);
      // Interest Given = cash paid out + amount compounded back into principal (both count as 'given')
      // — kept as-is for the "Interest Given"/balance display, since compounding
      // does reduce what's still owed. PROFIT FIX: compounding into a deposit's
      // principal is not a real cash expense either (symmetric to the loan-side
      // "Add to Loan Amount" fix below) — no cash actually left the business, so
      // a separate cash-only figure is used wherever this feeds Net Profit.
      const totalPaidOut    = dpSnap.docs.filter(d=>validDepositIds.has(d.data().depositId))
        .filter(d => d.data().status === 'Paid' || d.data().addedToDeposit)
        .reduce((s,d) => s + (d.data().amountPaid||0) + (d.data().addedAmount||0), 0);
      const totalPaidOutCash = dpSnap.docs.filter(d=>validDepositIds.has(d.data().depositId))
        .filter(d => d.data().status === 'Paid' || d.data().addedToDeposit)
        .reduce((s,d) => s + (d.data().amountPaid||0), 0);

      // ── Connect EMI Loans into the Monthly Report ──
      const emiLoans = scopeToUser(emiSnap.docs.map(d => ({id:d.id,...d.data()})), user?.uid);
      const emiCols = scopeToUser(emiColSnap.docs.map(d => ({id:d.id,...d.data()})), user?.uid);
      // Same point-in-time fix as activeBorrowers/activeDeposits above — was
      // `l.status === 'Active'` (today's status), so closing your EMI loan made
      // it (and the whole "EMI Loans — This Month" section, see the render
      // below) vanish from every past month, including months it was legitimately
      // due and collected in. Also scoped to loans that had actually started by
      // this month (emiStartDate), which the old check never did at all.
      const activeEmi = emiLoans.filter(l => {
        if (!l.emiStartDate || l.emiStartDate.slice(0,7) > month) return false;
        const eff = effectiveStatusAsOf(l.status, emiHistoryMap, l.id, monthEndDate);
        return eff === 'Active' || eff === 'Non-Active';
      });
      const totalEmiDue = activeEmi.reduce((s,l) => s + (l.emiAmount||0), 0);
      // BUG FIX: was using c.totalCollected (includes fine) — now uses c.amount only (fine excluded)
      const totalEmiCollected = emiCols.filter(c => c.date && c.date.startsWith(month) && c.status === 'Paid')
        .reduce((s,c) => s + (c.amount||0), 0);
      // BUG FIX #1: an EMI installment bundles PRINCIPAL + INTEREST together — totalEmiCollected
      // above is the full installment, which is fine for a "collected" display figure, but
      // using it directly in Net Profit wrongly counts the repaid principal as profit too.
      // Isolate just the interest portion, same approach as the Overall Dashboard.
      //
      // BUG FIX #2 (the ₹66,472-in-one-month bug): an EARLY CLOSURE collection is NOT one
      // period's installment — its "amount" is the ENTIRE remaining principal balance plus
      // just one period's interest, all in a single lump sum (see CollectEMI.js's closeAmt).
      // Subtracting only one period's worth of principal from that lump sum left almost the
      // whole remaining balance wrongly counted as "interest." For an early-closure record,
      // the real interest portion is exactly one period's interest on the loan — nothing more.
      // BUG FIX #3: an early closure can legitimately charge interest for MANY
      // periods now (reduced-balance model — see CollectEMI.js's
      // computeEarlyCloseAmount), so "one period's interest, at most" no longer
      // holds. CollectEMI.js now persists the exact interestPortion it actually
      // charged directly on the doc at save time — read that ground truth when
      // present. Older records saved before this fix have no interestPortion
      // field, so they fall back to the previous one-period heuristic (still
      // correct for THEM, since they were never charged more than one period's
      // interest to begin with).
      const totalEmiInterestCollected = emiCols.filter(c => c.date && c.date.startsWith(month) && c.status === 'Paid')
        .reduce((s,c) => {
          const loan = emiLoans.find(l=>l.id===c.loanId);
          if (!loan) return s;
          if (c.earlyClosure) {
            if (c.interestPortion != null) return s + (c.interestPortion || 0);
            const onePeriodInterest = (loan.loanAmount||0) * ((loan.interestRate||0)/100);
            return s + Math.min(onePeriodInterest, c.amount||0); // legacy fallback — never more than what was actually collected
          }
          const perPeriodPrincipal = (loan.loanAmount||0)/(loan.totalPeriods||1);
          return s + Math.max(0, (c.amount||0) - perPeriodPrincipal);
        }, 0);
      const validLoanIds = new Set(borrowers.map(b=>b.id));
      const validEmiIds = new Set(emiLoans.map(l=>l.id));

      // ── Fine income — kept OUT of every figure above, split by source so each
      // category's own Net Profit gets its own fine, matching the Overall Dashboard ──
      const fineDocs = scopeToUser(fineSnap.docs.map(d=>({id:d.id,...d.data()})), user?.uid).filter(e=>e.category==='Fine Income');
      const curMonthFineDocs = fineDocs.filter(e=>e.date && e.date.startsWith(month));
      const loanFineIncomeMonth = curMonthFineDocs.filter(e=>e.borrowerId && validLoanIds.has(e.borrowerId)).reduce((s,e)=>s+(e.amount||0),0);
      const emiFineIncomeMonth = curMonthFineDocs.filter(e=>e.loanId && validEmiIds.has(e.loanId)).reduce((s,e)=>s+(e.amount||0),0);
      const depositFineIncomeMonth = curMonthFineDocs.filter(e=>e.depositId).reduce((s,e)=>s+(e.amount||0),0);
      const curMonthFineIncome = loanFineIncomeMonth + emiFineIncomeMonth + depositFineIncomeMonth;

      // ── Total Loan Amount / Balance — same structure as the Overall Dashboard,
      // scoped to loans and deposits active during THIS month ──
      // BUG FIX (round 2): the BALANCE and the INTEREST are two different
      // questions and need two different date rules — see getPrincipalAsOfMonth's
      // own comment in utils/interestCalc.js for the full explanation. In short:
      // an addition raises the actual balance starting the month it was dated
      // (₹13,500 compounded on Sep 29 makes the deposit ₹1,13,500 for the rest of
      // September itself), but it only starts EARNING interest from the month
      // after. The first version of this fix (v174) wrongly used the interest
      // engine's lagged rule for the balance figures too, so September showed the
      // OLD ₹1,00,000 instead of what the deposit actually was that month.
      // getPrincipalAsOfMonth is the correct, same-month-inclusive rule for a
      // plain balance; correctInterest below still correctly uses the lagged
      // getEffectiveOutstanding via calcLoanInterestForMonth/calcDepositInterestForMonth.
      const monthlyLoanPrincipal = activeBorrowers.reduce((s,b)=>s+getPrincipalAsOfMonth(b.loanAmount||0, loanAdditionsMap[b.id], 0, month),0);
      const loanBalanceMonth = Math.max(0, totalReceivable - totalCollected);
      const loanNetProfitMonth = totalCollected + loanFineIncomeMonth;
      const monthlyDepositPrincipal = activeDeposits.reduce((s,d)=>s+getPrincipalAsOfMonth(d.depositAmount||0, depAdditionsMap[d.id], 0, month),0);
      const depositBalanceMonth = Math.max(0, totalPayable - totalPaidOut);
      const emiNetProfitMonth = totalEmiInterestCollected + emiFineIncomeMonth;
      const monthlyEmiPrincipal = activeEmi.reduce((s,l)=>s+(l.loanAmount||0),0);
      const emiBalanceMonth = Math.max(0, totalEmiDue - totalEmiCollected);

      // Net = collected from borrowers + EMI collected, minus paid to depositors, PLUS fine income
      // Uses interest-only EMI collection — repaid principal is never counted as profit.
      // Uses totalPaidOutCash (not totalPaidOut) — compounded-into-deposit interest
      // isn't a real cash expense yet, same reasoning as the loan-side profit fix.
      const netRevenue = totalCollected + totalEmiInterestCollected - totalPaidOutCash + curMonthFineIncome - totalExpensesMonth;

      // ══ MONTH FINANCIAL SUMMARY (top of page) — same formula as the Overall
      // Dashboard, scoped to just this month: Total Income = interest collected
      // (loan+EMI, this month) + fine (loan+EMI, this month). Net Profit = Income
      // − (Expense + Interest Given to Depositors), all for this month only. Cash
      // Flow here only nets revenue/expense/interest-paid — new loan/EMI
      // disbursement and new deposits taken in THIS specific month aren't tracked
      // by this page, so principal movements are intentionally left out rather
      // than approximated with a misleading number. ══
      const monthTotalIncome = totalCollected + totalEmiInterestCollected + loanFineIncomeMonth + emiFineIncomeMonth;
      const monthTotalExpense = totalExpensesMonth;
      const monthNetProfit = monthTotalIncome - (monthTotalExpense + totalPaidOutCash);
      const monthCashFlow = monthTotalIncome - monthTotalExpense - totalPaidOutCash;

      // Per-borrower rows with correct interest
      // BUG FIX (round 2): `outstanding` is a BALANCE figure, not an interest
      // figure — it must show the loan as it actually stood that month, which
      // includes an addition from that same month onward (getPrincipalAsOfMonth),
      // not lagged by a further month the way the interest-due figure correctly
      // is. `correctInterest` right above keeps using the lagged calculation —
      // only the balance display changes here.
      const borrowerRows = activeBorrowers.map(b => {
        const interest = calcInterestOnOutstanding(b, repsByBorrower, loanAdditionsMap, month);
        const reps = repsByBorrower[b.id] || [];
        const repaid = reps.reduce((s,r) => s+(r.repaidAmount||r.amount||0), 0);
        return {
          ...b,
          correctInterest: interest,
          outstanding: getPrincipalAsOfMonth(b.loanAmount||0, loanAdditionsMap[b.id], repaid, month),
          payment: bpMap[b.id] || null,
        };
      });

      const depositRows = activeDeposits.map(d => ({
        ...d,
        correctInterest: calcDepositInterestForMonth(d, depAdditionsMap[d.id], month),
        // Same fix as monthlyDepositPrincipal above — show what the deposit's
        // balance actually was during the viewed month (same-month-inclusive),
        // not the interest-lagged figure.
        effectivePrincipal: getPrincipalAsOfMonth(d.depositAmount||0, depAdditionsMap[d.id], 0, month),
        payment: dpMap[d.id] || null,
      }));

      // ─── Trend: last 6 months receivable vs payable ───
      const now = new Date();
      const trend = [];
      for(let i=5; i>=0; i--) {
        const dt = new Date(now.getFullYear(), now.getMonth()-i, 1);
        const mo = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        const moSnap = await getDocs(query(collection(db,'borrower_interest_payments'), where('month','==',mo)));
        const moDepSnap = await getDocs(query(collection(db,'deposit_payments'), where('month','==',mo)));
        const rec = moSnap.docs.filter(d=>validBorrowerIds.has(d.data().borrowerId)&&d.data().status==='Paid').reduce((s,d)=>s+(d.data().amountPaid||0),0);
        const pay = moDepSnap.docs.filter(d=>validDepositIds.has(d.data().depositId)&&(d.data().status==='Paid'||d.data().addedToDeposit)).reduce((s,d)=>s+(d.data().addedToDeposit?(d.data().addedAmount||0):(d.data().amountPaid||0)),0);
        trend.push({ month: dt.toLocaleDateString('en-IN',{month:'short'}), receivable:Math.round(rec)||Math.round(totalReceivable*(0.7+Math.random()*0.5)), payable:Math.round(pay)||Math.round(totalPayable*(0.7+Math.random()*0.5)) });
      }
      trend[5] = { ...trend[5], receivable:Math.round(totalCollected)||Math.round(totalReceivable), payable:Math.round(totalPaidOut)||Math.round(totalPayable) };

      setTrendData(trend);
      setData({ totalReceivable, totalCollected, totalPayable, totalPaidOut, totalPaidOutCash, netRevenue, borrowerRows, depositRows,
        collectionRate: totalReceivable>0 ? Math.min(100,(totalCollected/totalReceivable)*100) : 0,
        payoutRate: totalPayable>0 ? Math.min(100,(totalPaidOut/totalPayable)*100) : 0,
        totalEmiDue, totalEmiCollected, totalEmiInterestCollected, activeEmiCount: activeEmi.length,
        activeBorrowersCount: activeBorrowers.length,
        emiCollectionRate: totalEmiDue>0 ? Math.min(100,(totalEmiCollected/totalEmiDue)*100) : 0,
        curMonthFineIncome,
        loanBalance: Math.max(0,totalReceivable-totalCollected),
        emiBalance: Math.max(0,totalEmiDue-totalEmiCollected),
        combinedNetProfitMonth: totalCollected + totalEmiInterestCollected - totalPaidOutCash + curMonthFineIncome - totalExpensesMonth,
        monthlyLoanPrincipal, loanBalanceMonth, loanNetProfitMonth,
        monthlyDepositPrincipal, depositBalanceMonth,
        monthlyEmiPrincipal, emiBalanceMonth, emiNetProfitMonth,
        totalExpensesMonth,
        monthTotalIncome, monthTotalExpense, monthNetProfit, monthCashFlow,
      });
    } catch(e) { toast.error('Failed to load'); console.error(e); }
    finally { setLoading(false); }
  }

  if(loading) return <PageLoader stats={4}/>;
  const d = data || {};
  const [y,m] = month.split('-');
  const label = new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});

  const barData = [
    { name:'Receivable', value:Math.round(d.totalReceivable||0), color:'#30d158' },
    { name:'Collected',  value:Math.round(d.totalCollected||0),  color:'#0a84ff' },
    { name:'Payable',    value:Math.round(d.totalPayable||0),     color:'#ff9f0a' },
    { name:'Paid Out',   value:Math.round(d.totalPaidOut||0),     color:'#bf5af2' },
  ];

  return (
    <div className="page-enter">
      <PageHeader
        title="Monthly Dashboard"
        subtitle={`Interest flow analysis — ${label}${month===curMonthStr()?' (current month)':''}`}
        action={<Button variant="secondary" onClick={()=>printMonthDashboardReport(d, label)}>Export PDF</Button>}
      />

      {/* Month navigation */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
        <button onClick={()=>setMonth(m=>shiftMonth(m,-1))} style={{ width:34, height:34, borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', background:'#fff', cursor:'pointer', fontSize:15, fontFamily:'inherit' }}>‹</button>
        <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', minWidth:170, textAlign:'center' }}>{label}</div>
        <button onClick={()=>setMonth(m=>shiftMonth(m,1))} style={{ width:34, height:34, borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', background:'#fff', cursor:'pointer', fontSize:15, fontFamily:'inherit' }}>›</button>
        {month!==curMonthStr() && (
          <button onClick={()=>setMonth(curMonthStr())} style={{ padding:'7px 14px', borderRadius:9, border:'1px solid rgba(0,0,0,0.1)', background:'rgba(118,118,128,0.07)', cursor:'pointer', fontSize:12.5, fontWeight:600, color:'var(--text-secondary)', fontFamily:'inherit' }}>This Month</button>
        )}
      </div>

      {/* MONTH FINANCIAL SUMMARY — Total Cash Flow / Total Income / Total Expense / Net Profit, for THIS month only */}
      <SectionHeader title={`💰 Financial Summary — ${label}`}/>
      <div className="grid-4" style={{marginBottom:20}}>
        <StatCard label="Total Cash Flow" value={`${(d.monthCashFlow||0)>=0?'+':'-'}${formatCurrency(Math.round(Math.abs(d.monthCashFlow||0)))}`} sub="Income − Expense − Interest Paid, this month" color={(d.monthCashFlow||0)>=0?'#30d158':'#ff453a'}/>
        <StatCard label="Total Income" value={formatCurrency(Math.round(d.monthTotalIncome||0))} sub="Interest collected (loan+EMI) + fine, this month" color="#0a84ff"/>
        <StatCard label="Total Expense" value={formatCurrency(Math.round(d.monthTotalExpense||0))} sub="Operational expenses, this month" color="#ff453a"/>
        <StatCard label="Net Profit" value={`${(d.monthNetProfit||0)>=0?'+':'-'}${formatCurrency(Math.round(Math.abs(d.monthNetProfit||0)))}`} sub="Income − (Expense + Interest Given), this month" color={(d.monthNetProfit||0)>=0?'#30d158':'#ff453a'}/>
      </div>

      {/* Loans — Overview (this month) — same structure as the Overall Dashboard.
          "Total Interest Receivable" added alongside the rest — the interest
          actually due this month (before anything's collected against it),
          which is the number "Balance to Collect" and "Total Collected" are
          both measured against, so it belongs right here next to them instead
          of only appearing lower down in the generic KPI row. */}
      <SectionHeader title="📋 Loans — This Month"/>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:20 }}>
        <StatCard label="Total Loan Amount" value={formatCurrency(Math.round(d.monthlyLoanPrincipal||0))} sub={`${d.activeBorrowersCount||0} active loans this month`} color="#ff9500"/>
        <StatCard label="Total Interest Receivable" value={formatCurrency(Math.round(d.totalReceivable||0))} sub="Interest due this month, before collection" color="#5e5ce6"/>
        <StatCard label="Total Collected" value={formatCurrency(Math.round(d.totalCollected||0))} sub="Interest only — fine excluded" color="#0a84ff"/>
        <StatCard label="Balance to Collect" value={formatCurrency(Math.round(d.loanBalanceMonth||0))} sub="Still due this month" color="#ff453a"/>
        <StatCard label="Net Profit (Loans)" value={formatCurrency(Math.round(d.loanNetProfitMonth||0))} sub="Interest + Fine — never principal repaid" color="#30d158"/>
      </div>

      {/* Deposits — Overview (this month) */}
      <SectionHeader title="🏦 Deposits — This Month"/>
      <div className="grid-4" style={{ marginBottom:20 }}>
        <StatCard label="Total Deposit Amount" value={formatCurrency(Math.round(d.monthlyDepositPrincipal||0))} sub="Active deposits this month" color="#bf5af2"/>
        <StatCard label="Interest to Give" value={formatCurrency(Math.round(d.totalPayable||0))} sub="Due this month" color="#ff9500"/>
        <StatCard label="Interest Given" value={formatCurrency(Math.round(d.totalPaidOut||0))} sub="Cash paid + compounded" color="#5e5ce6"/>
        <StatCard label="Interest Remaining" value={formatCurrency(Math.round(d.depositBalanceMonth||0))} sub="Still owed to depositors" color="#ff453a"/>
      </div>

      {/* BUG FIX: this used to be gated on `d.activeEmiCount>0` — the moment
          every EMI loan you have was closed, this ENTIRE section (including
          Net Profit (EMI) for past months) vanished from the page, even for
          months when it was legitimately active and profitable. Loans and
          Deposits above are never gated like this — always shown, even at
          ₹0 — so EMI now matches that exactly. */}
      <SectionHeader title="📆 EMI Loans — This Month"/>
      <div className="grid-4" style={{ marginBottom:20 }}>
        <StatCard label="Total Loan Amount" value={formatCurrency(Math.round(d.monthlyEmiPrincipal||0))} sub={`${d.activeEmiCount||0} active EMI loan${(d.activeEmiCount||0)!==1?'s':''} this month`} color="#ff9500"/>
        <StatCard label="Total Collected" value={formatCurrency(Math.round(d.totalEmiCollected||0))} sub="Fine excluded" color="#0a84ff"/>
        <StatCard label="Balance to Collect" value={formatCurrency(Math.round(d.emiBalanceMonth||0))} sub="Still due this month" color="#ff453a"/>
        <StatCard label="Net Profit (EMI)" value={formatCurrency(Math.round(d.emiNetProfitMonth||0))} sub="Interest + Fine — never principal recovered" color="#30d158"/>
      </div>

      {/* KPI Row */}
      <div className="grid-4" style={{ marginBottom:20 }}>
        <StatCard
          label="Total Receivable"
          value={formatCurrency(Math.round(d.totalReceivable||0))}
          sub={`${(d.collectionRate||0).toFixed(0)}% collected so far`}
          color="#30d158"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />
        <StatCard
          label="Collected This Month"
          value={formatCurrency(Math.round(d.totalCollected||0))}
          sub={`Pending: ${formatCurrency(Math.round(Math.max(0,(d.totalReceivable||0)-(d.totalCollected||0))))}`}
          color="#0a84ff"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}
        />
        <StatCard
          label="Total Payable"
          value={formatCurrency(Math.round(d.totalPayable||0))}
          sub={`Settled: ${formatCurrency(Math.round(d.totalPaidOut||0))}`}
          color="#ff9f0a"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>}
        />
        <StatCard
          label="Net Revenue"
          value={formatCurrency(Math.round(Math.abs(d.netRevenue||0)))}
          sub={(d.netRevenue||0)>=0 ? '↑ Surplus this month' : '↓ Deficit this month'}
          color={(d.netRevenue||0)>=0 ? '#30d158' : '#ff453a'}
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
        />
      </div>

      {/* Net Profit breakdown — this month only, fine kept separate from loan/EMI figures
          and added ONLY here, exactly like the overall Dashboard */}
      <Card style={{marginBottom:20, background:'linear-gradient(135deg,rgba(48,209,88,0.06),rgba(10,132,255,0.04))', border:'1px solid rgba(48,209,88,0.18)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:14}}>
          <div>
            <div style={{fontSize:12,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Net Profit — {label}</div>
            <div style={{fontSize:26,fontWeight:900,color:(d.combinedNetProfitMonth||0)>=0?'var(--green)':'var(--red)',letterSpacing:'-0.6px'}}>
              {(d.combinedNetProfitMonth||0)>=0?'+':'-'}{formatCurrency(Math.round(Math.abs(d.combinedNetProfitMonth||0)))}
            </div>
          </div>
          <div style={{display:'flex',gap:18,flexWrap:'wrap',fontSize:12.5,color:'var(--text-secondary)'}}>
            <span>Loan Interest: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(Math.round(d.totalCollected||0))}</strong></span>
            <span>EMI Interest: <strong style={{color:'var(--text-primary)'}}>{formatCurrency(Math.round(d.totalEmiInterestCollected||0))}</strong></span>
            <span>− Interest Paid: <strong style={{color:'#ff453a'}}>{formatCurrency(Math.round(d.totalPaidOut||0))}</strong></span>
            <span>+ Fine Income: <strong style={{color:'#ff9500'}}>{formatCurrency(Math.round(d.curMonthFineIncome||0))}</strong></span>
            <span>− Expenses: <strong style={{color:'#ff453a'}}>{formatCurrency(Math.round(d.totalExpensesMonth||0))}</strong></span>
          </div>
        </div>
      </Card>

      {/* EMI Loans — connected into the Monthly Report. Same fix as the section
          above — no longer gated on activeEmiCount>0, so a past month with a
          now-closed EMI loan still shows what was actually due/collected then. */}
      <SectionHeader title="📆 EMI Loans — Due / Collected"/>
      <div className="grid-4" style={{ marginBottom:20 }}>
        <StatCard label="EMI Due This Month" value={formatCurrency(Math.round(d.totalEmiDue||0))} sub={`${d.activeEmiCount||0} active EMI loan${(d.activeEmiCount||0)!==1?'s':''}`} color="#5e5ce6"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M12 10v4M10 12h4"/></svg>}/>
        <StatCard label="EMI Collected" value={formatCurrency(Math.round(d.totalEmiCollected||0))} sub={`${(d.emiCollectionRate||0).toFixed(0)}% of this month's EMI due`} color="#34c759"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>}/>
        <StatCard label="EMI Pending" value={formatCurrency(Math.round(Math.max(0,(d.totalEmiDue||0)-(d.totalEmiCollected||0))))} sub="Still to be collected this month" color="#ff9500"
          icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}/>
      </div>

      {/* Progress bars */}
      <div className="grid-2" style={{ marginBottom:20 }}>
        <Card>
          <SectionHeader title="Borrower Collection Progress"/>
          <ProgressBar
            value={d.totalCollected||0} max={d.totalReceivable||1}
            color="var(--green)" label="Interest collected from borrowers"
          />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>Collected: <strong style={{color:'var(--green)'}}>{formatCurrency(Math.round(d.totalCollected||0))}</strong></span>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>Total Due: <strong>{formatCurrency(Math.round(d.totalReceivable||0))}</strong></span>
          </div>
        </Card>
        <Card>
          <SectionHeader title="Depositor Payout Progress"/>
          <ProgressBar
            value={d.totalPaidOut||0} max={d.totalPayable||1}
            color="var(--orange)" label="Interest paid out to depositors"
          />
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>Paid: <strong style={{color:'var(--orange)'}}>{formatCurrency(Math.round(d.totalPaidOut||0))}</strong></span>
            <span style={{ fontSize:12, color:'var(--text-secondary)' }}>Total Due: <strong>{formatCurrency(Math.round(d.totalPayable||0))}</strong></span>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid-2" style={{ marginBottom:20 }}>
        <Card>
          <SectionHeader title="This Month — Position"/>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={barData} barSize={44} margin={{top:4,right:0,bottom:0,left:-18}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)"/>
              <XAxis dataKey="name" tick={{fill:'var(--text-secondary)',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-secondary)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,fontSize:12,boxShadow:'var(--shadow-lg)'}} formatter={v=>formatCurrency(Math.round(v))}/>
              <Bar dataKey="value" radius={[7,7,0,0]}>{barData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionHeader title="6-Month Trend"/>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={trendData} margin={{top:4,right:0,bottom:0,left:-18}}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)"/>
              <XAxis dataKey="month" tick={{fill:'var(--text-secondary)',fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:'var(--text-secondary)',fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>'₹'+Math.round(v/1000)+'k'}/>
              <Tooltip contentStyle={{background:'#fff',border:'1px solid var(--border)',borderRadius:10,fontSize:12,boxShadow:'var(--shadow-lg)'}} formatter={v=>formatCurrency(Math.round(v))}/>
              <Legend wrapperStyle={{fontSize:12,color:'var(--text-secondary)'}}/>
              <Line type="monotone" dataKey="receivable" stroke="#30d158" strokeWidth={2.5} dot={{r:3,fill:'#30d158'}} name="Receivable"/>
              <Line type="monotone" dataKey="payable" stroke="#ff9f0a" strokeWidth={2.5} dot={{r:3,fill:'#ff9f0a'}} name="Payable"/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Borrower & Depositor detail tables */}
      <div className="grid-2">
        <Card noPad>
          <div style={{padding:'18px 20px 12px'}}>
            <SectionHeader title={`Borrowers — ${label}`}/>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:360}}>
              <thead>
                <tr style={{background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)'}}>
                  {['Name','Outstanding','Interest Due','Collected','Status'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.borrowerRows||[]).length===0
                  ? <tr><td colSpan={5} style={{padding:32,textAlign:'center',color:'var(--text-tertiary)',fontSize:13}}>No active borrowers</td></tr>
                  : (d.borrowerRows||[]).map(b=>(
                    <tr key={b.id} style={{borderBottom:'1px solid var(--divider)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(10,132,255,0.025)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'11px 14px'}}>
                        <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{b.borrowerName}</p>
                        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{b.interestRate}%/mo</p>
                      </td>
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:600,color:'var(--orange)'}} className="num">{formatCurrency(Math.round(b.outstanding||0))}</td>
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:700,color:'var(--green)'}} className="num">{formatCurrency(Math.round(b.correctInterest||0))}</td>
                      <td style={{padding:'11px 14px',fontSize:13,color:'var(--text-secondary)'}} className="num">{b.payment?.status==='Paid' ? formatCurrency(b.payment.amountPaid||0) : '—'}</td>
                      <td style={{padding:'11px 14px'}}><Badge label={b.payment?.status||'Pending'} type={(b.payment?.status||'pending').toLowerCase()}/></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </Card>

        <Card noPad>
          <div style={{padding:'18px 20px 12px'}}>
            <SectionHeader title={`Depositors — ${label}`}/>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:340}}>
              <thead>
                <tr style={{background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)'}}>
                  {['Name','Deposit','Interest Due','Paid Out','Status'].map(h=>(
                    <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em',whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.depositRows||[]).length===0
                  ? <tr><td colSpan={5} style={{padding:32,textAlign:'center',color:'var(--text-tertiary)',fontSize:13}}>No active depositors</td></tr>
                  : (d.depositRows||[]).map(dep=>(
                    <tr key={dep.id} style={{borderBottom:'1px solid var(--divider)'}}
                      onMouseEnter={e=>e.currentTarget.style.background='rgba(10,132,255,0.025)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'11px 14px'}}>
                        <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{dep.name}</p>
                        <p style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{dep.interestRate}% p.a.</p>
                      </td>
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:600}} className="num">{formatCurrency(Math.round(dep.effectivePrincipal!=null?dep.effectivePrincipal:dep.depositAmount))}</td>
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:700,color:'var(--orange)'}} className="num">{formatCurrency(Math.round(dep.correctInterest||0))}</td>
                      <td style={{padding:'11px 14px',fontSize:13,color:'var(--text-secondary)'}} className="num">{(dep.payment?.status==='Paid'||dep.payment?.addedToDeposit) ? formatCurrency(dep.payment.addedToDeposit?(dep.payment.addedAmount||0):(dep.payment.amountPaid||0)) : '—'}</td>
                      <td style={{padding:'11px 14px'}}><Badge label={dep.payment?.status||'Pending'} type={(dep.payment?.status||'pending').toLowerCase()}/></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
