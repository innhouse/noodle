import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BarChart } from '../charts';
import {
  byActivity,
  formatDuration,
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
function MonthlyCard({ workouts, targets, events: eventText, onMonthPress }) {
  const computed = useMemo(() => {
    const months = monthlyTotals(workouts, targets ?? {}, 12);
    return {
      months,
      summary: monthlySummary(months),
      years: yearlyTotals(workouts),
      activities: byActivity(workouts, 365),
    };
  }, [workouts, targets]);
  const months = computed.months;
  if (!months.some((m) => m.sessions > 0)) return null;
  const bars = [...months].reverse();
  const { ytd, average } = computed.summary;
  const year = new Date().getFullYear();
  const years = computed.years;
  const activities = computed.activities;
  const events = parseEvents(eventText);
  const monthRows = withEventDividers(months, events, (m) => `${m.month}-31`);

  return (
    <Card>
      <Text style={styles.title}>Monthly totals</Text>
      <Text style={styles.body}>
        Kilometres run per month, last twelve months. Pace, heart rate and beats per km are
        across the month’s runs, weighted by distance and time.
      </Text>
      <BarChart
        bars={bars.map((m) => ({ label: m.label, value: m.runKm, month: m.month }))}
        target={targets?.runKm > 0 ? targets.runKm : null}
        format={(v) => `${Math.round(v)}`}
        height={120}
        onBarPress={onMonthPress ? (bar) => onMonthPress(bar.month) : undefined}
      />
      {onMonthPress ? <Text style={styles.tapHint}>Tap a bar, a month or a year to see what was in it.</Text> : null}

      {years.length > 1 ? (
        <>
          <Text style={styles.section}>Running, by year</Text>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, styles.month, styles.headText]}>Year</Text>
            <Text style={[styles.cell, styles.headText]}>Run km</Text>
            <Text style={[styles.cell, styles.headText]}>Avg km</Text>
            <Text style={[styles.cell, styles.headText]}>Pace</Text>
            <Text style={[styles.cell, styles.headText]}>HR</Text>
            <Text style={[styles.cell, styles.headText]}>B/km</Text>
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
            <Pressable
              key={entry.row.year}
              style={styles.row}
              onPress={onMonthPress ? () => onMonthPress(entry.row.year) : undefined}
            >
              <Text style={[styles.cell, styles.month]}>
                {entry.row.year}
                {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
              </Text>
              <Text style={styles.cell}>{Math.round(entry.row.runKm)}</Text>
              <Text style={styles.cell}>{entry.row.avgRunKm ?? '—'}</Text>
              <Text style={styles.cell}>{formatPaceMin(entry.row.pace)}</Text>
              <Text style={styles.cell}>{entry.row.avgHr ?? '—'}</Text>
              <Text style={styles.cell}>{entry.row.beatsPerKm ?? '—'}</Text>
              <Text style={styles.cell}>{Math.round(entry.row.minutes / 60)}</Text>
            </Pressable>
            )
          )}
        </>
      ) : null}

      <Text style={styles.section}>Running, by month</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Run km</Text>
        <Text style={[styles.cell, styles.headText]}>Avg km</Text>
        <Text style={[styles.cell, styles.headText]}>Pace</Text>
        <Text style={[styles.cell, styles.headText]}>HR</Text>
        <Text style={[styles.cell, styles.headText]}>B/km</Text>
      </View>
      {monthRows.map((entry, i) =>
        entry.divider ? (
          <View key={`ev${i}`} style={styles.divider}>
            <Text style={styles.dividerText}>
              ▲ since {entry.divider.label} · {entry.divider.date}
            </Text>
          </View>
        ) : (
          <Pressable
            key={entry.row.month}
            style={styles.row}
            onPress={onMonthPress ? () => onMonthPress(entry.row.month) : undefined}
          >
            <Text style={[styles.cell, styles.month]}>
              {entry.row.label}
              {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
            </Text>
            <Text style={[styles.cell, tone(entry.row.met.runKm)]}>
              {entry.row.met.runKm != null ? (entry.row.met.runKm ? '✓ ' : '') : ''}
              {Math.round(entry.row.runKm)}
            </Text>
            <Text style={styles.cell}>{entry.row.avgRunKm ?? '—'}</Text>
            <Text style={styles.cell}>{formatPaceMin(entry.row.pace)}</Text>
            <Text style={styles.cell}>{entry.row.avgHr ?? '—'}</Text>
            <Text style={styles.cell}>{entry.row.beatsPerKm ?? '—'}</Text>
          </Pressable>
        )
      )}
      <SummaryRow label={`${year} to date`} cells={[Math.round(ytd.runKm), ytd.avgRunKm ?? '—', formatPaceMin(ytd.pace), ytd.avgHr ?? '—', ytd.beatsPerKm ?? '—']} />
      <SummaryRow label="Monthly avg" note={`(${average.months} mo)`} cells={[Math.round(average.runKm), average.avgRunKm ?? '—', formatPaceMin(average.pace), average.avgHr ?? '—', average.beatsPerKm ?? '—']} />

      {years.length > 1 ? (
        <>
          <Text style={styles.section}>Other activities, by year</Text>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, styles.month, styles.headText]}>Year</Text>
            <Text style={[styles.cell, styles.headText]}>Sess.</Text>
            <Text style={[styles.cell, styles.headText]}>Str.</Text>
            <Text style={[styles.cell, styles.headText]}>Walk</Text>
            <Text style={[styles.cell, styles.headText]}>Other</Text>
            <Text style={[styles.cell, styles.headText]}>Avg min</Text>
            <Text style={[styles.cell, styles.headText]}>Hours</Text>
          </View>
          {withEventDividers(years, events, (y) => `${y.year}-12-31`).map((entry, i) =>
            entry.divider ? (
              <View key={`ayev${i}`} style={styles.divider}>
                <Text style={styles.dividerText}>
                  ▲ since {entry.divider.label} · {entry.divider.date}
                </Text>
              </View>
            ) : (
              <Pressable
                key={`ay${entry.row.year}`}
                style={styles.row}
                onPress={onMonthPress ? () => onMonthPress(entry.row.year) : undefined}
              >
                <Text style={[styles.cell, styles.month]}>
                  {entry.row.year}
                  {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
                </Text>
                <Text style={styles.cell}>{entry.row.otherSessions}</Text>
                <Text style={styles.cell}>{entry.row.mix.strength}</Text>
                <Text style={styles.cell}>{entry.row.mix.walks}</Text>
                <Text style={styles.cell}>{entry.row.mix.other}</Text>
                <Text style={styles.cell}>{entry.row.avgOtherMin ?? '—'}</Text>
                <Text style={styles.cell}>{Math.round(entry.row.otherMinutes / 60)}</Text>
              </Pressable>
            )
          )}
        </>
      ) : null}

      <Text style={styles.section}>Other activities, by month</Text>
      <View style={[styles.row, styles.head]}>
        <Text style={[styles.cell, styles.month, styles.headText]}>Month</Text>
        <Text style={[styles.cell, styles.headText]}>Sess.</Text>
        <Text style={[styles.cell, styles.headText]}>Str.</Text>
        <Text style={[styles.cell, styles.headText]}>Walk</Text>
        <Text style={[styles.cell, styles.headText]}>Other</Text>
        <Text style={[styles.cell, styles.headText]}>Avg min</Text>
        <Text style={[styles.cell, styles.headText]}>Total</Text>
      </View>
      {monthRows.map((entry, i) =>
        entry.divider ? (
          <View key={`aev${i}`} style={styles.divider}>
            <Text style={styles.dividerText}>
              ▲ since {entry.divider.label} · {entry.divider.date}
            </Text>
          </View>
        ) : (
          <Pressable
            key={`a${entry.row.month}`}
            style={styles.row}
            onPress={onMonthPress ? () => onMonthPress(entry.row.month) : undefined}
          >
            <Text style={[styles.cell, styles.month]}>
              {entry.row.label}
              {entry.row.current ? <Text style={styles.partial}> so far</Text> : null}
            </Text>
            <Text style={styles.cell}>{entry.row.otherSessions}</Text>
            <Text style={styles.cell}>{entry.row.mix.strength}</Text>
            <Text style={styles.cell}>{entry.row.mix.walks}</Text>
            <Text style={styles.cell}>{entry.row.mix.other}</Text>
            <Text style={styles.cell}>{entry.row.avgOtherMin ?? '—'}</Text>
            <Text style={styles.cell}>{entry.row.otherMinutes}</Text>
          </Pressable>
        )
      )}
      <SummaryRow label={`${year} to date`} cells={[ytd.otherSessions, '', '', '', ytd.avgOtherMin ?? '—', Math.round(ytd.otherMinutes)]} />
      <SummaryRow label="Monthly avg" note={`(${average.months} mo)`} cells={[average.otherSessions, '', '', '', average.avgOtherMin ?? '—', average.otherMinutes]} />

      {activities.length ? (
        <>
          <Text style={styles.section}>By activity, last 12 months</Text>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, styles.month, styles.headText]}>Activity</Text>
            <Text style={[styles.cell, styles.headText]}>Sessions</Text>
            <Text style={[styles.cell, styles.headText]}>Total</Text>
            <Text style={[styles.cell, styles.headText]}>Avg</Text>
          </View>
          {activities.map((a) => (
            <View key={a.type} style={styles.row}>
              <Text style={[styles.cell, styles.month]}>
                {a.icon} {a.label}
              </Text>
              <Text style={styles.cell}>{a.sessions}</Text>
              <Text style={styles.cell}>{formatDuration(a.minutes)}</Text>
              <Text style={styles.cell}>{formatDuration(a.avgMin)}</Text>
            </View>
          ))}
        </>
      ) : null}

      {targets?.runKm > 0 ? (
        <Text style={styles.hint}>Ticks mark months that reached the km target in Settings → Training.</Text>
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
  cell: { flex: 1, fontSize: 11, color: colors.ink, textAlign: 'right' },
  month: { flex: 1.4, textAlign: 'left', fontWeight: '600' },
  partial: { color: colors.inkSoft, fontWeight: '400' },
  summary: { backgroundColor: colors.bg, borderBottomWidth: 0, marginTop: 2 },
  divider: { backgroundColor: colors.accentSoft, paddingVertical: 4, paddingHorizontal: spacing.sm, marginTop: 4 },
  dividerText: { fontSize: fonts.tiny, color: colors.accent, fontWeight: '700' },
  summaryText: { fontWeight: '700' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
  tapHint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'right', marginTop: spacing.xs },
});

export default memo(MonthlyCard);
