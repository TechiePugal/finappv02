import React,{useState} from 'react';
import {PageHeader,Card,Button,SectionHeader} from '../../components/finledger/UI';
import {backupAllData,restoreFromBackup,deleteAllFinanceData} from '../../utils/fl_firestore';
import {useAuth} from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function BackupRestore(){
  const {user}=useAuth();
  const [backing,setBacking]=useState(false);
  const [restoring,setRestoring]=useState(false);
  const [lastBackup,setLastBackup]=useState(null);
  const [wiping,setWiping]=useState(false);
  const [wipeProgress,setWipeProgress]=useState(null);
  const [confirmText,setConfirmText]=useState('');
  const CONFIRM_PHRASE='DELETE ALL';

  // ── Development-purpose full reset — wipes every Finance Ledger record for
  // THIS account (depositors, borrowers, payments, EMI, expenses, ledger — every
  // collection this module writes to), scoped the exact same way the rest of the
  // app already scopes data (yours if createdBy matches, or it predates the
  // ownership field). Other modules and other accounts are never touched. ──
  async function doDeleteAll(){
    if(confirmText.trim()!==CONFIRM_PHRASE)return toast.error(`Type "${CONFIRM_PHRASE}" exactly to confirm`);
    if(!window.confirm('This permanently deletes ALL Finance Ledger data for your account — every depositor, borrower, payment, EMI loan, expense and ledger entry. This CANNOT be undone.\n\nStrongly recommended: download a backup first.\n\nProceed?'))return;
    setWiping(true);setWipeProgress({collection:'starting…',deletedSoFar:0});
    try{
      const total=await deleteAllFinanceData(user?.uid,p=>setWipeProgress(p));
      toast.success(`✓ Wiped ${total} records — Finance Ledger is now empty`);
      setConfirmText('');
    }catch(e){toast.error('Delete failed: '+e.message);}
    finally{setWiping(false);setWipeProgress(null);}
  }

  async function doBackup(){
    setBacking(true);
    try{
      toast.loading('Exporting all data…',{id:'bk'});
      const data=await backupAllData();
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;
      a.download=`finledger_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();URL.revokeObjectURL(url);
      const total=Object.values(data.data).reduce((s,v)=>s+v.length,0);
      setLastBackup({time:new Date().toLocaleString('en-IN'),records:total});
      toast.success(`Backup complete! ${total} records exported.`,{id:'bk'});
    }catch(e){toast.error('Backup failed: '+e.message,{id:'bk'});}
    finally{setBacking(false);}
  }

  async function doRestore(e){
    const file=e.target.files[0];if(!file)return;
    if(!window.confirm('⚠️ This will overwrite existing data with the backup. Continue?'))return;
    setRestoring(true);
    try{
      toast.loading('Restoring data…',{id:'rs'});
      const text=await file.text();
      const data=JSON.parse(text);
      const count=await restoreFromBackup(data);
      toast.success(`Restored ${count} records successfully!`,{id:'rs'});
    }catch(e){toast.error('Restore failed: '+e.message,{id:'rs'});}
    finally{setRestoring(false);e.target.value='';}
  }

  const cols=[
    {label:'deposit_master',desc:'Investor deposit accounts'},
    {label:'borrower_master',desc:'Loan borrower accounts'},
    {label:'borrower_interest_payments',desc:'Monthly interest payment records'},
    {label:'deposit_payments',desc:'Depositor interest payout records'},
    {label:'finance_ledger_entries',desc:'Full financial audit trail'},
    {label:'deposit_interest_schedule',desc:'Auto-generated payout schedules'},
  ];

  return(
    <div className="page-enter">
      <PageHeader title="Backup & Restore" subtitle="Export and import your complete financial data securely"/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        <Card>
          <SectionHeader title="Export Backup"/>
          <p style={{fontSize:14,color:'var(--text-secondary)',marginBottom:20,lineHeight:1.6}}>Download a complete JSON backup of all your data — depositors, borrowers, payments, ledger entries, and schedules. Store this file securely offline.</p>
          <div style={{padding:'16px',background:'rgba(52,199,89,0.06)',borderRadius:12,marginBottom:20}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <p style={{fontSize:13,fontWeight:600,color:'#1a7a34'}}>Encrypted & Timestamped</p>
            </div>
            <p style={{fontSize:12,color:'var(--text-secondary)'}}>Backup includes all 6 Firestore collections with full audit metadata</p>
          </div>
          {lastBackup&&(
            <div style={{padding:'12px 14px',background:'rgba(118,118,128,0.06)',borderRadius:10,marginBottom:16}}>
              <p style={{fontSize:12,color:'var(--text-secondary)'}}>Last backup: <strong style={{color:'var(--text-primary)'}}>{lastBackup.time}</strong></p>
              <p style={{fontSize:12,color:'var(--text-secondary)'}}>{lastBackup.records} records exported</p>
            </div>
          )}
          <Button onClick={doBackup} disabled={backing} style={{width:'100%',justifyContent:'center'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {backing?'Exporting…':'Download Backup'}
          </Button>
        </Card>

        <Card>
          <SectionHeader title="Restore from Backup"/>
          <p style={{fontSize:14,color:'var(--text-secondary)',marginBottom:20,lineHeight:1.6}}>Upload a previously downloaded backup file to restore your data. This will merge and update existing records.</p>
          <div style={{padding:'16px',background:'rgba(255,59,48,0.06)',borderRadius:12,marginBottom:20,border:'1px solid rgba(255,59,48,0.1)'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p style={{fontSize:13,fontWeight:600,color:'#c0392b'}}>Caution</p>
            </div>
            <p style={{fontSize:12,color:'var(--text-secondary)'}}>Restoring will overwrite existing data. Download a fresh backup first before restoring.</p>
          </div>
          <label style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:'12px',border:'1.5px dashed rgba(0,0,0,0.15)',borderRadius:12,cursor:restoring?'not-allowed':'pointer',background:'rgba(118,118,128,0.04)',transition:'all 0.2s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#007aff'} onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(0,0,0,0.15)'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span style={{fontSize:14,color:'var(--text-secondary)'}}>{restoring?'Restoring…':'Select backup JSON file'}</span>
            <input type="file" accept=".json" style={{display:'none'}} disabled={restoring} onChange={doRestore}/>
          </label>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Database Collections"/>
        <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>All collections are included in every backup</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {cols.map(c=>(
            <div key={c.label} style={{padding:'14px',background:'rgba(118,118,128,0.04)',borderRadius:10,border:'1px solid var(--divider)'}}>
              <p style={{fontSize:12,fontFamily:'monospace',fontWeight:600,color:'#007aff',marginBottom:4}}>{c.label}</p>
              <p style={{fontSize:11,color:'var(--text-secondary)'}}>{c.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{marginTop:16,border:'1.5px solid rgba(255,59,48,0.25)'}}>
        <SectionHeader title="⚠️ Danger Zone — Delete All Finance Data"/>
        <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16,lineHeight:1.6}}>
          For development / testing purposes only. This permanently deletes every Finance Ledger
          record belonging to your account — depositors, borrowers, deposit &amp; loan payments,
          EMI loans, expenses, and ledger entries. Other modules (Chit Fund, Real Estate) and
          other accounts are never touched. <strong>This action cannot be undone.</strong>
        </p>
        <div style={{padding:'14px 16px',background:'rgba(255,59,48,0.06)',borderRadius:12,marginBottom:16,border:'1px solid rgba(255,59,48,0.15)'}}>
          <p style={{fontSize:12,color:'#c0392b',marginBottom:10}}>Download a backup first — once deleted, this data is gone.</p>
          <label style={{fontSize:12,color:'var(--text-secondary)',display:'block',marginBottom:6}}>
            Type <strong style={{fontFamily:'monospace',color:'var(--text-primary)'}}>{CONFIRM_PHRASE}</strong> to confirm
          </label>
          <input
            type="text" value={confirmText} onChange={e=>setConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE} disabled={wiping}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1.5px solid rgba(255,59,48,0.3)',fontSize:14,marginBottom:12,boxSizing:'border-box'}}
          />
          {wiping&&wipeProgress&&(
            <p style={{fontSize:12,color:'var(--text-secondary)',marginBottom:12}}>
              Deleting… {wipeProgress.collection} ({wipeProgress.deletedSoFar} records so far)
            </p>
          )}
          <Button
            onClick={doDeleteAll}
            disabled={wiping||confirmText.trim()!==CONFIRM_PHRASE}
            style={{width:'100%',justifyContent:'center',background:'#ff3b30',borderColor:'#ff3b30'}}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            {wiping?'Deleting all data…':'Delete All Finance Data'}
          </Button>
        </div>
      </Card>

      <Card style={{marginTop:16}}>
        <SectionHeader title="Security & Compliance"/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
          {[
            {icon:'🔒',title:'AES-256 Encryption',desc:'All sensitive data encrypted using Web Crypto API'},
            {icon:'🔐',title:'Session Tokens',desc:'Google Authenticator-style session IDs per login'},
            {icon:'📡',title:'Offline Mode',desc:'IndexedDB persistence for offline data access'},
            {icon:'☁️',title:'Firebase Security',desc:'Firestore rules require authenticated access only'},
            {icon:'🔄',title:'Real-time Sync',desc:'Automatic sync when connection restores'},
            {icon:'📋',title:'Audit Trail',desc:'Every transaction logged with timestamp'},
          ].map((s,i)=>(
            <div key={i} style={{padding:'14px',background:'rgba(118,118,128,0.04)',borderRadius:12}}>
              <p style={{fontSize:20,marginBottom:8}}>{s.icon}</p>
              <p style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>{s.title}</p>
              <p style={{fontSize:12,color:'var(--text-secondary)'}}>{s.desc}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
