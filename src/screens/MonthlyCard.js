import { StyleSheet, Text, View } from 'react-native';

import { BarChart } from '../charts';
import {
  formatPaceMin,
  monthlySummary,
  monthlyTotals,
  parseEvents,
  withEventDividers,
  yearlyTotals,
} from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

/**
 * A year of months: minutes, kilometres run and walked, sessions. The current
 * month is marked as partial so a low number three days in doesn't read as a
 * bad month. Optional targets from Settings tick or cross each month.
 */
export default function MonthlyCard({ workouts, targets, events: eventText }) {
  const months = monthlyTotals(workouts, targets ?? {}, 12);
  if (!months.some((m) => m.sessions > 0)) return null;
  const bars = [...months].reverse();
  const { ytd, average } = monthlySummary(months);
  const year = new Date().getFullYear();
  const years = yearlyTotals(workouts);
  const events = parseEvents(eventText);
  const monthRows = withEventDividers(months, events, (m) => `${m.month}-31`);

  return (
    <Card>
      <Text style={styles.title}>Monthly totals</Text>
      <Text style={styles.body}>
        Kilometres run per month, last twelve months. Pace, heart rate and beats per km are
        across the month’s runs, weighted by distance and time. “All min” is every kind of
        session that month — the dose, for reading alongside the heart data.
      </Text>
      <BarChart
        bars={bars.map((m) => ({ label: m.label, value: m.runKm }))}
        target={targets?.runKm > 0 ? targets.runKm : null}
        format={(v) => `${Math.round(v)}`}
        height={120}
      />

      {years.length > 1 ? (
        <>
          <Text style={styles.section}>By year</Text>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, styles.month, styles.headText]}>Year</Text>
            <Text style={[styles.cell, styles.headText]}>Run km</Text>
            <Text style={[styles.cell, styles.headText]}>Pace</Text>
            <Text style={[styles.cell, styles.headText]}>Avg HR</Text>
            <Text style={[styles.cell, styles.headText]}>Beats/km</Text>
            <Text style={[styles.cell, styles.headText]}>Hours</Text>
          </View>
          {withEventDividers(years, events, (y) => `${y.year}-12-31`).map((entry, i) =>
            entry.divider ? (
              <View key={`yev${i}`} style={styles.divider}>
                <Text style={styles.dividerText}>
                  ▲ since {entry.divider.label} · {entry.divider.date}
                </Text>
              </View>
            ) : (
            <View key={entry.row.year} style={styles.row}>
              <Text style={[styles.cell, styles.month]}>
                {entry.row.year}
                {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
              </Text>
              <Text style={styles.cell}>{entry.row.runKm}</Text>
              <Text style={styles.cell}>{formatPaceMin(entry.row.pace)}</Text>
              <Text style={styles.cell}>{entry.row.avgHr ?? '—'}</Text>
              <Text style={styles.cell}>{entry.row.beatsPerKm ?? '—'}</Text>
              <Text style={styles.cell}>{Math.round(entry.row.minutes / 60)}</Text>
            </View>
            )
          )}
        </>
      ) : null}

      <Text style={styles.section}>By month</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Run km</Text>
        <Text style={[styles.cell, styles.headText]}>Pace</Text>
        <Text style={[styles.cell, styles.headText]}>Avg HR</Text>
        <Text style={[styles.cell, styles.headText]}>Beats/km</Text>
        <Text style={[styles.cell, styles.headText]}>All min</Text>
      </View>
      {monthRows.map((entry, i) =>
        entry.divider ? (
          <View key={`ev${i}`} style={styles.divider}>
            <Text style={styles.dividerText}>
              ▲ since {entry.divider.label} · {entry.divider.date}
            </Text>
          </View>
        ) : (
          <View key={entry.row.month} style={styles.row}>
            <Text style={[styles.cell, styles.month]}>
              {entry.row.label}
              {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
            </Text>
            <Text style={[styles.cell, tone(entry.row.met.runKm)]}>
              {entry.row.met.runKm != null ? (entry.row.met.runKm ? '✓ ' : '') : ''}
              {entry.row.runKm}
            </Text>
            <Text style={styles.cell}>{formatPaceMin(entry.row.pace)}</Text>
            <Text style={styles.cell}>{entry.row.avgHr ?? '—'}</Text>
            <Text style={styles.cell}>{entry.row.beatsPerKm ?? '—'}</Text>
            <Text style={[styles.cell, tone(entry.row.met.minutes)]}>
              {entry.row.met.minutes != null ? (entry.row.met.minutes ? '✓ ' : '') : ''}
              {entry.row.minutes}
            </Text>
          </View>
        )
      )}
      <SummaryRow label={`${year} to date`} cells={[ytd.runKm, formatPaceMin(ytd.pace), ytd.avgHr ?? '—', ytd.beatsPerKm ?? '—', ytd.minutes]} />
      <SummaryRow label="Monthly avg" note={`(${average.months} mo)`} cells={[average.runKm, formatPaceMin(average.pace), average.avgHr ?? '—', average.beatsPerKm ?? '—', average.minutes]} />

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
  divider: { backgroundColor: colors.accentSoft, paddingVertical: 4, paddingHorizontal: spacing.sm, marginTop: 4 },
  dividerText: { fontSize: fonts.tiny, color: colors.accent, fontWeight: '700' },
  summaryText: { fontWeight: '700' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});
