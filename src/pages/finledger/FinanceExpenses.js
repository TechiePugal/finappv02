import React,{useEffect,useState} from 'react';
import {collection,onSnapshot,addDoc,updateDoc,deleteDoc,doc,serverTimestamp,query,orderBy,where} from 'firebase/firestore';
import {db} from '../../firebase/config';
import toast from 'react-hot-toast';
import {PageHeader,Card,StatCard,Button,Modal,FormField,Input,Select,SectionHeader,Badge,FilterTabs,SearchBar,formatCurrency,Divider} from '../../components/finledger/UI';
import {PageLoader} from '../../components/Skeleton';

const EXPENSE_CATS=[
  {label:'Utilities',items:['EB Bill / Electricity','Water Bill','Internet / Broadband','Phone / Mobile','Gas / LPG']},
  {label:'Office',items:['Office Rent','Stationery','Printing','Office Supplies','Cleaning']},
  {label:'Staff',items:['Staff Salary','Staff Bonus','Staff Advances','Consultancy Fees']},
  {label:'Operations',items:['Vehicle Fuel','Vehicle Maintenance','Courier / Delivery','Bank Charges','Audit Fees']},
  {label:'Others',items:['Repairs & Maintenance','Advertisement','Miscellaneous']},
];
const ALL_CATS=EXPENSE_CATS.flatMap(g=>g.items);
const PAY_MODES=['Cash','Bank Transfer','UPI','Cheque','DD'];

function curMonthStr(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
function today(){return new Date().toISOString().split('T')[0];}
function fmt(v){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0);}

export default function FinanceExpenses(){
  const[expenses,setExpenses]=useState([]);
  const[loading,setLoading]=useState(true);
  const[modal,setModal]=useState(null);// null | 'add' | expense-obj (edit)
  const[form,setForm]=useState({category:'EB Bill / Electricity',customName:'',amount:'',date:today(),mode:'Cash',vendor:'',invoiceNo:'',notes:'',month:curMonthStr()});
  const[saving,setSaving]=useState(false);
  const[search,setSearch]=useState('');
  const[catFilter,setCatFilter]=useState('all');
  const[monthFilter,setMonthFilter]=useState(curMonthStr());
  const[delId,setDelId]=useState(null);

  useEffect(()=>{
    const unsub=onSnapshot(query(collection(db,'finance_expenses'),orderBy('date','desc')),
      snap=>{setExpenses(snap.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      ()=>{setLoading(false);}
    );
    return unsub;
  },[]);

  function openAdd(){setForm({category:'EB Bill / Electricity',customName:'',amount:'',date:today(),mode:'Cash',vendor:'',invoiceNo:'',notes:'',month:curMonthStr()});setModal('add');}
  function openEdit(e){setForm({category:e.category,customName:e.customName||'',amount:e.amount,date:e.date,mode:e.mode||'Cash',vendor:e.vendor||'',invoiceNo:e.invoiceNo||'',notes:e.notes||'',month:e.month||curMonthStr()});setModal(e);}

  async function save(){
    if(!form.category||!form.amount||!form.date)return toast.error('Fill category, amount and date');
    setSaving(true);
    try{
      const data={
        category:form.category, customName:form.customName||'',
        displayName:form.customName||form.category,
        amount:parseFloat(form.amount), date:form.date,
        month:form.date.slice(0,7), mode:form.mode,
        vendor:form.vendor, invoiceNo:form.invoiceNo, notes:form.notes,
        updatedAt:serverTimestamp()
      };
      if(modal==='add'){
        data.createdAt=serverTimestamp();
        const r=await addDoc(collection(db,'finance_expenses'),data);
        await addDoc(collection(db,'finance_ledger_entries'),{
          type:'Debit',category:'Finance Expense',description:`${data.displayName}${form.vendor?' — '+form.vendor:''}`,
          amount:data.amount,paymentMode:data.mode,date:data.date,expenseId:r.id,createdAt:serverTimestamp()
        });
        toast.success('Expense added!');
      } else {
        await updateDoc(doc(db,'finance_expenses',modal.id),data);
        toast.success('Expense updated!');
      }
      setModal(null);
    }catch(e){toast.error('Failed: '+e.message);}finally{setSaving(false);}
  }

  async function del(){
    if(!delId)return;
    await deleteDoc(doc(db,'finance_expenses',delId));
    setDelId(null);toast.success('Expense deleted.');
  }

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  // Filter
  const months=[...new Set(expenses.map(e=>e.month))].sort((a,b)=>b.localeCompare(a));
  const monthExp=expenses.filter(e=>e.month===monthFilter);
  const filtered=monthExp.filter(e=>{
    const ms=!search||(e.displayName||e.category)?.toLowerCase().includes(search.toLowerCase())||e.vendor?.toLowerCase().includes(search.toLowerCase());
    const mc=catFilter==='all'||e.category===catFilter;
    return ms&&mc;
  });

  const totalMonth=monthExp.reduce((s,e)=>s+(e.amount||0),0);
  const byCat={};monthExp.forEach(e=>{const k=e.category;byCat[k]=(byCat[k]||0)+(e.amount||0);});
  const topCat=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const catTabs=[{value:'all',label:'All'},...[...new Set(monthExp.map(e=>e.category))].map(c=>({value:c,label:c}))];

  if(loading)return<PageLoader stats={3}/>;

  return(
    <div className="page-enter">
      <PageHeader title="Finance Expenses" subtitle="Track office expenses, utilities, and operational costs"
        action={<Button onClick={openAdd}>+ Add Expense</Button>}/>

      {/* Month selector */}
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:13,color:'var(--text-secondary)',fontWeight:500}}>Month:</span>
        {months.slice(0,12).map(m=>(
          <button key={m} onClick={()=>setMonthFilter(m)}
            style={{padding:'5px 12px',borderRadius:8,border:'1.5px solid '+(m===monthFilter?'var(--accent)':'rgba(0,0,0,.1)'),background:m===monthFilter?'var(--accent)':'#fff',color:m===monthFilter?'#fff':'var(--text-primary)',fontSize:12.5,fontWeight:m===monthFilter?700:500,cursor:'pointer',fontFamily:'inherit'}}>
            {new Date(m+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'})}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:20}}>
        <Card>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>Total This Month</div>
          <div style={{fontSize:28,fontWeight:800,color:'#ff3b30'}}>{fmt(totalMonth)}</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{monthExp.length} expenses</div>
        </Card>
        <Card>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>Top Categories</div>
          {topCat.map(([cat,amt],i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
              <span style={{fontSize:12,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{cat}</span>
              <span style={{fontSize:12,fontWeight:700,color:'#ff3b30',flexShrink:0}}>{fmt(amt)}</span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>By Category</div>
          {topCat.map(([cat,amt],i)=>(
            <div key={i} style={{marginBottom:6}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                <span style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'65%'}}>{cat}</span>
                <span style={{fontSize:11,fontWeight:600}}>{totalMonth>0?Math.round(amt/totalMonth*100):0}%</span>
              </div>
              <div style={{height:4,background:'rgba(0,0,0,.07)',borderRadius:2}}>
                <div style={{height:'100%',background:'#ff3b30',borderRadius:2,width:`${totalMonth>0?Math.round(amt/totalMonth*100):0}%`,transition:'width .3s'}}/>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search expense or vendor…"/>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {catTabs.slice(0,6).map(t=>(
              <button key={t.value} onClick={()=>setCatFilter(t.value)}
                style={{padding:'4px 10px',borderRadius:7,border:'1px solid '+(catFilter===t.value?'var(--accent)':'rgba(0,0,0,.1)'),background:catFilter===t.value?'var(--accent)':'transparent',color:catFilter===t.value?'#fff':'var(--text-secondary)',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>
                {t.label}
              </button>
            ))}
          </div>
          <Button size="sm" style={{marginLeft:'auto'}} onClick={openAdd}>+ Add</Button>
        </div>

        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'rgba(118,118,128,0.07)',borderBottom:'1px solid rgba(0,0,0,.08)'}}>
                {['Date','Category / Name','Vendor','Amount','Mode','Invoice','Actions'].map(h=>(
                  <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0&&<tr><td colSpan={7} style={{textAlign:'center',padding:36,color:'var(--text-secondary)'}}>No expenses for this period</td></tr>}
              {filtered.map(e=>(
                <tr key={e.id} style={{borderBottom:'1px solid rgba(0,0,0,.05)'}}>
                  <td style={{padding:'10px 12px',fontSize:13}}>{e.date}</td>
                  <td style={{padding:'10px 12px'}}>
                    <div style={{fontWeight:600,fontSize:13}}>{e.displayName||e.category}</div>
                    {e.customName&&e.customName!==e.category&&<div style={{fontSize:11,color:'var(--text-secondary)'}}>{e.category}</div>}
                  </td>
                  <td style={{padding:'10px 12px',fontSize:13,color:'var(--text-secondary)'}}>{e.vendor||'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:14,fontWeight:700,color:'#ff3b30'}}>{fmt(e.amount)}</td>
                  <td style={{padding:'10px 12px',fontSize:13}}>{e.mode||'—'}</td>
                  <td style={{padding:'10px 12px',fontSize:12,fontFamily:'monospace',color:'var(--text-secondary)'}}>{e.invoiceNo||'—'}</td>
                  <td style={{padding:'10px 12px'}}>
                    <div style={{display:'flex',gap:5}}>
                      <button onClick={()=>openEdit(e)} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(0,0,0,.1)',background:'transparent',cursor:'pointer',fontSize:12,fontFamily:'inherit'}}>Edit</button>
                      <button onClick={()=>setDelId(e.id)} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(255,59,48,0.2)',background:'rgba(255,59,48,0.06)',cursor:'pointer',fontSize:12,color:'#c0392b',fontFamily:'inherit'}}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={!!modal} onClose={()=>setModal(null)} title={modal==='add'?'Add Expense':'Edit Expense'} width={520}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
          <FormField label="Category" required>
            <Select value={form.category} onChange={e=>set('category',e.target.value)}>
              {EXPENSE_CATS.map(g=>(
                <optgroup key={g.label} label={g.label}>
                  {g.items.map(i=><option key={i}>{i}</option>)}
                </optgroup>
              ))}
            </Select>
          </FormField>
          <FormField label="Custom Name / Description" hint="Override the category name">
            <Input value={form.customName} onChange={e=>set('customName',e.target.value)} placeholder={form.category}/>
          </FormField>
          <FormField label="Amount (₹)" required><Input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0" min="1"/></FormField>
          <FormField label="Date" required><Input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/></FormField>
          <FormField label="Payment Mode"><Select value={form.mode} onChange={e=>set('mode',e.target.value)}>{PAY_MODES.map(m=><option key={m}>{m}</option>)}</Select></FormField>
          <FormField label="Vendor / Supplier"><Input value={form.vendor} onChange={e=>set('vendor',e.target.value)} placeholder="Vendor name"/></FormField>
          <FormField label="Invoice / Bill No."><Input value={form.invoiceNo} onChange={e=>set('invoiceNo',e.target.value)} placeholder="INV-001"/></FormField>
        </div>
        <div style={{marginTop:12}}>
          <FormField label="Notes"><Input value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Optional notes"/></FormField>
        </div>
        <div style={{display:'flex',gap:10,marginTop:16}}>
          <Button onClick={save} disabled={saving} full>{saving?'Saving…':modal==='add'?'Add Expense':'Save Changes'}</Button>
          <Button variant="secondary" onClick={()=>setModal(null)}>Cancel</Button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!delId} onClose={()=>setDelId(null)} title="Delete Expense" width={380}>
        <p style={{fontSize:14,color:'var(--text-secondary)',marginBottom:16}}>Are you sure you want to delete this expense? This cannot be undone.</p>
        <div style={{display:'flex',gap:10}}>
          <Button variant="danger" onClick={del}>Delete</Button>
          <Button variant="secondary" onClick={()=>setDelId(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
