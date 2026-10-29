/**
 * Firestore data layer.
 *
 * Layout, all scoped under the signed-in user so the security rules stay a one-liner:
 *   users/{uid}                       profile and preferences
 *   users/{uid}/weights/{YYYY-MM-DD}  one scale reading
 *   users/{uid}/workouts/{uuid}       one session, mirrored from Apple Health
 *   users/{uid}/workoutNotes/{uuid}   how a session felt, written by the user
 *   users/{uid}/labs/{YYYY-MM-DD}     one blood test, typed in from the report
 *   users/{uid}/health/snapshot       daily series mirrored from Apple Health
 *   users/{uid}/sleep/{YYYY-MM-DD}    one night's sleep, mirrored from Apple Health
 *   users/{uid}/routes/{workoutId}    a session's GPS route, thinned, as flat lat,lon pairs
 *
 * Apple Health stays the source of truth for everything mirrored here. The copies
 * exist so the web app can show the same numbers, and they are stamped with when
 * they were taken so a stale copy is never mistaken for a live one.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, listAll, ref } from 'firebase/storage';

import { db, storage } from './firebase';

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

/**
 * Write several readings at once, tagged with where they came from.
 *
 * Used by the Apple Health import. Firestore batches are capped at 500 writes, so
 * a first import of years of scale history is chunked.
 */
export async function saveWeights(uid, entries, source = 'health') {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(db);
    for (const { date, weightKg } of entries.slice(i, i + 400)) {
      batch.set(doc(db, 'users', uid, 'weights', date), { date, weightKg, source });
    }
    await batch.commit();
  }
}

// --- Routes ------------------------------------------------------------------

/**
 * A session's route: undefined while loading, null when none is stored yet,
 * else { points: [[lat, lon], …] } — empty points meaning Health had no route.
 * Firestore has no nested arrays, so the pairs are stored flat.
 */
export function watchRoute(uid, workoutId, callback) {
  return onSnapshot(
    doc(db, 'users', uid, 'routes', workoutId),
    (snapshot) => {
      if (!snapshot.exists()) return callback(null);
      const flat = snapshot.data().flat ?? [];
      const points = [];
      for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i], flat[i + 1]]);
      return callback({ points });
    },
    (error) => console.warn('route watch failed', error)
  );
}

export function saveRoute(uid, workoutId, points) {
  return setDoc(doc(db, 'users', uid, 'routes', workoutId), {
    flat: points.flat(),
    capturedAt: new Date().toISOString(),
  });
}

// --- Sleep history ---------------------------------------------------------

export function watchSleepNights(uid, callback) {
  const q = query(collection(db, 'users', uid, 'sleep'), orderBy('date', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => d.data())),
    (error) => console.warn('sleep watch failed', error)
  );
}

/** One document per night, keyed by the morning it ended; hours to 2 decimals. */
export async function saveSleepNights(uid, nights) {
  const r = (h) => Math.round((h ?? 0) * 100) / 100;
  for (let i = 0; i < nights.length; i += 400) {
    const batch = writeBatch(db);
    for (const n of nights.slice(i, i + 400)) {
      batch.set(doc(db, 'users', uid, 'sleep', n.date), {
        date: n.date,
        hours: r(n.value),
        deep: r(n.stages?.deep),
        rem: r(n.stages?.rem),
        core: r(n.stages?.core),
      });
    }
    await batch.commit();
  }
}

// --- Workouts --------------------------------------------------------------

export function watchWorkouts(uid, callback) {
  const q = query(collection(db, 'users', uid, 'workouts'), orderBy('start', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => d.data())),
    (error) => console.warn('workouts watch failed', error)
  );
}

/**
 * Mirror sessions from Apple Health, keyed by Health's own UUID so a re-read
 * updates a session in place rather than duplicating it.
 */
export async function saveWorkouts(uid, workouts) {
  const capturedAt = new Date().toISOString();
  for (let i = 0; i < workouts.length; i += 400) {
    const batch = writeBatch(db);
    for (const workout of workouts.slice(i, i + 400)) {
      batch.set(doc(db, 'users', uid, 'workouts', workout.id), { ...workout, capturedAt });
    }
    await batch.commit();
  }
}

// --- Workout notes ---------------------------------------------------------

// Kept apart from the mirrored session so a Health re-read can never overwrite
// what the person wrote about how it felt.
export function watchWorkoutNotes(uid, callback) {
  return onSnapshot(
    collection(db, 'users', uid, 'workoutNotes'),
    (snapshot) => callback(Object.fromEntries(snapshot.docs.map((d) => [d.id, d.data()]))),
    (error) => console.warn('workout notes watch failed', error)
  );
}

/** Name (or, with null, un-name) a session as a milestone, leaving the rest of its note alone. */
export async function saveMilestone(uid, workoutIds, name) {
  for (let i = 0; i < workoutIds.length; i += 400) {
    const batch = writeBatch(db);
    for (const workoutId of workoutIds.slice(i, i + 400)) {
      batch.set(
        doc(db, 'users', uid, 'workoutNotes', workoutId),
        { workoutId, milestone: name || null, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export function saveWorkoutNote(uid, workoutId, note) {
  return setDoc(doc(db, 'users', uid, 'workoutNotes', workoutId), {
    ...note,
    workoutId,
    updatedAt: new Date().toISOString(),
  });
}

// --- Labs ------------------------------------------------------------------

export function watchLabs(uid, callback) {
  const q = query(collection(db, 'users', uid, 'labs'), orderBy('date', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => d.data())),
    (error) => console.warn('labs watch failed', error)
  );
}

/** One test per date; entering the same date again corrects it. */
export function saveLabs(uid, date, values) {
  return setDoc(doc(db, 'users', uid, 'labs', date), { date, values }, { merge: true });
}

export function deleteLabs(uid, date) {
  return deleteDoc(doc(db, 'users', uid, 'labs', date));
}

// --- Health snapshot -------------------------------------------------------

// Ninety days is what every trend on the Health screen reads, and capping the
// window here is also what keeps the document small: thirty metrics at ninety
// points measures about 99 KB against Firestore's 1 MiB limit.
const SNAPSHOT_DAYS = 90;

/**
 * Mirror the phone's daily Apple Health series into Firestore so the web app can
 * show them. Values are rounded to two decimals: nothing here is meaningful past
 * that, and it roughly halves what gets stored and shipped.
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

// --- Retired data ----------------------------------------------------------

/**
 * Remove everything the food-tracking era left behind: logged meals and their
 * photos. One-shot, run from Settings, and safe to run again — a second pass
 * finds nothing and deletes nothing.
 *
 * Returns how many meals and photos went, so the screen can say so.
 */
/** Whether anything from the food-tracking era is still in the account. */
export async function hasMealData(uid) {
  const meals = await getDocs(query(collection(db, 'users', uid, 'meals'), limit(1)));
  if (!meals.empty) return true;
  try {
    const listing = await listAll(ref(storage, `users/${uid}/meals`));
    return listing.items.length > 0;
  } catch {
    return false;
  }
}

export async function deleteMealData(uid) {
  const meals = await getDocs(collection(db, 'users', uid, 'meals'));
  for (let i = 0; i < meals.docs.length; i += 400) {
    const batch = writeBatch(db);
    for (const meal of meals.docs.slice(i, i + 400)) batch.delete(meal.ref);
    await batch.commit();
  }

  let photos = 0;
  try {
    const listing = await listAll(ref(storage, `users/${uid}/meals`));
    for (const item of listing.items) {
      await deleteObject(item);
      photos += 1;
    }
  } catch (error) {
    console.warn('meal photo cleanup failed', error);
  }

  return { meals: meals.docs.length, photos };
}
