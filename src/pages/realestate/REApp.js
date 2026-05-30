import React, { useState } from 'react';
import Sidebar from '../../components/realestate/Sidebar';
import Dashboard from './Dashboard';
import ProjectsPage from './Projects';
import ProjectDetail from './ProjectDetail';
import { ClientsPage, InvestorsPage, PaymentsPage, LedgerPage } from './OtherPages';
import Reports from './Reports';
import AccountSettings from '../AccountSettings';

// Same structure as chitfund Layout.js
export default function REApp() {
  const [page, setPage] = useState('dashboard');
  const [detailProject, setDetailProject] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  function navigate(key, data = null) {
    setPage(key);
    if (key === 'project-detail' && data) setDetailProject(data);
    if (key !== 'project-detail') setDetailProject(null);
    setMobileSidebarOpen(false);
  }

  function getActivePage() {
    return page === 'project-detail' ? 'projects' : page;
  }

  let content;
  switch (page) {
    case 'dashboard':      content = <Dashboard onNav={navigate} />; break;
    case 'projects':       content = <ProjectsPage onView={p => navigate('project-detail', p)} />; break;
    case 'project-detail': content = <ProjectDetail project={detailProject} onBack={() => navigate('projects')} />; break;
    case 'clients':        content = <ClientsPage />; break;
    case 'investors':      content = <InvestorsPage />; break;
    case 'payments':       content = <PaymentsPage />; break;
    case 'ledger':         content = <LedgerPage />; break;
    case 'reports':        content = <Reports />; break;
    case 'account':        content = <AccountSettings onBack={() => navigate('dashboard')} />; break;
    default:               content = <Dashboard onNav={navigate} />;
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      minHeight: 'calc(100vh - 50px)',
      overflow: 'hidden',
      background: '#F4F6FB',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'Helvetica Neue', sans-serif",
      WebkitFontSmoothing: 'antialiased',
    }}>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 149 }}
        />
      )}

      {/* Sidebar — fixed on desktop, slide-in on mobile */}
      <div style={{
        flexShrink: 0,
        height: '100%',
        position: 'relative',
        zIndex: 150,
      }} className="re-sidebar-wrap">
        <Sidebar
          active={getActivePage()}
          onChange={navigate}
          onClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Mobile sidebar (overlay) */}
      <div style={{
        position: 'fixed', top: 50, left: 0, bottom: 0, zIndex: 150,
        transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }} className="re-mobile-sidebar">
        <Sidebar
          active={getActivePage()}
          onChange={navigate}
          onClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
        {/* Mobile topbar */}
        <div style={{ display: 'none', alignItems: 'center', gap: 12, padding: '13px 18px', background: '#1E2640', position: 'sticky', top: 0, zIndex: 99 }} className="re-mobile-topbar">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 7, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Layout ERP</span>
        </div>

        <div style={{ padding: '28px 32px 48px' }} className="re-main-pad">
          {content}
        </div>
      </main>

      <style>{`
        @media (min-width: 769px) {
          .re-mobile-sidebar { display: none !important; }
          .re-mobile-topbar  { display: none !important; }
          .re-sidebar-wrap   { display: block !important; }
        }
        @media (max-width: 768px) {
          .re-sidebar-wrap   { display: none !important; }
          .re-mobile-topbar  { display: flex !important; }
          .re-main-pad       { padding: 16px !important; }
        }
      `}</style>
    </div>
  );
}
