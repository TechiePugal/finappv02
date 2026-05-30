import React,{useState,useEffect}from'react';
import{Search,Eye,EyeOff,X,ChevronDown,ChevronLeft,AlertCircle,CheckCircle,Info,AlertTriangle,Upload,MoreHorizontal,FileText,ChevronRight,Plus}from'lucide-react';

export const T={
  blue:'#1A56DB',blueLight:'#EBF2FF',blueMid:'#3B76EF',
  green:'#057A55',greenLight:'#DEF7EC',
  red:'#C81E1E',redLight:'#FDE8E8',
  amber:'#B45309',amberLight:'#FEF3C7',
  purple:'#5521B5',purpleLight:'#EDEBFF',
  slate:'#1E2640',slateLight:'#F8FAFC',
  border:'#E5E9F2',borderDark:'#C8D0E2',
  surface:'#FFFFFF',bg:'#F4F6FB',
  text:'#111928',textMid:'#374151',textSub:'#6B7280',textMuted:'#9CA3AF',
};

export const fmt=v=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);
export function fmtDate(d){if(!d)return'—';const dt=d?.toDate?d.toDate():typeof d==='string'?new Date(d):d;if(isNaN(dt))return'—';return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(dt);}

// ── Card
export function Card({children,style={},noPad}){return<div style={{background:T.surface,borderRadius:12,border:`1px solid ${T.border}`,boxShadow:'0 1px 3px rgba(0,0,0,0.04)',padding:noPad?0:'20px 24px',...style}}>{children}</div>;}

// ── StatCard
export function StatCard({label,value,sub,icon:Icon,accent=T.blue,isCurrency}){
  const display=isCurrency?fmt(value):(value??'—');
  // Handle both icon={ComponentFn} and icon={<JSXElement/>}
  const isElement = Icon && typeof Icon === 'object' && Icon.type;
  const iconNode = isElement
    ? <div style={{color:accent}}>{Icon}</div>
    : (Icon ? <Icon size={17} color={accent} strokeWidth={2.2}/> : null);
  return<Card style={{padding:'18px 20px'}}><div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}><div style={{flex:1,minWidth:0}}><p style={{margin:'0 0 8px',fontSize:11,fontWeight:700,color:T.textSub,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</p><p style={{margin:0,fontSize:22,fontWeight:700,color:T.text,letterSpacing:'-0.3px',lineHeight:1.1}}>{display}</p>{sub&&<p style={{margin:'5px 0 0',fontSize:12,color:T.textMuted}}>{sub}</p>}</div>{iconNode&&<div style={{width:38,height:38,borderRadius:10,background:`${accent}15`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginLeft:10}}>{iconNode}</div>}</div></Card>;
}

// ── Badge
const BM={Active:{bg:T.greenLight,color:T.green,dot:'#057A55'},Available:{bg:T.greenLight,color:T.green,dot:'#057A55'},Booked:{bg:T.amberLight,color:T.amber,dot:T.amber},Registered:{bg:T.blueLight,color:T.blue,dot:T.blue},Sold:{bg:T.purpleLight,color:T.purple,dot:T.purple},Reserved:{bg:'#EFF6FF',color:'#1D4ED8',dot:'#1D4ED8'},'On Hold':{bg:'#F3F4F6',color:T.textSub,dot:T.textMuted},Cancelled:{bg:T.redLight,color:T.red,dot:T.red},Completed:{bg:T.purpleLight,color:T.purple,dot:T.purple},Pending:{bg:T.amberLight,color:T.amber,dot:T.amber},Closed:{bg:'#F3F4F6',color:T.textSub,dot:T.textMuted}};
export function Badge({status,children}){const label=children||status;const s=BM[label]||{bg:'#F3F4F6',color:T.textSub,dot:T.textMuted};return<span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:20,background:s.bg,color:s.color,fontSize:11,fontWeight:600,letterSpacing:'0.02em',whiteSpace:'nowrap'}}><span style={{width:5,height:5,borderRadius:'50%',background:s.dot,flexShrink:0}}/>{label}</span>;}

// ── IconBtn (edit/delete/view icons in tables)
export function IconBtn({icon:Icon,onClick,title,danger,style={}}){
  const[h,setH]=useState(false);
  const hBg=danger?T.redLight:T.slateLight;
  const hColor=danger?T.red:T.blue;
  return<button title={title}onClick={e=>{e.stopPropagation();onClick();}}onMouseEnter={()=>setH(true)}onMouseLeave={()=>setH(false)}style={{width:29,height:29,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:7,border:`1px solid ${h?(danger?T.red:T.borderDark):T.border}`,background:h?hBg:'transparent',cursor:'pointer',transition:'all 0.12s',flexShrink:0,...style}}><Icon size={13}color={h?hColor:T.textSub}strokeWidth={2}/></button>;
}

// ── Button
const BV={primary:{bg:T.blue,color:'#fff',border:T.blue,hov:'#1648C0'},secondary:{bg:'#fff',color:T.textMid,border:T.border,hov:T.slateLight},danger:{bg:T.red,color:'#fff',border:T.red,hov:'#A61919'},ghost:{bg:'transparent',color:T.blue,border:'transparent',hov:T.blueLight},success:{bg:T.green,color:'#fff',border:T.green,hov:'#046644'},outline:{bg:'transparent',color:T.textMid,border:T.borderDark,hov:T.slateLight},warning:{bg:T.amber,color:'#fff',border:T.amber,hov:'#9A4A07'}};
const BS={xs:{p:'0 8px',fs:11,h:24,r:6},sm:{p:'0 11px',fs:12,h:30,r:7},md:{p:'0 15px',fs:13,h:36,r:8},lg:{p:'0 20px',fs:14,h:42,r:9}};
function Spin(){return<span style={{width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTop:'2px solid currentColor',borderRadius:'50%',display:'inline-block',animation:'reSpin 0.7s linear infinite'}}/>;}
export function Button({variant='primary',size='md',children,onClick,disabled,style={},type='button',loading,icon:Icon}){const v=BV[variant]||BV.primary;const s=BS[size]||BS.md;const[h,setH]=useState(false);return<button type={type}onClick={onClick}disabled={disabled||loading}onMouseEnter={()=>setH(true)}onMouseLeave={()=>setH(false)}style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,height:s.h,padding:s.p,borderRadius:s.r,fontSize:s.fs,fontWeight:600,background:h&&!disabled?v.hov:v.bg,color:v.color,border:`1px solid ${v.border}`,cursor:disabled||loading?'not-allowed':'pointer',opacity:disabled?0.5:1,transition:'background 0.13s',fontFamily:'inherit',whiteSpace:'nowrap',...style}}>{loading?<Spin/>:Icon?<Icon size={s.fs+1}strokeWidth={2.2}/>:null}{children}</button>;}

// ── Form
export function FormField({label,required,hint,children,error}){return<div style={{display:'flex',flexDirection:'column',gap:5}}>{label&&<label style={{fontSize:12,fontWeight:600,color:T.textMid}}>{label}{required&&<span style={{color:T.red,marginLeft:3}}>*</span>}</label>}{children}{hint&&!error&&<span style={{fontSize:11,color:T.textMuted}}>{hint}</span>}{error&&<span style={{fontSize:11,color:T.red}}>{error}</span>}</div>;}

export function Input({style={},prefix,suffix,...props}){const[f,setF]=useState(false);return<div style={{position:'relative',display:'flex',alignItems:'center'}}>{prefix&&<span style={{position:'absolute',left:10,color:T.textMuted,fontSize:12,pointerEvents:'none',zIndex:1}}>{prefix}</span>}<input{...props}onFocus={e=>{setF(true);props.onFocus?.(e);}}onBlur={e=>{setF(false);props.onBlur?.(e);}}style={{width:'100%',height:36,padding:prefix?'0 12px 0 30px':suffix?'0 36px 0 12px':'0 12px',borderRadius:8,fontSize:13,fontFamily:'inherit',border:`1.5px solid ${f?T.blue:T.border}`,boxShadow:f?`0 0 0 3px ${T.blueLight}`:'none',outline:'none',background:props.disabled?T.slateLight:'#fff',color:T.text,transition:'border-color 0.15s, box-shadow 0.15s',...style}}/>{suffix&&<span style={{position:'absolute',right:10,color:T.textMuted,fontSize:12,pointerEvents:'none'}}>{suffix}</span>}</div>;}

export function Select({style={},children,...props}){const[f,setF]=useState(false);return<div style={{position:'relative'}}><select{...props}onFocus={()=>setF(true)}onBlur={()=>setF(false)}style={{width:'100%',height:36,padding:'0 32px 0 12px',borderRadius:8,fontSize:13,fontFamily:'inherit',appearance:'none',border:`1.5px solid ${f?T.blue:T.border}`,boxShadow:f?`0 0 0 3px ${T.blueLight}`:'none',outline:'none',background:'#fff',color:T.text,cursor:'pointer',...style}}>{children}</select><ChevronDown size={13}color={T.textMuted}style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/></div>;}

export function Textarea({style={},...props}){const[f,setF]=useState(false);return<textarea{...props}onFocus={()=>setF(true)}onBlur={()=>setF(false)}style={{width:'100%',padding:'9px 12px',borderRadius:8,fontSize:13,fontFamily:'inherit',border:`1.5px solid ${f?T.blue:T.border}`,boxShadow:f?`0 0 0 3px ${T.blueLight}`:'none',outline:'none',background:'#fff',color:T.text,resize:'vertical',minHeight:72,...style}}/>;}

export function Grid({cols=2,gap=14,children,style={}}){return<div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gap,...style}}>{children}</div>;}

// ── Table
export function Table({columns,data=[],onRowClick,emptyText='No records',loading}){
  if(loading)return<Loader/>;
  if(!data.length)return<div style={{textAlign:'center',padding:'52px 24px'}}><div style={{width:52,height:52,borderRadius:14,background:T.slateLight,border:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}><FileText size={22}color={T.textMuted}strokeWidth={1.5}/></div><p style={{margin:'0 0 4px',fontSize:14,fontWeight:600,color:T.textMid}}>{emptyText}</p></div>;
  return<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr style={{background:T.slateLight,borderBottom:`1px solid ${T.border}`}}>{columns.map((col,i)=><th key={i}style={{padding:'9px 14px',textAlign:col.align||'left',fontSize:11,fontWeight:700,color:T.textSub,textTransform:'uppercase',letterSpacing:'0.07em',whiteSpace:'nowrap'}}>{col.header}</th>)}</tr></thead><tbody>{data.map((row,ri)=><tr key={row.id||ri}onClick={()=>onRowClick?.(row)}style={{borderBottom:`1px solid ${T.border}`,cursor:onRowClick?'pointer':'default',transition:'background 0.1s'}}onMouseEnter={e=>{if(onRowClick)e.currentTarget.style.background=T.slateLight;}}onMouseLeave={e=>{e.currentTarget.style.background='transparent';}}>{columns.map((col,ci)=><td key={ci}style={{padding:'11px 14px',fontSize:13,color:T.text,textAlign:col.align||'left',verticalAlign:'middle'}}>{col.render?col.render(row[col.key],row):(row[col.key]??'—')}</td>)}</tr>)}</tbody></table></div>;
}

// ── Modal
export function Modal({open,onClose,title,children,width=600,footer}){
  useEffect(()=>{if(open)document.body.style.overflow='hidden';else document.body.style.overflow='';return()=>{document.body.style.overflow='';};},[open]);
  if(!open)return null;
  return<div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(17,25,40,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:width,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 64px rgba(0,0,0,0.18)',border:`1px solid ${T.border}`,animation:'reModalIn 0.2s ease'}}><div style={{padding:'16px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}><h3 style={{margin:0,fontSize:15,fontWeight:700,color:T.text}}>{title}</h3><button onClick={onClose}style={{background:T.slateLight,border:`1px solid ${T.border}`,borderRadius:7,width:28,height:28,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={13}color={T.textSub}/></button></div><div style={{padding:'18px 20px',flex:1,overflowY:'auto'}}>{children}</div>{footer&&<div style={{padding:'12px 20px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'flex-end',gap:8,flexShrink:0}}>{footer}</div>}</div><style>{`@keyframes reModalIn{from{opacity:0;transform:scale(0.94) translateY(8px)}to{opacity:1;transform:none}} @keyframes reSpin{to{transform:rotate(360deg)}}`}</style></div>;
}

// ── Confirm
export function Confirm({open,onClose,onConfirm,title,message,danger,confirmLabel='Confirm'}){
  const[loading,setLoading]=useState(false);
  if(!open)return null;
  return<Modal open title={title}onClose={onClose}width={420}footer={<><Button variant="secondary"onClick={onClose}>Cancel</Button><Button variant={danger?'danger':'primary'}loading={loading}onClick={async()=>{setLoading(true);try{await onConfirm();}finally{setLoading(false);onClose();}}}>{confirmLabel}</Button></>}><p style={{margin:0,fontSize:14,color:T.textMid,lineHeight:1.6}}>{message}</p></Modal>;
}

// ── Alert
export function Alert({type='info',children,onClose}){
  const cfg={info:{bg:T.blueLight,border:T.blue,color:T.blue,Icon:Info},error:{bg:T.redLight,border:T.red,color:T.red,Icon:AlertCircle},success:{bg:T.greenLight,border:T.green,color:T.green,Icon:CheckCircle},warning:{bg:T.amberLight,border:T.amber,color:T.amber,Icon:AlertTriangle}}[type];
  return<div style={{display:'flex',alignItems:'flex-start',gap:9,padding:'10px 12px',borderRadius:8,background:cfg.bg,border:`1px solid ${cfg.border}30`,marginBottom:14}}><cfg.Icon size={14}color={cfg.color}style={{flexShrink:0,marginTop:1}}/><span style={{flex:1,fontSize:13,color:cfg.color,fontWeight:500}}>{children}</span>{onClose&&<button onClick={onClose}style={{background:'none',border:'none',cursor:'pointer',color:cfg.color,display:'flex',padding:0}}><X size={12}/></button>}</div>;
}

// ── PageHeader
export function PageHeader({title,subtitle,action,onBack,backLabel}){return<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22}}><div>{onBack&&<button onClick={onBack}style={{display:'inline-flex',alignItems:'center',gap:4,background:'none',border:'none',color:T.textSub,fontSize:12,cursor:'pointer',padding:0,marginBottom:7,fontFamily:'inherit',fontWeight:500}}><ChevronLeft size={14}/>{backLabel||'Back'}</button>}<h1 style={{margin:0,fontSize:21,fontWeight:700,color:T.text,letterSpacing:'-0.3px'}}>{title}</h1>{subtitle&&<p style={{margin:'4px 0 0',color:T.textSub,fontSize:13}}>{subtitle}</p>}</div>{action&&<div style={{flexShrink:0,marginLeft:16}}>{action}</div>}</div>;}

// ── SectionHeader
export function SectionHeader({title,action,sub}){return<div style={{display:'flex',justifyContent:'space-between',alignItems:sub?'flex-start':'center',marginBottom:14}}><div><h2 style={{margin:0,fontSize:14,fontWeight:700,color:T.text}}>{title}</h2>{sub&&<p style={{margin:'2px 0 0',fontSize:12,color:T.textSub}}>{sub}</p>}</div>{action}</div>;}

// ── Tabs
export function Tabs({tabs,active,onChange}){return<div style={{display:'flex',borderBottom:`1px solid ${T.border}`,marginBottom:20,overflowX:'auto'}}>{tabs.map(t=><button key={t.value}onClick={()=>onChange(t.value)}style={{padding:'10px 18px',border:'none',borderBottom:`2px solid ${active===t.value?T.blue:'transparent'}`,background:'transparent',color:active===t.value?T.blue:T.textSub,fontSize:13,fontWeight:active===t.value?600:500,cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s',marginBottom:-1,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:6}}>{t.icon&&<t.icon size={13}strokeWidth={2.2}/>}{t.label}{t.count!=null&&<span style={{fontSize:11,fontWeight:700,padding:'1px 6px',borderRadius:10,background:active===t.value?T.blueLight:T.slateLight,color:active===t.value?T.blue:T.textMuted}}>{t.count}</span>}</button>)}</div>;}

// ── FilterTabs
export function FilterTabs({tabs=[],active,onChange}){return<div style={{display:'flex',gap:2,background:T.slateLight,padding:3,borderRadius:9,border:`1px solid ${T.border}`}}>{tabs.map(t=><button key={t.value}onClick={()=>onChange(t.value)}style={{padding:'5px 13px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'inherit',background:active===t.value?'#fff':'transparent',color:active===t.value?T.text:T.textSub,fontSize:12,fontWeight:active===t.value?600:500,boxShadow:active===t.value?'0 1px 2px rgba(0,0,0,0.07)':'none',transition:'all 0.15s',whiteSpace:'nowrap'}}>{t.label}{t.count!=null?` (${t.count})`:''}</button>)}</div>;}

// ── SearchBar
export function SearchBar({value,onChange,placeholder='Search…',width=220}){return<div style={{position:'relative',width}}><Search size={13}color={T.textMuted}style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/><input value={value}onChange={e=>onChange(e.target.value)}placeholder={placeholder}style={{width:'100%',height:36,padding:'0 12px 0 32px',borderRadius:8,fontSize:13,fontFamily:'inherit',border:`1.5px solid ${T.border}`,outline:'none',background:'#fff',color:T.text}}/></div>;}

// ── SiteTile
const SC={Available:{bg:'#f0fdf4',border:'#bbf7d0',color:'#166534',dot:'#22c55e'},Booked:{bg:'#fffbeb',border:'#fde68a',color:'#92400e',dot:'#f59e0b'},Registered:{bg:'#eff6ff',border:'#bfdbfe',color:'#1e40af',dot:'#3b82f6'},Sold:{bg:'#faf5ff',border:'#e9d5ff',color:'#6b21a8',dot:'#a855f7'},Reserved:{bg:'#fdf2f8',border:'#f9a8d4',color:'#9d174d',dot:'#ec4899'},'On Hold':{bg:'#f9fafb',border:'#e5e7eb',color:'#4b5563',dot:'#9ca3af'}};
export function SiteTile({site,onClick,selected}){const cfg=SC[site.status]||SC['On Hold'];const[h,setH]=useState(false);return<div onClick={()=>onClick?.(site)}onMouseEnter={()=>setH(true)}onMouseLeave={()=>setH(false)}style={{background:cfg.bg,border:`2px solid ${selected?T.blue:h?cfg.dot:cfg.border}`,borderRadius:10,padding:'10px 8px',textAlign:'center',cursor:'pointer',transition:'all 0.15s',transform:h?'translateY(-2px)':'none',boxShadow:h?'0 4px 12px rgba(0,0,0,0.08)':'0 1px 2px rgba(0,0,0,0.04)'}}><p style={{margin:'0 0 3px',fontSize:10.5,fontWeight:700,color:cfg.color,letterSpacing:'0.03em'}}>{site.lotNumber}</p><p style={{margin:'0 0 2px',fontSize:12,fontWeight:600,color:cfg.color}}>{site.size} sqft</p><p style={{margin:'0 0 3px',fontSize:10,color:cfg.color,opacity:0.75}}>₹{Number(site.pricePerSqft||0).toLocaleString('en-IN')}/sqft</p>{site.clientName&&<p style={{margin:'0 0 4px',fontSize:9.5,color:cfg.color,opacity:0.7,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{site.clientName}</p>}<span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:9,fontWeight:600,color:cfg.color}}><span style={{width:5,height:5,borderRadius:'50%',background:cfg.dot}}/>{site.status}</span></div>;}

// ── InfoRow
export function InfoRow({label,value,last,highlight}){return<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:last?'none':`1px solid ${T.border}`}}><span style={{fontSize:12,color:T.textSub}}>{label}</span><span style={{fontSize:13,fontWeight:600,color:highlight||T.text,textAlign:'right',maxWidth:'60%'}}>{value??'—'}</span></div>;}

// ── ProgressBar
export function ProgressBar({value,max,color=T.blue}){const pct=max>0?Math.min(Math.round((value/max)*100),100):0;return<div style={{width:'100%',height:5,background:T.border,borderRadius:3,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.5s ease'}}/></div>;}

// ── Loader
export function Loader({text}){return<div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:52,gap:12}}><div style={{width:32,height:32,border:`3px solid ${T.border}`,borderTop:`3px solid ${T.blue}`,borderRadius:'50%',animation:'reSpin 0.7s linear infinite'}}/>{text&&<p style={{margin:0,fontSize:13,color:T.textSub}}>{text}</p>}<style>{`@keyframes reSpin{to{transform:rotate(360deg)}}`}</style></div>;}

// ── UploadZone
export function UploadZone({onFile,accept='*',label='Click or drag file here',current}){const[drag,setDrag]=useState(false);const id=`uz_${Math.random().toString(36).slice(2)}`;return<div onDragOver={e=>{e.preventDefault();setDrag(true);}}onDragLeave={()=>setDrag(false)}onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onFile(f);}}onClick={()=>document.getElementById(id)?.click()}style={{border:`2px dashed ${drag?T.blue:T.borderDark}`,borderRadius:10,padding:'16px 14px',textAlign:'center',cursor:'pointer',background:drag?T.blueLight:T.slateLight,transition:'all 0.15s'}}><input id={id}type="file"accept={accept}style={{display:'none'}}onChange={e=>e.target.files[0]&&onFile(e.target.files[0])}/>{current?<p style={{margin:0,fontSize:13,color:T.green,fontWeight:500}}>✓ {current}</p>:<><Upload size={18}color={T.textMuted}style={{margin:'0 auto 6px'}}/><p style={{margin:0,fontSize:13,color:T.textSub}}>{label}</p></>}</div>;}

// ── Divider
export function Divider({label}){return<div style={{display:'flex',alignItems:'center',gap:10,margin:'16px 0'}}><div style={{flex:1,height:1,background:T.border}}/>{label&&<span style={{fontSize:10,fontWeight:700,color:T.textMuted,textTransform:'uppercase',letterSpacing:'0.07em'}}>{label}</span>}<div style={{flex:1,height:1,background:T.border}}/></div>;}

// ── KPIRow
export function KPIRow({items}){return<div style={{display:'flex',borderRadius:10,border:`1px solid ${T.border}`,overflow:'hidden',background:'#fff'}}>{items.map((item,i)=><div key={i}style={{flex:1,padding:'14px 16px',borderRight:i<items.length-1?`1px solid ${T.border}`:'none'}}><p style={{margin:'0 0 3px',fontSize:11,fontWeight:700,color:T.textMuted,textTransform:'uppercase',letterSpacing:'0.06em'}}>{item.label}</p><p style={{margin:0,fontSize:17,fontWeight:700,color:item.color||T.text}}>{item.value}</p>{item.sub&&<p style={{margin:'2px 0 0',fontSize:11,color:T.textMuted}}>{item.sub}</p>}</div>)}</div>;}

// ── ActionMenu stub (replaced by IconBtns in new UI) ─────────────────────
export function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  useEffect(() => {
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer' }}>
        <MoreHorizontal size={13} color={T.textSub} />
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 168, zIndex: 400, overflow: 'hidden', animation: 'reModalIn 0.1s ease' }}>
          {items.map((item, i) => item.divider
            ? <div key={i} style={{ height: 1, background: T.border, margin: '3px 0' }} />
            : <button key={i} onClick={() => { item.onClick(); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: item.danger ? T.red : T.text, textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = item.danger ? T.redLight : T.slateLight}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {item.icon && React.cloneElement(item.icon, { size: 13, color: item.danger ? T.red : T.textSub })}
                {item.label}
              </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state stub
export function Empty({ icon: Icon, title, subtitle, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px' }}>
      {Icon && <div style={{ width: 52, height: 52, borderRadius: 14, background: T.slateLight, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Icon size={22} color={T.textMuted} strokeWidth={1.5} /></div>}
      <p style={{ margin: '0 0 5px', fontSize: 14, fontWeight: 600, color: T.textMid }}>{title}</p>
      {subtitle && <p style={{ margin: '0 0 18px', fontSize: 13, color: T.textSub }}>{subtitle}</p>}
      {action}
    </div>
  );
}

// Compat aliases
export const Btn = Button;
export const Inp = Input;
export const Sel = Select;
export const Ta = Textarea;
export const Fld = FormField;
export const SHead = SectionHeader;
