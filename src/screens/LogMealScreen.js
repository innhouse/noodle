import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../context/AuthContext';
import { dayKey, guessMealType, MEAL_TYPES } from '../lib/dates';
import { prepareImage, uriToBlob } from '../lib/image';
import { PORTION_CHOICES, resolveMeal } from '../lib/nutrition';
import { analyzeMealPhoto, saveMeal, uploadMealPhoto, watchRecentMeals } from '../lib/store';
import { colors, confidenceColor, fonts, radius, spacing } from '../theme';
import { Button, Card, Dropdown, Empty, Field, Pill, Segmented } from '../ui';

/**
 * The whole logging flow: pick a photo, let Claude read it, correct it with
 * dropdowns, save.
 *
 * Correction is the point of the confirm step, not a formality — the model's portion
 * estimate is the weakest number in the chain, so everything the user can fix is one
 * tap away and the totals update live as they change it.
 */
export default function LogMealScreen({ onDone, onCancel }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('choose');
  const [mealType, setMealType] = useState(guessMealType());
  const [hint, setHint] = useState('');
  const [photo, setPhoto] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');

  // Per-item portion and weight overrides, and the answer chosen for each question.
  const [itemStates, setItemStates] = useState({});
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  // Meals already logged, so a repeat can skip the camera and the API call entirely.
  const [recent, setRecent] = useState([]);
  // Set when replaying a past meal — its photo is already in Storage, so it gets
  // referenced rather than uploaded again.
  const [reusedPhotoUrl, setReusedPhotoUrl] = useState(null);
  // A note typed after seeing the result, to re-run the analysis with context the
  // photo could not carry.
  const [correction, setCorrection] = useState('');
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setRecent, 60);
  }, [user]);

  // One entry per distinct meal, most recent first. Eating the same breakfast all
  // week should offer one row, not seven identical ones.
  const repeatable = useMemo(() => {
    const seen = new Map();
    for (const meal of recent) {
      if (!meal.items?.length) continue;
      const key = meal.name?.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.set(key, meal);
    }
    return [...seen.values()].slice(0, 8);
  }, [recent]);

  const resolved = useMemo(() => {
    if (!analysis?.items) return null;
    return resolveMeal(analysis.items, itemStates, analysis.questions, answers);
  }, [analysis, itemStates, answers]);

  async function pick(fromCamera) {
    setError('');
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          fromCamera
            ? 'Noodle needs camera access to photograph a meal.'
            : 'Noodle needs photo access to read a picture you already took.'
        );
        return;
      }

      const options = { quality: 0.7, base64: true, mediaTypes: 'images' };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled) return;
      await analyze(result.assets[0]);
    } catch (caught) {
      setError(caught.message ?? 'Could not open the camera.');
    }
  }

  /**
   * Re-run the analysis on the same photo with a correction the user has typed.
   *
   * The dropdowns can only scale what the model already found; they cannot tell it
   * that half the food was outside the frame. "There were two slices, this is half
   * of one" is a four-fold error no portion control can reach, and re-analysing with
   * that sentence is both more accurate and easier than doing the arithmetic.
   */
  async function reanalyze() {
    if (!photo?.base64 || !correction.trim()) return;
    setReanalyzing(true);
    setError('');
    try {
      const combined = [hint.trim(), correction.trim()].filter(Boolean).join('. ');
      const data = await analyzeMealPhoto({
        imageBase64: photo.base64,
        mimeType: photo.mimeType,
        mealType,
        hint: combined,
      });
      if (data.isFood) {
        applyAnalysis(data);
        setHint(combined);
        setCorrection('');
      }
    } catch (caught) {
      setError(caught.message ?? 'Could not re-analyse that photo.');
    } finally {
      setReanalyzing(false);
    }
  }

  /** Load an analysis result into the confirm screen's editable state. */
  function applyAnalysis(data) {
    setAnalysis(data);
    setItemStates(
      Object.fromEntries(data.items.map((item) => [item.id, { portion: 1, grams: item.grams }]))
    );
    // Pre-select each question's most likely answer so the totals are usable
    // immediately; the user only touches the ones the model guessed wrong.
    setAnswers(
      Object.fromEntries(
        data.questions.map((question) => [
          question.id,
          Math.max(question.options.findIndex((option) => option.isDefault), 0),
        ])
      )
    );
  }

  async function analyze(asset) {
    setPhase('analyzing');
    setError('');
    try {
      const image = await prepareImage(asset);
      setPhoto(image);

      const data = await analyzeMealPhoto({
        imageBase64: image.base64,
        mimeType: image.mimeType,
        mealType,
        hint: hint.trim(),
      });

      if (!data.isFood) {
        setPhase('notfood');
        return;
      }

      applyAnalysis(data);
      setPhase('confirm');
    } catch (caught) {
      setError(caught.message ?? 'Could not analyse that photo.');
      setPhase('choose');
    }
  }

  /**
   * Replay a previously logged meal.
   *
   * Because `grams` on a saved item is the original estimate rather than the eaten
   * weight, restoring the saved answers and portion states through resolveMeal
   * reproduces the same totals exactly — and every dropdown still works, so a
   * slightly different portion this time is one tap away.
   */
  function relog(meal) {
    setAnalysis({
      isFood: true,
      mealName: meal.name,
      items: meal.items,
      questions: meal.questions ?? [],
      notes: '',
    });
    setItemStates(
      meal.itemStates ??
        Object.fromEntries(meal.items.map((item) => [item.id, { portion: 1, grams: item.grams }]))
    );
    setAnswers(meal.answers ?? {});
    setReusedPhotoUrl(meal.photoUrl ?? null);
    setPhoto(null);
    setPhase('confirm');
  }

  async function save() {
    if (!resolved) return;
    setSaving(true);
    try {
      const mealId = await saveMeal(user.uid, {
        dayKey: dayKey(),
        mealType,
        name: analysis.mealName,
        loggedAt: new Date().toISOString(),
        items: resolved.items.map((item) => ({
          id: item.id,
          label: item.label,
          // Both weights are kept: `grams` is the model's estimate, which is what
          // "log this again" replays from, and `resolvedGrams` is what was eaten.
          grams: Math.round(item.grams),
          gramsLow: item.gramsLow,
          gramsHigh: item.gramsHigh,
          resolvedGrams: Math.round(item.resolvedGrams),
          per100g: item.per100g,
          source: item.source,
          confidence: item.confidence,
          macros: item.macros,
        })),
        questions: analysis.questions,
        answers,
        itemStates,
        totals: resolved.totals,
        notes: analysis.notes ?? '',
        hint: hint.trim(),
        // A replayed meal points at the original's photo rather than duplicating it.
        ...(reusedPhotoUrl ? { photoUrl: reusedPhotoUrl } : {}),
      });

      // Close the screen as soon as the meal is in Firestore. The photo is
      // decoration for the history list, and it used to be awaited here — so a
      // stalled upload (Storage has no built-in timeout) left the save button
      // spinning forever on a meal that had already been logged successfully.
      onDone();

      if (photo?.uri) {
        uploadPhotoInBackground(user.uid, mealId, photo.uri);
      }
    } catch (caught) {
      Alert.alert('Could not save', caught.message ?? 'Something went wrong.');
      setSaving(false);
    }
  }

  function setItemState(itemId, patch) {
    setItemStates((previous) => ({ ...previous, [itemId]: { ...previous[itemId], ...patch } }));
  }

  // --- Render ---------------------------------------------------------------

  if (phase === 'analyzing') {
    return (
      <View style={styles.centered}>
        {photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.analyzingPhoto} /> : null}
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.analyzingText}>Reading your plate…</Text>
        <Text style={styles.analyzingHint}>
          Identifying each item and looking up its nutrition. Takes a few seconds.
        </Text>
      </View>
    );
  }

  if (phase === 'notfood') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Empty
          title="That doesn't look like food"
          body="Point the camera at the plate, bowl or packet and try again."
        />
        <Button title="Try another photo" onPress={() => setPhase('choose')} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
      </ScrollView>
    );
  }

  if (phase === 'confirm' && analysis && resolved) {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{analysis.mealName}</Text>

        <Card style={styles.totalsCard}>
          <Text style={styles.totalCalories}>{Math.round(resolved.totals.calories)}</Text>
          <Text style={styles.totalCaloriesLabel}>calories</Text>
          <View style={styles.totalMacros}>
            <MacroChip label="Protein" value={resolved.totals.protein} color={colors.protein} />
            <MacroChip label="Carbs" value={resolved.totals.carbs} color={colors.carbs} />
            <MacroChip label="Fat" value={resolved.totals.fat} color={colors.fat} />
          </View>
        </Card>

        {analysis.notes ? <Text style={styles.notes}>{analysis.notes}</Text> : null}

        {photo?.base64 ? (
          <Card>
            <Field
              label="Got something wrong?"
              placeholder="e.g. there were 2 slices, this is half of one"
              value={correction}
              onChangeText={setCorrection}
              multiline
              hint="Tell it what the photo couldn't show and it will estimate again. The dropdowns below only scale what it already found — this can change what it found."
            />
            <Button
              title="Look again with this note"
              variant="secondary"
              onPress={reanalyze}
              loading={reanalyzing}
              disabled={!correction.trim()}
            />
          </Card>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {analysis.questions.length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>A few quick questions</Text>
            <Text style={styles.sectionSub}>
              These are the things the photo can't show. Answering them is what makes the number
              worth trusting.
            </Text>
            {analysis.questions.map((question) => (
              <Card key={question.id}>
                <Dropdown
                  label={question.question}
                  hint={question.appliesTo ? `Affects: ${question.appliesTo}` : 'Affects the whole meal'}
                  value={answers[question.id]}
                  options={question.options.map((option, index) => ({
                    label: option.label,
                    value: index,
                    hint: describeOption(option),
                  }))}
                  onChange={(value) =>
                    setAnswers((previous) => ({ ...previous, [question.id]: value }))
                  }
                />
              </Card>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionHeading}>What's on the plate</Text>
        {resolved.items.map((item) => {
          const state = itemStates[item.id] ?? {};
          return (
            <Card key={item.id}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemCalories}>{Math.round(item.macros.calories)} kcal</Text>
              </View>

              <View style={styles.itemMeta}>
                <Pill tone={item.source.type === 'usda' ? 'good' : 'warn'}>
                  {item.source.type === 'usda' ? 'USDA' : 'Estimated'}
                </Pill>
                <Text style={[styles.confidence, { color: confidenceColor[item.confidence] }]}>
                  {item.confidence} confidence
                </Text>
              </View>
              <Text style={styles.itemSource}>{item.source.description}</Text>

              <Dropdown
                label="How much did you eat?"
                value={state.portion ?? 1}
                options={PORTION_CHOICES}
                onChange={(portion) => setItemState(item.id, { portion })}
              />

              <Dropdown
                label="Portion size on the plate"
                hint={`Claude estimated ${item.grams} g (range ${item.gramsLow}–${item.gramsHigh} g)`}
                value={state.grams ?? item.grams}
                options={gramOptions(item)}
                onChange={(grams) => setItemState(item.id, { grams })}
              />

              <Text style={styles.itemMacros}>
                {Math.round(item.resolvedGrams)} g · {Math.round(item.macros.protein)} g protein ·{' '}
                {Math.round(item.macros.carbs)} g carbs · {Math.round(item.macros.fat)} g fat
              </Text>
            </Card>
          );
        })}

        <Dropdown
          label="Meal"
          value={mealType}
          options={MEAL_TYPES.map((type) => ({ label: capitalise(type), value: type }))}
          onChange={setMealType}
        />

        <Button title="Log this meal" onPress={save} loading={saving} />
        <Button title="Start over" variant="ghost" onPress={() => setPhase('choose')} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Log a meal</Text>
      <Text style={styles.subtitle}>Photograph it and Noodle works out the rest.</Text>

      <Card>
        <Text style={styles.fieldLabel}>Which meal is this?</Text>
        <Segmented
          options={MEAL_TYPES.map((type) => ({ label: capitalise(type), value: type }))}
          value={mealType}
          onChange={setMealType}
          style={{ marginBottom: spacing.md }}
        />

        <Field
          label="Anything the photo won't show? (optional)"
          placeholder="e.g. cooked in butter, large bowl"
          value={hint}
          onChangeText={setHint}
          hint="A few words here noticeably improves the estimate."
        />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Take a photo" onPress={() => pick(true)} />
      <View style={{ height: spacing.sm }} />
      <Button title="Choose from library" variant="secondary" onPress={() => pick(false)} />

      {repeatable.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Log it again</Text>
          <Text style={styles.sectionSub}>
            Something you've eaten before, with no photo and no waiting.
          </Text>
          {repeatable.map((meal) => (
            <Pressable key={meal.id} onPress={() => relog(meal)}>
              <Card style={styles.repeatCard}>
                {meal.photoUrl ? (
                  <Image source={{ uri: meal.photoUrl }} style={styles.repeatPhoto} />
                ) : (
                  <View style={[styles.repeatPhoto, styles.repeatPhotoEmpty]}>
                    <Text style={styles.repeatPhotoEmptyText}>🍽</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.repeatName} numberOfLines={1}>
                    {meal.name}
                  </Text>
                  <Text style={styles.repeatMeta}>
                    {Math.round(meal.totals?.calories ?? 0)} kcal ·{' '}
                    {Math.round(meal.totals?.protein ?? 0)} g protein
                  </Text>
                </View>
                <Text style={styles.repeatChevron}>›</Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <Button title="Cancel" variant="ghost" onPress={onCancel} />
    </ScrollView>
  );
}

/**
 * Attach a photo to an already-saved meal, without the UI waiting on it.
 *
 * Deliberately detached from component state: the log screen has already closed by
 * the time this runs, so there is nothing to update and nothing to block. The photo
 * appearing a few seconds late in the history list is invisible; a hung upload
 * holding the whole screen hostage was not.
 */
async function uploadPhotoInBackground(uid, mealId, uri) {
  try {
    const blob = await uriToBlob(uri);
    const url = await Promise.race([
      uploadMealPhoto(uid, mealId, blob),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('photo upload timed out')), 60_000)
      ),
    ]);
    await saveMeal(uid, { id: mealId, photoUrl: url });
  } catch (error) {
    // The meal itself is safe; losing its picture is not worth surfacing.
    console.warn('photo upload failed', error);
  }
}

function MacroChip({ label, value, color }) {
  return (
    <View style={styles.macroChip}>
      <Text style={[styles.macroChipValue, { color }]}>{Math.round(value)}g</Text>
      <Text style={styles.macroChipLabel}>{label}</Text>
    </View>
  );
}

/** Describe an answer's nutritional consequence so the choice is informed. */
function describeOption(option) {
  const parts = [];
  if (option.calorieDelta) {
    parts.push(`${option.calorieDelta > 0 ? '+' : ''}${Math.round(option.calorieDelta)} kcal`);
  }
  if (option.gramsMultiplier && option.gramsMultiplier !== 1) {
    parts.push(`×${option.gramsMultiplier} portion`);
  }
  return parts.join(' · ');
}

/**
 * Weight choices around the model's estimate.
 * A free-text gram field is precision nobody has — offering the estimate plus steps
 * either side of it covers the real correction ("that was bigger than it looks")
 * in one tap.
 */
function gramOptions(item) {
  const base = item.grams;

  // The estimate itself goes in unrounded. Rounding it to the nearest 5 would leave
  // the dropdown with no option matching its own initial value, which renders as an
  // empty "Choose…" on a field that is in fact already set.
  const values = new Set([base]);
  for (const step of [0.5, 0.75, 1.25, 1.5, 2]) {
    const rounded = Math.round((base * step) / 5) * 5;
    if (rounded > 0) values.add(rounded);
  }

  return [...values]
    .sort((a, b) => a - b)
    .map((grams) => ({
      label: `${grams} g`,
      value: grams,
      hint: grams === base ? "Claude's estimate" : undefined,
    }));
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },

  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.xs },
  subtitle: { fontSize: fonts.body, color: colors.inkSoft, marginBottom: spacing.lg },

  analyzingPhoto: {
    width: 180,
    height: 180,
    borderRadius: radius,
    marginBottom: spacing.xl,
    resizeMode: 'cover',
  },
  analyzingText: {
    fontSize: fonts.big,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.lg,
  },
  analyzingHint: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
    lineHeight: 20,
  },

  totalsCard: { alignItems: 'center', paddingVertical: spacing.xl },
  totalCalories: { fontSize: fonts.hero + 8, fontWeight: '800', color: colors.ink },
  totalCaloriesLabel: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalMacros: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.xl },
  macroChip: { alignItems: 'center' },
  macroChipValue: { fontSize: fonts.big, fontWeight: '700' },
  macroChipLabel: { fontSize: fonts.tiny, color: colors.inkSoft, textTransform: 'uppercase' },

  notes: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    fontStyle: 'italic',
    marginBottom: spacing.md,
    lineHeight: 20,
  },

  sectionHeading: {
    fontSize: fonts.big,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionSub: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md, lineHeight: 20 },

  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  itemLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, flex: 1 },
  itemCalories: { fontSize: fonts.body, fontWeight: '700', color: colors.primary },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  confidence: { fontSize: fonts.tiny, fontWeight: '600', textTransform: 'capitalize' },
  itemSource: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs, marginBottom: spacing.md },
  itemMacros: { fontSize: fonts.small, color: colors.inkSoft },

  repeatCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  repeatPhoto: { width: 48, height: 48, borderRadius: radius - 6 },
  repeatPhotoEmpty: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  repeatPhotoEmptyText: { fontSize: 22 },
  repeatName: { fontSize: fonts.body, fontWeight: '600', color: colors.ink },
  repeatMeta: { fontSize: fonts.small, color: colors.inkSoft, marginTop: 2 },
  repeatChevron: { fontSize: fonts.title, color: colors.inkSoft },

  fieldLabel: {
    fontSize: fonts.small,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: spacing.xs,
  },
  error: {
    fontSize: fonts.small,
    color: colors.danger,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
});
