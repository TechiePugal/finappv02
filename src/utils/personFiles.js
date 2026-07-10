// Chit-fund Person proof documents (Aadhaar/ID scan) — stored in their own safe
// collection, mirroring the pattern used for borrowers/depositors/EMI loans in
// Finance Ledger, to avoid Firestore's 1MB/doc overflow from inline base64.
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function savePersonProof(personId, dataUrl) {
  const ref = doc(db, 'chit_person_files', `${personId}_proof`);
  if (dataUrl) {
    await setDoc(ref, { personId, key: 'proof', dataUrl, updatedAt: serverTimestamp() });
  } else {
    try { await deleteDoc(ref); } catch (e) { /* not present */ }
  }
}

export async function getPersonProof(personId) {
  try {
    const s = await getDoc(doc(db, 'chit_person_files', `${personId}_proof`));
    return s.exists() ? s.data().dataUrl : null;
  } catch (e) { return null; }
}
