import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel, formatTime } from '../lib/dates';
import { healthSupported } from '../lib/health';
import { watchWorkoutNotes } from '../lib/store';
import { describeAge, useHealthData } from '../lib/useHealthData';
import {
  applyNotes,
  beatsPerKm,
  describeType,
  efficiencyTrend,
  ON_FOOT,
  formatDuration,
  formatKm,
  formatPace,
  groupByWeek,
  exerciseMinutesThisWeek,
  symptomLabel,
  weeklyExerciseMinutes,
} from '../lib/workouts';
import { BarChart, TimeChart } from '../charts';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty, Pill, Segmented } from '../ui';
import KpiCard from './KpiCard';
import MonthlyCard from './MonthlyCard';
import MonthSheet from './MonthSheet';
import StreakCard from './StreakCard';
import WorkoutNoteSheet from './WorkoutNoteSheet';

/**
 * Every session Health holds for the past year, newest first, a week at a time.
 *
 * Weekly totals sit above each group because the question after a layoff is
 * rarely "how was that run" and usually "am I doing more than last week".
 */
export default function WorkoutsScreen() {
  const { user, profile } = useAuth();
  const { series, workouts: recorded, loading, refreshing, denied, capturedAt } = useHealthData();
  const [notes, setNotes] = useState({});
  const workouts = applyNotes(recorded, notes);
  const [noting, setNoting] = useState(null);
  const [month, setMonth] = useState(null);
  const [footType, setFootType] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    return watchWorkoutNotes(user.uid, setNotes);
  }, [user]);

  if ((loading || refreshing) && !workouts.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reading Apple Health…</Text>
      </View>
    );
  }

  const weeks = groupByWeek(workouts);
  const target = profile?.weeklyMinutesTarget ?? 630;
  const ring = series?.exerciseMinutes;
  const thisWeek = exerciseMinutesThisWeek(ring, workouts);
  const hasRuns = workouts.some((w) => ON_FOOT.runs.includes(w.type) && beatsPerKm(w));
  const hasWalks = workouts.some((w) => ON_FOOT.walks.includes(w.type) && beatsPerKm(w));
  // Default to the split view when both exist; a walk costs fewer beats per km
  // than a run, so a combined line would track the mix rather than fitness.
  const which = footType ?? (hasRuns && hasWalks ? 'runs' : 'all');
  const efficiency = efficiencyTrend(workouts, 10, which);
  const efficiencyAny = efficiencyTrend(workouts, 10, 'all');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Workouts</Text>
      <Text style={styles.subtitle}>
        {workouts.length
          ? `${workouts.length} session${workouts.length === 1 ? '' : 's'} in the last year`
          : 'From Apple Health'}
      </Text>

      {refreshing ? <Text style={styles.refreshNote}>Checking Apple Health for new sessions…</Text> : null}

      {capturedAt ? (
        <Text style={styles.syncNote}>
          Synced from your iPhone {describeAge(capturedAt)}. Open Noodle there to refresh.
        </Text>
      ) : null}

      {denied ? (
        <Empty
          title="Health access is off"
          body="Open the Health app, then Sharing → Apps → Noodle, and turn Workouts and Heart on."
        />
      ) : null}

      {!workouts.length && !denied ? (
        <Empty
          title="No workouts yet"
          body={
            healthSupported
              ? 'Sessions recorded on the watch, or logged in an app that writes to Health, show up here.'
              : 'Open Noodle on your iPhone once and your workouts will appear here.'
          }
        />
      ) : null}

      {workouts.length ? <KpiCard workouts={workouts} kpis={profile?.kpis} /> : null}
      {workouts.length ? (
        <StreakCard workouts={workouts} minKm={profile?.streakKm ?? 10} onPick={setNoting} />
      ) : null}

      {workouts.length ? (
        <Card>
          <View style={styles.targetRow}>
            <Text style={styles.targetLabel}>This week</Text>
            <Text style={styles.targetValue}>
              {Math.round(thisWeek)} / {target} min
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.min(100, (thisWeek / target) * 100)}%` },
              ]}
            />
          </View>
          <BarChart bars={weeklyExerciseMinutes(ring, workouts, 12)} target={target} />
          <Text style={styles.targetHint}>
            {ring?.length
              ? 'Exercise-ring minutes per week, the same count as the Fitness app, for the last twelve weeks against the target in Settings.'
              : 'Minutes per week for the last twelve, against the target in Settings.'}{' '}
            Steady weeks beat big ones.
          </Text>
        </Card>
      ) : null}

      {efficiencyAny.sessions.length >= 2 ? (
        <Card>
          <Text style={styles.effTitle}>Heartbeats per kilometre</Text>
          <Text style={styles.effBody}>
            How much heart it took to cover the ground. Lower means the same distance is costing
            fewer beats — the fitness measure that still works on a beta-blocker. Runs and walks
            are best read apart: a walk costs fewer beats than a run.
          </Text>
          {hasRuns && hasWalks ? (
            <Segmented
              options={[
                { label: 'Runs', value: 'runs' },
                { label: 'Walks', value: 'walks' },
                { label: 'Combined', value: 'all' },
              ]}
              value={which}
              onChange={setFootType}
              style={styles.segmented}
            />
          ) : null}
          {efficiency.sessions.length >= 2 ? (
            <>
              <TimeChart
                points={efficiency.sessions.map((w) => ({ id: w.id, date: w.date, value: w.beatsPerKm }))}
                band={null}
                outside="none"
                format={(v) => String(Math.round(v))}
                onPointPress={(point) => {
                  const session = efficiency.sessions.find((w) => w.id === point.id);
                  if (session) setNoting(session);
                }}
              />
              <Text style={styles.effHint}>Tap a dot to open that session.</Text>
            </>
          ) : (
            <Text style={styles.effTrend}>Not enough {which === 'all' ? 'sessions' : which} yet.</Text>
          )}
          {efficiency.change != null ? (
            <Text style={styles.effTrend}>
              Recent average {Math.round(efficiency.recent)} vs {Math.round(efficiency.earlier)}{' '}
              earlier
              {Math.abs(efficiency.change) < 10
                ? ' — about the same.'
                : efficiency.change < 0
                  ? ' — fewer beats for the same distance.'
                  : ' — more beats for the same distance; worth a look at pace, heat and sleep.'}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {workouts.length ? <MonthlyCard
          workouts={workouts}
          targets={profile?.monthly}
          events={profile?.events}
          onMonthPress={setMonth}
        /> : null}

      {weeks.map((week) => (
        <View key={week.week}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekLabel}>{weekLabel(week.week)}</Text>
            <Text style={styles.weekTotals}>
              {week.sessions.length} session{week.sessions.length === 1 ? '' : 's'} ·{' '}
              {formatDuration(week.minutes)}
              {week.metres ? ` · ${formatKm(week.metres)}` : ''}
            </Text>
          </View>
          {week.sessions.map((workout) => (
            <WorkoutRow
              key={workout.id}
              workout={workout}
              note={notes[workout.id]}
              onPress={() => setNoting(workout)}
            />
          ))}
        </View>
      ))}

      {workouts.length ? (
        <Text style={styles.disclaimer}>
          Tap a session to note how it felt. Strength sessions from Jefit arrive as a duration and
          heart rate only; Health has no place for sets, reps or weight lifted.
        </Text>
      ) : null}

      {month ? (
        <MonthSheet
          month={month}
          workouts={workouts}
          notes={notes}
          onPick={(workout) => {
            setMonth(null);
            setNoting(workout);
          }}
          onClose={() => setMonth(null)}
        />
      ) : null}

      {noting ? (
        <WorkoutNoteSheet workout={noting} note={notes[noting.id]} onClose={() => setNoting(null)} />
      ) : null}
    </ScrollView>
  );
}

function WorkoutRow({ workout, note, onPress }) {
  const type = describeType(workout.type);
  const pace = formatPace(workout.metres, workout.durationMin);
  const details = [
    formatDuration(workout.durationMin),
    formatKm(workout.metres),
    pace,
    workout.kcal ? `${workout.kcal} kcal` : null,
  ].filter(Boolean);

  const bpk = beatsPerKm(workout);
  const symptoms = (note?.symptoms ?? []).filter((k) => k !== 'fine');

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        <Text style={styles.icon}>{type.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {type.label}
            {workout.indoor ? ' (indoor)' : ''}
          </Text>
          <Text style={styles.rowMeta}>
            {formatDayLabel(workout.date)} · {formatTime(workout.start)}
            {workout.source ? ` · ${workout.source}` : ''}
          </Text>
          <Text style={styles.rowDetails}>{details.join(' · ')}</Text>
          {bpk || workout.hrr || workout.zoneMin != null ? (
            <Text style={styles.rowExtra}>
              {[
                bpk ? `${bpk} beats/km` : null,
                workout.hrr ? `recovery −${workout.hrr} bpm` : null,
                workout.zoneMin != null ? `${workout.zoneMin} min in zone 1` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          {symptoms.length || note?.text ? (
            <View style={styles.pillWrap}>
              <Pill tone={symptoms.length ? 'warn' : 'neutral'}>
                {symptoms.length ? symptoms.map(symptomLabel).join(', ') : 'Note'}
              </Pill>
            </View>
          ) : note?.symptoms?.includes('fine') ? (
            <View style={styles.pillWrap}>
              <Pill tone="good">Felt fine</Pill>
            </View>
          ) : null}
        </View>
        {workout.avgHr ? (
          <View style={styles.hrBlock}>
            <Text style={styles.hrValue}>{workout.avgHr}</Text>
            <Text style={styles.hrLabel}>avg bpm</Text>
            {workout.maxHr ? <Text style={styles.hrLabel}>max {workout.maxHr}</Text> : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function weekLabel(mondayKey) {
  const [y, m, d] = mondayKey.split('-').map(Number);
  const monday = new Date(y, m - 1, d);
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);
  const weeksAgo = Math.round((thisMonday - monday) / (7 * 86_400_000));
  if (weeksAgo === 0) return 'This week';
  if (weeksAgo === 1) return 'Last week';
  return `Week of ${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.md },

  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md },
  refreshNote: { fontSize: fonts.tiny, color: colors.inkSoft, marginBottom: spacing.sm },
  syncNote: {
    fontSize: fonts.tiny,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: spacing.md,
    lineHeight: 17,
  },

  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  weekLabel: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  weekTotals: { fontSize: fonts.tiny, color: colors.inkSoft },

  targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  targetLabel: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  targetValue: { fontSize: fonts.body, fontWeight: '700', color: colors.primary },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.line, marginTop: spacing.sm, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 5 },
  targetHint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm },

  effTitle: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  effBody: { fontSize: fonts.tiny, color: colors.inkSoft, lineHeight: 17, marginTop: spacing.xs },
  segmented: { marginTop: spacing.md },
  effHint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'right', marginTop: spacing.xs },
  effTrend: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.md, lineHeight: 20 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { fontSize: 28 },
  rowTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  rowDetails: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.xs },
  rowExtra: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  pillWrap: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  hrBlock: { alignItems: 'flex-end' },
  hrValue: { fontSize: fonts.big, fontWeight: '800', color: colors.ink },
  hrLabel: { fontSize: fonts.tiny, color: colors.inkSoft },

  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
