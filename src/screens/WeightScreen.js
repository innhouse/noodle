import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { dayKey, formatDayLabel } from '../lib/dates';
import { weeklyChange, weightTrend } from '../lib/nutrition';
import { saveWeight, watchWeights } from '../lib/store';
import { displayLb, kgToLb, lbToKg } from '../lib/units';
import { colors, fonts, spacing } from '../theme';
import { Button, Card, Empty, Field } from '../ui';

export default function WeightScreen() {
  const { user, profile, updateProfile } = useAuth();
  const [entries, setEntries] = useState([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchWeights(user.uid, setEntries);
  }, [user]);

  const trended = useMemo(() => weightTrend(entries), [entries]);
  const rate = weeklyChange(trended);
  const latest = trended[trended.length - 1];

  async function log() {
    const pounds = Number(input);
    if (!Number.isFinite(pounds) || pounds <= 0) return;
    const weightKg = lbToKg(pounds);

    setSaving(true);
    try {
      await saveWeight(user.uid, dayKey(), weightKg);
      // Keep the profile in step, or the calorie budget keeps being calculated
      // against whatever they weighed when they first set it up.
      await updateProfile({ weightKg });
      setInput('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Weight</Text>

      <Card>
        <Field
          label="Today's weight (lb)"
          placeholder={profile?.weightKg ? displayLb(profile.weightKg) : '180'}
          value={input}
          onChangeText={setInput}
          keyboardType="decimal-pad"
          hint="Weigh yourself at the same time each day — first thing, after the bathroom, is the most consistent."
        />
        <Button title="Log weight" onPress={log} loading={saving} disabled={!input.trim()} />
      </Card>

      {latest ? (
        <Card style={styles.trendCard}>
          <Text style={styles.trendValue}>{kgToLb(latest.trend).toFixed(1)} lb</Text>
          <Text style={styles.trendLabel}>trend weight</Text>
          <Text style={styles.trendDetail}>
            Last reading {kgToLb(latest.weightKg).toFixed(1)} lb on {formatDayLabel(latest.date)}
          </Text>
          {rate !== null ? (
            <Text style={[styles.rate, { color: rate < 0 ? colors.primary : colors.accent }]}>
              {rate < 0 ? '↓' : '↑'} {Math.abs(kgToLb(rate)).toFixed(2)} lb per week
            </Text>
          ) : (
            <Text style={styles.rateHint}>
              Log for a couple of weeks and a reliable rate of change will appear here.
            </Text>
          )}
        </Card>
      ) : (
        <Empty
          title="No weigh-ins yet"
          body="Daily readings bounce around by two or three pounds on water alone. Noodle smooths them into a trend, which is the number that actually tells you whether this is working."
        />
      )}

      {trended.length > 1 ? (
        <>
          <Text style={styles.sectionHeading}>Recent</Text>
          {[...trended]
            .reverse()
            .slice(0, 21)
            .map((entry) => (
              <View key={entry.date} style={styles.row}>
                <Text style={styles.rowDate}>{formatDayLabel(entry.date)}</Text>
                <Text style={styles.rowWeight}>{kgToLb(entry.weightKg).toFixed(1)} lb</Text>
                <Text style={styles.rowTrend}>{kgToLb(entry.trend).toFixed(1)}</Text>
              </View>
            ))}
          <Text style={styles.legend}>Reading · trend</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },

  trendCard: { alignItems: 'center', paddingVertical: spacing.xl },
  trendValue: { fontSize: 52, fontWeight: '800', color: colors.ink, lineHeight: 58 },
  trendLabel: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  trendDetail: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },
  rate: { fontSize: fonts.big, fontWeight: '700', marginTop: spacing.md },
  rateHint: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },

  sectionHeading: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowDate: { fontSize: fonts.small, color: colors.inkSoft, flex: 1 },
  rowWeight: { fontSize: fonts.small, color: colors.ink, fontWeight: '600', width: 70, textAlign: 'right' },
  rowTrend: { fontSize: fonts.small, color: colors.inkSoft, width: 50, textAlign: 'right' },
  legend: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'right', marginTop: spacing.xs },
});
