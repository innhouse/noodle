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

/** Named milestones, newest first, each with its sessions and totals. */
export function milestonesFrom(workouts) {
  const groups = new Map();
  for (const w of workouts ?? []) {
    const name = typeof w.milestone === 'string' ? w.milestone.trim() : '';
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(w);
  }
  return [...groups.entries()]
    .map(([name, sessions]) => summarise(name, sessions))
    .sort((a, b) => b.start.localeCompare(a.start));
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
 *  - three or more days in a row of long hikes — a trek or a climb.
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
