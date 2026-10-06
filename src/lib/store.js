/**
 * Firestore + Cloud Functions data layer.
 *
 * Layout, all scoped under the signed-in user so the security rules stay a one-liner:
 *   users/{uid}                      profile and targets
 *   users/{uid}/meals/{mealId}       one logged meal, with its items and answers
 *   users/{uid}/weights/{YYYY-MM-DD} one scale reading
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, functions, storage } from './firebase';

// --- Profile ---------------------------------------------------------------

export function watchProfile(uid, callback) {
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => callback(snapshot.exists() ? snapshot.data() : null),
    (error) => console.warn('profile watch failed', error)
  );
}

export function saveProfile(uid, profile) {
  return setDoc(doc(db, 'users', uid), profile, { merge: true });
}

// --- Meals -----------------------------------------------------------------

export function watchMeals(uid, day, callback) {
  const q = query(
    collection(db, 'users', uid, 'meals'),
    where('dayKey', '==', day),
    orderBy('loggedAt', 'asc')
  );
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (error) => console.warn('meals watch failed', error)
  );
}

/** Recent meals across all days, for the "log this again" shortcut. */
export function watchRecentMeals(uid, callback, max = 40) {
  const q = query(collection(db, 'users', uid, 'meals'), orderBy('loggedAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.slice(0, max).map((d) => ({ id: d.id, ...d.data() }))),
    (error) => console.warn('recent meals watch failed', error)
  );
}

/**
 * Recursively replace undefined with null.
 *
 * Firestore rejects undefined outright rather than skipping the field, so a meal
 * saved by an older build — missing fields that later versions write — fails to
 * save the moment it is edited. Normalising here means every write is safe rather
 * than every call site having to remember.
 */
function withoutUndefined(value) {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, withoutUndefined(inner)])
    );
  }
  return value;
}

export function saveMeal(uid, meal) {
  const id = meal.id ?? doc(collection(db, 'users', uid, 'meals')).id;
  const payload = withoutUndefined({ ...meal, id });
  return setDoc(doc(db, 'users', uid, 'meals', id), payload, { merge: true }).then(() => id);
}

export function deleteMeal(uid, mealId) {
  return deleteDoc(doc(db, 'users', uid, 'meals', mealId));
}

// --- Weight ----------------------------------------------------------------

export function watchWeights(uid, callback) {
  const q = query(collection(db, 'users', uid, 'weights'), orderBy('date', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => d.data())),
    (error) => console.warn('weights watch failed', error)
  );
}

export function saveWeight(uid, date, weightKg) {
  // Keyed by date, so logging twice in a day corrects the reading instead of
  // adding a second point and skewing the trend.
  return setDoc(doc(db, 'users', uid, 'weights', date), { date, weightKg });
}

// --- Photos ----------------------------------------------------------------

export async function uploadMealPhoto(uid, mealId, blob) {
  const path = `users/${uid}/meals/${mealId}.jpg`;
  await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
  return getDownloadURL(ref(storage, path));
}

// --- Cloud Functions -------------------------------------------------------

/** `images` is an array of { base64, mimeType } — one meal, one or more photos. */
export async function analyzeMealPhoto({ images, mealType, hint }) {
  const call = httpsCallable(functions, 'analyzeMeal', { timeout: 120_000 });
  const result = await call({ images, mealType, hint });
  return result.data;
}

export async function reviewMeals({ meals, targets, days }) {
  const call = httpsCallable(functions, 'reviewMeals', { timeout: 120_000 });
  const result = await call({ meals, targets, days });
  return result.data.text;
}

// --- Health snapshot -------------------------------------------------------

// Ninety days is what every trend and association on the Health screen reads, and
// capping the window here is also what keeps the document small: thirty metrics at
// ninety points measures about 99 KB against Firestore's 1 MiB limit, so there is
// an order of magnitude of headroom without needing to shed anything.
const SNAPSHOT_DAYS = 90;

/**
 * Mirror the phone's Apple Health readings into Firestore so the web app can show
 * them.
 *
 * This is the one place health data leaves the phone, and it is a copy rather than
 * a source of truth — HealthKit stays authoritative, and the web shows this with the
 * date it was captured so a stale copy is never mistaken for a live one.
 *
 * Values are rounded to two decimals: nothing here is meaningful past that, and it
 * roughly halves what gets stored and shipped.
 */
export function saveHealthSnapshot(uid, series) {
  const round = (value) => Math.round(value * 100) / 100;
  const payload = Object.fromEntries(
    Object.entries(series ?? {}).map(([key, points]) => [
      key,
      (points ?? []).slice(-SNAPSHOT_DAYS).map((point) => ({
        date: point.date,
        value: round(point.value),
        ...(point.stages
          ? {
              stages: {
                deep: round(point.stages.deep ?? 0),
                rem: round(point.stages.rem ?? 0),
                core: round(point.stages.core ?? 0),
              },
            }
          : {}),
      })),
    ])
  );

  return setDoc(doc(db, 'users', uid, 'health', 'snapshot'), {
    series: payload,
    capturedAt: new Date().toISOString(),
  });
}

export function watchHealthSnapshot(uid, callback) {
  return onSnapshot(
    doc(db, 'users', uid, 'health', 'snapshot'),
    (snapshot) => callback(snapshot.exists() ? snapshot.data() : null),
    (error) => console.warn('health snapshot watch failed', error)
  );
}

export async function askCoach({ totals, targets, meals, question }) {
  const call = httpsCallable(functions, 'coachMeal', { timeout: 60_000 });
  const result = await call({
    totals,
    targets,
    meals,
    question,
    localTime: new Date().toLocaleString(),
  });
  return result.data.text;
}
