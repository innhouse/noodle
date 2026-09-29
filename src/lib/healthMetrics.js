/**
 * What Noodle reads from Apple Health, and how to read the numbers back.
 *
 * Pure data and pure functions — no native imports — so the web build can share
 * the labels and units rather than keeping a copy that drifts out of step.
 *
 * Nothing here diagnoses anything. Metrics are compared only against the same
 * person's earlier readings, which is the only comparison this app is entitled to
 * make. There are no normal ranges: a resting heart rate that is unremarkable in
 * one person warrants a doctor in another, and an app guessing which would be worse
 * than one that stays quiet.
 */
const KG_TO_LB = 2.2046226218;
const M_TO_INCH = 39.3700787;
const M_TO_MILE = 0.000621371;
const M_TO_FOOT = 3.2808399;
const MS_TO_MPH = 2.23693629;

/**
 * Every metric Noodle reads, with the unit HealthKit expects and how to reduce a
 * day's worth of samples.
 *
 * Three fields here are load-bearing and easy to get wrong:
 *
 * `unit` is not interchangeable. Asking for a rate in 'count/s' returns a number
 * sixty times smaller with no error, which would read as a resting pulse of one.
 *
 * `aggregate` decides how a day's samples collapse. Steps, minutes and distances
 * accumulate and must be summed; rates and measurements must be averaged. Averaging
 * step counts would report the size of a typical sample rather than the day's total,
 * which looks plausible and is wildly wrong.
 *
 * `convert` moves HealthKit's SI value into the units this app shows. Health stores
 * waist in metres and mass in kilograms regardless of what the phone displays.
 */
export const HEALTH_METRICS = {
  // --- Heart -------------------------------------------------------------
  restingHeartRate: {
    id: 'HKQuantityTypeIdentifierRestingHeartRate',
    unit: 'count/min',
    label: 'Resting heart rate',
    short: 'bpm',
    group: 'heart',
    aggregate: 'mean',
    // Lower is generally fitter, so an improving trend goes down.
    betterWhen: 'lower',
    noise: 1,
  },
  hrv: {
    id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
    unit: 'ms',
    label: 'Heart rate variability',
    short: 'ms',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 1,
    noise: 4,
  },
  walkingHeartRate: {
    id: 'HKQuantityTypeIdentifierWalkingHeartRateAverage',
    unit: 'count/min',
    label: 'Walking heart rate',
    short: 'bpm',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: 'lower',
    noise: 1.5,
  },
  heartRateRecovery: {
    id: 'HKQuantityTypeIdentifierHeartRateRecoveryOneMinute',
    unit: 'count/min',
    label: 'Heart rate recovery',
    short: 'bpm drop',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: 'higher',
    noise: 2,
  },
  afibBurden: {
    id: 'HKQuantityTypeIdentifierAtrialFibrillationBurden',
    unit: '%',
    label: 'AFib burden',
    short: '%',
    group: 'heart',
    aggregate: 'mean',
    // Deliberately no direction. This is a clinical measure and colouring it would
    // be the app offering an opinion it has no business having.
    betterWhen: null,
    decimals: 1,
    noise: 0.5,
  },
  respiratoryRate: {
    id: 'HKQuantityTypeIdentifierRespiratoryRate',
    unit: 'count/min',
    label: 'Respiratory rate',
    short: 'breaths/min',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: null,
    decimals: 1,
    noise: 0.5,
  },
  oxygenSaturation: {
    id: 'HKQuantityTypeIdentifierOxygenSaturation',
    unit: '%',
    label: 'Blood oxygen',
    short: '%',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 1,
    noise: 0.5,
    // Some sources report a fraction, others a percentage.
    convert: (value) => (value <= 1 ? value * 100 : value),
  },
  systolic: {
    id: 'HKQuantityTypeIdentifierBloodPressureSystolic',
    unit: 'mmHg',
    label: 'Blood pressure (systolic)',
    short: 'mmHg',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: null,
    noise: 3,
  },
  diastolic: {
    id: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
    unit: 'mmHg',
    label: 'Blood pressure (diastolic)',
    short: 'mmHg',
    group: 'heart',
    aggregate: 'mean',
    betterWhen: null,
    noise: 2,
  },

  // --- Sleep -------------------------------------------------------------
  wristTemperature: {
    id: 'HKQuantityTypeIdentifierAppleSleepingWristTemperature',
    unit: 'degC',
    label: 'Sleeping wrist temperature',
    short: '°F',
    group: 'sleep',
    aggregate: 'mean',
    betterWhen: null,
    decimals: 1,
    noise: 0.3,
    convert: (celsius) => celsius * 1.8 + 32,
  },
  breathingDisturbances: {
    id: 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances',
    unit: 'count',
    label: 'Breathing disturbances',
    short: 'events',
    group: 'sleep',
    aggregate: 'mean',
    betterWhen: 'lower',
    decimals: 1,
    noise: 1,
  },

  // --- Activity ----------------------------------------------------------
  exerciseMinutes: {
    id: 'HKQuantityTypeIdentifierAppleExerciseTime',
    unit: 'min',
    label: 'Exercise minutes',
    short: 'min',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    noise: 5,
  },
  standMinutes: {
    id: 'HKQuantityTypeIdentifierAppleStandTime',
    unit: 'min',
    label: 'Stand time',
    short: 'min',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    noise: 10,
  },
  steps: {
    id: 'HKQuantityTypeIdentifierStepCount',
    unit: 'count',
    label: 'Steps',
    short: 'steps',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    noise: 500,
  },
  walkDistance: {
    id: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
    unit: 'm',
    label: 'Walking + running distance',
    short: 'mi',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    decimals: 2,
    noise: 0.3,
    convert: (metres) => metres * M_TO_MILE,
  },
  flightsClimbed: {
    id: 'HKQuantityTypeIdentifierFlightsClimbed',
    unit: 'count',
    label: 'Flights climbed',
    short: 'flights',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    noise: 2,
  },
  timeInDaylight: {
    id: 'HKQuantityTypeIdentifierTimeInDaylight',
    unit: 'min',
    label: 'Time in daylight',
    short: 'min',
    group: 'activity',
    aggregate: 'sum',
    betterWhen: 'higher',
    noise: 15,
  },
  physicalEffort: {
    id: 'HKQuantityTypeIdentifierPhysicalEffort',
    unit: 'kcal/(kg*hr)',
    label: 'Physical effort',
    short: 'METs',
    group: 'activity',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 1,
    noise: 0.3,
  },

  // --- Fitness -----------------------------------------------------------
  vo2Max: {
    id: 'HKQuantityTypeIdentifierVO2Max',
    unit: 'ml/(kg*min)',
    label: 'Cardio fitness (VO₂ max)',
    short: 'ml/kg/min',
    group: 'fitness',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 1,
    noise: 0.5,
  },
  walkingSpeed: {
    id: 'HKQuantityTypeIdentifierWalkingSpeed',
    unit: 'm/s',
    label: 'Walking speed',
    short: 'mph',
    group: 'fitness',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 2,
    noise: 0.1,
    convert: (metresPerSecond) => metresPerSecond * MS_TO_MPH,
  },
  walkingSteadiness: {
    id: 'HKQuantityTypeIdentifierAppleWalkingSteadiness',
    unit: '%',
    label: 'Walking steadiness',
    short: '%',
    group: 'fitness',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 1,
    noise: 2,
    convert: (value) => (value <= 1 ? value * 100 : value),
  },
  sixMinuteWalk: {
    id: 'HKQuantityTypeIdentifierSixMinuteWalkTestDistance',
    unit: 'm',
    label: 'Six-minute walk distance',
    short: 'ft',
    group: 'fitness',
    aggregate: 'mean',
    betterWhen: 'higher',
    noise: 30,
    convert: (metres) => metres * M_TO_FOOT,
  },
  stairSpeed: {
    id: 'HKQuantityTypeIdentifierStairAscentSpeed',
    unit: 'm/s',
    label: 'Stair ascent speed',
    short: 'ft/s',
    group: 'fitness',
    aggregate: 'mean',
    betterWhen: 'higher',
    decimals: 2,
    noise: 0.05,
    convert: (metresPerSecond) => metresPerSecond * M_TO_FOOT,
  },

  // --- Body --------------------------------------------------------------
  bodyFat: {
    id: 'HKQuantityTypeIdentifierBodyFatPercentage',
    unit: '%',
    label: 'Body fat',
    short: '%',
    group: 'body',
    aggregate: 'mean',
    betterWhen: 'lower',
    decimals: 1,
    noise: 0.5,
    convert: (value) => (value <= 1 ? value * 100 : value),
  },
  leanMass: {
    id: 'HKQuantityTypeIdentifierLeanBodyMass',
    unit: 'kg',
    label: 'Lean body mass',
    short: 'lb',
    group: 'body',
    aggregate: 'mean',
    // The one number you want holding steady while the scale falls.
    betterWhen: 'higher',
    decimals: 1,
    noise: 1,
    convert: (kg) => kg * KG_TO_LB,
  },
  bmi: {
    id: 'HKQuantityTypeIdentifierBodyMassIndex',
    unit: 'count',
    label: 'Body mass index',
    short: 'BMI',
    group: 'body',
    aggregate: 'mean',
    betterWhen: null,
    decimals: 1,
    noise: 0.3,
  },
  waist: {
    id: 'HKQuantityTypeIdentifierWaistCircumference',
    unit: 'm',
    label: 'Waist',
    short: 'in',
    group: 'body',
    aggregate: 'mean',
    betterWhen: 'lower',
    decimals: 1,
    noise: 0.5,
    convert: (metres) => metres * M_TO_INCH,
  },

  // --- Metabolic ---------------------------------------------------------
  bloodGlucose: {
    id: 'HKQuantityTypeIdentifierBloodGlucose',
    unit: 'mg/dL',
    label: 'Blood glucose',
    short: 'mg/dL',
    group: 'metabolic',
    aggregate: 'mean',
    betterWhen: null,
    noise: 5,
  },
  alcohol: {
    id: 'HKQuantityTypeIdentifierNumberOfAlcoholicBeverages',
    unit: 'count',
    label: 'Alcoholic drinks',
    short: 'drinks',
    group: 'metabolic',
    aggregate: 'sum',
    betterWhen: 'lower',
    noise: 1,
  },
};

export const METRIC_GROUPS = [
  { key: 'heart', label: 'Heart' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'activity', label: 'Activity' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'body', label: 'Body' },
  { key: 'metabolic', label: 'Metabolic' },
];

/** Most recent reading in a series, with its date. */
export function latest(series) {
  if (!series?.length) return null;
  const last = series[series.length - 1];
  return { value: last.value, date: last.date };
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Recent average against the period before it.
 *
 * A single reading is mostly noise — resting heart rate moves several beats on sleep
 * and alcohol alone — so both ends are averages over a window. Returns null unless
 * both windows have enough readings to be worth comparing.
 */
export function trend(series, recentDays = 7, baselineDays = 28, minReadings = 3) {
  if (!series?.length) return null;

  const cutoff = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().slice(0, 10);
  };

  const recentFrom = cutoff(recentDays);
  const baselineFrom = cutoff(baselineDays);

  const recent = series.filter((point) => point.date >= recentFrom).map((p) => p.value);
  const baseline = series
    .filter((point) => point.date >= baselineFrom && point.date < recentFrom)
    .map((p) => p.value);

  if (recent.length < minReadings || baseline.length < minReadings) return null;

  const recentMean = mean(recent);
  const baselineMean = mean(baseline);
  return {
    recent: recentMean,
    baseline: baselineMean,
    change: recentMean - baselineMean,
    recentCount: recent.length,
    baselineCount: baseline.length,
  };
}

/**
 * Was the change in a direction the user would welcome?
 *
 * Returns null for metrics where there is no such thing — blood pressure and
 * respiratory rate have no "better", only "different", and colouring them green or
 * red would be a clinical claim.
 */
export function direction(change, betterWhen, threshold) {
  if (!betterWhen || change == null) return null;
  if (Math.abs(change) < threshold) return 'flat';
  const improving = betterWhen === 'lower' ? change < 0 : change > 0;
  return improving ? 'better' : 'worse';
}

/**
 * How a metric looked after the heaviest days of eating, against the lightest.
 *
 * The honest version of "does what I eat affect my heart". It splits logged days into
 * the top and bottom third by calories and compares the metric on the *following*
 * day, because a late dinner shows up in tomorrow's resting heart rate and overnight
 * HRV, not in the reading taken before it.
 *
 * This is a correlation across a handful of days in one person's life. Sleep,
 * alcohol, training, illness and stress all move these numbers too, and any of them
 * could be doing the work. It is a prompt to look, never evidence of a cause — the
 * screen says as much, and the function refuses to report anything until there are
 * enough days for the comparison to be more than a coin toss.
 */
export function intakeAssociation(series, caloriesByDay, minPerGroup = 5) {
  if (!series?.length || !caloriesByDay?.size) return null;

  const days = [...caloriesByDay.entries()]
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.calories - b.calories);

  if (days.length < minPerGroup * 3) return null;

  const byDate = new Map(series.map((point) => [point.date, point.value]));
  const nextDay = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    const month = String(next.getMonth() + 1).padStart(2, '0');
    const day = String(next.getDate()).padStart(2, '0');
    return `${next.getFullYear()}-${month}-${day}`;
  };

  const third = Math.floor(days.length / 3);
  const readingsFor = (group) =>
    group.map((day) => byDate.get(nextDay(day.date))).filter((value) => value != null);

  const lightest = readingsFor(days.slice(0, third));
  const heaviest = readingsFor(days.slice(-third));

  if (lightest.length < minPerGroup || heaviest.length < minPerGroup) return null;

  return {
    afterLight: mean(lightest),
    afterHeavy: mean(heaviest),
    difference: mean(heaviest) - mean(lightest),
    lightCalories: mean(days.slice(0, third).map((d) => d.calories)),
    heavyCalories: mean(days.slice(-third).map((d) => d.calories)),
    dayCount: lightest.length + heaviest.length,
  };
}

/**
 * How much was eaten after a short night against a long one.
 *
 * The reverse of intakeAssociation, and the more useful direction for a food
 * tracker: short sleep reliably raises appetite in controlled studies, and if it is
 * happening here it shows up as a gap in the calories eaten the same day. Same day,
 * not next — a night attributed to the morning you woke is the night that affects
 * that day's eating.
 *
 * Still only a correlation in one person's life. A short night and a big day out
 * often share a cause, and the screen says so.
 */
export function sleepIntakeAssociation(sleepSeries, calories, minPerGroup = 5) {
  if (!sleepSeries?.length || !calories?.size) return null;

  const nights = sleepSeries
    .filter((night) => calories.has(night.date))
    .map((night) => ({ date: night.date, hours: night.value, calories: calories.get(night.date) }))
    .sort((a, b) => a.hours - b.hours);

  if (nights.length < minPerGroup * 3) return null;

  const third = Math.floor(nights.length / 3);
  const shortest = nights.slice(0, third);
  const longest = nights.slice(-third);
  if (shortest.length < minPerGroup || longest.length < minPerGroup) return null;

  const meanOf = (group, field) =>
    group.reduce((sum, night) => sum + night[field], 0) / group.length;

  return {
    shortHours: meanOf(shortest, 'hours'),
    longHours: meanOf(longest, 'hours'),
    afterShort: meanOf(shortest, 'calories'),
    afterLong: meanOf(longest, 'calories'),
    difference: meanOf(shortest, 'calories') - meanOf(longest, 'calories'),
    dayCount: shortest.length + longest.length,
  };
}

/** Calories per day from logged meals, counting only properly logged days. */
export function caloriesByDay(meals, minMealsPerDay = 2) {
  const byDay = new Map();
  for (const meal of meals ?? []) {
    const day = byDay.get(meal.dayKey) ?? { calories: 0, count: 0 };
    day.calories += meal.totals?.calories ?? 0;
    day.count += 1;
    byDay.set(meal.dayKey, day);
  }
  return new Map(
    [...byDay.entries()]
      .filter(([, day]) => day.count >= minMealsPerDay)
      .map(([date, day]) => [date, day.calories])
  );
}
