import {doc,getDoc,setDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
import {db} from '../firebase/config';

// Borrower document scans (check/bond/agreement/land) are large base64 blobs.
// Storing them inline in borrower_master overflows Firestore's 1MB/doc limit,
// so each scan lives in its own borrower_files/{borrowerId}_{key} document.
const DOC_KEYS = ['check','bond','agreement','land'];

export async function saveBorrowerDocs(borrowerId, docs) {
  await Promise.all(DOC_KEYS.map(async (k) => {
    const ref = doc(db, 'borrower_files', `${borrowerId}_${k}`);
    if (docs && docs[k]) {
      await setDoc(ref, { borrowerId, key: k, dataUrl: docs[k], updatedAt: serverTimestamp() });
    } else {
      try { await deleteDoc(ref); } catch (e) { /* not present */ }
    }
  }));
}

export async function getBorrowerDocs(borrowerId) {
  const out = {};
  await Promise.all(DOC_KEYS.map(async (k) => {
    try {
      const s = await getDoc(doc(db, 'borrower_files', `${borrowerId}_${k}`));
      if (s.exists()) out[k] = s.data().dataUrl;
    } catch (e) { /* ignore */ }
  }));
  return out;
}

export async function deleteBorrowerDocs(borrowerId) {
  await Promise.all(DOC_KEYS.map((k) => deleteDoc(doc(db, 'borrower_files', `${borrowerId}_${k}`)).catch(() => {})));
}
