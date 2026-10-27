/**
 * Apple Health reads.
 *
 * Read-only throughout. Noodle never writes to Health — it is the user's record,
 * and a food tracker has no business editing it.
 *
 * Nothing here interprets a reading medically. These are the numbers Health
 * already holds, fetched and handed back so the app can show them next to what
 * was eaten. Anything that looks like a judgement belongs to the user and their
 * doctor, not to this file.
 */
import {
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { HEALTH_METRICS } from './healthMetrics';

export { HEALTH_METRICS, METRIC_GROUPS } from './healthMetrics';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis';

// HKCategoryValueSleepAnalysis. inBed (0) and awake (2) are not sleep — counting
// them would turn a restless night into a long one.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
const SLEEP_STAGES = { 3: 'core', 4: 'deep', 5: 'rem' };

const READ_TYPES = [
  BODY_MASS,
  ACTIVE_ENERGY,
  SLEEP_ANALYSIS,
  ...Object.values(HEALTH_METRICS).map((metric) => metric.id),
];

export const healthSupported = true;

export async function requestHealthAccess() {
  try {
    if (!(await isHealthDataAvailableAsync())) return false;
    return await requestAuthorization({ toRead: READ_TYPES });
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
  try {
    const samples = await queryQuantitySamples(BODY_MASS, {
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
 * Every weigh-in Health holds from `since` onwards, one per local day.
 *
 * Several readings on one day collapse to the last one taken, matching how the
 * store keys weights by date. Health's own data is left untouched — this is a
 * read, and the app's log is a copy the user can correct independently.
 */
export async function weightSamplesSince(since) {
  try {
    const samples = await queryQuantitySamples(BODY_MASS, {
      limit: 0,
      ascending: true,
      unit: 'kg',
      filter: { date: { startDate: since, endDate: new Date() } },
    });

    const byDay = new Map();
    for (const sample of samples ?? []) {
      if (typeof sample.quantity !== 'number' || !(sample.quantity > 0)) continue;
      byDay.set(localDayKey(sample.endDate ?? sample.startDate), sample.quantity);
    }
    return [...byDay.entries()]
      .map(([date, weightKg]) => ({ date, weightKg }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn('health weight history read failed', error);
    return [];
  }
}

/**
 * Active energy burned on a given local day, in kcal. Excludes resting metabolism.
 *
 * Takes a day rather than assuming today so that scrolling back through the log
 * shows the activity that actually accompanied those meals.
 */
export async function activeEnergyForDay(day) {
  try {
    const [year, month, date] = day.split('-').map(Number);
    const start = new Date(year, month - 1, date, 0, 0, 0, 0);
    const end = new Date(year, month - 1, date, 23, 59, 59, 999);
    // For today, stop at now — a day that is still running has no evening yet.
    const until = end > new Date() ? new Date() : end;

    const result = await queryStatisticsForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], {
      filter: { date: { startDate: start, endDate: until } },
      unit: 'kcal',
    });
    return result?.sumQuantity?.quantity ?? 0;
  } catch (error) {
    console.warn('health energy read failed', error);
    return null;
  }
}

function localDayKey(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function windowStart(days) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * One value per day for a metric, over the last `days` days.
 *
 * Samples are summed or averaged according to the metric, because the two are not
 * interchangeable: a day's steps arrive as dozens of partial counts that have to be
 * added, while a day's heart rates have to be averaged. Getting this backwards
 * produces numbers that look reasonable and are not.
 */
async function dailySeries(metric, days) {
  const samples = await queryQuantitySamples(metric.id, {
    limit: 0, // every sample in range
    ascending: true,
    unit: metric.unit,
    filter: { date: { startDate: windowStart(days), endDate: new Date() } },
  });

  const byDay = new Map();
  for (const sample of samples ?? []) {
    if (typeof sample.quantity !== 'number' || Number.isNaN(sample.quantity)) continue;
    const key = localDayKey(sample.endDate ?? sample.startDate);
    const bucket = byDay.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += sample.quantity;
    bucket.count += 1;
    byDay.set(key, bucket);
  }

  const convert = metric.convert ?? ((value) => value);
  return [...byDay.entries()]
    .map(([date, bucket]) => ({
      date,
      value: convert(metric.aggregate === 'sum' ? bucket.sum : bucket.sum / bucket.count),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Sleep per night, in hours, with the stage breakdown where the watch recorded one.
 *
 * A night is filed under the day you woke up, not the evening you went to bed, since
 * that is the day it affects — you eat breakfast tired, not the night before.
 *
 * Only genuine sleep counts. HealthKit also logs "in bed" and "awake" segments, and
 * including them would turn a broken night into a long one.
 */
async function sleepSeries(days) {
  const samples = await queryCategorySamples(SLEEP_ANALYSIS, {
    limit: 0,
    ascending: true,
    filter: { date: { startDate: windowStart(days), endDate: new Date() } },
  });

  const byNight = new Map();
  for (const sample of samples ?? []) {
    if (!ASLEEP_VALUES.has(sample.value)) continue;

    const start = new Date(sample.startDate).getTime();
    const end = new Date(sample.endDate).getTime();
    const hours = (end - start) / 3_600_000;
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const key = localDayKey(sample.endDate);
    const night = byNight.get(key) ?? { total: 0, core: 0, deep: 0, rem: 0 };
    night.total += hours;
    const stage = SLEEP_STAGES[sample.value];
    if (stage) night[stage] += hours;
    byNight.set(key, night);
  }

  return [...byNight.entries()]
    .map(([date, night]) => ({ date, value: night.total, stages: night }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every metric at once, as daily series.
 *
 * Each is fetched independently and a failure returns an empty series rather than
 * rejecting the lot — a watch that has never recorded VO₂ max should not stop the
 * resting heart rate showing. The screen renders only what came back with data, so
 * this stays correct as hardware gains and loses sensors.
 */
export async function healthSeries(days = 90) {
  const entries = await Promise.all(
    Object.entries(HEALTH_METRICS).map(async ([key, metric]) => {
      try {
        return [key, await dailySeries(metric, days)];
      } catch (error) {
        console.warn(`health read failed for ${key}`, error);
        return [key, []];
      }
    })
  );

  let sleep = [];
  try {
    sleep = await sleepSeries(days);
  } catch (error) {
    console.warn('health sleep read failed', error);
  }

  return { ...Object.fromEntries(entries), sleep };
}
