// Chit Fund PDF report generator — mirrors the style/structure of Finance
// Ledger's utils/pdfReport.js so every export across the whole app looks
// consistent: KPI cards, color-coded badges, clean tables, printable via
// the browser's native print dialog (Save as PDF).

const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const INR = v => '₹' + Math.round(Math.abs(v || 0)).toLocaleString('en-IN');
const fmtDate = d => { if (!d) return '—'; const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d); return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

const BASE_CSS = `
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1a1a2e;font-size:13px;}
  h1{font-size:20px;margin:0;color:#1a1a2e;}
  h2{font-size:14px;margin:26px 0 10px;color:#1a1a2e;border-bottom:2px solid #eee;padding-bottom:6px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a56db;padding-bottom:14px;margin-bottom:18px;}
  .logo{font-size:17px;font-weight:800;color:#1a56db;}
  .meta{font-size:11px;color:#6b7280;text-align:right;}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;}
  .kpi{background:#f9fafb;border-left:4px solid #1a56db;border-radius:6px;padding:10px 14px;}
  .kpi-val{font-size:17px;font-weight:800;color:#1a1a2e;}
  .kpi-lbl{font-size:10.5px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-top:2px;}
  .kpi-sub{font-size:10px;color:#9ca3af;margin-top:1px;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}
  th{background:#f3f4f6;text-align:left;padding:7px 10px;font-size:10.5px;text-transform:uppercase;color:#6b7280;font-weight:700;}
  td{padding:7px 10px;border-bottom:1px solid #f1f1f1;}
  .text-right{text-align:right;}
  .text-green{color:#15803d;font-weight:700;}
  .text-red{color:#b91c1c;font-weight:700;}
  .text-amber{color:#b45309;font-weight:700;}
  .badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:10.5px;font-weight:700;}
  .badge-green{background:#dcfce7;color:#15803d;}
  .badge-red{background:#fee2e2;color:#b91c1c;}
  .badge-amber{background:#fef3c7;color:#b45309;}
  .badge-blue{background:#dbeafe;color:#1e40af;}
  .badge-purple{background:#ede9fe;color:#5b21b6;}
  .badge-gray{background:#f3f4f6;color:#6b7280;}
  .total-row td{font-weight:800;background:#f9fafb;border-top:2px solid #e5e7eb;}
  .section-note{font-size:11px;color:#6b7280;margin:-6px 0 10px;}
  .chit-card{border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px;overflow:hidden;}
  .chit-card-head{padding:10px 14px;background:#f9fafb;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;}
  .footer{margin-top:30px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10.5px;color:#9ca3af;}
`;

function openPrint(title, htmlBody, accent = '#1a56db') {
  // Blob URL instead of window.open('','_blank') — avoids the tab showing 'about:blank'
  // (which never updates its address-bar URL even after document.write sets a <title>).
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${BASE_CSS.replace(/#1a56db/g, accent)}</style></head><body>${htmlBody}<script>window.onload=function(){window.print();}</script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { alert('Allow popups to view/print this report.'); URL.revokeObjectURL(url); return; }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── MANAGE CHIT FUNDS — all-chits summary ──────────────────────────────────
export function printChitListSummary(chits) {
  const active = chits.filter(c => c.status === 'Active');
  const totalValue = chits.reduce((s, c) => s + (c.totalChitValue || 0), 0);
  const totalCommission = chits.reduce((s, c) => s + (c.totalCommissionEarned || 0), 0);

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Chit Fund Summary</div><div class="meta" style="text-align:left;margin-top:4px;">All formed chit funds — status, value and progress</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${chits.length}</div><div class="kpi-lbl">Total Chits</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${active.length}</div><div class="kpi-lbl">Active</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(totalValue)}</div><div class="kpi-lbl">Total Chit Value</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(totalCommission)}</div><div class="kpi-lbl">Total Commission Earned</div></div>
    </div>
    <h2>Chit Fund Records</h2>
    <table>
      <thead><tr><th>Chit Name</th><th class="text-right">Value</th><th>Members</th><th>Progress</th><th class="text-right">Per Head</th><th>Status</th></tr></thead>
      <tbody>
        ${chits.map(c => `<tr><td>${c.companyName}</td><td class="text-right">${INR(c.totalChitValue)}</td><td>${c.totalMembers}</td><td>${c.auctionsCompleted || 0}/${c.totalMembers} rounds</td><td class="text-right">${INR(c.perHeadValue)}</td><td><span class="badge ${c.status === 'Active' ? 'badge-green' : 'badge-gray'}">${c.status || '—'}</span></td></tr>`).join('')}
        <tr class="total-row"><td>TOTAL</td><td class="text-right">${INR(totalValue)}</td><td colspan="4"></td></tr>
      </tbody>
    </table>
    <div class="footer"><span>EC Fin 360 Chit Fund</span><span>Manage Chit Funds — Summary Report</span></div>
  `;
  openPrint('Chit Funds Summary', body, '#5856D6');
}

// ── PER-CHIT full documentation ──────────────────────────────────────────
export function printChitFullDocument(chit, members, auctionResults) {
  const takenCount = members.filter(m => m.status === 'Taken').length;
  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Chit Fund Full Document</div><div class="meta" style="text-align:left;margin-top:4px;">${chit.companyName}</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${INR(chit.totalChitValue)}</div><div class="kpi-lbl">Total Chit Value</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${chit.totalMembers}</div><div class="kpi-lbl">Total Members</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${takenCount}/${chit.totalMembers}</div><div class="kpi-lbl">Rounds Completed</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(chit.perHeadValue)}</div><div class="kpi-lbl">Per Head Value</div></div>
    </div>
    <h2>Chit Details</h2>
    <table>
      <tbody>
        <tr><td style="color:#6b7280;">Start Date</td><td>${fmtDate(chit.startDate)}</td><td style="color:#6b7280;">Auction Interval</td><td>${chit.auctionInterval || 1} month(s)</td></tr>
        <tr><td style="color:#6b7280;">Commission Type</td><td>${chit.commissionType || '—'}</td><td style="color:#6b7280;">Organiser Fee</td><td>${chit.managerCommissionPct || 0}%</td></tr>
        <tr><td style="color:#6b7280;">Status</td><td><span class="badge ${chit.status === 'Active' ? 'badge-green' : 'badge-gray'}">${chit.status || '—'}</span></td><td style="color:#6b7280;">Branch</td><td>${chit.branch || '—'}</td></tr>
      </tbody>
    </table>
    <h2>Members (${members.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Status</th></tr></thead>
      <tbody>
        ${members.map((m, i) => `<tr><td>${i + 1}</td><td>${m.name}</td><td>${m.phone || '—'}</td><td><span class="badge ${m.status === 'Taken' ? 'badge-purple' : 'badge-green'}">${m.status || 'Active'}</span></td></tr>`).join('')}
      </tbody>
    </table>
    <h2>Auction History (${auctionResults.length} completed)</h2>
    ${auctionResults.length === 0 ? '<p style="color:#9ca3af;font-size:12px;">No auctions completed yet.</p>' : `
    <table>
      <thead><tr><th>Round</th><th>Date</th><th>Winner</th><th class="text-right">Bid Amount</th><th class="text-right">Winner In-Hand</th></tr></thead>
      <tbody>
        ${auctionResults.sort((a, b) => a.auctionNumber - b.auctionNumber).map(r => `<tr><td>#${r.auctionNumber}</td><td>${fmtDate(r.auctionDate)}</td><td>${r.winnerName}</td><td class="text-right">${INR(r.bidAmount)}</td><td class="text-right text-green">${INR((chit.totalChitValue || 0) - (r.bidAmount || 0))}</td></tr>`).join('')}
      </tbody>
    </table>`}
    <div class="footer"><span>EC Fin 360 Chit Fund · Confidential</span><span>${chit.companyName} — Full Document</span></div>
  `;
  openPrint(`${chit.companyName} — Full Document`, body, '#5856D6');
}

// ── PER-JOINED-CHIT full document ───────────────────────────────────────
export function printJoinedChitDocument(chit, payments) {
  const paid = payments.filter(p => p.status === 'Paid');
  const totalPaid = paid.reduce((s, p) => s + (p.amount || 0), 0);
  const totalReceived = payments.reduce((s, p) => s + (p.iWon ? (p.prizeReceived || 0) : 0), 0);
  const sub = (chit.totalChitValue || 0) / (chit.totalMembers || 1);

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Joined Chit Document</div><div class="meta" style="text-align:left;margin-top:4px;">${chit.companyName}</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${INR(chit.totalChitValue)}</div><div class="kpi-lbl">Total Chit Value</div></div>
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(totalPaid)}</div><div class="kpi-lbl">Total Paid (You)</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totalReceived)}</div><div class="kpi-lbl">Prize Received</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(sub)}</div><div class="kpi-lbl">Monthly Subscription</div></div>
    </div>
    <h2>Chit Details</h2>
    <table><tbody>
      <tr><td style="color:#6b7280;">Total Members</td><td>${chit.totalMembers}</td><td style="color:#6b7280;">Status</td><td><span class="badge ${chit.myStatus === 'Cashed' ? 'badge-purple' : 'badge-green'}">${chit.myStatus || 'Active'}</span></td></tr>
      <tr><td style="color:#6b7280;">Expected Take Month</td><td>${chit.expectedTakeMonth || '—'}</td><td style="color:#6b7280;">Actual Take Month</td><td>${chit.actualTakeMonth || '—'}</td></tr>
    </tbody></table>
    <h2>Payment History (${payments.length} months)</h2>
    ${payments.length === 0 ? '<p style="color:#9ca3af;font-size:12px;">No payments recorded yet.</p>' : `
    <table>
      <thead><tr><th>Month</th><th>Status</th><th class="text-right">Amount</th><th>Won This Month</th><th class="text-right">Prize</th></tr></thead>
      <tbody>
        ${payments.map(p => `<tr><td>${p.month}</td><td><span class="badge ${p.status === 'Paid' ? 'badge-green' : 'badge-amber'}">${p.status || 'Pending'}</span></td><td class="text-right">${INR(p.amount)}</td><td>${p.iWon ? '🏆 Yes' : '—'}</td><td class="text-right">${p.iWon ? INR(p.prizeReceived) : '—'}</td></tr>`).join('')}
        <tr class="total-row"><td colspan="2">TOTAL</td><td class="text-right">${INR(totalPaid)}</td><td></td><td class="text-right">${INR(totalReceived)}</td></tr>
      </tbody>
    </table>`}
    <div class="footer"><span>EC Fin 360 Chit Fund · Confidential</span><span>${chit.companyName} — Joined Chit Document</span></div>
  `;
  openPrint(`${chit.companyName} — Joined Chit Document`, body, '#34C759');
}

// ── MEMBER individual history ──────────────────────────────────────────
export function printMemberHistory(person, rows) {
  const active = rows.filter(r => r.status !== 'Taken');
  const closed = rows.filter(r => r.status === 'Taken');
  const totalCollected = rows.reduce((s, r) => s + r.payments.filter(p => p.paymentStatus === 'Paid').reduce((a, p) => a + (p.netPayable || 0), 0), 0);

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Member Full History</div><div class="meta" style="text-align:left;margin-top:4px;">${person.name}</div></div>
      <div class="meta">Generated: ${now()}<br/>${person.phone || ''}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${rows.length}</div><div class="kpi-lbl">Total Chits</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${active.length}</div><div class="kpi-lbl">Active</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${closed.length}</div><div class="kpi-lbl">Taken / Closed</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(totalCollected)}</div><div class="kpi-lbl">Total Collected</div></div>
    </div>
    ${rows.length === 0 ? '<p style="color:#9ca3af;">Not a member of any formed chit yet.</p>' : rows.map(r => `
      <div class="chit-card">
        <div class="chit-card-head">
          <div><strong>${r.chit?.companyName || 'Unknown chit'}</strong> <span class="badge ${r.status === 'Taken' ? 'badge-purple' : 'badge-green'}">${r.status === 'Taken' ? 'Taken / Closed' : 'Active'}</span></div>
          <div style="font-size:11px;color:#6b7280;">${r.chit ? `Chit Value: ${INR(r.chit.totalChitValue)} · ${r.chit.totalMembers} members` : ''}</div>
        </div>
        ${r.payments.length === 0 ? '<p style="padding:10px 14px;font-size:11.5px;color:#9ca3af;">No payment records yet.</p>' : `
        <table style="margin:0;">
          <thead><tr><th>Round</th><th>Date</th><th>Status</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            ${r.payments.map(p => `<tr><td>#${p.auctionNumber}</td><td>${fmtDate(p.auctionDate)}</td><td><span class="badge ${p.paymentStatus === 'Paid' ? 'badge-green' : 'badge-amber'}">${p.paymentStatus}</span></td><td class="text-right">${INR(p.netPayable)}</td></tr>`).join('')}
          </tbody>
        </table>`}
      </div>
    `).join('')}
    <div class="footer"><span>EC Fin 360 Chit Fund · Confidential</span><span>${person.name} — Full History</span></div>
  `;
  openPrint(`${person.name} — Full History`, body, '#007AFF');
}

// ── JOURNAL — full transaction history ──────────────────────────────────
export function printCfJournal(entries, fromDate, toDate) {
  const list = entries.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const credit = list.filter(e => e.type === 'Credit').reduce((s, e) => s + (e.amount || 0), 0);
  const debit = list.filter(e => e.type === 'Debit').reduce((s, e) => s + (e.amount || 0), 0);
  const byCat = {};
  list.forEach(e => { const k = e.category || 'Other'; if (!byCat[k]) byCat[k] = { credit: 0, debit: 0 }; if (e.type === 'Credit') byCat[k].credit += (e.amount || 0); else byCat[k].debit += (e.amount || 0); });

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Chit Fund Journal</div><div class="meta" style="text-align:left;margin-top:4px;">Period: ${fromDate} to ${toDate}</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(credit)}</div><div class="kpi-lbl">Total Income</div></div>
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(debit)}</div><div class="kpi-lbl">Total Outflow</div></div>
      <div class="kpi" style="border-left-color:${(credit - debit) >= 0 ? '#22c55e' : '#ef4444'};"><div class="kpi-val" style="color:${(credit - debit) >= 0 ? '#15803d' : '#b91c1c'};">${INR(credit - debit)}</div><div class="kpi-lbl">Net P&amp;L</div></div>
      <div class="kpi"><div class="kpi-val">${list.length}</div><div class="kpi-lbl">Entries</div></div>
    </div>
    <h2>P&amp;L by Category</h2>
    <table>
      <thead><tr><th>Category</th><th class="text-right">Income</th><th class="text-right">Expense</th><th class="text-right">Net</th></tr></thead>
      <tbody>${Object.entries(byCat).map(([k, v]) => `<tr><td>${k}</td><td class="text-right text-green">${INR(v.credit)}</td><td class="text-right text-red">${INR(v.debit)}</td><td class="text-right">${INR(v.credit - v.debit)}</td></tr>`).join('')}</tbody>
    </table>
    <h2>Transactions</h2>
    <table>
      <thead><tr><th>Date</th><th>Source</th><th>Chit</th><th>Type</th><th>Description</th><th class="text-right">Amount</th></tr></thead>
      <tbody>${list.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${e.source}</td><td>${e.chitName}</td><td><span class="badge ${e.type === 'Credit' ? 'badge-green' : 'badge-red'}">${e.type}</span></td><td>${e.description}</td><td class="text-right ${e.type === 'Credit' ? 'text-green' : 'text-red'}">${e.type === 'Credit' ? '+' : '-'}${INR(e.amount)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="footer"><span>EC Fin 360 Chit Fund</span><span>Journal Report</span></div>
  `;
  openPrint('Chit Fund Journal', body, '#1a56db');
}

// ── CALENDAR — monthly overview, formed + joined, amount needed ─────────
export function printMonthlyCalendar(monthLabel, formedRows, joinedRows) {
  const totalFormed = formedRows.reduce((s, r) => s + (r.amountNeeded || 0), 0);
  const totalJoined = joinedRows.reduce((s, r) => s + (r.amountNeeded || 0), 0);
  const grandTotal = totalFormed + totalJoined;

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Monthly Chit Overview</div><div class="meta" style="text-align:left;margin-top:4px;">${monthLabel}</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${formedRows.length + joinedRows.length}</div><div class="kpi-lbl">Total Chits This Month</div></div>
      <div class="kpi" style="border-left-color:#5856D6;"><div class="kpi-val" style="color:#5856D6;">${INR(totalFormed)}</div><div class="kpi-lbl">Formed — Amount Needed</div></div>
      <div class="kpi" style="border-left-color:#34C759;"><div class="kpi-val" style="color:#15803d;">${INR(totalJoined)}</div><div class="kpi-lbl">Joined — Amount Needed</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(grandTotal)}</div><div class="kpi-lbl">Grand Total</div></div>
    </div>
    <h2>Formed Chits (${formedRows.length})</h2>
    ${formedRows.length === 0 ? '<p style="color:#9ca3af;font-size:12px;">No formed-chit auctions this month.</p>' : `
    <table>
      <thead><tr><th>Chit</th><th>Round</th><th>Date</th><th>Status</th><th class="text-right">Amount Needed</th></tr></thead>
      <tbody>${formedRows.map(r => `<tr><td>${r.chitName}</td><td>#${r.round}</td><td>${fmtDate(r.date)}</td><td><span class="badge ${r.taken ? 'badge-green' : 'badge-amber'}">${r.taken ? 'Taken' : 'Upcoming'}</span></td><td class="text-right">${INR(r.amountNeeded)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="4">SUBTOTAL — FORMED</td><td class="text-right">${INR(totalFormed)}</td></tr></tbody>
    </table>`}
    <h2>Joined Chits (${joinedRows.length})</h2>
    ${joinedRows.length === 0 ? '<p style="color:#9ca3af;font-size:12px;">No joined-chit payments due this month.</p>' : `
    <table>
      <thead><tr><th>Chit</th><th>Status</th><th class="text-right">Amount Needed</th></tr></thead>
      <tbody>${joinedRows.map(r => `<tr><td>${r.chitName}</td><td><span class="badge ${r.taken ? 'badge-green' : 'badge-amber'}">${r.taken ? 'Paid' : 'Due'}</span></td><td class="text-right">${INR(r.amountNeeded)}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">SUBTOTAL — JOINED</td><td class="text-right">${INR(totalJoined)}</td></tr></tbody>
    </table>`}
    <div class="footer"><span>EC Fin 360 Chit Fund</span><span>Monthly Overview — ${monthLabel}</span></div>
  `;
  openPrint(`Monthly Overview — ${monthLabel}`, body, '#FF9500');
}

// ── EXPOSURE & RISK report ────────────────────────────────────────────────
export function printExposureReport(enriched, totals) {
  const { totalExposure, totalFuture, totalRisk, totalCommission, dueThisMonth } = totals;
  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Exposure &amp; Risk Report</div><div class="meta" style="text-align:left;margin-top:4px;">All formed chit funds — current exposure, future liability and risk</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(dueThisMonth)}</div><div class="kpi-lbl">Due This Month</div></div>
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(totalExposure)}</div><div class="kpi-lbl">Current Exposure</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(totalFuture)}</div><div class="kpi-lbl">Future Liability</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totalCommission)}</div><div class="kpi-lbl">Commission Earned</div></div>
    </div>
    <h2>Chit-wise Risk Breakdown</h2>
    <table>
      <thead><tr><th>Chit Fund</th><th class="text-right">Invested</th><th class="text-right">Commission</th><th class="text-right">Exposure</th><th class="text-right">Future Liability</th><th class="text-right">Total Risk</th><th>Status</th></tr></thead>
      <tbody>
        ${enriched.map(c => `<tr><td>${c.companyName}</td><td class="text-right">${INR(c.totalInvested)}</td><td class="text-right text-green">${INR(c.totalCommissionEarned)}</td><td class="text-right text-red">${INR(c.exposure)}</td><td class="text-right text-amber">${INR(c.futureLiability)}</td><td class="text-right text-red">${INR(c.totalRisk)}</td><td><span class="badge ${c.status === 'Active' ? 'badge-green' : 'badge-gray'}">${c.status}</span></td></tr>`).join('')}
        <tr class="total-row"><td>TOTAL</td><td></td><td class="text-right">${INR(totalCommission)}</td><td class="text-right">${INR(totalExposure)}</td><td class="text-right">${INR(totalFuture)}</td><td class="text-right">${INR(totalRisk)}</td><td></td></tr>
      </tbody>
    </table>
    <div class="footer"><span>EC Fin 360 Chit Fund</span><span>Exposure &amp; Risk Report</span></div>
  `;
  openPrint('Exposure & Risk Report', body, '#EF4444');
}

// ── FUND PROJECTION report ────────────────────────────────────────────────
export function printFundProjection(projection, kpis) {
  const { next1, next3, next6, next12 } = kpis;
  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Fund Projection Report</div><div class="meta" style="text-align:left;margin-top:4px;">Month-wise investment forecast — formed chits</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(next1)}</div><div class="kpi-lbl">This Month</div></div>
      <div class="kpi" style="border-left-color:#b45309;"><div class="kpi-val" style="color:#b45309;">${INR(next3)}</div><div class="kpi-lbl">Next 3 Months</div></div>
      <div class="kpi" style="border-left-color:#3b82f6;"><div class="kpi-val" style="color:#1d4ed8;">${INR(next6)}</div><div class="kpi-lbl">Next 6 Months</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(next12)}</div><div class="kpi-lbl">Next 12 Months</div></div>
    </div>
    <h2>Month-by-Month Forecast</h2>
    <table>
      <thead><tr><th>Month</th><th>Chits Contributing</th><th class="text-right">Total Needed</th></tr></thead>
      <tbody>
        ${projection.map(m => `<tr><td>${new Date(m.month?.seconds ? m.month.seconds*1000 : m.month).toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</td><td>${m.chits.map(c => c.chitName).join(', ')}</td><td class="text-right">${INR(m.total)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="footer"><span>EC Fin 360 Chit Fund</span><span>Fund Projection Report</span></div>
  `;
  openPrint('Fund Projection Report', body, '#5856D6');
}
