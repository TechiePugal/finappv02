// If a Guardian's name + phone are entered on a Borrower, Depositor, or EMI
// Loan form, also register them as a proper User (customer_master) — so the
// guardian shows up in the Users directory like any other person, searchable
// and reusable across future records, instead of being locked as plain text
// on just one form.
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export async function syncGuardianAsUser(guardianName, guardianPhone, guardianAddress, userId) {
  const name = (guardianName || '').trim();
  const phone = (guardianPhone || '').trim();
  if (!name || !phone) return; // need both to make a meaningful User record

  try {
    // Don't duplicate — if a User with this phone already exists, leave it alone.
    const q = query(collection(db, 'customer_master'), where('phone', '==', phone));
    const snap = await getDocs(q);
    if (!snap.empty) return;

    await addDoc(collection(db, 'customer_master'), {
      name, phone, address: guardianAddress || '',
      customerId: `CUST-${Date.now().toString(36).toUpperCase()}`,
      isGuardian: true, // flag so Users can distinguish guardian-sourced entries if needed
      createdBy: userId || null, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  } catch (e) { /* never block the main save if this fails */ }
}
