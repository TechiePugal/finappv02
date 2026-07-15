import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getAllClients, getAllInvestors, getAllPayments, getLedger, getProjects,
  updateClient, cancelBooking, addInvestor, updateInvestor, deleteInvestor } from '../../utils/re_firestore';
import { fmt, fmtDate, today, INV_TYPES, PAY_MODES } from '../../utils/re_helpers';
import { printLedgerReport } from '../../utils/re_pdfReport';
import { Card, StatCard, Table, Badge, Button, IconBtn, Modal, FormField, Input, Select, Textarea, Grid, Alert, Confirm, PageHeader, SectionHeader, FilterTabs, SearchBar, InfoRow, T, ProgressBar, Loader, SiteTile, Tabs, UploadZone, Divider, KPIRow, ActionMenu, Empty, Btn, Inp, Sel, Ta, Fld, SHead } from '../../components/realestate/UI';
import { Users, UserCheck, BookOpen, Wallet, DollarSign, TrendingUp, Plus, Edit, Trash2, XCircle } from 'lucide-react';

export function ClientsPage() {
  const {user}=useAuth();
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [editModal,setEditModal]=useState(false);
  const [cancelModal,setCancelModal]=useState(false);
  const [sel,setSel]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const [ok,setOk]=useState('');

  const load=useCallback(async()=>{setLoading(true);setClients(await getAllClients(user.uid));setLoading(false);},[user.uid]);
  useEffect(()=>{load();},[load]);
  const flash=(m,t='ok')=>{if(t==='ok')setOk(m);else setErr(m);setTimeout(()=>{setOk('');setErr('');},3000);};

  async function doEdit(){
    setSaving(true);setErr('');
    try{await updateClient(user.uid,sel.projectId,sel.id,editForm);setEditModal(false);await load();flash('Client updated.');}
    catch(e){setErr(e.message);}finally{setSaving(false);}
  }
  async function doCancel(){
    try{await cancelBooking(user.uid,sel.projectId,sel.id);setCancelModal(false);await load();flash('Booking cancelled.');}
    catch(e){flash(e.message,'err');}
  }

  const filtered=clients.filter(c=>{
    const mf=filter==='all'||c.status===filter;
    const ms=!search||c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search)||c.lotNumber?.includes(search);
    return mf&&ms;
  });

  const totSale=clients.reduce((s,c)=>s+(c.saleValue||0),0);
  const totPaid=clients.reduce((s,c)=>s+(c.totalPaid||0),0);
  const totBal=clients.reduce((s,c)=>s+(c.balanceDue||0),0);

  return (
    <>
      <PageHeader title="All Clients" subtitle={`${clients.length} clients across all projects`}/>
      <div className="page fade-in">
        {ok&&<Alert type="success">{ok}</Alert>}{err&&<Alert type="error">{err}</Alert>}
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Clients" value={clients.length} icon={Users} accent="#007aff"/>
          <StatCard label="Sale Value" value={totSale} isCurrency icon={DollarSign} accent="#34c759"/>
          <StatCard label="Collected" value={totPaid} isCurrency icon={Wallet} accent="#34c759"/>
          <StatCard label="Outstanding" value={totBal} isCurrency icon={TrendingUp} accent="#ff3b30"/>
        </div>
        <Card>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, lot number..."/>
            <FilterTabs tabs={[{value:'all',label:'All'},{value:'Active',label:'Active'},{value:'Completed',label:'Completed'},{value:'Cancelled',label:'Cancelled'}]} active={filter} onChange={setFilter}/>
          </div>
          {loading?<Loader/>:(
            <Table columns={[
              {key:'lotNumber',label:'Site',render:v=><span className="mono">{v}</span>},
              {key:'name',label:'Client',render:(v,r)=><div><div style={{fontWeight:600}}>{v}</div><div style={{fontSize:12,color:'var(--text2)'}}>{r.phone}{r.email?' · '+r.email:''}</div></div>},
              {key:'saleValue',label:'Sale Value',sortable:true,render:v=>fmt(v)},
              {key:'totalPaid',label:'Paid',sortable:true,render:v=><span className="pos">{fmt(v)}</span>},
              {key:'balanceDue',label:'Balance',sortable:true,render:v=><span className={v>0?'neg':'pos'}>{fmt(v)}</span>},
              {key:'bookedDate',label:'Booked',render:v=>fmtDate(v)},
              {key:'status',label:'Status',render:v=><Badge status={v}/>},
              {key:'id',label:'',render:(_,r)=>(
                <ActionMenu items={[
                  {label:'Edit',icon:<Edit size={12}/>,onClick:()=>{setSel(r);setEditForm({name:r.name,phone:r.phone,email:r.email||'',address:r.address||'',aadhar:r.aadhar||'',pan:r.pan||'',notes:r.notes||''});setErr('');setEditModal(true);}},
                  {divider:true},
                  {label:'Cancel Booking',icon:<XCircle size={12}/>,danger:true,onClick:()=>{setSel(r);setCancelModal(true);}},
                ]}/>
              )},
            ]} data={filtered} emptyText="No clients found"/>
          )}
        </Card>
      </div>
      <Modal open={editModal} onClose={()=>setEditModal(false)} title={`Edit — ${sel?.name}`} width={560}
        footer={<><Button variant="secondary" onClick={()=>setEditModal(false)}>Cancel</Button><Button loading={saving} onClick={doEdit}>Save</Button></>}>
        {err&&<Alert type="error">{err}</Alert>}
        <div ><FormField label="Name"><Input value={editForm.name||''} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))}/></FormField><FormField label="Phone"><Input value={editForm.phone||''} onChange={e=>setEditForm(p=>({...p,phone:e.target.value}))}/></FormField></div>
        <div ><FormField label="Email"><Input value={editForm.email||''} onChange={e=>setEditForm(p=>({...p,email:e.target.value}))}/></FormField><FormField label="Aadhar"><Input value={editForm.aadhar||''} onChange={e=>setEditForm(p=>({...p,aadhar:e.target.value}))}/></FormField></div>
        <FormField label="PAN"><Input value={editForm.pan||''} onChange={e=>setEditForm(p=>({...p,pan:e.target.value.toUpperCase()}))}/></FormField>
        <FormField label="Address"><Textarea value={editForm.address||''} onChange={e=>setEditForm(p=>({...p,address:e.target.value}))}/></FormField>
      </Modal>
      <Confirm open={cancelModal} onClose={()=>setCancelModal(false)} onConfirm={doCancel} title="Cancel Booking" danger confirmLabel="Cancel Booking"
        message={`Cancel ${sel?.name}'s booking for ${sel?.lotNumber}? Site will be released. Refunds must be tracked manually.`}/>
    </>
  );
}

export function InvestorsPage() {
  const {user}=useAuth();
  const [investors,setInvestors]=useState([]);
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [addModal,setAddModal]=useState(false);
  const [editModal,setEditModal]=useState(false);
  const [delModal,setDelModal]=useState(false);
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState({name:'',phone:'',email:'',amount:'',date:today(),investType:'Full Project',expectedReturn:'',notes:'',projectId:''});
  const [editForm,setEditForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const [ok,setOk]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    const [invs,projs]=await Promise.all([getAllInvestors(user.uid),getProjects(user.uid)]);
    setInvestors(invs);setProjects(projs);setLoading(false);
  },[user.uid]);
  useEffect(()=>{load();},[load]);

  const projMap={};projects.forEach(p=>{projMap[p.id]=p.projectName;});
  const flash=(m,t='ok')=>{if(t==='ok')setOk(m);else setErr(m);setTimeout(()=>{setOk('');setErr('');},3000);};

  async function doAdd(){
    if(!form.name||!form.amount||!form.date||!form.projectId){setErr('All required fields missing.');return;}
    setSaving(true);setErr('');
    try{await addInvestor(user.uid,form.projectId,form);setAddModal(false);setForm({name:'',phone:'',email:'',amount:'',date:today(),investType:'Full Project',expectedReturn:'',notes:'',projectId:''});await load();flash('Investor added.');}
    catch(e){setErr(e.message);}finally{setSaving(false);}
  }
  async function doEdit(){
    setSaving(true);setErr('');
    try{await updateInvestor(user.uid,sel.projectId,sel.id,editForm);setEditModal(false);await load();flash('Updated.');}
    catch(e){setErr(e.message);}finally{setSaving(false);}
  }
  async function doDel(){
    try{await deleteInvestor(user.uid,sel.projectId,sel.id);setDelModal(false);await load();flash('Removed.');}
    catch(e){flash(e.message,'err');}
  }

  const totFund=investors.reduce((s,i)=>s+(i.amount||0),0);
  const totProfit=investors.reduce((s,i)=>s+(i.profitShare||0),0);
  const totReturned=investors.reduce((s,i)=>s+(i.amountReturned||0),0);

  return (
    <>
      <PageHeader title="Investors & Depositors" subtitle={`${investors.length} investors`}
        actions={<Button size="sm" onClick={()=>{setForm({name:'',phone:'',email:'',amount:'',date:today(),investType:'Full Project',expectedReturn:'',notes:'',projectId:''});setErr('');setAddModal(true);}}><Plus size={13}/>Add Investor</Button>}/>
      <div className="page fade-in">
        {ok&&<Alert type="success">{ok}</Alert>}{err&&<Alert type="error">{err}</Alert>}
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Investors" value={investors.length} icon={UserCheck} accent="#5856d6"/>
          <StatCard label="Total Funded" value={totFund} isCurrency icon={Wallet} accent="#007aff"/>
          <StatCard label="Total Profit Share" value={totProfit} isCurrency icon={TrendingUp} accent="#34c759"/>
          <StatCard label="Total Returned" value={totReturned} isCurrency icon={DollarSign} accent="#34c759"/>
        </div>
        <Card>
          {loading?<Loader/>:(
            <Table columns={[
              {key:'investorId',label:'ID',render:v=><span className="mono">{v}</span>},
              {key:'name',label:'Investor',render:(v,r)=><div><div style={{fontWeight:600}}>{v}</div><div style={{fontSize:12,color:'var(--text2)'}}>{r.phone}</div></div>},
              {key:'projectId',label:'Project',render:v=>projMap[v]||'—'},
              {key:'investType',label:'Type'},
              {key:'amount',label:'Invested',sortable:true,render:v=>fmt(v)},
              {key:'sharePercent',label:'Share',render:v=>v!=null?`${Number(v).toFixed(1)}%`:'—'},
              {key:'profitShare',label:'Profit Share',render:v=>v!=null?<span className={v>=0?'pos':'neg'}>{fmt(v)}</span>:'—'},
              {key:'amountReturned',label:'Returned',render:v=>fmt(v||0)},
              {key:'date',label:'Date',render:v=>fmtDate(v)},
              {key:'id',label:'',render:(_,r)=>(
                <ActionMenu items={[
                  {label:'Edit',icon:<Edit size={12}/>,onClick:()=>{setSel(r);setEditForm({name:r.name,phone:r.phone||'',amount:r.amount,investType:r.investType||'Full Project',expectedReturn:r.expectedReturn||'',notes:r.notes||''});setErr('');setEditModal(true);}},
                  {divider:true},
                  {label:'Remove',icon:<Trash2 size={12}/>,danger:true,onClick:()=>{setSel(r);setDelModal(true);}},
                ]}/>
              )},
            ]} data={investors} emptyText="No investors yet"/>
          )}
        </Card>
      </div>
      <Modal open={addModal} onClose={()=>setAddModal(false)} title="Add Investor" width={560}
        footer={<><Button variant="secondary" onClick={()=>setAddModal(false)}>Cancel</Button><Button loading={saving} onClick={doAdd}>Add</Button></>}>
        {err&&<Alert type="error">{err}</Alert>}
        <Alert type="info">Investors deposit money to fund land purchase. Profit is split proportionally at project close.</Alert>
        <FormField label="Project" required><Select value={form.projectId} options={projects.map(p=>({value:p.id,label:p.projectName}))} placeholder="Select project..." onChange={e=>setForm(p=>({...p,projectId:e.target.value}))}/></FormField>
        <div ><FormField label="Name" required><Input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></FormField><FormField label="Phone"><Input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></FormField></div>
        <div ><FormField label="Amount (₹)" required><Input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}/></FormField><FormField label="Date" required><Input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></FormField></div>
        <div ><FormField label="Investment Type"><Select value={form.investType} options={INV_TYPES.map(t=>({value:t,label:t}))} onChange={e=>setForm(p=>({...p,investType:e.target.value}))}/></FormField><FormField label="Expected Return %"><Input type="number" value={form.expectedReturn} onChange={e=>setForm(p=>({...p,expectedReturn:e.target.value}))}/></FormField></div>
        <FormField label="Notes / Terms"><Textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/></FormField>
      </Modal>
      <Modal open={editModal} onClose={()=>setEditModal(false)} title={`Edit — ${sel?.name}`} width={560}
        footer={<><Button variant="secondary" onClick={()=>setEditModal(false)}>Cancel</Button><Button loading={saving} onClick={doEdit}>Save</Button></>}>
        {err&&<Alert type="error">{err}</Alert>}
        <div ><FormField label="Name"><Input value={editForm.name||''} onChange={e=>setEditForm(p=>({...p,name:e.target.value}))}/></FormField><FormField label="Phone"><Input value={editForm.phone||''} onChange={e=>setEditForm(p=>({...p,phone:e.target.value}))}/></FormField></div>
        <div ><FormField label="Amount (₹)"><Input type="number" value={editForm.amount||''} onChange={e=>setEditForm(p=>({...p,amount:e.target.value}))}/></FormField><FormField label="Expected Return %"><Input type="number" value={editForm.expectedReturn||''} onChange={e=>setEditForm(p=>({...p,expectedReturn:e.target.value}))}/></FormField></div>
        <FormField label="Type"><Select value={editForm.investType||'Full Project'} options={INV_TYPES.map(t=>({value:t,label:t}))} onChange={e=>setEditForm(p=>({...p,investType:e.target.value}))}/></FormField>
        <FormField label="Notes"><Textarea value={editForm.notes||''} onChange={e=>setEditForm(p=>({...p,notes:e.target.value}))}/></FormField>
      </Modal>
      <Confirm open={delModal} onClose={()=>setDelModal(false)} onConfirm={doDel} title="Remove Investor" danger confirmLabel="Remove"
        message={`Remove ${sel?.name} as investor? Funded amount deducted from project.`}/>
    </>
  );
}

export function PaymentsPage() {
  const {user}=useAuth();
  const [payments,setPayments]=useState([]);
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');

  useEffect(()=>{
    async function load(){
      setLoading(true);
      const [pays,projs]=await Promise.all([getAllPayments(user.uid),getProjects(user.uid)]);
      setPayments(pays);setProjects(projs);setLoading(false);
    }
    load();
  },[user.uid]);

  const projMap={};projects.forEach(p=>{projMap[p.id]=p.projectName;});
  const total=payments.reduce((s,p)=>s+(p.amount||0),0);
  const filtered=payments.filter(p=>{
    const ms=!search||p.clientName?.toLowerCase().includes(search.toLowerCase())||p.lotNumber?.includes(search)||p.reference?.includes(search);
    const mf=filter==='all'||p.mode===filter;
    return ms&&mf;
  });

  return (
    <>
      <PageHeader title="All Payments" subtitle={`Total Collected: ${fmt(total)}`}/>
      <div className="page fade-in">
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Collected" value={total} isCurrency icon={Wallet} accent="#34c759"/>
          <StatCard label="Transactions" value={payments.length} icon={DollarSign} accent="#007aff"/>
          <StatCard label="Cash Payments" value={payments.filter(p=>p.mode==='Cash').reduce((s,p)=>s+(p.amount||0),0)} isCurrency icon={DollarSign} accent="#ff9500"/>
          <StatCard label="Bank/Digital" value={payments.filter(p=>['Bank Transfer','NEFT/RTGS','UPI'].includes(p.mode)).reduce((s,p)=>s+(p.amount||0),0)} isCurrency icon={TrendingUp} accent="#5856d6"/>
        </div>
        <Card>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <SearchBar value={search} onChange={setSearch} placeholder="Client, lot, reference..."/>
            <FilterTabs tabs={[{value:'all',label:'All'},{value:'Cash',label:'Cash'},{value:'Bank Transfer',label:'Bank'},{value:'Cheque',label:'Cheque'},{value:'UPI',label:'UPI'}]} active={filter} onChange={setFilter}/>
          </div>
          {loading?<Loader/>:(
            <Table columns={[
              {key:'paymentId',label:'ID',render:v=><span className="mono">{v}</span>},
              {key:'projectId',label:'Project',render:v=>projMap[v]||'—'},
              {key:'lotNumber',label:'Site',render:v=><span className="mono">{v}</span>},
              {key:'clientName',label:'Client'},
              {key:'amount',label:'Amount',sortable:true,render:v=><span className="pos">{fmt(v)}</span>},
              {key:'mode',label:'Mode'},
              {key:'reference',label:'Reference'},
              {key:'date',label:'Date',render:v=>fmtDate(v)},
            ]} data={filtered} emptyText="No payments found"/>
          )}
        </Card>
      </div>
    </>
  );
}

export function LedgerPage() {
  const {user}=useAuth();
  const [entries,setEntries]=useState([]);
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState('all');
  const [projFilter,setProjFilter]=useState('all');

  useEffect(()=>{
    async function load(){
      setLoading(true);
      const [e,p]=await Promise.all([getLedger(user.uid),getProjects(user.uid)]);
      setEntries(e);setProjects(p);setLoading(false);
    }
    load();
  },[user.uid]);

  const projMap={};projects.forEach(p=>{projMap[p.id]=p.projectName;});
  const filtered=entries.filter(e=>{
    const mt=filter==='all'||e.type===filter;
    const mp=projFilter==='all'||e.projectId===projFilter;
    return mt&&mp;
  });
  const totDebit=filtered.reduce((s,e)=>s+(e.debit||0),0);
  const totCredit=filtered.reduce((s,e)=>s+(e.credit||0),0);
  const TYPE_COLORS={'Client Payment':'b-active','Land Purchase':'b-danger',Expense:'b-booked',Investment:'b-investment','Investor Return':'b-sold'};

  return (
    <>
      <PageHeader title="Finance Ledger" subtitle="Auto-posted accounting entries"
        action={<Button variant="secondary" onClick={()=>printLedgerReport(filtered, projMap, `Filter: ${filter==="all"?"All Types":filter}${projFilter!=="all"?" · "+(projMap[projFilter]||""):""}`)}>🖨 Export PDF</Button>}/>
      <div className="page fade-in">
        <div className="stats-g" style={{marginBottom:16}}>
          <StatCard label="Total Expenditure" value={entries.reduce((s,e)=>s+(e.debit||0),0)} isCurrency icon={TrendingUp} accent="#ff3b30"/>
          <StatCard label="Total Income" value={entries.filter(e=>e.type==='Client Payment').reduce((s,e)=>s+(e.credit||0),0)} isCurrency icon={DollarSign} accent="#34c759"/>
          <StatCard label="Investor Funds" value={entries.filter(e=>e.type==='Investment').reduce((s,e)=>s+(e.credit||0),0)} isCurrency icon={Wallet} accent="#5856d6"/>
          <StatCard label="Net (Filtered)" value={totCredit-totDebit} isCurrency icon={BookOpen} accent={(totCredit-totDebit)>=0?'#34c759':'#ff3b30'}/>
        </div>
        <Card>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            <FilterTabs tabs={[{value:'all',label:'All'},{value:'Land Purchase',label:'Land'},{value:'Expense',label:'Expense'},{value:'Client Payment',label:'Client Pay'},{value:'Investment',label:'Investment'},{value:'Investor Return',label:'Return'}]} active={filter} onChange={setFilter}/>
            <select className="sel" style={{width:'auto',padding:'5px 10px',fontSize:13}} value={projFilter} onChange={e=>setProjFilter(e.target.value)}>
              <option value="all">All Projects</option>
              {projects.map(p=><option key={p.id} value={p.id}>{p.projectName}</option>)}
            </select>
          </div>
          {loading?<Loader/>:(
            <Table columns={[
              {key:'date',label:'Date',render:v=>fmtDate(v)},
              {key:'projectId',label:'Project',render:v=>projMap[v]||'—'},
              {key:'type',label:'Type',render:v=><span className={`badge ${TYPE_COLORS[v]||'b-neutral'}`}>{v}</span>},
              {key:'description',label:'Description'},
              {key:'debit',label:'Debit',render:v=>v?<span className="neg">{fmt(v)}</span>:'—'},
              {key:'credit',label:'Credit',render:v=>v?<span className="pos">{fmt(v)}</span>:'—'},
            ]} data={filtered} emptyText="No ledger entries"/>
          )}
          <div style={{padding:'10px 16px',borderTop:'1px solid var(--border)',display:'flex',gap:24,fontSize:13.5}}>
            <span>Debit: <strong className="neg">{fmt(totDebit)}</strong></span>
            <span>Credit: <strong className="pos">{fmt(totCredit)}</strong></span>
            <span>Net: <strong className={(totCredit-totDebit)>=0?'pos':'neg'}>{fmt(totCredit-totDebit)}</strong></span>
          </div>
        </Card>
      </div>
    </>
  );
}
