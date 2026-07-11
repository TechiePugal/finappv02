import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, signInWithPopup, updateProfile, updateEmail, updatePassword,
  sendPasswordResetEmail, reauthenticateWithCredential, reauthenticateWithPopup,
  EmailAuthProvider, deleteUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import {
  createSession, verifySession, clearSession, refreshSession,
  getSessionInfo, sessionExpiryLabel,
} from '../utils/jwtSession';
import { prefetchAll } from '../utils/dataStore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);
  const [sessionLabel, setSessionLabel] = useState('');

  // Update session expiry label every 60 seconds
  useEffect(() => {
    const tick = () => setSessionLabel(sessionExpiryLabel());
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [sessionValid]);

  // Listen to Firebase auth, verify or create JWT on every auth change
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let payload = await verifySession();
        if (!payload || payload.uid !== firebaseUser.uid) {
          await createSession(firebaseUser, 'hub');
          payload = getSessionInfo();
        }
        setSessionValid(!!payload);
        setUser(firebaseUser);
        // Start prefetching all app data in background immediately after auth
        prefetchAll(firebaseUser.uid);
      } else {
        clearSession();
        setSessionValid(false);
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Touch session on activity (throttled internally to 30 min intervals)
  const touchSession = useCallback(async () => {
    if (auth.currentUser) await refreshSession(auth.currentUser);
  }, []);

  // Auth actions
  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await createSession(cred.user, 'hub');
    setSessionValid(true);
    return cred;
  };

  const signup = async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (name) await updateProfile(cred.user, { displayName: name });
    await createSession(cred.user, 'hub');
    setSessionValid(true);
    setUser({ ...cred.user, displayName: name });
    return cred;
  };

  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    // createSession is fire-and-forget — JWT failure must NEVER block sign-in
    createSession(cred.user, 'hub').catch(e => console.warn('JWT session:', e));
    setSessionValid(true);
    return cred;
  };

  const logout = async () => {
    clearSession();
    setSessionValid(false);
    await signOut(auth);
  };

  // ── Idle-timeout auto-logout (30 minutes of no activity) ──────────────────
  // Tracks mouse/keyboard/touch/scroll activity; if none is seen for 30 minutes
  // while a user is signed in, they're automatically logged out for security.
  const IDLE_LIMIT_MS = 30 * 60 * 1000;
  useEffect(() => {
    if (!user) return; // only run the idle timer while someone is actually logged in
    let idleTimer;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        logout();
      }, IDLE_LIMIT_MS);
    };
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // start the timer as soon as someone logs in
    return () => {
      clearTimeout(idleTimer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetIdleTimer));
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetPassword = (email) => sendPasswordResetEmail(auth, email);

  // Profile updates
  const updateDisplayName = async (name) => {
    await updateProfile(auth.currentUser, { displayName: name });
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
    setUser((u) => ({ ...u, displayName: name }));
  };

  const updatePhotoURL = async (photoURL) => {
    await updateProfile(auth.currentUser, { photoURL });
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
    setUser((u) => ({ ...u, photoURL }));
  };

  // Reauthentication
  const reauthWithPassword = async (password) => {
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, credential);
  };

  const reauthWithGoogle = async () => {
    await reauthenticateWithPopup(auth.currentUser, googleProvider);
  };

  // Sensitive changes
  const changeEmail = async (newEmail, currentPassword) => {
    await reauthWithPassword(currentPassword);
    await updateEmail(auth.currentUser, newEmail);
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
    setUser((u) => ({ ...u, email: newEmail }));
  };

  const changePassword = async (currentPassword, newPassword) => {
    await reauthWithPassword(currentPassword);
    await updatePassword(auth.currentUser, newPassword);
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
  };

  const setNewPassword = async (newPassword) => {
    await updatePassword(auth.currentUser, newPassword);
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
  };

  const deleteAccount = async (password) => {
    const isGoogle = auth.currentUser.providerData.some((p) => p.providerId === 'google.com');
    if (isGoogle) await reauthWithGoogle();
    else await reauthWithPassword(password);
    clearSession();
    await deleteUser(auth.currentUser);
  };

  const isGoogleUser = () =>
    auth.currentUser?.providerData?.some((p) => p.providerId === 'google.com') ?? false;

  const refreshUser = async () => {
    await auth.currentUser?.reload();
    setUser({ ...auth.currentUser });
    await createSession(auth.currentUser, getSessionInfo()?.app || 'hub');
  };

  return (
    <AuthContext.Provider value={{
      user, loading, sessionValid, sessionLabel, touchSession,
      login, signup, loginWithGoogle, logout, resetPassword,
      updateDisplayName, updatePhotoURL,
      changeEmail, changePassword, setNewPassword,
      reauthWithPassword, reauthWithGoogle,
      deleteAccount, isGoogleUser, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
