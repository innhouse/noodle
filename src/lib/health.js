/**
 * Apple Health integration, currently disabled.
 *
 * The HealthKit package (@kingstinct/react-native-healthkit, which depends on
 * react-native-nitro-modules) crashed the app at launch on iOS. Nitro modules
 * register natively during startup regardless of whether JavaScript imports them,
 * so guarding the JS import did not help — the app died before any of our code ran.
 *
 * These no-ops keep every call site working while the integration is out. When it
 * is revisited, the fix has to be proven on a device before shipping: a crash on
 * launch leaves no way in to correct it, which is far worse than not having the
 * feature. Getting the crash log from TestFlight is the place to start.
 */

export const healthSupported = false;

export async function requestHealthAccess() {
  return false;
}

export async function latestWeightKg() {
  return null;
}

export async function activeEnergyForDay() {
  return null;
}
