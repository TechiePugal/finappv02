// Land Unit & Money Calculator — converts between Acre / Cent / Sq Ft / Sq Yard /
// Ground, and computes total value at a given rate. Common everyday tool for
// Indian real estate deals where land is quoted in different units depending
// on region and context.
import React, { useState } from 'react';
import { PageHeader, Card, SectionHeader } from '../../components/realestate/UI';

// All conversions anchored to Square Feet (the most granular common unit)
const UNITS = {
  sqft:  { label: 'Square Feet', toSqft: 1 },
  sqyard:{ label: 'Square Yard', toSqft: 9 },
  cent:  { label: 'Cent',        toSqft: 435.6 },
  ground:{ label: 'Ground',      toSqft: 2400 },
  acre:  { label: 'Acre',        toSqft: 43560 },
  hectare:{ label: 'Hectare',    toSqft: 107639 },
};

const T = { text: '#000', sub: '#8E8E93', border: 'rgba(0,0,0,0.08)', accent: '#0d9488', bg: '#F2F2F7' };

export default function Calculator() {
  const [amount, setAmount] = useState('1');
  const [fromUnit, setFromUnit] = useState('cent');
  const [rate, setRate] = useState('');
  const [rateUnit, setRateUnit] = useState('sqft');

  const amtNum = parseFloat(amount) || 0;
  const sqft = amtNum * (UNITS[fromUnit]?.toSqft || 1);

  const rateNum = parseFloat(rate) || 0;
  const rateSqftEquivalent = rateNum / (UNITS[rateUnit]?.toSqft || 1); // price per 1 sqft
  const totalValue = sqft * rateSqftEquivalent;

  function fmtINR(v) {
    if (!isFinite(v)) return '₹0';
    return '₹' + Math.round(v).toLocaleString('en-IN');
  }

  return (
    <>
      <PageHeader title="Land Calculator" subtitle="Convert between Acre, Cent, Sq Ft and more — with instant money calculation" />
      <div className="page fade-in" style={{ maxWidth: 720 }}>

        {/* Unit conversion card */}
        <Card style={{ marginBottom: 18 }}>
          <SectionHeader title="Unit Conversion" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width: 120, height: 42, padding: '0 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
            <select value={fromUnit} onChange={e => setFromUnit(e.target.value)}
              style={{ height: 42, padding: '0 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
              {Object.entries(UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
            </select>
            <span style={{ fontSize: 14, color: T.sub }}>equals</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
            {Object.entries(UNITS).map(([k, u]) => {
              const val = sqft / u.toSqft;
              const isSource = k === fromUnit;
              return (
                <div key={k} style={{ padding: '12px 14px', borderRadius: 12, background: isSource ? `${T.accent}12` : T.bg, border: `1px solid ${isSource ? T.accent + '40' : 'transparent'}` }}>
                  <div style={{ fontSize: 11, color: T.sub, fontWeight: 600, marginBottom: 4 }}>{u.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: isSource ? T.accent : T.text }}>
                    {val.toLocaleString('en-IN', { maximumFractionDigits: val < 10 ? 4 : 2 })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Money calculation card */}
        <Card>
          <SectionHeader title="Money Calculation" sub="Enter a rate to see the total value for the area above" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: T.sub }}>Rate: ₹</span>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} placeholder="0"
              style={{ width: 140, height: 42, padding: '0 14px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', outline: 'none' }} />
            <span style={{ fontSize: 14, color: T.sub }}>per</span>
            <select value={rateUnit} onChange={e => setRateUnit(e.target.value)}
              style={{ height: 42, padding: '0 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}>
              {Object.entries(UNITS).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
            </select>
          </div>

          <div style={{ padding: '20px 22px', borderRadius: 14, background: `linear-gradient(135deg,${T.accent}18,${T.accent}08)`, border: `1px solid ${T.accent}30` }}>
            <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 6 }}>Total Value</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: T.accent, letterSpacing: '-0.5px' }}>{fmtINR(totalValue)}</div>
            <div style={{ fontSize: 12, color: T.sub, marginTop: 8 }}>
              {amtNum || 0} {UNITS[fromUnit]?.label} ({sqft.toLocaleString('en-IN', { maximumFractionDigits: 0 })} sq ft) × ₹{rateNum || 0}/{UNITS[rateUnit]?.label}
            </div>
          </div>
        </Card>

        <div style={{ marginTop: 16, fontSize: 11.5, color: T.sub, lineHeight: 1.6 }}>
          Reference: 1 Acre = 43,560 sq ft · 1 Cent = 435.6 sq ft · 1 Ground = 2,400 sq ft · 1 Sq Yard = 9 sq ft · 1 Hectare = 1,07,639 sq ft.
          These are standard conversions; always confirm local/regional variations before finalizing a deal.
        </div>
      </div>
    </>
  );
}
