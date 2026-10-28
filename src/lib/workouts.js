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

/**
 * Minutes per week from Apple's own Exercise-ring series, so the chart matches
 * the Fitness app rather than adding up workout durations (which count warm-ups
 * and pauses the ring does not). Falls back to the workouts when the series is
 * missing, which it is on the web before the phone has synced.
 */
export function weeklyExerciseMinutes(series, workouts, count = 12) {
  if (!series?.length) return weeklyMinutes(workouts, count);
  const byWeek = new Map();
  for (const point of series) {
    const key = weekKey(point.date);
    byWeek.set(key, (byWeek.get(key) ?? 0) + (point.value ?? 0));
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
      value: Math.round(byWeek.get(key) ?? 0),
    });
  }
  return weeks;
}

/** This week's Exercise-ring minutes, or the workouts' total when the ring is missing. */
export function exerciseMinutesThisWeek(series, workouts) {
  if (!series?.length) return minutesThisWeek(workouts);
  const weeks = weeklyExerciseMinutes(series, workouts, 1);
  return weeks[0]?.value ?? 0;
}

export const DEFAULT_KPIS = { runs: 3, strength: 2, other: 1, zoneMin: 0, yogaMin: 70 };

/** Which of the three weekly buckets a session falls in. */
export function kpiBucket(workout) {
  if (workout.type === 37) return 'runs';
  if (describeType(workout.type).kind === 'strength') return 'strength';
  return 'other';
}

/**
 * Sessions per week in each bucket against the targets, newest week first.
 *
 * The question these answer is "did I do the mix I set out to", which minutes
 * alone cannot: a week of six runs and no lifting hits the minutes and misses
 * the plan. Walks, yoga, volleyball and the rest all count as "other".
 */
export function weeklyKpis(workouts, targets = DEFAULT_KPIS, count = 8) {
  const goals = { ...DEFAULT_KPIS, ...(targets ?? {}) };
  const byWeek = new Map();
  for (const w of workouts ?? []) {
    const key = weekKey(w.date);
    const week = byWeek.get(key) ?? { runs: 0, strength: 0, other: 0, zoneMin: 0, yogaMin: 0 };
    week[kpiBucket(w)] += 1;
    week.zoneMin += w.zoneMin ?? 0;
    if (describeType(w.type).kind === 'mobility') week.yogaMin += w.durationMin ?? 0;
    byWeek.set(key, week);
  }
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const weeks = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - 7 * i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const counts = byWeek.get(key) ?? { runs: 0, strength: 0, other: 0, zoneMin: 0, yogaMin: 0 };
    counts.yogaMin = Math.round(counts.yogaMin);
    const met = {
      runs: counts.runs >= goals.runs,
      strength: counts.strength >= goals.strength,
      other: counts.other >= goals.other,
      zoneMin: counts.zoneMin >= goals.zoneMin,
      yogaMin: counts.yogaMin >= goals.yogaMin,
    };
    weeks.push({
      week: key,
      label: i === 0 ? 'This week' : i === 1 ? 'Last week' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      counts,
      goals,
      met,
      all: ['runs', 'strength', 'other', 'zoneMin', 'yogaMin'].every((k) => goals[k] <= 0 || met[k]),
    });
  }
  return weeks;
}

/**
 * Totals per calendar month, newest first: minutes across every session,
 * kilometres run (runs only) and walked (walks and hikes), and session count.
 *
 * Built from the mirrored workouts rather than the Exercise ring, because the
 * ring series only reaches back 90 days and a year of months needs more.
 */
export function monthlyTotals(workouts, targets = {}, count = 12) {
  const byMonth = new Map();
  for (const w of workouts ?? []) {
    const key = w.date.slice(0, 7);
    const m =
      byMonth.get(key) ??
      { minutes: 0, runMetres: 0, runMinutes: 0, runBeats: 0, runHrMinutes: 0, walkMetres: 0, sessions: 0 };
    m.minutes += w.durationMin ?? 0;
    m.sessions += 1;
    const bucket = kpiBucket(w);
    m.mix = m.mix ?? { runs: 0, strength: 0, other: 0 };
    m.mix[bucket] += 1;
    if (w.type === 37 && w.metres) {
      m.runMetres += w.metres;
      m.runMinutes += w.durationMin ?? 0;
      m.runs = (m.runs ?? 0) + 1;
      if (w.avgHr && w.durationMin) {
        // Beats = average rate × minutes; summed over runs with a heart-rate reading.
        m.runBeats += w.avgHr * w.durationMin;
        m.runHrMinutes += w.durationMin;
      }
    }
    if (w.type === 52 || w.type === 24) m.walkMetres += w.metres ?? 0;
    byMonth.set(key, m);
  }
  const now = new Date();
  const months = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m =
      byMonth.get(key) ??
      { minutes: 0, runMetres: 0, runMinutes: 0, runBeats: 0, runHrMinutes: 0, walkMetres: 0, sessions: 0 };
    const minutes = Math.round(m.minutes);
    const runKm = Math.round(m.runMetres / 100) / 10;
    months.push({
      month: key,
      label: d.toLocaleDateString(undefined, { month: 'short', year: i === 0 || d.getMonth() === 0 ? '2-digit' : undefined }),
      current: i === 0,
      minutes,
      runKm,
      runMinutes: m.runMinutes,
      runBeats: m.runBeats,
      runHrMinutes: m.runHrMinutes,
      runs: m.runs ?? 0,
      avgRunKm: m.runs ? Math.round((m.runMetres / 1000 / m.runs) * 10) / 10 : null,
      mix: m.mix ?? { runs: 0, strength: 0, other: 0 },
      avgMin: m.sessions ? Math.round(m.minutes / m.sessions) : null,
      // Distance-weighted: total running time over total running distance.
      pace: m.runMetres >= 500 ? m.runMinutes / (m.runMetres / 1000) : null,
      // Time-weighted average heart rate across the month's runs.
      avgHr: m.runHrMinutes > 0 ? Math.round(m.runBeats / m.runHrMinutes) : null,
      // Total beats over total kilometres, for the runs that had a heart rate.
      beatsPerKm:
        m.runHrMinutes > 0 && m.runMetres >= 500
          ? Math.round(m.runBeats / ((m.runMetres / 1000) * (m.runHrMinutes / m.runMinutes)))
          : null,
      walkKm: Math.round(m.walkMetres / 100) / 10,
      sessions: m.sessions,
      met: {
        minutes: targets.minutes > 0 ? minutes >= targets.minutes : null,
        runKm: targets.runKm > 0 ? runKm >= targets.runKm : null,
      },
    });
  }
  return months;
}

/** Year-to-date totals and the average of the last twelve complete months. */
export function monthlySummary(months) {
  const year = String(new Date().getFullYear());
  const sum = (list) =>
    list.reduce(
      (acc, m) => ({
        minutes: acc.minutes + m.minutes,
        runKm: acc.runKm + m.runKm,
        runMinutes: acc.runMinutes + m.runMinutes,
        runBeats: acc.runBeats + m.runBeats,
        runHrMinutes: acc.runHrMinutes + m.runHrMinutes,
        runs: acc.runs + (m.runs ?? 0),
        walkKm: acc.walkKm + m.walkKm,
        sessions: acc.sessions + m.sessions,
      }),
      { minutes: 0, runKm: 0, runMinutes: 0, runBeats: 0, runHrMinutes: 0, runs: 0, walkKm: 0, sessions: 0 }
    );
  const avgKmOf = (t) => (t.runs ? Math.round((t.runKm / t.runs) * 10) / 10 : null);
  const paceOf = (t) => (t.runKm >= 0.5 ? t.runMinutes / t.runKm : null);
  const hrOf = (t) => (t.runHrMinutes > 0 ? Math.round(t.runBeats / t.runHrMinutes) : null);
  const bpkOf = (t) =>
    t.runHrMinutes > 0 && t.runKm >= 0.5
      ? Math.round(t.runBeats / (t.runKm * (t.runHrMinutes / t.runMinutes)))
      : null;
  const round1 = (v) => Math.round(v * 10) / 10;

  const ytd = sum(months.filter((m) => m.month.startsWith(year)));
  const complete = months.filter((m) => !m.current);
  const n = complete.length || 1;
  const total = sum(complete);
  return {
    ytd: {
      ...ytd,
      runKm: round1(ytd.runKm),
      walkKm: round1(ytd.walkKm),
      pace: paceOf(ytd),
      avgHr: hrOf(ytd),
      beatsPerKm: bpkOf(ytd),
      avgRunKm: avgKmOf(ytd),
    },
    average: {
      minutes: Math.round(total.minutes / n),
      runKm: round1(total.runKm / n),
      walkKm: round1(total.walkKm / n),
      sessions: Math.round(total.sessions / n),
      pace: paceOf(total),
      avgHr: hrOf(total),
      beatsPerKm: bpkOf(total),
      avgRunKm: avgKmOf(total),
      months: complete.length,
    },
  };
}

/** "9:03" from minutes per km, or "—" when there is no running to measure. */
export function formatPaceMin(perKm) {
  if (!perKm || !Number.isFinite(perKm)) return '—';
  const whole = Math.floor(perKm);
  const seconds = Math.round((perKm - whole) * 60);
  if (seconds === 60) return `${whole + 1}:00`;
  return `${whole}:${String(seconds).padStart(2, '0')}`;
}

/** Totals per calendar year, newest first, same columns as the months. */
export function yearlyTotals(workouts) {
  const months = monthlyTotals(workouts, {}, 12 * 6);
  const byYear = new Map();
  for (const m of months) {
    const year = m.month.slice(0, 4);
    const y =
      byYear.get(year) ??
      { minutes: 0, runKm: 0, runMinutes: 0, runBeats: 0, runHrMinutes: 0, runs: 0, walkKm: 0, sessions: 0, mix: { runs: 0, strength: 0, other: 0 }, current: false };
    y.minutes += m.minutes;
    y.runKm += m.runKm;
    y.runMinutes += m.runMinutes;
    y.runBeats += m.runBeats;
    y.runHrMinutes += m.runHrMinutes;
    y.runs += m.runs ?? 0;
    y.mix.runs += m.mix?.runs ?? 0;
    y.mix.strength += m.mix?.strength ?? 0;
    y.mix.other += m.mix?.other ?? 0;
    y.walkKm += m.walkKm;
    y.sessions += m.sessions;
    y.current = y.current || m.current;
    byYear.set(year, y);
  }
  const round1 = (v) => Math.round(v * 10) / 10;
  return [...byYear.entries()]
    .filter(([, y]) => y.sessions > 0)
    .map(([year, y]) => ({
      year,
      current: y.current,
      minutes: y.minutes,
      runKm: round1(y.runKm),
      avgRunKm: y.runs ? round1(y.runKm / y.runs) : null,
      walkKm: round1(y.walkKm),
      sessions: y.sessions,
      mix: y.mix,
      avgMin: y.sessions ? Math.round(y.minutes / y.sessions) : null,
      pace: y.runKm >= 0.5 ? y.runMinutes / y.runKm : null,
      avgHr: y.runHrMinutes > 0 ? Math.round(y.runBeats / y.runHrMinutes) : null,
      beatsPerKm:
        y.runHrMinutes > 0 && y.runKm >= 0.5
          ? Math.round(y.runBeats / (y.runKm * (y.runHrMinutes / y.runMinutes)))
          : null,
    }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

/**
 * Dated markers the person keeps — a cardiac event, a medication change — as
 * "YYYY-MM-DD label" lines in Settings. Used to divide tables and mark charts,
 * because a comparison across one of these is not a comparison of fitness.
 */
export function parseEvents(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/);
      return match ? { date: match[1], label: match[2] || 'Event' } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rows interleaved with event dividers, for a table sorted newest first. A
 * divider goes above the first row dated on or after the event — read top to
 * bottom, "since <event>" sits above the rows it applies to.
 */
export function withEventDividers(rows, events, dateOf) {
  if (!events?.length || !rows?.length) return rows.map((row) => ({ row }));
  const out = [];
  const pending = [...events].sort((a, b) => b.date.localeCompare(a.date));
  for (const row of rows) {
    const d = dateOf(row);
    while (pending.length && pending[0].date > d) {
      // Event newer than this row: it belongs above the previous (newer) rows,
      // which have already been emitted; emit it here as a boundary.
      out.push({ divider: pending.shift() });
    }
    out.push({ row });
  }
  return out;
}

/** Each activity type over a window: sessions, total minutes, average length. */
export function byActivity(workouts, days = 365) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);
  const totals = new Map();
  for (const w of workouts ?? []) {
    if (w.date < from) continue;
    const t = totals.get(w.type) ?? { type: w.type, sessions: 0, minutes: 0 };
    t.sessions += 1;
    t.minutes += w.durationMin ?? 0;
    totals.set(w.type, t);
  }
  return [...totals.values()]
    .map((t) => ({
      ...t,
      ...describeType(t.type),
      minutes: Math.round(t.minutes),
      avgMin: Math.round(t.minutes / t.sessions),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Runs of consecutive days that each had a qualifying run — by default one of
 * at least 10 km. Returns the longest streaks with their dates, and whether
 * one is still alive (today or yesterday counts as alive; a day skipped ends
 * it). Several runs on one day count once; a day's qualifying distance is the
 * longest single run that day, not the sum.
 */
export function runStreaks(workouts, minKm = 10, top = 5) {
  const best = new Map();
  for (const w of workouts ?? []) {
    if (w.type !== 37 || !w.metres) continue;
    best.set(w.date, Math.max(best.get(w.date) ?? 0, w.metres / 1000));
  }
  const days = [...best.entries()]
    .filter(([, km]) => km >= minKm)
    .map(([date]) => date)
    .sort();

  const dayNum = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
  };

  const streaks = [];
  let start = null;
  let prev = null;
  for (const date of days) {
    if (prev != null && dayNum(date) === dayNum(prev) + 1) {
      prev = date;
      continue;
    }
    if (start) streaks.push({ start, end: prev, days: dayNum(prev) - dayNum(start) + 1 });
    start = date;
    prev = date;
  }
  if (start) streaks.push({ start, end: prev, days: dayNum(prev) - dayNum(start) + 1 });

  const today = dayNum(new Date().toISOString().slice(0, 10));
  const last = streaks[streaks.length - 1];
  const current = last && today - dayNum(last.end) <= 1 ? last : null;

  return {
    minKm,
    current,
    longest: [...streaks].sort((a, b) => b.days - a.days || b.end.localeCompare(a.end)).slice(0, top),
    qualifyingDays: days.length,
  };
}

const HALF_KM = 21.0975;

/**
 * Personal records from the runs: fastest and slowest at the streak distance,
 * longest ever, and every half marathon or longer. Pace is the run's own
 * average; a 10 km split inside a longer run is not separable from Health data.
 */
export function runRecords(workouts, minKm = 10) {
  const runs = (workouts ?? [])
    .filter((w) => w.type === 37 && w.metres >= minKm * 1000 && w.durationMin > 0)
    .map((w) => ({ ...w, km: w.metres / 1000, pace: w.durationMin / (w.metres / 1000) }));
  if (!runs.length) return null;
  const byPace = [...runs].sort((a, b) => a.pace - b.pace);
  const longest = [...runs].sort((a, b) => b.km - a.km)[0];
  const halves = runs.filter((w) => w.km >= HALF_KM - 0.1).sort((a, b) => b.start.localeCompare(a.start));
  const halvesByYear = new Map();
  for (const h of halves) halvesByYear.set(h.date.slice(0, 4), (halvesByYear.get(h.date.slice(0, 4)) ?? 0) + 1);
  return {
    minKm,
    count: runs.length,
    fastest: byPace[0],
    slowest: byPace[byPace.length - 1],
    longest,
    halves,
    halvesByYear: [...halvesByYear.entries()].sort((a, b) => b[0].localeCompare(a[0])),
  };
}
