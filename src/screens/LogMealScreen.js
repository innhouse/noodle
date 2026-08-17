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
import { addDays, dayKey, formatDayLabel, guessMealType, MEAL_TYPES } from '../lib/dates';
import { prepareImage, uriToBlob } from '../lib/image';
import {
  perMealProtein,
  PORTION_CHOICES,
  resolveMeal,
  scaleToKnownCalories,
} from '../lib/nutrition';
import {
  analyzeMealPhoto,
  deleteMeal,
  saveMeal,
  uploadMealPhoto,
  watchRecentMeals,
} from '../lib/store';
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
// Matches MAX_IMAGES in the Cloud Function. More photos cost tokens without making
// the estimate better.
const MAX_PHOTOS = 6;

export default function LogMealScreen({ onDone, onCancel, editMeal }) {
  const { user, targets } = useAuth();
  const [phase, setPhase] = useState(editMeal ? 'confirm' : 'choose');
  // Set when correcting an already-logged meal, so saving updates it in place
  // rather than adding a second copy of the same food to the day.
  const [editingId, setEditingId] = useState(editMeal?.id ?? null);
  const [mealType, setMealType] = useState(guessMealType());
  // Which day the meal belongs to. Defaults to today, but a meal eaten yesterday and
  // logged this morning belongs to yesterday, not to the day you got round to it.
  const [logDay, setLogDay] = useState(dayKey());
  const [hint, setHint] = useState('');
  // One meal can be several photos — a hotel breakfast is rarely a single plate.
  const [photos, setPhotos] = useState([]);
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
  // Whole past meals chosen to repeat, keyed by meal id.
  const [pickedMeals, setPickedMeals] = useState(new Map());
  const [mealSearch, setMealSearch] = useState('');
  // A calorie figure the user actually knows — from a menu or a packet — which the
  // estimate gets rescaled to match.
  const [knownCalories, setKnownCalories] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setRecent, 60);
  }, [user]);

  /**
   * One entry per distinct meal, most recent first.
   *
   * Eating the same breakfast all week should offer one row, not seven identical
   * ones. The list is capped for length, so searching widens it to everything —
   * otherwise a meal from a few days ago simply vanishes with no way to reach it.
   */
  const repeatable = useMemo(() => {
    const seen = new Map();
    for (const meal of recent) {
      if (!meal.items?.length) continue;
      const key = meal.name?.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.set(key, meal);
    }
    const all = [...seen.values()];
    const needle = mealSearch.trim().toLowerCase();
    if (!needle) return all.slice(0, 20);

    // Match the meal's name or any food inside it, so "fruit" finds a breakfast
    // whose name never mentions it.
    return all.filter(
      (meal) =>
        meal.name?.toLowerCase().includes(needle) ||
        (meal.items ?? []).some((item) => item.label?.toLowerCase().includes(needle))
    );
  }, [recent, mealSearch]);

  function toggleMeal(meal) {
    setPickedMeals((previous) => {
      const next = new Map(previous);
      if (next.has(meal.id)) next.delete(meal.id);
      else next.set(meal.id, meal);
      return next;
    });
  }

  /**
   * Turn everything chosen — whole meals and loose foods — into one new meal.
   *
   * Meals contribute all their items, so picking yesterday's breakfast and a coffee
   * gives one entry containing both, rather than forcing two separate logs.
   */
  function buildFromPicked() {
    const fromMeals = [...pickedMeals.values()].flatMap((meal) => meal.items ?? []);
    const items = [...fromMeals].map((item, index) => ({
      ...item,
      // Ids have to be unique within the new meal; the originals came from
      // different meals and would collide.
      id: `item-${index}`,
    }));

    setEditingId(null);
    setAnalysis({
      isFood: true,
      mealName: items.map((item) => item.label).join(', '),
      items,
      questions: [],
      notes: '',
    });
    setItemStates(
      Object.fromEntries(items.map((item) => [item.id, { portion: 1, grams: item.grams }]))
    );
    setAnswers({});
    setPickedMeals(new Map());
    setPhotos([]);
    setPhase('confirm');
  }

  const proteinTarget = perMealProtein(targets, mealType);

  const resolved = useMemo(() => {
    if (!analysis?.items) return null;
    const base = resolveMeal(analysis.items, itemStates, analysis.questions, answers);
    return scaleToKnownCalories(base, Number(knownCalories) || null);
  }, [analysis, itemStates, answers, knownCalories]);

  /**
   * Add photos to the meal without analysing yet, so several plates can be
   * collected before a single call covers all of them at once.
   */
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

      const remaining = MAX_PHOTOS - photos.length;
      const options = { quality: 0.7, base64: true, mediaTypes: 'images' };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            ...options,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
          });

      if (result.canceled) return;

      const prepared = await Promise.all(
        result.assets.slice(0, remaining).map((asset) => prepareImage(asset))
      );
      setPhotos((previous) => [...previous, ...prepared]);
    } catch (caught) {
      setError(caught.message ?? 'Could not open the camera.');
    }
  }

  function removePhoto(index) {
    setPhotos((previous) => previous.filter((_, n) => n !== index));
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
    if (photos.length === 0 || !correction.trim()) return;
    setReanalyzing(true);
    setError('');
    try {
      const combined = [hint.trim(), correction.trim()].filter(Boolean).join('. ');
      const data = await analyzeMealPhoto({
        images: photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
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

  async function analyze() {
    if (photos.length === 0) return;
    setPhase('analyzing');
    setError('');
    try {
      const data = await analyzeMealPhoto({
        images: photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
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
  function loadSavedMeal(meal) {
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
    setMealType(meal.mealType ?? guessMealType());
    setPhotos([]);
    setPhase('confirm');
  }

  useEffect(() => {
    if (editMeal) loadSavedMeal(editMeal);
  }, [editMeal]);

  async function removeMeal() {
    Alert.alert('Delete this meal?', analysis?.mealName ?? '', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(user.uid, editingId);
          onDone();
        },
      },
    ]);
  }

  async function save() {
    if (!resolved) return;
    setSaving(true);
    try {
      const mealId = await saveMeal(user.uid, {
        // Editing keeps the meal's identity and its place in the day; only a new
        // log gets today's date and the current time.
        ...(editingId
          ? { id: editingId, dayKey: editMeal.dayKey, loggedAt: editMeal.loggedAt }
          : { dayKey: logDay, loggedAt: loggedAtFor(logDay) }),
        mealType,
        name: analysis.mealName,
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

      // Only the first photo is kept as the meal's thumbnail; the rest did their
      // job at analysis time and storing them all would cost space for nothing.
      if (photos[0]?.uri) {
        uploadPhotoInBackground(user.uid, mealId, photos[0].uri);
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
        {photos[0]?.uri ? (
          <Image source={{ uri: photos[0].uri }} style={styles.analyzingPhoto} />
        ) : null}
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.analyzingText}>
          {photos.length > 1 ? `Reading all ${photos.length} photos…` : 'Reading your plate…'}
        </Text>
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

          {proteinTarget ? (
            <Text
              style={[
                styles.proteinTarget,
                { color: resolved.totals.protein >= proteinTarget ? colors.primary : colors.accent },
              ]}
            >
              {resolved.totals.protein >= proteinTarget
                ? `Hits your ${proteinTarget} g protein target for this meal`
                : `${Math.round(proteinTarget - resolved.totals.protein)} g short of ${proteinTarget} g for this meal`}
            </Text>
          ) : null}
        </Card>

        {analysis.notes ? <Text style={styles.notes}>{analysis.notes}</Text> : null}

        <Card>
          <Field
            label="Know the actual calories?"
            placeholder="e.g. 540 from the menu"
            value={knownCalories}
            onChangeText={setKnownCalories}
            keyboardType="number-pad"
            hint="A figure from a menu or a packet beats any estimate. Everything below rescales to match it."
          />
          {resolved?.scaledBy ? (
            <Text style={styles.scaledNote}>
              Scaled to {Math.round(Number(knownCalories))} kcal —{' '}
              {resolved.scaledBy > 1 ? 'up' : 'down'} by{' '}
              {Math.abs(Math.round((resolved.scaledBy - 1) * 100))}% from the estimate.
            </Text>
          ) : null}
        </Card>

        {photos.length > 0 ? (
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
                // Meals logged before the range fields existed have no low/high, and
                // printing them regardless produced "range undefined–undefined g".
                hint={
                  item.gramsLow && item.gramsHigh
                    ? `Claude estimated ${item.grams} g (range ${item.gramsLow}–${item.gramsHigh} g)`
                    : `Claude estimated ${item.grams} g`
                }
                value={state.grams ?? item.grams}
                options={gramOptions(item)}
                onChange={(grams) => setItemState(item.id, { grams })}
              />

              <Text style={styles.itemMacros}>
                {Math.round(item.resolvedGrams)} g · {Math.round(item.macros.protein)} g protein ·{' '}
                {Math.round(item.macros.carbs)} g carbs · {Math.round(item.macros.fat)} g fat
              </Text>

              {outsideEstimate(item) ? (
                <Text style={styles.itemWarning}>
                  {Math.round(item.resolvedGrams)} g is well outside the {item.gramsLow}–
                  {item.gramsHigh} g Claude estimated. The two portion controls multiply each
                  other, so check they aren't stacking — if you mean "twice as much", change one
                  of them, not both.
                </Text>
              ) : null}
            </Card>
          );
        })}

        <Dropdown
          label="Meal"
          value={mealType}
          options={MEAL_TYPES.map((type) => ({ label: capitalise(type), value: type }))}
          onChange={setMealType}
        />

        {!editingId ? (
          <Dropdown
            label="Which day?"
            value={logDay}
            options={recentDays()}
            onChange={setLogDay}
            hint="Logging last night's dinner this morning? Put it on the right day."
          />
        ) : null}

        <Button
          title={editingId ? 'Save changes' : 'Log this meal'}
          onPress={save}
          loading={saving}
        />
        {editingId ? (
          <>
            <Button title="Delete this meal" variant="danger" onPress={removeMeal} />
            <Button title="Cancel" variant="ghost" onPress={onCancel} />
          </>
        ) : (
          <Button title="Start over" variant="ghost" onPress={() => setPhase('choose')} />
        )}
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

      {photos.length > 0 ? (
        <Card>
          <Text style={styles.fieldLabel}>
            {photos.length} photo{photos.length === 1 ? '' : 's'} of this meal
          </Text>
          <View style={styles.thumbRow}>
            {photos.map((item, index) => (
              <Pressable key={item.uri} onPress={() => removePhoto(index)}>
                <Image source={{ uri: item.uri }} style={styles.thumb} />
                <View style={styles.thumbRemove}>
                  <Text style={styles.thumbRemoveText}>×</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldHint}>
            Tap a photo to remove it. Several plates from one sitting belong together —
            analysing them at once stops the same dish being counted twice.
          </Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {photos.length > 0 ? (
        <>
          <Button title={`Analyse ${photos.length === 1 ? 'this photo' : 'these photos'}`} onPress={analyze} />
          <View style={{ height: spacing.sm }} />
        </>
      ) : null}

      {photos.length < MAX_PHOTOS ? (
        <>
          <Button
            title={photos.length ? 'Add another photo' : 'Take a photo'}
            variant={photos.length ? 'secondary' : 'primary'}
            onPress={() => pick(true)}
          />
          <View style={{ height: spacing.sm }} />
          <Button title="Choose from library" variant="secondary" onPress={() => pick(false)} />
        </>
      ) : null}

      {recent.length > 0 ? (
        <>
          <Text style={styles.sectionHeading}>Meals you've had before</Text>
          <Text style={styles.sectionSub}>
            Tick as many as you like — they combine into a single {mealType}. No photo, no
            waiting.
          </Text>

          <Field
            placeholder="Search meals and foods…"
            value={mealSearch}
            onChangeText={setMealSearch}
            autoCapitalize="none"
          />
          {repeatable.length === 0 ? (
            <Text style={styles.sectionSub}>Nothing matches that.</Text>
          ) : null}

          {repeatable.map((meal) => {
            const isPicked = pickedMeals.has(meal.id);
            return (
              <Pressable key={meal.id} onPress={() => toggleMeal(meal)}>
                <Card style={[styles.pantryRow, isPicked && styles.pantryRowPicked]}>
                  <Text style={styles.pantryCheck}>{isPicked ? '☑' : '☐'}</Text>
                  {meal.photoUrl ? (
                    <Image source={{ uri: meal.photoUrl }} style={styles.repeatPhoto} />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pantryLabel} numberOfLines={1}>
                      {meal.name}
                    </Text>
                    <Text style={styles.pantryMeta}>
                      {Math.round(meal.totals?.calories ?? 0)} kcal ·{' '}
                      {Math.round(meal.totals?.protein ?? 0)} g protein ·{' '}
                      {formatDayLabel(meal.dayKey)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}

          {pickedMeals.size > 0 ? (
            <Button
              title={`Add ${pickedMeals.size} as ${mealType}`}
              onPress={buildFromPicked}
            />
          ) : null}
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

/**
 * True when the eaten weight has drifted far past what the photo supported.
 *
 * The portion controls compose — grams × question multipliers × how-much-you-ate —
 * which is correct but easy to double-apply. Claude's own gramsHigh is the honest
 * ceiling for what the photo showed, so 50% beyond it means the number came from
 * the controls rather than the food, and is worth a second look before it lands in
 * the day's total.
 */
function outsideEstimate(item) {
  if (!item.gramsHigh || !item.gramsLow) return false;
  return item.resolvedGrams > item.gramsHigh * 1.5 || item.resolvedGrams < item.gramsLow * 0.5;
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

/** The last week, for putting a meal on the day it was actually eaten. */
function recentDays() {
  return Array.from({ length: 7 }, (_, offset) => {
    const key = addDays(dayKey(), -offset);
    return { label: formatDayLabel(key), value: key };
  });
}

/**
 * A sensible timestamp for a meal logged after the fact.
 *
 * Backdated meals get midday rather than the current time, so last night's dinner
 * does not sort as though it were eaten at 9am. Today's meals keep the real clock.
 */
function loggedAtFor(day) {
  if (day === dayKey()) return new Date().toISOString();
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12, 0, 0).toISOString();
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
  proteinTarget: {
    fontSize: fonts.small,
    fontWeight: '700',
    marginTop: spacing.lg,
    textAlign: 'center',
  },

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
  scaledNote: { fontSize: fonts.small, color: colors.primary, fontWeight: '600', lineHeight: 20 },
  itemWarning: {
    fontSize: fonts.small,
    color: colors.danger,
    lineHeight: 20,
    marginTop: spacing.sm,
    backgroundColor: colors.dangerSoft,
    padding: spacing.sm,
    borderRadius: radius - 6,
  },

  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: radius - 6 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: { color: '#FFFFFF', fontSize: fonts.small, fontWeight: '700', lineHeight: 18 },

  pantryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  pantryRowPicked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pantryCheck: { fontSize: fonts.big, color: colors.primary },
  pantryLabel: { fontSize: fonts.body, color: colors.ink, fontWeight: '600' },
  pantryMeta: { fontSize: fonts.small, color: colors.inkSoft, marginTop: 2 },

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
