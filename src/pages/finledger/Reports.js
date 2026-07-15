import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {useAuth} from '../../contexts/AuthContext';
import {scopeToUser} from '../../utils/scopeHelper';
import {getAllStatusHistory, getEffectiveStatus} from '../../utils/statusHistory';
import { PageHeader, Card, Button, StatCard, SectionHeader, formatCurrency } from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import { printOverallReport } from '../../utils/pdfReport';

const PRESETS = [
  { label: 'This Month',    days: 0,   type: 'month' },
  { label: 'Last Month',    days: 0,   type: 'lastmonth' },
  { label: '2 Months',      days: 61,  type: 'days' },
  { label: '3 Months',      days: 90,  type: 'days' },
  { label: '6 Months',      days: 180, type: 'days' },
  { label: 'This Year',     days: 0,   type: 'year' },
  { label: 'Custom Range',  days: 0,   type: 'custom' },
];

function getPresetDates(preset) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (preset.type === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (preset.type === 'lastmonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to   = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset.type === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (preset.type === 'days' && preset.days > 0) {
    const from = new Date(now - preset.days * 86400000);
    return { from: fmt(from), to: fmt(now) };
  }
  return null;
}

function INR(v) { return '₹' + Math.abs(Number(v)||0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtDate(d) { if(!d)return'—'; try{ return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;} }

export default function Reports() {
  const {user} = useAuth();
  const [borrowers,    setBorrowers]    = useState([]);
  const [loanHistory,  setLoanHistory]  = useState({});
  const [depHistory,   setDepHistory]   = useState({});
  const [depositors,   setDepositors]   = useState([]);
  const [repayments,   setRepayments]   = useState([]);
  const [intPayments,  setIntPayments]  = useState([]);
  const [depPayments,  setDepPayments]  = useState([]);
  const [expenses,     setExpenses]     = useState([]);
  const [emiCols,      setEmiCols]      = useState([]);
  const [loading,      setLoading]      = useState(true);

  const [activePreset, setActivePreset] = useState(0);
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');
  const [isCustom,     setIsCustom]     = useState(false);

  // Apply preset on mount
  useEffect(() => {
    applyPreset(0);
  }, []);// eslint-disable-line

  useEffect(() => {
    let done = 0;
    const setDone = () => { done++; if (done >= 6) setLoading(false); };
    const u1 = onSnapshot(query(collection(db,'borrower_master'), orderBy('createdAt','desc')), s => { setBorrowers(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    const u2 = onSnapshot(collection(db,'deposit_master'), s => { setDepositors(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    const u3 = onSnapshot(collection(db,'loan_repayments'), s => { setRepayments(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    const u4 = onSnapshot(collection(db,'borrower_interest_payments'), s => { setIntPayments(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    const u5 = onSnapshot(collection(db,'finance_expenses'), s => { setExpenses(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    const u6 = onSnapshot(collection(db,'emi_collections'), s => { setEmiCols(scopeToUser(s.docs.map(d=>({id:d.id,...d.data()})),user?.uid)); setDone(); });
    // Point-in-time status resolution — see utils/statusHistory.js for why this exists
    getAllStatusHistory('loan').then(setLoanHistory);
    getAllStatusHistory('deposit').then(setDepHistory);
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); };
  }, []);

  function applyPreset(idx) {
    setActivePreset(idx);
    const preset = PRESETS[idx];
    if (preset.type === 'custom') { setIsCustom(true); return; }
    setIsCustom(false);
    const dates = getPresetDates(preset);
    if (dates) { setFromDate(dates.from); setToDate(dates.to); }
  }

  // Derived stats for selected period
  const filtIntPays = intPayments.filter(p => p.status === 'Paid' && p.paymentDate >= fromDate && p.paymentDate <= toDate);
  const filtReps    = repayments.filter(r => !r.deleted && r.date >= fromDate && r.date <= toDate);
  const filtExps    = expenses.filter(e => e.date >= fromDate && e.date <= toDate);
  const filtEmi     = emiCols.filter(e => e.date >= fromDate && e.date <= toDate);
  const filtDepPays = depPayments.filter(p => p.status === 'Paid' && p.paymentDate >= fromDate && p.paymentDate <= toDate);

  const totalInterest = filtIntPays.reduce((s,p) => s + (p.totalCollected || p.amountPaid || 0), 0);
  const totalRepaid   = filtReps.reduce((s,r) => s + (r.repaidAmount || r.amount || 0), 0);
  const totalEMI      = filtEmi.reduce((s,e) => s + (e.totalCollected || e.amount || 0), 0);
  const totalExpense  = filtExps.reduce((s,e) => s + (e.amount || 0), 0);
  const totalIncome   = totalInterest + totalRepaid + totalEMI;
  const netInterestIncome = totalInterest - totalExpense; // Monthly Net Int. Income net of expenses
  const netFlow       = totalIncome - totalExpense;

  // Portfolio totals
  // Period-scoped: borrower was active DURING the selected period
  // A borrower counts if: loan started on or before toDate AND not closed before fromDate
  const _closedStatuses = ['Closed','Paid Off','Repaid','Settled','Completed'];
  const periodActiveB = borrowers.filter(b => {
    const start = b.loanStartDate || b.agreementDate || '';
    if (start && start > toDate) return false; // loan started after period
    // Point-in-time status: what was this loan's status as of toDate, not its status TODAY?
    // Falls back to the old repayment-date heuristic only if no audit history was ever logged
    // for this record (e.g. it was closed before this feature existed).
    const hist = loanHistory[b.id];
    if (hist && hist.length) {
      const effStatus = getEffectiveStatus(b.status, hist, toDate);
      if (_closedStatuses.includes(effStatus)) return false;
    } else if (_closedStatuses.includes(b.status)) {
      const bReps = repayments.filter(r => r.borrowerId === b.id && !r.deleted);
      const lastRep = bReps.reduce((mx,r) => r.date > mx ? r.date : mx, '');
      if (lastRep && lastRep < fromDate) return false; // closed before period started
    }
    return true;
  });
  const activeB = periodActiveB; // keep activeB name for rest of render
  // Same point-in-time fix for depositors — "Active Depositors" used to always show
  // TODAY's active depositors regardless of what period the report was for.
  const periodActiveD = depositors.filter(d => {
    const hist = depHistory[d.id];
    if (hist && hist.length) {
      const effStatus = getEffectiveStatus(d.status, hist, toDate);
      return effStatus === 'Active';
    }
    return d.status === 'Active'; // no history logged — best available fallback
  });

  const totalOutstanding = activeB.reduce((s,b) => {
    const paid = repayments.filter(r => r.borrowerId === b.id && !r.deleted && r.date <= toDate).reduce((a,r) => a + (r.repaidAmount||r.amount||0), 0);
    return s + Math.max(0, (b.loanAmount||0) - paid);
  }, 0);
  const totalDeposits = periodActiveD.reduce((s,d) => s + (d.depositAmount||0), 0);
  const monthlyInterestIncome = activeB.reduce((s,b) => {
    const paid = repayments.filter(r => r.borrowerId === b.id && !r.deleted && r.date <= toDate).reduce((a,r) => a + (r.repaidAmount||r.amount||0), 0);
    const out = Math.max(0, (b.loanAmount||0) - paid);
    return s + out * (b.interestRate||0) / 100; // monthly rate
  }, 0);

  // Monthly breakdown
  const months = {};
  filtIntPays.forEach(p => { const m = p.month || p.paymentDate?.slice(0,7); if(!m) return; if(!months[m]) months[m] = {interest:0,repaid:0,emi:0,expenses:0}; months[m].interest += p.totalCollected||p.amountPaid||0; });
  filtReps.forEach(r => { const m = r.date?.slice(0,7); if(!m) return; if(!months[m]) months[m] = {interest:0,repaid:0,emi:0,expenses:0}; months[m].repaid += r.repaidAmount||r.amount||0; });
  filtEmi.forEach(e => { const m = e.date?.slice(0,7); if(!m) return; if(!months[m]) months[m] = {interest:0,repaid:0,emi:0,expenses:0}; months[m].emi += e.totalCollected||e.amount||0; });
  filtExps.forEach(e => { const m = e.date?.slice(0,7); if(!m) return; if(!months[m]) months[m] = {interest:0,repaid:0,emi:0,expenses:0}; months[m].expenses += e.amount||0; });
  const monthKeys = Object.keys(months).sort();

  // Expense categories
  const expByCat = {};
  filtExps.forEach(e => { expByCat[e.category] = (expByCat[e.category]||0) + (e.amount||0); });
  const topExpCats = Object.entries(expByCat).sort((a,b) => b[1]-a[1]).slice(0, 6);

  function handlePrint() {
    if (!fromDate || !toDate) { alert('Please select a date range.'); return; }
    printOverallReport({
      fromDate, toDate,
      borrowers, depositors,
      interestPayments: intPayments,
      repayments,
      expenses,
      emiCollections: emiCols,
      label: PRESETS[activePreset]?.label || 'Custom Period',
    });
  }

  if (loading) return <PageLoader stats={4} />;

  const periodLabel = fromDate && toDate ? `${fmtDate(fromDate)} → ${fmtDate(toDate)}` : 'Select a period';

  return (
    <div className="page-enter">
      <PageHeader
        title="Financial Reports"
        subtitle="Overall portfolio summary with date-range filtering and PDF export"
        action={
          <Button onClick={handlePrint} disabled={!fromDate||!toDate}
            style={{ display:'flex', alignItems:'center', gap:6, background:'#dc2626', border:'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="12" y2="18"/><line x1="15" y1="15" x2="12" y2="18"/></svg>
            Download PDF Report
          </Button>
        }
      />

      {/* Period selector */}
      <Card style={{ marginBottom: 20 }}>
        <SectionHeader title="Select Report Period" />
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: isCustom ? 16 : 0 }}>
          {PRESETS.map((p,i) => (
            <button key={i} onClick={() => applyPreset(i)}
              style={{ padding:'7px 16px', borderRadius:99, border:`1.5px solid ${activePreset===i?'var(--accent)':'rgba(0,0,0,0.12)'}`, background:activePreset===i?'var(--accent)':'#fff', color:activePreset===i?'#fff':'var(--text-primary)', fontSize:13, fontWeight:activePreset===i?700:400, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
              {p.label}
            </button>
          ))}
        </div>
        {isCustom && (
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:12 }}>
            <div>
              <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>From Date</label>
              <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}
                style={{ height:36, padding:'0 12px', borderRadius:9, border:'1.5px solid rgba(0,0,0,0.1)', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--text-secondary)', display:'block', marginBottom:4 }}>To Date</label>
              <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}
                style={{ height:36, padding:'0 12px', borderRadius:9, border:'1.5px solid rgba(0,0,0,0.1)', fontSize:14, fontFamily:'inherit', outline:'none' }}/>
            </div>
            <div style={{ paddingTop:20 }}>
              <Button disabled={!fromDate||!toDate} onClick={()=>{}}>Apply</Button>
            </div>
          </div>
        )}
        {fromDate && toDate && (
          <div style={{ marginTop:10, fontSize:12.5, color:'var(--accent)', fontWeight:500 }}>
            📅 Showing: {periodLabel}
          </div>
        )}
      </Card>

      {/* Summary KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
        <StatCard label="Interest Collected" value={formatCurrency(Math.round(totalInterest))} sub={`${filtIntPays.length} payments`} color="#007aff" />
        <StatCard label="Principal Repaid" value={formatCurrency(Math.round(totalRepaid))} sub={`${filtReps.length} repayments`} color="#34c759" />
        <StatCard label="EMI Collected" value={formatCurrency(Math.round(totalEMI))} sub={`${filtEmi.length} collections`} color="#5856d6" />
        <StatCard label="Expenses" value={formatCurrency(Math.round(totalExpense))} sub={`${filtExps.length} entries`} color="#ff3b30" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:22 }}>
        <StatCard label="Total Income" value={formatCurrency(Math.round(totalIncome))} sub="Interest + Principal + EMI" color="#34c759" />
        <StatCard label={`Net Cash Flow`} value={formatCurrency(Math.round(netFlow))} sub={netFlow>=0?'Surplus':'Deficit'} color={netFlow>=0?'#34c759':'#ff3b30'} />
        <StatCard label="Total Outstanding" value={formatCurrency(Math.round(totalOutstanding))} sub="All active loans" color="#ff9500" />
        <StatCard label="Monthly Net Int. Income" value={formatCurrency(Math.round(monthlyInterestIncome))} sub="On outstanding balances" color="#007aff" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Monthly table */}
        <Card>
          <SectionHeader title="Month-wise Breakdown" sub={periodLabel} />
          {monthKeys.length === 0 ? (
            <p style={{ color:'var(--text-secondary)', fontSize:13, padding:'20px 0', textAlign:'center' }}>No transactions in this period</p>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5 }}>
                <thead>
                  <tr style={{ background:'rgba(118,118,128,0.06)', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>
                    {['Month','Interest','Principal','EMI','Expenses','Net'].map(h=>(
                      <th key={h} style={{ padding:'8px 10px', textAlign:h==='Month'?'left':'right', fontSize:10.5, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthKeys.map(m => {
                    const d = months[m];
                    const income = d.interest + d.repaid + d.emi;
                    const net = income - d.expenses;
                    return (
                      <tr key={m} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
                        <td style={{ padding:'9px 10px', fontWeight:600, fontSize:13 }}>{m}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#007aff', fontWeight:600 }}>{INR(d.interest)}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#34c759', fontWeight:600 }}>{INR(d.repaid)}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#5856d6', fontWeight:600 }}>{INR(d.emi)}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:'#ff3b30', fontWeight:600 }}>{INR(d.expenses)}</td>
                        <td style={{ padding:'9px 10px', textAlign:'right', color:net>=0?'#34c759':'#ff3b30', fontWeight:800 }}>{INR(net)}</td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr style={{ borderTop:'2px solid rgba(0,122,255,0.2)', background:'rgba(0,122,255,0.04)' }}>
                    <td style={{ padding:'9px 10px', fontWeight:800 }}>Total</td>
                    <td style={{ padding:'9px 10px', textAlign:'right', color:'#007aff', fontWeight:800 }}>  {INR(Math.max(0,netInterestIncome))} {totalExpense>0&&<span style={{fontSize:11,color:'#ff3b30',marginLeft:4}}>(after ₹{Math.round(totalExpense/1000)}k exp.)</span>}</td>
                    <td style={{ padding:'9px 10px', textAlign:'right', color:'#34c759', fontWeight:800 }}>{INR(totalRepaid)}</td>
                    <td style={{ padding:'9px 10px', textAlign:'right', color:'#5856d6', fontWeight:800 }}>{INR(totalEMI)}</td>
                    <td style={{ padding:'9px 10px', textAlign:'right', color:'#ff3b30', fontWeight:800 }}>{INR(totalExpense)}</td>
                    <td style={{ padding:'9px 10px', textAlign:'right', color:netFlow>=0?'#34c759':'#ff3b30', fontWeight:800 }}>{INR(netFlow)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Expense breakdown */}
        <Card>
          <SectionHeader title="Expense Breakdown" sub={periodLabel} />
          {topExpCats.length === 0 ? (
            <p style={{ color:'var(--text-secondary)', fontSize:13, padding:'20px 0', textAlign:'center' }}>No expenses in this period</p>
          ) : (
            topExpCats.map(([cat, amt], i) => (
              <div key={i} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%' }}>{cat}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#ff3b30', flexShrink:0 }}>{INR(amt)}</span>
                </div>
                <div style={{ height:5, background:'rgba(0,0,0,0.07)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ width:`${totalExpense>0?Math.round(amt/totalExpense*100):0}%`, height:'100%', background:'#ff3b30', borderRadius:3 }} />
                </div>
                <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2 }}>{totalExpense>0?Math.round(amt/totalExpense*100):0}% of total</div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Portfolio snapshot */}
      <Card>
        <SectionHeader title="Portfolio Snapshot (Current)" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:10 }}>Borrowers active in period ({activeB.length})</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'rgba(118,118,128,0.06)', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>
                  {['Borrower','Loan','Outstanding','Int/Mo'].map(h=>(
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {activeB.map(b => {
                    const paid = repayments.filter(r=>r.borrowerId===b.id&&!r.deleted).reduce((a,r)=>a+(r.repaidAmount||r.amount||0),0);
                    const out = Math.max(0,(b.loanAmount||0)-paid);
                    return (
                      <tr key={b.id} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600 }}>{b.borrowerName}</td>
                        <td style={{ padding:'8px 10px' }}>{INR(b.loanAmount)}</td>
                        <td style={{ padding:'8px 10px', color:out>0?'#ff9500':'#34c759', fontWeight:700 }}>{INR(out)}</td>
                        <td style={{ padding:'8px 10px', color:'#007aff', fontWeight:700 }}>{INR(out*(b.interestRate||0)/100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:10 }}>Active Depositors ({periodActiveD.length})</h3>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'rgba(118,118,128,0.06)', borderBottom:'1px solid rgba(0,0,0,0.07)' }}>
                  {['Depositor','Amount','Rate','Tenure'].map(h=>(
                    <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {periodActiveD.map(d => {
                    const t = parseInt(d.interestTenure)||1;
                    const tl = t===1?'Monthly':t===3?'Quarterly':t===6?'Half-Yearly':t===12?'Yearly':`${t}mo`;
                    return (
                      <tr key={d.id} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
                        <td style={{ padding:'8px 10px', fontWeight:600 }}>{d.name}</td>
                        <td style={{ padding:'8px 10px', color:'#5856d6', fontWeight:700 }}>{INR(d.depositAmount)}</td>
                        <td style={{ padding:'8px 10px' }}>{d.interestRate||0}%</td>
                        <td style={{ padding:'8px 10px' }}>{tl}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
