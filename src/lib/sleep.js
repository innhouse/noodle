/**
 * Sleep history arithmetic: nights grouped by month and year.
 *
 * A night is { date, hours, deep, rem, core }, filed under the morning it ended.
 * Watches before 2022 recorded no stages, so stage averages are taken only over
 * the nights that have them, and are null when none do.
 */

export const SLEEP_GOAL_HOURS = 6;

function summarise(key, nights) {
  const staged = nights.filter((n) => (n.deep ?? 0) + (n.rem ?? 0) > 0);
  const mean = (list, field) =>
    list.length ? list.reduce((sum, n) => sum + (n[field] ?? 0), 0) / list.length : null;
  return {
    key,
    nights: nights.length,
    hours: mean(nights, 'hours'),
    deep: mean(staged, 'deep'),
    rem: mean(staged, 'rem'),
    core: mean(staged, 'core'),
    goalShare: nights.length
      ? nights.filter((n) => n.hours >= SLEEP_GOAL_HOURS).length / nights.length
      : null,
    list: [...nights].sort((a, b) => b.date.localeCompare(a.date)),
  };
}

function groupBy(nights, length) {
  const groups = new Map();
  for (const n of nights ?? []) {
    if (!(n.hours > 0)) continue;
    const key = n.date.slice(0, length);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  return [...groups.entries()]
    .map(([key, list]) => summarise(key, list))
    .sort((a, b) => b.key.localeCompare(a.key));
}

/** Newest month first: "2026-10", nights, average hours and stages, share ≥ goal. */
export function sleepByMonth(nights) {
  return groupBy(nights, 7);
}

/** Newest year first, same fields as by month. */
export function sleepByYear(nights) {
  return groupBy(nights, 4);
}

/** Every night, as one summary. */
export function sleepOverall(nights) {
  const valid = (nights ?? []).filter((n) => n.hours > 0);
  return valid.length ? summarise('all', valid) : null;
}
