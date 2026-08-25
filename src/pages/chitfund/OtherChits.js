/**
 * OtherChits.js — "Joined Chits" tracker
 *
 * TYPE: Joined Chit (you are a MEMBER, not the manager)
 *
 * Logic rules (clearly separated from Formed Chits):
 *
 * FORMED CHIT = you created it → you control auctions, members, commission, ledger
 * JOINED CHIT = someone else manages it → you only track:
 *   - Your monthly contribution (what you pay each cycle)
 *   - Auction records (what you paid, commission received, whether you won)
 *   - Status: Active (not yet cashed) | Cashed (you won the prize)
 *   - Phase ranges: expected net payable per phase after commission
 *   - Urgency alerts: overdue payment, should-take suggestion
 *
 * NO: member management, ledger entries, commission distribution — not your job as a member.
 */
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import {
  Plus, Edit2, Trash2, ChevronDown, ChevronRight,
  CheckCircle, Clock, TrendingUp, Wallet, AlertTriangle, X,
  Calendar, Target, ArrowRight, DollarSign
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getOtherChits, addOtherChit, updateOtherChit, deleteOtherChit,
  getOtherCompanies, deleteOtherChitPayment,
  getOtherChitPayments, addOtherChitPayment, updateOtherChitPayment,
} from '../../utils/cf_firestore';
import { formatCurrency } from '../../utils/cf_format';
import {
  calcPhases, getPhaseIndex, getExpectedPayable, calcCommissionReverse,
  addMonthsToYM
} from '../../utils/cf_engine';
import { tokens, Card, SectionHeader } from '../../components/chitfund/UI';
import { printJoinedChitDocument } from '../../utils/cf_pdfReport';
import { PageLoader } from '../../components/Skeleton';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = v => formatCurrency(v || 0);
function curMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
function fmtMo(m) { if(!m)return'—'; try{return new Date(m+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'});}catch{return m;} }
function fmtDate(d) { if(!d)return'—'; try{const dt=d?.seconds?new Date(d.seconds*1000):new Date(d);return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;} }
function addMonths(ym, n) { if(!ym)return''; const [y,m]=ym.split('-').map(Number); let t=y*12+(m-1)+n; return `${Math.floor(t/12)}-${String((t%12)+1).padStart(2,'0')}`; }
function monthDiff(a, b) { const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number); return (by-ay)*12+(bm-am); }

// ── UI atoms ─────────────────────────────────────────────────────────────────
function IBtn({ icon: Icon, onClick, danger, title, disabled }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onClick={e=>{e.stopPropagation();if(!disabled)onClick(e);}} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:30, height:30, borderRadius:8, border:`1px solid ${h&&!disabled?(danger?'rgba(220,38,38,0.4)':'rgba(10,132,255,0.35)'):tokens.border}`, background:h&&!disabled?(danger?'#FDE8E8':'#EBF5FF'):'#fff', cursor:disabled?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all .12s', opacity:disabled?.35:1, flexShrink:0 }}>
      <Icon size={13} color={h&&!disabled?(danger?tokens.red:'#0a84ff'):tokens.textSub} strokeWidth={2}/>
    </button>
  );
}

function FG({ label, children, hint, required }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11.5, fontWeight:600, color:tokens.textSub }}>{label}{required&&<span style={{ color:tokens.red }}> *</span>}</label>
      {children}
      {hint && <span style={{ fontSize:11, color:tokens.textMuted }}>{hint}</span>}
    </div>
  );
}

function FInp(props) {
  return (
    <input {...props} style={{ height:38, padding:'0 11px', borderRadius:9, border:`1.5px solid ${tokens.border}`, fontSize:13.5, fontFamily:'inherit', outline:'none', background:'#fff', color:tokens.text, width:'100%', ...(props.style||{}) }}
      onFocus={e=>e.target.style.borderColor='#0a84ff'}
      onBlur={e=>e.target.style.borderColor=tokens.border}/>
  );
}
function FSel({ children, ...props }) {
  return (
    <select {...props} style={{ height:38, padding:'0 11px', borderRadius:9, border:`1.5px solid ${tokens.border}`, fontSize:13.5, fontFamily:'inherit', outline:'none', background:'#fff', color:tokens.text, width:'100%', ...(props.style||{}) }}
      onFocus={e=>e.target.style.borderColor='#0a84ff'}
      onBlur={e=>e.target.style.borderColor=tokens.border}>
      {children}
    </select>
  );
}

// ── Business logic helpers ────────────────────────────────────────────────────
/**
 * Build a "joined chit" object that mirrors cf_engine's chit structure
 * so we can reuse getExpectedPayable, calcPhases, etc.
 */
function toChitLike(c) {
  const sub = c.totalChitValue / (c.totalMembers || 1);
  return {
    totalChitValue:  c.totalChitValue,
    totalMembers:    c.totalMembers,
    managerCommissionPct: c.organiserFeePct || 0,
    commissionType:  c.commissionType || 'Single',
    perHeadValue:    sub,
    slabType:        'Fixed',
    slabValue:       sub,  // joined chit: slab = subscription (no formed-chit slab)
    mystatus:        c.myStatus,
    companyTakenAuction: c.myStatus === 'Cashed' ? 1 : null,
    range_phase1:    c.range1 || 0,
    range_phase2:    c.range2 || 0,
    range_phase3:    c.range3 || 0,
    range_phase4:    c.range4 || 0,
  };
}

/**
 * Get projected auction months for a joined chit.
 * Based on start month and cycle, returns array of YYYY-MM.
 */
function getAuctionMonths(chit, upToCount) {
  if (!chit.startMonth || !chit.totalMembers) return [];
  const cycle = chit.auctionInterval || 1;
  const count = upToCount || chit.totalMembers;
  if (chit.frequencyType === 'Days') {
    // Days-based auctions: step forward N days at a time from the 1st of the start
    // month, then bucket each resulting date back into its YYYY-MM for the existing
    // month-based payment tracking (multiple day-cycled auctions can land in the same month).
    const [y, m] = chit.startMonth.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const months = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * cycle);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
  }
  const months = [];
  for (let i = 0; i < count; i++) {
    months.push(addMonths(chit.startMonth, i * cycle));
  }
  return months;
}

/**
 * Urgency analysis for a joined chit.
 * Returns alerts and suggestions.
 */
function analyseJoinedChit(chit, payments) {
  const alerts = [];
  const cur = curMonth();
  const sub = chit.totalChitValue / (chit.totalMembers || 1);
  const paidMonths = payments.filter(p => p.status === 'Paid');
  const paidCount = paidMonths.length;
  const totalPaid = paidMonths.reduce((s, p) => s + (p.amount || 0), 0);

  // Check this month's payment
  const thisMonthPay = payments.find(p => p.month === cur);
  if (!thisMonthPay || thisMonthPay.status !== 'Paid') {
    alerts.push({ type:'payment', severity:'warn', msg:`Payment pending for ${fmtMo(cur)}` });
  }

  // Check last month
  const lastMo = addMonths(cur, -1);
  const lastMonthPay = payments.find(p => p.month === lastMo);
  if (chit.myStatus !== 'Cashed' && (!lastMonthPay || lastMonthPay.status !== 'Paid')) {
    alerts.push({ type:'overdue', severity:'error', msg:`Payment overdue: ${fmtMo(lastMo)} not marked paid` });
  }

  // Should-take suggestion (when > 50% complete and not yet cashed)
  if (chit.myStatus !== 'Cashed' && chit.totalMembers > 0) {
    const completionPct = paidCount / chit.totalMembers;
    // Profit if taken now = chitValue - totalPaid - oneMoreSubscription
    const profitNow = chit.totalChitValue - totalPaid - sub;
    if (completionPct > 0.5 && profitNow > 0) {
      alerts.push({ type:'suggest', severity:'info', msg:`You've paid ${Math.round(completionPct*100)}% — consider taking now. Est. profit: ${fmt(profitNow)}` });
    }
    if (chit.expectedTakeMonth && chit.expectedTakeMonth <= cur && chit.myStatus !== 'Cashed') {
      alerts.push({ type:'urgent', severity:'error', msg:`Your planned take month (${fmtMo(chit.expectedTakeMonth)}) has arrived — decide now!` });
    }
  }

  // Profit calculation (projected — if not yet taken)
  const profitIfTakenNow = chit.totalChitValue - totalPaid - sub;
  const remainingMonths = Math.max(0, chit.totalMembers - paidCount);
  const futureCost = sub * remainingMonths;

  // REALIZED P&L — actual money in vs actual money out (once you've won/taken)
  const wonRecord = payments.find(p => p.iWon);
  const totalReceived = payments.reduce((s,p) => s + (p.iWon ? (p.prizeReceived||0) : 0), 0);
  const hasWon = !!wonRecord;
  const realizedPL = hasWon ? (totalReceived - totalPaid) : null; // null = not yet realized

  return { alerts, paidCount, totalPaid, profitIfTakenNow, remainingMonths, futureCost, sub, hasWon, totalReceived, realizedPL };
}

// ── Form blank ────────────────────────────────────────────────────────────────
const BLANK = {
  companyName:'', chitName:'', organiserName:'', organiserPhone:'',
  totalChitValue:'', totalMembers:'', myMemberNumber:'',
  startMonth:'', auctionInterval:'1', frequencyType:'Months', auctionDayOfMonth:'',
  organiserFeePct:'5',
  commissionType:'Single',
  myStatus:'Active',   // Active | Cashed
  expectedTakeMonth:'', actualTakeMonth:'', prizeReceived:'',
  auctionsDone:'', lastAuctionDate:'', // for adding a chit that's already partway through
  notes:'',
  range1:'', range2:'', range3:'', range4:'',
};

// ── Payment modal data ────────────────────────────────────────────────────────
function PayModal({ chit, payments, onClose, onSave }) {
  const sub = chit.totalChitValue / (chit.totalMembers || 1);
  const phases = calcPhases(chit.totalMembers || 1);
  const paidCount = payments.filter(p => p.status==='Paid').length;
  const nextRound = paidCount + 1;
  const chitLike = toChitLike(chit);
  const expectedPay = getExpectedPayable(chitLike, nextRound);

  // Try reverse calc to show what commission they're getting
  const commResult = chit.range1 ? calcCommissionReverse({
    chitValue: chit.totalChitValue,
    totalMembers: chit.totalMembers,
    organiserFeePct: chit.organiserFeePct || 0,
    commissionType: chit.commissionType || 'Single',
    alreadyCashedCount: paidCount,
    myPayable: expectedPay,
  }) : null;

  const [month, setMonth] = useState(curMonth());
  const [amount, setAmount] = useState(String(Math.round(expectedPay)));
  const [status, setStatus] = useState('Paid');
  const [iWon, setIWon] = useState(false);
  const [prizeAmt, setPrizeAmt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const diff = Math.round((+amount || 0) - expectedPay);

  async function save() {
    if (!month || !amount) return;
    setSaving(true);
    await onSave({
      month, amount:+amount, status, iWon,
      prizeReceived: iWon ? +prizeAmt : 0,
      note, round: nextRound, expectedAmount: expectedPay,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,0.15)', overflow:'hidden' }}>
        <div style={{ padding:'18px 22px', borderBottom:`1px solid ${tokens.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700, color:tokens.text }}>Record Payment</div>
            <div style={{ fontSize:12, color:tokens.textSub, marginTop:2 }}>{chit.companyName} · Round #{nextRound}</div>
          </div>
          <button onClick={onClose} style={{ width:28, height:28, borderRadius:7, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={13}/></button>
        </div>
        <div style={{ padding:'18px 22px' }}>
          {/* Expected amount info */}
          <div style={{ padding:'10px 14px', background:'#EBF5FF', borderRadius:10, marginBottom:16 }}>
            <div style={{ fontSize:11, color:'#0a84ff', fontWeight:600, marginBottom:3 }}>Expected payment for Round #{nextRound}</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#0a84ff' }}>{fmt(expectedPay)}</div>
            {commResult && (
              <div style={{ fontSize:12, color:tokens.textSub, marginTop:3 }}>
                Commission earned: <strong style={{ color:tokens.green }}>+{fmt(commResult.commissionPerMember)}</strong>
                &nbsp;· Bid: {fmt(commResult.bidAmount)} · Winner prize: {fmt(commResult.winnerInHand)}
              </div>
            )}
            {!chit.range1 && <div style={{ fontSize:11, color:tokens.textMuted, marginTop:2 }}>Set commission ranges to see commission estimates</div>}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <FG label="Month" required><FInp type="month" value={month} onChange={e=>setMonth(e.target.value)}/></FG>
            <FG label="Amount Paid (₹)" required>
              <FInp type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder={String(Math.round(expectedPay))}/>
            </FG>
          </div>

          {diff !== 0 && amount && (
            <div style={{ padding:'7px 12px', background: diff > 0 ? '#FEF3C7' : '#DEF7EC', borderRadius:8, fontSize:12, color: diff > 0 ? tokens.amber : tokens.green, marginBottom:12 }}>
              {diff > 0 ? `↑ Paid ${fmt(diff)} more than expected` : `↓ Paid ${fmt(Math.abs(diff))} less than expected`}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <FG label="Status">
              <FSel value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
              </FSel>
            </FG>
            <FG label="Did you win this auction?">
              <FSel value={iWon?'yes':'no'} onChange={e=>setIWon(e.target.value==='yes')}>
                <option value="no">No — did not win</option>
                <option value="yes">Yes — I won!</option>
              </FSel>
            </FG>
          </div>

          {iWon && (
            <FG label="Prize Received (₹)" hint="The amount you received in hand" style={{ marginBottom:12 }}>
              <FInp type="number" value={prizeAmt} onChange={e=>setPrizeAmt(e.target.value)} placeholder={String(Math.round(chit.totalChitValue * 0.85))}/>
            </FG>
          )}

          <FG label="Notes (optional)">
            <FInp value={note} onChange={e=>setNote(e.target.value)} placeholder="Receipt no., mode of payment, etc." style={{ marginBottom:0 }}/>
          </FG>

          <div style={{ display:'flex', gap:8, marginTop:18, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'9px 16px', borderRadius:9, border:`1.5px solid ${tokens.border}`, background:'#fff', fontSize:13, cursor:'pointer', fontFamily:'inherit', color:tokens.textSub }}>Cancel</button>
            <button onClick={save} disabled={saving || !amount || !month}
              style={{ padding:'9px 20px', borderRadius:9, border:'none', background:'#0a84ff', color:'#fff', fontSize:13.5, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', opacity:saving?.7:1 }}>
              {saving ? 'Saving…' : 'Save Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Chit card ─────────────────────────────────────────────────────────────────
function JoinedChitCard({ chit, payments, onEdit, onDelete, onAddPayment, onTogglePayment, onMarkTaken, onEditPayment, onDeletePayment }) {
  const [expanded, setExpanded] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [editVals, setEditVals] = useState({ date: '', amount: '' });
  const { alerts, paidCount, totalPaid, profitIfTakenNow, remainingMonths, futureCost, sub, hasWon, totalReceived, realizedPL } = analyseJoinedChit(chit, payments);
  const isCashed = chit.myStatus === 'Cashed';
  const phases = calcPhases(chit.totalMembers || 1);
  const chitLike = toChitLike(chit);

  const urgentAlerts = alerts.filter(a => a.severity === 'error');
  const warnAlerts   = alerts.filter(a => a.severity === 'warn');
  const infoAlerts   = alerts.filter(a => a.severity === 'info');

  const pct = chit.totalMembers > 0 ? Math.round((paidCount / chit.totalMembers) * 100) : 0;
  const nextRound = paidCount + 1;
  const expectedThisMonth = getExpectedPayable(chitLike, nextRound);

  return (
    <div style={{ background:'#fff', borderRadius:14, border:`1.5px solid ${urgentAlerts.length ? 'rgba(220,38,38,0.3)' : warnAlerts.length ? 'rgba(180,83,9,0.2)' : tokens.border}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>

      {/* Status bar at top */}
      <div style={{ height:3, background: isCashed ? tokens.green : urgentAlerts.length ? tokens.red : warnAlerts.length ? tokens.amber : '#0a84ff' }}/>

      {/* Card header */}
      <div style={{ padding:'16px 18px 14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
              <span style={{ fontSize:16, fontWeight:700, color:tokens.text }}>{chit.chitName || chit.companyName}</span>
              <span style={{ fontSize:10.5, fontWeight:700, padding:'2px 8px', borderRadius:99,
                background: isCashed ? tokens.greenLight : '#EBF5FF',
                color: isCashed ? tokens.green : '#0a84ff',
                border:`1px solid ${isCashed ? 'rgba(5,122,85,0.25)' : 'rgba(10,132,255,0.2)'}` }}>
                {isCashed ? '✓ CASHED' : 'ACTIVE'}
              </span>
            </div>
            <div style={{ fontSize:12.5, color:tokens.textSub, display:'flex', gap:10, flexWrap:'wrap' }}>
              {chit.chitName && <span>{chit.companyName}</span>}
              {chit.organiserName && <span>Agent: <strong>{chit.organiserName}</strong></span>}
              <span>Member #{chit.myMemberNumber || '—'}</span>
              <span>Started: {fmtMo(chit.startMonth)}</span>
              <span>{chit.commissionType} commission</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
            <IBtn icon={Edit2} onClick={onEdit} title="Edit"/>
            <button onClick={() => printJoinedChitDocument(chit, payments)} title="Export PDF — full document"
              style={{ width:30, height:30, borderRadius:8, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
              🖨
            </button>
            <IBtn icon={Trash2} onClick={onDelete} title="Delete" danger/>
            <button onClick={() => setExpanded(e => !e)}
              style={{ width:30, height:30, borderRadius:8, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              {expanded ? <ChevronDown size={13} color={tokens.textSub}/> : <ChevronRight size={13} color={tokens.textSub}/>}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {(urgentAlerts.length > 0 || warnAlerts.length > 0 || infoAlerts.length > 0) && (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
            {urgentAlerts.map((a,i) => (
              <div key={i} style={{ padding:'7px 11px', background:'#FDE8E8', borderRadius:8, fontSize:12, color:tokens.red, fontWeight:600, display:'flex', gap:7, alignItems:'center' }}>
                <AlertTriangle size={12}/> {a.msg}
              </div>
            ))}
            {warnAlerts.map((a,i) => (
              <div key={i} style={{ padding:'7px 11px', background:'#FEF3C7', borderRadius:8, fontSize:12, color:tokens.amber, fontWeight:600, display:'flex', gap:7, alignItems:'center' }}>
                <Clock size={12}/> {a.msg}
              </div>
            ))}
            {infoAlerts.map((a,i) => (
              <div key={i} style={{ padding:'7px 11px', background:'#EBF5FF', borderRadius:8, fontSize:12, color:'#0a84ff', display:'flex', gap:7, alignItems:'center' }}>
                <TrendingUp size={12}/> {a.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Key numbers grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderTop:`1px solid ${tokens.border}`, borderBottom:`1px solid ${tokens.border}` }}>
        {[
          { label:'Chit Value', val:fmt(chit.totalChitValue), color:tokens.text },
          { label:'Monthly Sub', val:fmt(sub), color:'#0a84ff' },
          { label:'Total Paid', val:fmt(totalPaid), color:tokens.green },
          { label:'This Month', val:isCashed ? '—' : fmt(expectedThisMonth),
            color: isCashed ? tokens.textMuted : urgentAlerts.length ? tokens.red : tokens.amber,
            sub: isCashed ? 'already cashed' : chit.range1 ? 'est. after commission' : 'full subscription' },
        ].map((k,i) => (
          <div key={i} style={{ padding:'10px 14px', borderRight:i<3?`1px solid ${tokens.border}`:'none', textAlign:'center' }}>
            <div style={{ fontSize:9.5, color:tokens.textMuted, fontWeight:700, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{k.label}</div>
            <div style={{ fontSize:14, fontWeight:800, color:k.color }}>{k.val}</div>
            {k.sub && <div style={{ fontSize:9.5, color:tokens.textMuted, marginTop:1 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* P&L — realized if won, projected otherwise */}
      <div style={{ padding:'12px 18px', borderBottom:`1px solid ${tokens.border}`,
        background: hasWon ? (realizedPL >= 0 ? 'rgba(52,199,89,0.05)' : 'rgba(255,59,48,0.05)') : 'rgba(0,122,255,0.04)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <div>
            <div style={{ fontSize:10.5, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.05em' }}>
              {hasWon ? 'Realized Profit / Loss' : 'Projected Profit / Loss (if taken now)'}
            </div>
            <div style={{ fontSize:12, color:tokens.textSub, marginTop:2 }}>
              {hasWon
                ? `Paid ${fmt(totalPaid)} total · Received ${fmt(totalReceived)} prize`
                : `Chit value ${fmt(chit.totalChitValue)} · Paid so far ${fmt(totalPaid)} · minus next sub ${fmt(sub)}`}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            {(() => { const v = hasWon ? realizedPL : profitIfTakenNow; const isProfit = v >= 0; return (
              <div style={{ fontSize:19, fontWeight:900, color: isProfit ? tokens.green : tokens.red }}>
                {isProfit ? '+' : '−'}{fmt(Math.abs(v))}
                <span style={{ fontSize:11, fontWeight:700, marginLeft:6, padding:'2px 8px', borderRadius:99, background: isProfit?'rgba(52,199,89,0.15)':'rgba(255,59,48,0.15)', color: isProfit?tokens.green:tokens.red }}>
                  {isProfit ? 'PROFIT' : 'LOSS'}
                </span>
              </div>
            ); })()}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding:'10px 18px', borderBottom:`1px solid ${tokens.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5, fontSize:12, color:tokens.textSub }}>
          <span>Payment progress: {paidCount}/{chit.totalMembers || '?'} months paid</span>
          <span style={{ fontWeight:700, color:pct>75?tokens.green:pct>40?tokens.amber:'#0a84ff' }}>{pct}%</span>
        </div>
        <div style={{ height:5, background:tokens.slateLight, borderRadius:3, overflow:'hidden' }}>
          <div style={{ width:`${pct}%`, height:'100%', background:pct>75?tokens.green:pct>40?tokens.amber:'#0a84ff', borderRadius:3, transition:'width .5s' }}/>
        </div>
      </div>

      {/* Action bar */}
      <div style={{ padding:'10px 18px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={onAddPayment}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:9, border:'none', background:'#0a84ff', color:'#fff', fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          <Plus size={12}/> Record Payment
        </button>
        {!isCashed && (
          <button onClick={() => onMarkTaken(curMonth())}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:9, border:`1px solid ${tokens.green}`, background:tokens.greenLight, color:tokens.green, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            <CheckCircle size={12}/> Mark as Taken
          </button>
        )}
        {isCashed && chit.actualTakeMonth && (
          <span style={{ fontSize:12, color:tokens.green, fontWeight:600 }}>
            ✓ Taken {fmtMo(chit.actualTakeMonth)}{chit.prizeReceived ? ` · Prize: ${fmt(chit.prizeReceived)}` : ''}
          </span>
        )}
        {!isCashed && paidCount > 0 && (
          <span style={{ marginLeft:'auto', fontSize:12, color:tokens.textSub }}>
            Profit if taken now: <strong style={{ color: profitIfTakenNow > 0 ? tokens.green : tokens.red }}>{fmt(profitIfTakenNow)}</strong>
          </span>
        )}
      </div>

      {/* Expanded: payment history */}
      {expanded && (
        <div style={{ borderTop:`1px solid ${tokens.border}` }}>
          {/* Phase ranges configured */}
          {(chit.range1 || chit.range2) && (
            <div style={{ padding:'12px 18px', borderBottom:`1px solid ${tokens.border}`, background:tokens.slateLight }}>
              <div style={{ fontSize:11, fontWeight:700, color:tokens.textSub, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:8 }}>Commission Estimates per Phase</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                {phases.map((p,i) => {
                  const ranges=[chit.range1||0,chit.range2||0,chit.range3||0,chit.range4||0];
                  const myPay = ranges[i];
                  const commission = myPay > 0 ? Math.round(sub - myPay) : 0;
                  const isCurPhase = nextRound >= p.startRound && nextRound <= p.endRound;
                  return (
                    <div key={i} style={{ background: isCurPhase ? '#EBF5FF' : '#fff', borderRadius:9, padding:'9px 11px', border:`1px solid ${isCurPhase?'rgba(10,132,255,0.3)':tokens.border}`, textAlign:'center' }}>
                      <div style={{ fontSize:10, color: isCurPhase ? '#0a84ff' : tokens.textMuted, fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>
                        R{p.startRound}–{p.endRound}{isCurPhase ? ' ← now' : ''}
                      </div>
                      {myPay > 0 ? (
                        <>
                          <div style={{ fontSize:13.5, fontWeight:800, color:'#0a84ff' }}>{fmt(myPay)}</div>
                          {commission > 0 && <div style={{ fontSize:10, color:tokens.green, marginTop:1 }}>+{fmt(commission)} commission</div>}
                        </>
                      ) : (
                        <div style={{ fontSize:11, color:tokens.textMuted }}>Not set</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment history list */}
          <div style={{ padding:'12px 18px 6px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:tokens.textSub, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>
              Payment History ({payments.length} records)
            </div>
          </div>
          {payments.length === 0 ? (
            <div style={{ padding:'20px 18px', textAlign:'center', fontSize:13, color:tokens.textMuted }}>
              No payments recorded yet. Click "Record Payment" to start.
            </div>
          ) : (
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {[...payments].sort((a,b)=>(a.month||'').localeCompare(b.month||'')).map((p,i) => (
                editingPaymentId === p.id ? (
                  <div key={p.id||i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 18px', borderBottom:`1px solid ${tokens.border}`, background:'rgba(10,132,255,0.04)' }}>
                    <div style={{ fontSize:12.5, fontWeight:700, color:tokens.text, width:70, flexShrink:0 }}>{fmtMo(p.month)}</div>
                    <input type="date" value={editVals.date} onChange={e=>setEditVals(v=>({...v,date:e.target.value}))}
                      style={{ height:32, padding:'0 8px', borderRadius:7, border:`1.5px solid ${tokens.border}`, fontSize:12.5, fontFamily:'inherit', outline:'none', flex:1 }}/>
                    <input type="number" value={editVals.amount} onChange={e=>setEditVals(v=>({...v,amount:e.target.value}))}
                      style={{ height:32, padding:'0 8px', borderRadius:7, border:`1.5px solid ${tokens.border}`, fontSize:12.5, fontFamily:'inherit', outline:'none', width:100 }}/>
                    <button onClick={() => { onEditPayment(p.id, { date: editVals.date, amount: +editVals.amount || 0 }); setEditingPaymentId(null); }}
                      style={{ padding:'6px 10px', borderRadius:7, border:'none', background:'#0a84ff', color:'#fff', fontSize:11.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save</button>
                    <button onClick={() => setEditingPaymentId(null)}
                      style={{ padding:'6px 10px', borderRadius:7, border:`1px solid ${tokens.border}`, background:'#fff', fontSize:11.5, cursor:'pointer', fontFamily:'inherit', color:tokens.textSub }}>Cancel</button>
                  </div>
                ) : (
                <div key={p.id||i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', borderBottom:`1px solid ${tokens.border}`, background:p.status==='Paid'?'rgba(5,122,85,0.02)':'transparent' }}>
                  <div style={{ width:36, height:36, borderRadius:9, flexShrink:0, background:p.status==='Paid'?tokens.greenLight:tokens.amberLight, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {p.status==='Paid' ? <CheckCircle size={15} color={tokens.green}/> : <Clock size={15} color={tokens.amber}/>}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:tokens.text }}>{fmtMo(p.month)}</div>
                    <div style={{ fontSize:11.5, color:tokens.textSub, marginTop:1 }}>
                      Round #{p.round || '—'}
                      {p.iWon && <span style={{ marginLeft:6, color:'#5521B5', fontWeight:700 }}>🏆 WON</span>}
                      {p.note && <span style={{ marginLeft:6 }}>· {p.note}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:14, fontWeight:800, color:p.status==='Paid'?tokens.green:tokens.amber }}>{fmt(p.amount)}</div>
                    {p.expectedAmount && Math.abs(p.amount-p.expectedAmount) > 10 && (
                      <div style={{ fontSize:10, color:tokens.textMuted }}>exp. {fmt(p.expectedAmount)}</div>
                    )}
                  </div>
                  <button onClick={() => onTogglePayment(p)}
                    style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:99, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, background:p.status==='Paid'?tokens.greenLight:tokens.amberLight, color:p.status==='Paid'?tokens.green:tokens.amber }}>
                    {p.status==='Paid' ? <CheckCircle size={10}/> : <Clock size={10}/>}
                    {p.status==='Paid' ? 'Paid' : 'Pending'}
                  </button>
                  <button onClick={() => { setEditingPaymentId(p.id); setEditVals({ date: p.date || '', amount: String(p.amount || '') }); }}
                    title="Edit this auction record"
                    style={{ width:26, height:26, borderRadius:7, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Edit2 size={12} color={tokens.textSub}/>
                  </button>
                  <button onClick={() => onDeletePayment(p.id)}
                    title="Delete this auction record"
                    style={{ width:26, height:26, borderRadius:7, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Trash2 size={12} color={tokens.red}/>
                  </button>
                </div>
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OtherChits() {
  const { user } = useAuth();
  const [chits,       setChits]       = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null); // click a company to drill into just its chits
  const [companies, setCompanies] = useState([]); // real Company entities from OtherChitCompanies
  const [paymentsMap, setPaymentsMap] = useState({});
  const [loading,     setLoading]     = useState(true);
  const [formModal,   setFormModal]   = useState(false);
  const [editTarget,  setEditTarget]  = useState(null);
  const [form,        setForm]        = useState(BLANK);
  const [saving,      setSaving]      = useState(false);
  const [ticketCount, setTicketCount] = useState(1); // create N tickets at once, each tracked as its own separate chit record
  const [backfillTarget, setBackfillTarget] = useState(null); // newly-created chit that needs its past auctions filled in
  const [backfillRows, setBackfillRows] = useState([]);
  const [backfillSaving, setBackfillSaving] = useState(false);
  const [formErr,     setFormErr]     = useState('');
  const [delTarget,   setDelTarget]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);
  const [payTarget,   setPayTarget]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, cos] = await Promise.all([getOtherChits(user.uid), getOtherCompanies(user.uid)]);
    setChits(list);
    setCompanies(cos);
    const pm = {};
    await Promise.all(list.map(async c => { pm[c.id] = await getOtherChitPayments(c.id); }));
    setPaymentsMap(pm);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const sf = (k,v) => setForm(f => ({ ...f, [k]:v }));

  function openAdd() { setForm(BLANK); setFormErr(''); setTicketCount(1); setFormModal(true); }
  function openEdit(c) {
    setEditTarget(c);
    setForm({
      companyName: c.companyName||'', chitName: c.chitName||'', organiserName:c.organiserName||'', organiserPhone:c.organiserPhone||'',
      totalChitValue:String(c.totalChitValue||''), totalMembers:String(c.totalMembers||''), myMemberNumber:String(c.myMemberNumber||''),
      startMonth:c.startMonth||'', auctionInterval:String(c.auctionInterval||1), frequencyType:c.frequencyType||'Months',
      auctionDayOfMonth:String(c.auctionDayOfMonth||''), organiserFeePct:String(c.organiserFeePct||5),
      commissionType:c.commissionType||'Single', myStatus:c.myStatus||'Active',
      expectedTakeMonth:c.expectedTakeMonth||'', actualTakeMonth:c.actualTakeMonth||'', prizeReceived:String(c.prizeReceived||''),
      auctionsDone:String(c.auctionsDone||''), lastAuctionDate:c.lastAuctionDate||'',
      notes:c.notes||'',
      range1:String(c.range1||''), range2:String(c.range2||''), range3:String(c.range3||''), range4:String(c.range4||''),
    });
    setFormErr(''); setFormModal(true);
  }

  async function handleSave() {
    if (!form.companyName.trim())                      return setFormErr('Company name is required');
    if (!form.totalChitValue || !form.totalMembers)    return setFormErr('Chit value and total members are required');
    if (!form.startMonth)                              return setFormErr('Start month is required');
    setSaving(true);
    try {
      const baseData = {
        ...form,
        totalChitValue: +form.totalChitValue, totalMembers: +form.totalMembers||0,
        myMemberNumber: +form.myMemberNumber||0, auctionInterval: +form.auctionInterval||1,
        organiserFeePct: +form.organiserFeePct||0,
        auctionDayOfMonth: +form.auctionDayOfMonth||0, auctionsDone: +form.auctionsDone||0,
        range1:+form.range1||0, range2:+form.range2||0, range3:+form.range3||0, range4:+form.range4||0,
        prizeReceived: +form.prizeReceived||0,
      };
      if (editTarget) {
        await updateOtherChit(editTarget.id, baseData, user.uid);
        setEditTarget(null);
        setFormModal(false); setTicketCount(1); load();
      } else if (ticketCount > 1) {
        // Create N tickets under the same chit — each its own record, each clearly
        // labeled so they're never confused with each other in the list.
        const baseChitName = form.chitName || form.companyName;
        for (let i = 1; i <= ticketCount; i++) {
          await addOtherChit({ ...baseData, chitName: `${baseChitName} — Ticket ${i}`, myMemberNumber: (+form.myMemberNumber || 0) }, user.uid);
        }
        setFormModal(false); setTicketCount(1); load();
      } else {
        const newId = await addOtherChit(baseData, user.uid);
        setFormModal(false); setTicketCount(1);
        if (baseData.auctionsDone > 0) {
          // Already partway through — open the backfill grid so past auctions can be
          // entered (date + amount) instead of silently pretending they never happened.
          const newChit = { id: newId, ...baseData };
          const months = getAuctionMonths(newChit, baseData.auctionsDone);
          setBackfillTarget(newChit);
          setBackfillRows(months.map(m => ({ month: m, date: '', amount: String(Math.round((baseData.totalChitValue||0)/(baseData.totalMembers||1))) })));
        }
        load();
      }
    } catch(e) { setFormErr(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try { await deleteOtherChit(delTarget.id, user.uid); setDelTarget(null); load(); }
    catch(e) { alert(e.message); }
    finally { setDeleting(false); }
  }

  async function handleAddPayment(chit, data) {
    await addOtherChitPayment(chit.id, data, user.uid);
    // If won, mark as cashed
    if (data.iWon) {
      await updateOtherChit(chit.id, { myStatus:'Cashed', actualTakeMonth:data.month, prizeReceived:data.prizeReceived||0 }, user.uid);
    }
    load();
  }

  async function handleBackfillSave() {
    setBackfillSaving(true);
    try {
      for (const row of backfillRows) {
        if (!row.date || !row.amount) continue; // skip rows left blank
        await addOtherChitPayment(backfillTarget.id, {
          month: row.month, date: row.date, amount: +row.amount, status: 'Paid',
        }, user.uid);
      }
      toast.success('Past auctions recorded');
      setBackfillTarget(null); setBackfillRows([]);
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    finally { setBackfillSaving(false); }
  }

  async function handleDeletePayment(chitId, paymentId) {
    if (!window.confirm('Delete this auction record? This cannot be undone.')) return;
    try {
      await deleteOtherChitPayment(paymentId);
      setPaymentsMap(pm => ({ ...pm, [chitId]: pm[chitId].filter(p => p.id !== paymentId) }));
      toast.success('Auction record deleted');
    } catch (e) { toast.error('Failed: ' + e.message); }
  }

  async function handleEditPayment(paymentId, chitId, data) {
    try {
      await updateOtherChitPayment(paymentId, data);
      setPaymentsMap(pm => ({ ...pm, [chitId]: pm[chitId].map(p => p.id === paymentId ? { ...p, ...data } : p) }));
      toast.success('Auction record updated');
    } catch (e) { toast.error('Failed: ' + e.message); }
  }

  async function handleTogglePayment(chitId, payment) {
    const next = payment.status === 'Paid' ? 'Pending' : 'Paid';
    await updateOtherChitPayment(payment.id, { status:next });
    setPaymentsMap(pm => ({ ...pm, [chitId]: pm[chitId].map(p => p.id===payment.id ? {...p,status:next} : p) }));
  }

  async function handleMarkTaken(chit, month) {
    await updateOtherChit(chit.id, { myStatus:'Cashed', actualTakeMonth:month }, user.uid);
    load();
  }

  // Derived
  const activeChits = chits.filter(c => c.myStatus !== 'Cashed');
  const totalMonthly = activeChits.reduce((s,c) => s + (c.totalChitValue/(c.totalMembers||1)), 0);
  const totalPaidAll = Object.values(paymentsMap).flat().filter(p=>p.status==='Paid').reduce((s,p)=>s+(p.amount||0),0);

  // Sub for form phase preview
  const formSub = form.totalChitValue && form.totalMembers ? Math.round(+form.totalChitValue / +form.totalMembers) : 0;
  const formPhases = form.totalMembers ? calcPhases(+form.totalMembers) : [];

  // Real company entities (from the dedicated Companies page) — falls back to
  // whatever companies have been used on existing chits, for backward compatibility.
  const companyOptions = companies.length > 0
    ? companies
    : Object.values(
        chits.reduce((acc, c) => {
          if (c.companyName && !acc[c.companyName]) acc[c.companyName] = { companyName: c.companyName, organiserName: c.organiserName, organiserPhone: c.organiserPhone };
          return acc;
        }, {})
      ).sort((a, b) => a.companyName.localeCompare(b.companyName));

  if (loading) return <PageLoader stats={4}/>;

  const modalBg = { position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 };

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:tokens.text, letterSpacing:'-.4px' }}>My Joined Chits</h1>
          <p style={{ margin:'4px 0 0', fontSize:13.5, color:tokens.textSub }}>
            Chit funds you've <strong>joined as a member</strong> — track your payments, commission, and prize
          </p>
        </div>
        <button onClick={openAdd}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:10, border:'none', background:'#0a84ff', color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          <Plus size={14}/> Add Joined Chit
        </button>
      </div>

      {/* Context banner explaining the two types */}
      <div style={{ marginBottom:20, padding:'12px 16px', background:'#EBF5FF', border:'1px solid rgba(10,132,255,0.2)', borderRadius:12, display:'flex', gap:16, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#0a84ff', marginBottom:3 }}>📋 Joined Chits (This Page)</div>
          <div style={{ fontSize:12, color:tokens.textSub, lineHeight:1.6 }}>You are a <strong>member</strong>. You only track your payments, commission received, and whether you won. No auction management.</div>
        </div>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#007AFF', marginBottom:3 }}>🏢 Formed Chits (Manage Chit Funds)</div>
          <div style={{ fontSize:12, color:tokens.textSub, lineHeight:1.6 }}>You are the <strong>manager</strong>. Full ERP: process auctions, manage members, track commission, ledger entries.</div>
        </div>
      </div>

      {/* 6-Month Payment Projection */}
      {(() => {
        const projData = Array.from({ length: 6 }, (_, i) => {
          const d = new Date(); d.setMonth(d.getMonth() + i);
          const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
          const owed = chits.filter(c => c.myStatus !== 'Cashed').reduce((s, c) => {
            const pays = paymentsMap[c.id] || [];
            const paidCount = pays.filter(p => p.status === 'Paid').length;
            const sub = (c.totalChitValue || 0) / (c.totalMembers || 1);
            const stillOwes = (paidCount + i) < (c.totalMembers || 0);
            return s + (stillOwes ? sub : 0);
          }, 0);
          return { label, owed: Math.round(owed) };
        });
        return (
          <Card style={{ marginBottom: 20 }}>
            <SectionHeader title="Your Upcoming Payments — Next 6 Months" sub="What you'll owe across all joined chits, month by month" />
            <div style={{ height: 170, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projData} margin={{ left: -8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: tokens.textSub }} />
                  <YAxis tick={{ fontSize: 10, fill: tokens.textSub }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                    <div style={{ background: '#fff', border: `1px solid ${tokens.border}`, borderRadius: 9, padding: '8px 13px', boxShadow: '0 4px 16px rgba(0,0,0,.09)' }}>
                      <div style={{ fontSize: 11, color: tokens.textSub, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: tokens.green }}>{fmt(payload[0].value)}</div>
                    </div>
                  ) : null} />
                  <Bar dataKey="owed" radius={[5, 5, 0, 0]}>
                    {projData.map((d, i) => <Cell key={i} fill={i === 0 ? tokens.green : '#BBF7D0'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      })()}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:13, marginBottom:22 }}>
        {[
          { label:'Active Joined Chits', val:activeChits.length, sub:`${chits.length} total`, color:'#0a84ff' },
          { label:'Monthly Outflow',     val:fmt(totalMonthly),  sub:'contributions due',    color:tokens.red },
          { label:'Total Paid',          val:fmt(totalPaidAll),  sub:'all time',              color:tokens.green },
          { label:'Chits Taken',         val:chits.filter(c=>c.myStatus==='Cashed').length, sub:'prize received', color:'#5521B5' },
        ].map((k,i) => (
          <div key={i} style={{ background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:tokens.textMuted, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:11, color:tokens.textMuted, marginTop:3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Chit cards */}
      {chits.length === 0 ? (
        <div style={{ background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:14, padding:'48px 24px', textAlign:'center' }}>
          <div style={{ fontSize:44, marginBottom:14 }}>🤝</div>
          <div style={{ fontSize:16, fontWeight:700, color:tokens.textSub, marginBottom:6 }}>No joined chits yet</div>
          <div style={{ fontSize:13, color:tokens.textMuted, marginBottom:20, maxWidth:360, margin:'0 auto 20px' }}>
            Add the chit funds you've joined as a member to track your monthly payments, commission earned, and prize eligibility.
          </div>
          <button onClick={openAdd} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'10px 18px', borderRadius:10, border:'none', background:'#0a84ff', color:'#fff', fontSize:13.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
            <Plus size={14}/> Add Your First Joined Chit
          </button>
        </div>
      ) : selectedCompany ? (() => {
        const companyChits = chits.filter(c => (c.companyName || 'Unnamed Company') === selectedCompany);
        const companyTotal = companyChits.reduce((s, c) => s + (c.totalChitValue || 0), 0);
        return (
          <div>
            <button onClick={() => setSelectedCompany(null)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', marginBottom:14, borderRadius:9, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, color:tokens.text, fontFamily:'inherit' }}>
              ← All Companies
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', marginBottom:14, background:tokens.slateLight, borderRadius:10 }}>
              <span style={{ fontSize:15, fontWeight:800, color:tokens.text }}>🏢 {selectedCompany}</span>
              <span style={{ fontSize:12, color:tokens.textSub }}>{companyChits.length} ticket{companyChits.length !== 1 ? 's' : ''} · {formatCurrency(companyTotal)} total</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {companyChits.map(c => (
                <JoinedChitCard
                  key={c.id}
                  chit={c}
                  payments={paymentsMap[c.id] || []}
                  onEdit={() => openEdit(c)}
                  onDelete={() => setDelTarget(c)}
                  onAddPayment={() => setPayTarget(c)}
                  onTogglePayment={p => handleTogglePayment(c.id, p)}
                  onMarkTaken={month => handleMarkTaken(c, month)}
                  onEditPayment={(paymentId, data) => handleEditPayment(paymentId, c.id, data)}
                  onDeletePayment={paymentId => handleDeletePayment(c.id, paymentId)}
                />
              ))}
            </div>
          </div>
        );
      })() : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(
            chits.reduce((groups, c) => {
              const key = c.companyName || 'Unnamed Company';
              if (!groups[key]) groups[key] = [];
              groups[key].push(c);
              return groups;
            }, {})
          ).sort((a, b) => a[0].localeCompare(b[0])).map(([companyName, groupChits]) => {
            const groupTotal = groupChits.reduce((s, c) => s + (c.totalChitValue || 0), 0);
            const activeCount = groupChits.filter(c => c.myStatus !== 'Cashed').length;
            return (
              <div key={companyName} onClick={() => setSelectedCompany(companyName)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 18px', background:'#fff', border:`1px solid ${tokens.border}`, borderRadius:12, cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#0a84ff'} onMouseLeave={e=>e.currentTarget.style.borderColor=tokens.border}>
                <span style={{ fontSize:22 }}>🏢</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:tokens.text }}>{companyName}</div>
                  <div style={{ fontSize:12, color:tokens.textSub, marginTop:2 }}>{groupChits.length} ticket{groupChits.length !== 1 ? 's' : ''} · {activeCount} active · {formatCurrency(groupTotal)} total value</div>
                </div>
                <span style={{ fontSize:18, color:tokens.textMuted }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ─────────────────────────────────────────────── */}
      {(formModal || editTarget) && (
        <div style={modalBg} onClick={() => { setFormModal(false); setEditTarget(null); }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:600, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding:'18px 22px', borderBottom:`1px solid ${tokens.border}`, display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
              <div>
                <div style={{ fontSize:17, fontWeight:700, color:tokens.text }}>
                  {editTarget ? `Edit — ${editTarget.companyName}` : 'Add Joined Chit'}
                </div>
                <div style={{ fontSize:12, color:tokens.textSub, marginTop:2 }}>Track a chit fund you've joined as a member</div>
              </div>
              <button onClick={() => { setFormModal(false); setEditTarget(null); }} style={{ width:28, height:28, borderRadius:7, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={13}/></button>
            </div>
            <div style={{ padding:'18px 22px' }}>
              {formErr && <div style={{ marginBottom:14, padding:'10px 14px', background:'#FDE8E8', borderRadius:9, fontSize:13, color:tokens.red }}>{formErr}</div>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                {/* Step 1 — select the company this chit is joined through */}
                {!editTarget && (
                  <div style={{ gridColumn:'1/-1' }}>
                    <FG label="Step 1 — Select the Company / Agent">
                      {companyOptions.length > 0 ? (
                        <select value="" onChange={e=>{
                          const chosen = companyOptions.find(co => co.companyName === e.target.value);
                          if (chosen) { sf('companyName', chosen.companyName); sf('organiserName', chosen.organiserName||''); sf('organiserPhone', chosen.organiserPhone||''); }
                        }} style={{ width:'100%', boxSizing:'border-box', height:38, padding:'0 12px', borderRadius:9, border:`1px solid ${tokens.border}`, fontSize:13.5, fontFamily:'inherit', background:'#fff', cursor:'pointer' }}>
                          <option value="">— Select a company —</option>
                          {companyOptions.map(co => <option key={co.companyName} value={co.companyName}>{co.companyName}{co.organiserName?` (${co.organiserName})`:''}</option>)}
                        </select>
                      ) : (
                        <div style={{ fontSize:12.5, color:tokens.textSub, padding:'10px 12px', background:tokens.slateLight, borderRadius:9 }}>
                          No companies yet — <a href="/cf/other-chit-companies" style={{ color:'#0a84ff', fontWeight:600 }}>add one first</a>, or just type a new company name below.
                        </div>
                      )}
                    </FG>
                  </div>
                )}
                <div style={{ gridColumn:'1/-1' }}>
                  <FG label="Chit Company / Organisation Name" required>
                    <FInp value={form.companyName} onChange={e=>sf('companyName',e.target.value)} placeholder="e.g. Shriram Chit Fund — Group A" autoFocus/>
                  </FG>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <FG label="Chit Name / Ticket" hint="Distinguishes this chit from others under the same company">
                    <FInp value={form.chitName} onChange={e=>sf('chitName',e.target.value)} placeholder="e.g. 20L - Chit A"/>
                  </FG>
                </div>
                {!editTarget && (
                  <div style={{ gridColumn:'1/-1', padding:'12px 14px', background:tokens.slateLight, borderRadius:10, display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:tokens.text }}>How many tickets?</div>
                      <div style={{ fontSize:11.5, color:tokens.textSub }}>If you hold more than one ticket in this same chit, each one is tracked as its own separate record — Ticket 1, Ticket 2, etc.</div>
                    </div>
                    <button type="button" onClick={()=>setTicketCount(n=>Math.max(1,n-1))} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:16, fontFamily:'inherit' }}>−</button>
                    <span style={{ fontSize:16, fontWeight:800, color:tokens.text, minWidth:20, textAlign:'center' }}>{ticketCount}</span>
                    <button type="button" onClick={()=>setTicketCount(n=>Math.min(10,n+1))} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${tokens.border}`, background:'#fff', cursor:'pointer', fontSize:16, fontFamily:'inherit' }}>+</button>
                  </div>
                )}
                <FG label="Organiser / Agent Name"><FInp value={form.organiserName} onChange={e=>sf('organiserName',e.target.value)} placeholder="Agent name"/></FG>
                <FG label="Organiser Phone"><FInp value={form.organiserPhone} onChange={e=>sf('organiserPhone',e.target.value)} type="tel" placeholder="9876543210"/></FG>
                <FG label="Total Chit Value (₹)" required><FInp type="number" value={form.totalChitValue} onChange={e=>sf('totalChitValue',e.target.value)} placeholder="500000"/></FG>
                <FG label="Total Members" required><FInp type="number" value={form.totalMembers} onChange={e=>sf('totalMembers',e.target.value)} placeholder="20"/></FG>
                <FG label="My Member Number"><FInp type="number" value={form.myMemberNumber} onChange={e=>sf('myMemberNumber',e.target.value)} placeholder="5"/></FG>
                <FG label="Start Month" required hint="First auction month"><FInp type="month" value={form.startMonth} onChange={e=>sf('startMonth',e.target.value)}/></FG>
                <FG label="Frequency Type">
                  <FSel value={form.frequencyType} onChange={e=>sf('frequencyType',e.target.value)}>
                    <option value="Months">Months</option>
                    <option value="Days">Days</option>
                  </FSel>
                </FG>
                <FG label={`Auction Every (${form.frequencyType==='Days'?'days':'months'})`}><FInp type="number" value={form.auctionInterval} onChange={e=>sf('auctionInterval',e.target.value)} placeholder="1"/></FG>
                {form.frequencyType==='Months' && (
                  <FG label="Auction Day of Month" hint="Which day the auction usually falls on"><FInp type="number" min="1" max="31" value={form.auctionDayOfMonth} onChange={e=>sf('auctionDayOfMonth',e.target.value)} placeholder="15"/></FG>
                )}
                <FG label="Auctions Done So Far" hint="For a chit that's already partway through — how many auctions have already happened">
                  <FInp type="number" min="0" value={form.auctionsDone} onChange={e=>sf('auctionsDone',e.target.value)} placeholder="0"/>
                </FG>
                <FG label="Last Auction Date" hint="Date of the most recent auction"><FInp type="date" value={form.lastAuctionDate} onChange={e=>sf('lastAuctionDate',e.target.value)}/></FG>
                <FG label="Organiser Fee" hint={parseFloat(form.organiserFeePct) > 0 ? `Organiser earns ${form.organiserFeePct}% of total chit (₹${Math.round((parseFloat(form.totalChitValue)||0)*(parseFloat(form.organiserFeePct)||0)/100).toLocaleString('en-IN')}) — deducted from bid pool` : 'No organiser fee — full bid goes to commission pool'}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div onClick={()=>sf('organiserFeePct', parseFloat(form.organiserFeePct) > 0 ? '0' : '5')} style={{ width:51, height:31, borderRadius:999, background: parseFloat(form.organiserFeePct) > 0 ? tokens.blue : '#E5E5EA', padding:2, display:'flex', alignItems:'center', justifyContent: parseFloat(form.organiserFeePct) > 0 ? 'flex-end':'flex-start', transition:'all .22s', flexShrink:0, cursor:'pointer' }}><div style={{ width:27, height:27, borderRadius:'50%', background:'#fff', boxShadow:'0 2px 6px rgba(0,0,0,0.2)' }}/></div>
                    <span style={{ fontSize:13.5, fontWeight:700, color: parseFloat(form.organiserFeePct) > 0 ? tokens.blue : tokens.textMuted, minWidth:28 }}>{parseFloat(form.organiserFeePct) > 0 ? 'Yes' : 'No'}</span>
                    {parseFloat(form.organiserFeePct) > 0 && (<div style={{ flex:1, display:'flex', alignItems:'center', gap:6, maxWidth:130 }}><FInp type="number" step="0.1" min="0" max="5" value={form.organiserFeePct} onChange={e=>sf('organiserFeePct',e.target.value)} placeholder="5"/><span style={{ fontSize:14, fontWeight:600, color:tokens.textMuted }}>%</span></div>)}
                  </div>
                </FG>
                <FG label="Commission Type">
                  <FSel value={form.commissionType} onChange={e=>sf('commissionType',e.target.value)}>
                    <option value="Single">Single commission</option>
                    <option value="Double">Double commission</option>
                  </FSel>
                </FG>
                <FG label="My Status">
                  <FSel value={form.myStatus} onChange={e=>sf('myStatus',e.target.value)}>
                    <option value="Active">Active — not yet cashed</option>
                    <option value="Cashed">Cashed — I won the prize</option>
                  </FSel>
                </FG>
                <FG label="Plan to Take (Month)" hint="When you plan to bid for the prize">
                  <FInp type="month" value={form.expectedTakeMonth} onChange={e=>sf('expectedTakeMonth',e.target.value)}/>
                </FG>
                {form.myStatus === 'Cashed' && (
                  <>
                    <FG label="Actual Take Month"><FInp type="month" value={form.actualTakeMonth} onChange={e=>sf('actualTakeMonth',e.target.value)}/></FG>
                    <FG label="Prize Received (₹)"><FInp type="number" value={form.prizeReceived} onChange={e=>sf('prizeReceived',e.target.value)} placeholder="0"/></FG>
                  </>
                )}
              </div>

              {/* Commission ranges — same as formed chit form, matches screenshot */}
              <div style={{ padding:'14px', background:'#F8FAFC', borderRadius:11, border:`1px solid ${tokens.border}`, marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:tokens.textSub, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>
                  Commission Range Estimates
                </div>
                <p style={{ fontSize:12.5, color:tokens.textSub, marginBottom:10, lineHeight:1.6 }}>
                  Enter <strong>how much you pay per auction</strong> for each phase (net after commission deducted). Used to estimate your monthly outflow and commission earned.
                </p>
                {formSub > 0 && formPhases.length > 0 && (
                  <div style={{ fontSize:11, color:'#0a84ff', fontWeight:600, marginBottom:10 }}>
                    Phase splits for {form.totalMembers} members: {formPhases.map(p=>`Rnd ${p.startRound}–${p.endRound}`).join(' · ')} · Subscription: {fmt(formSub)}
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {formPhases.map((p,i) => {
                    const keys=['range1','range2','range3','range4'];
                    const phs=['e.g. 45000','e.g. 50000','e.g. 55000','e.g. 60000'];
                    const v = +form[keys[i]] || 0;
                    const comm = formSub > 0 && v > 0 ? Math.round(formSub - v) : 0;
                    return (
                      <FG key={i} label={`Rounds ${p.startRound}–${p.endRound} — what I pay${comm>0?` (+${comm.toLocaleString('en-IN')} commission)`:''}`}>
                        <FInp type="number" value={form[keys[i]]} onChange={e=>sf(keys[i],e.target.value)} placeholder={phs[i]}/>
                      </FG>
                    );
                  })}
                </div>
              </div>

              <FG label="Notes (optional)">
                <FInp value={form.notes} onChange={e=>sf('notes',e.target.value)} placeholder="Any notes about this chit…"/>
              </FG>

              <div style={{ display:'flex', gap:8, marginTop:18, justifyContent:'flex-end' }}>
                <button onClick={() => { setFormModal(false); setEditTarget(null); }} style={{ padding:'9px 16px', borderRadius:9, border:`1.5px solid ${tokens.border}`, background:'#fff', fontSize:13, cursor:'pointer', fontFamily:'inherit', color:tokens.textSub }}>Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding:'9px 20px', borderRadius:9, border:'none', background:'#0a84ff', color:'#fff', fontSize:13.5, fontWeight:700, cursor:saving?'not-allowed':'pointer', fontFamily:'inherit', opacity:saving?.7:1 }}>
                  {saving ? 'Saving…' : editTarget ? 'Save Changes' : ticketCount > 1 ? `Create ${ticketCount} Tickets` : 'Add Chit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delTarget && (
        <div style={modalBg} onClick={() => setDelTarget(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:18, maxWidth:400, width:'100%', padding:'22px 24px', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:18 }}>
              <div style={{ width:42, height:42, borderRadius:11, background:'#FDE8E8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Trash2 size={18} color={tokens.red}/></div>
              <div>
                <p style={{ margin:'0 0 7px', fontSize:15, fontWeight:700, color:tokens.text }}>Delete "{delTarget.companyName}"?</p>
                <p style={{ margin:0, fontSize:13, color:tokens.textSub, lineHeight:1.7 }}>All payment records for this joined chit will also be deleted. <strong style={{ color:tokens.red }}>Cannot be undone.</strong></p>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setDelTarget(null)} style={{ padding:'9px 16px', borderRadius:9, border:`1.5px solid ${tokens.border}`, background:'#fff', fontSize:13, cursor:'pointer', fontFamily:'inherit', color:tokens.textSub }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding:'9px 20px', borderRadius:9, border:'none', background:tokens.red, color:'#fff', fontSize:13.5, fontWeight:700, cursor:deleting?'not-allowed':'pointer', fontFamily:'inherit' }}>
                {deleting?'Deleting…':'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payTarget && (
        <PayModal
          chit={payTarget}
          payments={paymentsMap[payTarget.id] || []}
          onClose={() => setPayTarget(null)}
          onSave={data => handleAddPayment(payTarget, data)}
        />
      )}

      {/* Backfill modal — fill in past auctions for a chit that's already partway through */}
      {backfillTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1300, background:'rgba(15,23,42,.55)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:560, maxHeight:'86vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'20px 24px 14px', borderBottom:`1px solid ${tokens.border}` }}>
              <div style={{ fontSize:16, fontWeight:800, color:tokens.text }}>Fill In Past Auctions</div>
              <div style={{ fontSize:12.5, color:tokens.textSub, marginTop:3 }}>
                {backfillTarget.chitName || backfillTarget.companyName} — {backfillRows.length} auction{backfillRows.length !== 1 ? 's' : ''} already happened. Enter the date and amount you paid for each one (leave blank to skip).
              </div>
            </div>
            <div style={{ padding:'14px 24px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:10 }}>
              {backfillRows.map((row, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'70px 1fr 1fr', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:12.5, fontWeight:700, color:tokens.textSub }}>#{i + 1}</span>
                  <input type="date" value={row.date} onChange={e => setBackfillRows(rs => rs.map((r, ri) => ri === i ? { ...r, date: e.target.value } : r))}
                    style={{ height:36, padding:'0 10px', borderRadius:8, border:`1.5px solid ${tokens.border}`, fontSize:13, fontFamily:'inherit', outline:'none' }} />
                  <input type="number" value={row.amount} onChange={e => setBackfillRows(rs => rs.map((r, ri) => ri === i ? { ...r, amount: e.target.value } : r))}
                    placeholder="Amount paid (₹)"
                    style={{ height:36, padding:'0 10px', borderRadius:8, border:`1.5px solid ${tokens.border}`, fontSize:13, fontFamily:'inherit', outline:'none' }} />
                </div>
              ))}
            </div>
            <div style={{ padding:'14px 24px', borderTop:`1px solid ${tokens.border}`, display:'flex', gap:10 }}>
              <button onClick={handleBackfillSave} disabled={backfillSaving}
                style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:'#0a84ff', color:'#fff', fontSize:13.5, fontWeight:700, cursor:backfillSaving?'not-allowed':'pointer', fontFamily:'inherit', opacity:backfillSaving?.7:1 }}>
                {backfillSaving ? 'Saving…' : '✓ Save Past Auctions'}
              </button>
              <button onClick={() => { setBackfillTarget(null); setBackfillRows([]); }}
                style={{ padding:'11px 18px', borderRadius:10, border:`1.5px solid ${tokens.border}`, background:'#fff', fontSize:13, cursor:'pointer', fontFamily:'inherit', color:tokens.textSub }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
