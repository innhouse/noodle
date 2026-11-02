/**
 * Milestones: sessions the person has named — a race, a summit, a first run
 * back. Sessions sharing a name are one milestone, so a twelve-day trek reads
 * as one entry with its date range and totals.
 *
 * Suggestions are only suggestions: Noodle proposes, the person names or
 * dismisses. Nothing becomes a milestone on its own.
 */

const HALF_KM = 21.0975;
const HIKE = 24;
const RUN = 37;
const RIDE = 13;
// A ride this long is an event, not a commute.
const LONG_RIDE_M = 70_000;

/**
 * Named milestones, newest first, each with its sessions and totals.
 *
 * Official results join the milestone with the same name; a result with no
 * matching sessions — an event from before the watch — is a milestone of its
 * own, built from the result alone.
 */
export function milestonesFrom(workouts, results = []) {
  const groups = new Map();
  for (const w of workouts ?? []) {
    const name = typeof w.milestone === 'string' ? w.milestone.trim() : '';
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(w);
  }
  const byName = new Map((results ?? []).filter((r) => r?.name).map((r) => [r.name.trim(), r]));
  const out = [...groups.entries()].map(([name, sessions]) => ({ ...summarise(name, sessions), result: byName.get(name) ?? null }));
  for (const [name, result] of byName) {
    if (groups.has(name) || !result.date) continue;
    out.push({
      name,
      sessions: [],
      ids: [],
      start: result.date,
      end: result.date,
      minutes: result.timeSec ? result.timeSec / 60 : 0,
      metres: result.km ? result.km * 1000 : 0,
      type: result.type ?? 0,
      result,
    });
  }
  return out.sort((a, b) => b.start.localeCompare(a.start));
}

/** "05:45:23" from seconds. */
export function formatClock(seconds) {
  if (!(seconds > 0)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Seconds from "5:45:23", "45:23" or "5h45m"; null when it doesn't read as a time. */
export function parseClock(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const hm = t.match(/^(\d+)\s*h\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$/i);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2] ?? 0) * 60 + Number(hm[3] ?? 0);
  const parts = t.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length < 2 || parts.length > 3) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  return h * 3600 + m * 60 + s;
}

/** "2,099th of 3,418" */
export function formatPlace(place, of) {
  if (!(place > 0)) return null;
  const n = Number(place);
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n.toLocaleString()}${suffix}${of > 0 ? ` of ${Number(of).toLocaleString()}` : ''}`;
}

function summarise(name, sessions) {
  const list = [...sessions].sort((a, b) => a.start.localeCompare(b.start));
  return {
    name,
    sessions: list,
    ids: list.map((w) => w.id),
    start: list[0].date,
    end: list[list.length - 1].date,
    minutes: list.reduce((sum, w) => sum + (w.durationMin ?? 0), 0),
    metres: list.reduce((sum, w) => sum + (w.metres ?? 0), 0),
    type: list[0].type,
  };
}

/**
 * Likely milestones not yet named or dismissed:
 *  - runs of a half marathon or longer, named by the distance (or the name the
 *    source app gave them, such as a Garmin race name);
 *  - three or more days in a row of long hikes — a trek or a climb;
 *  - rides of 70 km or more, with long rides on consecutive days grouped as
 *    one — a two-day charity ride is one event.
 */
export function suggestMilestones(workouts, dismissed = []) {
  const skip = new Set(dismissed);
  const out = [];
  const free = (workouts ?? []).filter((w) => !w.milestone);

  for (const w of free) {
    if (w.type !== RUN || !(w.metres >= HALF_KM * 1000 - 100)) continue;
    const pace = w.durationMin / (w.metres / 1000);
    if (pace < 3 || pace > 15) continue;
    const label = w.name || (w.metres >= 42000 ? 'Marathon' : 'Half marathon');
    out.push(summarise(label, [w]));
  }

  const hikes = free
    .filter((w) => w.type === HIKE && w.durationMin >= 90)
    .sort((a, b) => a.start.localeCompare(b.start));
  let run = [];
  const flush = () => {
    const days = new Set(run.map((w) => w.date));
    if (days.size >= 3) {
      const first = run[0].date;
      const month = new Date(`${first}T12:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      // Include the short hikes on those same days too.
      const all = free.filter((w) => w.type === HIKE && w.date >= first && w.date <= run[run.length - 1].date);
      out.push(summarise(`Trek, ${month}`, all));
    }
    run = [];
  };
  for (const w of hikes) {
    const last = run[run.length - 1];
    if (last && dayGap(last.date, w.date) > 1) flush();
    run.push(w);
  }
  flush();

  const rides = free
    .filter((w) => w.type === RIDE && w.metres >= LONG_RIDE_M)
    .sort((a, b) => a.start.localeCompare(b.start));
  let group = [];
  const flushRides = () => {
    if (!group.length) return;
    const named = group.find((w) => w.name);
    const days = new Set(group.map((w) => w.date)).size;
    const year = group[0].date.slice(0, 4);
    out.push(summarise(named ? named.name : days > 1 ? `${days}-day ride, ${year}` : `Long ride, ${year}`, group));
    group = [];
  };
  for (const w of rides) {
    const last = group[group.length - 1];
    if (last && dayGap(last.date, w.date) > 1) flushRides();
    group.push(w);
  }
  flushRides();

  return out
    .map((m) => ({ ...m, key: m.ids[0] }))
    .filter((m) => !skip.has(m.key))
    .sort((a, b) => b.start.localeCompare(a.start));
}

function dayGap(a, b) {
  const t = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return t(b) - t(a);
}
