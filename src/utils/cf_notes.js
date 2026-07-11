// Chit Fund — simple Notes & Reminders, scoped per user.
// A note can optionally carry a reminder time; once that time has passed,
// the note surfaces as a persistent alert on the Dashboard until the user
// explicitly dismisses it (not an auto-hiding toast).
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function addNote(userId, { title, text, reminderAt }) {
  const ref = await addDoc(collection(db, 'chit_notes'), {
    userId, title: title || '', text: text || '',
    reminderAt: reminderAt ? Timestamp.fromDate(new Date(reminderAt)) : null,
    dismissed: false, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getNotes(userId) {
  const q = query(collection(db, 'chit_notes'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function dismissNote(noteId) {
  await updateDoc(doc(db, 'chit_notes', noteId), { dismissed: true });
}

export async function deleteNote(noteId) {
  await deleteDoc(doc(db, 'chit_notes', noteId));
}

export async function updateNote(noteId, data) {
  await updateDoc(doc(db, 'chit_notes', noteId), data);
}
