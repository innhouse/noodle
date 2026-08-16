/**
 * Day keys are local-time YYYY-MM-DD strings, not UTC timestamps.
 * A meal eaten at 11pm belongs to that day for the person eating it, and using
 * UTC would push late dinners into tomorrow for anyone west of Greenwich.
 */

export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(key, delta) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return dayKey(date);
}

export function isToday(key) {
  return key === dayKey();
}

export function formatDayLabel(key) {
  if (isToday(key)) return 'Today';
  if (key === addDays(dayKey(), -1)) return 'Yesterday';

  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Which meal the clock suggests, used to pre-fill the picker. */
export function guessMealType(date = new Date()) {
  const hour = date.getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
