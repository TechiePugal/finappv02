// src/pages/Settings.js
import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Shield, Lock, Clock, Building2, FileText, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getSettings, saveSettings, getAuditLog } from '../../utils/cf_firestore';
import { formatDate } from '../../utils/cf_format';
import { Card, PageHeader, SectionHeader, FormField, Input, Select, Toggle, Button, Alert, Loader, Table, Badge, InfoRow, tokens } from '../../components/chitfund/UI';
import { PageLoader } from '../../components/Skeleton';

const ACTION_COLORS = {
  CREATE: { color: tokens.green, bg: tokens.greenLight },
  UPDATE: { color: tokens.blue, bg: tokens.blueLight },
  DELETE: { color: tokens.red, bg: tokens.redLight },
  PROCESS: { color: '#5521B5', bg: '#EDEBFF' },
  LOGIN:  { color: tokens.amber, bg: tokens.amberLight },
};

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [tab, setTab] = useState('company');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getSettings(user.uid),
      getAuditLog(user.uid, 100),
    ]).then(([s, log]) => {
      setSettings(s);
      setForm({ ...s });
      setAuditLog(log);
      setLoading(false);
      setAuditLoading(false);
    });
  }, [user]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setError(''); setSuccess('');
    setSaving(true);
    try {
      await saveSettings(user.uid, form);
      setSuccess('Settings saved successfully.');
      setSettings(form);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const auditCols = [
    {
      key: 'action', header: 'Action', render: v => {
        const c = ACTION_COLORS[v] || { color: tokens.textSub, bg: tokens.slateLight };
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, fontSize: 11, fontWeight: 700 }}>{v}</span>;
      }
    },
    { key: 'entityType', header: 'Entity', render: v => <span style={{ textTransform: 'capitalize', fontSize: 12, color: tokens.textMid }}>{v}</span> },
    { key: 'details', header: 'Details', render: v => <span style={{ fontSize: 12, color: tokens.textSub, maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v)}</span> },
    { key: 'createdAt', header: 'Time', render: v => formatDate(v) },
  ];

  const TABS = [
    { value: 'company', label: 'Company & Defaults', icon: Building2 },
    { value: 'fiscal', label: 'Financial Year', icon: Lock },
    { value: 'audit', label: 'Audit Log', icon: Shield },
  ];

  if (loading) return <Loader text="Loading settings…" />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company configuration, financial year controls, and audit trail" />

      {/* Tab nav */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${tokens.border}`, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderBottom: `2px solid ${tab === t.value ? tokens.blue : 'transparent'}`, background: 'transparent', color: tab === t.value ? tokens.blue : tokens.textSub, fontSize: 13, fontWeight: tab === t.value ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: -1 }}>
            <t.icon size={13} strokeWidth={2} /> {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginBottom: 14 }}><Alert type="error" message={error} onClose={() => setError('')} /></div>}
      {success && <div style={{ marginBottom: 14 }}><Alert type="success" message={success} onClose={() => setSuccess('')} /></div>}

      {/* Company & Defaults */}
      {tab === 'company' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card>
            <SectionHeader title="Company Information" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <FormField label="Company Name">
                <Input value={form.companyName || ''} onChange={e => setF('companyName', e.target.value)} placeholder="Your company name" />
              </FormField>
              <FormField label="Default Branch">
                <Input value={form.branch || ''} onChange={e => setF('branch', e.target.value)} placeholder="Head Office" />
              </FormField>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Default Values for New Chits" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <FormField label="Default Manager Commission (%)" hint="Pre-filled when creating new chit funds">
                <Input type="number" step="0.01" value={form.defaultManagerCommission || 5} onChange={e => setF('defaultManagerCommission', +e.target.value)} suffix="%" />
              </FormField>
              <FormField label="Default Auction Interval (Months)">
                <Input type="number" value={form.defaultInterval || 1} onChange={e => setF('defaultInterval', +e.target.value)} suffix="mo" />
              </FormField>
              <FormField label="Decimal Precision" hint="Number of decimal places for calculations (2–4)">
                <Select value={form.decimalPrecision || 2} onChange={e => setF('decimalPrecision', +e.target.value)}>
                  <option value={2}>2 decimal places</option>
                  <option value={3}>3 decimal places</option>
                  <option value={4}>4 decimal places</option>
                </Select>
              </FormField>
            </div>
          </Card>
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSave} loading={saving}>Save Settings</Button>
          </div>
        </div>
      )}

      {/* Financial Year */}
      {tab === 'fiscal' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card>
            <SectionHeader title="Financial Year Configuration" sub="Controls which period is active for processing" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FormField label="Financial Year Starts In" hint="Month when your financial year begins">
                <Select value={form.financialYearStart || '04'} onChange={e => setF('financialYearStart', e.target.value)}>
                  {[['01','January'],['02','February'],['03','March'],['04','April (Default)'],
                    ['07','July'],['10','October']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </FormField>
              <FormField label="Lock Up To Date" hint="Auctions dated on or before this date cannot be edited">
                <Input type="date" value={form.lockedUpTo || ''} onChange={e => setF('lockedUpTo', e.target.value)} />
              </FormField>
              <Toggle
                checked={form.financialYearLocked || false}
                onChange={v => setF('financialYearLocked', v)}
                label="Lock Financial Year (no further processing allowed)"
              />
              {form.financialYearLocked && (
                <Alert type="warning" message="Financial year is locked. No auction processing, edits, or deletions will be allowed until unlocked." />
              )}
            </div>
          </Card>
          <Card>
            <SectionHeader title="Current Status" />
            <InfoRow label="Financial Year Start" value={form.financialYearStart === '04' ? 'April' : `Month ${form.financialYearStart}`} />
            <InfoRow label="Locked Up To" value={form.lockedUpTo ? formatDate(new Date(form.lockedUpTo)) : 'Not set'} />
            <InfoRow label="Lock Status" value={
              <Badge status={form.financialYearLocked ? 'Closed' : 'Active'}>
                {form.financialYearLocked ? 'Locked' : 'Open'}
              </Badge>
            } last />
            {form.financialYearLocked && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: tokens.redLight, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={14} color={tokens.red} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: tokens.red, fontWeight: 500 }}>All chit funds are currently locked. Toggle off to resume processing.</span>
              </div>
            )}
          </Card>
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSave} loading={saving}>Save Settings</Button>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {tab === 'audit' && (
        <Card noPad>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${tokens.border}` }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Audit Trail</h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: tokens.textSub }}>All create, update, delete, and process actions are recorded here</p>
          </div>
          {auditLoading ? <Loader text="Loading audit log…" /> : auditLog.length > 0
            ? <Table columns={auditCols} data={auditLog} />
            : <div style={{ padding: '40px 24px', textAlign: 'center', color: tokens.textSub, fontSize: 13 }}>No audit entries yet. Actions will appear here as you use the system.</div>
          }
        </Card>
      )}
    </div>
  );
}
