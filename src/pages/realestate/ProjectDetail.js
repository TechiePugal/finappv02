import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { openDocument } from '../../utils/fileStore';
import {
  getProject, getSites, addSites, updateSite, deleteSite, bulkUpdatePrices,
  getClients, registerClient, updateClient, cancelBooking, transferSite,
  getProjectPayments, recordPayment, deletePayment,
  getExpenses, addExpense, updateExpense, deleteExpense,
  getInvestors, addInvestor, updateInvestor, deleteInvestor, distributeProfit, recordInvestorReturn,
  getDocuments, uploadDocument, deleteDocument,
} from '../../utils/re_firestore';
import {
  fmt, fmtDate, EXP_CATS, PAY_MODES, DOC_TYPES, SITE_STATUS_CFG, SITE_STATUSES, today, INV_TYPES,
} from '../../utils/re_helpers';
import {
  Card, StatCard, Table, Badge, Button, IconBtn, Modal, FormField, Input,
  Select, Textarea, Grid, Alert, Confirm, PageHeader, SectionHeader,
  FilterTabs, SearchBar, InfoRow, T, ProgressBar, Loader, SiteTile, Tabs,
  UploadZone, Divider, KPIRow, ActionMenu, Empty,
} from '../../components/realestate/UI';
import {
  ArrowLeft, ArrowRightLeft, Building2, DollarSign, Download, Edit2,
  FileText, History, MapPin, Plus, RefreshCw, Trash2, TrendingUp,
  UserPlus, Users, Wallet, X, XCircle,
} from 'lucide-react';

// Site value display
function SiteCalc({ size, price }) {
  const val = (parseFloat(size) || 0) * (parseFloat(price) || 0);
  if (!val) return null;
  return (
    <div style={{ background: T.blueLight, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: T.blue, fontWeight: 600, marginTop: 8 }}>
      Sale Value = {fmt(val)}
    </div>
  );
}

export default function ProjectDetail({ project: initP, onBack }) {
  const { user } = useAuth();
  const [proj, setProj] = useState(initP);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [clients, setClients] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [docs, setDocs] = useState([]);

  // Modal states
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [editSiteOpen, setEditSiteOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [editExpOpen, setEditExpOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [editInvOpen, setEditInvOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [priceHistOpen, setPriceHistOpen] = useState(false);
  const [landHistOpen, setLandHistOpen] = useState(false);

  // Selected items
  const [selSite, setSelSite] = useState(null);
  const [selClient, setSelClient] = useState(null);
  const [selExp, setSelExp] = useState(null);
  const [selInv, setSelInv] = useState(null);
  const [delPayId, setDelPayId] = useState(null);
  const [delSiteId, setDelSiteId] = useState(null);
  const [delDocId, setDelDocId] = useState(null);

  // Forms
  const [siteRows, setSiteRows] = useState([{ size: '', pricePerSqft: '', facing: 'East', notes: '' }]);
  const [siteEditForm, setSiteEditForm] = useState({});
  const [bulkPrice, setBulkPrice] = useState('');
  const blankClient = { name: '', phone: '', email: '', address: '', aadhar: '', pan: '', bookedDate: today(), advance: '', advanceMode: 'Cash', advanceRef: '', negotiatedPrice: '', siteStatus: 'Booked', notes: '' };
  const [clientForm, setClientForm] = useState(blankClient);
  const [editClientForm, setEditClientForm] = useState({});
  const [payForm, setPayForm] = useState({ amount: '', date: today(), mode: 'Bank Transfer', reference: '', notes: '' });
  const [expForm, setExpForm] = useState({ category: 'Land Survey', description: '', amount: '', date: today(), mode: 'Bank Transfer', vendor: '', billNo: '' });
  const [editExpForm, setEditExpForm] = useState({});
  const [invForm, setInvForm] = useState({ name: '', phone: '', email: '', amount: '', date: today(), investType: 'Full Project', expectedReturn: '', notes: '' });
  const [editInvForm, setEditInvForm] = useState({});
  const [returnForm, setReturnForm] = useState({ amount: '', date: today(), notes: '' });
  const [newDocType, setNewDocType] = useState('Layout Plan');
  const [newDocFile, setNewDocFile] = useState(null);
  const [transferSiteId, setTransferSiteId] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const flash = (msg, type = 'ok') => {
    if (type === 'ok') setOk(msg); else setErr(msg);
    setTimeout(() => { setOk(''); setErr(''); }, 3000);
  };

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, s, c, pays, exps, invs, d] = await Promise.all([
      getProject(initP.id), getSites(initP.id), getClients(initP.id),
      getProjectPayments(initP.id), getExpenses(initP.id),
      getInvestors(initP.id), getDocuments(initP.id),
    ]);
    setProj(p || initP);
    setSites(s); setClients(c); setPayments(pays);
    setExpenses(exps); setInvestors(invs); setDocs(d);
    setLoading(false);
  }, [initP]);

  useEffect(() => { reload(); }, [reload]);

  // ── SITES ──────────────────────────────────────────────────────────────────
  async function doAddSites() {
    const rows = siteRows.filter(r => r.size && r.pricePerSqft);
    if (!rows.length) { setErr('Add at least one site with size and price.'); return; }
    setSaving(true); setErr('');
    try {
      await addSites(user.uid, proj.id, rows);
      setAddSiteOpen(false);
      setSiteRows([{ size: '', pricePerSqft: '', facing: 'East', notes: '' }]);
      await reload(); flash('Sites added successfully.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  function openEditSite(site) {
    setSelSite(site);
    setSiteEditForm({ size: site.size, pricePerSqft: site.pricePerSqft, facing: site.facing || 'East', status: site.status, notes: site.notes || '', priceNote: '' });
    setErr(''); setEditSiteOpen(true);
  }

  async function doEditSite() {
    setSaving(true); setErr('');
    try { await updateSite(user.uid, proj.id, selSite.id, siteEditForm); setEditSiteOpen(false); await reload(); flash('Site updated.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doBulkPrice() {
    if (!bulkPrice || isNaN(parseFloat(bulkPrice))) { setErr('Enter a valid price.'); return; }
    setSaving(true); setErr('');
    try { await bulkUpdatePrices(user.uid, proj.id, parseFloat(bulkPrice)); setBulkOpen(false); setBulkPrice(''); await reload(); flash('Bulk price updated.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  // ── CLIENTS ────────────────────────────────────────────────────────────────
  async function doRegisterClient() {
    if (!selSite) { setErr('Select an available site first.'); return; }
    if (!clientForm.name || !clientForm.phone) { setErr('Client name and phone required.'); return; }
    setSaving(true); setErr('');
    try {
      const price = clientForm.negotiatedPrice ? parseFloat(clientForm.negotiatedPrice) : selSite.saleValue;
      await registerClient(user.uid, proj.id, selSite.id, { ...clientForm, negotiatedPrice: price });
      setClientOpen(false); setSelSite(null); setClientForm(blankClient);
      await reload(); flash('Client registered successfully.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  function openEditClient(c) {
    setSelClient(c);
    setEditClientForm({ name: c.name, phone: c.phone, email: c.email || '', address: c.address || '', aadhar: c.aadhar || '', pan: c.pan || '', notes: c.notes || '' });
    setErr(''); setEditClientOpen(true);
  }

  async function doEditClient() {
    setSaving(true); setErr('');
    try { await updateClient(user.uid, proj.id, selClient.id, editClientForm); setEditClientOpen(false); await reload(); flash('Client updated.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doCancelBooking() {
    try { await cancelBooking(user.uid, proj.id, selClient.id); setCancelOpen(false); await reload(); flash('Booking cancelled. Site released.'); }
    catch (e) { flash(e.message, 'err'); }
  }

  async function doTransfer() {
    if (!transferSiteId) { setErr('Select a target site.'); return; }
    setSaving(true); setErr('');
    try { await transferSite(user.uid, proj.id, selClient.id, transferSiteId); setTransferOpen(false); await reload(); flash('Site transferred.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  // ── PAYMENTS ───────────────────────────────────────────────────────────────
  async function doRecordPayment() {
    if (!selClient) { setErr('Select a client.'); return; }
    if (!payForm.amount || !payForm.date) { setErr('Amount and date required.'); return; }
    setSaving(true); setErr('');
    try {
      await recordPayment(user.uid, proj.id, selClient.id, payForm);
      setPayOpen(false); setSelClient(null);
      setPayForm({ amount: '', date: today(), mode: 'Bank Transfer', reference: '', notes: '' });
      await reload(); flash('Payment recorded.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doDeletePayment() {
    const pay = payments.find(p => p.id === delPayId);
    if (!pay) return;
    try { await deletePayment(user.uid, proj.id, delPayId, pay.clientId, pay.amount); setDelPayId(null); await reload(); flash('Payment deleted.'); }
    catch (e) { flash(e.message, 'err'); }
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  async function doAddExpense() {
    if (!expForm.category || !expForm.amount || !expForm.date) { setErr('Category, amount and date required.'); return; }
    setSaving(true); setErr('');
    try {
      await addExpense(user.uid, proj.id, expForm);
      setExpOpen(false);
      setExpForm({ category: 'Land Survey', description: '', amount: '', date: today(), mode: 'Bank Transfer', vendor: '', billNo: '' });
      await reload(); flash('Expense added.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  function openEditExp(e) {
    setSelExp(e);
    setEditExpForm({ category: e.category, description: e.description || '', amount: e.amount, date: e.date, mode: e.mode, vendor: e.vendor || '', billNo: e.billNo || '' });
    setErr(''); setEditExpOpen(true);
  }

  async function doEditExp() {
    setSaving(true); setErr('');
    try { await updateExpense(user.uid, proj.id, selExp.id, editExpForm); setEditExpOpen(false); await reload(); flash('Expense updated.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  // ── INVESTORS ──────────────────────────────────────────────────────────────
  async function doAddInvestor() {
    if (!invForm.name || !invForm.amount || !invForm.date) { setErr('Name, amount and date required.'); return; }
    setSaving(true); setErr('');
    try {
      await addInvestor(user.uid, proj.id, invForm);
      setInvOpen(false);
      setInvForm({ name: '', phone: '', email: '', amount: '', date: today(), investType: 'Full Project', expectedReturn: '', notes: '' });
      await reload(); flash('Investor added.');
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  function openEditInv(i) {
    setSelInv(i);
    setEditInvForm({ name: i.name, phone: i.phone || '', email: i.email || '', amount: i.amount, investType: i.investType || 'Full Project', expectedReturn: i.expectedReturn || '', notes: i.notes || '' });
    setErr(''); setEditInvOpen(true);
  }

  async function doEditInv() {
    setSaving(true); setErr('');
    try { await updateInvestor(user.uid, proj.id, selInv.id, editInvForm); setEditInvOpen(false); await reload(); flash('Investor updated.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doDeleteInv() {
    try { await deleteInvestor(user.uid, proj.id, selInv.id); setSelInv(null); await reload(); flash('Investor removed.'); }
    catch (e) { flash(e.message, 'err'); }
  }

  async function doDistribute() {
    try { await distributeProfit(user.uid, proj.id); await reload(); flash('Profit distributed among investors.'); }
    catch (e) { flash(e.message, 'err'); }
  }

  async function doReturn() {
    if (!returnForm.amount || !returnForm.date) { setErr('Amount and date required.'); return; }
    setSaving(true); setErr('');
    try { await recordInvestorReturn(user.uid, proj.id, selInv.id, returnForm); setReturnOpen(false); await reload(); flash('Return recorded.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  // ── DOCUMENTS ──────────────────────────────────────────────────────────────
  async function doUploadDoc() {
    if (!newDocFile) { setErr('Select a file.'); return; }
    setSaving(true); setErr('');
    try { await uploadDocument(user.uid, proj.id, newDocFile, newDocType); setDocOpen(false); setNewDocFile(null); await reload(); flash('Document uploaded.'); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doDeleteDoc() {
    const d = docs.find(x => x.id === delDocId);
    if (!d) return;
    try { await deleteDocument(user.uid, proj.id, delDocId); setDelDocId(null); await reload(); flash('Document deleted.'); }
    catch (e) { flash(e.message, 'err'); }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const netProfit = (proj?.totalRevenue || 0) - (proj?.totalInvestment || 0);
  const totalInvested = investors.reduce((s, i) => s + (i.amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalExpSum = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const filtSites = siteFilter === 'all' ? sites : sites.filter(s => s.status === siteFilter);
  const filtClients = clientFilter === 'all' ? clients : clients.filter(c => c.status === clientFilter);
  const availSites = sites.filter(s => s.status === 'Available' || s.status === 'Reserved');

  // Tabs — use value= (not key=) to match Tabs component
  const TABS = [
    { value: 'overview',   label: 'Overview' },
    { value: 'sites',      label: 'Sites',      count: sites.length },
    { value: 'clients',    label: 'Clients',    count: clients.length },
    { value: 'expenses',   label: 'Expenses',   count: expenses.length },
    { value: 'investors',  label: 'Investors',  count: investors.length },
    { value: 'payments',   label: 'Payments',   count: payments.length },
    { value: 'documents',  label: 'Documents',  count: docs.length },
  ];

  const sitePills = [
    { value: 'all', label: 'All', count: sites.length },
    ...SITE_STATUSES
      .map(st => ({ value: st, label: st, count: sites.filter(s => s.status === st).length }))
      .filter(p => p.count > 0),
  ];

  const clientPills = [
    { value: 'all',       label: 'All',       count: clients.length },
    { value: 'Active',    label: 'Active',    count: clients.filter(c => c.status === 'Active').length },
    { value: 'Completed', label: 'Completed', count: clients.filter(c => c.status === 'Completed').length },
    { value: 'Cancelled', label: 'Cancelled', count: clients.filter(c => c.status === 'Cancelled').length },
  ];

  if (loading) {
    return (
      <>
        <PageHeader title={proj.projectName} onBack={onBack} backLabel="Projects" />
        <Loader text="Loading project data…" />
      </>
    );
  }

  // Row style helpers
  const S = {
    tableHead: { padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    actions: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  };

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={proj.projectName}
        subtitle={`${proj.location}${proj.district ? ', ' + proj.district : ''} · ${proj.lotPrefix} · ${sites.length} sites`}
        onBack={onBack}
        backLabel="Projects"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" icon={UserPlus}
              onClick={() => { setClientOpen(true); setSelSite(null); setErr(''); }}>
              Register Client
            </Button>
          </div>
        }
      />

      {ok && <Alert type="success" onClose={() => setOk('')}>{ok}</Alert>}
      {err && <Alert type="error" onClose={() => setErr('')}>{err}</Alert>}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
            <StatCard label="Total Sites" value={sites.length} icon={MapPin} accent={T.blue}
              sub={`${proj.availableSites || 0} avail · ${proj.bookedSites || 0} booked`} />
            <StatCard label="Total Investment" value={proj.totalInvestment || 0} isCurrency icon={Wallet} accent={T.amber}
              sub={`Land ${fmt(proj.landCost || 0)} + Dev ${fmt(proj.totalExpenses || 0)}`} />
            <StatCard label="Revenue Collected" value={proj.totalRevenue || 0} isCurrency icon={TrendingUp} accent={T.green}
              sub={`Projected: ${fmt(proj.projectedRevenue || 0)}`} />
            <StatCard label="Net Profit / Loss" value={netProfit} isCurrency icon={DollarSign}
              accent={netProfit >= 0 ? T.green : T.red}
              sub={netProfit >= 0 ? 'Profitable' : 'In deficit'} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card>
              <SectionHeader title="Project Details"
                action={<Button variant="outline" size="sm" icon={History} onClick={() => setLandHistOpen(true)}>Land History</Button>} />
              <InfoRow label="Survey Numbers" value={proj.surveyNumbers} />
              <InfoRow label="Total Area" value={proj.totalAcres ? `${proj.totalAcres} Acres` : '—'} />
              <InfoRow label="Location" value={[proj.location, proj.taluk, proj.district, proj.state].filter(Boolean).join(', ')} />
              <InfoRow label="Purchase Date" value={fmtDate(proj.purchaseDate)} />
              <InfoRow label="Seller" value={proj.sellerName} />
              <InfoRow label="Lot Prefix" value={proj.lotPrefix} />
              <InfoRow label="Status" value={<Badge status={proj.status || 'Active'} />} last />
            </Card>

            <Card>
              <SectionHeader title="Financial Summary" />
              <InfoRow label="Land Cost" value={fmt(proj.landCost || 0)} />
              <InfoRow label="Development Expenses" value={fmt(proj.totalExpenses || 0)} />
              <InfoRow label="Total Investment" value={<strong>{fmt(proj.totalInvestment || 0)}</strong>} />
              <Divider />
              <InfoRow label="Projected Revenue" value={fmt(proj.projectedRevenue || 0)} />
              <InfoRow label="Collected Revenue" value={fmt(proj.totalRevenue || 0)} />
              <InfoRow label="Outstanding Balance"
                value={<span style={{ color: T.red }}>{fmt(clients.reduce((s, c) => s + (c.balanceDue || 0), 0))}</span>} />
              <InfoRow label="Investor Funds In" value={fmt(totalInvested)} />
              <InfoRow label="Net Profit / Loss"
                value={<span style={{ color: netProfit >= 0 ? T.green : T.red, fontWeight: 700 }}>{fmt(netProfit)}</span>} last />
            </Card>
          </div>
        </>
      )}

      {/* ══ SITES ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'sites' && (
        <Card noPad>
          <div style={S.tableHead}>
            <FilterTabs tabs={sitePills} active={siteFilter} onChange={setSiteFilter} />
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="outline" size="sm" onClick={() => { setErr(''); setBulkOpen(true); }}>Bulk Price</Button>
              <Button size="sm" icon={Plus} onClick={() => { setErr(''); setAddSiteOpen(true); }}>Add Sites</Button>
            </div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {filtSites.length === 0 ? (
              <Empty icon={MapPin} title="No sites yet"
                subtitle="Add plots and sites to this layout project"
                action={<Button size="sm" icon={Plus} onClick={() => setAddSiteOpen(true)}>Add Sites</Button>} />
            ) : (
              <>
                {/* Legend */}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.textSub, marginBottom: 14 }}>
                  {Object.entries(SITE_STATUS_CFG).map(([k, v]) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, border: `1px solid ${v.dot}`, display: 'inline-block' }} />
                      {k}
                    </span>
                  ))}
                </div>

                {/* Site grid with action overlay */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 10 }}>
                  {filtSites.map(s => (
                    <div key={s.id} style={{ position: 'relative' }}>
                      <SiteTile site={s} onClick={openEditSite} />
                      <div style={{ position: 'absolute', top: 3, right: 3, display: 'flex', gap: 2 }}>
                        <IconBtn icon={Edit2} onClick={() => openEditSite(s)} title="Edit" size={11} />
                        <IconBtn icon={Trash2} onClick={() => setDelSiteId(s.id)} title="Delete" danger size={11} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 20, fontSize: 12.5, color: T.textSub, flexWrap: 'wrap' }}>
                  <span>Total: <strong>{sites.length} sites</strong></span>
                  <span>Projected: <strong style={{ color: T.blue }}>{fmt(sites.reduce((s, p) => s + (p.saleValue || 0), 0))}</strong></span>
                  <span>Avg: <strong>₹{sites.length ? Math.round(sites.reduce((s, p) => s + (p.pricePerSqft || 0), 0) / sites.length).toLocaleString('en-IN') : 0}/sqft</strong></span>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* ══ CLIENTS ═════════════════════════════════════════════════════════ */}
      {activeTab === 'clients' && (
        <Card noPad>
          <div style={S.tableHead}>
            <FilterTabs tabs={clientPills} active={clientFilter} onChange={setClientFilter} />
            <Button size="sm" icon={UserPlus} onClick={() => { setClientOpen(true); setSelSite(null); setErr(''); }}>
              Register Client
            </Button>
          </div>
          <Table
            columns={[
              { header: 'Site', key: 'lotNumber', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: T.blue }}>{v}</span> },
              {
                header: 'Client', key: 'name',
                render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11.5, color: T.textSub }}>{r.phone}{r.email ? ' · ' + r.email : ''}</div></div>
              },
              { header: 'Sale Value', key: 'saleValue', render: v => fmt(v) },
              { header: 'Paid', key: 'totalPaid', render: v => <span style={{ color: T.green, fontWeight: 600 }}>{fmt(v)}</span> },
              { header: 'Balance', key: 'balanceDue', render: v => <span style={{ color: v > 0 ? T.red : T.green, fontWeight: 600 }}>{fmt(v)}</span> },
              { header: 'Status', key: 'status', render: v => <Badge status={v} /> },
              { header: 'Booked', key: 'bookedDate', render: v => fmtDate(v) },
              {
                header: '', key: 'id', align: 'right',
                render: (_, r) => (
                  <div style={S.actions} onClick={e => e.stopPropagation()}>
                    <IconBtn icon={DollarSign} title="Record Payment" onClick={() => {
                      setSelClient(r); setPayForm({ amount: '', date: today(), mode: 'Bank Transfer', reference: '', notes: '' }); setErr(''); setPayOpen(true);
                    }} />
                    <IconBtn icon={Edit2} title="Edit Client" onClick={() => openEditClient(r)} />
                    <IconBtn icon={ArrowRightLeft} title="Transfer Site" onClick={() => { setSelClient(r); setTransferSiteId(''); setErr(''); setTransferOpen(true); }} />
                    <IconBtn icon={XCircle} title="Cancel Booking" onClick={() => { setSelClient(r); setCancelOpen(true); }} danger />
                  </div>
                )
              },
            ]}
            data={filtClients}
            emptyText="No clients registered for this project"
          />
        </Card>
      )}

      {/* ══ EXPENSES ════════════════════════════════════════════════════════ */}
      {activeTab === 'expenses' && (
        <Card noPad>
          <div style={S.tableHead}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Development Expenses</span>
              <span style={{ fontSize: 13, color: T.textSub, marginLeft: 10 }}>Total: {fmt(totalExpSum)}</span>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                Total Investment = Land ({fmt(proj.landCost || 0)}) + Expenses ({fmt(totalExpSum)})
              </div>
            </div>
            <Button size="sm" icon={Plus} onClick={() => {
              setExpForm({ category: 'Land Survey', description: '', amount: '', date: today(), mode: 'Bank Transfer', vendor: '', billNo: '' });
              setErr(''); setExpOpen(true);
            }}>
              Add Expense
            </Button>
          </div>
          <Table
            columns={[
              { header: 'ID', key: 'expenseId', render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
              { header: 'Category', key: 'category' },
              { header: 'Description', key: 'description' },
              { header: 'Vendor', key: 'vendor' },
              { header: 'Amount', key: 'amount', render: v => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
              { header: 'Date', key: 'date', render: v => fmtDate(v) },
              { header: 'Mode', key: 'mode' },
              { header: 'Bill No.', key: 'billNo' },
              {
                header: '', key: 'id', align: 'right',
                render: (_, r) => (
                  <div style={S.actions} onClick={e => e.stopPropagation()}>
                    <IconBtn icon={Edit2} title="Edit" onClick={() => openEditExp(r)} />
                    <IconBtn icon={Trash2} title="Delete" danger
                      onClick={async () => { await deleteExpense(user.uid, proj.id, r.id); await reload(); flash('Expense deleted.'); }} />
                  </div>
                )
              },
            ]}
            data={expenses}
            emptyText="No expenses recorded yet"
          />
        </Card>
      )}

      {/* ══ INVESTORS ═══════════════════════════════════════════════════════ */}
      {activeTab === 'investors' && (
        <Card noPad>
          <div style={S.tableHead}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Investors & Depositors</span>
              <span style={{ fontSize: 13, color: T.textSub, marginLeft: 10 }}>Total Funded: {fmt(totalInvested)}</span>
              <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Profit shared proportionally based on amount invested</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="outline" size="sm" icon={RefreshCw} onClick={doDistribute}>Calc Profit Share</Button>
              <Button size="sm" icon={Plus} onClick={() => {
                setInvForm({ name: '', phone: '', email: '', amount: '', date: today(), investType: 'Full Project', expectedReturn: '', notes: '' });
                setErr(''); setInvOpen(true);
              }}>Add Investor</Button>
            </div>
          </div>
          <Table
            columns={[
              { header: 'ID', key: 'investorId', render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
              {
                header: 'Investor', key: 'name',
                render: (v, r) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11.5, color: T.textSub }}>{r.phone}</div></div>
              },
              { header: 'Type', key: 'investType' },
              { header: 'Invested', key: 'amount', render: v => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
              { header: 'Share %', key: 'sharePercent', render: v => v != null ? `${Number(v).toFixed(1)}%` : '—' },
              { header: 'Profit Share', key: 'profitShare', render: v => v != null ? <span style={{ color: v >= 0 ? T.green : T.red, fontWeight: 600 }}>{fmt(v)}</span> : '—' },
              { header: 'Returned', key: 'amountReturned', render: v => fmt(v || 0) },
              { header: 'Date', key: 'date', render: v => fmtDate(v) },
              {
                header: '', key: 'id', align: 'right',
                render: (_, r) => (
                  <div style={S.actions} onClick={e => e.stopPropagation()}>
                    <IconBtn icon={Edit2} title="Edit" onClick={() => openEditInv(r)} />
                    <IconBtn icon={DollarSign} title="Record Return" onClick={() => { setSelInv(r); setReturnForm({ amount: '', date: today(), notes: '' }); setErr(''); setReturnOpen(true); }} />
                    <IconBtn icon={Trash2} title="Remove" danger onClick={() => { setSelInv(r); doDeleteInv(); }} />
                  </div>
                )
              },
            ]}
            data={investors}
            emptyText="No investors added"
          />
        </Card>
      )}

      {/* ══ PAYMENTS ════════════════════════════════════════════════════════ */}
      {activeTab === 'payments' && (
        <Card noPad>
          <div style={S.tableHead}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Payment History</span>
              <span style={{ fontSize: 13, color: T.textSub, marginLeft: 10 }}>Collected: <span style={{ color: T.green, fontWeight: 600 }}>{fmt(totalPaid)}</span></span>
            </div>
            <Button size="sm" icon={Plus} onClick={() => {
              setSelClient(null); setPayForm({ amount: '', date: today(), mode: 'Bank Transfer', reference: '', notes: '' }); setErr(''); setPayOpen(true);
            }}>Record Payment</Button>
          </div>
          <Table
            columns={[
              { header: 'ID', key: 'paymentId', render: v => <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{v}</span> },
              { header: 'Site', key: 'lotNumber', render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: T.blue }}>{v}</span> },
              { header: 'Client', key: 'clientName' },
              { header: 'Amount', key: 'amount', render: v => <span style={{ color: T.green, fontWeight: 600 }}>{fmt(v)}</span> },
              { header: 'Mode', key: 'mode' },
              { header: 'Reference', key: 'reference' },
              { header: 'Date', key: 'date', render: v => fmtDate(v) },
              { header: 'Notes', key: 'notes' },
              {
                header: '', key: 'id', align: 'right',
                render: (_, r) => (
                  <div style={S.actions} onClick={e => e.stopPropagation()}>
                    <IconBtn icon={Trash2} title="Delete" danger onClick={() => setDelPayId(r.id)} />
                  </div>
                )
              },
            ]}
            data={payments}
            emptyText="No payments recorded"
          />
        </Card>
      )}

      {/* ══ DOCUMENTS ═══════════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <Card noPad>
          <div style={S.tableHead}>
            <span style={{ fontWeight: 700, fontSize: 14, color: T.text }}>Project Documents</span>
            <Button size="sm" icon={Plus} onClick={() => { setNewDocFile(null); setErr(''); setDocOpen(true); }}>Upload</Button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {docs.length === 0 ? (
              <Empty icon={FileText} title="No documents" subtitle="Upload layout plans, approvals, deeds, receipts…"
                action={<Button size="sm" icon={Plus} onClick={() => setDocOpen(true)}>Upload Document</Button>} />
            ) : docs.map(d => (
              <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ width: 40, height: 40, background: T.blueLight, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={18} color={T.blue} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.fileName}</div>
                  <div style={{ fontSize: 12, color: T.textSub }}>{d.docType} · {fmtDate(d.uploadedAt)}</div>
                </div>
                <Button variant="outline" size="sm" icon={Download} onClick={() => openDocument(d.dataUrl || d.url, d.fileName)}>View</Button>
                <IconBtn icon={Trash2} onClick={() => setDelDocId(d.id)} title="Delete" danger />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ══════════════════════ MODALS ══════════════════════════════════════ */}

      {/* ADD SITES */}
      <Modal open={addSiteOpen} onClose={() => setAddSiteOpen(false)} title="Add Sites / Plots" width={760}
        footer={<>
          <Button variant="secondary" onClick={() => setAddSiteOpen(false)}>Cancel</Button>
          <Button loading={saving} onClick={doAddSites}>
            Add {siteRows.filter(r => r.size && r.pricePerSqft).length || ''} Sites
          </Button>
        </>}>
        {err && <Alert type="error">{err}</Alert>}
        <Alert type="info">
          Lot numbers are auto-generated as <strong>{proj.lotPrefix}-001</strong>, <strong>{proj.lotPrefix}-002</strong>… Next: <strong>{proj.lotPrefix}-{String((proj.maxLotSeq || 0) + 1).padStart(3, '0')}</strong>
        </Alert>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.slateLight }}>
                {['#', 'Size (sqft)', 'Price / sqft (₹)', 'Facing', 'Notes', 'Value', ''].map(h => (
                  <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: T.textSub, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {siteRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 10px', color: T.textMuted, fontSize: 12 }}>{(proj.maxLotSeq || 0) + i + 1}</td>
                  <td style={{ padding: '5px 6px' }}>
                    <Input type="number" value={r.size} onChange={e => { const rows = [...siteRows]; rows[i].size = e.target.value; setSiteRows(rows); }} placeholder="1200" style={{ width: 90 }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <Input type="number" value={r.pricePerSqft} onChange={e => { const rows = [...siteRows]; rows[i].pricePerSqft = e.target.value; setSiteRows(rows); }} placeholder="450" style={{ width: 100 }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <Select value={r.facing} onChange={e => { const rows = [...siteRows]; rows[i].facing = e.target.value; setSiteRows(rows); }} style={{ width: 100 }}>
                      {['East', 'West', 'North', 'South', 'NE', 'NW', 'SE', 'SW', 'Corner'].map(f => <option key={f}>{f}</option>)}
                    </Select>
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <Input value={r.notes} onChange={e => { const rows = [...siteRows]; rows[i].notes = e.target.value; setSiteRows(rows); }} placeholder="Optional" style={{ width: 120 }} />
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 12.5, fontWeight: 600, color: T.blue, whiteSpace: 'nowrap' }}>
                    {r.size && r.pricePerSqft ? fmt(parseFloat(r.size) * parseFloat(r.pricePerSqft)) : ''}
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    {siteRows.length > 1 && <IconBtn icon={X} onClick={() => setSiteRows(siteRows.filter((_, j) => j !== i))} title="Remove" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button variant="outline" size="sm" icon={Plus} style={{ marginTop: 10 }}
          onClick={() => setSiteRows([...siteRows, { size: '', pricePerSqft: '', facing: 'East', notes: '' }])}>
          Add Row
        </Button>
      </Modal>

      {/* EDIT SITE */}
      <Modal open={editSiteOpen} onClose={() => setEditSiteOpen(false)} title={`Edit Site — ${selSite?.lotNumber}`} width={500}
        footer={<><Button variant="secondary" onClick={() => setEditSiteOpen(false)}>Cancel</Button><Button loading={saving} onClick={doEditSite}>Save Changes</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        {selSite?.clientName && <Alert type="warning">Booked by <strong>{selSite.clientName}</strong>. Changing price won't auto-update the client's sale value.</Alert>}
        <Grid cols={2}>
          <FormField label="Size (sqft)"><Input type="number" value={siteEditForm.size || ''} onChange={e => setSiteEditForm(p => ({ ...p, size: e.target.value }))} /></FormField>
          <FormField label="Price per sqft (₹)"><Input type="number" value={siteEditForm.pricePerSqft || ''} onChange={e => setSiteEditForm(p => ({ ...p, pricePerSqft: e.target.value }))} /></FormField>
          <FormField label="Facing">
            <Select value={siteEditForm.facing || 'East'} onChange={e => setSiteEditForm(p => ({ ...p, facing: e.target.value }))}>
              {['East', 'West', 'North', 'South', 'NE', 'NW', 'SE', 'SW', 'Corner'].map(f => <option key={f}>{f}</option>)}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={siteEditForm.status || 'Available'} onChange={e => setSiteEditForm(p => ({ ...p, status: e.target.value }))}>
              {SITE_STATUSES.map(s => <option key={s}>{s}</option>)}
            </Select>
          </FormField>
        </Grid>
        <FormField label="Price Change Note (optional)">
          <Input value={siteEditForm.priceNote || ''} onChange={e => setSiteEditForm(p => ({ ...p, priceNote: e.target.value }))} placeholder="e.g. Market rate revision" />
        </FormField>
        <SiteCalc size={siteEditForm.size} price={siteEditForm.pricePerSqft} />
        <div style={{ marginTop: 12 }}>
          <FormField label="Notes"><Textarea value={siteEditForm.notes || ''} onChange={e => setSiteEditForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
        </div>
      </Modal>

      {/* BULK PRICE */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Price Update" width={400}
        footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button loading={saving} onClick={doBulkPrice}>Update Prices</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Alert type="warning">Updates all <strong>Available</strong> and <strong>Reserved</strong> sites. Booked/Registered sites are not affected.</Alert>
        <FormField label="New Price per sqft (₹)" required>
          <Input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} placeholder="e.g. 550" />
        </FormField>
      </Modal>

      {/* REGISTER CLIENT */}
      <Modal open={clientOpen} onClose={() => { setClientOpen(false); setSelSite(null); }} title="Register Client" width={700}
        footer={<><Button variant="secondary" onClick={() => { setClientOpen(false); setSelSite(null); }}>Cancel</Button><Button loading={saving} onClick={doRegisterClient}>Register Client</Button></>}>
        {err && <Alert type="error">{err}</Alert>}

        <SectionHeader title="1. Select Available Site" />
        {!selSite ? (
          availSites.length === 0
            ? <Alert type="warning">No available sites. Add sites first or check status.</Alert>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(105px,1fr))', gap: 9, marginBottom: 16 }}>
              {availSites.map(s => <SiteTile key={s.id} site={s} selected={selSite?.id === s.id} onClick={setSelSite} />)}
            </div>
        ) : (
          <div style={{ background: T.greenLight, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, color: T.green, fontWeight: 500, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>✓ {selSite.lotNumber} · {selSite.size} sqft · {fmt(selSite.saleValue)}</span>
            <button style={{ background: 'none', border: 'none', color: T.green, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }} onClick={() => setSelSite(null)}>Change</button>
          </div>
        )}
        <Divider />

        <SectionHeader title="2. Client Details" />
        <Grid cols={2}>
          <FormField label="Full Name" required><Input value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} placeholder="Client's full name" /></FormField>
          <FormField label="Phone" required><Input value={clientForm.phone} onChange={e => setClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="Mobile number" /></FormField>
          <FormField label="Email"><Input type="email" value={clientForm.email} onChange={e => setClientForm(p => ({ ...p, email: e.target.value }))} /></FormField>
          <FormField label="Booking Date"><Input type="date" value={clientForm.bookedDate} onChange={e => setClientForm(p => ({ ...p, bookedDate: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Address"><Textarea value={clientForm.address} onChange={e => setClientForm(p => ({ ...p, address: e.target.value }))} style={{ minHeight: 56 }} /></FormField>
        <Grid cols={2}>
          <FormField label="Aadhar Number"><Input value={clientForm.aadhar} onChange={e => setClientForm(p => ({ ...p, aadhar: e.target.value }))} placeholder="XXXX XXXX XXXX" /></FormField>
          <FormField label="PAN Number"><Input value={clientForm.pan} onChange={e => setClientForm(p => ({ ...p, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" /></FormField>
        </Grid>
        <Divider />

        <SectionHeader title="3. Sale & Advance" />
        <Grid cols={3}>
          <FormField label="Negotiated Price (₹)" hint="Leave blank to use site value">
            <Input type="number" value={clientForm.negotiatedPrice} onChange={e => setClientForm(p => ({ ...p, negotiatedPrice: e.target.value }))} placeholder={selSite ? String(selSite.saleValue) : ''} />
          </FormField>
          <FormField label="Advance / Token (₹)">
            <Input type="number" value={clientForm.advance} onChange={e => setClientForm(p => ({ ...p, advance: e.target.value }))} placeholder="0" />
          </FormField>
          <FormField label="Booking Status">
            <Select value={clientForm.siteStatus} onChange={e => setClientForm(p => ({ ...p, siteStatus: e.target.value }))}>
              <option>Booked</option><option>Reserved</option><option>Registered</option>
            </Select>
          </FormField>
        </Grid>
        {selSite && clientForm.advance > 0 && (
          <div style={{ background: T.blueLight, borderRadius: 8, padding: '9px 14px', fontSize: 13, color: T.blue, fontWeight: 500, marginBottom: 10 }}>
            Balance due: {fmt((parseFloat(clientForm.negotiatedPrice) || selSite.saleValue) - (parseFloat(clientForm.advance) || 0))}
          </div>
        )}
        <Grid cols={2}>
          <FormField label="Advance Mode">
            <Select value={clientForm.advanceMode} onChange={e => setClientForm(p => ({ ...p, advanceMode: e.target.value }))}>
              {PAY_MODES.map(m => <option key={m}>{m}</option>)}
            </Select>
          </FormField>
          <FormField label="Reference / Cheque No."><Input value={clientForm.advanceRef} onChange={e => setClientForm(p => ({ ...p, advanceRef: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Notes"><Input value={clientForm.notes} onChange={e => setClientForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
      </Modal>

      {/* EDIT CLIENT */}
      <Modal open={editClientOpen} onClose={() => setEditClientOpen(false)} title={`Edit Client — ${selClient?.name}`} width={540}
        footer={<><Button variant="secondary" onClick={() => setEditClientOpen(false)}>Cancel</Button><Button loading={saving} onClick={doEditClient}>Save</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}>
          <FormField label="Full Name"><Input value={editClientForm.name || ''} onChange={e => setEditClientForm(p => ({ ...p, name: e.target.value }))} /></FormField>
          <FormField label="Phone"><Input value={editClientForm.phone || ''} onChange={e => setEditClientForm(p => ({ ...p, phone: e.target.value }))} /></FormField>
          <FormField label="Email"><Input value={editClientForm.email || ''} onChange={e => setEditClientForm(p => ({ ...p, email: e.target.value }))} /></FormField>
          <FormField label="Aadhar"><Input value={editClientForm.aadhar || ''} onChange={e => setEditClientForm(p => ({ ...p, aadhar: e.target.value }))} /></FormField>
          <FormField label="PAN"><Input value={editClientForm.pan || ''} onChange={e => setEditClientForm(p => ({ ...p, pan: e.target.value.toUpperCase() }))} /></FormField>
        </Grid>
        <FormField label="Address"><Textarea value={editClientForm.address || ''} onChange={e => setEditClientForm(p => ({ ...p, address: e.target.value }))} /></FormField>
        <FormField label="Notes"><Input value={editClientForm.notes || ''} onChange={e => setEditClientForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
      </Modal>

      {/* RECORD PAYMENT */}
      <Modal open={payOpen} onClose={() => { setPayOpen(false); setSelClient(null); }} title="Record Payment" width={520}
        footer={<><Button variant="secondary" onClick={() => { setPayOpen(false); setSelClient(null); }}>Cancel</Button><Button variant="success" loading={saving} onClick={doRecordPayment}>Record Payment</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        {!selClient ? (
          <FormField label="Select Client" required>
            <Select value="" onChange={e => setSelClient(clients.find(c => c.id === e.target.value) || null)}>
              <option value="">Choose client…</option>
              {clients.filter(c => c.status !== 'Cancelled').map(c => (
                <option key={c.id} value={c.id}>{c.name} — {c.lotNumber} (Bal: {fmt(c.balanceDue)})</option>
              ))}
            </Select>
          </FormField>
        ) : (
          <div style={{ background: T.greenLight, borderRadius: 9, padding: '10px 14px', fontSize: 13.5, color: T.green, marginBottom: 14, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span><strong>{selClient.name}</strong> — {selClient.lotNumber}</span>
            <span>Paid: <strong>{fmt(selClient.totalPaid || 0)}</strong> | Balance: <strong>{fmt(selClient.balanceDue || 0)}</strong></span>
          </div>
        )}
        <Grid cols={2}>
          <FormField label="Amount (₹)" required><Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></FormField>
          <FormField label="Date" required><Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} /></FormField>
          <FormField label="Mode">
            <Select value={payForm.mode} onChange={e => setPayForm(p => ({ ...p, mode: e.target.value }))}>
              {PAY_MODES.map(m => <option key={m}>{m}</option>)}
            </Select>
          </FormField>
          <FormField label="Reference / Cheque No."><Input value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Notes"><Input value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
      </Modal>

      {/* ADD EXPENSE */}
      <Modal open={expOpen} onClose={() => setExpOpen(false)} title="Add Expense" width={560}
        footer={<><Button variant="secondary" onClick={() => setExpOpen(false)}>Cancel</Button><Button loading={saving} onClick={doAddExpense}>Save Expense</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}>
          <FormField label="Category" required>
            <Select value={expForm.category} onChange={e => setExpForm(p => ({ ...p, category: e.target.value }))}>
              {EXP_CATS.map(c => <option key={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="Amount (₹)" required><Input type="number" value={expForm.amount} onChange={e => setExpForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" /></FormField>
          <FormField label="Date" required><Input type="date" value={expForm.date} onChange={e => setExpForm(p => ({ ...p, date: e.target.value }))} /></FormField>
          <FormField label="Mode">
            <Select value={expForm.mode} onChange={e => setExpForm(p => ({ ...p, mode: e.target.value }))}>
              {PAY_MODES.map(m => <option key={m}>{m}</option>)}
            </Select>
          </FormField>
          <FormField label="Vendor / Contractor"><Input value={expForm.vendor} onChange={e => setExpForm(p => ({ ...p, vendor: e.target.value }))} /></FormField>
          <FormField label="Bill / Receipt No."><Input value={expForm.billNo} onChange={e => setExpForm(p => ({ ...p, billNo: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Description"><Input value={expForm.description} onChange={e => setExpForm(p => ({ ...p, description: e.target.value }))} /></FormField>
      </Modal>

      {/* EDIT EXPENSE */}
      <Modal open={editExpOpen} onClose={() => setEditExpOpen(false)} title="Edit Expense" width={560}
        footer={<><Button variant="secondary" onClick={() => setEditExpOpen(false)}>Cancel</Button><Button loading={saving} onClick={doEditExp}>Save</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}>
          <FormField label="Category">
            <Select value={editExpForm.category || ''} onChange={e => setEditExpForm(p => ({ ...p, category: e.target.value }))}>
              {EXP_CATS.map(c => <option key={c}>{c}</option>)}
            </Select>
          </FormField>
          <FormField label="Amount (₹)"><Input type="number" value={editExpForm.amount || ''} onChange={e => setEditExpForm(p => ({ ...p, amount: e.target.value }))} /></FormField>
          <FormField label="Date"><Input type="date" value={editExpForm.date || ''} onChange={e => setEditExpForm(p => ({ ...p, date: e.target.value }))} /></FormField>
          <FormField label="Mode">
            <Select value={editExpForm.mode || 'Bank Transfer'} onChange={e => setEditExpForm(p => ({ ...p, mode: e.target.value }))}>
              {PAY_MODES.map(m => <option key={m}>{m}</option>)}
            </Select>
          </FormField>
          <FormField label="Vendor"><Input value={editExpForm.vendor || ''} onChange={e => setEditExpForm(p => ({ ...p, vendor: e.target.value }))} /></FormField>
          <FormField label="Bill No."><Input value={editExpForm.billNo || ''} onChange={e => setEditExpForm(p => ({ ...p, billNo: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Description"><Input value={editExpForm.description || ''} onChange={e => setEditExpForm(p => ({ ...p, description: e.target.value }))} /></FormField>
      </Modal>

      {/* ADD INVESTOR */}
      <Modal open={invOpen} onClose={() => setInvOpen(false)} title="Add Investor / Depositor" width={560}
        footer={<><Button variant="secondary" onClick={() => setInvOpen(false)}>Cancel</Button><Button loading={saving} onClick={doAddInvestor}>Add Investor</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Alert type="info">Investors fund the project. Profit share = (Their Amount / Total Invested) × Net Profit.</Alert>
        <Grid cols={2}>
          <FormField label="Investor Name" required><Input value={invForm.name} onChange={e => setInvForm(p => ({ ...p, name: e.target.value }))} /></FormField>
          <FormField label="Phone"><Input value={invForm.phone} onChange={e => setInvForm(p => ({ ...p, phone: e.target.value }))} /></FormField>
          <FormField label="Amount Invested (₹)" required><Input type="number" value={invForm.amount} onChange={e => setInvForm(p => ({ ...p, amount: e.target.value }))} /></FormField>
          <FormField label="Investment Date" required><Input type="date" value={invForm.date} onChange={e => setInvForm(p => ({ ...p, date: e.target.value }))} /></FormField>
          <FormField label="Investment Type">
            <Select value={invForm.investType} onChange={e => setInvForm(p => ({ ...p, investType: e.target.value }))}>
              {INV_TYPES.map(t => <option key={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Expected Return (%)" hint="Annual or overall"><Input type="number" value={invForm.expectedReturn} onChange={e => setInvForm(p => ({ ...p, expectedReturn: e.target.value }))} placeholder="e.g. 20" /></FormField>
        </Grid>
        {invForm.amount && (
          <div style={{ background: T.blueLight, borderRadius: 8, padding: '8px 14px', fontSize: 13, color: T.blue, fontWeight: 500, margin: '8px 0' }}>
            Share if invested: {totalInvested > 0 ? ((parseFloat(invForm.amount) / (totalInvested + parseFloat(invForm.amount))) * 100).toFixed(1) : 100}%
          </div>
        )}
        <FormField label="Notes / Terms"><Textarea value={invForm.notes} onChange={e => setInvForm(p => ({ ...p, notes: e.target.value }))} placeholder="Terms, conditions, payment schedule…" /></FormField>
      </Modal>

      {/* EDIT INVESTOR */}
      <Modal open={editInvOpen} onClose={() => setEditInvOpen(false)} title={`Edit Investor — ${selInv?.name}`} width={520}
        footer={<><Button variant="secondary" onClick={() => setEditInvOpen(false)}>Cancel</Button><Button loading={saving} onClick={doEditInv}>Save</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}>
          <FormField label="Name"><Input value={editInvForm.name || ''} onChange={e => setEditInvForm(p => ({ ...p, name: e.target.value }))} /></FormField>
          <FormField label="Phone"><Input value={editInvForm.phone || ''} onChange={e => setEditInvForm(p => ({ ...p, phone: e.target.value }))} /></FormField>
          <FormField label="Amount (₹)"><Input type="number" value={editInvForm.amount || ''} onChange={e => setEditInvForm(p => ({ ...p, amount: e.target.value }))} /></FormField>
          <FormField label="Expected Return %"><Input type="number" value={editInvForm.expectedReturn || ''} onChange={e => setEditInvForm(p => ({ ...p, expectedReturn: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Type">
          <Select value={editInvForm.investType || 'Full Project'} onChange={e => setEditInvForm(p => ({ ...p, investType: e.target.value }))}>
            {INV_TYPES.map(t => <option key={t}>{t}</option>)}
          </Select>
        </FormField>
        <FormField label="Notes"><Textarea value={editInvForm.notes || ''} onChange={e => setEditInvForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
      </Modal>

      {/* RECORD INVESTOR RETURN */}
      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title={`Record Return — ${selInv?.name}`} width={420}
        footer={<><Button variant="secondary" onClick={() => setReturnOpen(false)}>Cancel</Button><Button variant="success" loading={saving} onClick={doReturn}>Record Return</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        {selInv && <Alert type="info">Invested: {fmt(selInv.amount || 0)} · Profit Share: {fmt(selInv.profitShare || 0)} · Already Returned: {fmt(selInv.amountReturned || 0)}</Alert>}
        <Grid cols={2}>
          <FormField label="Amount Returned (₹)" required><Input type="number" value={returnForm.amount} onChange={e => setReturnForm(p => ({ ...p, amount: e.target.value }))} /></FormField>
          <FormField label="Date" required><Input type="date" value={returnForm.date} onChange={e => setReturnForm(p => ({ ...p, date: e.target.value }))} /></FormField>
        </Grid>
        <FormField label="Notes"><Input value={returnForm.notes} onChange={e => setReturnForm(p => ({ ...p, notes: e.target.value }))} /></FormField>
      </Modal>

      {/* DOCUMENT UPLOAD */}
      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Upload Document" width={440}
        footer={<><Button variant="secondary" onClick={() => setDocOpen(false)}>Cancel</Button><Button loading={saving} disabled={!newDocFile} onClick={doUploadDoc}>Upload</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <FormField label="Document Type">
          <Select value={newDocType} onChange={e => setNewDocType(e.target.value)}>
            {DOC_TYPES.map(d => <option key={d}>{d}</option>)}
          </Select>
        </FormField>
        <div style={{ marginTop: 12 }}>
          <FormField label="File">
            <UploadZone onFile={setNewDocFile} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" label="Upload PDF, Image or Document" current={newDocFile?.name} />
          </FormField>
        </div>
      </Modal>

      {/* TRANSFER SITE */}
      <Modal open={transferOpen} onClose={() => setTransferOpen(false)} title="Transfer Site" width={440}
        footer={<><Button variant="secondary" onClick={() => setTransferOpen(false)}>Cancel</Button><Button loading={saving} onClick={doTransfer}>Transfer</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Alert type="info">Moving <strong>{selClient?.name}</strong> from <strong>{selClient?.lotNumber}</strong> to a different available site.</Alert>
        <FormField label="Select New Site" required>
          <Select value={transferSiteId} onChange={e => setTransferSiteId(e.target.value)}>
            <option value="">Choose site…</option>
            {sites.filter(s => !s.clientId && s.status === 'Available' && s.id !== selClient?.siteId).map(s => (
              <option key={s.id} value={s.id}>{s.lotNumber} — {s.size} sqft — {fmt(s.saleValue)}</option>
            ))}
          </Select>
        </FormField>
      </Modal>

      {/* PRICE HISTORY */}
      <Modal open={priceHistOpen} onClose={() => setPriceHistOpen(false)} title={`Price History — ${selSite?.lotNumber}`} width={440}>
        {!(selSite?.priceHistory?.length)
          ? <p style={{ color: T.textSub, fontSize: 13 }}>No price history available.</p>
          : selSite.priceHistory.map((h, i) => (
            <InfoRow key={i} label={fmtDate(h.ts)} value={`₹${Number(h.price || 0).toLocaleString('en-IN')}/sqft — ${h.note || '—'}`} last={i === selSite.priceHistory.length - 1} />
          ))}
      </Modal>

      {/* LAND COST HISTORY */}
      <Modal open={landHistOpen} onClose={() => setLandHistOpen(false)} title="Land Cost History" width={440}>
        {!(proj?.landCostHistory?.length)
          ? <p style={{ color: T.textSub, fontSize: 13 }}>No history available.</p>
          : proj.landCostHistory.map((h, i) => (
            <InfoRow key={i} label={fmtDate(h.date || h.ts)} value={`${fmt(h.amount)} — ${h.note || '—'}`} last={i === proj.landCostHistory.length - 1} />
          ))}
      </Modal>

      {/* CONFIRM DELETES */}
      <Confirm open={!!delSiteId} onClose={() => setDelSiteId(null)} onConfirm={async () => {
        try { await deleteSite(user.uid, proj.id, delSiteId); await reload(); flash('Site deleted.'); }
        catch (e) { flash(e.message, 'err'); } finally { setDelSiteId(null); }
      }} title="Delete Site" danger confirmLabel="Delete Site"
        message="Delete this site? This cannot be undone. The site must have no registered client." />

      <Confirm open={!!delPayId} onClose={() => setDelPayId(null)} onConfirm={doDeletePayment}
        title="Delete Payment" danger confirmLabel="Delete"
        message="Delete this payment? The client's balance will be reversed accordingly." />

      <Confirm open={!!delDocId} onClose={() => setDelDocId(null)} onConfirm={doDeleteDoc}
        title="Delete Document" danger confirmLabel="Delete"
        message="Delete this document? This cannot be undone." />

      <Confirm open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={doCancelBooking}
        title="Cancel Booking" danger confirmLabel="Cancel Booking"
        message={`Cancel booking for ${selClient?.name} (${selClient?.lotNumber})? The site will be released back to Available. Payments already made are NOT auto-refunded.`} />
    </>
  );
}
