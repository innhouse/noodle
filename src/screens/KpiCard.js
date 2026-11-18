import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayLabel } from '../lib/dates';
import { describeType, weekKey, weeklyKpis } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

// 'Cardio' rather than 'Runs': the bucket counts rides and rows alongside runs.
// Zone 2 is the cardio band and zone 3 the one over it. All three count any session.
const LABELS = { runs: 'Cardio', strength: 'Strength', other: 'Other', walks: 'Walks', zoneMin: 'Zone 1', cardioMin: 'Zone 2', zone3Min: 'Zone 3', yogaMin: 'Yoga' };
// Targets counted in minutes rather than sessions.
const MINUTES = new Set(['zoneMin', 'cardioMin', 'zone3Min', 'yogaMin']);

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
const ZONE_KEYS = ['zoneMin', 'cardioMin', 'zone3Min'];

/** One box: label on top, the number large, the target and a bar beneath. */
function Cell({ label, sub, value, goal, minutes, met, onPress, selected }) {
  const hasGoal = goal > 0;
  const share = hasGoal ? Math.max(0, Math.min(1, value / goal)) : 0;
  const Box = onPress ? Pressable : View;
  return (
    <Box onPress={onPress} style={[styles.cell, met && styles.cellMet, selected && styles.cellSelected]}>
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
    </Box>
  );
}

/** Earlier weeks as a small table; a tick or cross only where there is a target. */
function History({ weeks, keys, goals, onPick, picked }) {
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
              onPress={onPick ? () => onPick(k, week) : undefined}
              style={[
                styles.historyCell,
                { color: !(goals[k] > 0) ? colors.ink : week.met[k] ? colors.primary : colors.accent },
                picked?.key === k && picked?.week === week.week && styles.historyPicked,
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

/**
 * The sessions behind one zone's minutes in one week, most minutes first, so
 * "where did 128 minutes of zone 1 come from" has an answer.
 */
function ZoneSessions({ workouts, zoneKey, week, label, onClose }) {
  const rows = (workouts ?? [])
    .filter((w) => weekKey(w.date) === week.week && (w[zoneKey] ?? 0) > 0)
    .sort((a, b) => b[zoneKey] - a[zoneKey] || String(b.start ?? '').localeCompare(String(a.start ?? '')));
  const total = rows.reduce((sum, w) => sum + w[zoneKey], 0);
  return (
    <View style={styles.drill}>
      <View style={styles.drillHead}>
        <Text style={styles.drillTitle}>
          {LABELS[zoneKey]} · {week.label}
          {label ? ` · ${label}` : ''}
        </Text>
        <Text style={styles.drillClose} onPress={onClose}>
          Close
        </Text>
      </View>
      {rows.length ? (
        rows.map((w) => (
          <View key={w.id} style={styles.drillRow}>
            <Text style={styles.drillName} numberOfLines={1}>
              {describeType(w.type).label}
            </Text>
            <Text style={styles.drillDate} numberOfLines={1}>
              {formatDayLabel(w.date)} · {Math.round(w.durationMin)} min session
            </Text>
            <Text style={styles.drillValue}>{w[zoneKey]} min</Text>
          </View>
        ))
      ) : (
        <Text style={styles.drillEmpty}>No session that week had time in this zone.</Text>
      )}
      {rows.length > 1 ? (
        <View style={[styles.drillRow, styles.drillTotal]}>
          <Text style={styles.drillName}>Total</Text>
          <Text style={styles.drillDate} />
          <Text style={styles.drillValue}>{total} min</Text>
        </View>
      ) : null}
    </View>
  );
}

/** "80–116 bpm", "117–127 bpm", "128–139 bpm" — what each zone box is counting. */
function zoneRanges(bands) {
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const low1 = num(bands?.zone1Low) ?? 0;
  const high1 = num(bands?.zone1High);
  const low2 = num(bands?.cardioLow);
  const high2 = num(bands?.cardioHigh);
  const zone2 = low2 != null && high2 != null;
  const high3 = num(bands?.zone3High);
  const low3 = num(bands?.zone3Low) ?? (high2 != null ? high2 + 1 : null);
  return {
    zoneMin: high1 != null ? (low1 > 0 ? `${low1}–${high1} bpm` : `up to ${high1} bpm`) : null,
    cardioMin: zone2 ? `${low2}–${high2} bpm` : null,
    zone3Min: high3 != null && low3 != null ? `${low3}–${high3} bpm` : null,
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
  // Which zone and week is opened up into its sessions, if any.
  const [picked, setPicked] = useState(null);
  const pick = (key, week) =>
    setPicked((now) => (now?.key === key && now?.week === week.week ? null : { key, week: week.week }));
  const pickedWeek = picked ? weeks.find((w) => w.week === picked.week) ?? null : null;
  const zoneKeys = ZONE_KEYS.filter((k) => goals[k] > 0 || ranges[k] || current.counts[k] > 0);
  if (!planKeys.length && !zoneKeys.length) return null;

  const cells = (list, subs, pressable = false) => (
    <View style={styles.row}>
      {list.map((k) => (
        <Cell
          key={k}
          onPress={pressable ? () => pick(k, current) : undefined}
          selected={pressable && picked?.key === k && picked?.week === current.week}
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
          {cells(zoneKeys, ranges, true)}
          {picked && pickedWeek ? (
            <ZoneSessions
              workouts={workouts}
              zoneKey={picked.key}
              week={pickedWeek}
              label={ranges[picked.key]}
              onClose={() => setPicked(null)}
            />
          ) : (
            <Text style={styles.tapHint}>Tap a zone to see the sessions behind it.</Text>
          )}
          {!compact ? (
            <History weeks={weeks} keys={zoneKeys} goals={goals} onPick={pick} picked={picked} />
          ) : null}
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
  cellSelected: { borderColor: colors.ink, borderWidth: 2 },
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
  historyPicked: { textDecorationLine: 'underline' },
  tapHint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm },

  drill: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  drillHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  drillTitle: { flex: 1, fontSize: fonts.small, fontWeight: '700', color: colors.ink },
  drillClose: { fontSize: fonts.small, fontWeight: '700', color: colors.primary, paddingLeft: spacing.sm },
  drillRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 5, gap: spacing.sm },
  drillName: { flex: 1.2, fontSize: fonts.small, color: colors.ink, fontWeight: '600' },
  drillDate: { flex: 1.6, fontSize: fonts.tiny, color: colors.inkSoft },
  drillValue: { fontSize: fonts.small, fontWeight: '700', color: colors.ink, textAlign: 'right' },
  drillTotal: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 2 },
  drillEmpty: { fontSize: fonts.small, color: colors.inkSoft, paddingVertical: 5 },

  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm, textAlign: 'right' },
});

export default memo(KpiCard);
