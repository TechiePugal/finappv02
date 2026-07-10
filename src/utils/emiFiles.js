// EMI loan document scans (check/bond/agreement) — same safe separate-collection
// pattern. Optional for EMI loans (not mandatory at creation, unlike borrowers).
import {doc,getDoc,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {db} from '../firebase/config';

const DOC_KEYS = ['check','bond','agreement'];

export async function saveEmiDocs(loanId, docs) {
  await Promise.all(DOC_KEYS.map(async (k) => {
    const ref = doc(db, 'emi_files', `${loanId}_${k}`);
    if (docs && docs[k]) {
      await setDoc(ref, { loanId, key: k, dataUrl: docs[k], updatedAt: serverTimestamp() });
    } else {
      try { await deleteDoc(ref); } catch (e) { /* not present */ }
    }
  }));
}

export async function getEmiDocs(loanId) {
  const out = {};
  await Promise.all(DOC_KEYS.map(async (k) => {
    try {
      const s = await getDoc(doc(db, 'emi_files', `${loanId}_${k}`));
      if (s.exists()) out[k] = s.data().dataUrl;
    } catch (e) { /* ignore */ }
  }));
  return out;
}
