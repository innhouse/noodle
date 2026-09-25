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
  queryQuantitySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';

/**
 * Heart metrics, with the unit HealthKit expects for each.
 *
 * Units are not interchangeable — asking for a rate in 'count/s' returns a number
 * sixty times smaller with no error, which would look like a resting pulse of one.
 * `daily` marks the metrics Apple already stores once per day; the rest are sampled
 * continuously and get averaged per day before display.
 */
export const HEART_METRICS = {
  restingHeartRate: {
    id: 'HKQuantityTypeIdentifierRestingHeartRate',
    unit: 'count/min',
    label: 'Resting heart rate',
    short: 'bpm',
    daily: true,
    // Lower is generally fitter, so an improving trend goes down.
    betterWhen: 'lower',
  },
  hrv: {
    id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    unit: 'ms',
    label: 'Heart rate variability',
    short: 'ms',
    daily: false,
    betterWhen: 'higher',
  },
  vo2Max: {
    id: 'HKQuantityTypeIdentifierVO2Max',
    unit: 'ml/(kg*min)',
    label: 'Cardio fitness (VO₂ max)',
    short: 'ml/kg/min',
    daily: false,
    betterWhen: 'higher',
  },
  walkingHeartRate: {
    id: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
    unit: 'count/min',
    label: 'Walking heart rate',
    short: 'bpm',
    daily: true,
    betterWhen: 'lower',
  },
  heartRateRecovery: {
    id: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
    unit: 'count/min',
    label: 'Heart rate recovery',
    short: 'bpm drop',
    daily: false,
    betterWhen: 'higher',
  },
  respiratoryRate: {
    id: 'HKQuantityTypeIdentifierRespiratoryRate',
    unit: 'count/min',
    label: 'Respiratory rate',
    short: 'breaths/min',
    daily: false,
    betterWhen: null,
  },
  oxygenSaturation: {
    id: 'HKQuantityTypeIdentifierOxygenSaturation',
    unit: '%',
    label: 'Blood oxygen',
    short: '%',
    daily: false,
    betterWhen: 'higher',
  },
  systolic: {
    id: 'HKQuantityTypeIdentifierBloodPressureSystolic',
    unit: 'mmHg',
    label: 'Blood pressure (systolic)',
    short: 'mmHg',
    daily: false,
    betterWhen: null,
  },
  diastolic: {
    id: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
    unit: 'mmHg',
    label: 'Blood pressure (diastolic)',
    short: 'mmHg',
    daily: false,
    betterWhen: null,
  },
};

const READ_TYPES = [
  BODY_MASS,
  ACTIVE_ENERGY,
  ...Object.values(HEART_METRICS).map((metric) => metric.id),
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

/**
 * One value per day for a metric, over the last `days` days.
 *
 * Continuously sampled metrics like HRV produce many readings a day, so they are
 * averaged per day. Averaging is the honest reduction here: a max would be picking
 * whichever reading happened during a stressful moment, and a last-of-day would be
 * whenever the watch last felt like measuring.
 */
async function dailySeries(metric, days) {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const samples = await queryQuantitySamples(metric.id, {
    limit: 0, // all samples in range
    ascending: true,
    unit: metric.unit,
    filter: { date: { startDate: start, endDate: new Date() } },
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

  return [...byDay.entries()]
    .map(([date, bucket]) => ({ date, value: bucket.sum / bucket.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Every heart metric at once, as daily series.
 *
 * Each metric is fetched independently and a failure on one returns an empty series
 * rather than rejecting the lot — a watch that has never recorded VO₂ max should not
 * stop the resting heart rate showing.
 */
export async function heartSeries(days = 90) {
  const entries = await Promise.all(
    Object.entries(HEART_METRICS).map(async ([key, metric]) => {
      try {
        return [key, await dailySeries(metric, days)];
      } catch (error) {
        console.warn(`health read failed for ${key}`, error);
        return [key, []];
      }
    })
  );
  return Object.fromEntries(entries);
}
