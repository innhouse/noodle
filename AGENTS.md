# Noodle

Personal training and recovery log, fed entirely by Apple Health: workouts
(including ones other apps such as Jefit write to Health), sleep, resting heart
rate, HRV and weight, compared only against the same person's earlier readings.

It used to be a food tracker. That code is gone; the only trace is the one-shot
"Delete meal data" action in Settings that clears what the old version stored.

## Expo has changed

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code that touches an Expo module. Several APIs were replaced in
recent SDKs — `expo-image-manipulator` in particular is now the contextual
`ImageManipulator.manipulate()` API, not `manipulateAsync`.

## Architecture

- `App.js` — tab shell and overlay routing. No navigation library; the app is
  small enough that a `useState` switch beats the dependency.
- `src/lib/useHealthData.js` — the one place HealthKit is read. On the phone it
  reads and mirrors to Firestore; on web it reads the mirror. Every screen that
  shows health data goes through it.
- `src/lib/health.ios.js` / `health.js` — HealthKit reads and the no-op stubs
  Metro picks on web. Read-only by design; Noodle never writes to Health.
- `src/lib/workouts.js`, `healthMetrics.js`, `weight.js` — pure labels and
  arithmetic, shared by phone and web.
- `src/lib/firebase.js` / `.web.js` — platform split. `getReactNativePersistence`
  exists only in Firebase's React Native build, so importing it on web breaks the
  bundle. Metro resolves `.web.js` automatically.

## What the app is entitled to say

Nothing here diagnoses. There are no normal ranges; every comparison is the
person's own last few weeks. A resting heart rate on a beta-blocker, a pace
after a layoff — shown as recorded, never judged. Keep it that way.

HealthKit has no fields for sets, reps or weight lifted, so a strength session
is a duration and a heart-rate trace. Per-lift detail would need Jefit's CSV
export, which is not wired up.

## Conventions

- Single quotes, no semicolon-free style — match the existing files.
- Day keys are local-time `YYYY-MM-DD`, never UTC.
- Web is published three ways: GitHub Pages (via `.github/workflows/pages.yml`,
  base path `/noodle`), EAS Hosting and Firebase Hosting. `app.config.js` adds
  the base path only when the Pages workflow asks for it.
- Phone updates ship with `npx eas update --channel production`; no store build
  needed for JS-only changes.
