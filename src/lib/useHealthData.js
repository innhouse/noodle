/**
 * One place that reads Apple Health and keeps the account's copy in step.
 *
 * On the phone: read HealthKit, hand the data to the screen, and mirror it to
 * Firestore so the web can show the same numbers. Re-reads when the app returns to
 * the foreground, because the watch syncs in the background and a tab opened at
 * breakfast is stale by lunch.
 *
 * Off the phone: HealthKit does not exist, so read the mirrored copy and say how
 * old it is.
 *
 * Both screens that show health data use this, so neither can drift from the other.
 */
import { useEffect, useRef, useState } from 'react';
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
// Everything Health holds; incremental sync keeps later reads cheap.
const WORKOUT_DAYS = 365 * 10;

export function useHealthData() {
  const { user, profile } = useAuth();
  const [series, setSeries] = useState(null);
  const [workouts, setWorkouts] = useState(null);
  // The latest mirrored list, readable from inside the Health read without
  // re-running it every time the list changes.
  const workoutsRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [capturedAt, setCapturedAt] = useState(null);

  // The account's copy of workouts is the list on every platform. On the phone it
  // is refreshed from Health first, below, so this is never behind by more than
  // one read.
  useEffect(() => {
    if (!user) return undefined;
    return watchWorkouts(user.uid, (list) => {
      workoutsRef.current = list;
      setWorkouts(list);
    });
  }, [user]);

  useEffect(() => {
    if (healthSupported || !user) return undefined;
    return watchHealthSnapshot(user.uid, (snapshot) => {
      setSeries(snapshot?.series ?? null);
      setCapturedAt(snapshot?.capturedAt ?? null);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!healthSupported || !user) return undefined;

    let cancelled = false;
    let lastSynced = null;

    const read = async () => {
      const granted = await requestHealthAccess();
      if (cancelled) return;
      if (!granted) {
        setDenied(true);
        setLoading(false);
        return;
      }

      const since = new Date();
      since.setDate(since.getDate() - WORKOUT_DAYS);
      const zone =
        profile?.zone1Low != null && profile?.zone1High != null
          ? { low: Number(profile.zone1Low), high: Number(profile.zone1High) }
          : null;
      const known = new Map((workoutsRef.current ?? []).map((w) => [w.id, w]));
      const [data, sessions] = await Promise.all([
        healthSeries(SERIES_DAYS),
        workoutsSince(since, { zone, known }),
      ]);
      if (cancelled) return;
      setSeries(data);
      setLoading(false);

      // Skip the mirror when nothing changed since the last write this session,
      // which is the common case when the tab is reopened within a few minutes.
      const fingerprint = JSON.stringify([
        Object.entries(data).map(([key, points]) => [key, points.length, points.at(-1)?.value]),
        sessions.map((s) => [s.id, s.durationMin, s.avgHr, s.zoneMin]),
      ]);
      if (fingerprint === lastSynced) return;
      lastSynced = fingerprint;

      saveHealthSnapshot(user.uid, data).catch((error) =>
        console.warn('health snapshot save failed', error)
      );
      // Write only what is new or changed; the rest is already in the account.
      const changed = sessions.filter((w) => {
        const before = known.get(w.id);
        return !before || before.zoneMin !== w.zoneMin || before.avgHr !== w.avgHr;
      });
      if (changed.length) {
        saveWorkouts(user.uid, changed).catch((error) =>
          console.warn('workout save failed', error)
        );
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
  }, [user, profile?.zone1Low, profile?.zone1High]);

  return { series, workouts: workouts ?? [], loading, denied, capturedAt };
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
