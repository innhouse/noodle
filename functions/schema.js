/**
 * JSON Schema handed to Claude via structured outputs.
 *
 * Structured outputs guarantee the response validates against this exactly, so
 * downstream code never has to defend against a malformed model reply. Note the
 * API's schema restrictions: every object needs `additionalProperties: false`
 * and a `required` list, and numeric constraints (minimum/maximum) are not
 * supported — bounds live in the field descriptions instead.
 */

const macrosPer100g = {
  type: 'object',
  description:
    'Your own best estimate of nutrition per 100 g of this food, used only when the ' +
    'USDA database has no good match for it.',
  properties: {
    calories: { type: 'number', description: 'kcal per 100 g' },
    protein: { type: 'number', description: 'grams of protein per 100 g' },
    carbs: { type: 'number', description: 'grams of carbohydrate per 100 g' },
    fat: { type: 'number', description: 'grams of fat per 100 g' },
    fiber: { type: 'number', description: 'grams of fibre per 100 g' },
  },
  required: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  additionalProperties: false,
};

const answerOption = {
  type: 'object',
  properties: {
    label: {
      type: 'string',
      description: 'Short answer text shown in the dropdown, e.g. "Pan-fried in oil".',
    },
    gramsMultiplier: {
      type: 'number',
      description:
        'Multiply the affected item\'s weight by this. Use 1 when the answer does not ' +
        'change how much food there is. Use e.g. 0.5 for "I ate about half".',
    },
    calorieDelta: {
      type: 'number',
      description:
        'Calories to ADD to the affected item if this answer is chosen (may be negative, ' +
        'or 0). Use this for things that change nutrition without changing the food weight, ' +
        'like added cooking oil, butter, dressing, or sugar.',
    },
    proteinDelta: { type: 'number', description: 'Grams of protein to add if chosen.' },
    carbsDelta: { type: 'number', description: 'Grams of carbohydrate to add if chosen.' },
    fatDelta: { type: 'number', description: 'Grams of fat to add if chosen.' },
    isDefault: {
      type: 'boolean',
      description: 'True for the single most likely answer. Exactly one option must be true.',
    },
  },
  required: [
    'label',
    'gramsMultiplier',
    'calorieDelta',
    'proteinDelta',
    'carbsDelta',
    'fatDelta',
    'isDefault',
  ],
  additionalProperties: false,
};

export const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    isFood: {
      type: 'boolean',
      description: 'False if the photo does not show food or drink at all.',
    },
    mealName: {
      type: 'string',
      description: 'A short human name for the whole meal, e.g. "Chicken burrito bowl".',
    },
    items: {
      type: 'array',
      description:
        'One entry per distinct food or drink component. Split composite dishes into their ' +
        'major components when they are separately visible (rice, beans, chicken, cheese), ' +
        'but keep a genuinely mixed dish (a stew, a smoothie) as one item.',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'What this is, as a person would say it. E.g. "Grilled chicken thigh".',
          },
          usdaQuery: {
            type: 'string',
            description:
              'A short search phrase to look this food up in the USDA FoodData Central ' +
              'database. Use plain generic food words and the cooking method, no brand names ' +
              'and no quantities. E.g. "chicken thigh roasted skinless" or "brown rice cooked".',
          },
          grams: {
            type: 'number',
            description:
              'Your best single estimate of the edible weight in grams actually on the plate. ' +
              'Use visible size cues: plate and bowl diameters, cutlery, hands, cans and bottles.',
          },
          gramsLow: { type: 'number', description: 'Low end of a plausible weight range, grams.' },
          gramsHigh: { type: 'number', description: 'High end of a plausible weight range, grams.' },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description:
              'How sure you are about BOTH the identification and the portion size.',
          },
          fallbackPer100g: macrosPer100g,
        },
        required: [
          'label',
          'usdaQuery',
          'grams',
          'gramsLow',
          'gramsHigh',
          'confidence',
          'fallbackPer100g',
        ],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      description:
        'Up to 3 questions whose answers would most reduce the error in this estimate. Only ' +
        'ask about things you genuinely cannot see and that meaningfully move the calorie ' +
        'total — invisible cooking fat, dressing, whether a drink is diet or regular, hidden ' +
        'sugar. Never ask something the photo already answers. Return an empty array when the ' +
        'photo is unambiguous.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short unique slug, e.g. "cooking-fat".' },
          question: {
            type: 'string',
            description: 'Plain, short question. E.g. "How was the chicken cooked?"',
          },
          appliesTo: {
            type: 'string',
            description:
              'The exact `label` of the item this question affects, or the empty string if it ' +
              'applies to the whole meal.',
          },
          options: {
            type: 'array',
            description: '2 to 5 answers, ordered most likely first.',
            items: answerOption,
          },
        },
        required: ['id', 'question', 'appliesTo', 'options'],
        additionalProperties: false,
      },
    },
    notes: {
      type: 'string',
      description:
        'One short sentence for the user about what drove the estimate or where it is weakest. ' +
        'Empty string if there is nothing worth saying.',
    },
  },
  required: ['isFood', 'mealName', 'items', 'questions', 'notes'],
  additionalProperties: false,
};

export const SYSTEM_PROMPT = `You estimate the nutritional content of meals from photographs for a
single user who is tracking intake to lose weight while keeping protein high.

Identify every food and drink in the photo and estimate the edible weight of each in grams.

Estimating portions is the part that matters most, and it is where photo estimates usually go
wrong. Anchor every weight to something of known size in the frame rather than guessing: a dinner
plate is about 27 cm across and a side plate about 20 cm, a standard fork is about 19 cm long, a
soup bowl holds roughly 400 ml, a soda can is 355 ml, a chicken breast is typically 150-200 g
cooked, and a closed fist is roughly a cup. Say what you anchored to in the notes when the portion
is the uncertain part.

Two systematic errors to correct for. First, food photographed from above looks flatter than it is,
so estimate depth deliberately rather than defaulting to a thin layer. Second, fat used in cooking
is invisible and is the single largest source of underestimation — a pan-fried portion can carry
100-200 kcal of oil that nothing in the photo reveals. Do not silently assume food was cooked
without fat; if you cannot tell, ask about it.

Prefer being right over being reassuring. If a portion could plausibly be half or double what you
guessed, say so through gramsLow and gramsHigh and mark the confidence low. An honest wide range
the user can correct is more useful than a precise-looking number that is wrong.

The usdaQuery field feeds a text search against the USDA FoodData Central database, so write it the
way that database describes foods: generic ingredient words plus preparation, no brands, no
quantities, no adjectives like "delicious" or "homemade".

Your questions become dropdown menus in the app. Each answer carries the nutritional consequence of
choosing it, so the app can update the totals without asking you again. Use gramsMultiplier when the
answer changes how much food there is, and the delta fields when it changes what is in the food
without changing its weight — deltas apply to the whole item as served, not per 100 g. Ask only what
you cannot see and what actually moves the total; a question that changes the meal by 20 kcal is not
worth the user's time.`;
