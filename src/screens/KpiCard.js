import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { weeklyKpis } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

// 'Cardio' rather than 'Runs': the bucket counts rides and rows alongside runs.
// Zone 2 is the cardio band; 'Above' is time over its top. Both count any session.
const LABELS = { runs: 'Cardio', strength: 'Strength', other: 'Other', walks: 'Walks', zoneMin: 'Zone 1', cardioMin: 'Zone 2', aboveMin: 'Above', yogaMin: 'Yoga' };
// Targets counted in minutes rather than sessions.
const MINUTES = new Set(['zoneMin', 'cardioMin', 'aboveMin', 'yogaMin']);

/**
 * The week's mix against the plan: cardio, strength sessions and other activity,
 * each as "done / target" with a tick when met, plus the recent weeks as a
 * row of ticks so a streak (or a slide) is visible without reading numbers.
 *
 * Counts sessions, not minutes, because the plan is about showing up for each
 * kind of training; the minutes chart next door covers how much.
 */
/** Half sessions read as ½ — "1½" rather than "1.5". */
function formatCount(n) {
  if (n % 1 === 0) return n;
  return `${Math.floor(n) || ''}½`;
}

function KpiCard({ workouts, kpis, history = 8, compact = false }) {
  const weeks = weeklyKpis(workouts, kpis, compact ? 1 : history);
  const current = weeks[0];
  const goals = current.goals;
  const keys = ['runs', 'strength', 'other', 'walks', 'yogaMin', 'zoneMin', 'cardioMin', 'aboveMin'].filter((k) => goals[k] > 0);
  if (!keys.length) return null;
  // The three heart-rate counts, shown whether or not they carry a target.
  const hr = current.counts;
  const hrLine =
    hr.zoneMin || hr.cardioMin || hr.aboveMin
      ? `Heart-rate minutes this week: zone 1 ${hr.zoneMin} · zone 2 ${hr.cardioMin} · above ${hr.aboveMin}`
      : null;

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
              <Text
                style={[styles.cellValue, met && styles.cellValueMet]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCount(current.counts[k])}
              </Text>
              <Text style={styles.cellGoal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                of {goals[k]}
                {MINUTES.has(k) ? ' min' : ''}
              </Text>
              <Text style={[styles.cellLabel, met && styles.cellLabelMet]}>
                {met ? '✓ ' : ''}
                {LABELS[k]}
              </Text>
            </View>
          );
        })}
      </View>

      {hrLine ? <Text style={styles.hrLine}>{hrLine}</Text> : null}

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
                  {week.met[k] ? '✓' : '✗'} {formatCount(week.counts[k])}
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
  cellGoal: { fontSize: fonts.tiny, fontWeight: '600', color: colors.inkSoft },
  cellLabel: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 4, fontWeight: '700' },
  cellLabelMet: { color: colors.primary },

  history: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  historyRow: { flexDirection: 'row', paddingVertical: 4 },
  historyHead: { color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  historyWeek: { flex: 1.4, fontSize: fonts.tiny, color: colors.inkSoft },
  historyCell: { flex: 1, fontSize: fonts.tiny, fontWeight: '700', textAlign: 'center' },
  hrLine: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});

export default memo(KpiCard);
