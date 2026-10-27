/**
 * Workouts as Noodle shows them: labels, units and the pure arithmetic.
 *
 * No native imports, so the web build shares the same labels and formatting as
 * the phone rather than drifting out of step.
 *
 * Nothing here judges a session. Heart rate on a beta-blocker, pace after a layoff,
 * a short run that was all the day allowed — the numbers are shown as recorded and
 * compared only with the same person's earlier ones.
 */

// HKWorkoutActivityType → what to call it. Anything missing falls back to 'Workout'.
export const WORKOUT_TYPES = {
  13: { label: 'Cycling', icon: '🚴', kind: 'cardio' },
  16: { label: 'Elliptical', icon: '🏃', kind: 'cardio' },
  20: { label: 'Functional strength', icon: '🏋️', kind: 'strength' },
  21: { label: 'Golf', icon: '⛳', kind: 'other' },
  24: { label: 'Hike', icon: '🥾', kind: 'cardio' },
  35: { label: 'Rowing', icon: '🚣', kind: 'cardio' },
  37: { label: 'Run', icon: '🏃', kind: 'cardio' },
  44: { label: 'Stair climbing', icon: '🪜', kind: 'cardio' },
  46: { label: 'Swim', icon: '🏊', kind: 'cardio' },
  48: { label: 'Tennis', icon: '🎾', kind: 'other' },
  50: { label: 'Strength training', icon: '🏋️', kind: 'strength' },
  52: { label: 'Walk', icon: '🚶', kind: 'cardio' },
  57: { label: 'Yoga', icon: '🧘', kind: 'mobility' },
  59: { label: 'Core training', icon: '🏋️', kind: 'strength' },
  63: { label: 'HIIT', icon: '⚡', kind: 'cardio' },
  79: { label: 'Pickleball', icon: '🏓', kind: 'other' },
  3000: { label: 'Workout', icon: '💪', kind: 'other' },
};

export function describeType(type) {
  return WORKOUT_TYPES[type] ?? { label: 'Workout', icon: '💪', kind: 'other' };
}

const M_TO_MILE = 0.000621371;

export function formatDuration(minutes) {
  if (minutes == null) return '—';
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatMiles(metres) {
  if (!metres) return null;
  const miles = metres * M_TO_MILE;
  return `${miles.toFixed(miles < 10 ? 2 : 1)} mi`;
}

/** Minutes per mile, as "11:42 /mi". Null when the distance is too short to mean anything. */
export function formatPace(metres, minutes) {
  if (!metres || !minutes || metres < 200) return null;
  const perMile = minutes / (metres * M_TO_MILE);
  if (!Number.isFinite(perMile) || perMile > 60) return null;
  const whole = Math.floor(perMile);
  const seconds = Math.round((perMile - whole) * 60);
  return `${whole}:${String(seconds).padStart(2, '0')} /mi`;
}

/** Monday-based week key for grouping, as the local date of that Monday. */
export function weekKey(dayKeyString) {
  const [y, m, d] = dayKeyString.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Sessions grouped by week, newest first, each with its totals.
 *
 * Distance only sums the sessions that have one, so a week of runs and lifts
 * reports the running miles rather than pretending the lifts covered ground.
 */
export function groupByWeek(workouts) {
  const weeks = new Map();
  for (const workout of workouts ?? []) {
    const key = weekKey(workout.date);
    const week = weeks.get(key) ?? { week: key, sessions: [], minutes: 0, metres: 0, kcal: 0 };
    week.sessions.push(workout);
    week.minutes += workout.durationMin ?? 0;
    week.metres += workout.metres ?? 0;
    week.kcal += workout.kcal ?? 0;
    weeks.set(key, week);
  }
  return [...weeks.values()]
    .map((week) => ({
      ...week,
      sessions: [...week.sessions].sort((a, b) => b.start.localeCompare(a.start)),
    }))
    .sort((a, b) => b.week.localeCompare(a.week));
}

/** Workouts that started on a given local day, newest first. */
export function onDay(workouts, day) {
  return (workouts ?? [])
    .filter((workout) => workout.date === day)
    .sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Latest reading against the mean of the previous `days`.
 *
 * The Today screen's question is "is this morning unusual for me", which a single
 * number can't answer on its own. Needs a handful of earlier readings before it
 * says anything, and excludes the latest from its own baseline.
 */
export function againstBaseline(series, days = 30, minReadings = 5) {
  if (!series?.length) return null;
  const last = series[series.length - 1];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);
  const earlier = series
    .filter((point) => point.date >= from && point.date < last.date)
    .map((point) => point.value);
  if (earlier.length < minReadings) return { value: last.value, date: last.date, baseline: null };
  const baseline = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;
  return { value: last.value, date: last.date, baseline, change: last.value - baseline };
}
