/**
 * Apple Health reads.
 *
 * Read-only and deliberately narrow: body mass and active energy, nothing else.
 * Noodle never writes to Health — it is the user's record, and a food tracker has
 * no business editing it.
 *
 * The native module is loaded lazily inside a try/catch rather than imported at the
 * top. A top-level import runs during startup, so anything wrong with the native
 * side — a missing entitlement, a provisioning profile without HealthKit, a version
 * mismatch — took the whole app down before a single screen rendered. Health is a
 * convenience; it must never be able to stop the app opening.
 */

let cached;
let loadFailed = false;

function healthkit() {
  if (cached || loadFailed) return cached;
  try {
    // eslint-disable-next-line global-require
    cached = require('@kingstinct/react-native-healthkit');
    return cached;
  } catch (error) {
    console.warn('HealthKit unavailable', error);
    loadFailed = true;
    return undefined;
  }
}

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';

export const healthSupported = true;

export async function requestHealthAccess() {
  const hk = healthkit();
  if (!hk) return false;
  try {
    if (!(await hk.isHealthDataAvailableAsync())) return false;
    return await hk.requestAuthorization({ toRead: [BODY_MASS, ACTIVE_ENERGY] });
  } catch (error) {
    console.warn('health authorisation failed', error);
    return false;
  }
}

/**
 * Most recent weigh-in, with the date it was taken.
 *
 * The date matters as much as the number: a Fitbit or Withings scale reaches Health
 * only when its own app syncs, so the "latest" reading can be days stale. The screen
 * shows when it was recorded rather than implying it is today's.
 */
export async function latestWeightKg() {
  const hk = healthkit();
  if (!hk) return null;
  try {
    const samples = await hk.queryQuantitySamples(BODY_MASS, {
      limit: 1,
      ascending: false,
      unit: 'kg',
    });
    const sample = samples?.[0];
    if (!sample) return null;
    return { weightKg: sample.quantity, date: sample.endDate ?? sample.startDate };
  } catch (error) {
    console.warn('health weight read failed', error);
    return null;
  }
}

/**
 * Active energy burned on a given local day, in kcal. Excludes resting metabolism.
 *
 * Takes a day rather than assuming today so that scrolling back through the log
 * shows the activity that actually accompanied those meals.
 */
export async function activeEnergyForDay(day) {
  const hk = healthkit();
  if (!hk) return null;
  try {
    const [year, month, date] = day.split('-').map(Number);
    const start = new Date(year, month - 1, date, 0, 0, 0, 0);
    const end = new Date(year, month - 1, date, 23, 59, 59, 999);
    // For today, stop at now — a day that is still running has no evening yet.
    const until = end > new Date() ? new Date() : end;

    const result = await hk.queryStatisticsForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], {
      filter: { date: { startDate: start, endDate: until } },
      unit: 'kcal',
    });
    return result?.sumQuantity?.quantity ?? 0;
  } catch (error) {
    console.warn('health energy read failed', error);
    return null;
  }
}
