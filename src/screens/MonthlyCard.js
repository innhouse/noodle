import { StyleSheet, Text, View } from 'react-native';

import { BarChart } from '../charts';
import { formatDuration, formatPaceMin, monthlySummary, monthlyTotals } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

/**
 * A year of months: minutes, kilometres run and walked, sessions. The current
 * month is marked as partial so a low number three days in doesn't read as a
 * bad month. Optional targets from Settings tick or cross each month.
 */
export default function MonthlyCard({ workouts, targets }) {
  const months = monthlyTotals(workouts, targets ?? {}, 12);
  if (!months.some((m) => m.sessions > 0)) return null;
  const bars = [...months].reverse();
  const { ytd, average } = monthlySummary(months);

  return (
    <Card>
      <Text style={styles.title}>Monthly totals</Text>
      <Text style={styles.body}>
        Kilometres run per month, last twelve months. Pace is min/km across the month’s runs,
        weighted by distance.
      </Text>
      <BarChart
        bars={bars.map((m) => ({ label: m.label, value: m.runKm }))}
        target={targets?.runKm > 0 ? targets.runKm : null}
        format={(v) => `${Math.round(v)}`}
        height={120}
      />

      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Min</Text>
        <Text style={[styles.cell, styles.headText]}>Run km</Text>
        <Text style={[styles.cell, styles.headText]}>Pace</Text>
        <Text style={[styles.cell, styles.headText]}>Walk km</Text>
        <Text style={[styles.cell, styles.headText]}>Sess.</Text>
      </View>
      {months.map((m) => (
        <View key={m.month} style={styles.row}>
          <Text style={[styles.cell, styles.month]}>
            {m.label}
            {m.current ? <Text style={styles.partial}> so far</Text> : null}
          </Text>
          <Text style={[styles.cell, tone(m.met.minutes)]}>
            {m.met.minutes != null ? (m.met.minutes ? '✓ ' : '') : ''}
            {formatDuration(m.minutes)}
          </Text>
          <Text style={[styles.cell, tone(m.met.runKm)]}>
            {m.met.runKm != null ? (m.met.runKm ? '✓ ' : '') : ''}
            {m.runKm}
          </Text>
          <Text style={styles.cell}>{formatPaceMin(m.pace)}</Text>
          <Text style={styles.cell}>{m.walkKm}</Text>
          <Text style={styles.cell}>{m.sessions}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.summary]}>
        <Text style={[styles.cell, styles.month]}>{new Date().getFullYear()} to date</Text>
        <Text style={[styles.cell, styles.summaryText]}>{formatDuration(ytd.minutes)}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{ytd.runKm}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{formatPaceMin(ytd.pace)}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{ytd.walkKm}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{ytd.sessions}</Text>
      </View>
      <View style={[styles.row, styles.summary]}>
        <Text style={[styles.cell, styles.month]}>
          Monthly avg
          <Text style={styles.partial}> ({average.months} mo)</Text>
        </Text>
        <Text style={[styles.cell, styles.summaryText]}>{formatDuration(average.minutes)}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{average.runKm}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{formatPaceMin(average.pace)}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{average.walkKm}</Text>
        <Text style={[styles.cell, styles.summaryText]}>{average.sessions}</Text>
      </View>
      {targets?.minutes > 0 || targets?.runKm > 0 ? (
        <Text style={styles.hint}>Ticks mark months that reached the targets in Settings → Training.</Text>
      ) : null}
    </Card>
  );
}

function tone(met) {
  if (met == null) return null;
  return { color: met ? colors.primary : colors.accent, fontWeight: '700' };
}

const styles = StyleSheet.create({
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  body: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs, marginBottom: spacing.sm },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.line },
  head: { marginTop: spacing.md, borderBottomColor: colors.inkSoft },
  headText: { color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  cell: { flex: 1, fontSize: fonts.tiny, color: colors.ink, textAlign: 'right' },
  month: { flex: 1.5, textAlign: 'left', fontWeight: '600' },
  partial: { color: colors.inkSoft, fontWeight: '400' },
  summary: { backgroundColor: colors.bg, borderBottomWidth: 0, marginTop: 2 },
  summaryText: { fontWeight: '700' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});
