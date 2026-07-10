// Depositor document scans (check/bond) — stored in a SEPARATE collection, same
// safe pattern as borrowerFiles.js, to avoid the Firestore 1MB/doc overflow that
// happens when large base64 scans are stored inline on deposit_master.
import {doc,getDoc,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {db} from '../firebase/config';

const DOC_KEYS = ['check','bond'];

export async function saveDepositorDocs(depositorId, docs) {
  await Promise.all(DOC_KEYS.map(async (k) => {
    const ref = doc(db, 'depositor_files', `${depositorId}_${k}`);
    if (docs && docs[k]) {
      await setDoc(ref, { depositorId, key: k, dataUrl: docs[k], updatedAt: serverTimestamp() });
    } else {
      try { await deleteDoc(ref); } catch (e) { /* not present */ }
    }
  }));
}

export async function getDepositorDocs(depositorId) {
  const out = {};
  await Promise.all(DOC_KEYS.map(async (k) => {
    try {
      const s = await getDoc(doc(db, 'depositor_files', `${depositorId}_${k}`));
      if (s.exists()) out[k] = s.data().dataUrl;
    } catch (e) { /* ignore */ }
  }));
  return out;
}
