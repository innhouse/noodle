import { StyleSheet, Text, View } from 'react-native';

import { formatDayLabel } from '../lib/dates';
import { runStreaks } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

/**
 * Consecutive days with a qualifying run. The current one, if alive, sits
 * large at the top; the longest ever are listed with their dates, so a streak
 * from a past year stays on the record even after it ends.
 */
export default function StreakCard({ workouts, minKm = 10 }) {
  const { current, longest, qualifyingDays } = runStreaks(workouts, minKm);
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
    </Card>
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
