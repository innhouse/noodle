/**
 * Every night of sleep Noodle knows about.
 *
 * The account keeps one document per night. On the phone, opening the history
 * reads Health from a few days before the newest stored night — or everything,
 * the first time — and writes only nights that are new or changed. The web
 * shows the stored copy.
 */
import { useEffect, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { healthSupported, requestHealthAccess, sleepNightsSince } from './health';
import { saveSleepNights, watchSleepNights } from './store';

const FULL_YEARS = 10;
// Re-read this far before the newest stored night, for late watch syncs.
const OVERLAP_DAYS = 3;

export function useSleepHistory() {
  const { user } = useAuth();
  const [nights, setNights] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [added, setAdded] = useState(null);
  const synced = useRef(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchSleepNights(user.uid, setNights);
  }, [user]);

  useEffect(() => {
    if (!healthSupported || !user || nights === null || synced.current) return;
    synced.current = true;
    const stored = new Map(nights.map((n) => [n.date, n]));
    const newest = nights.length ? nights[nights.length - 1].date : null;
    let since;
    if (newest) {
      const [y, m, d] = newest.split('-').map(Number);
      since = new Date(y, m - 1, d - OVERLAP_DAYS);
    } else {
      since = new Date();
      since.setFullYear(since.getFullYear() - FULL_YEARS);
    }
    setSyncing(true);
    (async () => {
      if (!(await requestHealthAccess())) return;
      const read = await sleepNightsSince(since);
      const changed = read.filter((n) => {
        const before = stored.get(n.date);
        return !before || Math.abs(before.hours - n.value) > 0.01;
      });
      if (changed.length) await saveSleepNights(user.uid, changed);
      setAdded(changed.length);
    })()
      .catch((error) => console.warn('sleep history sync failed', error))
      .finally(() => setSyncing(false));
  }, [user, nights]);

  return { nights, syncing, added };
}
