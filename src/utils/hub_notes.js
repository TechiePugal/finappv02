// Global Notes & Reminders — lives on the Hub home page (not any specific
// sub-app), scoped per user. A note can optionally carry a reminder time;
// once that time passes, the note surfaces as a persistent alert on the Hub
// until the user explicitly closes it.
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function addHubNote(userId, { title, text, reminderAt }) {
  const ref = await addDoc(collection(db, 'app_notes'), {
    userId, title: title || '', text: text || '',
    reminderAt: reminderAt ? Timestamp.fromDate(new Date(reminderAt)) : null,
    dismissed: false, createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getHubNotes(userId) {
  const q = query(collection(db, 'app_notes'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function dismissHubNote(noteId) {
  await updateDoc(doc(db, 'app_notes', noteId), { dismissed: true });
}

export async function deleteHubNote(noteId) {
  await deleteDoc(doc(db, 'app_notes', noteId));
}
