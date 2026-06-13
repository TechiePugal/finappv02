import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getProjects, createProject, updateProject, deleteProject } from '../../utils/re_firestore';
import { fmt, holdingStr, today, SITE_STATUSES } from '../../utils/re_helpers';
import {
  Card, StatCard, Table, Badge, Button, IconBtn, Modal, FormField,
  Input, Select, Textarea, Grid, Alert, Confirm, PageHeader, SectionHeader,
  FilterTabs, SearchBar, InfoRow, T
} from '../../components/realestate/UI';
import { Building2, Plus, Edit2, Trash2, Eye, TrendingUp, MapPin, Wallet, DollarSign, History, ChevronRight } from 'lucide-react';

const BLANK = { projectName:'',location:'',taluk:'',district:'',state:'Tamil Nadu',surveyNumbers:'',totalAcres:'',lotPrefix:'',landCost:'',purchaseDate:'',sellerName:'',notes:'',amountRequired:'',initialInvestment:'',investorName:'' };
const ACRE_TO_SQFT = 43560;
const STATES = ['Tamil Nadu','Karnataka','Kerala','Andhra Pradesh','Telangana','Maharashtra','Goa','Other'];

export default function ProjectsPage({ onView }) {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [landOpen, setLandOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [target, setTarget] = useState(null);

  // Forms
  const [form, setForm] = useState(BLANK);
  const [editForm, setEditForm] = useState({});
  const [landForm, setLandForm] = useState({ landCost:'', date: today(), note:'' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setProjects(await getProjects(user.uid));
    setLoading(false);
  }, [user.uid]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function doAdd() {
    if (!form.projectName || !form.location || !form.landCost || !form.purchaseDate) { setErr('Project name, location, land cost and date are required.'); return; }
    if (!form.initialInvestment || parseFloat(form.initialInvestment) <= 0) { setErr('Initial investment is required — a project is only created once money is invested into it.'); return; }
    setSaving(true); setErr('');
    try {
      const prefix = form.lotPrefix || form.projectName.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '').padEnd(3, 'X');
      const totalSqft = form.totalAcres ? Math.round(parseFloat(form.totalAcres) * ACRE_TO_SQFT) : 0;
      await createProject(user.uid, { ...form, lotPrefix: prefix, landCost: parseFloat(form.landCost) || 0, amountRequired: parseFloat(form.amountRequired) || 0, initialInvestment: parseFloat(form.initialInvestment) || 0, investorName: form.investorName || '', totalSqft });
      setAddOpen(false); setForm(BLANK); await load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doEdit() {
    setSaving(true); setErr('');
    try { await updateProject(user.uid, target.id, editForm); setEditOpen(false); await load(); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doLandCost() {
    if (!landForm.landCost) { setErr('Enter new land cost.'); return; }
    setSaving(true); setErr('');
    try {
      await updateProject(user.uid, target.id, { landCost: parseFloat(landForm.landCost), landCostDate: landForm.date, landCostNote: landForm.note || 'Updated' });
      setLandOpen(false); await load();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  async function doDelete() {
    await deleteProject(user.uid, target.id);
    await load();
  }

  function openEdit(p) { setTarget(p); setEditForm({ projectName: p.projectName, location: p.location, taluk: p.taluk||'', district: p.district||'', state: p.state||'Tamil Nadu', surveyNumbers: p.surveyNumbers||'', totalAcres: p.totalAcres||'', sellerName: p.sellerName||'', notes: p.notes||'', status: p.status||'Active' }); setErr(''); setEditOpen(true); }
  function openLand(p) { setTarget(p); setLandForm({ landCost: p.landCost, date: today(), note: '' }); setErr(''); setLandOpen(true); }
  function openHist(p) { setTarget(p); setHistOpen(true); }
  function openDel(p) { setTarget(p); setDelOpen(true); }

  const filtered = projects.filter(p => {
    const mf = filter === 'all' || p.status === filter;
    const ms = !search || p.projectName?.toLowerCase().includes(search.toLowerCase()) || p.location?.toLowerCase().includes(search.toLowerCase());
    return mf && ms;
  });

  const totInv = projects.reduce((s, p) => s + (p.totalInvestment || 0), 0);
  const totRev = projects.reduce((s, p) => s + (p.totalRevenue || 0), 0);
  const totSites = projects.reduce((s, p) => s + (p.totalSites || 0), 0);

  const columns = [
    {
      header: 'Project', key: 'projectName',
      render: (v, r) => (
        <div>
          <p style={{ margin: 0, fontWeight: 600, color: T.text, fontSize: 13 }}>{v}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: T.textSub }}>{r.location}{r.district ? `, ${r.district}` : ''}</p>
        </div>
      )
    },
    {
      header: 'Sites', key: 'totalSites',
      render: (v, r) => (
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{v || 0}</p>
          <p style={{ margin: '1px 0 0', fontSize: 11, color: T.textSub }}>{r.availableSites || 0} avail · {r.bookedSites || 0} booked</p>
        </div>
      )
    },
    { header: 'Land Cost', key: 'landCost', render: v => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
    { header: 'Total Invested', key: 'totalInvestment', render: v => fmt(v) },
    { header: 'Revenue', key: 'totalRevenue', render: v => <span style={{ color: T.green, fontWeight: 600 }}>{fmt(v)}</span> },
    {
      header: 'P & L', key: 'totalRevenue',
      render: (v, r) => { const p = (v || 0) - (r.totalInvestment || 0); return <span style={{ color: p >= 0 ? T.green : T.red, fontWeight: 600 }}>{fmt(p)}</span>; }
    },
    { header: 'Holding', key: 'purchaseDate', render: v => holdingStr(v) },
    { header: 'Status', key: 'status', render: v => <Badge status={v || 'Active'}>{v || 'Active'}</Badge> },
    {
      header: 'Actions', key: 'id', align: 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <IconBtn icon={Eye} onClick={() => onView(r)} title="View Details" />
          <IconBtn icon={Edit2} onClick={() => openEdit(r)} title="Edit Project" />
          <IconBtn icon={DollarSign} onClick={() => openLand(r)} title="Update Land Cost" />
          <IconBtn icon={History} onClick={() => openHist(r)} title="Land Cost History" />
          <IconBtn icon={Trash2} onClick={() => openDel(r)} title="Delete Project" danger />
        </div>
      )
    },
  ];

  return (
    <div className="page-enter">
      <PageHeader title="Layout Projects" subtitle={`${projects.length} projects · ${totSites} total sites`}
        action={<Button icon={Plus} onClick={() => { setForm(BLANK); setErr(''); setAddOpen(true); }}>New Project</Button>} />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard label="Total Projects" value={projects.length} icon={Building2} accent={T.blue} />
        <StatCard label="Total Sites" value={totSites} icon={MapPin} accent={T.blue} />
        <StatCard label="Total Invested" value={totInv} isCurrency icon={Wallet} accent={T.amber} />
        <StatCard label="Total Revenue" value={totRev} isCurrency icon={TrendingUp} accent={T.green} />
      </div>

      {/* Table */}
      <Card noPad>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search projects…" />
          <FilterTabs active={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'Active', label: 'Active' }, { value: 'Completed', label: 'Completed' }, { value: 'On Hold', label: 'On Hold' }]} />
          <div style={{ marginLeft: 'auto' }}>
            <Button size="sm" icon={Plus} onClick={() => { setForm(BLANK); setErr(''); setAddOpen(true); }}>New Project</Button>
          </div>
        </div>
        <Table columns={columns} data={filtered} onRowClick={onView} loading={loading} emptyText="No projects yet. Create your first layout project." />
      </Card>

      {/* ── ADD PROJECT MODAL ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create New Layout Project" width={720}
        footer={<><Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button><Button loading={saving} onClick={doAdd}>Create Project</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}><FormField label="Project Name" required><Input value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Green Meadows Layout" /></FormField>
        <FormField label="Lot Prefix" hint="Used for lot numbers e.g. GML-001"><Input value={form.lotPrefix} onChange={e => set('lotPrefix', e.target.value.toUpperCase())} placeholder="GML" maxLength={6} /></FormField></Grid>
        <Grid cols={2}><FormField label="Location / Village" required><Input value={form.location} onChange={e => set('location', e.target.value)} /></FormField>
        <FormField label="Taluk"><Input value={form.taluk} onChange={e => set('taluk', e.target.value)} /></FormField></Grid>
        <Grid cols={3}><FormField label="District"><Input value={form.district} onChange={e => set('district', e.target.value)} /></FormField>
        <FormField label="State"><Select value={form.state} onChange={e => set('state', e.target.value)}>{STATES.map(s => <option key={s}>{s}</option>)}</Select></FormField>
        <FormField label="Survey Numbers"><Input value={form.surveyNumbers} onChange={e => set('surveyNumbers', e.target.value)} placeholder="123/1A, 124/2" /></FormField></Grid>
        <Grid cols={3}><FormField label="Total Acres" hint={form.totalAcres ? `= ${Math.round((parseFloat(form.totalAcres)||0)*43560).toLocaleString('en-IN')} sqft` : '1 acre = 43,560 sqft'}><Input type="number" value={form.totalAcres} onChange={e => set('totalAcres', e.target.value)} placeholder="e.g. 3" /></FormField>
        <FormField label="Land Cost (₹)" required><Input type="number" value={form.landCost} onChange={e => set('landCost', e.target.value)} /></FormField>
        <FormField label="Purchase Date" required><Input type="date" value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} /></FormField></Grid>
        {form.totalAcres && parseFloat(form.totalAcres) > 0 && (<div style={{ marginTop: 4, padding: '11px 14px', background: T.blueLight, borderRadius: 10, fontSize: 13, color: T.blue, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}><span><strong>{form.totalAcres} acres</strong> = <strong>{Math.round((parseFloat(form.totalAcres)||0)*43560).toLocaleString('en-IN')} sqft</strong> of saleable land</span></div>)}
        <Grid cols={2} style={{ marginTop: 4 }}><FormField label="Seller Name"><Input value={form.sellerName} onChange={e => set('sellerName', e.target.value)} /></FormField></Grid>
        <div style={{ marginTop: 16, padding: '14px 16px', background: T.slateLight, borderRadius: 12, border: '1px solid ' + T.border }}><div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>💰 Investment & Capital</div><p style={{ fontSize: 12, color: T.textSub, margin: '0 0 12px', lineHeight: 1.5 }}>A project is only created once money is invested into it. Enter the capital required and how much is being invested now.</p><Grid cols={3}><FormField label="Capital Required (₹)" hint="Total funding needed"><Input type="number" value={form.amountRequired} onChange={e => set('amountRequired', e.target.value)} placeholder="e.g. 5000000" /></FormField><FormField label="Investment Now (₹)" required hint="Money invested to start"><Input type="number" value={form.initialInvestment} onChange={e => set('initialInvestment', e.target.value)} placeholder="e.g. 2000000" /></FormField><FormField label="Investor Name" hint="Defaults to Owner / Self"><Input value={form.investorName} onChange={e => set('investorName', e.target.value)} placeholder="Owner / Self" /></FormField></Grid></div>
        <div style={{ marginTop: 12 }}><FormField label="Notes"><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} /></FormField></div>
      </Modal>

      {/* ── EDIT PROJECT MODAL ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit — ${target?.projectName}`} width={680}
        footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button loading={saving} onClick={doEdit}>Save Changes</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Grid cols={2}>
          <FormField label="Project Name"><Input value={editForm.projectName||''} onChange={e => setEditForm(p => ({ ...p, projectName: e.target.value }))} /></FormField>
          <FormField label="Status"><Select value={editForm.status||'Active'} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}><option>Active</option><option>Completed</option><option>On Hold</option></Select></FormField>
          <FormField label="Location"><Input value={editForm.location||''} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} /></FormField>
          <FormField label="Taluk"><Input value={editForm.taluk||''} onChange={e => setEditForm(p => ({ ...p, taluk: e.target.value }))} /></FormField>
          <FormField label="District"><Input value={editForm.district||''} onChange={e => setEditForm(p => ({ ...p, district: e.target.value }))} /></FormField>
          <FormField label="State"><Select value={editForm.state||'Tamil Nadu'} onChange={e => setEditForm(p => ({ ...p, state: e.target.value }))}>{STATES.map(s => <option key={s}>{s}</option>)}</Select></FormField>
          <FormField label="Survey Numbers"><Input value={editForm.surveyNumbers||''} onChange={e => setEditForm(p => ({ ...p, surveyNumbers: e.target.value }))} /></FormField>
          <FormField label="Total Acres"><Input type="number" value={editForm.totalAcres||''} onChange={e => setEditForm(p => ({ ...p, totalAcres: e.target.value }))} /></FormField>
        </Grid>
        <div style={{ marginTop: 4 }}><FormField label="Notes"><Textarea value={editForm.notes||''} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} /></FormField></div>
      </Modal>

      {/* ── UPDATE LAND COST MODAL ── */}
      <Modal open={landOpen} onClose={() => setLandOpen(false)} title="Update Land Cost" width={440}
        footer={<><Button variant="secondary" onClick={() => setLandOpen(false)}>Cancel</Button><Button loading={saving} onClick={doLandCost}>Update</Button></>}>
        {err && <Alert type="error">{err}</Alert>}
        <Alert type="info">Current land cost: <strong>{fmt(target?.landCost)}</strong></Alert>
        <FormField label="New Land Cost (₹)" required><Input type="number" value={landForm.landCost} onChange={e => setLandForm(p => ({ ...p, landCost: e.target.value }))} /></FormField>
        <Grid cols={2}>
          <FormField label="Effective Date"><Input type="date" value={landForm.date} onChange={e => setLandForm(p => ({ ...p, date: e.target.value }))} /></FormField>
          <FormField label="Note"><Input value={landForm.note} onChange={e => setLandForm(p => ({ ...p, note: e.target.value }))} placeholder="e.g. Market revised" /></FormField>
        </Grid>
        {landForm.landCost && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: T.blueLight, borderRadius: 8, fontSize: 13, color: T.blue, fontWeight: 500 }}>
            New Total Investment ≈ {fmt((parseFloat(landForm.landCost) || 0) + (target?.totalExpenses || 0))}
          </div>
        )}
      </Modal>

      {/* ── LAND COST HISTORY ── */}
      <Modal open={histOpen} onClose={() => setHistOpen(false)} title={`Land Cost History — ${target?.projectName}`} width={480}>
        {(target?.landCostHistory || []).length === 0
          ? <p style={{ color: T.textSub, fontSize: 13 }}>No history available.</p>
          : (target?.landCostHistory || []).map((h, i) => (
            <InfoRow key={i} label={h.date || h.ts?.slice(0, 10)} value={`${fmt(h.amount)} — ${h.note || '—'}`} last={i === (target.landCostHistory.length - 1)} />
          ))}
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Confirm open={delOpen} onClose={() => setDelOpen(false)} onConfirm={doDelete}
        title="Delete Project" danger confirmLabel="Delete Forever"
        message={`Delete "${target?.projectName}"? This permanently removes all sites, clients, payments, expenses and investors. This cannot be undone.`} />
    </div>
  );
}
