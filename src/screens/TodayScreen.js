import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { addDays, dayKey, formatDayLabel, formatTime } from '../lib/dates';
import { healthSupported } from '../lib/health';
import { watchWeights, watchWorkoutNotes } from '../lib/store';
import { kgToLb } from '../lib/units';
import { describeAge, formatHours, useHealthData } from '../lib/useHealthData';
import { suddenGain } from '../lib/weight';
import {
  againstBaseline,
  applyNotes,
  beatsPerKm,
  describeType,
  formatDuration,
  formatKm,
  formatPace,
  exerciseMinutesThisWeek,
  onDay,
} from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card, Empty, Pill } from '../ui';
import KpiCard from './KpiCard';
import WorkoutNoteSheet from './WorkoutNoteSheet';

/**
 * The morning view: what happened last night, how the body reads this morning,
 * and what has been done today.
 *
 * Every comparison is against the same person's previous month. Nothing here
 * says what a number should be — on a beta-blocker, after a layoff, in a different
 * time zone, "normal" is whatever the last few weeks looked like, and that is the
 * only baseline this screen uses.
 */
export default function TodayScreen() {
  const { user, profile } = useAuth();
  const { series, workouts: recorded, loading, refreshing, denied, capturedAt } = useHealthData();
  const [notes, setNotes] = useState({});
  const workouts = useMemo(() => applyNotes(recorded, notes), [recorded, notes]);
  const [weights, setWeights] = useState([]);
  const [noting, setNoting] = useState(null);
  const today = dayKey();

  useEffect(() => {
    if (!user) return undefined;
    const stopNotes = watchWorkoutNotes(user.uid, setNotes);
    const stopWeights = watchWeights(user.uid, setWeights);
    return () => {
      stopNotes();
      stopWeights();
    };
  }, [user]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Reading Apple Health…</Text>
      </View>
    );
  }

  const sessionsToday = onDay(workouts, today);
  const sessionsYesterday = onDay(workouts, addDays(today, -1));
  const sleep = series?.sleep ?? [];
  const lastNight = sleep.length ? sleep[sleep.length - 1] : null;
  const nightIsRecent = lastNight && lastNight.date >= addDays(today, -1);
  const resting = againstBaseline(series?.restingHeartRate);
  const hrv = againstBaseline(series?.hrv);
  const gain = suddenGain(weights);
  const target = profile?.weeklyMinutesTarget ?? 630;
  const thisWeek = exerciseMinutesThisWeek(series?.exerciseMinutes, workouts);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.subtitle}>{longDate()}</Text>
      {refreshing ? <Text style={styles.refreshNote}>Updating from Apple Health…</Text> : null}

      {denied ? (
        <Empty
          title="Health access is off"
          body="Open the Health app, then Sharing → Apps → Noodle, and turn Workouts, Sleep and Heart on."
        />
      ) : null}

      {capturedAt ? (
        <Text style={styles.syncNote}>
          Synced from your iPhone {describeAge(capturedAt)}. Open Noodle there to refresh.
        </Text>
      ) : null}

      {!healthSupported && !series && !workouts.length ? (
        <Empty
          title="Nothing synced yet"
          body="Apple Health only exists on iOS. Open Noodle on your iPhone once and it will mirror everything here."
        />
      ) : null}

      {gain ? (
        <Card style={styles.flagCard}>
          <Text style={styles.flagTitle}>Weight up {kgToLb(gain.gainKg).toFixed(1)} lb</Text>
          <Text style={styles.flagBody}>
            {gain.window === 'day' ? 'Since yesterday' : `Since ${formatDayLabel(gain.since)}`}.
            A jump this size after a heart attack is one care teams ask to hear about, because
            it can be fluid rather than food. Worth a call if it holds tomorrow, sooner with any
            swelling or breathlessness.
          </Text>
        </Card>
      ) : null}

      <Text style={styles.sectionHeading}>Workouts</Text>
      {sessionsToday.length ? (
        sessionsToday.map((workout) => (
          <WorkoutCard
            key={workout.id}
            workout={workout}
            note={notes[workout.id]}
            onPress={() => setNoting(workout)}
          />
        ))
      ) : (
        <Card>
          <Text style={styles.restTitle}>Nothing yet today</Text>
          <Text style={styles.restBody}>
            {sessionsYesterday.length
              ? `Yesterday: ${sessionsYesterday
                  .map((w) => `${describeType(w.type).label.toLowerCase()} ${formatDuration(w.durationMin)}`)
                  .join(', ')}.`
              : 'A workout recorded on the watch, or logged in an app that writes to Health, shows up here.'}
          </Text>
        </Card>
      )}
      {workouts.length ? (
        <Text style={styles.weekLine}>
          {Math.round(thisWeek)} of {target} min this week
        </Text>
      ) : null}
      {workouts.length ? <KpiCard workouts={workouts} kpis={profile?.kpis} compact /> : null}

      <Text style={styles.sectionHeading}>Last night</Text>
      {nightIsRecent ? (
        <Card style={styles.heroCard}>
          <Text style={styles.heroValue}>{formatHours(lastNight.value)}</Text>
          <Text style={styles.heroUnit}>asleep</Text>
          {lastNight.stages && lastNight.stages.deep + lastNight.stages.rem > 0 ? (
            <Text style={styles.heroStages}>
              {formatHours(lastNight.stages.deep)} deep · {formatHours(lastNight.stages.rem)} REM ·{' '}
              {formatHours(lastNight.stages.core)} core
            </Text>
          ) : null}
          <BaselineLine
            compare={againstBaseline(sleep)}
            format={(h) => `${Math.round(Math.abs(h) * 60)} min`}
            threshold={0.25}
          />
        </Card>
      ) : (
        <Card>
          <Text style={styles.restTitle}>No sleep recorded</Text>
          <Text style={styles.restBody}>
            {lastNight
              ? `The last night Health has is ${formatDayLabel(lastNight.date)}. The watch records sleep when it is worn overnight.`
              : 'The watch records sleep when it is worn overnight.'}
          </Text>
        </Card>
      )}

      <Text style={styles.sectionHeading}>This morning</Text>
      <View style={styles.vitalsRow}>
        <VitalCard
          label="Resting HR"
          unit="bpm"
          compare={resting}
          format={(v) => Math.round(v)}
          threshold={2}
        />
        <VitalCard
          label="HRV"
          unit="ms"
          compare={hrv}
          format={(v) => Math.round(v)}
          threshold={5}
        />
      </View>

      <Text style={styles.disclaimer}>
        Compared only with your own last 30 days. Medication, travel and a new routine all move
        these numbers, and Noodle does not know which is which. Anything that worries you is a
        conversation with your doctor.
      </Text>

      {noting ? (
        <WorkoutNoteSheet workout={noting} note={notes[noting.id]} onClose={() => setNoting(null)} />
      ) : null}
    </ScrollView>
  );
}

function WorkoutCard({ workout, note, onPress }) {
  const type = describeType(workout.type);
  const pace = formatPace(workout.metres, workout.durationMin);
  const details = [
    formatDuration(workout.durationMin),
    formatKm(workout.metres),
    pace,
    workout.kcal ? `${workout.kcal} kcal` : null,
  ].filter(Boolean);

  const bpk = beatsPerKm(workout);
  const hasNote = note && (note.symptoms?.length || note.text);

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.workoutCard}>
        <Text style={styles.workoutIcon}>{type.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.workoutTitle}>{type.label}</Text>
          <Text style={styles.workoutMeta}>
            {formatTime(workout.start)}
            {workout.source ? ` · ${workout.source}` : ''}
          </Text>
          <Text style={styles.workoutDetails}>{details.join(' · ')}</Text>
          {bpk || workout.hrr || workout.zoneMin != null ? (
            <Text style={styles.workoutExtra}>
              {[
                bpk ? `${bpk} beats/km` : null,
                workout.hrr ? `recovery −${workout.hrr} bpm` : null,
                workout.zoneMin != null ? `${workout.zoneMin} min in zone 1` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <View style={styles.pillWrap}>
            <Pill tone={hasNote ? (note.symptoms?.some((k) => k !== 'fine') ? 'warn' : 'good') : 'neutral'}>
              {hasNote ? 'Noted · tap to change' : 'How did it feel? Tap to note'}
            </Pill>
          </View>
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

function VitalCard({ label, unit, compare, format, threshold }) {
  return (
    <Card style={styles.vitalCard}>
      <Text style={styles.vitalLabel}>{label}</Text>
      {compare ? (
        <>
          <Text style={styles.vitalValue}>
            {format(compare.value)}
            <Text style={styles.vitalUnit}> {unit}</Text>
          </Text>
          <Text style={styles.vitalDate}>{formatDayLabel(compare.date)}</Text>
          <BaselineLine compare={compare} format={format} threshold={threshold} />
        </>
      ) : (
        <Text style={styles.vitalEmpty}>No reading yet</Text>
      )}
    </Card>
  );
}

/** "3 above your 30-day average", or quiet when the difference is within noise. */
function BaselineLine({ compare, format, threshold }) {
  if (!compare || compare.baseline == null) return null;
  const change = compare.change;
  if (Math.abs(change) < threshold) {
    return <Text style={styles.baseline}>About your 30-day average</Text>;
  }
  return (
    <Text style={styles.baseline}>
      {format(Math.abs(change))} {change > 0 ? 'above' : 'below'} your 30-day average
    </Text>
  );
}

function longDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
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

  sectionHeading: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  restTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  restBody: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.xs, lineHeight: 20 },

  workoutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  workoutIcon: { fontSize: 30 },
  workoutTitle: { fontSize: fonts.big, fontWeight: '700', color: colors.ink },
  workoutMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  workoutDetails: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.xs },
  workoutExtra: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  pillWrap: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  weekLine: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: -spacing.xs, marginBottom: spacing.xs },

  flagCard: { backgroundColor: colors.accentSoft, borderColor: colors.accent, marginTop: spacing.md },
  flagTitle: { fontSize: fonts.big, fontWeight: '800', color: colors.ink },
  flagBody: { fontSize: fonts.small, color: colors.ink, lineHeight: 20, marginTop: spacing.xs },
  hrBlock: { alignItems: 'flex-end' },
  hrValue: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  hrLabel: { fontSize: fonts.tiny, color: colors.inkSoft },

  heroCard: { alignItems: 'center', paddingVertical: spacing.xl },
  heroValue: { fontSize: 52, fontWeight: '800', color: colors.ink, lineHeight: 58 },
  heroUnit: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroStages: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.sm },

  vitalsRow: { flexDirection: 'row', gap: spacing.md },
  vitalCard: { flex: 1 },
  vitalLabel: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft },
  vitalValue: { fontSize: fonts.hero, fontWeight: '800', color: colors.ink, marginTop: spacing.xs },
  vitalUnit: { fontSize: fonts.small, fontWeight: '600', color: colors.inkSoft },
  vitalDate: { fontSize: fonts.tiny, color: colors.inkSoft },
  vitalEmpty: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },
  baseline: { fontSize: fonts.tiny, color: colors.ink, marginTop: spacing.sm, lineHeight: 17 },

  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
