import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel } from '../lib/dates';
import { healthSupported, healthSeries, requestHealthAccess } from '../lib/health';
import {
  caloriesByDay,
  direction,
  HEALTH_METRICS,
  intakeAssociation,
  latest,
  METRIC_GROUPS,
  sleepIntakeAssociation,
  trend,
} from '../lib/healthMetrics';
import { saveHealthSnapshot, watchHealthSnapshot, watchRecentMeals } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty, Pill } from '../ui';

export default function HealthScreen() {
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  // Set only where the data came from Firestore rather than straight from HealthKit,
  // so the screen can say how old the copy is instead of implying it is live.
  const [capturedAt, setCapturedAt] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    return watchRecentMeals(user.uid, setMeals, 300);
  }, [user]);

  // Off the phone, HealthKit does not exist — read the copy the phone mirrored.
  useEffect(() => {
    if (healthSupported || !user) return undefined;
    return watchHealthSnapshot(user.uid, (snapshot) => {
      setSeries(snapshot?.series ?? null);
      setCapturedAt(snapshot?.capturedAt ?? null);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!healthSupported) return undefined;

    let cancelled = false;
    let lastSynced = null;

    const read = async () => {
      const granted = await requestHealthAccess();
      if (cancelled) return;
      if (!granted) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const data = await healthSeries(90);
      if (cancelled) return;
      setSeries(data);
      setLoading(false);

      // Mirror to Firestore so the web app can show the same numbers. Skipped when
      // nothing has changed since the last write this session, which is the common
      // case when the tab is reopened within a few minutes.
      if (!user) return;
      const fingerprint = JSON.stringify(
        Object.entries(data).map(([key, points]) => [key, points.length, points.at(-1)?.value])
      );
      if (fingerprint === lastSynced) return;
      lastSynced = fingerprint;
      saveHealthSnapshot(user.uid, data).catch((error) =>
        console.warn('health snapshot save failed', error)
      );
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
  }, [user]);

  const intake = useMemo(() => caloriesByDay(meals), [meals]);
  const sleepVsIntake = useMemo(
    () => (series ? sleepIntakeAssociation(series.sleep, intake) : null),
    [series, intake]
  );
  const intakeVsHeart = useMemo(
    () => (series ? intakeAssociation(series.restingHeartRate, intake) : null),
    [series, intake]
  );

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
        <Text style={styles.title}>Health</Text>
        <Empty
          title="Health access is off"
          body="Noodle needs read access to show these. Open the Health app, then Sharing → Apps → Noodle, and turn the categories on."
        />
      </ScrollView>
    );
  }

  if (!healthSupported && !series) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Health</Text>
        <Empty
          title="Nothing synced yet"
          body="Apple Health only exists on iOS. Open the Health tab on your iPhone once and it will mirror the readings here."
        />
      </ScrollView>
    );
  }

  const populated = Object.keys(HEALTH_METRICS).filter((key) => series?.[key]?.length);
  const sleep = series?.sleep ?? [];

  if (populated.length === 0 && sleep.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Health</Text>
        <Empty
          title="Nothing recorded yet"
          body="Apple Health has no readings from the last 90 days. If you've just set the watch up, give it a day or two — most of these fill in on their own."
        />
      </ScrollView>
    );
  }

  const lastNight = latest(sleep);
  const sleepTrend = trend(sleep);
  const restingLatest = series.restingHeartRate?.length ? latest(series.restingHeartRate) : null;
  const restingTrend = trend(series.restingHeartRate);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Health</Text>
      <Text style={styles.subtitle}>
        From Apple Health · {populated.length + (sleep.length ? 1 : 0)} metrics with data
      </Text>

      {capturedAt ? (
        <Text style={styles.syncNote}>
          Synced from your iPhone {describeAge(capturedAt)}. Open the Health tab there to refresh
          it.
        </Text>
      ) : null}

      {lastNight ? (
        <Card style={styles.heroCard}>
          <Text style={styles.heroValue}>{formatHours(lastNight.value)}</Text>
          <Text style={styles.heroUnit}>asleep</Text>
          <Text style={styles.heroLabel}>Night of {formatDayLabel(lastNight.date)}</Text>
          {stageLine(sleep) ? <Text style={styles.heroStages}>{stageLine(sleep)}</Text> : null}
          {sleepTrend ? (
            <Text style={[styles.heroTrend, { color: sleepTone(sleepTrend.change) }]}>
              {describeHours(sleepTrend.change)} against the three weeks before
            </Text>
          ) : null}
        </Card>
      ) : null}

      {restingLatest ? (
        <Card style={styles.secondaryHero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.secondaryLabel}>Resting heart rate</Text>
            <Text style={styles.secondaryDate}>{formatDayLabel(restingLatest.date)}</Text>
            {restingTrend ? (
              <View style={styles.pillWrap}>
                <Pill tone={pillTone(restingTrend.change, 'restingHeartRate')}>
                  {describe(restingTrend.change, 'restingHeartRate')} this week
                </Pill>
              </View>
            ) : null}
          </View>
          <View style={styles.secondaryValueBlock}>
            <Text style={styles.secondaryValue}>{format(restingLatest.value, 'restingHeartRate')}</Text>
            <Text style={styles.rowUnit}>bpm</Text>
          </View>
        </Card>
      ) : null}

      {sleepVsIntake ? (
        <Card style={styles.associationCard}>
          <Text style={styles.associationTitle}>Sleep and appetite</Text>
          <Text style={styles.associationBody}>
            After your shortest nights (averaging {formatHours(sleepVsIntake.shortHours)}) you ate{' '}
            <Text style={styles.bold}>{Math.round(sleepVsIntake.afterShort)} kcal</Text>. After your
            longest ({formatHours(sleepVsIntake.longHours)}) you ate{' '}
            <Text style={styles.bold}>{Math.round(sleepVsIntake.afterLong)} kcal</Text>
            {Math.abs(sleepVsIntake.difference) < 100
              ? ' — much the same.'
              : ` — ${Math.abs(Math.round(sleepVsIntake.difference))} kcal ${
                  sleepVsIntake.difference > 0 ? 'more' : 'less'
                } on the short-sleep days.`}
          </Text>
          <Text style={styles.associationCaveat}>
            Across {sleepVsIntake.dayCount} days. Short sleep does raise appetite in controlled
            studies, but a bad night and a heavy day often share a cause — travel, stress, a late
            event. Worth noticing, not proof.
          </Text>
        </Card>
      ) : null}

      {intakeVsHeart ? (
        <Card style={styles.associationCard}>
          <Text style={styles.associationTitle}>Eating and your resting heart rate</Text>
          <Text style={styles.associationBody}>
            On days following your heaviest eating (around{' '}
            {Math.round(intakeVsHeart.heavyCalories)} kcal), resting heart rate averaged{' '}
            <Text style={styles.bold}>{intakeVsHeart.afterHeavy.toFixed(0)} bpm</Text>. After your
            lightest ({Math.round(intakeVsHeart.lightCalories)} kcal) it averaged{' '}
            <Text style={styles.bold}>{intakeVsHeart.afterLight.toFixed(0)} bpm</Text>
            {Math.abs(intakeVsHeart.difference) < 1
              ? ' — essentially no difference.'
              : ` — a gap of ${Math.abs(intakeVsHeart.difference).toFixed(0)} bpm.`}
          </Text>
          <Text style={styles.associationCaveat}>
            Across {intakeVsHeart.dayCount} days. Sleep, alcohol, training and stress move this
            number too, and any of them could be what you are seeing.
          </Text>
        </Card>
      ) : null}

      {METRIC_GROUPS.map((group) => {
        const keys = populated.filter((key) => HEALTH_METRICS[key].group === group.key);
        const showSleepRows = group.key === 'sleep' && sleep.length > 0;
        if (keys.length === 0 && !showSleepRows) return null;

        return (
          <View key={group.key}>
            <Text style={styles.sectionHeading}>{group.label}</Text>

            {showSleepRows ? (
              <MetricRow
                label="Time asleep"
                unit="per night"
                value={formatHours(meanOf(sleep))}
                meta={`${sleep.length} nights · latest ${formatDayLabel(lastNight.date)}`}
              />
            ) : null}

            {keys.map((key) => {
              const metricTrend = trend(series[key]);
              const metricLatest = latest(series[key]);
              return (
                <MetricRow
                  key={key}
                  label={HEALTH_METRICS[key].label}
                  unit={HEALTH_METRICS[key].short}
                  value={format(metricLatest.value, key)}
                  meta={`${series[key].length} reading${
                    series[key].length === 1 ? '' : 's'
                  } · latest ${formatDayLabel(metricLatest.date)}`}
                  pill={
                    metricTrend
                      ? { tone: pillTone(metricTrend.change, key), text: describe(metricTrend.change, key) }
                      : null
                  }
                />
              );
            })}
          </View>
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

function MetricRow({ label, unit, value, meta, pill }) {
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
        {pill ? (
          <View style={styles.pillWrap}>
            <Pill tone={pill.tone}>{pill.text} this week</Pill>
          </View>
        ) : null}
      </View>
      <View style={styles.rowValueBlock}>
        <Text style={styles.rowValue}>{value}</Text>
        <Text style={styles.rowUnit}>{unit}</Text>
      </View>
    </Card>
  );
}

/**
 * How old the mirrored copy is, in words.
 *
 * Shown because a synced copy only refreshes when the phone's Health tab is opened.
 * A three-day-old resting heart rate presented as today's would be worse than not
 * showing it at all.
 */
function describeAge(iso) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function meanOf(series) {
  if (!series?.length) return 0;
  return series.reduce((sum, point) => sum + point.value, 0) / series.length;
}

function formatHours(hours) {
  if (hours == null) return '—';
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  // 7h 60m is nobody's idea of a night's sleep.
  if (minutes === 60) return `${whole + 1}h 0m`;
  return `${whole}h ${minutes}m`;
}

function describeHours(change) {
  const minutes = Math.round(Math.abs(change) * 60);
  if (minutes < 15) return 'Steady';
  return `${change > 0 ? 'Up' : 'Down'} ${minutes} min`;
}

function sleepTone(change) {
  if (Math.abs(change) * 60 < 15) return colors.inkSoft;
  return change > 0 ? colors.primary : colors.accent;
}

/** Stage breakdown, shown only when the watch actually recorded stages. */
function stageLine(sleep) {
  const recent = sleep.slice(-14);
  const totals = recent.reduce(
    (acc, night) => ({
      deep: acc.deep + (night.stages?.deep ?? 0),
      rem: acc.rem + (night.stages?.rem ?? 0),
      core: acc.core + (night.stages?.core ?? 0),
      nights: acc.nights + 1,
    }),
    { deep: 0, rem: 0, core: 0, nights: 0 }
  );
  if (!totals.nights || totals.deep + totals.rem + totals.core === 0) return null;
  const per = (value) => formatHours(value / totals.nights);
  return `Typical night: ${per(totals.deep)} deep · ${per(totals.rem)} REM · ${per(totals.core)} core`;
}

function format(value, key) {
  if (value == null) return '—';
  const decimals = HEALTH_METRICS[key]?.decimals;
  if (decimals) return value.toFixed(decimals);
  return Math.round(value).toLocaleString();
}

function describe(change, key) {
  const metric = HEALTH_METRICS[key];
  const floor = metric?.noise ?? 1;
  if (Math.abs(change) < floor) return 'Steady';
  const amount = metric?.decimals
    ? Math.abs(change).toFixed(metric.decimals)
    : Math.round(Math.abs(change)).toLocaleString();
  return `${change > 0 ? 'Up' : 'Down'} ${amount}`;
}

function pillTone(change, key) {
  const metric = HEALTH_METRICS[key];
  const verdict = direction(change, metric?.betterWhen, metric?.noise ?? 1);
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
  syncNote: {
    fontSize: fonts.tiny,
    color: colors.accent,
    fontWeight: '600',
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    lineHeight: 17,
  },

  heroCard: { alignItems: 'center', paddingVertical: spacing.xl },
  heroValue: { fontSize: 56, fontWeight: '800', color: colors.ink, lineHeight: 62 },
  heroUnit: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, marginTop: spacing.md },
  heroStages: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  heroTrend: {
    fontSize: fonts.small,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },

  secondaryHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  secondaryLabel: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  secondaryDate: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  secondaryValueBlock: { alignItems: 'flex-end' },
  secondaryValue: { fontSize: 44, fontWeight: '800', color: colors.ink, lineHeight: 48 },

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
