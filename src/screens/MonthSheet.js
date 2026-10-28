import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDayLabel, formatTime } from '../lib/dates';
import {
  beatsPerKm,
  describeType,
  formatDuration,
  formatKm,
  formatPace,
  formatPaceMin,
} from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Button, Card } from '../ui';

/**
 * One month, in two steps: first a summary per activity (runs, walks,
 * strength, yoga…), then — on tapping an activity — its sessions, each of
 * which opens its note sheet.
 */
export default function MonthSheet({ month, workouts, notes, onPick, onClose }) {
  const [type, setType] = useState(null);
  if (!month) return null;

  const [y, m] = month.split('-').map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const sessions = (workouts ?? [])
    .filter((w) => w.date.startsWith(month))
    .sort((a, b) => b.start.localeCompare(a.start));
  const minutes = sessions.reduce((sum, w) => sum + (w.durationMin ?? 0), 0);

  const groups = summarise(sessions);
  const chosen = type == null ? null : groups.find((g) => g.type === type);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView contentContainerStyle={styles.container}>
        {chosen ? (
          <>
            <Pressable onPress={() => setType(null)} hitSlop={10}>
              <Text style={styles.back}>‹ {title}</Text>
            </Pressable>
            <Text style={styles.title}>
              {chosen.icon} {chosen.label}
            </Text>
            <Text style={styles.subtitle}>{groupLine(chosen)}</Text>

            {chosen.sessions.map((workout) => (
              <SessionRow
                key={workout.id}
                workout={workout}
                note={notes?.[workout.id]}
                onPress={() => onPick(workout)}
              />
            ))}
          </>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>
              {sessions.length} session{sessions.length === 1 ? '' : 's'} · {formatDuration(minutes)}
            </Text>

            {groups.map((group) => (
              <Pressable key={group.type} onPress={() => setType(group.type)}>
                <Card style={styles.row}>
                  <Text style={styles.icon}>{group.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{group.label}</Text>
                    <Text style={styles.rowDetails}>{groupLine(group)}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Card>
              </Pressable>
            ))}
            {groups.length ? <Text style={styles.hint}>Tap an activity to see its sessions.</Text> : null}
          </>
        )}

        <Button title="Close" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

/** Sessions grouped by activity type, biggest share of time first. */
function summarise(sessions) {
  const byType = new Map();
  for (const w of sessions) {
    const g = byType.get(w.type) ?? { type: w.type, ...describeType(w.type), sessions: [], minutes: 0, metres: 0, beats: 0, hrMinutes: 0 };
    g.sessions.push(w);
    g.minutes += w.durationMin ?? 0;
    g.metres += w.metres ?? 0;
    if (w.avgHr && w.durationMin) {
      g.beats += w.avgHr * w.durationMin;
      g.hrMinutes += w.durationMin;
    }
    byType.set(w.type, g);
  }
  return [...byType.values()].sort((a, b) => b.minutes - a.minutes);
}

/** "5 sessions · 6h 12m · 48.2 km · 8:56 /km · 112 bpm" — whatever applies. */
function groupLine(group) {
  const count = group.sessions.length;
  const parts = [
    `${count} session${count === 1 ? '' : 's'}`,
    formatDuration(group.minutes),
    group.metres >= 500 ? formatKm(group.metres) : null,
    group.metres >= 500 && (group.type === 37 || group.type === 52 || group.type === 24)
      ? `${formatPaceMin(group.minutes / (group.metres / 1000))} /km`
      : null,
    group.hrMinutes ? `${Math.round(group.beats / group.hrMinutes)} bpm avg` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

function SessionRow({ workout, note, onPress }) {
  const bpk = beatsPerKm(workout);
  const details = [
    formatDuration(workout.durationMin),
    formatKm(workout.metres),
    formatPace(workout.metres, workout.durationMin),
    workout.avgHr ? `${workout.avgHr} bpm` : null,
    bpk ? `${bpk} beats/km` : null,
  ].filter(Boolean);
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            {formatDayLabel(workout.date)} · {formatTime(workout.start)}
          </Text>
          {workout.source ? <Text style={styles.rowMeta}>{workout.source}</Text> : null}
          <Text style={styles.rowDetails}>{details.join(' · ')}</Text>
          {note?.symptoms?.length || note?.text ? <Text style={styles.rowNote}>Noted</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: colors.bg, flexGrow: 1 },
  back: { fontSize: fonts.small, color: colors.primary, fontWeight: '700', marginBottom: spacing.sm },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.lg, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { fontSize: 26 },
  rowTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  rowDetails: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.xs },
  rowNote: { fontSize: fonts.tiny, color: colors.primary, fontWeight: '700', marginTop: 2 },
  chevron: { fontSize: fonts.title, color: colors.inkSoft },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'right', marginBottom: spacing.sm },
});
