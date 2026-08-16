import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import { auth, firebaseReady } from '../lib/firebase';
import { saveProfile, watchProfile } from '../lib/store';
import { computeTargets } from '../lib/nutrition';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return undefined;
    }
    return watchProfile(user.uid, setProfile);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      // Targets are derived, never stored — otherwise they silently go stale the
      // moment the profile changes and nobody notices for a month.
      targets: computeTargets(profile),
      needsProfile: Boolean(user) && !profile?.weightKg,
      signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
      signUp: (email, password) => createUserWithEmailAndPassword(auth, email, password),
      resetPassword: (email) => sendPasswordResetEmail(auth, email),
      signOut: () => signOut(auth),
      updateProfile: (patch) =>
        user ? saveProfile(user.uid, patch) : Promise.resolve(),
    }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
