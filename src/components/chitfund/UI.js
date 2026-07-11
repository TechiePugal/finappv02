// src/components/UI.js
import React, { useState } from 'react';
import {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, XCircle,
  ChevronUp, ChevronDown, ChevronRight, Search, X, Eye, EyeOff,
  LayoutDashboard, FileText, Gavel, Users, Calendar, BarChart3,
  BookOpen, Zap, LogOut, Building2, Wallet, Activity, Target,
  ArrowUpRight, ArrowDownLeft, Minus, MoreHorizontal, Filter,
  Plus, Check, Info, ArrowUp, ArrowDown, User, Phone, Hash,
  DollarSign, Percent, Settings, RefreshCw, Download, ChevronLeft
} from 'lucide-react';

export {
  TrendingUp, TrendingDown, AlertCircle, CheckCircle, Clock, XCircle,
  LayoutDashboard, FileText, Gavel, Users, Calendar, BarChart3,
  BookOpen, Zap, LogOut, Building2, Wallet, Activity, Target,
  ArrowUpRight, ArrowDownLeft, Plus, Search, Eye, EyeOff, X,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Check, Info, Filter,
  MoreHorizontal, ArrowUp, ArrowDown, Minus, User, Phone, Hash,
  DollarSign, Percent, Settings, RefreshCw, Download
};

// ─── Design Tokens ────────────────────────────────────────────────────────
export const tokens = {
  blue:       '#007AFF',
  blueLight:  'rgba(0,122,255,0.09)',
  blueMid:    '#0A84FF',
  green:      '#34C759',
  greenLight: 'rgba(52,199,89,0.10)',
  red:        '#FF3B30',
  redLight:   'rgba(255,59,48,0.10)',
  amber:      '#FF9500',
  amberLight: 'rgba(255,149,0,0.10)',
  purple:     '#AF52DE',
  purpleLight:'rgba(175,82,222,0.10)',
  slate:      '#1C1C1E',
  slateLight: '#F9F9FB',
  border:     'rgba(0,0,0,0.08)',
  borderDark: 'rgba(0,0,0,0.13)',
  surface:    '#FFFFFF',
  bg:         '#F2F2F7',
  text:       '#000000',
  textMid:    '#3C3C43',
  textSub:    '#3C3C43CC',
  textMuted:  '#8E8E93',
};

// ─── Card ─────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, noPad }) {
  return (
    <div style={{
      background: tokens.surface, borderRadius: 16,
      border: `1px solid ${tokens.border}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 14px rgba(0,0,0,0.035)',
      padding: noPad ? 0 : '20px 24px', transition: 'box-shadow 0.2s ease', ...style,
    }}>{children}</div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, icon: Icon, accent = tokens.blue, trend, trendLabel }) {
  const trendUp = trend > 0;
  const neutral = trend === 0 || trend === undefined;
  return (
    <Card style={{ padding: '18px 20px 20px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.8 }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: tokens.textSub, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
          <p style={{ margin: 0, fontSize: 23, fontWeight: 800, color: tokens.text, letterSpacing: '-0.4px', lineHeight: 1.1 }}>{value}</p>
          {sub && <p style={{ margin: '5px 0 0', fontSize: 12, color: tokens.textMuted }}>{sub}</p>}
          {trendLabel && (
            <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, background: neutral ? tokens.slateLight : trendUp ? tokens.greenLight : tokens.redLight, color: neutral ? tokens.textSub : trendUp ? tokens.green : tokens.red }}>
              {!neutral && (trendUp ? <ArrowUp size={9} /> : <ArrowDown size={9} />)}
              <span style={{ fontSize: 11, fontWeight: 600 }}>{trendLabel}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `${accent}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 10 }}>
            <Icon size={17} color={accent} strokeWidth={2.2} />
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────
const badgeMap = {
  Active:    { bg: tokens.greenLight,  color: tokens.green,  dot: '#057A55' },
  Closed:    { bg: '#F3F4F6',          color: tokens.textSub, dot: tokens.textMuted },
  Taken:     { bg: tokens.blueLight,   color: tokens.blue,   dot: tokens.blue },
  Completed: { bg: tokens.greenLight,  color: tokens.green,  dot: '#057A55' },
  Pending:   { bg: tokens.amberLight,  color: tokens.amber,  dot: tokens.amber },
  Paid:      { bg: tokens.greenLight,  color: tokens.green,  dot: '#057A55' },
  Unpaid:    { bg: tokens.redLight,    color: tokens.red,    dot: tokens.red },
  Single:    { bg: tokens.blueLight,   color: tokens.blue,   dot: tokens.blue },
  Double:    { bg: tokens.purpleLight, color: tokens.purple, dot: tokens.purple },
  Company:   { bg: tokens.amberLight,  color: tokens.amber,  dot: tokens.amber },
};

export function Badge({ status, children }) {
  const label = children || status;
  const s = badgeMap[label] || { bg: '#F3F4F6', color: tokens.textSub, dot: tokens.textMuted };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────
const BV = {
  primary:   { bg: tokens.blue,   color: '#fff',        border: tokens.blue,       hov: '#1648C0' },
  secondary: { bg: '#fff',        color: tokens.textMid, border: tokens.border,    hov: tokens.slateLight },
  danger:    { bg: tokens.red,    color: '#fff',         border: tokens.red,       hov: '#A61919' },
  ghost:     { bg: 'transparent', color: tokens.blue,    border: 'transparent',    hov: tokens.blueLight },
  success:   { bg: tokens.green,  color: '#fff',         border: tokens.green,     hov: '#046644' },
  outline:   { bg: 'transparent', color: tokens.textMid, border: tokens.borderDark, hov: tokens.slateLight },
};
const BS = {
  xs: { p: '0 8px',  fs: 11, h: 24, r: 6 },
  sm: { p: '0 11px', fs: 12, h: 30, r: 7 },
  md: { p: '0 15px', fs: 13, h: 36, r: 8 },
  lg: { p: '0 20px', fs: 14, h: 42, r: 9 },
  xl: { p: '0 28px', fs: 15, h: 50, r: 10 },
};

function Spin() {
  return <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid currentColor', borderRadius: '50%', display: 'inline-block', animation: 'sp 0.7s linear infinite' }}><style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style></span>;
}

export function Button({ variant = 'primary', size = 'md', children, onClick, disabled, style = {}, type = 'button', loading, icon: Icon }) {
  const v = BV[variant]; const s = BS[size];
  const [h, setH] = useState(false);
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: s.h, padding: s.p, borderRadius: s.r, fontSize: s.fs, fontWeight: 600, background: h && !disabled ? v.hov : v.bg, color: v.color, border: `1px solid ${v.border}`, cursor: disabled || loading ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background 0.13s', fontFamily: 'inherit', whiteSpace: 'nowrap', letterSpacing: '0.01em', boxShadow: variant === 'primary' ? '0 1px 2px rgba(26,86,219,0.15)' : 'none', ...style }}>
      {loading ? <Spin /> : Icon ? <Icon size={s.fs + 1} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

// ─── Form Components ──────────────────────────────────────────────────────
export function FormField({ label, required, hint, children, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 600, color: tokens.textMid, letterSpacing: '0.01em' }}>{label}{required && <span style={{ color: tokens.red, marginLeft: 3 }}>*</span>}</label>}
      {children}
      {hint && !error && <span style={{ fontSize: 11, color: tokens.textMuted }}>{hint}</span>}
      {error && <span style={{ fontSize: 11, color: tokens.red, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={10} />{error}</span>}
    </div>
  );
}

export function Input({ style = {}, prefix, suffix, ...props }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {prefix && <span style={{ position: 'absolute', left: 10, color: tokens.textMuted, display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 1, fontSize: 12 }}>{prefix}</span>}
      <input {...props} onFocus={e => { setF(true); props.onFocus?.(e); }} onBlur={e => { setF(false); props.onBlur?.(e); }}
        style={{ width: '100%', height: 36, padding: prefix ? '0 12px 0 30px' : suffix ? '0 36px 0 12px' : '0 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', border: `1.5px solid ${f ? tokens.blue : tokens.border}`, boxShadow: f ? `0 0 0 3px ${tokens.blueLight}` : 'none', outline: 'none', background: '#fff', color: tokens.text, transition: 'border-color 0.15s, box-shadow 0.15s', ...style }} />
      {suffix && <span style={{ position: 'absolute', right: 10, color: tokens.textMuted, display: 'flex', alignItems: 'center', pointerEvents: 'none', fontSize: 12 }}>{suffix}</span>}
    </div>
  );
}

export function Select({ style = {}, children, ...props }) {
  const [f, setF] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select {...props} onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ width: '100%', height: 36, padding: '0 32px 0 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', appearance: 'none', border: `1.5px solid ${f ? tokens.blue : tokens.border}`, boxShadow: f ? `0 0 0 3px ${tokens.blueLight}` : 'none', outline: 'none', background: '#fff', color: tokens.text, cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', ...style }}>{children}</select>
      <ChevronDown size={13} color={tokens.textMuted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

export function Textarea({ style = {}, ...props }) {
  const [f, setF] = useState(false);
  return (
    <textarea {...props} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', border: `1.5px solid ${f ? tokens.blue : tokens.border}`, boxShadow: f ? `0 0 0 3px ${tokens.blueLight}` : 'none', outline: 'none', background: '#fff', color: tokens.text, resize: 'vertical', minHeight: 76, transition: 'border-color 0.15s, box-shadow 0.15s', ...style }} />
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────
export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
      <div onClick={() => onChange(!checked)} style={{ width: 40, height: 22, borderRadius: 11, background: checked ? tokens.blue : tokens.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer' }}>
        <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.18s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      {label && <span style={{ fontSize: 13, color: tokens.textMid, fontWeight: 500 }}>{label}</span>}
    </label>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────
export function Table({ columns, data, onRowClick, emptyMessage = 'No records found', emptyIcon: EI = FileText }) {
  if (!data?.length) {
    return (
      <div style={{ textAlign: 'center', padding: '52px 24px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: tokens.slateLight, border: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <EI size={22} color={tokens.textMuted} strokeWidth={1.5} />
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: tokens.textMid }}>{emptyMessage}</p>
        <p style={{ margin: 0, fontSize: 12, color: tokens.textMuted }}>No data to display</p>
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: tokens.slateLight, borderBottom: `1px solid ${tokens.border}` }}>
            {columns.map((col, i) => (
              <th key={i} style={{ padding: '9px 14px', textAlign: col.align || 'left', fontSize: 11, fontWeight: 700, color: tokens.textSub, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} onClick={() => onRowClick?.(row)}
              style={{ borderBottom: `1px solid ${tokens.border}`, cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.1s' }}
              onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = tokens.slateLight; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {columns.map((col, ci) => (
                <td key={ci} style={{ padding: '11px 14px', fontSize: 13, color: tokens.text, textAlign: col.align || 'left', verticalAlign: 'middle' }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page + Section Headers ───────────────────────────────────────────────
export function PageHeader({ title, subtitle, action, back, onBack }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
      <div>
        {back && onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: tokens.textSub, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 7, fontFamily: 'inherit', fontWeight: 500 }}>
            <ChevronLeft size={14} /> {back}
          </button>
        )}
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: tokens.text, letterSpacing: '-0.3px' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', color: tokens.textSub, fontSize: 13 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink: 0, marginLeft: 16 }}>{action}</div>}
    </div>
  );
}

export function SectionHeader({ title, action, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: sub ? 'flex-start' : 'center', marginBottom: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: tokens.text, letterSpacing: '-0.1px' }}>{title}</h2>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: tokens.textSub }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${tokens.border}`, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)} style={{ padding: '10px 18px', border: 'none', borderBottom: `2px solid ${active === t.value ? tokens.blue : 'transparent'}`, background: 'transparent', color: active === t.value ? tokens.blue : tokens.textSub, fontSize: 13, fontWeight: active === t.value ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.icon && <t.icon size={13} strokeWidth={2.2} />}{t.label}
        </button>
      ))}
    </div>
  );
}

// ─── SearchBar + FilterTabs ───────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div style={{ position: 'relative' }}>
      <Search size={13} color={tokens.textMuted} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', height: 36, padding: '0 12px 0 32px', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', border: `1.5px solid ${tokens.border}`, outline: 'none', background: '#fff', color: tokens.text }} />
    </div>
  );
}

export function FilterTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, background: tokens.slateLight, padding: 3, borderRadius: 9, border: `1px solid ${tokens.border}` }}>
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)} style={{ padding: '5px 13px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active === t.value ? '#fff' : 'transparent', color: active === t.value ? tokens.text : tokens.textSub, fontSize: 12, fontWeight: active === t.value ? 600 : 500, boxShadow: active === t.value ? '0 1px 2px rgba(0,0,0,0.07)' : 'none', transition: 'all 0.15s' }}>{t.label}</button>
      ))}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 560, footer }) {
  if (!open) return null;
  return (<div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'24px 16px' }}><div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:width, margin:'0 auto', boxShadow:'0 24px 64px rgba(0,0,0,0.22)', border:`1px solid ${tokens.border}`, animation:'mIn 0.22s cubic-bezier(0.16,1,0.3,1)' }}><div style={{ padding:'15px 20px', borderBottom:`1px solid ${tokens.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#fff', borderRadius:'16px 16px 0 0', zIndex:2 }}><h3 style={{ margin:0, fontSize:16, fontWeight:700, color:tokens.text, letterSpacing:'-0.01em' }}>{title}</h3><button onClick={onClose} style={{ background:tokens.slateLight, border:`1px solid ${tokens.border}`, borderRadius:8, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><X size={14} color={tokens.textSub} /></button></div><div style={{ padding:'18px 20px' }}>{children}</div>{footer && <div style={{ padding:'12px 20px', borderTop:`1px solid ${tokens.border}`, display:'flex', justifyContent:'flex-end', gap:8, position:'sticky', bottom:0, background:'#fff', borderRadius:'0 0 16px 16px', zIndex:2 }}>{footer}</div>}</div><style>{`@keyframes mIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`}</style></div>);
}

// ─── Misc ─────────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = tokens.blue }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div style={{ width: '100%', height: 5, background: tokens.border, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export function Loader({ text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 52, gap: 12 }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${tokens.border}`, borderTop: `3px solid ${tokens.blue}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      {text && <p style={{ margin: 0, fontSize: 13, color: tokens.textSub }}>{text}</p>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function EmptyState({ icon: Icon = FileText, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: tokens.slateLight, border: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <Icon size={22} color={tokens.textMuted} strokeWidth={1.5} />
      </div>
      <p style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 600, color: tokens.textMid }}>{title}</p>
      {subtitle && <p style={{ margin: '0 0 18px', fontSize: 13, color: tokens.textSub }}>{subtitle}</p>}
      {action}
    </div>
  );
}

export function InfoRow({ label, value, last, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: last ? 'none' : `1px solid ${tokens.border}` }}>
      <span style={{ fontSize: 12, color: tokens.textSub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight || tokens.text }}>{value}</span>
    </div>
  );
}

export function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
      <div style={{ flex: 1, height: 1, background: tokens.border }} />
      {label && <span style={{ fontSize: 10, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: tokens.border }} />
    </div>
  );
}

export function Alert({ type = 'info', message, onClose }) {
  const map = { info: { bg: tokens.blueLight, border: tokens.blue, color: tokens.blue, icon: Info }, error: { bg: tokens.redLight, border: tokens.red, color: tokens.red, icon: XCircle }, success: { bg: tokens.greenLight, border: tokens.green, color: tokens.green, icon: CheckCircle }, warning: { bg: tokens.amberLight, border: tokens.amber, color: tokens.amber, icon: AlertCircle } };
  const s = map[type]; const Icon = s.icon;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', borderRadius: 8, background: s.bg, border: `1px solid ${s.border}25` }}>
      <Icon size={14} color={s.color} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, fontSize: 13, color: s.color, fontWeight: 500 }}>{message}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.color, display: 'flex', padding: 0 }}><X size={12} /></button>}
    </div>
  );
}

export function KPIRow({ items }) {
  return (
    <div style={{ display: 'flex', borderRadius: 10, border: `1px solid ${tokens.border}`, overflow: 'hidden', background: '#fff' }}>
      {items.map((item, i) => (
        <div key={i} style={{ flex: 1, padding: '14px 16px', borderRight: i < items.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.label}</p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: item.color || tokens.text }}>{item.value}</p>
          {item.sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: tokens.textMuted }}>{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function Amount({ value, size = 'md', color }) {
  const sizes = { sm: 12, md: 13, lg: 15, xl: 19, xxl: 24 };
  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value || 0);
  return <span style={{ fontSize: sizes[size], fontWeight: 700, color: color || tokens.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px' }}>{fmt}</span>;
}
