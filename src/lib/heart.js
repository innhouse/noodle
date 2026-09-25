/**
 * Analysis of heart metrics. Pure and synchronous, like nutrition.js — the Heart
 * screen recomputes on every render and none of it should touch the network.
 *
 * Nothing here diagnoses anything. It compares your numbers to your own earlier
 * numbers, which is the only comparison this app is entitled to make. There are no
 * "normal ranges" and no thresholds, because a resting heart rate that is unremarkable
 * for one person is worth a doctor's attention in another, and an app that guessed
 * which you were would be worse than one that stays quiet.
 */

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
