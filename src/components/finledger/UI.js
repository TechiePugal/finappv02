import React from 'react';

/* ═══════════════════════════════
   CARD
═══════════════════════════════ */
export function Card({ children, style, onClick, noPad }) {
  return (
    <div onClick={onClick}
      style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
        padding: noPad ? 0 : '20px 22px', boxShadow:'var(--shadow-sm)',
        cursor:onClick?'pointer':'default', transition:'box-shadow var(--duration) var(--ease), transform var(--duration) var(--ease)', ...style }}
      onMouseEnter={onClick?e=>{e.currentTarget.style.boxShadow='var(--shadow-md)';e.currentTarget.style.transform='translateY(-1px)';}:null}
      onMouseLeave={onClick?e=>{e.currentTarget.style.boxShadow='var(--shadow-sm)';e.currentTarget.style.transform='translateY(0)';}:null}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════
   STAT CARD — polished KPI tile
═══════════════════════════════ */
const colorMap = {
  '#0a84ff':{ bg:'rgba(10,132,255,0.08)', glow:'rgba(10,132,255,0.15)' },
  '#30d158':{ bg:'rgba(48,209,88,0.08)',  glow:'rgba(48,209,88,0.15)'  },
  '#ff453a':{ bg:'rgba(255,69,58,0.08)',  glow:'rgba(255,69,58,0.15)'  },
  '#ff9f0a':{ bg:'rgba(255,159,10,0.08)', glow:'rgba(255,159,10,0.15)' },
  '#bf5af2':{ bg:'rgba(191,90,242,0.08)', glow:'rgba(191,90,242,0.15)' },
  '#5e5ce6':{ bg:'rgba(94,92,230,0.08)',  glow:'rgba(94,92,230,0.15)'  },
  '#32ade6':{ bg:'rgba(50,173,230,0.08)', glow:'rgba(50,173,230,0.15)' },
};
export function StatCard({ label, value, sub, icon, color='#0a84ff', trend, accent }) {
  const cm = colorMap[color] || { bg:'rgba(10,132,255,0.08)', glow:'rgba(10,132,255,0.15)' };
  return (
    <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)',
      padding:'18px 20px', boxShadow:'var(--shadow-sm)', display:'flex', flexDirection:'column', gap:14,
      position:'relative', overflow:'hidden' }}>
      {/* subtle top accent line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color, opacity:0.6, borderRadius:'var(--r-lg) var(--r-lg) 0 0' }}/>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <p style={{ fontSize:11, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.07em', lineHeight:1 }}>{label}</p>
        {icon && <div style={{ width:34, height:34, borderRadius:10, background:cm.bg, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0 }}>{icon}</div>}
      </div>
      <div>
        <p className="num" style={{ fontSize:24, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.04em', lineHeight:1 }}>{value}</p>
        {sub && <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:5, lineHeight:1.4 }}>{sub}</p>}
      </div>
      {trend !== undefined && (
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:11, fontWeight:700, color:trend>=0?'var(--green)':'var(--red)', display:'flex', alignItems:'center', gap:2 }}>
            {trend>=0?'↑':'↓'} {Math.abs(trend)}%
          </span>
          <span style={{ fontSize:11, color:'var(--text-tertiary)' }}>vs last month</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════
   BADGE
═══════════════════════════════ */
const badgeCfg = {
  active:      { bg:'var(--green-light)',  color:'var(--green-dark)',  dot:'var(--green)'  },
  closed:      { bg:'rgba(142,142,147,0.12)', color:'#636366', dot:'#8e8e93' },
  'non-active':{ bg:'var(--red-light)',    color:'var(--red-dark)',    dot:'var(--red)'    },
  paid:        { bg:'var(--green-light)',  color:'var(--green-dark)',  dot:'var(--green)'  },
  unpaid:      { bg:'var(--red-light)',    color:'var(--red-dark)',    dot:'var(--red)'    },
  pending:     { bg:'var(--orange-light)', color:'#a05a00',            dot:'var(--orange)' },
  warning:     { bg:'var(--orange-light)', color:'#a05a00',            dot:'var(--orange)' },
  credit:      { bg:'var(--green-light)',  color:'var(--green-dark)',  dot:'var(--green)'  },
  debit:       { bg:'var(--red-light)',    color:'var(--red-dark)',    dot:'var(--red)'    },
  partial:     { bg:'var(--indigo-light)', color:'var(--indigo)',      dot:'var(--indigo)' },
  full:        { bg:'var(--green-light)',  color:'var(--green-dark)',  dot:'var(--green)'  },
};
export function Badge({ label, type }) {
  const c = badgeCfg[(type||'').toLowerCase()] || badgeCfg.active;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:'var(--r-full)',
      background:c.bg, color:c.color, fontSize:12, fontWeight:600, whiteSpace:'nowrap', letterSpacing:'0.01em' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:c.dot, flexShrink:0 }}/>
      {label}
    </span>
  );
}

/* ═══════════════════════════════
   BUTTON
═══════════════════════════════ */
const btnMap = {
  primary:   { background:'var(--accent)',      color:'#fff', border:'none', shadow:'0 2px 8px rgba(10,132,255,0.3)' },
  secondary: { background:'rgba(118,118,128,0.10)', color:'var(--text-primary)', border:'none', shadow:'none' },
  danger:    { background:'var(--red-light)',   color:'var(--red)', border:'1px solid rgba(255,69,58,0.2)', shadow:'none' },
  ghost:     { background:'transparent',        color:'var(--accent)', border:'1px solid rgba(10,132,255,0.25)', shadow:'none' },
  success:   { background:'var(--green-light)', color:'var(--green-dark)', border:'1px solid rgba(48,209,88,0.25)', shadow:'none' },
  dark:      { background:'var(--text-primary)', color:'#fff', border:'none', shadow:'var(--shadow-md)' },
};
const sizeMap = {
  xs: { padding:'4px 10px',  fontSize:12, borderRadius:'var(--r-xs)', gap:4 },
  sm: { padding:'6px 12px',  fontSize:13, borderRadius:'var(--r-sm)', gap:5 },
  md: { padding:'9px 16px',  fontSize:14, borderRadius:'var(--r-sm)', gap:6 },
  lg: { padding:'12px 22px', fontSize:16, borderRadius:'var(--r-md)', gap:7 },
};
export function Button({ children, onClick, variant='primary', size='md', disabled, type='button', style, full }) {
  const b = btnMap[variant] || btnMap.primary;
  const s = sizeMap[size] || sizeMap.md;
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ background:b.background, color:b.color, border:b.border||'none', boxShadow:b.shadow,
        ...s, fontWeight:600, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1,
        display:'inline-flex', alignItems:'center', justifyContent:'center', gap:s.gap,
        fontFamily:'inherit', transition:'all var(--duration) var(--ease)', width:full?'100%':'auto',
        letterSpacing:'-0.01em', ...style }}
      onMouseEnter={e=>!disabled&&(e.currentTarget.style.opacity='0.82')}
      onMouseLeave={e=>!disabled&&(e.currentTarget.style.opacity='1')}>
      {children}
    </button>
  );
}

/* ═══════════════════════════════
   FORM COMPONENTS
═══════════════════════════════ */
export function FormField({ label, children, required, hint }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && <label style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', display:'flex', gap:3, alignItems:'center' }}>
        {label}{required && <span style={{ color:'var(--red)', fontSize:11 }}>*</span>}
      </label>}
      {children}
      {hint && <p style={{ fontSize:11, color:'var(--text-tertiary)', lineHeight:1.4 }}>{hint}</p>}
    </div>
  );
}

const inputBase = {
  padding:'10px 13px', background:'var(--bg-input)',
  border:'1.5px solid var(--border-strong)', borderRadius:'var(--r-sm)',
  fontSize:14, color:'var(--text-primary)', outline:'none', width:'100%',
  transition:'all var(--duration) var(--ease)', fontFamily:'inherit', lineHeight:1.4,
};
const focusStyle = { borderColor:'var(--accent)', boxShadow:'0 0 0 3px rgba(10,132,255,0.12)', background:'#fff' };
const blurStyle  = { borderColor:'var(--border-strong)', boxShadow:'none', background:'var(--bg-input)' };

export function Input({ style, ...props }) {
  return <input style={{ ...inputBase, ...style }} {...props}
    onFocus={e=>Object.assign(e.target.style,focusStyle)}
    onBlur={e=>Object.assign(e.target.style,blurStyle)}/>;
}
export function Select({ children, style, ...props }) {
  return <select style={{ ...inputBase, cursor:'pointer', ...style }} {...props}
    onFocus={e=>Object.assign(e.target.style,focusStyle)}
    onBlur={e=>Object.assign(e.target.style,blurStyle)}>
    {children}
  </select>;
}
export function Textarea({ style, ...props }) {
  return <textarea style={{ ...inputBase, resize:'vertical', minHeight:84, ...style }} {...props}
    onFocus={e=>Object.assign(e.target.style,focusStyle)}
    onBlur={e=>Object.assign(e.target.style,blurStyle)}/>;
}

/* ═══════════════════════════════
   TOGGLE
═══════════════════════════════ */
export function Toggle({ checked, onChange, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }} onClick={()=>onChange(!checked)}>
      <div style={{ width:44, height:26, borderRadius:13, background:checked?'var(--green)':'rgba(118,118,128,0.22)',
        position:'relative', transition:'background 0.22s var(--ease)', flexShrink:0 }}>
        <div style={{ position:'absolute', top:3, left:checked?21:3, width:20, height:20, borderRadius:'50%',
          background:'#fff', boxShadow:'0 1px 5px rgba(0,0,0,0.22)', transition:'left 0.22s var(--spring)' }}/>
      </div>
      {label && <span style={{ fontSize:14, color:'var(--text-primary)', lineHeight:1 }}>{label}</span>}
    </div>
  );
}

/* ═══════════════════════════════
   TABLE
═══════════════════════════════ */
export function Table({ columns, data, emptyMsg='No records found', onRowClick }) {
  return (
    <div style={{ background:'var(--bg-card)', borderRadius:'var(--r-md)', border:'1px solid var(--border)', overflow:'hidden', boxShadow:'var(--shadow-xs)' }}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
          <thead>
            <tr style={{ background:'var(--bg-secondary)', borderBottom:'1px solid var(--border)' }}>
              {columns.map(c=>(
                <th key={c.key} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:700,
                  color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length===0?(
              <tr><td colSpan={columns.length} style={{ padding:52, textAlign:'center', color:'var(--text-tertiary)' }}>
                <div style={{ fontSize:38, marginBottom:10, opacity:0.5 }}>📋</div>
                <p style={{ fontSize:14, color:'var(--text-secondary)' }}>{emptyMsg}</p>
              </td></tr>
            ):data.map((row,i)=>(
              <tr key={i} onClick={onRowClick?()=>onRowClick(row):null}
                style={{ borderBottom:'1px solid var(--divider)', cursor:onRowClick?'pointer':'default', transition:'background var(--duration) var(--ease)' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(10,132,255,0.025)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                {columns.map(c=>(
                  <td key={c.key} style={{ padding:'12px 16px', fontSize:14, color:'var(--text-primary)', verticalAlign:'middle' }}>
                    {c.render?c.render(row[c.key],row):(row[c.key]??'—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   PAGE HEADER
═══════════════════════════════ */
export function PageHeader({ title, subtitle, action, back }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:22, gap:16, flexWrap:'wrap' }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.025em', lineHeight:1.15 }}>{title}</h1>
        {subtitle && <p style={{ color:'var(--text-secondary)', fontSize:13.5, marginTop:4, lineHeight:1.4 }}>{subtitle}</p>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  );
}

/* ═══════════════════════════════
   LOADER
═══════════════════════════════ */
export function Loader() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:72, flexDirection:'column', gap:16 }}>
      <div style={{ width:32, height:32, border:'2.5px solid var(--bg-secondary)', borderTopColor:'var(--accent)',
        borderRadius:'50%', animation:'spin 0.75s linear infinite' }}/>
      <p style={{ color:'var(--text-tertiary)', fontSize:13, fontWeight:500 }}>Loading…</p>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

/* ═══════════════════════════════
   EMPTY STATE
═══════════════════════════════ */
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign:'center', padding:'64px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      <div style={{ fontSize:52, lineHeight:1, opacity:0.7 }}>{icon||'📋'}</div>
      <div>
        <p style={{ fontSize:17, fontWeight:600, color:'var(--text-primary)', marginBottom:5, letterSpacing:'-0.01em' }}>{title}</p>
        {subtitle && <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.5 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ═══════════════════════════════
   SECTION HEADER
═══════════════════════════════ */
export function SectionHeader({ title, action, style }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:12, ...style }}>
      <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.01em', lineHeight:1 }}>{title}</h3>
      {action}
    </div>
  );
}

/* ═══════════════════════════════
   SEARCH BAR
═══════════════════════════════ */
export function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position:'relative', flex:1, minWidth:180 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"
        style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}>
        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
      </svg>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||'Search…'}
        style={{ ...inputBase, paddingLeft:36, paddingRight:12 }}
        onFocus={e=>Object.assign(e.target.style,focusStyle)}
        onBlur={e=>Object.assign(e.target.style,blurStyle)}/>
    </div>
  );
}

/* ═══════════════════════════════
   FILTER TABS (pill-style)
═══════════════════════════════ */
export function FilterTabs({ options=[], value, onChange }) {
  // Handles: string[] OR {value,label,count}[]
  return (
    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
      {options.map((o, i) => {
        const isObj    = o !== null && typeof o === 'object' && !Array.isArray(o);
        const optVal   = isObj ? String(o.value ?? '') : String(o ?? '');
        const optLabel = isObj ? String(o.label ?? o.value ?? '') : String(o ?? '');
        const optCount = isObj && o.count != null ? Number(o.count) : null;
        const isActive = value === (isObj ? o.value : o);
        return (
          <button key={optVal + i} onClick={() => onChange(isObj ? o.value : o)}
            style={{ padding:'6px 14px', borderRadius:'var(--r-full)', border:'none',
              background: isActive ? 'var(--accent)' : 'rgba(118,118,128,0.10)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              fontSize:13, fontWeight: isActive ? 600 : 500, cursor:'pointer',
              transition:'all var(--duration) var(--ease)', fontFamily:'inherit',
              letterSpacing:'-0.01em', display:'flex', alignItems:'center', gap:5 }}>
            {optLabel}
            {optCount !== null && (
              <span style={{
                fontSize:11, fontWeight:700,
                padding:'1px 6px', borderRadius:10,
                background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(118,118,128,0.15)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
              }}>
                {optCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════
   MODAL
═══════════════════════════════ */
export function Modal({ open, onClose, title, children, width=500 }) {
  if(!open) return null;
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.32)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16,
      animation:'fadeIn 0.18s var(--ease)' }} onClick={onClose}>
      <div style={{ background:'var(--bg-card)', borderRadius:'var(--r-xl)', padding:'24px 26px',
        width:'100%', maxWidth:width, boxShadow:'var(--shadow-xl)',
        animation:'bounceIn 0.28s var(--spring)', maxHeight:'90vh', overflowY:'auto' }}
        onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h3 style={{ fontSize:17, fontWeight:700, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>{title}</h3>
          <button onClick={onClose} style={{ background:'rgba(118,118,128,0.10)', border:'none', borderRadius:8,
            width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--text-secondary)', cursor:'pointer', transition:'background var(--duration)' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(118,118,128,0.18)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(118,118,128,0.10)'}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {children}
      </div>
      <style>{'@keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes bounceIn{0%{opacity:0;transform:scale(0.88)}60%{transform:scale(1.03)}100%{opacity:1;transform:scale(1)}}'}</style>
    </div>
  );
}

/* ═══════════════════════════════
   PROGRESS BAR
═══════════════════════════════ */
export function ProgressBar({ value, max, color='var(--accent)', height=8, showLabel=true, label }) {
  const pct = max > 0 ? Math.min(100, (value/max)*100) : 0;
  return (
    <div>
      {showLabel && (
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
          {label && <span style={{ fontSize:12, color:'var(--text-secondary)' }}>{label}</span>}
          <span style={{ fontSize:12, fontWeight:700, color }}>{pct.toFixed(0)}%</span>
        </div>
      )}
      <div style={{ background:'rgba(118,118,128,0.10)', borderRadius:99, height, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:99, transition:'width 0.7s var(--ease)' }}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════
   INFO ROW
═══════════════════════════════ */
export function InfoRow({ label, value, color, bold }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'10px 0', borderBottom:'1px solid var(--divider)' }}>
      <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{label}</span>
      <span className="num" style={{ fontSize:14, fontWeight:bold?700:600, color:color||'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════
   DIVIDER
═══════════════════════════════ */
export function Divider({ label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'4px 0' }}>
      <div style={{ flex:1, height:1, background:'var(--divider)' }}/>
      {label && <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em' }}>{label}</span>}
      <div style={{ flex:1, height:1, background:'var(--divider)' }}/>
    </div>
  );
}

/* ═══════════════════════════════
   HELPERS
═══════════════════════════════ */
export function formatCurrency(n) {
  if(n===undefined||n===null||isNaN(n)) return '₹0';
  return '₹' + Math.abs(Number(n)).toLocaleString('en-IN', { maximumFractionDigits:0 });
}
export function formatDate(date) {
  if(!date) return '—';
  const d = date?.toDate ? date.toDate() : new Date(date);
  if(isNaN(d)) return '—';
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
