/**
 * USDA FoodData Central lookups.
 *
 * Claude reads the photo and tells us what the food is and how much of it there is;
 * this module turns "chicken thigh roasted skinless, 165 g" into real numbers by
 * pulling the per-100 g nutrient profile from USDA and scaling it. That split is
 * what makes the same meal photographed twice give the same answer — the model only
 * has to be consistent about identity and weight, not about nutrition facts.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// FoodData Central nutrient ids. 1008 is the measured Energy row; 2047/2048 are the
// Atwater-calculated ones that some Foundation entries carry instead.
const NUTRIENT_IDS = {
  calories: [1008, 2047, 2048],
  protein: [1003],
  fat: [1004],
  carbs: [1005],
  fiber: [1079],
  sugar: [2000],
  sodium: [1093],
};

// Whole-food data types, best first. Branded is excluded: it is 20k+ supermarket
// SKUs that swamp the generic entry for anything you'd cook at home, and matching
// a home-cooked chicken thigh to a specific frozen brand is worse than not matching.
const DATA_TYPE_RANK = {
  Foundation: 0,
  'SR Legacy': 1,
  'Survey (FNDDS)': 2,
};
const DATA_TYPES = 'Foundation,SR Legacy,Survey (FNDDS)';

// Survives warm invocations on the same instance; the Firestore layer below covers
// the rest. Lookups repeat heavily — the same twenty foods make up most meals.
const memoryCache = new Map();
const MEMORY_CACHE_MAX = 500;

function cacheKey(query) {
  return query.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 200);
}

function readNutrients(food) {
  const out = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  const rows = food.foodNutrients || [];

  for (const [key, ids] of Object.entries(NUTRIENT_IDS)) {
    // Take the first id that is actually present, in preference order.
    for (const id of ids) {
      const row = rows.find((n) => n.nutrientId === id && typeof n.value === 'number');
      if (row) {
        out[key] = row.value;
        break;
      }
    }
  }
  return out;
}

function scoreCandidate(food, query) {
  const rank = DATA_TYPE_RANK[food.dataType];
  if (rank === undefined) return null;

  const description = (food.description || '').toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const matched = words.filter((w) => description.includes(w)).length;

  // Data type dominates, word overlap breaks ties, and shorter descriptions win at
  // equal overlap because USDA's generic entries are terser than its oddities
  // ("Chicken, broilers, thigh, meat only, roasted" beats a 12-clause variant).
  return rank * 1000 - matched * 10 + Math.min(description.length, 200) / 100;
}

async function searchUsda(query, apiKey) {
  const url =
    `${SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(query)}` +
    `&dataType=${encodeURIComponent(DATA_TYPES)}` +
    '&pageSize=10';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      logger.warn('USDA search failed', { query, status: response.status });
      return null;
    }
    const body = await response.json();
    const foods = body.foods || [];
    if (foods.length === 0) return null;

    let best = null;
    let bestScore = Infinity;
    for (const food of foods) {
      const score = scoreCandidate(food, query);
      if (score !== null && score < bestScore) {
        best = food;
        bestScore = score;
      }
    }
    if (!best) return null;

    return {
      fdcId: best.fdcId,
      description: best.description,
      dataType: best.dataType,
      per100g: readNutrients(best),
    };
  } catch (error) {
    logger.warn('USDA search errored', { query, message: error.message });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve a food description to a per-100 g nutrient profile.
 * Returns null when USDA has nothing usable, so the caller can fall back to the
 * model's own estimate.
 */
export async function lookupFood(query, apiKey) {
  const key = cacheKey(query);
  if (!key) return null;

  if (memoryCache.has(key)) return memoryCache.get(key);

  const db = getFirestore();
  const ref = db.collection('usdaCache').doc(key);

  try {
    const cached = await ref.get();
    if (cached.exists) {
      const value = cached.data().result ?? null;
      memoryCache.set(key, value);
      return value;
    }
  } catch (error) {
    logger.warn('USDA cache read failed', { key, message: error.message });
  }

  const result = await searchUsda(query, apiKey);

  // Cache misses too — a food USDA doesn't have this minute it won't have next
  // minute either, and re-querying wastes the daily rate limit.
  if (memoryCache.size >= MEMORY_CACHE_MAX) memoryCache.clear();
  memoryCache.set(key, result);

  ref
    .set({ query, result, cachedAt: new Date().toISOString() })
    .catch((error) => logger.warn('USDA cache write failed', { key, message: error.message }));

  return result;
}

/** Scale a per-100 g profile to an actual serving weight. */
export function scaleToGrams(per100g, grams) {
  const factor = grams / 100;
  return {
    calories: per100g.calories * factor,
    protein: per100g.protein * factor,
    carbs: per100g.carbs * factor,
    fat: per100g.fat * factor,
    fiber: (per100g.fiber ?? 0) * factor,
    sugar: (per100g.sugar ?? 0) * factor,
    sodium: (per100g.sodium ?? 0) * factor,
  };
}
