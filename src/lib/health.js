/**
 * Apple Health, for every platform that isn't iOS.
 *
 * HealthKit exists only on iOS, so web and Android resolve to these no-ops and the
 * screens can call them unconditionally. Metro picks health.ios.js on iOS.
 *
 * HEART_METRICS is duplicated rather than imported because the screens use it for
 * labels and ordering even where no data can arrive — the web build still renders
 * the metric names and an explanation of why they are empty.
 */

export const HEART_METRICS = {
  restingHeartRate: { label: 'Resting heart rate', short: 'bpm', betterWhen: 'lower' },
  hrv: { label: 'Heart rate variability', short: 'ms', betterWhen: 'higher' },
  vo2Max: { label: 'Cardio fitness (VO₂ max)', short: 'ml/kg/min', betterWhen: 'higher' },
  walkingHeartRate: { label: 'Walking heart rate', short: 'bpm', betterWhen: 'lower' },
  heartRateRecovery: { label: 'Heart rate recovery', short: 'bpm drop', betterWhen: 'higher' },
  respiratoryRate: { label: 'Respiratory rate', short: 'breaths/min', betterWhen: null },
  oxygenSaturation: { label: 'Blood oxygen', short: '%', betterWhen: 'higher' },
  systolic: { label: 'Blood pressure (systolic)', short: 'mmHg', betterWhen: null },
  diastolic: { label: 'Blood pressure (diastolic)', short: 'mmHg', betterWhen: null },
};

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

export async function heartSeries() {
  return {};
}
