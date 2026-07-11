// Per-user company branding — separate names for each business vertical,
// set once in Profile settings and usable anywhere in the app.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function getCompanyProfile(uid) {
  try {
    const s = await getDoc(doc(db, 'company_profiles', uid));
    return s.exists() ? s.data() : {};
  } catch (e) { return {}; }
}

export async function saveCompanyProfile(uid, data) {
  await setDoc(doc(db, 'company_profiles', uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
