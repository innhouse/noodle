/**
 * Blood-test markers Noodle can record, typed in from the lab report.
 *
 * Canadian units throughout (mmol/L for lipids and glucose). Targets are the
 * person's own, set from what their cardiologist told them; Noodle ships none,
 * because the right LDL for one person is not the right LDL for another and
 * this app has no business deciding. The one hint shown is a guideline figure
 * labelled as such, so the field means something before a target is set.
 */
export const LAB_MARKERS = [
  { key: 'ldl', label: 'LDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower',
    hint: 'Canadian guidelines after a heart attack usually aim below 1.8 mmol/L — your team sets yours.' },
  { key: 'nonHdl', label: 'Non-HDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower' },
  { key: 'hdl', label: 'HDL cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'higher' },
  { key: 'triglycerides', label: 'Triglycerides', unit: 'mmol/L', decimals: 2, betterWhen: 'lower' },
  { key: 'totalCholesterol', label: 'Total cholesterol', unit: 'mmol/L', decimals: 2, betterWhen: 'lower' },
  { key: 'apoB', label: 'ApoB', unit: 'g/L', decimals: 2, betterWhen: 'lower' },
  { key: 'lpa', label: 'Lp(a)', unit: 'nmol/L', decimals: 0, betterWhen: 'lower' },
  { key: 'hba1c', label: 'HbA1c', unit: '%', decimals: 1, betterWhen: 'lower' },
  { key: 'glucose', label: 'Fasting glucose', unit: 'mmol/L', decimals: 1, betterWhen: null },
  { key: 'hsCrp', label: 'hs-CRP', unit: 'mg/L', decimals: 1, betterWhen: 'lower' },
  { key: 'ntProBnp', label: 'NT-proBNP', unit: 'ng/L', decimals: 0, betterWhen: 'lower' },
  { key: 'creatinine', label: 'Creatinine', unit: 'µmol/L', decimals: 0, betterWhen: null },
  { key: 'egfr', label: 'eGFR', unit: 'mL/min', decimals: 0, betterWhen: 'higher' },
  { key: 'potassium', label: 'Potassium', unit: 'mmol/L', decimals: 1, betterWhen: null },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/L', decimals: 0, betterWhen: null },
  { key: 'alt', label: 'ALT', unit: 'U/L', decimals: 0, betterWhen: null },
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
