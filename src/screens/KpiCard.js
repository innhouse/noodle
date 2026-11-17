import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { weeklyKpis } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

// 'Cardio' rather than 'Runs': the bucket counts rides and rows alongside runs.
// Zone 2 is the cardio band; 'Above' is time over its top. Both count any session.
const LABELS = { runs: 'Cardio', strength: 'Strength', other: 'Other', walks: 'Walks', zoneMin: 'Zone 1', cardioMin: 'Zone 2', aboveMin: 'Above', yogaMin: 'Yoga' };
// Targets counted in minutes rather than sessions.
const MINUTES = new Set(['zoneMin', 'cardioMin', 'aboveMin', 'yogaMin']);

/**
 * The week's mix against the plan: cardio, strength sessions and other activity,
 * each as "done / target" with a tick when met, plus the recent weeks as a
 * row of ticks so a streak (or a slide) is visible without reading numbers.
 *
 * Counts sessions, not minutes, because the plan is about showing up for each
 * kind of training; the minutes chart next door covers how much.
 */
/** Half sessions read as ½ — "1½" rather than "1.5". */
function formatCount(n) {
  if (n % 1 === 0) return n;
  return `${Math.floor(n) || ''}½`;
}

// The plan (sessions and yoga) and the heart-rate zones are two cards: eight
// boxes on one line squeezed every number on a phone until none could be read.
const PLAN_KEYS = ['runs', 'strength', 'other', 'walks', 'yogaMin'];
const ZONE_KEYS = ['zoneMin', 'cardioMin', 'aboveMin'];

/** One box: label on top, the number large, the target and a bar beneath. */
function Cell({ label, sub, value, goal, minutes, met }) {
  const hasGoal = goal > 0;
  const share = hasGoal ? Math.max(0, Math.min(1, value / goal)) : 0;
  return (
    <View style={[styles.cell, met && styles.cellMet]}>
      <Text style={[styles.cellLabel, met && styles.cellLabelMet]} numberOfLines={1}>
        {met ? '✓ ' : ''}
        {label}
      </Text>
      {sub ? (
        <Text style={styles.cellSub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      <Text style={[styles.cellValue, met && styles.cellValueMet]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCount(value)}
      </Text>
      <Text style={styles.cellGoal} numberOfLines={1}>
        {hasGoal ? `of ${goal}${minutes ? ' min' : ''}` : minutes ? 'min' : ' '}
      </Text>
      <View style={styles.bar}>
        {hasGoal ? (
          <View style={[styles.barFill, { width: `${Math.round(share * 100)}%` }, met && styles.barFillMet]} />
        ) : null}
      </View>
    </View>
  );
}

/** Earlier weeks as a small table; a tick or cross only where there is a target. */
function History({ weeks, keys, goals }) {
  return (
    <View style={styles.history}>
      <View style={styles.historyRow}>
        <Text style={[styles.historyWeek, styles.historyHead]}>Week</Text>
        {keys.map((k) => (
          <Text key={k} style={[styles.historyCell, styles.historyHead]}>
            {LABELS[k]}
          </Text>
        ))}
      </View>
      {weeks.slice(1).map((week) => (
        <View key={week.week} style={styles.historyRow}>
          <Text style={styles.historyWeek}>{week.label}</Text>
          {keys.map((k) => (
            <Text
              key={k}
              style={[
                styles.historyCell,
                { color: !(goals[k] > 0) ? colors.ink : week.met[k] ? colors.primary : colors.accent },
              ]}
            >
              {goals[k] > 0 ? (week.met[k] ? '✓ ' : '✗ ') : ''}
              {formatCount(week.counts[k])}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.hint}>Targets are in Settings → Training.</Text>
    </View>
  );
}

/** "80–116 bpm", "117–127 bpm", "128+ bpm" — what each zone box is counting. */
function zoneRanges(bands) {
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const low1 = num(bands?.zone1Low) ?? 0;
  const high1 = num(bands?.zone1High);
  const low2 = num(bands?.cardioLow);
  const high2 = num(bands?.cardioHigh);
  const zone2 = low2 != null && high2 != null;
  return {
    zoneMin: high1 != null ? (low1 > 0 ? `${low1}–${high1} bpm` : `up to ${high1} bpm`) : null,
    cardioMin: zone2 ? `${low2}–${high2} bpm` : null,
    aboveMin: zone2 ? `${high2 + 1}+ bpm` : null,
  };
}

function KpiCard({ workouts, kpis, bands, history = 8, compact = false }) {
  const weeks = weeklyKpis(workouts, kpis, compact ? 1 : history);
  const current = weeks[0];
  const goals = current.goals;
  const planKeys = PLAN_KEYS.filter((k) => goals[k] > 0);
  // A zone gets a box once its band is set, target or not, so the minutes can
  // be watched before deciding what to aim for.
  const ranges = zoneRanges(bands);
  const zoneKeys = ZONE_KEYS.filter((k) => goals[k] > 0 || ranges[k] || current.counts[k] > 0);
  if (!planKeys.length && !zoneKeys.length) return null;

  const cells = (list, subs) => (
    <View style={styles.row}>
      {list.map((k) => (
        <Cell
          key={k}
          label={LABELS[k]}
          sub={subs?.[k]}
          value={current.counts[k]}
          goal={goals[k]}
          minutes={MINUTES.has(k)}
          met={goals[k] > 0 && current.met[k]}
        />
      ))}
    </View>
  );
  const planMet = planKeys.filter((k) => current.met[k]).length;

  return (
    <>
      {planKeys.length ? (
        <Card>
          <View style={styles.header}>
            <Text style={styles.title}>Weekly plan</Text>
            <Text
              style={[styles.status, { color: planMet === planKeys.length ? colors.primary : colors.inkSoft }]}
            >
              {planMet === planKeys.length ? 'On plan' : `${planMet} of ${planKeys.length} met`}
            </Text>
          </View>
          {cells(planKeys)}
          {!compact ? <History weeks={weeks} keys={planKeys} goals={goals} /> : null}
        </Card>
      ) : null}

      {zoneKeys.length ? (
        <Card>
          <View style={styles.header}>
            <Text style={styles.title}>Heart-rate zones</Text>
            <Text style={[styles.status, { color: colors.inkSoft }]}>minutes this week</Text>
          </View>
          {cells(zoneKeys, ranges)}
          {!compact ? <History weeks={weeks} keys={zoneKeys} goals={goals} /> : null}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  status: { fontSize: fonts.small, fontWeight: '700' },

  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  cellMet: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  cellLabel: { fontSize: fonts.tiny, color: colors.inkSoft, fontWeight: '700' },
  cellLabelMet: { color: colors.primary },
  cellSub: { fontSize: 10, color: colors.inkSoft, marginTop: 1 },
  cellValue: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginTop: 2 },
  cellValueMet: { color: colors.primary },
  cellGoal: { fontSize: fonts.tiny, fontWeight: '600', color: colors.inkSoft, marginBottom: spacing.sm },
  // Progress towards the target, along the bottom edge of the box.
  bar: { alignSelf: 'stretch', height: 4, marginHorizontal: -4, backgroundColor: colors.line },
  barFill: { height: 4, backgroundColor: colors.accent },
  barFillMet: { backgroundColor: colors.primary },

  history: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.sm },
  historyRow: { flexDirection: 'row', paddingVertical: 4 },
  historyHead: { color: colors.inkSoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 },
  historyWeek: { flex: 1.4, fontSize: fonts.tiny, color: colors.inkSoft },
  historyCell: { flex: 1, fontSize: fonts.tiny, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});

export default memo(KpiCard);
