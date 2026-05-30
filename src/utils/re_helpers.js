// ── Cache (30s TTL) ─────────────────────────────────────────────────────────
const _cache = new Map();
const TTL = 30000;
export const cacheGet = k => { const e = _cache.get(k); if (!e) return null; if (Date.now()-e.t>TTL){_cache.delete(k);return null;} return e.d; };
export const cacheSet = (k,d) => _cache.set(k,{d,t:Date.now()});
export const cacheClear = prefix => { if(!prefix){_cache.clear();return;} for(const k of _cache.keys()) if(k.startsWith(prefix)) _cache.delete(k); };

// ── Currency ─────────────────────────────────────────────────────────────────
export const fmt = v => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);
export const fmtN = v => new Intl.NumberFormat('en-IN').format(v||0);

// ── Date ─────────────────────────────────────────────────────────────────────
export function fmtDate(d) {
  if(!d) return '—';
  const dt = d?.toDate ? d.toDate() : typeof d==='string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(dt);
}
export function toInputDate(d) {
  if(!d) return '';
  const dt = d?.toDate ? d.toDate() : typeof d==='string' ? new Date(d) : d;
  return dt.toISOString().split('T')[0];
}
export function holdingStr(raw) {
  if(!raw) return '—';
  const dt = raw?.toDate ? raw.toDate() : new Date(raw);
  const m = Math.floor((Date.now()-dt.getTime())/(1000*60*60*24*30.44));
  const y=Math.floor(m/12),mo=m%12;
  return y>0?`${y}y ${mo}m`:`${mo}m`;
}
export const today = () => new Date().toISOString().split('T')[0];

// ── Lot number ────────────────────────────────────────────────────────────────
export const genLot = (prefix,seq) => `${prefix}-${String(seq).padStart(3,'0')}`;

// ── Site status config ────────────────────────────────────────────────────────
export const SITE_STATUS_CFG = {
  Available:  {bg:'#e8f5e9',color:'#1b5e20',dot:'#4caf50',label:'Available'},
  Booked:     {bg:'#fff3e0',color:'#e65100',dot:'#ff9800',label:'Booked'},
  Registered: {bg:'#e3f2fd',color:'#0d47a1',dot:'#2196f3',label:'Registered'},
  Sold:       {bg:'#ede7f6',color:'#4527a0',dot:'#9c27b0',label:'Sold'},
  Reserved:   {bg:'#fce4ec',color:'#880e4f',dot:'#e91e63',label:'Reserved'},
  'On Hold':  {bg:'#f5f5f5',color:'#424242',dot:'#9e9e9e',label:'On Hold'},
};
export const SITE_STATUSES = Object.keys(SITE_STATUS_CFG);

// ── Expense categories ────────────────────────────────────────────────────────
export const EXP_CATS = [
  'Land Purchase','Land Survey','Layout Approval','DTCP Approval','Panchayat Fees',
  'Road Construction','Drainage & Sewer','Water Supply','Electricity Connection',
  'Compound Wall','Site Leveling','Legal & Registration','Marketing & Ads',
  'Broker Commission','Contractor Payment','Labour Charges','Site Office',
  'Security','Government Tax','Miscellaneous',
];

// ── Payment modes ─────────────────────────────────────────────────────────────
export const PAY_MODES = ['Cash','Bank Transfer','NEFT/RTGS','Cheque','DD','UPI','Mixed'];

// ── Document types ────────────────────────────────────────────────────────────
export const DOC_TYPES = [
  'Layout Plan','Survey/FMB Map','Patta','Link Document','EC (Encumbrance)',
  'DTCP Approval','Panchayat Approval','RERA Registration','Sale Deed',
  'Agreement for Sale','Registration Document','Power of Attorney',
  'NOC','Receipt','Other',
];

// ── Client payment status ─────────────────────────────────────────────────────
export function clientPayStatus(paid, total) {
  if(!total) return {label:'—',cls:'b-neutral'};
  const pct = paid/total*100;
  if(pct<=0) return {label:'Not Started',cls:'b-danger'};
  if(pct<100) return {label:`${pct.toFixed(0)}% Paid`,cls:'b-booked'};
  return {label:'Fully Paid',cls:'b-active'};
}

// ── Investor status ───────────────────────────────────────────────────────────
export const INV_TYPES = ['Full Project','Partial Amount','Land Only','Development Only'];
