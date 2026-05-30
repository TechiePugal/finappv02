/**
 * pdfReport.js — Browser print-to-PDF report generator
 * Opens a styled HTML page in a new window and triggers print dialog.
 * No external libraries needed — uses browser's native print.
 */

const INR = v => '₹' + Math.abs(Number(v)||0).toLocaleString('en-IN',{maximumFractionDigits:0});
const fmtDate = d => { if(!d)return'—'; try{ return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;} };
const now = () => new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});

function baseCSS(accent='#1a56db'){
  return `
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:28px 32px;}
    h1{font-size:22px;font-weight:800;color:${accent};letter-spacing:-0.4px;margin-bottom:2px;}
    h2{font-size:15px;font-weight:700;color:#1a1a2e;margin:22px 0 10px;padding-bottom:5px;border-bottom:2px solid ${accent}30;}
    h3{font-size:13px;font-weight:700;color:#374151;margin:14px 0 6px;}
    .subtitle{font-size:12px;color:#6b7280;margin-bottom:20px;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:18px;border-bottom:2px solid ${accent}20;}
    .logo{font-size:18px;font-weight:800;color:${accent};}
    .meta{text-align:right;font-size:11px;color:#6b7280;}
    .badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.04em;}
    .badge-green{background:#dcfce7;color:#166534;}
    .badge-red{background:#fee2e2;color:#991b1b;}
    .badge-amber{background:#fef3c7;color:#92400e;}
    .badge-blue{background:#dbeafe;color:#1e40af;}
    .badge-gray{background:#f3f4f6;color:#4b5563;}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
    .kpi{background:#f8faff;border:1px solid ${accent}18;border-radius:10px;padding:12px 14px;border-left:3px solid ${accent};}
    .kpi-val{font-size:19px;font-weight:800;color:${accent};letter-spacing:-0.4px;line-height:1;}
    .kpi-lbl{font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;}
    .kpi-sub{font-size:11px;color:#9ca3af;margin-top:2px;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:18px;}
    .info-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6;}
    .info-lbl{font-size:11px;color:#6b7280;}
    .info-val{font-size:12.5px;font-weight:600;color:#1a1a2e;text-align:right;}
    table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px;}
    thead tr{background:${accent}08;border-bottom:2px solid ${accent}20;}
    th{padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;}
    td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;}
    tr:nth-child(even)td{background:#fafbff;}
    .text-right{text-align:right;}
    .text-green{color:#15803d;font-weight:700;}
    .text-red{color:#b91c1c;font-weight:700;}
    .text-blue{color:${accent};font-weight:700;}
    .text-amber{color:#b45309;font-weight:700;}
    .total-row td{font-weight:700;background:${accent}06!important;border-top:2px solid ${accent}20;}
    .section-photo{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
    .photo-circle{width:56px;height:56px;border-radius:50%;background:${accent}15;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:${accent};border:2px solid ${accent}30;overflow:hidden;flex-shrink:0;}
    .photo-circle img{width:100%;height:100%;object-fit:cover;}
    .warning-box{background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#991b1b;}
    .note-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#1e40af;}
    .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;}
    .page-break{page-break-before:always;}
    @media print{
      body{padding:16px 20px;}
      .kpi-grid{grid-template-columns:repeat(4,1fr);}
      @page{margin:12mm 15mm;}
    }
  `;
}

function openPrint(title, htmlBody, accent='#1a56db'){
  const win = window.open('', '_blank', 'width=1000,height=700');
  if(!win){ alert('Allow popups to generate PDF reports.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>${baseCSS(accent)}</style></head><body>${htmlBody}</body></html>`);
  win.document.close();
  setTimeout(()=>{ try{ win.focus(); win.print(); } catch{} }, 600);
}

// ── BORROWER REPORT ────────────────────────────────────────────────────────
export function printBorrowerReport(borrower, repayments, interestPayments){
  const reps = (repayments||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const ints = (interestPayments||[]).sort((a,b)=>(b.month||'').localeCompare(a.month||''));
  const totalRepaid = reps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const outstanding = Math.max(0,(borrower.loanAmount||0)-totalRepaid);
  const monthlyInterest = outstanding*(borrower.interestRate||0)/100;
  const totalInterestColl = ints.filter(i=>i.status==='Paid').reduce((s,i)=>s+(i.totalCollected||i.amountPaid||0),0);

  const badgeSt = s => {
    if(s==='Active')return'<span class="badge badge-green">Active</span>';
    if(s==='Closed')return'<span class="badge badge-gray">Closed</span>';
    return`<span class="badge badge-amber">${s||'—'}</span>`;
  };

  const body = `
    <div class="header">
      <div>
        <div class="logo">FinSuite · Borrower Report</div>
        <div class="meta" style="text-align:left;margin-top:4px;">Generated: ${now()}</div>
      </div>
      <div class="meta">CONFIDENTIAL<br/>Borrower ID: ${borrower.loanId||borrower.id?.slice(-8)||'—'}</div>
    </div>

    <!-- Photo + basic info -->
    <div class="section-photo">
      <div class="photo-circle">
        ${borrower.photo?`<img src="${borrower.photo}" alt=""/>`:(borrower.borrowerName||'B')[0].toUpperCase()}
      </div>
      <div>
        <div style="font-size:20px;font-weight:800;color:#1a1a2e;">${borrower.borrowerName||'—'}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:3px;">
          ${borrower.phone||''}${borrower.email?' · '+borrower.email:''} ${badgeSt(borrower.status)}
        </div>
        ${borrower.address?`<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${borrower.address}</div>`:''}
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${INR(borrower.loanAmount)}</div><div class="kpi-lbl">Original Loan</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totalRepaid)}</div><div class="kpi-lbl">Principal Repaid</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(outstanding)}</div><div class="kpi-lbl">Outstanding Balance</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(totalInterestColl)}</div><div class="kpi-lbl">Interest Collected</div></div>
    </div>

    <h2>Loan Details</h2>
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-lbl">Loan ID</span><span class="info-val" style="font-family:monospace;">${borrower.loanId||'—'}</span></div>
        <div class="info-row"><span class="info-lbl">Loan Amount</span><span class="info-val">${INR(borrower.loanAmount)}</span></div>
        <div class="info-row"><span class="info-lbl">Interest Rate</span><span class="info-val">${borrower.interestRate||0}% per month</span></div>
        <div class="info-row"><span class="info-lbl">Monthly Interest</span><span class="info-val text-blue">${INR(monthlyInterest)}</span></div>
        <div class="info-row"><span class="info-lbl">Outstanding Balance</span><span class="info-val ${outstanding>0?'text-amber':'text-green'}">${INR(outstanding)}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-lbl">Loan Start Date</span><span class="info-val">${fmtDate(borrower.loanStartDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Agreement Date</span><span class="info-val">${fmtDate(borrower.agreementDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Agreement Expiry</span><span class="info-val">${fmtDate(borrower.agreementExpiryDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Security Type</span><span class="info-val">${borrower.securityType||'—'}</span></div>
        <div class="info-row"><span class="info-lbl">Security Value</span><span class="info-val">${INR(borrower.securityValue)}</span></div>
      </div>
    </div>

    ${borrower.guardianName?`
    <h2>Guardian Details</h2>
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-lbl">Guardian Name</span><span class="info-val">${borrower.guardianName}</span></div>
        <div class="info-row"><span class="info-lbl">Guardian Phone</span><span class="info-val">${borrower.guardianPhone||'—'}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-lbl">Guardian Address</span><span class="info-val">${borrower.guardianAddress||'—'}</span></div>
      </div>
    </div>`:''}

    <!-- Repayment History -->
    <h2>Principal Repayment History (${reps.length} transactions)</h2>
    ${reps.length===0?'<p style="color:#9ca3af;font-size:12px;margin-bottom:16px;">No repayments recorded yet.</p>':`
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Amount Paid</th><th>Balance After</th><th>Mode</th><th>Type</th><th>Remarks</th></tr></thead>
      <tbody>
        ${reps.map((r,i)=>`
        <tr>
          <td>${reps.length-i}</td>
          <td>${fmtDate(r.date)}</td>
          <td class="text-green">${INR(r.repaidAmount||r.amount)}</td>
          <td class="${(r.balanceAfter||0)>0?'text-amber':'text-green'}">${INR(r.balanceAfter||0)}</td>
          <td>${r.paymentMode||'—'}</td>
          <td><span class="badge ${r.type==='Full'?'badge-green':'badge-blue'}">${r.type||'Partial'}</span></td>
          <td style="color:#6b7280;">${r.remarks||'—'}</td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="2"><strong>Total Repaid</strong></td>
          <td class="text-green">${INR(totalRepaid)}</td>
          <td class="${outstanding>0?'text-amber':'text-green'}">${INR(outstanding)} remaining</td>
          <td colspan="3"></td>
        </tr>
      </tbody>
    </table>`}

    <!-- Interest Collection History -->
    <h2>Interest Collection History (${ints.length} months)</h2>
    ${ints.length===0?'<p style="color:#9ca3af;font-size:12px;margin-bottom:16px;">No interest records yet.</p>':`
    <table>
      <thead><tr><th>Month</th><th>Outstanding</th><th>Rate</th><th>Amount Due</th><th>Amount Paid</th><th>Fine</th><th>Status</th><th>Date</th><th>Mode</th></tr></thead>
      <tbody>
        ${ints.map(i=>`
        <tr>
          <td style="font-weight:600;">${i.month||'—'}</td>
          <td>${INR(i.outstandingBalance||0)}</td>
          <td>${i.interestRate||0}%</td>
          <td class="text-amber">${INR(i.amountDue||0)}</td>
          <td class="${i.status==='Paid'?'text-green':'text-red'}">${INR(i.amountPaid||0)}</td>
          <td>${i.fine>0?INR(i.fine):'—'}</td>
          <td><span class="badge ${i.status==='Paid'?'badge-green':'badge-amber'}">${i.status||'Pending'}</span></td>
          <td>${fmtDate(i.paymentDate)}</td>
          <td>${i.paymentMode||'—'}</td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="4"><strong>Total Collected</strong></td>
          <td class="text-green">${INR(totalInterestColl)}</td>
          <td></td><td colspan="3"></td>
        </tr>
      </tbody>
    </table>`}

    ${borrower.notes?`<div class="note-box"><strong>Notes:</strong> ${borrower.notes}</div>`:''}

    <div class="footer">
      <span>FinSuite Finance Ledger · Confidential</span>
      <span>${now()}</span>
    </div>
  `;

  openPrint(`Borrower Report — ${borrower.borrowerName}`, body);
}

// ── DEPOSITOR REPORT ───────────────────────────────────────────────────────
export function printDepositorReport(depositor, payments){
  const pays = (payments||[]).sort((a,b)=>(b.month||'').localeCompare(a.month||''));
  const totalPaid = pays.filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.totalPayout||p.amountPaid||0),0);
  const totalDue  = pays.reduce((s,p)=>s+(p.amountDue||0),0);
  const pending   = pays.filter(p=>p.status!=='Paid').length;
  const t = parseInt(depositor.interestTenure)||1;
  const tenureLabel = t===1?'Monthly':t===3?'Quarterly':t===6?'Half-Yearly':t===12?'Yearly':`Every ${t} months`;
  const periodInt = (depositor.depositAmount||0)*(depositor.interestRate||0)/100/12*t;

  const body = `
    <div class="header">
      <div>
        <div class="logo">FinSuite · Depositor Report</div>
        <div class="meta" style="text-align:left;margin-top:4px;">Generated: ${now()}</div>
      </div>
      <div class="meta">CONFIDENTIAL<br/>Deposit ID: ${depositor.depositId||depositor.id?.slice(-8)||'—'}</div>
    </div>

    <div class="section-photo">
      <div class="photo-circle">
        ${depositor.photo?`<img src="${depositor.photo}" alt=""/>`:(depositor.name||'D')[0].toUpperCase()}
      </div>
      <div>
        <div style="font-size:20px;font-weight:800;">${depositor.name||'—'}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:3px;">
          ${depositor.phone||''}${depositor.email?' · '+depositor.email:''}
          <span class="badge ${depositor.status==='Active'?'badge-green':'badge-gray'}" style="margin-left:6px;">${depositor.status||'—'}</span>
        </div>
        ${depositor.address?`<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${depositor.address}</div>`:''}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${INR(depositor.depositAmount)}</div><div class="kpi-lbl">Deposit Principal</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(periodInt)}</div><div class="kpi-lbl">Per Period Interest</div><div class="kpi-sub">${tenureLabel}</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totalPaid)}</div><div class="kpi-lbl">Total Settled</div></div>
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${pending}</div><div class="kpi-lbl">Pending Periods</div></div>
    </div>

    <h2>Deposit Details</h2>
    <div class="info-grid">
      <div>
        <div class="info-row"><span class="info-lbl">Deposit ID</span><span class="info-val" style="font-family:monospace;">${depositor.depositId||'—'}</span></div>
        <div class="info-row"><span class="info-lbl">Principal Amount</span><span class="info-val">${INR(depositor.depositAmount)}</span></div>
        <div class="info-row"><span class="info-lbl">Annual Rate</span><span class="info-val">${depositor.interestRate||0}% p.a.</span></div>
        <div class="info-row"><span class="info-lbl">Payout Tenure</span><span class="info-val">${tenureLabel}</span></div>
        <div class="info-row"><span class="info-lbl">Interest Type</span><span class="info-val">${depositor.compounding?'Compound':'Simple'}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="info-lbl">Start Date</span><span class="info-val">${fmtDate(depositor.startDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Maturity Date</span><span class="info-val">${fmtDate(depositor.maturityDate)}</span></div>
        <div class="info-row"><span class="info-lbl">Per Period Interest</span><span class="info-val text-blue">${INR(periodInt)}</span></div>
        <div class="info-row"><span class="info-lbl">Total Settled</span><span class="info-val text-green">${INR(totalPaid)}</span></div>
        <div class="info-row"><span class="info-lbl">Total Due (all periods)</span><span class="info-val">${INR(totalDue)}</span></div>
      </div>
    </div>

    <h2>Interest Payout History (${pays.length} periods)</h2>
    ${pays.length===0?'<p style="color:#9ca3af;font-size:12px;margin-bottom:16px;">No payout records yet.</p>':`
    <table>
      <thead><tr><th>#</th><th>Period</th><th>Amount Due</th><th>Amount Settled</th><th>Fine</th><th>Status</th><th>Payment Date</th><th>Mode</th></tr></thead>
      <tbody>
        ${pays.map((p,i)=>`
        <tr>
          <td>${i+1}</td>
          <td style="font-weight:600;">${p.month||'—'}</td>
          <td>${INR(p.amountDue||0)}</td>
          <td class="${p.status==='Paid'?'text-green':'text-red'}">${INR(p.totalPayout||p.amountPaid||0)}</td>
          <td>${(p.fine||0)>0?INR(p.fine):'—'}</td>
          <td><span class="badge ${p.status==='Paid'?'badge-green':p.addedToDeposit?'badge-blue':'badge-amber'}">${p.addedToDeposit?'Added to Principal':p.status||'Pending'}</span></td>
          <td>${fmtDate(p.paymentDate)}</td>
          <td>${p.paymentMode||'—'}</td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="3"><strong>Total</strong></td>
          <td class="text-green">${INR(totalPaid)}</td>
          <td></td><td colspan="3"></td>
        </tr>
      </tbody>
    </table>`}

    ${depositor.notes?`<div class="note-box"><strong>Notes:</strong> ${depositor.notes}</div>`:''}

    <div class="footer">
      <span>FinSuite Finance Ledger · Confidential</span>
      <span>${now()}</span>
    </div>
  `;

  openPrint(`Depositor Report — ${depositor.name}`, body, '#7c3aed');
}

// ── OVERALL REPORT (date range) ────────────────────────────────────────────
export function printOverallReport({fromDate, toDate, borrowers, depositors, interestPayments, repayments, expenses, emiCollections, label}){
  const filteredInts = (interestPayments||[]).filter(p=>p.status==='Paid'&&p.paymentDate&&p.paymentDate>=fromDate&&p.paymentDate<=toDate);
  const filteredReps = (repayments||[]).filter(r=>r.date&&r.date>=fromDate&&r.date<=toDate);
  const filteredExps = (expenses||[]).filter(e=>e.date&&e.date>=fromDate&&e.date<=toDate);
  const filteredEMI  = (emiCollections||[]).filter(e=>e.date&&e.date>=fromDate&&e.date<=toDate);

  const totalInterest = filteredInts.reduce((s,p)=>s+(p.totalCollected||p.amountPaid||0),0);
  const totalRepaid   = filteredReps.reduce((s,r)=>s+(r.repaidAmount||r.amount||0),0);
  const totalExpenses = filteredExps.reduce((s,e)=>s+(e.amount||0),0);
  const totalEMI      = filteredEMI.reduce((s,e)=>s+(e.totalCollected||e.amount||0),0);
  const totalIncome   = totalInterest+totalRepaid+totalEMI;
  const netFlow       = totalIncome-totalExpenses;

  const activeB = borrowers.filter(b=>b.status==='Active');
  const activeD = depositors.filter(d=>d.status==='Active');
  const totalOutstanding = activeB.reduce((s,b)=>{
    const repaid=(repayments||[]).filter(r=>r.borrowerId===b.id).reduce((a,r)=>a+(r.repaidAmount||r.amount||0),0);
    return s+Math.max(0,(b.loanAmount||0)-repaid);
  },0);
  const totalDeposited = activeD.reduce((s,d)=>s+(d.depositAmount||0),0);

  // Group interest by month
  const byMonth = {};
  filteredInts.forEach(p=>{const m=p.month||p.paymentDate?.slice(0,7)||'';if(!byMonth[m])byMonth[m]={interest:0,repaid:0,emi:0,expenses:0};byMonth[m].interest+=(p.totalCollected||p.amountPaid||0);});
  filteredReps.forEach(r=>{const m=r.date?.slice(0,7)||'';if(!byMonth[m])byMonth[m]={interest:0,repaid:0,emi:0,expenses:0};byMonth[m].repaid+=(r.repaidAmount||r.amount||0);});
  filteredEMI.forEach(e=>{const m=e.date?.slice(0,7)||'';if(!byMonth[m])byMonth[m]={interest:0,repaid:0,emi:0,expenses:0};byMonth[m].emi+=(e.totalCollected||e.amount||0);});
  filteredExps.forEach(e=>{const m=e.date?.slice(0,7)||'';if(!byMonth[m])byMonth[m]={interest:0,repaid:0,emi:0,expenses:0};byMonth[m].expenses+=(e.amount||0);});
  const months = Object.keys(byMonth).sort();

  const body = `
    <div class="header">
      <div>
        <div class="logo">FinSuite · Financial Report</div>
        <div class="meta" style="text-align:left;margin-top:4px;font-size:14px;font-weight:600;color:#374151;">${label||'Custom Period'}</div>
        <div class="meta" style="text-align:left;margin-top:2px;">Period: ${fmtDate(fromDate)} → ${fmtDate(toDate)}</div>
      </div>
      <div class="meta">Generated: ${now()}</div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="kpi"><div class="kpi-val">${INR(totalInterest)}</div><div class="kpi-lbl">Interest Collected</div></div>
      <div class="kpi" style="border-left-color:#22c55e;"><div class="kpi-val" style="color:#15803d;">${INR(totalRepaid)}</div><div class="kpi-lbl">Principal Repaid</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(totalEMI)}</div><div class="kpi-lbl">EMI Collected</div></div>
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${INR(totalExpenses)}</div><div class="kpi-lbl">Expenses Paid</div></div>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-top:-6px;">
      <div class="kpi" style="border-left-color:${netFlow>=0?'#22c55e':'#ef4444'};"><div class="kpi-val" style="color:${netFlow>=0?'#15803d':'#b91c1c'};">${INR(netFlow)}</div><div class="kpi-lbl">Net Cash Flow</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(totalOutstanding)}</div><div class="kpi-lbl">Total Outstanding</div></div>
      <div class="kpi" style="border-left-color:#0ea5e9;"><div class="kpi-val" style="color:#0369a1;">${INR(totalDeposited)}</div><div class="kpi-lbl">Active Deposits</div></div>
      <div class="kpi"><div class="kpi-val">${activeB.length} / ${activeD.length}</div><div class="kpi-lbl">Borrowers / Depositors</div></div>
    </div>

    <h2>Month-wise Breakdown</h2>
    ${months.length===0?'<p style="color:#9ca3af;font-size:12px;margin-bottom:16px;">No transactions in this period.</p>':`
    <table>
      <thead><tr><th>Month</th><th class="text-right">Interest</th><th class="text-right">Principal Repaid</th><th class="text-right">EMI</th><th class="text-right">Expenses</th><th class="text-right">Net</th></tr></thead>
      <tbody>
        ${months.map(m=>{
          const d=byMonth[m];
          const net=(d.interest+d.repaid+d.emi)-d.expenses;
          return`<tr>
            <td style="font-weight:600;">${m}</td>
            <td class="text-right text-blue">${INR(d.interest)}</td>
            <td class="text-right text-green">${INR(d.repaid)}</td>
            <td class="text-right" style="color:#7c3aed;font-weight:700;">${INR(d.emi)}</td>
            <td class="text-right text-red">${INR(d.expenses)}</td>
            <td class="text-right ${net>=0?'text-green':'text-red'}">${INR(net)}</td>
          </tr>`;
        }).join('')}
        <tr class="total-row">
          <td><strong>Total</strong></td>
          <td class="text-right text-blue">${INR(totalInterest)}</td>
          <td class="text-right text-green">${INR(totalRepaid)}</td>
          <td class="text-right" style="color:#7c3aed;font-weight:700;">${INR(totalEMI)}</td>
          <td class="text-right text-red">${INR(totalExpenses)}</td>
          <td class="text-right ${netFlow>=0?'text-green':'text-red'}">${INR(netFlow)}</td>
        </tr>
      </tbody>
    </table>`}

    <h2>Active Borrowers Summary</h2>
    <table>
      <thead><tr><th>Loan ID</th><th>Borrower</th><th>Original Loan</th><th>Outstanding</th><th>Monthly Int.</th><th>Status</th></tr></thead>
      <tbody>
        ${activeB.map(b=>{
          const repaid=(repayments||[]).filter(r=>r.borrowerId===b.id).reduce((a,r)=>a+(r.repaidAmount||r.amount||0),0);
          const out=Math.max(0,(b.loanAmount||0)-repaid);
          return`<tr>
            <td style="font-family:monospace;font-size:11px;">${b.loanId||b.id?.slice(-8)||'—'}</td>
            <td style="font-weight:600;">${b.borrowerName}</td>
            <td>${INR(b.loanAmount)}</td>
            <td class="${out>0?'text-amber':'text-green'}">${INR(out)}</td>
            <td class="text-blue">${INR(out*(b.interestRate||0)/100)}</td>
            <td><span class="badge ${b.status==='Active'?'badge-green':'badge-amber'}">${b.status||'—'}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <h2>Active Depositors Summary</h2>
    <table>
      <thead><tr><th>Deposit ID</th><th>Name</th><th>Principal</th><th>Rate</th><th>Tenure</th><th>Status</th></tr></thead>
      <tbody>
        ${activeD.map(d=>{
          const t=parseInt(d.interestTenure)||1;
          const tl=t===1?'Monthly':t===3?'Quarterly':t===6?'Half-Yearly':t===12?'Yearly':`${t}mo`;
          return`<tr>
            <td style="font-family:monospace;font-size:11px;">${d.depositId||d.id?.slice(-8)||'—'}</td>
            <td style="font-weight:600;">${d.name}</td>
            <td>${INR(d.depositAmount)}</td>
            <td>${d.interestRate||0}% p.a.</td>
            <td>${tl}</td>
            <td><span class="badge badge-green">${d.status||'Active'}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <div class="footer">
      <span>FinSuite Finance Ledger · Confidential</span>
      <span>${now()}</span>
    </div>
  `;

  openPrint(`Financial Report — ${label||fromDate+' to '+toDate}`, body, '#059669');
}

// ── ALERTS PENDING LIST REPORT ─────────────────────────────────────────────
export function printAlertsReport(list, tab, repayments, interests){
  const tabLabels = {overdue:'Principal Overdue',interest:'Interest Overdue',expiring:'Agreement Expiring',expired:'Agreement Expired',high:'High Outstanding'};
  const title = tabLabels[tab]||'Alerts';

  function getBalance(b){
    const repaid=(repayments||[]).filter(r=>r.borrowerId===b.id).reduce((a,r)=>a+(r.repaidAmount||r.amount||0),0);
    return Math.max(0,(b.loanAmount||0)-repaid);
  }

  const totalOut = list.reduce((s,b)=>s+getBalance(b),0);
  const totalLoan = list.reduce((s,b)=>s+(b.loanAmount||0),0);

  const body = `
    <div class="header">
      <div>
        <div class="logo">FinSuite · Alerts Report</div>
        <div class="meta" style="text-align:left;margin-top:4px;font-size:15px;font-weight:700;color:#b91c1c;">${title}</div>
      </div>
      <div class="meta">Generated: ${now()}<br/>${list.length} borrower(s)</div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${list.length}</div><div class="kpi-lbl">Borrowers in Alert</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(totalOut)}</div><div class="kpi-lbl">Total Outstanding</div></div>
      <div class="kpi"><div class="kpi-val">${INR(totalLoan)}</div><div class="kpi-lbl">Total Original Loan</div></div>
    </div>

    ${list.length===0?'<p style="color:#9ca3af;font-size:13px;">No alerts in this category.</p>':`
    <table>
      <thead>
        <tr><th>#</th><th>Borrower</th><th>Phone</th><th>Loan Amt</th><th>Outstanding</th><th>Last Repayment</th><th>Loan Start</th><th>Agreement Expiry</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${list.map((b,i)=>{
          const bal=getBalance(b);
          const rps=(repayments||[]).filter(r=>r.borrowerId===b.id);
          const lastRep=rps.length?rps.reduce((l,r)=>r.date>l?r.date:l,rps[0].date):null;
          return`<tr>
            <td>${i+1}</td>
            <td style="font-weight:700;">${b.borrowerName}<br/><span style="font-size:10px;color:#6b7280;">${b.loanId||b.id?.slice(-8)||''}</span></td>
            <td>${b.phone||'—'}</td>
            <td>${INR(b.loanAmount)}</td>
            <td class="text-amber">${INR(bal)}</td>
            <td>${fmtDate(lastRep)}</td>
            <td>${fmtDate(b.loanStartDate)}</td>
            <td>${fmtDate(b.agreementExpiryDate||b.agreementDate)}</td>
            <td><span class="badge ${b.status==='Active'?'badge-green':'badge-amber'}">${b.status||'—'}</span></td>
          </tr>`;
        }).join('')}
        <tr class="total-row">
          <td colspan="4"><strong>Total</strong></td>
          <td class="text-amber">${INR(totalOut)}</td>
          <td colspan="4"></td>
        </tr>
      </tbody>
    </table>`}

    <div class="footer">
      <span>FinSuite Finance Ledger · Confidential — Action Required</span>
      <span>${now()}</span>
    </div>
  `;

  openPrint(`Alerts Report — ${title}`, body, '#dc2626');
}

// ── EMI ALERTS REPORT ──────────────────────────────────────────────────────
export function printEMIAlertsReport(list, filterLabel, collections){
  const totalLoan = list.reduce((s,l)=>s+(l.loanAmount||0),0);
  const totalEMI  = list.reduce((s,l)=>s+(l.emiAmount||0),0);
  const totalFine = list.reduce((s,l)=>{
    const d=l.daysOverdue||0;
    const rate=l.dailyFineRate||50;
    return s+(d>2?(d-2)*rate:0);
  },0);

  const FREQ = {daily:'Daily',weekly:'Weekly',monthly:'Monthly'};

  const body = `
    <div class="header">
      <div>
        <div class="logo">FinSuite · EMI Alerts Report</div>
        <div class="meta" style="text-align:left;margin-top:4px;font-size:15px;font-weight:700;color:#b91c1c;">${filterLabel||'Overdue EMIs'}</div>
      </div>
      <div class="meta">Generated: ${now()}<br/>${list.length} loan(s)</div>
    </div>

    <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
      <div class="kpi" style="border-left-color:#ef4444;"><div class="kpi-val" style="color:#b91c1c;">${list.length}</div><div class="kpi-lbl">Overdue Loans</div></div>
      <div class="kpi" style="border-left-color:#f59e0b;"><div class="kpi-val" style="color:#b45309;">${INR(totalEMI)}</div><div class="kpi-lbl">Total EMI Due</div></div>
      <div class="kpi" style="border-left-color:#8b5cf6;"><div class="kpi-val" style="color:#7c3aed;">${INR(totalFine)}</div><div class="kpi-lbl">Total Fines Due</div></div>
      <div class="kpi"><div class="kpi-val">${INR(totalLoan)}</div><div class="kpi-lbl">Total Loan Amount</div></div>
    </div>

    ${list.length===0?'<p style="color:#9ca3af;font-size:13px;">No alerts.</p>':`
    <table>
      <thead>
        <tr><th>#</th><th>EMI ID</th><th>Borrower</th><th>Phone</th><th>Loan Amt</th><th>EMI Amt</th><th>Freq</th><th>Next Due</th><th>Days OD</th><th>Fine</th><th>Paid/Total</th></tr>
      </thead>
      <tbody>
        ${list.map((l,i)=>{
          const cols=(collections[l.id]||[]).length;
          const fine=l.daysOverdue>2?(l.daysOverdue-2)*(l.dailyFineRate||50):0;
          return`<tr>
            <td>${i+1}</td>
            <td style="font-family:monospace;font-size:11px;">${l.emiId||l.id?.slice(-8)||'—'}</td>
            <td style="font-weight:700;">${l.borrowerName}</td>
            <td>${l.phone||'—'}</td>
            <td>${INR(l.loanAmount)}</td>
            <td class="text-blue">${INR(l.emiAmount)}</td>
            <td>${FREQ[l.frequency]||l.frequency||'—'}</td>
            <td>${l.nextDueDate||'—'}</td>
            <td class="text-red">${l.daysOverdue>0?l.daysOverdue+'d':'—'}</td>
            <td class="${fine>0?'text-red':''}">${fine>0?INR(fine):'—'}</td>
            <td>${cols}/${l.totalPeriods||'?'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`}

    <div class="footer">
      <span>FinSuite Finance Ledger · Confidential — Action Required</span>
      <span>${now()}</span>
    </div>
  `;

  openPrint(`EMI Alerts — ${filterLabel||'Overdue'}`, body, '#dc2626');
}
