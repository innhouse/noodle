/**
 * Apple Health, for every platform that isn't iOS.
 *
 * HealthKit exists only on iOS, so web and Android resolve to these no-ops and the
 * screens can call them unconditionally. Metro picks health.ios.js on iOS.
 */

export const healthSupported = false;

export async function requestHealthAccess() {
  return false;
}

export async function latestWeightKg() {
  return null;
}

export async function activeEnergyToday() {
  return null;
}
