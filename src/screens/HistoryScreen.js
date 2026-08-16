import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel } from '../lib/dates';
import { watchRecentMeals } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty } from '../ui';

export default function HistoryScreen() {
  const { user, targets } = useAuth();
  const [meals, setMeals] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setMeals, 200);
  }, [user]);

  // Roll the flat meal list up into days, newest first.
  const days = useMemo(() => {
    const grouped = new Map();
    for (const meal of meals) {
      const bucket = grouped.get(meal.dayKey) ?? { dayKey: meal.dayKey, calories: 0, protein: 0, count: 0 };
      bucket.calories += meal.totals?.calories ?? 0;
      bucket.protein += meal.totals?.protein ?? 0;
      bucket.count += 1;
      grouped.set(meal.dayKey, bucket);
    }
    return [...grouped.values()].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  }, [meals]);

  const budget = targets.calories;
  const complete = budget ? days.filter((day) => day.count >= 2) : [];
  const average =
    complete.length > 0
      ? complete.reduce((sum, day) => sum + day.calories, 0) / complete.length
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>History</Text>

      {average !== null ? (
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{Math.round(average)}</Text>
          <Text style={styles.summaryLabel}>average calories per logged day</Text>
          <Text style={styles.summaryDetail}>
            Against a {budget} target, across {complete.length} day
            {complete.length === 1 ? '' : 's'} with more than one meal logged.
          </Text>
        </Card>
      ) : null}

      {days.length === 0 ? (
        <Empty title="Nothing logged yet" body="Your logged days will build up here." />
      ) : (
        days.map((day) => {
          const ratio = budget ? Math.min(day.calories / budget, 1.4) : 0;
          const over = budget && day.calories > budget;
          return (
            <View key={day.dayKey} style={styles.dayRow}>
              <Text style={styles.dayLabel}>{formatDayLabel(day.dayKey)}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.min(ratio, 1) * 100}%`,
                      backgroundColor: over ? colors.over : colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.dayCalories}>{Math.round(day.calories)}</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },

  summaryCard: { alignItems: 'center', paddingVertical: spacing.xl },
  summaryValue: { fontSize: 52, fontWeight: '800', color: colors.ink, lineHeight: 58 },
  summaryLabel: { fontSize: fonts.small, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 },
  summaryDetail: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 18,
  },

  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  dayLabel: { fontSize: fonts.small, color: colors.inkSoft, width: 90 },
  barTrack: { flex: 1, height: 10, backgroundColor: colors.line, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  dayCalories: { fontSize: fonts.small, color: colors.ink, fontWeight: '600', width: 52, textAlign: 'right' },
});
