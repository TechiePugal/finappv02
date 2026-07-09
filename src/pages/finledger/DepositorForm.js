import React,{useState,useEffect} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {collection,addDoc,doc,getDoc,updateDoc,serverTimestamp,getDocs} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {uploadDocumentFile,openDocument} from '../../utils/fileStore';
import toast from 'react-hot-toast';
import {Button,FormField,Input,Select,Card,PageHeader,Toggle,formatCurrency,SectionHeader,InfoRow,Divider} from '../../components/finledger/UI';

function genId(){return 'DEP-'+Date.now().toString(36).toUpperCase();}

// tenure is now a NUMBER (months between payouts, e.g. 1=monthly, 3=quarterly)
function calcPeriodInterest(amt,rate,tenureMonths,compound){
  // per month deposit: rate is % per month directly
  const p=parseFloat(amt)||0, r=parseFloat(rate)||0, t=normTenure(tenureMonths);
  return compound ? p*(Math.pow(1+r/100,t)-1) : (p*(r/100)*t);
}

// Generate full schedule from start date to maturity (or 36 months if no maturity)
function normTenure(t){
  const legacyMap={'Monthly':1,'Quarterly':3,'Half-Yearly':6,'Yearly':12};
  return typeof t==='string'&&isNaN(t)?(legacyMap[t]||1):(parseInt(t)||1);
}
function genFullSchedule(amt,rate,tenureMonths,compound,start,maturity){
  if(!amt||!rate||!start) return [];
  const slots=[];
  let p=parseFloat(amt), r=parseFloat(rate), t=parseInt(tenureMonths)||1;
  let cur=new Date(start);
  const end = maturity ? new Date(maturity) : new Date(new Date(start).setMonth(new Date(start).getMonth()+36));
  let idx=0;
  while(cur < end && idx < 200){
    const next=new Date(cur); next.setMonth(next.getMonth()+t);
    // monthly rate, compound = (1+r)^t-1 over t months; simple = r*t flat
    const int = compound ? p*(Math.pow(1+r/100,t)-1) : (p*(r/100)*t);
    slots.push({
      idx:++idx,
      dueDate: next.toISOString().split('T')[0],
      interest: Math.round(int),
      principal: Math.round(p),
    });
    if(compound) p+=int;
    cur=next;
    if(next>=end) break;
  }
  return slots;
}

export default function DepositorForm(){
  const {id}=useParams(); const nav=useNavigate(); const isEdit=!!id;
  const [form,setForm]=useState({
    depositId:genId(), name:'', phone:'', email:'', address:'',
    depositAmount:'', interestRate:'', interestTenure:'1',
    compounding:false, startDate:'', maturityDate:'', status:'Active', notes:''
  });
  const [files,setFiles]=useState({check:null,bond:null});
  const [existing,setExisting]=useState({});
  const [loading,setLoading]=useState(false);
  const [schedule,setSchedule]=useState([]);
  const [showAllPayouts,setShowAllPayouts]=useState(false);
  const [photoPreview,setPhotoPreview]=useState(null);

  const[origStatus,setOrigStatus]=useState('');
  useEffect(()=>{if(isEdit)loadData();},[]);// eslint-disable-line
  useEffect(()=>{
    setSchedule(genFullSchedule(form.depositAmount,form.interestRate,form.interestTenure,form.compounding,form.startDate,form.maturityDate));
  },[form.depositAmount,form.interestRate,form.interestTenure,form.compounding,form.startDate,form.maturityDate]);

  async function loadData(){
    const s=await getDoc(doc(db,'deposit_master',id));
    if(s.exists()){
      const d=s.data();
      setOrigStatus(d.status||'Active');
      setForm({
        depositId:d.depositId||id, name:d.name||'', phone:d.phone||'', email:d.email||'',
        address:d.address||'', depositAmount:d.depositAmount||'', interestRate:d.interestRate||'',
        interestTenure:String(d.interestTenure||'1'), compounding:d.compounding||false,
        startDate:d.startDate||'', maturityDate:d.maturityDate||'', status:d.status||'Active', notes:d.notes||''
      });
      setExisting({check:d.checkCopyUrl,bond:d.bondCopyUrl});
    }
  }

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const[custs,setCusts]=useState([]);const[custQ,setCustQ]=useState('');const[linkedUser,setLinkedUser]=useState(null);
  useEffect(()=>{getDocs(collection(db,'customer_master')).then(s=>setCusts(s.docs.map(d=>({id:d.id,...d.data()})))).catch(()=>{});},[]);


  async function handlePhoto(file){
    if(!file)return;
    if(file.size>2*1024*1024){toast.error('Photo must be under 2MB');return;}
    const r=await uploadDocumentFile(file);
    setPhotoPreview(r.dataUrl);
    set('photo',r.dataUrl);
  }

  async function submit(e){
    e.preventDefault();
    if(!isEdit&&!linkedUser) return toast.error('Select an existing User first — deposits can only be created for a linked User.');
    if(!form.name||!form.phone||!form.depositAmount||!form.interestRate||!form.startDate)
      return toast.error('Fill all required fields');
    setLoading(true);
    try{
      const toDataUrl=async(file)=>{ if(!file)return null; const r=await uploadDocumentFile(file); return r.dataUrl; };
      const [checkUrl,bondUrl]=await Promise.all([
        files.check?toDataUrl(files.check):Promise.resolve(existing.check||null),
        files.bond?toDataUrl(files.bond):Promise.resolve(existing.bond||null),
      ]);
      const tenureNum=parseInt(form.interestTenure)||1;
      const periodInterest=calcPeriodInterest(form.depositAmount,form.interestRate,tenureNum,form.compounding);
      const data={
        ...form, depositAmount:parseFloat(form.depositAmount),
        interestRate:parseFloat(form.interestRate), interestTenure:tenureNum,
        compounding:!!form.compounding, checkCopyUrl:checkUrl, bondCopyUrl:bondUrl,
        monthlyInterest: calcPeriodInterest(form.depositAmount,form.interestRate,1,form.compounding),
        periodInterest, updatedAt:serverTimestamp()
      };
      if(isEdit){
        await updateDoc(doc(db,'deposit_master',id),data);
        if(origStatus!=='Closed'&&form.status==='Closed'){
          // Milestone: Deposit Closed — notable lifecycle event for Journal
          await addDoc(collection(db,'finance_ledger_entries'),{
            type:'Milestone', category:'Deposit Closed',
            description:`Deposit closed — ${form.name} · ${form.depositId||id}`,
            amount:parseFloat(form.depositAmount)||0, date:new Date().toISOString().split('T')[0],
            borrowerName:form.name, depositorId:id, depositId:form.depositId||id,
            createdAt:serverTimestamp()
          });
        }
        toast.success('Depositor updated!');
      } else {
        data.createdAt=serverTimestamp();
        const r2=await addDoc(collection(db,'deposit_master'),data);
        // Store full schedule
        await addDoc(collection(db,'deposit_interest_schedule'),{
          depositId:r2.id, schedule:genFullSchedule(form.depositAmount,form.interestRate,tenureNum,form.compounding,form.startDate,form.maturityDate), createdAt:serverTimestamp()
        });
        // Milestone: Deposit Created — notable lifecycle event for Journal
        await addDoc(collection(db,'finance_ledger_entries'),{
          type:'Milestone', category:'Deposit Created',
          description:`Deposit created — ${form.name} · ${form.depositId||r2.id}`,
          amount:parseFloat(form.depositAmount)||0, date:form.startDate||new Date().toISOString().split('T')[0],
          borrowerName:form.name, depositorId:r2.id, depositId:form.depositId||r2.id,
          createdAt:serverTimestamp()
        });
        toast.success('Depositor added!');
      }
      nav('/fl/depositors');
    }catch(e){toast.error('Failed: '+e.message);}finally{setLoading(false);}
  }

  const tenureNum=parseInt(form.interestTenure)||1;
  const periodInterest=calcPeriodInterest(form.depositAmount,form.interestRate,tenureNum,form.compounding);
  const displayPayouts=showAllPayouts?schedule:schedule.slice(0,6);
  const tenureLabel=tenureNum===1?'Monthly':tenureNum===3?'Quarterly (3mo)':tenureNum===6?'Half-Yearly (6mo)':tenureNum===12?'Yearly (12mo)':`Every ${tenureNum} months`;

  return(
    <div className="page-enter">
      <PageHeader title={isEdit?'Edit Depositor':'New Depositor'} subtitle={isEdit?`Editing ${form.depositId}`:'Register an investor deposit'}
        action={<Button variant="ghost" onClick={()=>nav('/fl/depositors')}>← Back</Button>}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20,alignItems:'start'}}>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:16}}>
          <Card>
            <SectionHeader title="Investor Details"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {/* Photo Upload */}
            <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:16,padding:'12px 14px',background:'rgba(0,122,255,0.04)',borderRadius:12,border:'1px solid rgba(0,122,255,0.1)'}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(118,118,128,0.1)',border:'2px dashed rgba(0,122,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
                {photoPreview?<img src={photoPreview} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(0,122,255,0.5)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              </div>
              <div>
                <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>Depositor Photo</p>
                <label style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',background:'var(--accent)',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,color:'#fff'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {photoPreview?'Change':'Upload Photo'}
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                </label>
                {photoPreview&&<button type="button" onClick={()=>{setPhotoPreview(null);set('photo',null);}} style={{marginLeft:8,fontSize:11,color:'#ff3b30',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>Remove</button>}
              </div>
            </div>
            <FormField label="Deposit ID"><Input value={form.depositId} disabled style={{color:'var(--accent)',fontWeight:600}}/></FormField>
              <FormField label="Status" required><Select value={form.status} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Closed</option></Select></FormField>
            {/* User picker — Step 1: pick the User first */}
            <div style={{marginBottom:14,padding:'14px 16px',background:linkedUser?'rgba(52,199,89,0.06)':'rgba(0,122,255,0.05)',border:linkedUser?'1.5px solid rgba(52,199,89,0.3)':'1.5px dashed rgba(0,122,255,0.3)',borderRadius:12}}>
              <div style={{fontSize:11,fontWeight:700,color:linkedUser?'#248a3d':'#0a84ff',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>
                {linkedUser ? '✓ Linked to User' : 'Step 1 — Select the User'}
              </div>
              {linkedUser ? (
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#34c759,#30b0c7)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,flexShrink:0}}>{(linkedUser.name||'?')[0].toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{linkedUser.name}</div>
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>{linkedUser.phone} · {linkedUser.customerId}</div>
                  </div>
                  <button type="button" onClick={()=>{setLinkedUser(null);set('name','');set('phone','');set('customerId','');}} style={{fontSize:12,color:'#ff3b30',background:'none',border:'1px solid rgba(255,59,48,0.3)',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>Change</button>
                </div>
              ) : (
                <>
                  <input value={custQ} onChange={e=>setCustQ(e.target.value)} placeholder="Search by user name, phone or ID…" style={{width:'100%',boxSizing:'border-box',height:36,padding:'0 12px',borderRadius:9,border:'1px solid rgba(0,0,0,0.12)',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
                  {custQ.trim()&&(
                    <div style={{marginTop:8,display:'grid',gap:4,maxHeight:180,overflowY:'auto'}}>
                      {custs.filter(cc=>[cc.name,cc.phone,cc.customerId].some(v=>String(v||'').toLowerCase().includes(custQ.trim().toLowerCase()))).slice(0,6).map(cc=>(
                        <div key={cc.id} onClick={()=>{setLinkedUser(cc);set('name',cc.name||'');set('phone',cc.phone||'');set('customerId',cc.id);setCustQ('');}} style={{padding:'8px 10px',borderRadius:8,background:'#fff',border:'1px solid rgba(0,0,0,0.08)',cursor:'pointer',fontSize:13}}>
                          <strong>{cc.name}</strong> <span style={{color:'var(--text-secondary)',fontSize:11.5}}>· {cc.phone} · {cc.customerId}</span>
                        </div>))}
                      {custs.filter(cc=>[cc.name,cc.phone,cc.customerId].some(v=>String(v||'').toLowerCase().includes(custQ.trim().toLowerCase()))).length===0&&(
                        <div style={{fontSize:12.5,color:'var(--text-secondary)',padding:'8px 2px'}}>No matching user. <a href="/fl/customers" style={{color:'#0a84ff'}}>Enroll a new User first →</a></div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
              <FormField label="Full Name" required><Input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Investor full name" disabled={!!linkedUser}/></FormField>
              <FormField label="Phone Number" required><Input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="9876543210" type="tel" disabled={!!linkedUser}/></FormField>
              <FormField label="Email"><Input value={form.email} onChange={e=>set('email',e.target.value)} placeholder="email@example.com" type="email"/></FormField>
              <FormField label="Address"><Input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Full address"/></FormField>
              <FormField label="Deposit Amount (₹)" required><Input value={form.depositAmount} onChange={e=>set('depositAmount',e.target.value)} placeholder="500000" type="number" min="1"/></FormField>
              <FormField label="Monthly Interest Rate (%)" required><Input value={form.interestRate} onChange={e=>set('interestRate',e.target.value)} placeholder="1.5" type="number" step="0.01" min="0"/></FormField>
              <FormField label="Interest Payout Tenure (months)" required
                hint="Enter number of months between each payout — 1=Monthly, 3=Quarterly, 6=Half-Yearly, 12=Yearly">
                <Input value={form.interestTenure} onChange={e=>set('interestTenure',e.target.value)} placeholder="1" type="number" min="1" max="60"/>
              </FormField>
              <FormField label="Compounding Interest">
                <div style={{paddingTop:8}}>
                  <Toggle checked={form.compounding} onChange={v=>set('compounding',v)} label={form.compounding?'Compound Interest':'Simple Interest'}/>
                </div>
              </FormField>
              <FormField label="Start Date" required><Input value={form.startDate} onChange={e=>set('startDate',e.target.value)} type="date"/></FormField>
              <FormField label="Maturity Date"><Input value={form.maturityDate} onChange={e=>set('maturityDate',e.target.value)} type="date"/></FormField>
            </div>
            <div style={{marginTop:14}}>
              <FormField label="Notes">
                <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Additional notes…"
                  style={{padding:'10px 12px',background:'rgba(118,118,128,0.08)',border:'1.5px solid rgba(0,0,0,0.08)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',width:'100%',minHeight:80,resize:'vertical',fontFamily:'inherit'}}
                  onFocus={e=>{e.target.style.borderColor='#007aff';e.target.style.boxShadow='0 0 0 3px rgba(0,122,255,0.12)';}}
                  onBlur={e=>{e.target.style.borderColor='rgba(0,0,0,0.08)';e.target.style.boxShadow='none';}}/>
              </FormField>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Documents"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FileUpload label="Check Copy" existing={existing.check} onChange={f=>setFiles(p=>({...p,check:f}))}/>
              <FileUpload label="Bond Copy" existing={existing.bond} onChange={f=>setFiles(p=>({...p,bond:f}))}/>
            </div>
          </Card>
          <div style={{display:'flex',gap:10}}>
            <Button type="submit" disabled={loading}>{loading?'Saving…':isEdit?'Update Depositor':'Add Depositor'}</Button>
            <Button variant="secondary" onClick={()=>nav('/fl/depositors')}>Cancel</Button>
          </div>
        </form>

        {/* Summary sidebar */}
        <div style={{position:'sticky',top:24,display:'flex',flexDirection:'column',gap:14}}>
          <Card>
            <SectionHeader title="Interest Summary"/>
            <InfoRow label="Principal" value={form.depositAmount?formatCurrency(parseFloat(form.depositAmount)):'—'}/>
            <InfoRow label="Annual Rate" value={form.interestRate?`${form.interestRate}% p.a.`:'—'}/>
            <InfoRow label="Type" value={form.compounding?'Compound':'Simple'}/>
            <InfoRow label="Payout Every" value={form.interestTenure?tenureLabel:'—'}/>
            <Divider/>
            <div style={{padding:'14px',background:'rgba(0,122,255,0.06)',borderRadius:12,textAlign:'center',marginTop:4}}>
              <p style={{fontSize:12,color:'var(--accent)',fontWeight:500,marginBottom:4}}>Each Payout Amount</p>
              <p style={{fontSize:26,fontWeight:700,color:'var(--accent)',letterSpacing:'-0.02em'}}>
                {periodInterest>0?formatCurrency(Math.round(periodInterest)):'₹0'}
              </p>
              <p style={{fontSize:11,color:'var(--text-secondary)',marginTop:3}}>{tenureLabel}</p>
            </div>
          </Card>

          {schedule.length>0&&(
            <Card>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <p style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>Payout Schedule</p>
                <p style={{fontSize:11,color:'var(--text-secondary)'}}>{schedule.length} payouts total</p>
              </div>
              {displayPayouts.map((p,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 10px',borderRadius:9,background:i%2===0?'rgba(118,118,128,0.04)':'transparent',marginBottom:2}}>
                  <div>
                    <p style={{fontSize:12.5,fontWeight:500,color:'var(--text-primary)'}}>{p.dueDate}</p>
                    <p style={{fontSize:10.5,color:'var(--text-secondary)'}}>Payout #{p.idx}</p>
                  </div>
                  <span style={{fontSize:14,fontWeight:700,color:'var(--green)'}}>{formatCurrency(p.interest)}</span>
                </div>
              ))}
              {schedule.length>6&&(
                <button onClick={()=>setShowAllPayouts(s=>!s)}
                  style={{width:'100%',padding:'8px',background:'none',border:'1px solid rgba(0,122,255,0.2)',borderRadius:8,color:'var(--accent)',fontSize:12,cursor:'pointer',marginTop:6,fontFamily:'inherit'}}>
                  {showAllPayouts?'Show Less':'Show All '+schedule.length+' Payouts'}
                </button>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function FileUpload({label,existing,onChange}){
  const[name,setName]=useState('');
  const hasFile=!!name||!!existing;
  return(
    <div>
      <p style={{fontSize:13,fontWeight:500,color:'var(--text-primary)',marginBottom:6}}>{label}</p>
      <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:hasFile?'rgba(52,199,89,0.06)':'rgba(118,118,128,0.06)',border:`1.5px dashed ${hasFile?'#34c759':'rgba(0,0,0,0.15)'}`,borderRadius:12,cursor:'pointer',transition:'all 0.2s'}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasFile?'#34c759':'#6e6e73'} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span style={{fontSize:13,color:hasFile?'#34c759':'#6e6e73',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name||(existing?'✓ File uploaded':`Upload ${label}`)}</span>
        <input type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{if(e.target.files[0]){setName(e.target.files[0].name);onChange(e.target.files[0]);}}}/>
      </label>
      {existing&&!name&&<button type="button" onClick={()=>openDocument(existing,'Document')} style={{color:'var(--accent)',fontSize:11,marginTop:4,background:'none',border:'none',cursor:'pointer',padding:0,display:'block',fontFamily:'inherit'}}>View existing file →</button>}
    </div>
  );
}
