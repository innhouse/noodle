/**
 * Apple Health, for every platform that isn't iOS.
 *
 * HealthKit exists only on iOS, so web and Android resolve to these no-ops and the
 * screens can call them unconditionally. Metro picks health.ios.js on iOS.
 *
 * The metric registry is re-exported rather than stubbed: it is pure data, the
 * screens use it for labels and ordering even where no readings can arrive, and a
 * second copy here would quietly drift out of step with the real one.
 */

export { HEALTH_METRICS, METRIC_GROUPS } from './healthMetrics';

export const healthSupported = false;

export async function requestHealthAccess() {
  return false;
}

export async function latestWeightKg() {
  return null;
}

export async function weightSamplesSince() {
  return [];
}

export async function activeEnergyForDay() {
  return null;
}

export async function healthSeries() {
  return {};
}
