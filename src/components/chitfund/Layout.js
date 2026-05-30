import { Outlet } from 'react-router-dom';
// src/components/Layout.js
import React from 'react';
import Sidebar from './Sidebar';
import { tokens } from './UI';

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: tokens.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif', WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ flexShrink: 0, height: '100%' }}>
        <Sidebar />
      </div>
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 40px' }}>
        <Outlet/>
      </main>
    </div>
  );
}
