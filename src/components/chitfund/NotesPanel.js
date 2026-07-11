// Notes & Reminders widget for the Dashboard. Add a free-text note, optionally
// with a reminder date/time. Once the reminder time has passed, the note
// surfaces as a persistent alert banner at the top — it stays visible until
// the user explicitly clicks to close it (never auto-dismisses on its own).
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { addNote, getNotes, dismissNote, deleteNote } from '../../utils/cf_notes';
import toast from 'react-hot-toast';

const tokens = { blue: '#007AFF', amber: '#FF9500', red: '#FF3B30', text: '#1C1C1E', textSub: '#6B7280', textMuted: '#9CA3AF', border: 'rgba(0,0,0,0.07)', slateLight: '#F9F9FB' };

function fmtWhen(ts) {
  if (!ts?.seconds) return null;
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotesPanel() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [wantsReminder, setWantsReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [user]); //eslint-disable-line
  async function load() {
    if (!user) return;
    try { setNotes(await getNotes(user.uid)); } catch (e) { /* silent */ }
    setLoading(false);
  }

  async function save() {
    if (!text.trim()) return toast.error('Write something in the note first.');
    setSaving(true);
    try {
      await addNote(user.uid, { title: title.trim(), text: text.trim(), reminderAt: wantsReminder ? reminderAt : null });
      setTitle(''); setText(''); setWantsReminder(false); setReminderAt('');
      setModalOpen(false);
      load();
      toast.success('Note added');
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  }

  async function handleDismiss(id) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n));
    try { await dismissNote(id); } catch (e) { /* keep local state even if it fails silently */ }
  }

  async function handleDelete(id) {
    setNotes(prev => prev.filter(n => n.id !== id));
    try { await deleteNote(id); } catch (e) { /* ignore */ }
  }

  const now = Date.now();
  // Active alerts: has a reminder, that reminder time has passed, and it hasn't been dismissed
  const activeAlerts = notes.filter(n => n.reminderAt?.seconds && n.reminderAt.seconds * 1000 <= now && !n.dismissed);
  // Everything else (plain notes, or reminders not due yet) shown in the regular list
  const regularNotes = notes.filter(n => !activeAlerts.includes(n));

  if (loading) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Persistent alert banners — stay until explicitly closed */}
      {activeAlerts.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {activeAlerts.map(n => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(255,149,0,0.1),rgba(255,59,48,0.06))', border: '1px solid rgba(255,149,0,0.25)' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⏰</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {n.title && <div style={{ fontSize: 13.5, fontWeight: 700, color: tokens.text, marginBottom: 2 }}>{n.title}</div>}
                <div style={{ fontSize: 13, color: tokens.text }}>{n.text}</div>
                <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 4 }}>Reminder was set for {fmtWhen(n.reminderAt)}</div>
              </div>
              <button onClick={() => handleDismiss(n.id)} title="Close this reminder"
                style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.06)', color: tokens.textSub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notes card */}
      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${tokens.border}`, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: tokens.text }}>📝 Notes</div>
          <button onClick={() => setModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: 'none', background: tokens.blue, color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add Note
          </button>
        </div>

        {regularNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '18px 0', color: tokens.textMuted, fontSize: 13 }}>No notes yet — jot anything down, with an optional reminder.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {regularNotes.map(n => (
              <div key={n.id} style={{ padding: '12px 14px', borderRadius: 12, background: tokens.slateLight, position: 'relative' }}>
                <button onClick={() => handleDelete(n.id)} title="Delete note"
                  style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.05)', color: tokens.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  ✕
                </button>
                {n.title && <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text, marginBottom: 4, paddingRight: 20 }}>{n.title}</div>}
                <div style={{ fontSize: 12.5, color: tokens.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.text}</div>
                {n.reminderAt?.seconds && (
                  <div style={{ fontSize: 10.5, color: tokens.amber, fontWeight: 600, marginTop: 6 }}>⏰ Reminder: {fmtWhen(n.reminderAt)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Note popup */}
      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, padding: 22, boxShadow: '0 28px 72px rgba(0,0,0,.22)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: tokens.text, marginBottom: 14 }}>Add Note</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
              style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', marginBottom: 10 }} />
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Write your note…" rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 12 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: wantsReminder ? 10 : 16 }}>
              <input type="checkbox" checked={wantsReminder} onChange={e => setWantsReminder(e.target.checked)} />
              <span style={{ fontSize: 13, color: tokens.text }}>Set a reminder</span>
            </label>
            {wantsReminder && (
              <input type="datetime-local" value={reminderAt} onChange={e => setReminderAt(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 9, border: `1.5px solid ${tokens.border}`, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 16 }} />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={save} disabled={saving}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: tokens.blue, color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : 'Save Note'}
              </button>
              <button onClick={() => setModalOpen(false)}
                style={{ padding: '11px 18px', borderRadius: 10, border: `1px solid ${tokens.border}`, background: '#fff', color: tokens.textSub, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
