/**
 * Blood-test markers Noodle can record, typed in from the lab report.
 *
 * Canadian units throughout (mmol/L for lipids and glucose).
 *
 * Two different lines per marker, kept apart on purpose:
 *   `range`  — the lab's own reference interval, as printed on the report (LifeLabs
 *              BC, adult). Says whether a result is outside what the lab calls
 *              usual. It is not a goal.
 *   target   — the person's own, set from what their cardiologist told them.
 *              Noodle ships none, because the right LDL after a heart attack is
 *              far below the lab's "normal" and this app has no business deciding.
 */
export const LAB_MARKERS = [
  { key: 'ldl', label: 'LDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower', range: { low: 1.5, high: 3.4 },
    hint: 'Canadian guidelines after a heart attack usually aim below 1.8 mmol/L — your team sets yours.' },
  { key: 'nonHdl', label: 'Non-HDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower', range: null },
  { key: 'hdl', label: 'HDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'higher', range: { low: 0.99, high: null } },
  { key: 'triglycerides', label: 'Triglycerides', unit: 'mmol/L', decimals: 2, betterWhen: 'lower', range: { low: null, high: 2.21 } },
  { key: 'totalCholesterol', label: 'Total cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower', range: { low: 2.0, high: 5.19 } },
  { key: 'apoB', label: 'ApoB', unit: 'g/L', decimals: 2, betterWhen: 'lower', range: { low: null, high: 1.2 } },
  { key: 'lpa', label: 'Lp(a)', unit: 'nmol/L', decimals: 0, betterWhen: 'lower', range: { low: null, high: 75 } },
  { key: 'hba1c', label: 'HbA1c', unit: '%', decimals: 1, betterWhen: 'lower', range: { low: 4.5, high: 5.9 } },
  { key: 'glucose', label: 'Fasting glucose', unit: 'mmol/L', decimals: 1, betterWhen: null, range: { low: 3.6, high: 6.0 } },
  { key: 'hsCrp', label: 'hs-CRP', unit: 'mg/L', decimals: 1, betterWhen: 'lower', range: { low: null, high: 5.0 } },
  { key: 'ntProBnp', label: 'NT-proBNP', unit: 'ng/L', decimals: 0, betterWhen: 'lower', range: { low: null, high: 125 } },
  { key: 'creatinine', label: 'Creatinine', unit: 'µmol/L', decimals: 0, betterWhen: null, range: { low: 45, high: 110 } },
  { key: 'egfr', label: 'eGFR', unit: 'mL/min', decimals: 0, betterWhen: 'higher', range: { low: 60, high: null } },
  { key: 'potassium', label: 'Potassium', unit: 'mmol/L', decimals: 1, betterWhen: null, range: { low: 3.5, high: 5.0 } },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/L', decimals: 0, betterWhen: null, range: { low: 135, high: 170 } },
  { key: 'alt', label: 'ALT', unit: 'U/L', decimals: 0, betterWhen: null, range: { low: null, high: 50 } },
];

export function markerByKey(key) {
  return LAB_MARKERS.find((m) => m.key === key);
}

export function formatLab(value, marker) {
  if (value == null || value === '') return '—';
  return Number(value).toFixed(marker.decimals);
}

/** Markers that have at least one value across the recorded tests, in display order. */
export function markersWithData(tests) {
  return LAB_MARKERS.filter((m) => (tests ?? []).some((t) => t.values?.[m.key] != null));
}

/** Latest and previous value for a marker, for the change column. */
export function latestAndPrevious(tests, key) {
  const withValue = (tests ?? [])
    .filter((t) => t.values?.[key] != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return { latest: withValue[0] ?? null, previous: withValue[1] ?? null };
}

/** Whether a value meets the person's own target, or null when there is no target. */
export function meetsTarget(value, target, marker) {
  if (value == null || target == null || target === '' || !marker.betterWhen) return null;
  return marker.betterWhen === 'lower' ? value <= target : value >= target;
}

/** "1.50–3.40", "≥ 60", "< 2.21" — the lab's interval in words. */
export function formatRange(range) {
  if (!range) return null;
  if (range.low != null && range.high != null) return `${range.low}–${range.high}`;
  if (range.low != null) return `≥ ${range.low}`;
  if (range.high != null) return `< ${range.high}`;
  return null;
}

/** true when the value sits outside the lab's reference interval. */
export function outsideRange(value, range) {
  if (value == null || !range) return false;
  if (range.low != null && value < range.low) return true;
  if (range.high != null && value > range.high) return true;
  return false;
}

/** Every dated value for a marker, oldest first. */
export function historyFor(tests, key) {
  return (tests ?? [])
    .filter((t) => t.values?.[key] != null)
    .map((t) => ({ date: t.date, value: t.values[key] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 'in', 'high' or 'low' against the lab's interval, or null without one. */
export function rangeStatus(value, range) {
  if (value == null || !range) return null;
  if (range.high != null && value > range.high) return 'high';
  if (range.low != null && value < range.low) return 'low';
  return 'in';
}
