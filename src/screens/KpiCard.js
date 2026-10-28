import { StyleSheet, Text, View } from 'react-native';

import { weeklyKpis } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

const LABELS = { runs: 'Runs', strength: 'Strength', other: 'Other', zoneMin: 'Zone 1 min', yogaMin: 'Yoga min' };

/**
 * The week's mix against the plan: runs, strength sessions and other activity,
 * each as "done / target" with a tick when met, plus the recent weeks as a
 * row of ticks so a streak (or a slide) is visible without reading numbers.
 *
 * Counts sessions, not minutes, because the plan is about showing up for each
 * kind of training; the minutes chart next door covers how much.
 */
export default function KpiCard({ workouts, kpis, history = 8, compact = false }) {
  const weeks = weeklyKpis(workouts, kpis, compact ? 1 : history);
  const current = weeks[0];
  const goals = current.goals;
  const keys = ['runs', 'strength', 'other', 'yogaMin', 'zoneMin'].filter((k) => goals[k] > 0);
  if (!keys.length) return null;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Weekly plan</Text>
        <Text style={[styles.status, { color: current.all ? colors.primary : colors.inkSoft }]}>
          {current.all ? 'On plan' : `${keys.filter((k) => current.met[k]).length} of ${keys.length} met`}
        </Text>
      </View>

      <View style={styles.row}>
        {keys.map((k) => {
          const met = current.met[k];
          return (
            <View key={k} style={[styles.cell, met && styles.cellMet]}>
              <Text style={[styles.cellValue, met && styles.cellValueMet]}>
                {current.counts[k]}
                <Text style={styles.cellGoal}> / {goals[k]}</Text>
              </Text>
              <Text style={[styles.cellLabel, met && styles.cellLabelMet]}>
                {met ? '✓ ' : ''}
                {LABELS[k]}
              </Text>
            </View>
          );
        })}
      </View>

      {!compact ? (
        <View style={styles.history}>
          <View style={styles.historyRow}>
            <Text style={[styles.historyWeek, styles.historyHead]}>Week</Text>
            {keys.map((k) => (
              <Text key={k} style={[styles.historyCell, styles.historyHead]}>
                {LABELS[k]}
              </Text>
            ))}
          </View>
          {weeks.slice(1).map((week) => (
            <View key={week.week} style={styles.historyRow}>
              <Text style={styles.historyWeek}>{week.label}</Text>
              {keys.map((k) => (
                <Text
                  key={k}
                  style={[styles.historyCell, { color: week.met[k] ? colors.primary : colors.accent }]}
                >
                  {week.met[k] ? '✓' : '✗'} {week.counts[k]}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.hint}>Targets are in Settings → Training.</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  status: { fontSize: fonts.small, fontWeight: '700' },

  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  cellMet: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  cellValue: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  cellValueMet: { color: colors.primary },
  cellGoal: { fontSize: fonts.small, fontWeight: '600', color: colors.inkSoft },
  cellLabel: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2, fontWeight: '600' },
  cellLabelMet: { color: colors.primary },

  history: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  historyRow: { flexDirection: 'row', paddingVertical: 4 },
  historyHead: { color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  historyWeek: { flex: 1.4, fontSize: fonts.tiny, color: colors.inkSoft },
  historyCell: { flex: 1, fontSize: fonts.tiny, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});
