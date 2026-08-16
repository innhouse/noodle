/**
 * Apple Health reads.
 *
 * Read-only and deliberately narrow: body mass and active energy, nothing else.
 * Noodle never writes to Health — it is the user's record, and a food tracker has
 * no business editing it.
 */
import {
  isHealthDataAvailableAsync,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';

export const healthSupported = true;

export async function requestHealthAccess() {
  try {
    if (!(await isHealthDataAvailableAsync())) return false;
    return await requestAuthorization({ toRead: [BODY_MASS, ACTIVE_ENERGY] });
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

/** Active energy burned since midnight, in kcal. Excludes resting metabolism. */
export async function activeEnergyToday() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await queryStatisticsForQuantity(ACTIVE_ENERGY, ['cumulativeSum'], {
      filter: { date: { startDate: startOfDay, endDate: new Date() } },
      unit: 'kcal',
    });
    return result?.sumQuantity?.quantity ?? 0;
  } catch (error) {
    console.warn('health energy read failed', error);
    return null;
  }
}
