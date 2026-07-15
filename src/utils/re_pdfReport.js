// Real Estate PDF report generator — same visual style as FL/CF reports for
// consistency across the whole EC Fin 360 suite.
const now = () => new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const INR = v => '₹' + Math.round(Math.abs(v || 0)).toLocaleString('en-IN');
const fmtDate = d => { if (!d) return '—'; const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d); return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

const BASE_CSS = `
  body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1a1a2e;font-size:13px;}
  h1{font-size:20px;margin:0;color:#1a1a2e;}
  h2{font-size:14px;margin:26px 0 10px;color:#1a1a2e;border-bottom:2px solid #eee;padding-bottom:6px;}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0d9488;padding-bottom:14px;margin-bottom:18px;}
  .logo{font-size:17px;font-weight:800;color:#0d9488;}
  .meta{font-size:11px;color:#6b7280;text-align:right;}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;}
  .kpi{background:#f9fafb;border-left:4px solid #0d9488;border-radius:6px;padding:10px 14px;}
  .kpi-val{font-size:17px;font-weight:800;color:#1a1a2e;}
  .kpi-lbl{font-size:10.5px;color:#6b7280;font-weight:600;text-transform:uppercase;margin-top:2px;}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;}
  th{background:#f3f4f6;text-align:left;padding:7px 10px;font-size:10.5px;text-transform:uppercase;color:#6b7280;font-weight:700;}
  td{padding:7px 10px;border-bottom:1px solid #f1f1f1;}
  .text-right{text-align:right;}
  .text-green{color:#15803d;font-weight:700;}
  .text-red{color:#b91c1c;font-weight:700;}
  .badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:10.5px;font-weight:700;}
  .badge-green{background:#dcfce7;color:#15803d;}
  .badge-red{background:#fee2e2;color:#b91c1c;}
  .badge-blue{background:#dbeafe;color:#1e40af;}
  .badge-purple{background:#ede9fe;color:#5b21b6;}
  .badge-gray{background:#f3f4f6;color:#6b7280;}
  .total-row td{font-weight:800;background:#f9fafb;border-top:2px solid #e5e7eb;}
  .footer{margin-top:30px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10.5px;color:#9ca3af;}
`;

function openPrint(title, htmlBody, accent = '#0d9488') {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${BASE_CSS.replace(/#0d9488/g, accent)}</style></head><body>${htmlBody}<script>window.onload=function(){window.print();}</script></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { alert('Allow popups to view/print this report.'); URL.revokeObjectURL(url); return; }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const TYPE_BADGE = { 'Client Payment': 'badge-green', 'Land Purchase': 'badge-red', Expense: 'badge-red', Investment: 'badge-blue', 'Investor Return': 'badge-purple' };

export function printLedgerReport(entries, projMap, filterLabel) {
  const list = entries.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const totDebit = list.reduce((s, e) => s + (e.debit || 0), 0);
  const totCredit = list.reduce((s, e) => s + (e.credit || 0), 0);
  const byType = {};
  list.forEach(e => { const k = e.type || 'Other'; if (!byType[k]) byType[k] = { debit: 0, credit: 0 }; byType[k].debit += (e.debit || 0); byType[k].credit += (e.credit || 0); });

  const body = `
    <div class="header">
      <div><div class="logo">EC Fin 360 · Real Estate Journal</div><div class="meta" style="text-align:left;margin-top:4px;">${filterLabel || 'All entries'}</div></div>
      <div class="meta">Generated: ${now()}</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(totDebit)}</div><div class="kpi-lbl">Total Debit</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totCredit)}</div><div class="kpi-lbl">Total Credit</div></div>
      <div class="kpi" style="border-left-color:${(totCredit-totDebit)>=0?'#22c55e':'#ef4444'};"><div class="kpi-val" style="color:${(totCredit-totDebit)>=0?'#15803d':'#b91c1c'};">${INR(totCredit-totDebit)}</div><div class="kpi-lbl">Net</div></div>
      <div class="kpi"><div class="kpi-val">${list.length}</div><div class="kpi-lbl">Entries</div></div>
    </div>
    <h2>By Type</h2>
    <table>
      <thead><tr><th>Type</th><th class="text-right">Debit</th><th class="text-right">Credit</th><th class="text-right">Net</th></tr></thead>
      <tbody>${Object.entries(byType).map(([k, v]) => `<tr><td>${k}</td><td class="text-right text-red">${INR(v.debit)}</td><td class="text-right text-green">${INR(v.credit)}</td><td class="text-right">${INR(v.credit - v.debit)}</td></tr>`).join('')}</tbody>
    </table>
    <h2>Transactions</h2>
    <table>
      <thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Description</th><th class="text-right">Debit</th><th class="text-right">Credit</th></tr></thead>
      <tbody>${list.map(e => `<tr><td>${fmtDate(e.date)}</td><td>${projMap[e.projectId] || '—'}</td><td><span class="badge ${TYPE_BADGE[e.type] || 'badge-gray'}">${e.type}</span></td><td>${e.description || '—'}</td><td class="text-right">${e.debit ? INR(e.debit) : '—'}</td><td class="text-right">${e.credit ? INR(e.credit) : '—'}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="4">TOTAL</td><td class="text-right">${INR(totDebit)}</td><td class="text-right">${INR(totCredit)}</td></tr></tbody>
    </table>
    <div class="footer"><span>EC Fin 360 Real Estate</span><span>Journal Report</span></div>
  `;
  openPrint('Real Estate Journal', body, '#0d9488');
}
