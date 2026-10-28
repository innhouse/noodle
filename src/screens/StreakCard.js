import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayLabel } from '../lib/dates';
import { formatPaceMin, runRecords, runStreaks } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

/**
 * Consecutive days with a qualifying run. The current one, if alive, sits
 * large at the top; the longest ever are listed with their dates, so a streak
 * from a past year stays on the record even after it ends.
 */
export default function StreakCard({ workouts, minKm = 10, onPick }) {
  const { current, longest, qualifyingDays } = runStreaks(workouts, minKm);
  const records = runRecords(workouts, minKm);
  if (!qualifyingDays) return null;

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>{minKm} km streaks</Text>
        <Text style={styles.meta}>{qualifyingDays} qualifying days</Text>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.heroValue, !current && styles.heroValueOff]}>
          {current ? current.days : 0}
        </Text>
        <Text style={styles.heroLabel}>
          {current
            ? `day${current.days === 1 ? '' : 's'} in a row · since ${formatDayLabel(current.start)}`
            : 'current streak — a run today starts one'}
        </Text>
      </View>

      {longest.length ? (
        <>
          <Text style={styles.sub}>Longest</Text>
          {longest.map((s, i) => (
            <View key={s.start} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <Text style={styles.days}>{s.days} days</Text>
              <Text style={styles.dates}>
                {longDate(s.start)} – {longDate(s.end)}
                {current && s.start === current.start ? '  · now' : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}
      <Text style={styles.hint}>
        A day counts when its longest run is at least {minKm} km. Threshold in Settings → Training.
      </Text>

      {records ? (
        <>
          <Text style={[styles.sub, { marginTop: spacing.lg }]}>Records · runs of {minKm} km or more ({records.count})</Text>
          <RecordRow label="Fastest" run={records.fastest} onPick={onPick} />
          <RecordRow label="Slowest" run={records.slowest} onPick={onPick} />
          <RecordRow label="Longest" run={records.longest} onPick={onPick} showKm />
          {records.longestByYear.length ? (
            <>
              <Text style={[styles.sub, { marginTop: spacing.md }]}>Longest run each year</Text>
              {records.longestByYear.map((w) => (
                <Pressable key={w.id} onPress={onPick ? () => onPick(w) : undefined} style={styles.row}>
                  <Text style={styles.days}>{w.date.slice(0, 4)}</Text>
                  <Text style={styles.dates}>
                    {w.km.toFixed(1)} km · {formatPaceMin(w.pace)} /km · {longDate(w.date)}
                    {w.avgHr ? ` · ${w.avgHr} bpm` : ''}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
          {records.halves.length ? (
            <>
              <Text style={[styles.sub, { marginTop: spacing.md }]}>
                Half marathons or longer · {records.halves.length}
                {records.halvesByYear.length > 1
                  ? ` (${records.halvesByYear.map(([y, n]) => `${y}: ${n}`).join(', ')})`
                  : ''}
              </Text>
              {records.halves.slice(0, 8).map((h) => (
                <Pressable key={h.id} onPress={onPick ? () => onPick(h) : undefined} style={styles.row}>
                  <Text style={styles.days}>{h.km.toFixed(1)} km</Text>
                  <Text style={styles.dates}>
                    {longDate(h.date)} · {formatPaceMin(h.pace)} /km
                    {h.avgHr ? ` · ${h.avgHr} bpm` : ''}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function RecordRow({ label, run, onPick, showKm }) {
  if (!run) return null;
  return (
    <Pressable onPress={onPick ? () => onPick(run) : undefined} style={styles.row}>
      <Text style={styles.days}>{label}</Text>
      <Text style={styles.dates}>
        {showKm ? `${run.km.toFixed(1)} km · ` : ''}
        {formatPaceMin(run.pace)} /km · {longDate(run.date)}
        {!showKm ? ` · ${run.km.toFixed(1)} km` : ''}
        {run.avgHr ? ` · ${run.avgHr} bpm` : ''}
      </Text>
    </Pressable>
  );
}

function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fonts.tiny, color: colors.inkSoft },
  hero: { alignItems: 'center', paddingVertical: spacing.md },
  heroValue: { fontSize: 52, fontWeight: '800', color: colors.primary, lineHeight: 58 },
  heroValueOff: { color: colors.inkSoft },
  heroLabel: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.xs, textAlign: 'center' },
  sub: { fontSize: fonts.tiny, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  rank: { width: 20, fontSize: fonts.tiny, color: colors.inkSoft },
  days: { width: 70, fontSize: fonts.small, fontWeight: '700', color: colors.ink },
  dates: { flex: 1, fontSize: fonts.tiny, color: colors.inkSoft },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});
