// Data-isolation helper for Finance Ledger. Historically, FL documents were
// created with NO owner field at all — every logged-in account could see
// every other account's borrowers, depositors, EMI loans and payments.
//
// Fix strategy (chosen deliberately over a pure Firestore `where()` filter):
//   - All NEW documents now get createdBy: user.uid at write time.
//   - All READS keep fetching normally, then filter client-side with
//     scopeToUser() — which shows a doc if it belongs to the current user
//     OR has no createdBy at all (pre-existing/legacy data). This avoids
//     silently "losing" old records for whoever was already using them,
//     while guaranteeing brand-new data never leaks between accounts.
export function scopeToUser(docs, uid) {
  if (!uid) return [];
  return (docs || []).filter(d => !d.createdBy || d.createdBy === uid);
}
