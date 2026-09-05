import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection, doc, getDoc, getDocs,
  setDoc, addDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, Timestamp, onSnapshot
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration — from Firebase Console → Project
// Settings → General → "FinMain" (project ID: finmain-e874b). These web
// config values are meant to be public/client-side; Firebase's actual
// security comes from Firestore Security Rules and Authentication, not from
// hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyANInnmbfm4bey1km3s0ORa-Hy9XCy8t_Y",
  authDomain: "finmain-e874b.firebaseapp.com",
  projectId: "finmain-e874b",
  storageBucket: "finmain-e874b.firebasestorage.app",
  messagingSenderId: "258667803384",
  appId: "1:258667803384:web:12c90082a27247eeee410d",
  measurementId: "G-TLQW00R6F6"
};

const app = initializeApp(firebaseConfig);

// Analytics only works in a real browser with certain conditions met (not
// blocked by an ad-blocker, not server-side rendering, etc.) — checked safely
// so a blocked/unsupported environment never breaks the rest of the app.
export let analytics = null;
analyticsIsSupported().then(supported => { if (supported) analytics = getAnalytics(app); }).catch(() => {});

// Use the modern persistent cache API instead of deprecated enableIndexedDbPersistence
// This gives us multi-tab support and much faster subsequent loads
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  // Already initialized (hot reload etc.)
  db = getFirestore(app);
}

export { db };
export const auth = getAuth(app);
export const storage = getStorage(app);

// Auth helpers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInEmail = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const signUpEmail = (e, p) => createUserWithEmailAndPassword(auth, e, p);
export const resetPassword = e => sendPasswordResetEmail(auth, e);
export const logOut = () => signOut(auth);
export const onAuth = cb => onAuthStateChanged(auth, cb);

// Firestore re-exports
export {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where,
  writeBatch, serverTimestamp, Timestamp, onSnapshot
};

export default app;
