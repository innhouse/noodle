import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel } from '../lib/dates';
import { HEART_METRICS, healthSupported, heartSeries, requestHealthAccess } from '../lib/health';
import { caloriesByDay, direction, intakeAssociation, latest, trend } from '../lib/heart';
import { watchRecentMeals } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty, Pill } from '../ui';

// How far a metric has to move before it counts as a change rather than noise.
// Resting heart rate wanders a beat or two on sleep alone; HRV swings far more.
const NOISE_FLOOR = {
  restingHeartRate: 1,
  walkingHeartRate: 1.5,
  hrv: 4,
  vo2Max: 0.5,
  heartRateRecovery: 2,
  respiratoryRate: 0.5,
  oxygenSaturation: 0.5,
  systolic: 3,
  diastolic: 2,
};

// Resting heart rate leads because it responds fastest to how you have been eating,
// drinking and sleeping. The rest are slower-moving context.
const ORDER = [
  'restingHeartRate',
  'hrv',
  'vo2Max',
  'walkingHeartRate',
  'heartRateRecovery',
  'respiratoryRate',
  'oxygenSaturation',
  'systolic',
  'diastolic',
];

export default function HeartScreen() {
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setMeals, 300);
  }, [user]);

  useEffect(() => {
    if (!healthSupported) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const read = async () => {
      const granted = await requestHealthAccess();
      if (cancelled) return;
      if (!granted) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const data = await heartSeries(90);
      if (cancelled) return;
      setSeries(data);
      setLoading(false);
    };
    read();

    // Health fills in behind us as the watch syncs, so re-read on return rather
    // than showing whatever happened to be there when the tab first opened.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const intake = useMemo(() => caloriesByDay(meals), [meals]);
  const association = useMemo(
    () => (series ? intakeAssociation(series.restingHeartRate, intake) : null),
    [series, intake]
  );

  if (!healthSupported) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Heart</Text>
        <Empty
          title="Only on the phone"
          body="Apple Health lives on iOS, so these readings cannot reach the web version. Open Noodle on your iPhone."
        />
      </ScrollView>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reading Apple Health…</Text>
      </View>
    );
  }

  if (denied) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Heart</Text>
        <Empty
          title="Health access is off"
          body="Noodle needs read access to show these. Open the Health app, then Sharing → Apps → Noodle, and turn on the heart categories."
        />
      </ScrollView>
    );
  }

  const present = ORDER.filter((key) => series?.[key]?.length);

  if (present.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Heart</Text>
        <Empty
          title="Nothing recorded yet"
          body="Apple Health has no heart readings from the last 90 days. An Apple Watch fills most of these automatically; blood pressure has to come from a cuff or be entered by hand."
        />
      </ScrollView>
    );
  }

  const [lead, ...rest] = present;
  const leadTrend = trend(series[lead]);
  const leadLatest = latest(series[lead]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Heart</Text>
      <Text style={styles.subtitle}>From Apple Health, last 90 days.</Text>

      <Card style={styles.heroCard}>
        <Text style={styles.heroValue}>{format(leadLatest.value, lead)}</Text>
        <Text style={styles.heroUnit}>{HEART_METRICS[lead].short}</Text>
        <Text style={styles.heroLabel}>{HEART_METRICS[lead].label}</Text>
        <Text style={styles.heroDate}>Last reading {formatDayLabel(leadLatest.date)}</Text>
        {leadTrend ? (
          <Text style={[styles.heroTrend, { color: tone(leadTrend.change, lead) }]}>
            {describe(leadTrend.change, lead)} over the last week, against the three before it
          </Text>
        ) : null}
      </Card>

      {association ? (
        <Card style={styles.associationCard}>
          <Text style={styles.associationTitle}>After you eat more</Text>
          <Text style={styles.associationBody}>
            On days following your heaviest meals (around{' '}
            {Math.round(association.heavyCalories)} kcal), your resting heart rate averaged{' '}
            <Text style={styles.bold}>{association.afterHeavy.toFixed(0)} bpm</Text>. After your
            lightest ({Math.round(association.lightCalories)} kcal) it averaged{' '}
            <Text style={styles.bold}>{association.afterLight.toFixed(0)} bpm</Text>
            {Math.abs(association.difference) < 1
              ? ' — essentially no difference.'
              : ` — a gap of ${Math.abs(association.difference).toFixed(0)} bpm.`}
          </Text>
          <Text style={styles.associationCaveat}>
            Across {association.dayCount} days. Sleep, alcohol, training and stress move this
            number too, and any of them could be what you are seeing. Treat it as something worth
            a look, not as cause and effect.
          </Text>
        </Card>
      ) : null}

      <Text style={styles.sectionHeading}>Everything else</Text>

      {rest.map((key) => {
        const metricTrend = trend(series[key]);
        const metricLatest = latest(series[key]);
        return (
          <Card key={key} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{HEART_METRICS[key].label}</Text>
              <Text style={styles.rowMeta}>
                {series[key].length} reading{series[key].length === 1 ? '' : 's'} · latest{' '}
                {formatDayLabel(metricLatest.date)}
              </Text>
              {metricTrend ? (
                <View style={styles.pillWrap}>
                  <Pill tone={pillTone(metricTrend.change, key)}>
                    {describe(metricTrend.change, key)} this week
                  </Pill>
                </View>
              ) : null}
            </View>
            <View style={styles.rowValueBlock}>
              <Text style={styles.rowValue}>{format(metricLatest.value, key)}</Text>
              <Text style={styles.rowUnit}>{HEART_METRICS[key].short}</Text>
            </View>
          </Card>
        );
      })}

      <Text style={styles.disclaimer}>
        These are your own Health readings shown back to you, compared only against your own
        earlier ones. Noodle does not decide what counts as normal — that varies enormously
        between people, and this is not a medical device. Anything that worries you is a
        conversation with your doctor, not with this app.
      </Text>
    </ScrollView>
  );
}

/** Blood oxygen arrives as a fraction on some devices and a percentage on others. */
function format(value, key) {
  if (value == null) return '—';
  if (key === 'oxygenSaturation') {
    const percent = value <= 1 ? value * 100 : value;
    return percent.toFixed(1);
  }
  if (key === 'vo2Max' || key === 'hrv') return value.toFixed(1);
  return Math.round(value).toString();
}

function describe(change, key) {
  const floor = NOISE_FLOOR[key] ?? 1;
  if (Math.abs(change) < floor) return 'Steady';
  const decimals = key === 'vo2Max' || key === 'hrv';
  const amount = decimals ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change));
  return `${change > 0 ? 'Up' : 'Down'} ${amount}`;
}

function tone(change, key) {
  const verdict = direction(change, HEART_METRICS[key]?.betterWhen, NOISE_FLOOR[key] ?? 1);
  if (verdict === 'better') return colors.primary;
  if (verdict === 'worse') return colors.accent;
  return colors.inkSoft;
}

function pillTone(change, key) {
  const verdict = direction(change, HEART_METRICS[key]?.betterWhen, NOISE_FLOOR[key] ?? 1);
  if (verdict === 'better') return 'good';
  if (verdict === 'worse') return 'warn';
  return 'neutral';
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.md },

  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.lg },

  heroCard: { alignItems: 'center', paddingVertical: spacing.xl },
  heroValue: { fontSize: 64, fontWeight: '800', color: colors.ink, lineHeight: 70 },
  heroUnit: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, marginTop: spacing.md },
  heroDate: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs },
  heroTrend: {
    fontSize: fonts.small,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },

  associationCard: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  associationTitle: {
    fontSize: fonts.big,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  associationBody: { fontSize: fonts.small, color: colors.ink, lineHeight: 21 },
  associationCaveat: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  bold: { fontWeight: '700' },

  sectionHeading: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontSize: fonts.body, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  pillWrap: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  rowValueBlock: { alignItems: 'flex-end' },
  rowValue: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  rowUnit: { fontSize: fonts.tiny, color: colors.inkSoft },

  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
