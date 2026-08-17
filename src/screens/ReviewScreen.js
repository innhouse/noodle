import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { addDays, dayKey } from '../lib/dates';
import { calibrate, mealQuality, qualityLabel } from '../lib/nutrition';
import { kgToLb } from '../lib/units';
import { reviewMeals, watchRecentMeals, watchWeights } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Button, Card, Empty, Pill } from '../ui';

/**
 * What the tracking is actually for: seeing which meals earn their calories and
 * which quietly cost a lot for nothing, across enough days for a pattern to appear.
 */
export default function ReviewScreen() {
  const { user, profile, targets } = useAuth();
  const [meals, setMeals] = useState([]);
  const [weights, setWeights] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setMeals, 200);
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    return watchWeights(user.uid, setWeights);
  }, [user]);

  // Deliberately over all logged meals, not just the last week — the signal only
  // separates from scale noise over a few weeks.
  const check = useMemo(
    () => calibrate({ meals, weights, targets, profile }),
    [meals, weights, targets, profile]
  );

  const since = addDays(dayKey(), -7);
  const recent = useMemo(
    () => meals.filter((meal) => meal.dayKey >= since),
    [meals, since]
  );

  // Both ends matter. Showing only the worst reads as nagging and hides the more
  // useful half — the meals already worth repeating.
  const scored = useMemo(
    () =>
      recent
        .map((meal) => ({ ...meal, score: mealQuality(meal.totals) }))
        .filter((meal) => meal.score !== null)
        .sort((a, b) => b.score - a.score),
    [recent]
  );

  const best = scored.slice(0, 5);
  const worst = [...scored].reverse().slice(0, 5);

  async function run() {
    setLoading(true);
    setError('');
    try {
      const answer = await reviewMeals({
        targets,
        days: 7,
        meals: recent.map((meal) => ({
          dayKey: meal.dayKey,
          mealType: meal.mealType,
          name: meal.name,
          calories: meal.totals?.calories ?? 0,
          protein: meal.totals?.protein ?? 0,
          carbs: meal.totals?.carbs ?? 0,
          fat: meal.totals?.fat ?? 0,
          items: (meal.items ?? []).map((item) => item.label),
        })),
      });
      setText(answer);
    } catch (caught) {
      setError(caught.message ?? 'Could not generate a review.');
    } finally {
      setLoading(false);
    }
  }

  if (recent.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Review</Text>
        <Empty
          title="Nothing to review yet"
          body="Log a few days of meals and this will show you which ones are earning their calories and which aren't."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Review</Text>
      <Text style={styles.subtitle}>
        {recent.length} meals over the last 7 days.
      </Text>

      {text ? (
        <Card>
          <Text style={styles.review}>{text}</Text>
        </Card>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Looking for patterns…</Text>
        </View>
      ) : (
        <Button
          title={text ? 'Review again' : 'Review my week'}
          onPress={run}
          disabled={recent.length < 3}
        />
      )}
      {recent.length < 3 ? (
        <Text style={styles.hint}>Log at least three meals for this to say anything useful.</Text>
      ) : null}

      {check ? (
        <Card style={styles.calibration}>
          <Text style={styles.calibrationTitle}>Reality check</Text>
          <Text style={styles.calibrationBody}>
            Over {check.days} properly logged days you averaged{' '}
            <Text style={styles.bold}>{check.loggedIntake} kcal</Text>, and the scale moved{' '}
            <Text style={styles.bold}>
              {Math.abs(kgToLb(check.observedRate)).toFixed(1)} lb
              {check.observedRate < 0 ? ' down' : ' up'} a week
            </Text>
            .
          </Text>

          {check.gap !== null && Math.abs(check.gap) >= 150 ? (
            <Text style={styles.calibrationBody}>
              {'\n'}That's about{' '}
              <Text style={styles.bold}>{Math.abs(check.gap)} kcal a day</Text>{' '}
              {check.gap > 0 ? 'less progress' : 'more progress'} than your logged numbers
              predict. Either you're eating {check.gap > 0 ? 'more' : 'less'} than the log says,
              or you burn {check.gap > 0 ? 'less' : 'more'} than the equation assumes. The
              measurement can't tell which, and both are common.
            </Text>
          ) : (
            <Text style={styles.calibrationBody}>
              {'\n'}That matches what your logged intake predicts, so your estimates are
              holding up well.
            </Text>
          )}

          <Text style={styles.calibrationBody}>
            {'\n'}Working backwards from the scale, you're burning around{' '}
            <Text style={styles.bold}>{check.impliedBurn} kcal</Text> a day. To hit your goal
            rate, target{' '}
            <Text style={styles.bold}>{check.suggestedTarget} kcal</Text> — that figure comes
            from your own results rather than a formula.
          </Text>

          <Text style={styles.calibrationFooter}>
            Currently targeting {targets.calories}. Change it under Settings → Override the
            numbers if you want to follow this.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.explainer}>
        <Text style={styles.explainerTitle}>What the number means</Text>
        <Text style={styles.explainerBody}>
          Every meal is scored out of 100 on how much nutrition it delivered for what it cost in
          calories. Protein and fibre push it up, added sugar pulls it down.{'\n\n'}
          <Text style={styles.bold}>70+</Text> earns its calories ·{' '}
          <Text style={styles.bold}>45–69</Text> reasonable ·{' '}
          <Text style={styles.bold}>25–44</Text> light on nutrition ·{' '}
          <Text style={styles.bold}>under 25</Text> mostly empty calories{'\n\n'}
          It measures value, not virtue. A steak scores well and so does an apple. A low score
          isn't a food you must never eat — it's one that cost you a lot of your day's budget and
          gave little back.
        </Text>
      </Card>

      <Text style={styles.sectionHeading}>Worth repeating</Text>
      <Text style={styles.sectionSub}>Best value you ate this week.</Text>
      {best.map((meal) => (
        <MealRow key={meal.id} meal={meal} />
      ))}

      <Text style={styles.sectionHeading}>Costing you most</Text>
      <Text style={styles.sectionSub}>Most calories for the least nutrition.</Text>
      {worst.map((meal) => (
        <MealRow key={meal.id} meal={meal} />
      ))}
    </ScrollView>
  );
}

function MealRow({ meal }) {
  const label = qualityLabel(meal.score);
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.mealName} numberOfLines={1}>
          {meal.name}
        </Text>
        <Text style={styles.mealMeta}>
          {Math.round(meal.totals.calories)} kcal · {Math.round(meal.totals.protein)} g protein
        </Text>
        <View style={{ marginTop: spacing.xs }}>
          <Pill tone={label.tone}>{label.text}</Pill>
        </View>
      </View>
      <Text style={[styles.score, { color: scoreColor(meal.score) }]}>{meal.score}</Text>
    </Card>
  );
}

function scoreColor(score) {
  if (score >= 70) return colors.primary;
  if (score >= 45) return colors.inkSoft;
  if (score >= 25) return colors.accent;
  return colors.danger;
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.lg },

  review: { fontSize: fonts.body, color: colors.ink, lineHeight: 26 },
  error: { fontSize: fonts.small, color: colors.danger, marginBottom: spacing.md },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.sm },

  loading: { alignItems: 'center', padding: spacing.lg },
  loadingText: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },

  sectionHeading: {
    fontSize: fonts.big,
    fontWeight: '700',
    color: colors.ink,
    marginTop: spacing.xl,
  },
  sectionSub: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    lineHeight: 20,
    marginBottom: spacing.md,
  },

  calibration: { backgroundColor: colors.accentSoft, borderColor: colors.accent, marginTop: spacing.xl },
  calibrationTitle: { fontSize: fonts.big, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  calibrationBody: { fontSize: fonts.small, color: colors.ink, lineHeight: 21 },
  calibrationFooter: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.md, lineHeight: 18 },

  explainer: { backgroundColor: colors.primarySoft, borderColor: colors.primary, marginTop: spacing.xl },
  explainerTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  explainerBody: { fontSize: fonts.small, color: colors.ink, lineHeight: 21 },
  bold: { fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mealName: { fontSize: fonts.body, fontWeight: '600', color: colors.ink },
  mealMeta: { fontSize: fonts.small, color: colors.inkSoft, marginTop: 2 },
  score: { fontSize: fonts.title, fontWeight: '800' },
});
