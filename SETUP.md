# Noodle — setup

The app is built. These are the steps only you can do, because they involve
accounts and billing. Roughly 20 minutes end to end.

## 1. Get the two API keys

**Anthropic** — https://console.anthropic.com → API Keys → Create Key.
This is what reads the photos. Budget a few dollars a month at personal volume;
each meal photo costs roughly 2–4 cents.

**USDA FoodData Central** — https://fdc.nal.usda.gov/api-key-signup.html
Free, instant, arrives by email. This is what turns "chicken thigh, 165 g" into
real nutrition numbers instead of a guess.

## 2. Create the Firebase project

1. https://console.firebase.google.com → Add project → call it `noodle`.
2. **Upgrade to the Blaze plan.** Cloud Functions will not deploy on Spark.
   Blaze is pay-as-you-go with a free tier that this app will not exhaust —
   expect well under a dollar a month for Firebase itself.
3. Build → **Authentication** → Get started → enable **Email/Password**.
4. Build → **Firestore Database** → Create database → production mode.
5. Build → **Storage** → Get started → production mode.
6. Project settings → Your apps → Web (`</>`) → register an app called `noodle-web`.
   Copy the config object it shows you.

## 3. Paste the Firebase config

Open `firebaseConfig.js` and replace every `REPLACE_ME` with the matching value
from step 2.6. These values are not secret — they identify the project, and
access is governed by the rules files.

## 4. Install the Firebase CLI and deploy

> These commands are written for **Windows PowerShell**, which is what the
> terminal here runs. PowerShell 5.1 has no `&&` — it separates commands with
> `;` instead, and pasting a `&&` command gives you
> `The token '&&' is not a valid statement separator in this version`.

```bash
npm install -g firebase-tools
```

```bash
cd C:\Users\amin\Noodle; firebase login
```

```bash
firebase use --add
```

Pick the `noodle` project and give it the alias `default`.

Store the two API keys as secrets — they live in Google Secret Manager, never in
the repo and never in the app bundle. Each command prompts you to paste the key:

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

```bash
firebase functions:secrets:set USDA_API_KEY
```

Install the function dependencies:

```bash
npm install --prefix C:\Users\amin\Noodle\functions
```

Then deploy everything:

```bash
cd C:\Users\amin\Noodle; firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

## 5. Run it

```bash
cd C:\Users\amin\Noodle; npm start
```

Press `w` for the browser. Create an account with any email and password, then
go to **Settings** and fill in your height, weight, age and goal — the calorie
budget is calculated from those and nothing works properly until they are set.

## 6. Put it on your phone

Camera capture needs a real build, not Expo Go, because of the native image
picker module.

```bash
cd C:\Users\amin\Noodle; eas build --profile development --platform android
```

Set `extra.eas.projectId` in `app.json` first — `eas init` will fill it in.

---

## How it works

A photo goes to the `analyzeMeal` Cloud Function, which sends it to Claude Opus 5
with a fixed JSON schema. Claude identifies each food, estimates its weight in
grams, and writes a USDA search phrase for it. The function then looks each food
up in FoodData Central and scales the real per-100 g nutrition to the estimated
weight.

That split is deliberate. The model is good at *what this is and how much of it
there is*, and unreliable at recalling nutrition facts from memory — so it only
does the first job, and the database does the second. The same meal photographed
twice gives the same numbers.

Claude also returns up to three clarifying questions, each with the nutritional
consequence of every answer attached. Those become the dropdowns on the confirm
screen, and answering one recomputes the totals on-device with no second API
call. Cooking oil is the usual culprit — a pan-fried portion can carry 150
invisible calories, which is the single largest source of under-counting in
photo-based tracking.

## Costs

| | Roughly |
|---|---|
| Meal photo analysis | 2–4¢ each |
| "What should I eat next?" | under 1¢ |
| Firebase | free tier, realistically |
| USDA | free |

Three meals a day lands around $3/month.

## Where the code lives

`C:\Users\amin\Noodle` — the real project. Not on Google Drive: npm cannot
install into a Drive-synced folder without permission errors, the same problem
DDDUBER hit. Push to a private GitHub repo for backup.
