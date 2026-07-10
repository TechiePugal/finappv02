import React, { useState } from 'react';
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
import CFCalendar from './pages/chitfund/Calendar';
import CFProjection from './pages/chitfund/Projection';
import CFLedger from './pages/chitfund/Ledger';
import CFExposure from './pages/chitfund/Exposure';
import CFCommissionCalc from './pages/chitfund/CommissionCalc';
import CFSettings from './pages/chitfund/Settings';
import CFOtherChits from './pages/chitfund/OtherChits';
import CFJournal from './pages/chitfund/Journal';
import CFJoinedAuctions from './pages/chitfund/JoinedAuctions';
import CFJoinedExposure from './pages/chitfund/JoinedExposure';
import CFJoinedLedger from './pages/chitfund/JoinedLedger';

// Finance Ledger (react-router with /fl prefix)
import FLLayout from './components/finledger/Layout';
import FLDashboard from './pages/finledger/Dashboard';
import FLDepositors from './pages/finledger/Depositors';
import FLDepositorForm from './pages/finledger/DepositorForm';
import FLDepositorSettlement from './pages/finledger/DepositorSettlement';
import FLBorrowers from './pages/finledger/Borrowers';
import FLCustomers from './pages/finledger/Customers';
import FLJournal from './pages/finledger/Journal';
import FLBorrowerForm from './pages/finledger/BorrowerForm';
import FLInterestCollection from './pages/finledger/InterestCollection';
import FLLoanRepayment from './pages/finledger/LoanRepayment';
import FLMonthlyReceivable from './pages/finledger/MonthlyReceivable';
import FLSecurityDocuments from './pages/finledger/SecurityDocuments';
import FLLedgerEntries from './pages/finledger/LedgerEntries';
import FLBackupRestore from './pages/finledger/BackupRestore';
import FLAlerts from './pages/finledger/Alerts';
import FLEMILoans from './pages/finledger/EMILoans';
import FLEMIAlerts from './pages/finledger/EMIAlerts';
import FLExpenses from './pages/finledger/FinanceExpenses';
import FLReports from './pages/finledger/Reports';

// Full-page branded loading screen shown on first load
const AppLoadingScreen = () => (
  <div className="app-loading-overlay">
    <div className="app-loading-logo">
      <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
        <path d="M8 22 L14 13 L20 23 L25 16 L32 21" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="32" cy="21" r="2.8" fill="white"/>
      </svg>
    </div>
    <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>FinSuite</div>
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

function BackBar({ appName, accent, onBack }) {
  return (
    <div className="hub-back-bar">
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        Finance Suite
      </button>
      <div style={{ padding: '4px 12px', borderRadius: 100, background: accent + '18', color: accent, fontSize: 12, fontWeight: 700 }}>
        {appName}
      </div>
    </div>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();
  const [activeApp, setActiveApp] = useState(null);
  const [showAccount, setShowAccount] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) return <AppLoadingScreen />;
  if (!user) return <AuthPage />;

  function launch(app) {
    setActiveApp(app);
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
        <BackBar appName="Real Estate ERP" accent="#007aff" onBack={goHub} />
        <REApp />
      </>
    );
  }

  // Chit Fund
  if (activeApp === 'cf' || location.pathname.startsWith('/cf')) {
    return (
      <>
        <BackBar appName="Chit Fund Manager" accent="#f59e0b" onBack={goHub} />
        <Routes>
          <Route path="/cf" element={<CFLayout />}>
            <Route index element={<CFDashboard />} />
            <Route path="chits" element={<CFChitList />} />
            <Route path="bidding-notes" element={<CFBiddingNotes />} />
            <Route path="members" element={<CFMembers />} />
            <Route path="chits/:id" element={<CFChitDetail />} />
            <Route path="auctions" element={<CFAuctions />} />
            <Route path="calendar" element={<CFCalendar />} />
            <Route path="projection" element={<CFProjection />} />
            <Route path="ledger" element={<CFLedger />} />
            <Route path="exposure" element={<CFExposure />} />
            <Route path="settings" element={<CFSettings />} />
            <Route path="commission-calc" element={<CFCommissionCalc />} />
            <Route path="other-chits" element={<CFOtherChits />} />
            <Route path="journal" element={<CFJournal />} />
            <Route path="joined-auctions" element={<CFJoinedAuctions />} />
            <Route path="joined-exposure" element={<CFJoinedExposure />} />
            <Route path="joined-ledger" element={<CFJoinedLedger />} />
          </Route>
          <Route path="*" element={<Navigate to="/cf" replace />} />
        </Routes>
      </>
    );
  }

  // Finance Ledger
  if (activeApp === 'fl' || location.pathname.startsWith('/fl')) {
    return (
      <>
        <BackBar appName="Finance Ledger" accent="#10b981" onBack={goHub} />
        <Routes>
          <Route path="/fl" element={<FLLayout user={user} />}>
            <Route index element={<FLDashboard />} />
            <Route path="customers" element={<FLCustomers />} />
            <Route path="journal" element={<FLJournal />} />
            <Route path="depositors" element={<FLDepositors />} />
            <Route path="depositors/new" element={<FLDepositorForm />} />
            <Route path="depositors/edit/:id" element={<FLDepositorForm />} />
            <Route path="depositor-settlement" element={<FLDepositorSettlement />} />
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
            <Route path="emi-loans" element={<FLEMILoans />} />
            <Route path="emi-alerts" element={<FLEMIAlerts />} />
            <Route path="expenses" element={<FLExpenses />} />
            <Route path="reports" element={<FLReports />} />
          </Route>
          <Route path="*" element={<Navigate to="/fl" replace />} />
        </Routes>
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
