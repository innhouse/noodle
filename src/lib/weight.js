/**
 * Weight trend arithmetic, pure and shared with the web build.
 *
 * Daily readings bounce around by two or three pounds on water alone, so the
 * number that tells the truth is a smoothed trend, not any one morning.
 */

/** Exponentially smoothed trend, one point per logged day. */
export function weightTrend(entries, alpha = 0.15) {
  const sorted = [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let trend = null;
  return sorted.map((entry) => {
    trend = trend == null ? entry.weightKg : trend + alpha * (entry.weightKg - trend);
    return { ...entry, trend };
  });
}

/**
 * Rate of change in kg per week from a least-squares line through the trend.
 *
 * Needs a fortnight of readings before it reports anything — a slope through
 * three points is a coin toss dressed as a number.
 */
export function weeklyChange(trended, minDays = 14) {
  if (!trended || trended.length < 2) return null;
  const first = trended[0].date;
  const dayIndex = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    const [fy, fm, fd] = first.split('-').map(Number);
    return Math.round((new Date(y, m - 1, d) - new Date(fy, fm - 1, fd)) / 86_400_000);
  };
  const points = trended.map((entry) => ({ x: dayIndex(entry.date), y: entry.trend }));
  const span = points[points.length - 1].x - points[0].x;
  if (span < minDays) return null;

  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}
