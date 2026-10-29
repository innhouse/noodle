import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDayLabel } from '../lib/dates';
import { healthSupported } from '../lib/health';
import {
  direction,
  HEALTH_METRICS,
  latest,
  METRIC_GROUPS,
  trend,
  unwelcomeSide,
  usualRange,
} from '../lib/healthMetrics';
import { describeAge, formatHours, useHealthData } from '../lib/useHealthData';
import { TimeChart } from '../charts';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty, Pill } from '../ui';
import SleepSheet from './SleepSheet';

export default function HealthScreen() {
  const { series, loading, denied, capturedAt } = useHealthData();
  const [open, setOpen] = useState(null);
  const [sleepOpen, setSleepOpen] = useState(false);

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
        <Pressable onPress={() => setSleepOpen(true)}>
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
          <Text style={styles.historyLink}>Sleep history ›</Text>
          </Card>
        </Pressable>
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
                open={open === 'sleep'}
                onPress={() => setOpen(open === 'sleep' ? null : 'sleep')}
                chart={
                  <>
                    <TimeChart
                      points={sleep}
                      band={usualRange(sleep)}
                      outside="below"
                      format={(v) => formatHours(v)}
                      labels="ends"
                    />
                    <Pressable onPress={() => setSleepOpen(true)} hitSlop={8}>
                      <Text style={styles.historyLink}>Full history ›</Text>
                    </Pressable>
                  </>
                }
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
                  open={open === key}
                  onPress={() => setOpen(open === key ? null : key)}
                  chart={
                    <TimeChart
                      points={series[key]}
                      band={usualRange(series[key])}
                      outside={unwelcomeSide(HEALTH_METRICS[key].betterWhen)}
                      format={(v) => format(v, key)}
                      labels="ends"
                    />
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
      {sleepOpen ? <SleepSheet onClose={() => setSleepOpen(false)} /> : null}
    </ScrollView>
  );
}

function MetricRow({ label, unit, value, meta, pill, open, onPress, chart }) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.row}>
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
        </View>
        {open ? (
          <View style={styles.chartWrap}>
            {chart}
            <Text style={styles.chartNote}>
              Green: your usual range, from the four weeks before this one. Orange: the side of
              it you would rather not be on. Tap to collapse.
            </Text>
          </View>
        ) : (
          <Text style={styles.tapHint}>Tap for the chart</Text>
        )}
      </Card>
    </Pressable>
  );
}

function meanOf(series) {
  if (!series?.length) return 0;
  return series.reduce((sum, point) => sum + point.value, 0) / series.length;
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
  historyLink: { fontSize: fonts.small, color: colors.primary, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
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
  chartWrap: { marginTop: spacing.md },
  chartNote: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, lineHeight: 16 },
  tapHint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs, textAlign: 'right' },
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
