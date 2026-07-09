import React,{useState,useEffect} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {collection,addDoc,doc,getDoc,updateDoc,serverTimestamp,getDocs} from 'firebase/firestore';
import {db} from '../../firebase/config';
import {uploadDocumentFile,openDocument} from '../../utils/fileStore';
import {saveBorrowerDocs,getBorrowerDocs} from '../../utils/borrowerFiles';
import toast from 'react-hot-toast';
import {Button,FormField,Input,Select,Card,PageHeader,SectionHeader,InfoRow,Divider,formatCurrency} from '../../components/finledger/UI';

function genId(){return 'LOAN-'+Date.now().toString(36).toUpperCase();}

export default function BorrowerForm(){
  const{id}=useParams();const nav=useNavigate();const isEdit=!!id;
  const[photoPreview,setPhotoPreview]=useState(null);
  const[form,setForm]=useState({photo:null,
    loanId:genId(), borrowerName:'', phone:'', email:'', address:'',
    loanAmount:'', interestRate:'', loanStartDate:'', agreementDate:'', agreementExpiryDate:'',
    securityType:'Documents Collected', securityTypeOther:'', securityValue:'', status:'Active', notes:'',
    // Guardian details
    guardianName:'', guardianPhone:'', guardianAddress:''
  });
  const[files,setFiles]=useState({check:null,bond:null,agreement:null,land:null});
  const[existing,setExisting]=useState({});
  const[loading,setLoading]=useState(false);

  useEffect(()=>{if(isEdit)loadData();},[]);// eslint-disable-line

  async function loadData(){
    const s=await getDoc(doc(db,'borrower_master',id));
    if(s.exists()){
      const d=s.data();
      setForm({
        loanId:d.loanId||id, borrowerName:d.borrowerName||'', phone:d.phone||'',
        email:d.email||'', address:d.address||'', loanAmount:d.loanAmount||'',
        interestRate:d.interestRate||'', loanStartDate:d.loanStartDate||'',
        agreementDate:d.agreementDate||'',
        agreementExpiryDate:d.agreementExpiryDate||'',
        securityType:d.securityType||'Documents Collected', securityTypeOther:d.securityTypeOther||'',
        securityValue:d.securityValue||'', status:d.status||'Active', notes:d.notes||'',
        guardianName:d.guardianName||'', guardianPhone:d.guardianPhone||'', guardianAddress:d.guardianAddress||''
      });
      const bd=await getBorrowerDocs(id);
      setExisting({check:bd.check||d.checkCopyUrl,bond:bd.bond||d.bondCopyUrl,agreement:bd.agreement||d.agreementCopyUrl,land:bd.land||d.landDocumentsUrl});
      if(d.photo){setPhotoPreview(d.photo);set('photo',d.photo);}
    }
  }

  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const[custs,setCusts]=useState([]);const[custQ,setCustQ]=useState('');const[linkedUser,setLinkedUser]=useState(null);
  useEffect(()=>{getDocs(collection(db,'customer_master')).then(s=>setCusts(s.docs.map(d=>({id:d.id,...d.data()})))).catch(()=>{});},[]);


  async function handlePhoto(file){
    if(!file)return;
    if(file.size>2*1024*1024){toast.error('Photo under 2MB only');return;}
    const r=await uploadDocumentFile(file);
    setPhotoPreview(r.dataUrl); set('photo',r.dataUrl);
  }

  async function submit(e){
    e.preventDefault();
    if(!isEdit&&!linkedUser) return toast.error('Select an existing User first — loans can only be created for a linked User.');
    if(!form.borrowerName||!form.phone||!form.loanAmount||!form.interestRate||!form.loanStartDate)
      return toast.error('Fill all required fields');
    if(!isEdit&&!files.check&&!existing.check) return toast.error('Check Copy is mandatory');
    if(!isEdit&&!files.bond&&!existing.bond) return toast.error('Bond Copy is mandatory');
    if(!isEdit&&!files.agreement&&!existing.agreement) return toast.error('Agreement Copy is mandatory');
    setLoading(true);
    try{
      const toDataUrl=async(file)=>{if(!file)return null;const r=await uploadDocumentFile(file);return r.dataUrl;};
      const[cu,bu,au,lu]=await Promise.all([
        files.check?toDataUrl(files.check):Promise.resolve(existing.check||null),
        files.bond?toDataUrl(files.bond):Promise.resolve(existing.bond||null),
        files.agreement?toDataUrl(files.agreement):Promise.resolve(existing.agreement||null),
        files.land?toDataUrl(files.land):Promise.resolve(existing.land||null),
      ]);
      const monthly=(parseFloat(form.loanAmount)||0)*(parseFloat(form.interestRate)||0)/100;
      const data={
        ...form, loanAmount:parseFloat(form.loanAmount),
        interestRate:parseFloat(form.interestRate),
        securityValue:parseFloat(form.securityValue)||0,
        monthlyInterest:monthly,
        hasCheck:!!cu, hasBond:!!bu, hasAgreement:!!au, hasLand:!!lu,
        checkCopyUrl:null, bondCopyUrl:null, agreementCopyUrl:null, landDocumentsUrl:null,
        updatedAt:serverTimestamp()
      };
      let bid=id;
      if(isEdit){await updateDoc(doc(db,'borrower_master',id),data);}
      else{
        data.createdAt=serverTimestamp();
        const ref=await addDoc(collection(db,'borrower_master'),data);
        bid=ref.id;
        // Milestone: Loan Created — notable lifecycle event for Journal
        await addDoc(collection(db,'finance_ledger_entries'),{
          type:'Milestone', category:'Loan Created',
          description:`Loan created — ${form.borrowerName} · ${form.loanId||''}`.trim(),
          amount:parseFloat(form.loanAmount)||0, date:form.loanStartDate||new Date().toISOString().split('T')[0],
          borrowerName:form.borrowerName, borrowerId:bid, loanId:form.loanId||bid,
          createdAt:serverTimestamp()
        });
      }
      await saveBorrowerDocs(bid,{check:cu,bond:bu,agreement:au,land:lu});
      toast.success(isEdit?'Borrower updated!':'Borrower added!');
      nav('/fl/borrowers');
    }catch(e){console.error(e);toast.error('Failed: '+e.message);}finally{setLoading(false);}
  }

  const monthly=(parseFloat(form.loanAmount)||0)*(parseFloat(form.interestRate)||0)/100;
  const coverage=form.securityValue&&form.loanAmount?((parseFloat(form.securityValue)/parseFloat(form.loanAmount))*100).toFixed(0):null;
  const adequate=coverage&&parseFloat(coverage)>=100;

  return(
    <div className="page-enter">
      <PageHeader title={isEdit?'Edit Borrower':'New Borrower'} subtitle={isEdit?`Loan ${form.loanId}`:'Register a new loan account'}
        action={<Button variant="ghost" onClick={()=>nav('/fl/borrowers')}>← Back</Button>}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20,alignItems:'start'}}>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Loan Details */}
          {/* Photo Upload */}
          <Card style={{padding:'16px 20px'}}>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <div style={{width:60,height:60,borderRadius:'50%',background:'rgba(118,118,128,0.1)',border:'2px dashed rgba(0,122,255,0.3)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
                {photoPreview?<img src={photoPreview} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(0,122,255,0.5)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
              </div>
              <div>
                <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>Borrower Photo</p>
                <label style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',background:'var(--accent)',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,color:'#fff'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {photoPreview?'Change Photo':'Upload Photo'}
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>e.target.files[0]&&handlePhoto(e.target.files[0])}/>
                </label>
                {photoPreview&&<button type="button" onClick={()=>{setPhotoPreview(null);set('photo',null);}} style={{marginLeft:8,fontSize:11,color:'#ff3b30',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit'}}>Remove</button>}
              </div>
            </div>
          </Card>
          <Card>
            <SectionHeader title="Loan Details"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FormField label="Loan ID"><Input value={form.loanId} disabled style={{color:'var(--accent)',fontWeight:600}}/></FormField>
              <FormField label="Status" required><Select value={form.status} onChange={e=>set('status',e.target.value)}><option>Active</option><option>Closed</option><option>Non-Active</option></Select></FormField>
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
                  <button type="button" onClick={()=>{setLinkedUser(null);set('borrowerName','');set('phone','');set('customerId','');}} style={{fontSize:12,color:'#ff3b30',background:'none',border:'1px solid rgba(255,59,48,0.3)',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontFamily:'inherit',flexShrink:0}}>Change</button>
                </div>
              ) : (
                <>
                  <input value={custQ} onChange={e=>setCustQ(e.target.value)} placeholder="Search by user name, phone or ID…" style={{width:'100%',boxSizing:'border-box',height:36,padding:'0 12px',borderRadius:9,border:'1px solid rgba(0,0,0,0.12)',fontSize:13,fontFamily:'inherit',outline:'none'}}/>
                  {custQ.trim()&&(
                    <div style={{marginTop:8,display:'grid',gap:4,maxHeight:180,overflowY:'auto'}}>
                      {custs.filter(cc=>[cc.name,cc.phone,cc.customerId].some(v=>String(v||'').toLowerCase().includes(custQ.trim().toLowerCase()))).slice(0,6).map(cc=>(
                        <div key={cc.id} onClick={()=>{setLinkedUser(cc);set('borrowerName',cc.name||'');set('phone',cc.phone||'');set('customerId',cc.id);setCustQ('');}} style={{padding:'8px 10px',borderRadius:8,background:'#fff',border:'1px solid rgba(0,0,0,0.08)',cursor:'pointer',fontSize:13}}>
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
              <FormField label="Borrower Name" required><Input value={form.borrowerName} onChange={e=>set('borrowerName',e.target.value)} placeholder="Full name" disabled={!!linkedUser}/></FormField>
              <FormField label="Phone Number" required><Input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="9876543210" type="tel"/></FormField>
              <FormField label="Email"><Input value={form.email} onChange={e=>set('email',e.target.value)} placeholder="email@example.com" type="email"/></FormField>
              <FormField label="Loan Amount (₹)" required><Input value={form.loanAmount} onChange={e=>set('loanAmount',e.target.value)} placeholder="500000" type="number" min="1"/></FormField>
              <FormField label="Interest Rate (% per month)" required><Input value={form.interestRate} onChange={e=>set('interestRate',e.target.value)} placeholder="2" type="number" step="0.01" min="0"/></FormField>
              <FormField label="Loan Start Date" required><Input value={form.loanStartDate} onChange={e=>set('loanStartDate',e.target.value)} type="date"/></FormField>
              <FormField label="Agreement Date" hint="Date the agreement was signed">
                <Input value={form.agreementDate} onChange={e=>set('agreementDate',e.target.value)} type="date"/>
              </FormField>
              <FormField label="Agreement Expiry Date" hint="When the agreement expires — used for alerts">
                <Input value={form.agreementExpiryDate||''} onChange={e=>set('agreementExpiryDate',e.target.value)} type="date"/>
              </FormField>
            </div>
            <div style={{marginTop:12}}>
              <FormField label="Address"><Input value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Full address"/></FormField>
            </div>
            <div style={{marginTop:12}}>
              <FormField label="Notes">
                <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Loan purpose, terms…"
                  style={{padding:'10px 12px',background:'rgba(118,118,128,0.08)',border:'1.5px solid rgba(0,0,0,0.08)',borderRadius:10,fontSize:14,color:'var(--text-primary)',outline:'none',width:'100%',minHeight:72,resize:'vertical',fontFamily:'inherit'}}
                  onFocus={e=>{e.target.style.borderColor='#007aff';e.target.style.boxShadow='0 0 0 3px rgba(0,122,255,0.12)';}}
                  onBlur={e=>{e.target.style.borderColor='rgba(0,0,0,0.08)';e.target.style.boxShadow='none';}}/>
              </FormField>
            </div>
          </Card>

          {/* Guardian Details */}
          <Card>
            <SectionHeader title="Guardian Details" action={<span style={{fontSize:11,color:'var(--text-secondary)'}}>Optional</span>}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FormField label="Guardian Name"><Input value={form.guardianName} onChange={e=>set('guardianName',e.target.value)} placeholder="Guardian's full name"/></FormField>
              <FormField label="Guardian Mobile"><Input value={form.guardianPhone} onChange={e=>set('guardianPhone',e.target.value)} placeholder="9876543210" type="tel"/></FormField>
            </div>
            <div style={{marginTop:12}}>
              <FormField label="Guardian Address"><Input value={form.guardianAddress} onChange={e=>set('guardianAddress',e.target.value)} placeholder="Guardian's full address"/></FormField>
            </div>
          </Card>

          {/* Security Details */}
          <Card>
            <SectionHeader title="Security Details"/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FormField label="Security Type">
                <Select value={form.securityType} onChange={e=>set('securityType',e.target.value)}>
                  <option>Documents Collected</option>
                  <option>Property Registered to Company</option>
                  <option>Gold</option>
                  <option>Vehicle</option>
                  <option>Other</option>
                </Select>
              </FormField>
              <FormField label="Security Value (₹)"><Input value={form.securityValue} onChange={e=>set('securityValue',e.target.value)} placeholder="1000000" type="number" min="0"/></FormField>
            </div>
            {form.securityType==='Other'&&(
              <div style={{marginTop:12}}>
                <FormField label="Specify Security Type" required>
                  <Input value={form.securityTypeOther} onChange={e=>set('securityTypeOther',e.target.value)} placeholder="e.g. Fixed Deposit, Machinery, Jewellery…"/>
                </FormField>
              </div>
            )}
            {coverage&&(
              <div style={{marginTop:12,padding:'12px 14px',borderRadius:10,background:adequate?'rgba(52,199,89,0.08)':'rgba(255,59,48,0.08)',border:`1px solid ${adequate?'rgba(52,199,89,0.2)':'rgba(255,59,48,0.2)'}`}}>
                <p style={{fontSize:13,color:adequate?'#1a7a34':'#c0392b',fontWeight:600}}>
                  {adequate?'✓':'⚠'} Security Coverage: {coverage}% — {adequate?'Adequate':'Insufficient'}
                </p>
              </div>
            )}
          </Card>

          {/* Security Documents */}
          <Card>
            <SectionHeader title="Security Documents"/>
            <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:14}}>Check Copy, Bond Copy and Agreement are mandatory for new loans</p>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <FileUpload label="Check Copy *" existing={existing.check} onChange={f=>setFiles(p=>({...p,check:f}))} required onView={()=>openDocument(existing.check,'Check Copy')}/>
              <FileUpload label="Bond Copy *" existing={existing.bond} onChange={f=>setFiles(p=>({...p,bond:f}))} required onView={()=>openDocument(existing.bond,'Bond Copy')}/>
              <FileUpload label="Agreement Copy *" existing={existing.agreement} onChange={f=>setFiles(p=>({...p,agreement:f}))} required onView={()=>openDocument(existing.agreement,'Agreement')}/>
              <FileUpload label="Land Documents" existing={existing.land} onChange={f=>setFiles(p=>({...p,land:f}))} onView={()=>openDocument(existing.land,'Land Documents')}/>
            </div>
          </Card>

          <div style={{display:'flex',gap:10}}>
            <Button type="submit" disabled={loading}>{loading?'Saving…':isEdit?'Update Borrower':'Add Borrower'}</Button>
            <Button variant="secondary" onClick={()=>nav('/fl/borrowers')}>Cancel</Button>
          </div>
        </form>

        {/* Summary */}
        <div style={{position:'sticky',top:24}}>
          <Card>
            <SectionHeader title="Loan Summary"/>
            <InfoRow label="Loan Amount" value={form.loanAmount?formatCurrency(parseFloat(form.loanAmount)):'—'}/>
            <InfoRow label="Monthly Rate" value={form.interestRate?`${form.interestRate}%`:'—'} color="#ff9500"/>
            <InfoRow label="Security Value" value={form.securityValue?formatCurrency(parseFloat(form.securityValue)):'—'} color="#5856d6"/>
            {coverage&&<InfoRow label="Coverage" value={`${coverage}%`} color={adequate?'#34c759':'#ff3b30'}/>}
            {form.agreementDate&&<InfoRow label="Agreement Date" value={form.agreementDate}/>}
            {form.agreementExpiryDate&&<InfoRow label="Agreement Expiry" value={form.agreementExpiryDate}/>}
            {form.guardianName&&<InfoRow label="Guardian" value={form.guardianName}/>}
            <Divider/>
            <div style={{marginTop:4,padding:'14px',background:'rgba(52,199,89,0.06)',borderRadius:12,textAlign:'center'}}>
              <p style={{fontSize:12,color:'var(--green)',fontWeight:500,marginBottom:4}}>Monthly Interest</p>
              <p style={{fontSize:28,fontWeight:700,color:'var(--green)',letterSpacing:'-0.02em'}}>{monthly>0?formatCurrency(Math.round(monthly)):'₹0'}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FileUpload({label,existing,onChange,required,onView}){
  const[name,setName]=useState('');
  const hasFile=!!name||!!existing;
  return(
    <div>
      <p style={{fontSize:13,fontWeight:500,color:'var(--text-primary)',marginBottom:6}}>{label}</p>
      <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',background:hasFile?'rgba(52,199,89,0.06)':'rgba(118,118,128,0.06)',border:`1.5px dashed ${hasFile?'#34c759':required?'rgba(255,59,48,0.3)':'rgba(0,0,0,0.15)'}`,borderRadius:12,cursor:'pointer',transition:'all 0.2s'}}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={hasFile?'#34c759':'#6e6e73'} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span style={{fontSize:13,color:hasFile?'#34c759':'#6e6e73',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name||(existing?'✓ Uploaded':`Upload ${label.replace(' *','')}`)}</span>
        <input type="file" accept="image/*,.pdf,.doc,.docx" style={{display:'none'}} onChange={e=>{if(e.target.files[0]){setName(e.target.files[0].name);onChange(e.target.files[0]);}}}/>
      </label>
      {existing&&!name&&<button type="button" onClick={onView} style={{color:'var(--accent)',fontSize:11,marginTop:4,background:'none',border:'none',cursor:'pointer',padding:0,fontFamily:'inherit'}}>View existing →</button>}
    </div>
  );
}
