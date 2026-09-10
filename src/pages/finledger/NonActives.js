/**
 * NonActives.js — a single page listing every Non-Active Loan and Non-Active
 * EMI Loan together, so nothing needing attention is scattered across two
 * separate pages. Reactivating a record here just flips its status back to
 * Active, in place — no need to go find it on its original page.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { scopeToUser } from '../../utils/scopeHelper';
import { PageHeader, Card, StatCard, Button, formatCurrency } from '../../components/finledger/UI';
import { PageLoader } from '../../components/Skeleton';
import toast from 'react-hot-toast';

export default function NonActives() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loans, setLoans] = useState([]);
  const [emiLoans, setEmiLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reactivating, setReactivating] = useState(null);

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'borrower_master'), snap => {
      setLoans(scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid).filter(b => b.status === 'Non-Active'));
      setLoading(false);
    }, () => setLoading(false));
    const u2 = onSnapshot(collection(db, 'emi_loans'), snap => {
      setEmiLoans(scopeToUser(snap.docs.map(d => ({ id: d.id, ...d.data() })), user?.uid).filter(l => l.status === 'Non-Active'));
    });
    return () => { u1(); u2(); };
  }, [user]);

  async function reactivate(collectionName, id, name) {
    setReactivating(id);
    try {
      await updateDoc(doc(db, collectionName, id), { status: 'Active' });
      toast.success(`${name} marked Active again`);
    } catch (e) { toast.error('Failed: ' + e.message); }
    finally { setReactivating(null); }
  }

  if (loading) return <PageLoader stats={3} />;

  const totalOutstandingLoans = loans.reduce((s, b) => s + (b.loanAmount || 0), 0);
  const totalOutstandingEmi = emiLoans.reduce((s, l) => s + (l.loanAmount || 0), 0);
  const totalInterestLoans = loans.reduce((s, b) => s + ((b.loanAmount || 0) * (b.interestRate || 0) / 100), 0);
  const totalInterestEmi = emiLoans.reduce((s, l) => s + ((l.loanAmount || 0) * (l.interestRate || 0) / 100), 0);

  return (
    <div className="page-enter">
      <PageHeader title="Non Actives" subtitle="Every Non-Active Loan and EMI Loan in one place — reactivate directly from here" />

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Non-Active Loans" value={loans.length} color="#ff453a" />
        <StatCard label="Non-Active EMI Loans" value={emiLoans.length} color="#ff453a" />
        <StatCard label="Total Outstanding (Both)" value={formatCurrency(totalOutstandingLoans + totalOutstandingEmi)} color="#ff9500" />
        <StatCard label="Monthly Interest (Both)" value={formatCurrency(Math.round(totalInterestLoans + totalInterestEmi))} color="#5856d6" />
      </div>

      {loans.length === 0 && emiLoans.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Nothing Non-Active right now</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Every loan and EMI loan is either Active or Closed.</div>
        </Card>
      ) : (
        <>
          {loans.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>📋 Loans ({loans.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {loans.map(b => (
                  <Card key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                    {b.photo ? <img src={b.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#ff453a', flexShrink: 0 }}>{(b.borrowerName || '?')[0].toUpperCase()}</div>}
                    <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => nav('/fl/borrowers')}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{b.borrowerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{b.loanId} · {b.phone} · {formatCurrency(b.loanAmount)} @ {b.interestRate}%/mo</div>
                    </div>
                    <Button size="sm" onClick={() => reactivate('borrower_master', b.id, b.borrowerName)} disabled={reactivating === b.id}>
                      {reactivating === b.id ? 'Activating…' : '✓ Reactivate'}
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
          {emiLoans.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>📆 EMI Loans ({emiLoans.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {emiLoans.map(l => (
                  <Card key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                    {l.photo ? <img src={l.photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,69,58,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#ff453a', flexShrink: 0 }}>{(l.borrowerName || '?')[0].toUpperCase()}</div>}
                    <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => nav('/fl/emi-loans')}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{l.borrowerName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{l.emiId} · {l.phone} · {formatCurrency(l.loanAmount)} · {l.paidPeriods || 0}/{l.totalPeriods || 0} periods</div>
                    </div>
                    <Button size="sm" onClick={() => reactivate('emi_loans', l.id, l.borrowerName)} disabled={reactivating === l.id}>
                      {reactivating === l.id ? 'Activating…' : '✓ Reactivate'}
                    </Button>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
