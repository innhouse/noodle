/**
 * Firebase handles for React Native (iOS/Android).
 *
 * Auth needs AsyncStorage wired up explicitly here or the session is lost every time
 * the app is killed. `getReactNativePersistence` only exists in Firebase's React
 * Native build, so the web variant of this file (firebase.web.js) uses plain
 * `getAuth` instead — Metro picks the right one per platform.
 */
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firebaseConfig } from '../../firebaseConfig';

export const firebaseReady =
  Boolean(firebaseConfig.projectId) && firebaseConfig.projectId !== 'REPLACE_ME';

// Whether the app existed *before* this module ran has to be captured up front:
// initializeApp below makes getApps() non-empty, so checking it again afterwards
// would always report "already initialised" and skip the persistence setup.
const alreadyInitialised = getApps().length > 0;

export const app = alreadyInitialised ? getApps()[0] : initializeApp(firebaseConfig);

// initializeAuth throws if called twice, which Fast Refresh will do.
export const auth = alreadyInitialised
  ? getAuth(app)
  : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });

export const db = getFirestore(app);
export const storage = getStorage(app);
