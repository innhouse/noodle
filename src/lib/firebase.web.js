/**
 * Firebase handles for web. Browser persistence (localStorage) is the default, so
 * unlike the native build this needs no explicit persistence wiring.
 */
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

import { firebaseConfig } from '../../firebaseConfig';

export const firebaseReady =
  Boolean(firebaseConfig.projectId) && firebaseConfig.projectId !== 'REPLACE_ME';

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');
