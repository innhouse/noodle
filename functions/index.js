/**
 * Noodle Cloud Functions.
 *
 * Two callables, both requiring an authenticated user:
 *   analyzeMeal  — meal photo in, itemised nutrition estimate out
 *   coachMeal    — the day so far in, a concrete suggestion for the next meal out
 *
 * The Anthropic key lives here rather than in the app because anything shipped in
 * an Expo bundle is readable by anyone who installs it.
 */

import { initializeApp } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import Anthropic from '@anthropic-ai/sdk';

import { MEAL_SCHEMA, SYSTEM_PROMPT } from './schema.js';
import { lookupFood, scaleToGrams } from './usda.js';

initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// USDA asks that keys not be made public, so this lives in Secret Manager alongside
// the Anthropic key rather than in an env file. If a lookup fails for any reason the
// item falls back to Claude's own estimate, which the app labels "Estimated" rather
// than "USDA" so the degradation is visible rather than silent.
const USDA_API_KEY = defineSecret('USDA_API_KEY');

const MODEL = 'claude-opus-5';

const RUNTIME = {
  region: 'us-central1',
  secrets: [ANTHROPIC_API_KEY, USDA_API_KEY],
  memory: '512MiB',
  timeoutSeconds: 120,
  // One user, one phone. Without a ceiling a runaway retry loop can bill unbounded.
  maxInstances: 3,
};

function requireUser(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to use Noodle.');
  }
  return request.auth.uid;
}

/** Pull the JSON payload out of a structured-outputs response. */
function readStructuredJson(response) {
  // Opus 5 runs adaptive thinking by default, so the text block is not necessarily
  // first — and on a refusal there may be no text block at all.
  if (response.stop_reason === 'refusal') {
    throw new HttpsError(
      'invalid-argument',
      'Claude declined to analyse that image. Try a different photo.'
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpsError(
      'resource-exhausted',
      'The analysis was cut short. Try a photo with fewer separate items.'
    );
  }

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) {
    throw new HttpsError('internal', 'Claude returned no analysis for that image.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpsError('internal', 'Could not read the analysis Claude returned.');
  }
}

// A hotel breakfast is several plates and several trips. More than this and the
// token cost climbs without the estimate getting better.
const MAX_IMAGES = 6;

export const analyzeMeal = onCall(RUNTIME, async (request) => {
  const uid = requireUser(request);
  const {
    images,
    imageBase64,
    mimeType = 'image/jpeg',
    mealType = 'meal',
    hint = '',
  } = request.data ?? {};

  // `imageBase64` is the original single-photo shape, still accepted so an older
  // installed build keeps working after this deploys.
  const photos = Array.isArray(images) && images.length > 0
    ? images
    : [{ base64: imageBase64, mimeType }];

  if (photos.some((photo) => typeof photo?.base64 !== 'string' || photo.base64.length < 100)) {
    throw new HttpsError('invalid-argument', 'No photo was included in the request.');
  }
  if (photos.length > MAX_IMAGES) {
    throw new HttpsError('invalid-argument', `Send at most ${MAX_IMAGES} photos of one meal.`);
  }
  // Callable payloads cap at 10 MB; the app already downscales, so anything this
  // large is a bug worth failing loudly on rather than paying to send.
  const totalBytes = photos.reduce((sum, photo) => sum + photo.base64.length, 0);
  if (totalBytes > 7_000_000) {
    throw new HttpsError('invalid-argument', 'Those photos are too large. Try fewer at once.');
  }

  const rawKey = ANTHROPIC_API_KEY.value();
  // Strip everything that cannot legitimately appear in an API key rather than just
  // trimming the ends. A key routed through a rich-text editor or a terminal paste
  // can pick up a trailing newline, a non-breaking space, or a zero-width character
  // mid-string — all invisible, all fatal, and none of them visibly wrong when you
  // check the key by eye. Keys are printable ASCII, so anything else is paste damage.
  const apiKey = rawKey.replace(/[^\x21-\x7E]/g, '');
  const anthropic = new Anthropic({ apiKey });

  const userText =
    `This is my ${mealType}.` +
    (photos.length > 1
      ? ` There are ${photos.length} photos of it — they may show different dishes, ` +
        'or the same dish from another angle or at a different stage of being eaten. ' +
        'Count each distinct food once across all of them, and say in the notes if you ' +
        'were unsure whether two photos showed the same thing.'
      : '') +
    (hint ? ` Extra context from me: ${hint}` : '') +
    '\n\nIdentify everything and estimate the weight of each component.';

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: {
        // Portion estimation is the accuracy bottleneck and benefits from real
        // reasoning; medium keeps that without paying for xhigh on every photo.
        effort: 'medium',
        format: { type: 'json_schema', schema: MEAL_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            ...photos.map((photo) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: photo.mimeType ?? 'image/jpeg',
                data: photo.base64,
              },
            })),
            { type: 'text', text: userText },
          ],
        },
      ],
    });
  } catch (error) {
    // Field names here deliberately avoid `message` and `status`: firebase-functions'
    // logger owns those keys on a structured entry and silently overwrites them with
    // its own, which meant every log of this failure showed a stack trace instead of
    // what Anthropic actually said.
    logger.error('Anthropic call failed', {
      uid,
      anthropicStatus: error.status,
      anthropicType: error.error?.error?.type ?? error.name,
      anthropicDetail: error.error?.error?.message ?? error.message,
    });

    // Distinguish the failures that need different fixes. A generic "could not
    // reach the service" sent the user hunting for a network problem when the real
    // cause was a bad key, which is only visible in the Cloud Function logs.
    if (error.status === 401) {
      // Describe the stored key's shape without ever logging the key itself. A
      // valid Anthropic key is ~108 characters starting "sk-ant-api03-", so a
      // wrong length or prefix identifies a truncated paste or a swapped secret
      // immediately — otherwise diagnosing this means guessing.
      logger.error('Anthropic rejected the API key', {
        rawLength: rawKey.length,
        cleanedLength: apiKey.length,
        // A gap between these two means the stored secret carried invisible
        // characters; a cleaned length far off ~108 means it was truncated.
        keyPrefix: apiKey.slice(0, 13),
        looksLikeAnthropicKey: apiKey.startsWith('sk-ant-'),
        anthropicDetail: error.error?.error?.message ?? error.message,
      });
      throw new HttpsError(
        'failed-precondition',
        'The Anthropic API key is not valid. Check the ANTHROPIC_API_KEY secret.'
      );
    }
    if (error.status === 400 && /credit|balance/i.test(error.message ?? '')) {
      throw new HttpsError(
        'failed-precondition',
        'The Anthropic account is out of credit. Top it up in the Claude Console.'
      );
    }
    if (error.status === 429) {
      throw new HttpsError('resource-exhausted', 'Rate limited — try again in a moment.');
    }
    throw new HttpsError('internal', 'Could not reach the analysis service.');
  }

  const analysis = readStructuredJson(response);

  if (!analysis.isFood || analysis.items.length === 0) {
    return { isFood: false, mealName: '', items: [], questions: [], notes: analysis.notes ?? '' };
  }

  const usdaKey = USDA_API_KEY.value();

  // Every item is an independent lookup, so fan out rather than walking the list.
  const items = await Promise.all(
    analysis.items.map(async (item, index) => {
      const match = await lookupFood(item.usdaQuery, usdaKey);
      const per100g = match ? match.per100g : item.fallbackPer100g;

      return {
        id: `item-${index}`,
        label: item.label,
        grams: Math.round(item.grams),
        gramsLow: Math.round(item.gramsLow),
        gramsHigh: Math.round(item.gramsHigh),
        confidence: item.confidence,
        per100g,
        // Surfaced in the UI so the user can see whether a number came from the
        // database or from the model guessing, and judge it accordingly.
        source: match
          ? { type: 'usda', description: match.description, fdcId: match.fdcId }
          : { type: 'estimate', description: 'Estimated by Claude — no USDA match', fdcId: null },
        base: scaleToGrams(per100g, item.grams),
      };
    })
  );

  logger.info('Meal analysed', {
    uid,
    itemCount: items.length,
    matched: items.filter((i) => i.source.type === 'usda').length,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  });

  return {
    isFood: true,
    mealName: analysis.mealName,
    items,
    questions: analysis.questions ?? [],
    notes: analysis.notes ?? '',
  };
});

const COACH_SYSTEM = `You advise a single user on what to eat next, given what they have already
eaten today and the targets they are working to. They are losing weight while trying to keep protein
high enough to hold onto muscle.

Answer in three short parts, as plain sentences with no headers or bullets:
first, one sentence on where the day stands — the number that matters, not a recital of every macro;
then two or three specific things they could eat next, each with a rough calorie and protein figure,
sized to fit what is actually left in the budget;
finally, one sentence of practical advice only if there is something genuinely worth flagging.

Be concrete. "Greek yogurt with berries, about 200 kcal and 20 g protein" is useful; "consider a
high-protein snack" is not. Suggest real food they could plausibly get hold of, not recipes.

If they have already eaten well past the budget, say so plainly once and move on to what would make
the rest of the day better. Do not moralise, do not lecture about discipline, and do not pad the
answer with caveats about consulting a professional.`;

export const coachMeal = onCall(RUNTIME, async (request) => {
  const uid = requireUser(request);
  const { totals, targets, meals = [], question = '' } = request.data ?? {};

  if (!totals || !targets) {
    throw new HttpsError('invalid-argument', 'Missing the day so far.');
  }

  const eaten = meals
    .map((m) => `- ${m.mealType}: ${m.name} (${Math.round(m.calories)} kcal, ${Math.round(m.protein)} g protein)`)
    .join('\n');

  const prompt = [
    `Local time: ${request.data.localTime ?? 'unknown'}`,
    '',
    'Targets for the day:',
    `- Calories: ${Math.round(targets.calories)} kcal`,
    `- Protein: ${Math.round(targets.protein)} g`,
    '',
    'Eaten so far:',
    eaten || '- Nothing yet.',
    '',
    'Running totals:',
    `- ${Math.round(totals.calories)} kcal, ${Math.round(totals.protein)} g protein, ` +
      `${Math.round(totals.carbs)} g carbs, ${Math.round(totals.fat)} g fat`,
    '',
    `Remaining: ${Math.round(targets.calories - totals.calories)} kcal and ` +
      `${Math.round(targets.protein - totals.protein)} g protein.`,
    question ? `\nTheir question: ${question}` : '\nWhat should they eat next?',
  ].join('\n');

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: COACH_SYSTEM,
      // Arithmetic against a budget plus a few suggestions — no deep reasoning needed.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
      throw new HttpsError('invalid-argument', 'Claude declined to answer that.');
    }

    const text = response.content.find((block) => block.type === 'text')?.text ?? '';
    logger.info('Coach answered', { uid, outputTokens: response.usage?.output_tokens });
    return { text };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Coach call failed', { uid, message: error.message });
    throw new HttpsError('internal', 'Could not reach the coach right now.');
  }
});
