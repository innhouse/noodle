# Noodle

Personal food tracker. Photograph a meal, Claude reads it, USDA prices the
nutrition, dropdowns correct what the photo couldn't show.

## Expo has changed

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code that touches an Expo module. Several APIs were replaced in
recent SDKs — `expo-image-manipulator` in particular is now the contextual
`ImageManipulator.manipulate()` API, not `manipulateAsync`.

## Architecture

- `App.js` — tab shell and overlay routing. No navigation library; the app is
  small enough that a `useState` switch beats the dependency.
- `src/lib/nutrition.js` — every calculation. Pure and synchronous, because the
  confirm screen recomputes totals on each dropdown change and none of that
  should touch the network.
- `src/lib/firebase.js` / `.web.js` — platform split. `getReactNativePersistence`
  exists only in Firebase's React Native build, so importing it on web breaks the
  bundle. Metro resolves `.web.js` automatically.
- `functions/` — Cloud Functions. The Anthropic key lives here and only here;
  anything in the Expo bundle is readable by anyone who installs the app.

## The division of labour that matters

Claude estimates **identity and weight**. USDA supplies **nutrition**. Do not
collapse these — asking the model for calories directly makes the same meal
score differently on different days, which destroys the point of tracking.

`fallbackPer100g` in the schema exists for foods USDA has no entry for. The UI
labels those as estimates rather than silently mixing them in with database
figures.

## Conventions

- Single quotes, no semicolon-free style — match the existing files.
- Day keys are local-time `YYYY-MM-DD`, never UTC. A meal at 11pm belongs to
  that day for the person eating it.
- Model is `claude-opus-5`. Structured outputs via `output_config.format`.
  Thinking is on by default on this model and counts against `max_tokens`.
