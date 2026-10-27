# Setting Noodle up

Noodle is an Expo app backed by Firebase (Auth, Firestore, Storage). There are no
Cloud Functions any more and no API keys to manage: the only data it reads is
Apple Health on the phone, and the only place it writes is the signed-in user's
own Firestore documents.

## Firebase

1. https://console.firebase.google.com → project `noodle` (noodle-dec11).
2. Authentication → Sign-in method → Email/Password on.
3. Authentication → Settings → Authorized domains: add every address the web
   app is served from (`innhouse.github.io`, `noodle-expo-app.expo.app`,
   `noodle-dec11.web.app`).
4. Deploy the rules whenever they change:

```
cd C:\Users\amin\Noodle; firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Phone

JS-only changes ship over the air:

```
npx eas update --channel production --message "what changed"
```

Native changes (a new Expo module, a plugin change in app.json) need a build:

```
npx eas build --platform ios --profile production
```

## Web

Pushing to `master` publishes https://innhouse.github.io/noodle through the
GitHub Actions workflow. The other two hosts update by hand:

```
npx expo export --platform web; npx eas deploy --prod
npx expo export --platform web; firebase deploy --only hosting
```

## Retiring the old food tracker

The Cloud Functions the food tracker used (`analyzeMeal`, `reviewMeals`,
`coachMeal`) are no longer in this repo. Remove them from the project once:

```
firebase functions:delete analyzeMeal reviewMeals coachMeal --force
```

Settings → "Delete meal data" clears the meals and photos from the account.
