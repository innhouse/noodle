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
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { HEALTH_METRICS } from './healthMetrics';

export { HEALTH_METRICS, METRIC_GROUPS } from './healthMetrics';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const SLEEP_ANALYSIS = 'HKCategoryTypeIdentifierSleepAnalysis';
const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';
const HR_RECOVERY = 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute';
const WORKOUT = 'HKWorkoutTypeIdentifier';

// HKCategoryValueSleepAnalysis. inBed (0) and awake (2) are not sleep — counting
// them would turn a restless night into a long one.
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
const SLEEP_STAGES = { 3: 'core', 4: 'deep', 5: 'rem' };

const READ_TYPES = [
  BODY_MASS,
  ACTIVE_ENERGY,
  SLEEP_ANALYSIS,
  HEART_RATE,
  WORKOUT,
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

/**
 * Every workout Health holds from `since` onwards, newest first, flattened to
 * plain numbers so the result can be stored and shown on the web.
 *
 * Any app that writes workouts to Health arrives here — the watch's own runs, a
 * strength session logged in Jefit, a walk from the phone. Heart rate comes from a
 * second query per workout, because it lives in separate samples rather than on
 * the workout itself; a session recorded without the watch simply has none.
 *
 * Health has no place for sets, reps or weights lifted, so a strength session is
 * a duration and a heart-rate trace and nothing more. That is Health's limit, not
 * a choice made here.
 */
export async function workoutsSince(since, options = {}) {
  const { zone = null, zoneDays = 60, known = null } = options;
  let workouts;
  try {
    workouts = await queryWorkoutSamples({
      limit: 0,
      ascending: false,
      filter: { date: { startDate: since, endDate: new Date() } },
    });
  } catch (error) {
    console.warn('health workout read failed', error);
    return [];
  }

  // The watch writes a one-minute recovery sample a minute or so after a session
  // ends. Fetch them all once and match each to the workout it followed.
  const recoveries = await recoverySamplesSince(since);

  const results = [];
  for (const workout of workouts ?? []) {
    try {
      const start = new Date(workout.startDate);
      const end = new Date(workout.endDate);
      const durationMin = quantityIn(workout.duration, 's') / 60;
      if (!(durationMin > 0)) continue;

      // Already mirrored: reuse it rather than re-querying its heart rate, unless
      // a zone has been set since and this session is recent enough to count.
      const existing = known?.get?.(workout.uuid);
      // Mirrored before without heart rate: look once at the watch's own
      // readings for that window — apps such as Nike Run Club write the run but
      // leave the heart rate unattached, even when the watch recorded it.
      if (existing && existing.avgHr == null && !existing.hrChecked) {
        const hr = await heartRateDuring(start, end);
        results.push({
          ...existing,
          avgHr: hr?.avg ?? null,
          maxHr: hr?.max ?? existing.maxHr ?? null,
          hrChecked: true,
        });
        continue;
      }
      if (existing) {
        const wantsZone =
          zone?.low != null &&
          zone?.high != null &&
          end.getTime() > Date.now() - zoneDays * 86_400_000 &&
          (existing.zoneMin == null || existing.zoneLow !== zone.low || existing.zoneHigh !== zone.high);
        if (!wantsZone) {
          results.push(existing);
          continue;
        }
        const zoneMin = await minutesInZone(workout, zone);
        results.push({ ...existing, zoneMin, zoneLow: zone.low, zoneHigh: zone.high });
        continue;
      }

      let avgHr = null;
      let maxHr = null;
      try {
        const stats = await workout.getStatistic(HEART_RATE, 'count/min');
        avgHr = stats?.averageQuantity?.quantity ?? null;
        maxHr = stats?.maximumQuantity?.quantity ?? null;
      } catch {
        // No heart-rate samples attached to this session.
      }
      // Nothing attached: fall back to whatever the watch recorded in that
      // window. A run recorded on the phone alone still has none.
      if (avgHr == null) {
        const hr = await heartRateDuring(start, end);
        avgHr = hr?.avg ?? null;
        maxHr = hr?.max ?? maxHr;
      }

      // Minutes inside the person's own zone 1, from the session's heart-rate
      // trace. Only for recent sessions — each needs its own query — and only
      // when a zone has been set, since a guessed zone would be worse than none.
      let zoneMin = null;
      if (zone?.low != null && zone?.high != null && end.getTime() > Date.now() - zoneDays * 86_400_000) {
        zoneMin = await minutesInZone(workout, zone);
      }

      const metadata = workout.metadata ?? {};
      results.push({
        id: workout.uuid,
        type: workout.workoutActivityType,
        start: start.toISOString(),
        end: end.toISOString(),
        date: localDayKey(start),
        durationMin: round(durationMin, 1),
        metres: workout.totalDistance ? round(quantityIn(workout.totalDistance, 'm'), 0) : null,
        kcal: workout.totalEnergyBurned
          ? round(quantityIn(workout.totalEnergyBurned, 'kcal'), 0)
          : null,
        avgHr: avgHr == null ? null : Math.round(avgHr),
        hrChecked: true,
        maxHr: maxHr == null ? null : Math.round(maxHr),
        hrr: recoveryFor(recoveries, end),
        zoneMin,
        zoneLow: zoneMin == null ? null : zone.low,
        zoneHigh: zoneMin == null ? null : zone.high,
        indoor: metadata.HKIndoorWorkout === true || metadata.HKIndoorWorkout === 1,
        source: sourceName(workout, metadata),
      });
    } catch (error) {
      console.warn('health workout parse failed', error);
    }
  }
  return results;
}

/**
 * Average and peak heart rate from every reading Health holds between two
 * times, whichever app or device wrote them. Each reading is weighted by the
 * time until the next (capped at a minute), so a burst of readings during a
 * hill doesn't outweigh a quiet stretch. Null when there are fewer than three.
 */
async function heartRateDuring(start, end) {
  try {
    const samples = await queryQuantitySamples(HEART_RATE, {
      limit: 0,
      ascending: true,
      unit: 'count/min',
      filter: { date: { startDate: start, endDate: end } },
    });
    const list = (samples ?? [])
      .map((s) => ({ at: new Date(s.startDate).getTime(), bpm: s.quantity }))
      .filter((s) => typeof s.bpm === 'number' && s.bpm > 0);
    if (list.length < 3) return null;
    let weighted = 0;
    let total = 0;
    for (let i = 0; i < list.length; i += 1) {
      const next = i + 1 < list.length ? list[i + 1].at : end.getTime();
      const gap = Math.max(1000, Math.min(60_000, next - list[i].at));
      weighted += list[i].bpm * gap;
      total += gap;
    }
    return { avg: Math.round(weighted / total), max: Math.round(Math.max(...list.map((s) => s.bpm))) };
  } catch {
    return null;
  }
}

/**
 * Minutes of a session spent with heart rate inside [low, high].
 *
 * Heart-rate samples are instants, so each one stands for the time until the
 * next sample, capped at a minute so a gap in the trace is not counted as time
 * in zone.
 */
async function minutesInZone(workout, zone) {
  try {
    const samples = await queryQuantitySamples(HEART_RATE, {
      limit: 0,
      ascending: true,
      unit: 'count/min',
      filter: { date: { startDate: new Date(workout.startDate), endDate: new Date(workout.endDate) } },
    });
    const list = (samples ?? [])
      .map((s) => ({ at: new Date(s.startDate).getTime(), bpm: s.quantity }))
      .filter((s) => typeof s.bpm === 'number');
    if (list.length < 2) return null;
    let seconds = 0;
    for (let i = 0; i < list.length - 1; i += 1) {
      const gap = Math.min(60_000, list[i + 1].at - list[i].at);
      if (list[i].bpm >= zone.low && list[i].bpm <= zone.high) seconds += gap / 1000;
    }
    return Math.round(seconds / 60);
  } catch {
    return null;
  }
}

async function recoverySamplesSince(since) {
  try {
    const samples = await queryQuantitySamples(HR_RECOVERY, {
      limit: 0,
      ascending: true,
      unit: 'count/min',
      filter: { date: { startDate: since, endDate: new Date() } },
    });
    return (samples ?? [])
      .filter((sample) => typeof sample.quantity === 'number')
      .map((sample) => ({ at: new Date(sample.startDate).getTime(), drop: sample.quantity }));
  } catch {
    return [];
  }
}

/** The recovery reading taken within five minutes after a workout ended, if any. */
function recoveryFor(recoveries, end) {
  const endMs = end.getTime();
  const match = recoveries.find((r) => r.at >= endMs - 60_000 && r.at <= endMs + 5 * 60_000);
  return match ? Math.round(match.drop) : null;
}

function quantityIn(quantity, unit) {
  if (quantity == null) return 0;
  if (typeof quantity === 'number') return quantity;
  const value = quantity.quantity ?? 0;
  const from = quantity.unit ?? unit;
  if (from === unit) return value;
  // The few conversions HealthKit hands back for these fields.
  if (unit === 's' && from === 'min') return value * 60;
  if (unit === 'm' && from === 'km') return value * 1000;
  if (unit === 'm' && from === 'mi') return value * 1609.344;
  if (unit === 'kcal' && from === 'kJ') return value / 4.184;
  return value;
}

/**
 * The app that wrote the workout — "Apple Watch", "JEFIT".
 *
 * The source arrives as a native proxy object whose own `name` property is the
 * proxy's class name, not the app's, so it has to be unwrapped with toJSON first.
 */
function sourceName(workout, metadata) {
  const revision = workout.sourceRevision ?? workout.source;
  const source = revision?.source ?? revision;
  let plain = null;
  try {
    plain = typeof source?.toJSON === 'function' ? source.toJSON() : source;
  } catch {
    plain = null;
  }
  const name = plain?.name;
  if (name && name !== 'SourceProxy') return String(name);
  if (metadata.HKWorkoutBrandName) return String(metadata.HKWorkoutBrandName);
  return null;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * The night a sleep segment belongs to, named by the morning it ends on.
 *
 * A segment that ends before noon belongs to that day's night; one that ends
 * after noon (the first hours of sleep, before midnight) belongs to the next
 * day's. Keying by the segment's own date would split a 9pm–7am night in two.
 */
function nightKey(date) {
  const d = new Date(date);
  if (d.getHours() >= 12) d.setDate(d.getDate() + 1);
  return localDayKey(d);
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
 * that is the day it affects. Segments before midnight are filed forward to the
 * morning they lead to, so a 9pm–7am night is one night, not two half-nights.
 *
 * Only genuine sleep counts. HealthKit also logs "in bed" and "awake" segments, and
 * including them would turn a broken night into a long one.
 */
async function sleepSeries(days) {
  return sleepNightsSince(windowStart(days));
}

/** Every night from `since` on, same shape as the daily sleep series. */
export async function sleepNightsSince(since) {
  const samples = await queryCategorySamples(SLEEP_ANALYSIS, {
    limit: 0,
    ascending: true,
    filter: { date: { startDate: since, endDate: new Date() } },
  });

  const byNight = new Map();
  for (const sample of samples ?? []) {
    if (!ASLEEP_VALUES.has(sample.value)) continue;

    const start = new Date(sample.startDate).getTime();
    const end = new Date(sample.endDate).getTime();
    const hours = (end - start) / 3_600_000;
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const key = nightKey(sample.endDate);
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
