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
  const year = new Date().getFullYear();

  return (
    <Card>
      <Text style={styles.title}>Monthly totals</Text>
      <Text style={styles.body}>
        Kilometres run per month, last twelve months. Pace, heart rate and beats per km are
        across the month’s runs, weighted by distance and time.
      </Text>
      <BarChart
        bars={bars.map((m) => ({ label: m.label, value: m.runKm }))}
        target={targets?.runKm > 0 ? targets.runKm : null}
        format={(v) => `${Math.round(v)}`}
        height={120}
      />

      <Text style={styles.section}>Running</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Km</Text>
        <Text style={[styles.cell, styles.headText]}>Pace</Text>
        <Text style={[styles.cell, styles.headText]}>Avg HR</Text>
        <Text style={[styles.cell, styles.headText]}>Beats/km</Text>
      </View>
      {months.map((m) => (
        <View key={m.month} style={styles.row}>
          <Text style={[styles.cell, styles.month]}>
            {m.label}
            {m.current ? <Text style={styles.partial}> so far</Text> : null}
          </Text>
          <Text style={[styles.cell, tone(m.met.runKm)]}>
            {m.met.runKm != null ? (m.met.runKm ? '✓ ' : '') : ''}
            {m.runKm}
          </Text>
          <Text style={styles.cell}>{formatPaceMin(m.pace)}</Text>
          <Text style={styles.cell}>{m.avgHr ?? '—'}</Text>
          <Text style={styles.cell}>{m.beatsPerKm ?? '—'}</Text>
        </View>
      ))}
      <SummaryRow label={`${year} to date`} cells={[ytd.runKm, formatPaceMin(ytd.pace), ytd.avgHr ?? '—', ytd.beatsPerKm ?? '—']} />
      <SummaryRow label="Monthly avg" note={`(${average.months} mo)`} cells={[average.runKm, formatPaceMin(average.pace), average.avgHr ?? '—', average.beatsPerKm ?? '—']} />

      <Text style={styles.section}>All activity</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Minutes</Text>
        <Text style={[styles.cell, styles.headText]}>Walk km</Text>
        <Text style={[styles.cell, styles.headText]}>Sessions</Text>
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
          <Text style={styles.cell}>{m.walkKm}</Text>
          <Text style={styles.cell}>{m.sessions}</Text>
        </View>
      ))}
      <SummaryRow label={`${year} to date`} cells={[formatDuration(ytd.minutes), ytd.walkKm, ytd.sessions]} />
      <SummaryRow label="Monthly avg" note={`(${average.months} mo)`} cells={[formatDuration(average.minutes), average.walkKm, average.sessions]} />

      {targets?.minutes > 0 || targets?.runKm > 0 ? (
        <Text style={styles.hint}>Ticks mark months that reached the targets in Settings → Training.</Text>
      ) : null}
    </Card>
  );
}

function SummaryRow({ label, note, cells }) {
  return (
    <View style={[styles.row, styles.summary]}>
      <Text style={[styles.cell, styles.month]}>
        {label}
        {note ? <Text style={styles.partial}> {note}</Text> : null}
      </Text>
      {cells.map((value, i) => (
        <Text key={i} style={[styles.cell, styles.summaryText]}>
          {value}
        </Text>
      ))}
    </View>
  );
}

function tone(met) {
  if (met == null) return null;
  return { color: met ? colors.primary : colors.accent, fontWeight: '700' };
}

const styles = StyleSheet.create({
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  body: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs, marginBottom: spacing.sm },
  section: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.lg },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.line },
  head: { marginTop: spacing.xs, borderBottomColor: colors.inkSoft },
  headText: { color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  cell: { flex: 1, fontSize: fonts.tiny, color: colors.ink, textAlign: 'right' },
  month: { flex: 1.5, textAlign: 'left', fontWeight: '600' },
  partial: { color: colors.inkSoft, fontWeight: '400' },
  summary: { backgroundColor: colors.bg, borderBottomWidth: 0, marginTop: 2 },
  summaryText: { fontWeight: '700' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});
