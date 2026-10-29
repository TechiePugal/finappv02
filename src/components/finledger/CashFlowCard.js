import React from 'react';
import {Card, formatCurrency} from './UI';
import {FLOW_GREEN, FLOW_RED} from '../../utils/cashFlow';

// Shared "Total Cash Flow" breakdown — Money IN (+ green) on the left, Money OUT
// (− red) on the right, net underneath. Used by the Overall + Monthly dashboards
// and (as a compact summary) the Journal, so the same money always reads the
// same way everywhere. `flow` is the object returned by computeCashFlow /
// summarizeLedger in utils/cashFlow.js.
function Col({heading, lines, total, color, sign, bg, money}){
  return (
    <div style={{flex:'1 1 280px',minWidth:0,borderRadius:12,background:bg,border:`1px solid ${color}33`,padding:'14px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10,gap:8}}>
        <span style={{fontSize:12,fontWeight:800,color,textTransform:'uppercase',letterSpacing:'.05em'}}>{heading}</span>
        <span className="num" style={{fontSize:20,fontWeight:900,color,letterSpacing:'-0.02em'}}>{sign}{money(total)}</span>
      </div>
      <div style={{display:'grid',gap:2}}>
        {lines.map(l=>(
          <div key={l.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,padding:'6px 0',borderTop:'1px solid rgba(0,0,0,0.05)',opacity:l.amount?1:0.5}}>
            <span style={{fontSize:13,color:'var(--text-primary)'}}>{l.label}</span>
            <span className="num" style={{fontSize:13.5,fontWeight:700,color:l.amount?color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>{l.amount?sign:''}{money(l.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CashFlowCard({title='Total Cash Flow', subtitle, flow, style, note}){
  const f = flow || {inLines:[],outLines:[],totalIn:0,totalOut:0,net:0};
  const net = f.net || 0;
  const money = n => formatCurrency(Math.round(Math.abs(n||0)));
  return (
    <Card style={style}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12,marginBottom:14}}>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:'var(--text-primary)'}}>{title}</div>
          {subtitle&&<div style={{fontSize:12,color:'var(--text-secondary)',marginTop:3,maxWidth:560}}>{subtitle}</div>}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.05em'}}>Net cash flow</div>
          <div className="num" style={{fontSize:26,fontWeight:900,color:net>=0?FLOW_GREEN:FLOW_RED,letterSpacing:'-0.03em',lineHeight:1.1}}>{net>=0?'+':'−'}{money(net)}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        <Col heading="Money In" lines={f.inLines} total={f.totalIn} color={FLOW_GREEN} sign="+" bg="rgba(52,199,89,0.05)" money={money}/>
        <Col heading="Money Out" lines={f.outLines} total={f.totalOut} color={FLOW_RED} sign="−" bg="rgba(255,59,48,0.05)" money={money}/>
      </div>
      <div style={{marginTop:12,fontSize:12,color:'var(--text-secondary)'}}>
        <strong style={{color:FLOW_GREEN}}>+{money(f.totalIn)}</strong> in <span style={{color:'var(--text-tertiary)'}}>−</span> <strong style={{color:FLOW_RED}}>{money(f.totalOut)}</strong> out <span style={{color:'var(--text-tertiary)'}}>=</span> <strong style={{color:net>=0?FLOW_GREEN:FLOW_RED}}>{net>=0?'+':'−'}{money(net)}</strong>
        {note&&<span style={{display:'block',marginTop:4,color:'var(--text-tertiary)'}}>{note}</span>}
      </div>
    </Card>
  );
}
