import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { addDays, dayKey, formatDayLabel, formatTime, isToday } from '../lib/dates';
import { activityBonus, sumMeals } from '../lib/nutrition';
import { activeEnergyToday, healthSupported, requestHealthAccess } from '../lib/health';
import { deleteMeal, watchMeals } from '../lib/store';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, Card, Empty, MacroBar } from '../ui';

export default function TodayScreen({ onLogMeal, onOpenCoach, onEditMeal }) {
  const { user, profile, targets } = useAuth();
  const [day, setDay] = useState(dayKey());
  const [meals, setMeals] = useState([]);
  const [activeEnergy, setActiveEnergy] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    return watchMeals(user.uid, day, setMeals);
  }, [user, day]);

  useEffect(() => {
    // Only today's burn is meaningful; scrolling back a week should not imply
    // yesterday's activity is being counted.
    if (!healthSupported || !isToday(day)) {
      setActiveEnergy(null);
      return;
    }
    (async () => {
      if (await requestHealthAccess()) setActiveEnergy(await activeEnergyToday());
    })();
  }, [day]);

  const totals = sumMeals(meals);
  const bonus = activityBonus(profile, activeEnergy);
  const budget = (targets.calories ?? 0) + bonus;
  const remaining = budget - totals.calories;
  const overBudget = remaining < 0;

  function confirmDelete(meal) {
    Alert.alert('Delete this meal?', meal.name, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMeal(user.uid, meal.id),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.dayNav}>
        <Pressable onPress={() => setDay(addDays(day, -1))} hitSlop={12}>
          <Text style={styles.dayArrow}>‹</Text>
        </Pressable>
        <Text style={styles.dayLabel}>{formatDayLabel(day)}</Text>
        <Pressable
          onPress={() => setDay(addDays(day, 1))}
          hitSlop={12}
          disabled={isToday(day)}
        >
          <Text style={[styles.dayArrow, isToday(day) && styles.dayArrowDisabled]}>›</Text>
        </Pressable>
      </View>

      {targets.calories === null ? (
        <Card>
          <Empty
            title="Set your targets first"
            body="Noodle needs your height, weight and age to work out a calorie budget. It takes a minute, in Settings."
          />
        </Card>
      ) : (
        <Card style={styles.budgetCard}>
          <Text style={[styles.remaining, overBudget && { color: colors.over }]}>
            {Math.abs(Math.round(remaining))}
          </Text>
          <Text style={styles.remainingLabel}>
            {overBudget ? 'calories over budget' : 'calories left today'}
          </Text>
          <Text style={styles.budgetDetail}>
            {Math.round(totals.calories)} eaten of {Math.round(budget)}
            {bonus > 0 ? ` (${targets.calories} + ${bonus} earned)` : ''}
          </Text>

          {activeEnergy !== null && activeEnergy > 0 ? (
            <Text style={styles.activeEnergy}>
              {Math.round(activeEnergy)} kcal active today
              {bonus === 0 ? ' · not added to your budget' : ''}
            </Text>
          ) : null}

          <View style={styles.macros}>
            <MacroBar
              label="Protein"
              value={totals.protein}
              target={targets.protein}
              color={colors.protein}
            />
            <MacroBar label="Carbs" value={totals.carbs} target={targets.carbs} color={colors.carbs} />
            <MacroBar label="Fat" value={totals.fat} target={targets.fat} color={colors.fat} />
          </View>
        </Card>
      )}

      {isToday(day) ? (
        <>
          <Button title="Log a meal" onPress={onLogMeal} />
          <View style={{ height: spacing.sm }} />
          <Button title="What should I eat next?" variant="secondary" onPress={onOpenCoach} />
        </>
      ) : null}

      <Text style={styles.sectionHeading}>
        {meals.length === 0 ? 'Nothing logged' : `${meals.length} meal${meals.length === 1 ? '' : 's'}`}
      </Text>

      {meals.length === 0 ? (
        <Empty
          title="No meals yet"
          body={isToday(day) ? 'Photograph your next meal to start the day.' : 'Nothing was logged on this day.'}
        />
      ) : (
        meals.map((meal) => (
          <Pressable
            key={meal.id}
            onPress={() => onEditMeal(meal)}
            onLongPress={() => confirmDelete(meal)}
          >
            <Card>
              <View style={styles.mealRow}>
                {meal.photoUrl ? (
                  <Image source={{ uri: meal.photoUrl }} style={styles.mealPhoto} />
                ) : (
                  <View style={[styles.mealPhoto, styles.mealPhotoEmpty]}>
                    <Text style={styles.mealPhotoEmptyText}>🍽</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={styles.mealTitleRow}>
                    <Text style={styles.mealName} numberOfLines={1}>
                      {meal.name}
                    </Text>
                    <Text style={styles.mealCalories}>{Math.round(meal.totals.calories)}</Text>
                  </View>
                  <Text style={styles.mealMeta}>
                    {capitalise(meal.mealType)} · {formatTime(meal.loggedAt)}
                  </Text>
                  <Text style={styles.mealMacros}>
                    {Math.round(meal.totals.protein)}p · {Math.round(meal.totals.carbs)}c ·{' '}
                    {Math.round(meal.totals.fat)}f
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {meals.length > 0 ? (
        <Text style={styles.hint}>Tap a meal to correct it, or long-press to delete.</Text>
      ) : null}
    </ScrollView>
  );
}

function capitalise(text) {
  return (text ?? '').charAt(0).toUpperCase() + (text ?? '').slice(1);
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },

  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dayLabel: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  dayArrow: { fontSize: 34, color: colors.primary, paddingHorizontal: spacing.md, lineHeight: 38 },
  dayArrowDisabled: { color: colors.line },

  budgetCard: { alignItems: 'center', paddingVertical: spacing.xl },
  remaining: { fontSize: 64, fontWeight: '800', color: colors.primary, lineHeight: 70 },
  remainingLabel: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  budgetDetail: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },
  activeEnergy: { fontSize: fonts.tiny, color: colors.accent, marginTop: spacing.xs, fontWeight: '600' },
  macros: { width: '100%', marginTop: spacing.xl },

  sectionHeading: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  mealRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  mealPhoto: { width: 60, height: 60, borderRadius: radius - 4 },
  mealPhotoEmpty: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  mealPhotoEmptyText: { fontSize: 26 },
  mealTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  mealName: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, flex: 1 },
  mealCalories: { fontSize: fonts.body, fontWeight: '700', color: colors.primary, marginLeft: spacing.sm },
  mealMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  mealMacros: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.xs },

  hint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.md },
});
