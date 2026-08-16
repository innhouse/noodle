/**
 * All the arithmetic that turns an analysis plus the user's dropdown answers into
 * numbers on screen. Deliberately pure and synchronous: the confirm screen recomputes
 * totals on every dropdown change, and none of that should need a network call.
 */

const EMPTY = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };

export function emptyMacros() {
  return { ...EMPTY };
}

export function addMacros(a, b) {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
    sugar: (a.sugar ?? 0) + (b.sugar ?? 0),
    sodium: (a.sodium ?? 0) + (b.sodium ?? 0),
  };
}

function scale(per100g, grams) {
  const factor = grams / 100;
  return {
    calories: (per100g.calories ?? 0) * factor,
    protein: (per100g.protein ?? 0) * factor,
    carbs: (per100g.carbs ?? 0) * factor,
    fat: (per100g.fat ?? 0) * factor,
    fiber: (per100g.fiber ?? 0) * factor,
    sugar: (per100g.sugar ?? 0) * factor,
    sodium: (per100g.sodium ?? 0) * factor,
  };
}

/** How much of what's on the plate actually got eaten. */
export const PORTION_CHOICES = [
  { label: 'All of it', value: 1 },
  { label: 'About ¾', value: 0.75 },
  { label: 'About half', value: 0.5 },
  { label: 'A few bites', value: 0.25 },
  { label: 'Double it', value: 2 },
];

/**
 * Resolve one item against the user's answers.
 *
 * Two kinds of adjustment compose here and they are not the same thing. A question's
 * `gramsMultiplier` changes how much food there is ("was that a small or large bowl"),
 * so it scales the weight. The delta fields change what is *in* the food without
 * changing its weight ("was it fried in oil"), so they are added after scaling — and
 * they are stated for the item as served, which is why they get multiplied by how much
 * of it was actually eaten but not by the question multipliers.
 */
export function resolveItem(item, state, questions, answers) {
  const eaten = state?.portion ?? 1;
  const gramsBase = state?.grams ?? item.grams;

  let questionMultiplier = 1;
  const deltas = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  for (const question of questions ?? []) {
    // An empty `appliesTo` means the question is about the whole meal.
    const relevant = question.appliesTo === '' || question.appliesTo === item.label;
    if (!relevant) continue;

    const chosen = answers?.[question.id];
    if (chosen == null) continue;
    const option = question.options[chosen];
    if (!option) continue;

    questionMultiplier *= option.gramsMultiplier ?? 1;
    deltas.calories += option.calorieDelta ?? 0;
    deltas.protein += option.proteinDelta ?? 0;
    deltas.carbs += option.carbsDelta ?? 0;
    deltas.fat += option.fatDelta ?? 0;
  }

  const grams = gramsBase * questionMultiplier * eaten;
  const scaled = scale(item.per100g, grams);

  return {
    grams,
    macros: {
      ...scaled,
      calories: Math.max(0, scaled.calories + deltas.calories * eaten),
      protein: Math.max(0, scaled.protein + deltas.protein * eaten),
      carbs: Math.max(0, scaled.carbs + deltas.carbs * eaten),
      fat: Math.max(0, scaled.fat + deltas.fat * eaten),
    },
  };
}

export function resolveMeal(items, itemStates, questions, answers) {
  let totals = emptyMacros();
  const resolved = [];

  for (const item of items) {
    const result = resolveItem(item, itemStates?.[item.id], questions, answers);
    // `grams` stays the model's original estimate and the eaten weight lands in
    // `resolvedGrams`. Overwriting `grams` here meant the portion dropdown rebuilt
    // its options from the already-adjusted weight every render, so choosing "about
    // half" halved the options too and left the field with nothing selected. It also
    // makes a saved meal replayable: keeping the base means re-running this function
    // with the same answers reproduces the same totals.
    resolved.push({ ...item, resolvedGrams: result.grams, macros: result.macros });
    totals = addMacros(totals, result.macros);
  }

  return { items: resolved, totals };
}

export function sumMeals(meals) {
  return (meals ?? []).reduce(
    (acc, meal) => addMacros(acc, meal.totals ?? EMPTY),
    emptyMacros()
  );
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export const ACTIVITY_LEVELS = [
  { label: 'Mostly sitting', value: 1.2, hint: 'Desk job, little exercise' },
  { label: 'Lightly active', value: 1.375, hint: 'Light exercise 1–3 days a week' },
  { label: 'Moderately active', value: 1.55, hint: 'Exercise 3–5 days a week' },
  { label: 'Very active', value: 1.725, hint: 'Hard exercise 6–7 days a week' },
];

// Labelled in pounds for display; the value stays kg/week because the deficit
// maths and the 7700 kcal/kg figure below are both metric.
export const LOSS_RATES = [
  { label: 'Maintain weight', value: 0 },
  { label: 'Slow — ½ lb a week', value: 0.2268 },
  { label: 'Steady — 1 lb a week', value: 0.4536 },
  { label: 'Fast — 1½ lb a week', value: 0.6804 },
];

// A kilogram of body fat is about 7700 kcal, spread over a week.
const KCAL_PER_KG = 7700;

/** Mifflin-St Jeor, the best-validated BMR equation for the general population. */
export function basalRate({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/**
 * Daily targets from the profile.
 * Returns nulls when the profile is incomplete so callers can prompt for setup
 * rather than showing a confidently wrong number.
 */
export function computeTargets(profile) {
  // An explicit override stands on its own — someone who has been given numbers by a
  // dietitian should not have to fill in a height and age to use them.
  if (profile?.manualCalories) {
    const protein =
      profile.manualProtein ??
      Math.round(1.8 * (profile.goalWeightKg ?? profile.weightKg ?? 75));
    return { ...macroSplit(profile.manualCalories, protein), bmr: null, tdee: null };
  }

  if (!profile?.weightKg || !profile?.heightCm || !profile?.age) {
    return { calories: null, protein: null, carbs: null, fat: null, bmr: null, tdee: null };
  }

  const bmr = basalRate(profile);
  const tdee = bmr * (profile.activity ?? 1.375);
  const deficit = ((profile.lossRate ?? 0.5) * KCAL_PER_KG) / 7;

  // Never target below BMR. A deficit that aggressive costs muscle and adherence,
  // and for a short or light person a 0.75 kg/week goal can land there easily.
  const calories = Math.round(Math.max(tdee - deficit, bmr));

  // Protein is set against goal weight rather than current: it is there to protect
  // lean mass, and lean mass does not scale with the fat being lost.
  const protein = profile.manualProtein ??
    Math.round(1.8 * (profile.goalWeightKg ?? profile.weightKg));

  return { ...macroSplit(calories, protein), bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

/**
 * Protein target for a single meal.
 *
 * Daily protein alone is a misleading number. Muscle protein synthesis is triggered
 * per meal and saturates somewhere around 30-40 g, so 120 g spread evenly over three
 * meals does more than the same 120 g eaten mostly at dinner — the surplus in one
 * sitting is largely oxidised rather than banked. Spreading it is the point.
 *
 * Snacks are exempt: they are not a protein feeding, and holding a piece of fruit to
 * a 40 g target would only produce noise.
 */
export function perMealProtein(targets, mealType) {
  if (!targets?.protein || mealType === 'snack') return null;
  // Against the three main meals rather than four; the snack's protein still counts
  // towards the day, it just isn't held to a target of its own.
  return Math.round(targets.protein / 3);
}

/**
 * Extra calories to allow for measured activity, if the user has opted in.
 *
 * Off by default, and discounted when on. Wearables overestimate active energy —
 * often substantially — and the static activity multiplier in the profile already
 * accounts for a normal day's movement, so adding the full figure double-counts it.
 * Taking half is the conservative reading of a number that tends to flatter.
 */
export function activityBonus(profile, activeEnergyKcal) {
  if (!profile?.useActiveEnergy || !activeEnergyKcal) return 0;
  return Math.round(Math.max(activeEnergyKcal * 0.5, 0));
}

/** Fill the rest of the calorie budget after protein, leaning slightly to carbs. */
function macroSplit(calories, protein) {
  const proteinKcal = protein * 4;
  const remaining = Math.max(calories - proteinKcal, 0);
  const fatKcal = remaining * 0.4;
  const carbKcal = remaining * 0.6;
  return {
    calories,
    protein,
    fat: Math.round(fatKcal / 9),
    carbs: Math.round(carbKcal / 4),
  };
}

/**
 * Weight trend from a noisy daily scale.
 * Day-to-day scale readings swing a kilo or more on water alone, so an exponentially
 * weighted average is what actually tells you whether the plan is working.
 */
export function weightTrend(entries, alpha = 0.15) {
  const sorted = [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let trend = null;
  return sorted.map((entry) => {
    trend = trend === null ? entry.weightKg : trend + alpha * (entry.weightKg - trend);
    return { ...entry, trend };
  });
}

/** Observed kg/week over the trend line, or null when there isn't enough data yet. */
export function weeklyChange(trended) {
  if (!trended || trended.length < 8) return null;
  const first = trended[0];
  const last = trended[trended.length - 1];
  const days =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000;
  if (days < 7) return null;
  return ((last.trend - first.trend) / days) * 7;
}
