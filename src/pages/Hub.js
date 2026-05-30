import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import {
  Building2, LayoutGrid, LogOut, RefreshCw, ArrowRight, Settings,
} from 'lucide-react';
import { shimmerKeyframes } from '../components/Skeleton';

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtK(v) {
  const n = Number(v) || 0;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${Math.round(n)}`;
}
function fmtINR(v) {
  return '₹' + Math.abs(Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ── Skeleton shimmer ───────────────────────────────────────────────────────────
function Shimmer({ w = '100%', h = 16, r = 6, mb = 0 }) {
  return <div style={{ width: w, height: h, borderRadius: r, marginBottom: mb, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'hubShimmer 1.4s ease infinite' }} />;
}

function SumCardShimmer() {
  return (
    <div style={{ background: '#fff', borderRadius: 17, border: '1px solid rgba(0,0,0,.07)', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      <Shimmer w={38} h={38} r={10} mb={12} />
      <Shimmer w="55%" h={22} r={5} mb={7} />
      <Shimmer w="75%" h={12} r={4} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Hub({ onLaunch, onAccount }) {
  const { user, logout, sessionLabel } = useAuth();

  // Raw data from Firestore subscriptions
  const [projects,    setProjects]    = useState(null);
  const [chits,       setChits]       = useState(null);
  const [deposits,    setDeposits]    = useState(null);
  const [borrowers,   setBorrowers]   = useState(null);
  const [repayments,  setRepayments]  = useState(null);
  const [rePayments,  setRePayments]  = useState(null); // RE payment history

  // Derived summary
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshAt, setRefreshAt] = useState(0);

  // Subscribe to all collections
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;
    const unsubs = [];

    unsubs.push(onSnapshot(
      query(collection(db, 're_projects'), where('uid', '==', uid)),
      snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('re_projects:', err.code); setProjects([]); }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 're_payments'), where('uid', '==', uid)),
      snap => setRePayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('re_payments:', err.code); setRePayments([]); }
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'chit_master'), where('createdBy', '==', uid)),
      snap => setChits(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('chit_master:', err.code); setChits([]); }
    ));

    unsubs.push(onSnapshot(
      collection(db, 'deposit_master'),
      snap => setDeposits(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('deposit_master:', err.code); setDeposits([]); }
    ));

    unsubs.push(onSnapshot(
      collection(db, 'borrower_master'),
      snap => setBorrowers(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('borrower_master:', err.code); setBorrowers([]); }
    ));

    unsubs.push(onSnapshot(
      collection(db, 'loan_repayments'),
      snap => setRepayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn('loan_repayments:', err.code); setRepayments([]); }
    ));

    return () => unsubs.forEach(u => u());
  }, [user?.uid, refreshAt]);

  // Compute derived stats whenever all subscriptions have fired at least once
  useEffect(() => {
    // Wait for all to be non-null (null = not yet received, [] = received but empty)
    if (projects === null || chits === null || deposits === null || borrowers === null || repayments === null || rePayments === null) return;

    // Real Estate
    const re = {
      projects:   projects.length,
      totalSites: projects.reduce((s, p) => s + (p.totalSites || 0), 0),
      available:  projects.reduce((s, p) => s + (p.availableSites || 0), 0),
      revenue:    projects.reduce((s, p) => s + (p.totalRevenue || 0), 0),
      investment: projects.reduce((s, p) => s + (p.totalInvestment || 0), 0),
    };
    re.profit = re.revenue - re.investment;

    // Monthly RE map
    const reMonthly = {};
    rePayments.forEach(p => {
      const d = p.date ? new Date(p.date) : null;
      if (!d || isNaN(d)) return;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      reMonthly[k] = (reMonthly[k] || 0) + (Number(p.amount) || 0);
    });

    // Chit Fund
    const cf = {
      chits:      chits.length,
      active:     chits.filter(c => c.status === 'Active').length,
      totalValue: chits.reduce((s, c) => s + (Number(c.totalChitValue) || 0), 0),
      invested:   chits.reduce((s, c) => s + (Number(c.totalInvested) || 0), 0),
      commission: chits.reduce((s, c) => s + (Number(c.totalCommissionEarned) || 0), 0),
    };

    // Finance Ledger
    const repsByBorrower = {};
    repayments.forEach(r => {
      if (r.deleted) return;
      repsByBorrower[r.borrowerId] = repsByBorrower[r.borrowerId] || [];
      repsByBorrower[r.borrowerId].push(r);
    });
    const activeDeps = deposits.filter(d => d.status === 'Active');
    const activeBors = borrowers.filter(b => b.status === 'Active' || b.status === 'Non-Active');
    const fl = {
      depositors: activeDeps.length,
      borrowers:  activeBors.length,
      deposits:   activeDeps.reduce((s, d) => s + (Number(d.depositAmount) || 0), 0),
      outstanding: activeBors.reduce((s, b) => {
        const repaid = (repsByBorrower[b.id] || []).reduce((r, p) => r + (Number(p.amount) || 0), 0);
        return s + Math.max(0, (Number(b.loanAmount) || 0) - repaid);
      }, 0),
      monthlyInterest: activeBors.reduce((s, b) => {
        const repaid = (repsByBorrower[b.id] || []).reduce((r, p) => r + (Number(p.amount) || 0), 0);
        const outstanding = Math.max(0, (Number(b.loanAmount) || 0) - repaid);
        return s + outstanding * (Number(b.interestRate) || 0) / 100;
      }, 0),
    };

    // 6-month chart
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const chartData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return {
        month: MONTHS[d.getMonth()],
        'Real Estate':  Math.round(reMonthly[k] || 0),
        'Chit Fund':    Math.round(cf.invested / 6),
        'Fin Ledger':   Math.round(fl.monthlyInterest),
      };
    });

    setData({ re, cf, fl, chartData });
    setLoading(false);
  }, [projects, chits, deposits, borrowers, repayments, rePayments]);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.displayName?.split(' ')[0] || 'Welcome';
  const initial = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0]?.toUpperCase() || 'U');

  // Summary cards
  const summaryCards = [
    {
      accent: '#1d4ed8', bg: 'rgba(29,78,216,.09)',
      icon: <Building2 size={19} color="#1d4ed8" />,
      val:  loading ? '…' : fmtK(data?.re.revenue || 0),
      lbl:  'Real Estate Revenue',
      sub:  loading ? 'Loading…' : `${data?.re.projects || 0} projects · ${data?.re.totalSites || 0} sites`,
    },
    {
      accent: '#f59e0b', bg: 'rgba(245,158,11,.09)',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
      val:  loading ? '…' : fmtK(data?.cf.totalValue || 0),
      lbl:  'Chit Fund Portfolio',
      sub:  loading ? 'Loading…' : `${data?.cf.chits || 0} chits · ${data?.cf.active || 0} active`,
    },
    {
      accent: '#10b981', bg: 'rgba(16,185,129,.09)',
      icon: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
      val:  loading ? '…' : fmtK(data?.fl.deposits || 0),
      lbl:  'Total Deposits',
      sub:  loading ? 'Loading…' : `${data?.fl.depositors || 0} depositors · ${data?.fl.borrowers || 0} borrowers`,
    },
  ];

  // App launch cards
  const apps = [
    {
      key: 're', name: 'Real Estate ERP',
      desc: 'Layout projects, plots, clients, investors & finance',
      gradient: 'linear-gradient(135deg,#1d4ed8,#4c1d95)',
      accent: '#1d4ed8',
      icon: <Building2 size={26} color="#fff" />,
      kpis: !data ? [] : [
        { val: data.re.projects,       lbl: 'Projects' },
        { val: data.re.totalSites,     lbl: 'Sites' },
        { val: fmtK(data.re.revenue),  lbl: 'Revenue' },
        { val: `${data.re.available} free`, lbl: 'Available' },
      ],
    },
    {
      key: 'cf', name: 'Chit Fund Manager',
      desc: 'Chit funds, auctions, members & commission tracking',
      gradient: 'linear-gradient(135deg,#f59e0b,#ef4444)',
      accent: '#f59e0b',
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
      kpis: !data ? [] : [
        { val: data.cf.chits,               lbl: 'Total Chits' },
        { val: data.cf.active,              lbl: 'Active' },
        { val: fmtK(data.cf.totalValue),    lbl: 'Portfolio' },
        { val: fmtK(data.cf.commission),    lbl: 'Commission' },
      ],
    },
    {
      key: 'fl', name: 'Finance Ledger',
      desc: 'Deposits, loans, interest collection & repayments',
      gradient: 'linear-gradient(135deg,#10b981,#0d9488)',
      accent: '#10b981',
      icon: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
      kpis: !data ? [] : [
        { val: data.fl.depositors,           lbl: 'Depositors' },
        { val: data.fl.borrowers,            lbl: 'Borrowers' },
        { val: fmtK(data.fl.deposits),       lbl: 'Deposits' },
        { val: fmtK(data.fl.monthlyInterest),lbl: 'Monthly Int.' },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        ${shimmerKeyframes}
        @keyframes hubShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{ height: 56, background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(18px)', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 100 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#1d4ed8,#4c1d95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LayoutGrid size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.3px', color: '#1c1c1e' }}>FinSuite</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sessionLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#065f46' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s ease-in-out infinite' }} />
              {sessionLabel}
            </div>
          )}

          <button
            onClick={onAccount}
            title="Account Settings"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: 10, transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}>
              {user?.photoURL
                ? <img src={user.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initial}
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1c1c1e' }} className="hub-name-label">{firstName}</span>
          </button>

          <button
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 13px', background: 'rgba(255,69,58,.07)', border: '1px solid rgba(255,69,58,.18)', borderRadius: 9, color: '#c81e1e', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,69,58,.14)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,69,58,.07)'}
          >
            <LogOut size={13} />
            <span className="hub-signout-label">Sign out</span>
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ padding: '28px 28px 48px', maxWidth: 1280, margin: '0 auto' }}>

        {/* Welcome */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111928', letterSpacing: '-.4px' }}>
            {greeting}, {firstName}! 👋
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>Your complete financial portfolio — click any app card below to open it.</p>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 24 }}>
          {summaryCards.map((card, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e9f2', borderRadius: 16, padding: '17px 20px', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '16px 16px 0 0', background: card.accent }} />
              <div style={{ width: 36, height: 36, borderRadius: 9, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>{card.icon}</div>
              {loading
                ? <><Shimmer w="60%" h={20} r={5} mb={6} /><Shimmer w="80%" h={11} r={4} /></>
                : <>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#111928', letterSpacing: '-.4px', lineHeight: 1.1 }}>{card.val}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{card.lbl}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{card.sub}</div>
                </>}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: '#fff', border: '1px solid #e5e9f2', borderRadius: 16, padding: '20px 22px 14px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111928', marginBottom: 3 }}>Portfolio Activity — Last 6 Months</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>Collections across all 3 business units</div>
          {loading || !data ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
              <div style={{ width: 28, height: 28, border: '3px solid #e5e9f2', borderTopColor: '#1d4ed8', borderRadius: '50%', animation: 'hubShimmer 0s, reSpin .7s linear infinite' }} />
              <style>{`@keyframes reSpin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data.chartData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 11.5, fill: '#6b7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={fmtK} />
                <Tooltip formatter={v => fmtINR(v)} contentStyle={{ borderRadius: 10, border: '1px solid #e5e9f2', fontSize: 12 }} />
                <Legend />
                <Bar dataKey="Real Estate" fill="#1d4ed8" radius={[4,4,0,0]} />
                <Bar dataKey="Chit Fund"   fill="#f59e0b" radius={[4,4,0,0]} />
                <Bar dataKey="Fin Ledger"  fill="#10b981" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* App cards */}
        <div style={{ fontSize: 17, fontWeight: 700, color: '#111928', marginBottom: 5 }}>Launch Applications</div>
        <div style={{ fontSize: 13.5, color: '#6b7280', marginBottom: 18 }}>Single sign-in — your session carries across all three apps.</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 24 }}>
          {apps.map(app => (
            <div key={app.key}
              onClick={() => onLaunch(app.key)}
              style={{ borderRadius: 20, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,.08)', border: '1px solid rgba(0,0,0,.06)', transition: 'transform .25s ease, box-shadow .25s ease' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(0,0,0,.14)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)'; }}
            >
              {/* Header */}
              <div style={{ background: app.gradient, padding: '24px 22px 18px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.07)', top: -70, right: -50 }} />
                <div style={{ position: 'absolute', width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,.05)', bottom: -35, left: -25 }} />
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, boxShadow: '0 4px 14px rgba(0,0,0,.18)', marginBottom: 14 }}>{app.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-.3px', position: 'relative', zIndex: 1 }}>{app.name}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.68)', marginTop: 4, lineHeight: 1.5, position: 'relative', zIndex: 1 }}>{app.desc}</div>
              </div>

              {/* KPIs */}
              <div style={{ background: '#fff', padding: '14px 18px 16px' }}>
                {loading ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 12 }}>
                    {[0,1,2,3].map(i => <div key={i} style={{ height: 48, borderRadius: 9, background: 'linear-gradient(90deg,#f0f0f0 25%,#e8e8e8 50%,#f0f0f0 75%)', backgroundSize: '200% 100%', animation: 'hubShimmer 1.4s ease infinite' }} />)}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 12 }}>
                    {app.kpis.map((kpi, i) => (
                      <div key={i} style={{ background: '#f8fafc', borderRadius: 9, padding: '8px 11px', border: '1px solid #e5e9f2' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: app.accent, lineHeight: 1.1 }}>{kpi.val}</div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>{kpi.lbl}</div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={e => { e.stopPropagation(); onLaunch(app.key); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', border: 'none', borderRadius: 9, background: app.gradient, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', transition: 'filter .15s', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                >
                  Open {app.name.split(' ')[0]}
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        {data && (
          <div style={{ background: '#fff', border: '1px solid #e5e9f2', borderRadius: 16, padding: '15px 22px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            {[
              { lbl: 'RE Net Profit',      val: fmtK(data.re.profit),      color: data.re.profit >= 0 ? '#057a55' : '#c81e1e' },
              { lbl: 'Outstanding Loans',  val: fmtK(data.fl.outstanding),  color: '#b45309' },
              { lbl: 'Monthly Interest',   val: fmtK(data.fl.monthlyInterest), color: '#057a55' },
              { lbl: 'CF Commission',      val: fmtK(data.cf.commission),   color: '#f59e0b' },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{item.lbl}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.val}</div>
              </div>
            ))}
            <button
              onClick={() => { setRefreshAt(Date.now()); setData(null); setLoading(true); setProjects(null); setChits(null); setDeposits(null); setBorrowers(null); setRepayments(null); setRePayments(null); }}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'rgba(0,0,0,.05)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}>
              <RefreshCw size={13} />Refresh
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
        @media(max-width:900px) {
          .hub-name-label { display: none !important; }
          .hub-signout-label { display: none !important; }
        }
        @media(max-width:768px) {
          div[style*="grid-template-columns: repeat(3,1fr)"] { grid-template-columns: 1fr !important; }
          div[style*="padding: 28px 28px"] { padding: 16px !important; }
        }
      `}</style>
    </div>
  );
}
