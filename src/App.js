import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './styles/global.css';
import { shimmerKeyframes } from './components/Skeleton';

// Hub & Auth
import AuthPage from './pages/AuthPage';
import Hub from './pages/Hub';
import AccountSettings from './pages/AccountSettings';

// Real Estate (state-based, no router)
import REApp from './pages/realestate/REApp';

// Chit Fund (react-router with /cf prefix)
import CFLayout from './components/chitfund/Layout';
import CFDashboard from './pages/chitfund/Dashboard';
import CFChitList from './pages/chitfund/ChitList';
import CFBiddingNotes from './pages/chitfund/BiddingNotes';
import CFMembers from './pages/chitfund/Members';
import CFChitDetail from './pages/chitfund/ChitDetail';
import CFAuctions from './pages/chitfund/Auctions';
import CFFormedExpectedFund from './pages/chitfund/FormedExpectedFund';
import CFCalendar from './pages/chitfund/Calendar';
import CFProjection from './pages/chitfund/Projection';
import CFLedger from './pages/chitfund/Ledger';
import CFExposure from './pages/chitfund/Exposure';
import CFCommissionCalc from './pages/chitfund/CommissionCalc';
import CFSettings from './pages/chitfund/Settings';
import CFOtherChits from './pages/chitfund/OtherChits';
import CFOtherChitCompanies from './pages/chitfund/OtherChitCompanies';
import CFJournal from './pages/chitfund/Journal';
import CFJoinedAuctions from './pages/chitfund/JoinedAuctions';
import CFExpectedFund from './pages/chitfund/ExpectedFund';
import CFJoinedExposure from './pages/chitfund/JoinedExposure';
import CFJoinedLedger from './pages/chitfund/JoinedLedger';
import CFJoinedCalendar from './pages/chitfund/JoinedCalendar';

// Finance Ledger (react-router with /fl prefix)
import FLLayout from './components/finledger/Layout';
import FLDashboard from './pages/finledger/Dashboard';
import FLDepositors from './pages/finledger/Depositors';
import FLDepositorForm from './pages/finledger/DepositorForm';
import FLDepositorSettlement from './pages/finledger/DepositorSettlement';
import FLRefunding from './pages/finledger/Refunding';
import FLBorrowers from './pages/finledger/Borrowers';
import FLCustomers from './pages/finledger/Customers';
import FLJournal from './pages/finledger/Journal';
import FLBorrowerForm from './pages/finledger/BorrowerForm';
import FLEMILoanForm from './pages/finledger/EMILoanForm';
import FLInterestCollection from './pages/finledger/InterestCollection';
import FLLoanRepayment from './pages/finledger/LoanRepayment';
import FLMonthlyReceivable from './pages/finledger/MonthlyReceivable';
import FLSecurityDocuments from './pages/finledger/SecurityDocuments';
import FLLedgerEntries from './pages/finledger/LedgerEntries';
import FLBackupRestore from './pages/finledger/BackupRestore';
import FLAlerts from './pages/finledger/Alerts';
import FLNonActives from './pages/finledger/NonActives';
import FLEMILoans from './pages/finledger/EMILoans';
import FLCollectEMI from './pages/finledger/CollectEMI';
import FLEMIAlerts from './pages/finledger/EMIAlerts';
import FLExpenses from './pages/finledger/FinanceExpenses';
import FLReports from './pages/finledger/Reports';

// Full-page branded loading screen shown on first load
const AppLoadingScreen = () => (
  <div className="app-loading-overlay">
    <div className="app-loading-logo">
      <img src="/logo.png" alt="EC Fin 360" style={{ width: 44, height: 44, borderRadius: 12 }} />
    </div>
    <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>EC Fin 360</div>
    <div className="app-loading-bar">
      <div className="app-loading-bar-fill" />
    </div>
    <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading your dashboard…</p>
    <style>{shimmerKeyframes}</style>
  </div>
);

const Spinner = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', gap: 16 }}>
    <div className="spin" style={{ width: 36, height: 36 }} />
    <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading Finance Suite…</p>
  </div>
);

// Screen-privacy lock: a small padlock toggle sitting right beside each app's
// name pill in the shared back bar. Every app (Real Estate, Chit Fund, Finance
// Ledger) starts LOCKED on every page — the content below is blurred and
// can't be scrolled/interacted with — until the person taps this icon to
// unlock it. It's a plain UI toggle (no password), meant purely so sensitive
// figures aren't visible/scrollable the instant a page loads or is glanced at.
function LockToggle({ locked, onToggle }) {
  return (
    <button onClick={onToggle} title={locked ? 'Locked — tap to unlock' : 'Unlocked — tap to lock'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%',
        border: `1px solid ${locked ? 'rgba(255,59,48,0.28)' : 'rgba(52,199,89,0.3)'}`,
        background: locked ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)',
        color: locked ? '#d70015' : '#248a3d',
        cursor: 'pointer', flexShrink: 0, transition: 'all .15s',
      }}>
      {locked ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
          <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2.5" />
        </svg>
      )}
    </button>
  );
}

function BackBar({ appName, accent, onBack, locked, onToggleLock }) {
  return (
    <div className="back-bar" style={{ justifyContent: 'space-between' }}>
      {/* The back button itself is part of what's gated behind the lock — while
          locked there is no way out of the app except unlocking first. Only once
          `locked` flips to false does the actual clickable "Finance Suite" button
          appear; until then this side of the bar just shows a plain, unclickable
          "Locked" indicator so nothing here can be tapped by accident. */}
      {locked ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 13, fontWeight: 500, color: 'var(--text-tertiary)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Locked
        </div>
      ) : (
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Finance Suite
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ padding: '4px 12px', borderRadius: 100, background: accent + '18', color: accent, fontSize: 12, fontWeight: 700 }}>
          {appName}
        </div>
        <LockToggle locked={locked} onToggle={onToggleLock} />
      </div>
    </div>
  );
}

// Wraps an app's whole content area. While locked: blurred, unclickable and
// unscrollable, with a centered "tap to unlock" card on top. The parent
// (AppRouter) re-locks it automatically on every route change, or every
// internal page change for Real Estate (see REApp's onNavigate callback).
function PrivacyLock({ locked, onUnlock, accent, children }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        filter: locked ? 'blur(16px) saturate(0.7)' : 'none',
        pointerEvents: locked ? 'none' : 'auto',
        userSelect: locked ? 'none' : 'auto',
        overflow: locked ? 'hidden' : 'visible',
        transition: 'filter .2s ease',
      }}>
        {children}
      </div>
      {locked && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.4)' }}>
          <button onClick={onUnlock} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '26px 34px', borderRadius: 20,
            border: '1px solid rgba(0,0,0,0.08)', background: '#fff', boxShadow: '0 16px 44px rgba(0,0,0,0.16)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
                <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111928' }}>Screen Locked</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Tap to unlock and view this page</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [activeApp, setActiveApp] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const [locked, setLocked] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // The screen starts locked when an app is first opened (see launch() below)
  // and stays exactly as the person left it while they move between pages
  // inside that app — no re-locking on every internal page-to-page switch.
  // It only locks again once they leave the app and open one fresh.

  if (loading) return <AppLoadingScreen />;
  if (!user) return <AuthPage />;

  function launch(app) {
    setActiveApp(app);
    setLocked(true);
    navigate(`/${app}`);
  }

  function goHub() {
    setActiveApp(null);
    navigate('/');
  }

  // Hub
  if (!activeApp && location.pathname === '/') {
    if (showAccount) {
      return <AccountSettings onBack={() => setShowAccount(false)} />;
    }
    return <Hub onLaunch={launch} onAccount={() => setShowAccount(true)} />;
  }

  // Real Estate
  if (activeApp === 're' || location.pathname.startsWith('/re')) {
    return (
      <>
        <BackBar appName="Real Estate ERP" accent="#007aff" onBack={goHub} locked={locked} onToggleLock={() => setLocked(l => !l)} />
        <PrivacyLock locked={locked} onUnlock={() => setLocked(false)} accent="#007aff">
          <REApp />
        </PrivacyLock>
      </>
    );
  }

  // Chit Fund
  if (activeApp === 'cf' || location.pathname.startsWith('/cf')) {
    return (
      <>
        <BackBar appName="Chit Fund Manager" accent="#f59e0b" onBack={goHub} locked={locked} onToggleLock={() => setLocked(l => !l)} />
        <PrivacyLock locked={locked} onUnlock={() => setLocked(false)} accent="#f59e0b">
        <Routes>
          <Route path="/cf" element={<CFLayout />}>
            <Route index element={<CFDashboard />} />
            <Route path="chits" element={<CFChitList />} />
            <Route path="bidding-notes" element={<CFBiddingNotes />} />
            <Route path="members" element={<CFMembers />} />
            <Route path="chits/:id" element={<CFChitDetail />} />
            <Route path="auctions" element={<CFAuctions />} />
            <Route path="formed-expected-fund" element={<CFFormedExpectedFund />} />
            <Route path="calendar" element={<CFCalendar />} />
            <Route path="projection" element={<CFProjection />} />
            <Route path="ledger" element={<CFLedger />} />
            <Route path="exposure" element={<CFExposure />} />
            <Route path="settings" element={<CFSettings />} />
            <Route path="commission-calc" element={<CFCommissionCalc />} />
            <Route path="other-chits" element={<CFOtherChits />} />
            <Route path="other-chit-companies" element={<CFOtherChitCompanies />} />
            <Route path="journal" element={<CFJournal />} />
            <Route path="joined-auctions" element={<CFJoinedAuctions />} />
            <Route path="joined-calendar" element={<CFJoinedCalendar />} />
            <Route path="expected-fund" element={<CFExpectedFund />} />
            <Route path="joined-exposure" element={<CFJoinedExposure />} />
            <Route path="joined-ledger" element={<CFJoinedLedger />} />
          </Route>
          <Route path="*" element={<Navigate to="/cf" replace />} />
        </Routes>
        </PrivacyLock>
      </>
    );
  }

  // Finance Ledger
  if (activeApp === 'fl' || location.pathname.startsWith('/fl')) {
    return (
      <>
        <BackBar appName="Finance Ledger" accent="#10b981" onBack={goHub} locked={locked} onToggleLock={() => setLocked(l => !l)} />
        <PrivacyLock locked={locked} onUnlock={() => setLocked(false)} accent="#10b981">
        <Routes>
          <Route path="/fl" element={<FLLayout user={user} />}>
            <Route index element={<FLDashboard />} />
            <Route path="customers" element={<FLCustomers />} />
            <Route path="journal" element={<FLJournal />} />
            <Route path="depositors" element={<FLDepositors />} />
            <Route path="depositors/new" element={<FLDepositorForm />} />
            <Route path="depositors/edit/:id" element={<FLDepositorForm />} />
            <Route path="depositor-settlement" element={<FLDepositorSettlement />} />
            <Route path="refunding" element={<FLRefunding />} />
            <Route path="borrowers" element={<FLBorrowers />} />
            <Route path="borrowers/new" element={<FLBorrowerForm />} />
            <Route path="borrowers/edit/:id" element={<FLBorrowerForm />} />
            <Route path="interest-collection" element={<FLInterestCollection />} />
            <Route path="loan-repayment" element={<FLLoanRepayment />} />
            <Route path="monthly-receivable" element={<FLMonthlyReceivable />} />
            <Route path="security-documents" element={<FLSecurityDocuments />} />
            <Route path="ledger" element={<FLLedgerEntries />} />
            <Route path="backup" element={<FLBackupRestore />} />
            <Route path="alerts" element={<FLAlerts />} />
            <Route path="non-actives" element={<FLNonActives />} />
            <Route path="emi-loans" element={<FLEMILoans />} />
            <Route path="collect-emi" element={<FLCollectEMI />} />
            <Route path="emi-loans/new" element={<FLEMILoanForm />} />
            <Route path="emi-loans/edit/:id" element={<FLEMILoanForm />} />
            <Route path="emi-alerts" element={<FLEMIAlerts />} />
            <Route path="expenses" element={<FLExpenses />} />
            <Route path="reports" element={<FLReports />} />
          </Route>
          <Route path="*" element={<Navigate to="/fl" replace />} />
        </Routes>
        </PrivacyLock>
      </>
    );
  }

  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-center" toastOptions={{
          duration: 3200,
          style: { background: '#fff', color: '#1d1d1f', border: '1px solid rgba(0,0,0,.08)', borderRadius: 12, fontSize: 14 },
          success: { iconTheme: { primary: '#34c759', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ff3b30', secondary: '#fff' } },
        }} />
        <AppRouter />
      </BrowserRouter>
    </AuthProvider>
  );
}
