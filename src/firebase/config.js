import { initializeApp } from 'firebase/app';
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

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

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
