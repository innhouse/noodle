/**
 * One place that reads Apple Health and keeps the account's copy in step.
 *
 * Shared by every screen through a single provider, so switching tabs never
 * starts another read. What the screens show first is the copy already in the
 * account — last read's numbers, on screen as soon as Firestore answers — and
 * the fresh Health read replaces it quietly when it lands.
 *
 * On the phone: read HealthKit and mirror it to Firestore so the web can show the
 * same numbers. Re-reads when the app returns to the foreground (the watch syncs
 * in the background), but not more than once every couple of minutes.
 *
 * Workouts are read incrementally: only sessions from shortly before the newest
 * one already mirrored. The full ten-year read happens once, the first time.
 *
 * Off the phone: HealthKit does not exist, so read the mirrored copy and say how
 * old it is.
 */
import { createContext, createElement, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { healthSeries, healthSupported, requestHealthAccess, workoutsSince } from './health';
import {
  saveHealthSnapshot,
  saveWorkouts,
  watchHealthSnapshot,
  watchWorkouts,
} from './store';

const SERIES_DAYS = 90;
// The first read takes everything Health holds; later reads only the tail.
const FULL_WORKOUT_DAYS = 365 * 10;
// Re-read this far before the newest mirrored session, to catch late syncs and
// edits made in the source app shortly after a workout.
const OVERLAP_DAYS = 7;
// Zone minutes are computed for sessions in this window.
const ZONE_DAYS = 60;
// Coming back to the app within this long doesn't trigger another read.
const MIN_REREAD_MS = 2 * 60_000;

const HealthDataContext = createContext(null);

export function HealthDataProvider({ children }) {
  const value = useHealthDataSource();
  return createElement(HealthDataContext.Provider, { value }, children);
}

export function useHealthData() {
  const context = useContext(HealthDataContext);
  if (!context) throw new Error('useHealthData must be used inside HealthDataProvider');
  return context;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function useHealthDataSource() {
  const { user, profile } = useAuth();
  const [series, setSeries] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  const [denied, setDenied] = useState(false);
  const [capturedAt, setCapturedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // The latest mirrored list, readable from inside the Health read.
  const workoutsRef = useRef(null);
  // Set once this phone's own Health read has landed; from then on the mirrored
  // snapshot no longer overwrites what is on screen.
  const freshRef = useRef(false);
  // Resolves with the first workouts snapshot, so the Health read knows what is
  // already mirrored instead of re-reading all of it.
  const [firstWorkouts] = useState(() => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });

  useEffect(() => {
    if (!user) return undefined;
    return watchWorkouts(user.uid, (list) => {
      workoutsRef.current = list;
      setWorkouts(list);
      firstWorkouts.resolve(list);
    });
  }, [user, firstWorkouts]);

  // The mirrored daily series: the whole picture on the web, and on the phone
  // the instant first paint while the Health read runs.
  useEffect(() => {
    if (!user) return undefined;
    return watchHealthSnapshot(user.uid, (snapshot) => {
      if (healthSupported) {
        if (!freshRef.current && snapshot?.series) setSeries(snapshot.series);
        return;
      }
      setSeries(snapshot?.series ?? null);
      setCapturedAt(snapshot?.capturedAt ?? null);
    });
  }, [user]);

  useEffect(() => {
    if (!healthSupported || !user) return undefined;

    let cancelled = false;
    let running = false;
    let lastRead = 0;
    let lastSynced = null;

    const read = async () => {
      if (running || Date.now() - lastRead < MIN_REREAD_MS) return;
      running = true;
      setRefreshing(true);
      try {
        const granted = await requestHealthAccess();
        if (cancelled) return;
        if (!granted) {
          setDenied(true);
          return;
        }

        await firstWorkouts.promise;
        if (cancelled) return;
        const mirrored = workoutsRef.current ?? [];
        const known = new Map(mirrored.map((w) => [w.id, w]));

        const newest = mirrored.reduce((latest, w) => (w.start > latest ? w.start : latest), '');
        let since;
        if (newest) {
          since = new Date(newest);
          since.setDate(since.getDate() - OVERLAP_DAYS);
        } else {
          since = daysAgo(FULL_WORKOUT_DAYS);
        }

        const zone =
          profile?.zone1Low != null && profile?.zone1High != null
            ? { low: Number(profile.zone1Low), high: Number(profile.zone1High) }
            : null;
        if (zone) {
          const zoneFrom = daysAgo(ZONE_DAYS);
          if (zoneFrom < since) since = zoneFrom;
        }

        const [data, sessions] = await Promise.all([
          healthSeries(SERIES_DAYS),
          workoutsSince(since, { zone, known, zoneDays: ZONE_DAYS }),
        ]);
        if (cancelled) return;
        freshRef.current = true;
        setSeries(data);
        lastRead = Date.now();

        const fingerprint = JSON.stringify([
          Object.entries(data).map(([key, points]) => [key, points.length, points.at(-1)?.value]),
          sessions.map((w) => [w.id, w.durationMin, w.avgHr, w.zoneMin]),
        ]);
        if (fingerprint === lastSynced) return;
        lastSynced = fingerprint;

        saveHealthSnapshot(user.uid, data).catch((error) =>
          console.warn('health snapshot save failed', error)
        );
        // Write only what is new or changed; the rest is already in the account.
        const changed = sessions.filter((w) => {
          const before = known.get(w.id);
          return (
            !before ||
            before.zoneMin !== w.zoneMin ||
            before.avgHr !== w.avgHr ||
            before.durationMin !== w.durationMin ||
            before.metres !== w.metres
          );
        });
        if (changed.length) {
          saveWorkouts(user.uid, changed).catch((error) =>
            console.warn('workout save failed', error)
          );
        }
      } finally {
        running = false;
        if (!cancelled) setRefreshing(false);
      }
    };
    read();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [user, profile?.zone1Low, profile?.zone1High, firstWorkouts]);

  // A spinner only when there is genuinely nothing to show yet: before the
  // account's copy has answered, or on a first launch with an empty account
  // while the very first Health read runs.
  const loading = !denied && series === null && (workouts === null || refreshing);

  return { series, workouts: workouts ?? [], loading, refreshing, denied, capturedAt };
}

/** How old the mirrored copy is, in words. */
export function describeAge(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatHours(hours) {
  if (hours == null) return '—';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 60) return `${whole + 1}h 0m`;
  return `${whole}h ${minutes}m`;
}
