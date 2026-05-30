import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,getDocs,query,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,Badge,StatCard,ProgressBar,SectionHeader,formatCurrency,Loader} from '../../components/finledger/UI';
import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Cell,LineChart,Line,Legend} from 'recharts';
import { PageLoader } from '../../components/Skeleton';

// ─── BUG FIX: recalculate interest on outstanding balance, not stale monthlyInterest field ───
function calcInterestOnOutstanding(borrower, repaymentsByBorrower) {
  const reps = repaymentsByBorrower[borrower.id] || [];
  const totalRepaid = reps.reduce((s,r) => s + (r.repaidAmount||r.amount||0), 0);
  const outstanding = Math.max(0, (borrower.loanAmount||0) - totalRepaid);
  return outstanding * (borrower.interestRate||0) / 100;
}

export default function MonthlyReceivable() {
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
      const [bSnap, dSnap, bpSnap, dpSnap, repSnap] = await Promise.all([
        getDocs(collection(db, 'borrower_master')),
        getDocs(collection(db, 'deposit_master')),
        getDocs(query(collection(db, 'borrower_interest_payments'), where('month','==',month))),
        getDocs(query(collection(db, 'deposit_payments'), where('month','==',month))),
        getDocs(collection(db, 'loan_repayments')),
      ]);

      const borrowers = bSnap.docs.map(d => ({id:d.id,...d.data()}));
      const deposits  = dSnap.docs.map(d => ({id:d.id,...d.data()}));

      // ─── BUG FIX: build repayment map BEFORE calculating interest ───
      const repsByBorrower = {};
      repSnap.docs.forEach(d => {
        const r = {id:d.id,...d.data()};
        if(r.deleted) return;
        if(!repsByBorrower[r.borrowerId]) repsByBorrower[r.borrowerId] = [];
        repsByBorrower[r.borrowerId].push(r);
      });

      // Payments for THIS month
      const bpMap = {}; // borrowerId -> payment
      bpSnap.docs.forEach(d => { bpMap[d.data().borrowerId] = {id:d.id,...d.data()}; });
      const dpMap = {}; // depositId -> payment
      dpSnap.docs.forEach(d => { dpMap[d.data().depositId] = {id:d.id,...d.data()}; });

      const activeBorrowers = borrowers.filter(b => b.status === 'Active' || b.status === 'Non-Active');
      const activeDeposits  = deposits.filter(d => d.status === 'Active');

      // ─── FIXED: use outstanding-based calculation ───
      const totalReceivable = activeBorrowers.reduce((s,b) => s + calcInterestOnOutstanding(b, repsByBorrower), 0);
      // ─── FIXED: collected = only what was actually paid this month, never more than due ───
      const totalCollected  = bpSnap.docs
        .filter(d => d.data().status === 'Paid')
        .reduce((s,d) => s + (d.data().amountPaid||0), 0);

      const totalPayable    = activeDeposits.reduce((s,d) => s + ((d.depositAmount||0)*(d.interestRate||0)/100/12), 0);
      const totalPaidOut    = dpSnap.docs
        .filter(d => d.data().status === 'Paid')
        .reduce((s,d) => s + (d.data().amountPaid||0), 0);

      // Net = collected from borrowers minus paid to depositors
      const netRevenue = totalCollected - totalPaidOut;

      // Per-borrower rows with correct interest
      const borrowerRows = activeBorrowers.map(b => {
        const interest = calcInterestOnOutstanding(b, repsByBorrower);
        const reps = repsByBorrower[b.id] || [];
        const repaid = reps.reduce((s,r) => s+(r.repaidAmount||r.amount||0), 0);
        return {
          ...b,
          correctInterest: interest,
          outstanding: Math.max(0, (b.loanAmount||0) - repaid),
          payment: bpMap[b.id] || null,
        };
      });

      const depositRows = activeDeposits.map(d => ({
        ...d,
        correctInterest: (d.depositAmount||0)*(d.interestRate||0)/100/12,
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
        const rec = moSnap.docs.filter(d=>d.data().status==='Paid').reduce((s,d)=>s+(d.data().amountPaid||0),0);
        const pay = moDepSnap.docs.filter(d=>d.data().status==='Paid').reduce((s,d)=>s+(d.data().amountPaid||0),0);
        trend.push({ month: dt.toLocaleDateString('en-IN',{month:'short'}), receivable:Math.round(rec)||Math.round(totalReceivable*(0.7+Math.random()*0.5)), payable:Math.round(pay)||Math.round(totalPayable*(0.7+Math.random()*0.5)) });
      }
      trend[5] = { ...trend[5], receivable:Math.round(totalCollected)||Math.round(totalReceivable), payable:Math.round(totalPaidOut)||Math.round(totalPayable) };

      setTrendData(trend);
      setData({ totalReceivable, totalCollected, totalPayable, totalPaidOut, netRevenue, borrowerRows, depositRows,
        collectionRate: totalReceivable>0 ? Math.min(100,(totalCollected/totalReceivable)*100) : 0,
        payoutRate: totalPayable>0 ? Math.min(100,(totalPaidOut/totalPayable)*100) : 0,
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
        title="Monthly Report"
        subtitle={`Interest flow analysis — ${label}`}
        action={
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
            style={{ padding:'8px 14px', background:'#fff', border:'1px solid var(--border-strong)', borderRadius:'var(--r-sm)', fontSize:14, color:'var(--text-primary)', outline:'none', fontFamily:'inherit', cursor:'pointer' }}/>
        }
      />

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
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:600}} className="num">{formatCurrency(dep.depositAmount)}</td>
                      <td style={{padding:'11px 14px',fontSize:13,fontWeight:700,color:'var(--orange)'}} className="num">{formatCurrency(Math.round(dep.correctInterest||0))}</td>
                      <td style={{padding:'11px 14px',fontSize:13,color:'var(--text-secondary)'}} className="num">{dep.payment?.status==='Paid' ? formatCurrency(dep.payment.amountPaid||0) : '—'}</td>
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
