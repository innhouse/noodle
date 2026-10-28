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
  4: { label: 'Badminton', icon: '🏸', kind: 'other' },
  6: { label: 'Basketball', icon: '🏀', kind: 'other' },
  8: { label: 'Boxing', icon: '🥊', kind: 'other' },
  9: { label: 'Climbing', icon: '🧗', kind: 'other' },
  11: { label: 'Cross training', icon: '🏋️', kind: 'strength' },
  13: { label: 'Cycling', icon: '🚴', kind: 'cardio' },
  14: { label: 'Dance', icon: '💃', kind: 'cardio' },
  16: { label: 'Elliptical', icon: '🏃', kind: 'cardio' },
  20: { label: 'Functional strength', icon: '🏋️', kind: 'strength' },
  21: { label: 'Golf', icon: '⛳', kind: 'other' },
  24: { label: 'Hike', icon: '🥾', kind: 'cardio' },
  25: { label: 'Hockey', icon: '🏒', kind: 'other' },
  28: { label: 'Martial arts', icon: '🥋', kind: 'other' },
  29: { label: 'Mind and body', icon: '🧘', kind: 'mobility' },
  30: { label: 'Mixed cardio', icon: '🏃', kind: 'cardio' },
  31: { label: 'Paddle sports', icon: '🛶', kind: 'cardio' },
  33: { label: 'Recovery', icon: '🧘', kind: 'mobility' },
  34: { label: 'Racquetball', icon: '🎾', kind: 'other' },
  35: { label: 'Rowing', icon: '🚣', kind: 'cardio' },
  37: { label: 'Run', icon: '🏃', kind: 'cardio' },
  38: { label: 'Sailing', icon: '⛵', kind: 'other' },
  39: { label: 'Skating', icon: '⛸️', kind: 'cardio' },
  40: { label: 'Snow sports', icon: '🎿', kind: 'other' },
  41: { label: 'Soccer', icon: '⚽', kind: 'other' },
  43: { label: 'Squash', icon: '🎾', kind: 'other' },
  44: { label: 'Stair climbing', icon: '🪜', kind: 'cardio' },
  46: { label: 'Swim', icon: '🏊', kind: 'cardio' },
  47: { label: 'Table tennis', icon: '🏓', kind: 'other' },
  48: { label: 'Tennis', icon: '🎾', kind: 'other' },
  50: { label: 'Strength training', icon: '🏋️', kind: 'strength' },
  51: { label: 'Volleyball', icon: '🏐', kind: 'other' },
  52: { label: 'Walk', icon: '🚶', kind: 'cardio' },
  53: { label: 'Water fitness', icon: '🏊', kind: 'cardio' },
  57: { label: 'Yoga', icon: '🧘', kind: 'mobility' },
  59: { label: 'Core training', icon: '🏋️', kind: 'strength' },
  60: { label: 'Cross-country skiing', icon: '🎿', kind: 'cardio' },
  61: { label: 'Downhill skiing', icon: '⛷️', kind: 'other' },
  62: { label: 'Flexibility', icon: '🧘', kind: 'mobility' },
  63: { label: 'HIIT', icon: '⚡', kind: 'cardio' },
  64: { label: 'Jump rope', icon: '🪢', kind: 'cardio' },
  65: { label: 'Kickboxing', icon: '🥊', kind: 'cardio' },
  66: { label: 'Pilates', icon: '🧘', kind: 'mobility' },
  67: { label: 'Snowboarding', icon: '🏂', kind: 'other' },
  69: { label: 'Step training', icon: '🪜', kind: 'cardio' },
  72: { label: 'Tai chi', icon: '🧘', kind: 'mobility' },
  73: { label: 'Mixed cardio', icon: '🏃', kind: 'cardio' },
  75: { label: 'Disc sports', icon: '🥏', kind: 'other' },
  77: { label: 'Cardio dance', icon: '💃', kind: 'cardio' },
  79: { label: 'Pickleball', icon: '🏓', kind: 'other' },
  80: { label: 'Cooldown', icon: '🧘', kind: 'mobility' },
  3000: { label: 'Workout', icon: '💪', kind: 'other' },
};

export function describeType(type) {
  return WORKOUT_TYPES[type] ?? { label: 'Workout', icon: '💪', kind: 'other' };
}


export function formatDuration(minutes) {
  if (minutes == null) return '—';
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatKm(metres) {
  if (!metres) return null;
  const km = metres / 1000;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

/** Minutes per kilometre, as "7:15 /km". Null when the distance is too short to mean anything. */
export function formatPace(metres, minutes) {
  if (!metres || !minutes || metres < 200) return null;
  const perKm = minutes / (metres / 1000);
  if (!Number.isFinite(perKm) || perKm > 40) return null;
  const whole = Math.floor(perKm);
  const seconds = Math.round((perKm - whole) * 60);
  if (seconds === 60) return `${whole + 1}:00 /km`;
  return `${whole}:${String(seconds).padStart(2, '0')} /km`;
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
 * reports the running kilometres rather than pretending the lifts covered ground.
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

/**
 * Heartbeats per kilometre: how much heart it took to cover the ground.
 *
 * The fitness measure that still works on a beta-blocker. VO₂ max and zones
 * assume a heart rate that responds freely to effort; this only asks whether
 * the same distance is costing fewer beats than it did a month ago. Lower is
 * fitter. Only meaningful for sessions with both a distance and a heart rate,
 * and only comparable between sessions of the same kind.
 */
export const ON_FOOT = { runs: [37], walks: [52, 24], all: [37, 52, 24] };

export function beatsPerKm(workout) {
  if (!workout?.metres || !workout.durationMin || !workout.avgHr || workout.metres < 500) return null;
  // Only on foot: a court sport or a bike ride records distance too, and beats
  // per kilometre means nothing there.
  if (!ON_FOOT.all.includes(workout.type)) return null;
  return Math.round((workout.avgHr * workout.durationMin) / (workout.metres / 1000));
}

/**
 * The last `count` outdoor runs and walks with an efficiency reading, oldest
 * first, plus how the recent ones compare with the earlier ones.
 */
export function efficiencyTrend(workouts, count = 10, which = 'all') {
  const types = ON_FOOT[which] ?? ON_FOOT.all;
  const sessions = (workouts ?? [])
    .filter((w) => types.includes(w.type) && beatsPerKm(w))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(-count)
    .map((w) => ({ ...w, beatsPerKm: beatsPerKm(w) }));
  if (sessions.length < 4) return { sessions, change: null };
  const half = Math.floor(sessions.length / 2);
  const mean = (list) => list.reduce((sum, w) => sum + w.beatsPerKm, 0) / list.length;
  const earlier = mean(sessions.slice(0, half));
  const recent = mean(sessions.slice(-half));
  return { sessions, change: recent - earlier, earlier, recent };
}

/** Minutes of exercise in the current Monday-based week. */
export function minutesThisWeek(workouts) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const key = weekKey(
    `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
      monday.getDate()
    ).padStart(2, '0')}`
  );
  return (workouts ?? [])
    .filter((w) => weekKey(w.date) === key)
    .reduce((sum, w) => sum + (w.durationMin ?? 0), 0);
}

export const SYMPTOMS = [
  { key: 'fine', label: 'Felt fine' },
  { key: 'chest', label: 'Chest discomfort' },
  { key: 'breath', label: 'Unusually breathless' },
  { key: 'dizzy', label: 'Light-headed' },
  { key: 'palpitations', label: 'Palpitations' },
  { key: 'tired', label: 'Unusually tired' },
];

export function symptomLabel(key) {
  return SYMPTOMS.find((s) => s.key === key)?.label ?? key;
}

/** Minutes per week for the last `count` weeks, oldest first, zeros included. */
export function weeklyMinutes(workouts, count = 12) {
  const totals = new Map();
  for (const w of workouts ?? []) {
    const key = weekKey(w.date);
    totals.set(key, (totals.get(key) ?? 0) + (w.durationMin ?? 0));
  }
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const weeks = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - 7 * i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weeks.push({
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: Math.round(totals.get(key) ?? 0),
    });
  }
  return weeks;
}

export const FOOT_TYPES = [
  { label: 'Run', value: 37 },
  { label: 'Walk', value: 52 },
  { label: 'Hike', value: 24 },
];

/**
 * Sessions as the person says they happened.
 *
 * Health can't change a workout's type after the fact, so a run logged as a
 * walk stays a walk there forever. The note the person writes against a session
 * can carry a corrected type; this applies it so every screen and every trend
 * sees the session as it really was. The Health copy is untouched.
 */
export function applyNotes(workouts, notes) {
  if (!notes) return workouts ?? [];
  return (workouts ?? []).map((w) => {
    const override = notes[w.id]?.typeOverride;
    return override ? { ...w, type: override, originalType: w.type } : w;
  });
}
