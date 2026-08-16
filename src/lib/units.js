/**
 * Imperial display, metric storage.
 *
 * Everything in Firestore stays in kilograms and centimetres, because the
 * Mifflin-St Jeor equation and the grams-of-protein-per-kg rule are both defined
 * that way. Converting at the screen edge rather than in the data keeps one set of
 * numbers canonical — otherwise every calculation needs to know which unit it got,
 * which is exactly how unit bugs happen.
 */

const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

export function kgToLb(kg) {
  return kg * LB_PER_KG;
}

export function lbToKg(lb) {
  return lb / LB_PER_KG;
}

export function cmToInches(cm) {
  return cm / CM_PER_INCH;
}

export function inchesToCm(inches) {
  return inches * CM_PER_INCH;
}

/** Split a centimetre height into feet and whole inches for the two dropdowns. */
export function cmToFeetInches(cm) {
  if (!cm) return { feet: null, inches: null };
  const totalInches = Math.round(cmToInches(cm));
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

export function feetInchesToCm(feet, inches) {
  if (feet == null && inches == null) return null;
  return inchesToCm((feet ?? 0) * 12 + (inches ?? 0));
}

/** Round to one decimal for display — scales do not resolve finer than that. */
export function displayLb(kg) {
  if (kg == null) return '';
  return (Math.round(kgToLb(kg) * 10) / 10).toString();
}

export const FEET_OPTIONS = [4, 5, 6, 7].map((feet) => ({
  label: `${feet} ft`,
  value: feet,
}));

export const INCH_OPTIONS = Array.from({ length: 12 }, (_, inches) => ({
  label: `${inches} in`,
  value: inches,
}));
