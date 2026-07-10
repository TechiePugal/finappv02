// src/pages/chitfund/BiddingNotes.js
// A pure SCRATCHPAD for live auctions — completely isolated from real chit
// processing. It reads chit_master / chit_auction_schedule / chit_members /
// chit_auction_results for VIEW ONLY, and writes only to its own
// 'chit_bidding_notes' collection (keyed per round). It never creates or
// changes any real auction result, payment, or ledger entry — it's a
// note-taking aid for FORMED chits only.
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { getMembers, getAuctionSchedule, getAllAuctionResults } from '../../utils/cf_firestore';
import { Card, PageHeader, Button } from '../../components/chitfund/UI';
import toast from 'react-hot-toast';

const tokens = { blue: '#007AFF', green: '#34C759', amber: '#FF9500', purple: '#5856D6', red: '#FF3B30', text: '#1C1C1E', textSub: '#6B7280', textMuted: '#9CA3AF', border: 'rgba(0,0,0,0.08)', slateLight: '#F9F9FB' };
const fmt = v => '₹' + Math.round(v || 0).toLocaleString('en-IN');
const fmtDate = d => { if (!d) return '—'; const dt = d?.seconds ? new Date(d.seconds * 1000) : new Date(d); return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };

// Fetch a round's SAVED notes fresh from Firestore and print them — works for ANY round
// (taken or not, currently open or not), independent of any in-memory editing state.
async function printRoundSummary(chit, round, members) {
  const noteKey = `${chit.id}_r${round.auctionNumber}`;
  const noteSnap = await getDoc(doc(db, 'chit_bidding_notes', noteKey));
  if (!noteSnap.exists()) { toast.error('No notes saved for this round yet.'); return; }
  const data = noteSnap.data();
  const bids = data.bids || {};
  const finalNote = data.finalNote || '';
  const takenMembers = members.filter(m => m.status === 'Taken');
  const notTakenMembers = members.filter(m => m.status !== 'Taken');
  const w = window.open('', '_blank');
  const takenRows = takenMembers.map(m => `<tr><td>${m.name}</td><td style="color:#1a7a34;font-weight:700;">Taken</td><td>—</td></tr>`).join('');
  const bidderRows = notTakenMembers.map(m => `<tr><td>${m.name}</td><td style="color:#b45309;font-weight:700;">Not Taken</td><td>${bids[m.id] ? '₹' + parseFloat(bids[m.id]).toLocaleString('en-IN') : '—'}</td></tr>`).join('');
  w.document.write(`<html><head><title>Bidding Notes — ${chit.companyName} Round #${round.auctionNumber}</title>
    <style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:19px;margin-bottom:2px}.meta{font-size:12px;color:#666;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f7f7f9}.note{margin-top:10px;padding:12px 14px;background:#EEF2FF;border-radius:8px;font-weight:700;color:#5856D6}</style>
    </head><body>
    <h1>${chit.companyName} — Bidding Notes</h1>
    <div class="meta">Round #${round.auctionNumber} · Saved ${data.updatedAt?.seconds ? new Date(data.updatedAt.seconds * 1000).toLocaleString('en-IN') : ''} · Scratchpad only — not an official record</div>
    <table><thead><tr><th>Member</th><th>Status</th><th>Bid / Notes</th></tr></thead><tbody>${takenRows}${bidderRows}</tbody></table>
    ${finalNote ? `<div class="note">${finalNote}</div>` : ''}
    <script>window.print()</script>
    </body></html>`);
  w.document.close();
}


export default function BiddingNotes() {
  const { user } = useAuth();
  const [chits, setChits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChit, setSelectedChit] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [results, setResults] = useState([]);
  const [members, setMembers] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null); // schedule entry being noted

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'chit_master'), where('createdBy', '==', user.uid)))
      .then(s => { setChits(s.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  async function selectChit(chit) {
    setSelectedChit(chit);
    setSelectedRound(null);
    setScheduleLoading(true);
    try {
      const [sched, res, mem] = await Promise.all([
        getAuctionSchedule(chit.id),
        getAllAuctionResults(chit.id),
        getMembers(chit.id),
      ]);
      setSchedule(sched); setResults(res); setMembers(mem);
    } catch (e) { toast.error('Failed to load: ' + e.message); }
    setScheduleLoading(false);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: tokens.textSub }}>Loading chits…</div>;

  return (
    <div>
      <PageHeader title="Bidding Notes" subtitle="Live-auction scratchpad, view-only for members and results — notes are kept separate from all financial records." />

      {!selectedChit ? (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text, marginBottom: 12 }}>Select a Chit Fund</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {chits.length === 0 && <div style={{ color: tokens.textSub, fontSize: 13, padding: 12 }}>No formed chits yet.</div>}
            {chits.map(c => (
              <div key={c.id} onClick={() => selectChit(c)}
                style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', background: tokens.slateLight, border: '1px solid transparent' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = tokens.blue + '40'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text }}>{c.companyName}</div>
                <div style={{ fontSize: 12, color: tokens.textSub, marginTop: 2 }}>{c.totalMembers} members · {c.auctionsCompleted || 0}/{c.totalMembers} rounds completed</div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <button onClick={() => { setSelectedChit(null); setSelectedRound(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: tokens.blue, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, padding: 0 }}>
            ← All Chits
          </button>

          {scheduleLoading ? (
            <Card><div style={{ padding: 30, textAlign: 'center', color: tokens.textSub }}>Loading schedule…</div></Card>
          ) : (
            <>
              {/* Round cards — EMI-schedule style grid */}
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.text }}>{selectedChit.companyName} — Auction Rounds</div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(255,149,0,0.12)', color: '#92400E' }}>VIEW ONLY — no real actions here</span>
                </div>
                <div style={{ fontSize: 12, color: tokens.textSub, marginBottom: 14 }}>Click any not-yet-taken round to open the live bidding notes for it.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                  {schedule.map(s => {
                    const result = results.find(r => r.auctionNumber === s.auctionNumber);
                    const isTaken = s.status === 'Completed';
                    const isSelected = selectedRound?.auctionNumber === s.auctionNumber;
                    return (
                      <div key={s.id} onClick={() => !isTaken ? setSelectedRound(isSelected ? null : s) : null}
                        style={{
                          padding: '12px 14px', borderRadius: 12, cursor: isTaken ? 'default' : 'pointer', position: 'relative',
                          background: isTaken ? 'rgba(52,199,89,0.05)' : isSelected ? 'rgba(0,122,255,0.08)' : '#fff',
                          border: `1.5px solid ${isTaken ? 'rgba(52,199,89,0.25)' : isSelected ? tokens.blue + '55' : tokens.border}`,
                        }}>
                        <button onClick={e => { e.stopPropagation(); printRoundSummary(selectedChit, s, members); }}
                          title="Download / print this round's saved bidding notes"
                          style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.05)', color: tokens.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
                          🖨
                        </button>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isTaken ? '#1a7a34' : isSelected ? tokens.blue : tokens.text, marginBottom: 4 }}>Round #{s.auctionNumber}</div>
                        <div style={{ fontSize: 11, color: tokens.textSub, marginBottom: 6 }}>{fmtDate(s.auctionDate)}</div>
                        {isTaken ? (
                          <>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#1a7a34' }}>{result?.winnerName || s.winnerName || '—'}</div>
                            <div style={{ fontSize: 11, color: tokens.textSub }}>Bid: {fmt(result?.bidAmount ?? s.bidAmount)}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: tokens.amber }}>Not taken</div>
                        )}
                      </div>
                    );
                  })}
                  {schedule.length === 0 && <div style={{ color: tokens.textSub, fontSize: 13 }}>No schedule found for this chit.</div>}
                </div>
              </Card>

              {/* Previous Winners — history, view only */}
              {results.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: tokens.text, marginBottom: 4 }}>Previous Winners</div>
                  <div style={{ fontSize: 12, color: tokens.textSub, marginBottom: 12 }}>Who's already taken the chit, their bid, and what they received in hand.</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {results.sort((a, b) => a.auctionNumber - b.auctionNumber).map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 9, background: tokens.slateLight, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: tokens.textMuted, width: 60, flexShrink: 0 }}>#{r.auctionNumber}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: tokens.text, flex: 1, minWidth: 100 }}>{r.winnerName}</span>
                        <span style={{ fontSize: 12, color: tokens.textSub }}>Bid: <strong style={{ color: tokens.text }}>{fmt(r.bidAmount)}</strong></span>
                        <span style={{ fontSize: 12, color: tokens.green, fontWeight: 700 }}>In-hand: {fmt((selectedChit.totalChitValue || 0) - (r.bidAmount || 0))}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Live bidding notes for the selected not-taken round */}
              {selectedRound && (
                <LiveBiddingPanel
                  chit={selectedChit}
                  round={selectedRound}
                  members={members.filter(m => m.status !== 'Taken')}
                  takenMembers={members.filter(m => m.status === 'Taken')}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Live bidding notes for one not-yet-taken round ──────────────────────────
function LiveBiddingPanel({ chit, round, members, takenMembers }) {
  const { user } = useAuth();
  const [bids, setBids] = useState({}); // memberId -> string amount
  const [finalNote, setFinalNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);
  const noteKey = `${chit.id}_r${round.auctionNumber}`;

  useEffect(() => {
    setBids({}); setFinalNote(''); setLoadedAt(null);
    getDoc(doc(db, 'chit_bidding_notes', noteKey)).then(s => {
      if (s.exists()) {
        setBids(s.data().bids || {});
        setFinalNote(s.data().finalNote || '');
        setLoadedAt(s.data().updatedAt?.seconds ? new Date(s.data().updatedAt.seconds * 1000) : null);
      }
    }).catch(() => {});
  }, [noteKey]); //eslint-disable-line

  function setBid(memberId, val) {
    setBids(prev => ({ ...prev, [memberId]: val }));
  }

  function determineWinner() {
    let top = null;
    for (const m of members) {
      const v = parseFloat(bids[m.id]);
      if (!isNaN(v) && (top === null || v > top.amount)) top = { name: m.name, amount: v };
    }
    if (!top) { toast.error('Enter at least one bid amount first.'); return; }
    setFinalNote(`🏆 Highest bidder: ${top.name} — ₹${top.amount.toLocaleString('en-IN')}`);
  }

  function printSummary() {
    const w = window.open('', '_blank');
    const takenRows = takenMembers.map(m => `<tr><td>${m.name}</td><td style="color:#1a7a34;font-weight:700;">Taken</td><td>—</td></tr>`).join('');
    const bidderRows = members.map(m => `<tr><td>${m.name}</td><td style="color:#b45309;font-weight:700;">Not Taken</td><td>${bids[m.id] ? '₹' + parseFloat(bids[m.id]).toLocaleString('en-IN') : '—'}</td></tr>`).join('');
    w.document.write(`<html><head><title>Bidding Notes — ${chit.companyName} Round #${round.auctionNumber}</title>
      <style>body{font-family:Arial;padding:24px;color:#111}h1{font-size:19px;margin-bottom:2px}.meta{font-size:12px;color:#666;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}td,th{padding:8px 10px;border-bottom:1px solid #eee;text-align:left}th{background:#f7f7f9}.note{margin-top:10px;padding:12px 14px;background:#EEF2FF;border-radius:8px;font-weight:700;color:#5856D6}</style>
      </head><body>
      <h1>${chit.companyName} — Bidding Notes</h1>
      <div class="meta">Round #${round.auctionNumber} · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · Scratchpad only — not an official record</div>
      <table><thead><tr><th>Member</th><th>Status</th><th>Bid / Notes</th></tr></thead><tbody>${takenRows}${bidderRows}</tbody></table>
      ${finalNote ? `<div class="note">${finalNote}</div>` : ''}
      <script>window.print()</script>
      </body></html>`);
    w.document.close();
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await setDoc(doc(db, 'chit_bidding_notes', noteKey), {
        chitId: chit.id, chitName: chit.companyName, auctionNumber: round.auctionNumber,
        bids, finalNote, updatedBy: user.uid, updatedAt: serverTimestamp(),
      });
      setLoadedAt(new Date());
      toast.success('Bidding notes saved — scratchpad only, no financial records affected.');
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    setSaving(false);
  }

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: tokens.text }}>Round #{round.auctionNumber} — Live Bidding Notes</div>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'rgba(0,122,255,0.1)', color: tokens.blue }}>{members.length} bidder{members.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ fontSize: 12, color: tokens.textSub, marginBottom: 14 }}>
        Enter each member's live bid as the auction happens, one by one — this is just for your own note-taking. It doesn't create or affect any real auction result.
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {members.length === 0 && <div style={{ color: tokens.textSub, fontSize: 13 }}>No eligible bidders left — everyone has taken.</div>}
        {members.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 9, background: tokens.slateLight }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: tokens.text, flex: 1 }}>{m.name}</span>
            <span style={{ fontSize: 12, color: tokens.textMuted }}>₹</span>
            <input type="number" value={bids[m.id] || ''} onChange={e => setBid(m.id, e.target.value)} placeholder="Bid amount…"
              style={{ width: 130, height: 34, padding: '0 10px', borderRadius: 8, border: `1.5px solid ${tokens.border}`, fontSize: 13.5, fontFamily: 'inherit', outline: 'none' }} />
          </div>
        ))}
      </div>

      {members.length > 0 && (
        <button onClick={determineWinner}
          style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: tokens.purple, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14 }}>
          🏁 Determine Highest Bidder
        </button>
      )}

      {finalNote && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(88,86,214,0.08)', border: `1px solid ${tokens.purple}30`, marginBottom: 14, fontSize: 14, fontWeight: 700, color: tokens.purple }}>
          {finalNote}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: tokens.textMuted }}>{loadedAt ? `Last saved ${loadedAt.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : 'Not saved yet'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={printSummary} style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${tokens.border}`, background: '#fff', color: tokens.textSub, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>🖨 Print Summary</button>
          <Button onClick={saveNotes} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</Button>
        </div>
      </div>
    </Card>
  );
}
