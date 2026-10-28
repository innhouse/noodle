import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDayLabel, formatTime } from '../lib/dates';
import { beatsPerKm, describeType, formatDuration, formatKm, formatPace } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Button, Card } from '../ui';

/** Every session in one month, newest first; tap one to open its note sheet. */
export default function MonthSheet({ month, workouts, notes, onPick, onClose }) {
  if (!month) return null;
  const [y, m] = month.split('-').map(Number);
  const title = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const sessions = (workouts ?? [])
    .filter((w) => w.date.startsWith(month))
    .sort((a, b) => b.start.localeCompare(a.start));
  const minutes = sessions.reduce((sum, w) => sum + (w.durationMin ?? 0), 0);
  const runKm = sessions.filter((w) => w.type === 37).reduce((sum, w) => sum + (w.metres ?? 0), 0) / 1000;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {sessions.length} session{sessions.length === 1 ? '' : 's'} · {formatDuration(minutes)}
          {runKm ? ` · ${runKm.toFixed(1)} km run` : ''}
        </Text>

        {sessions.map((workout) => {
          const type = describeType(workout.type);
          const bpk = beatsPerKm(workout);
          const details = [
            formatDuration(workout.durationMin),
            formatKm(workout.metres),
            formatPace(workout.metres, workout.durationMin),
            workout.avgHr ? `${workout.avgHr} bpm` : null,
            bpk ? `${bpk} beats/km` : null,
          ].filter(Boolean);
          const note = notes?.[workout.id];
          return (
            <Pressable key={workout.id} onPress={() => onPick(workout)}>
              <Card style={styles.row}>
                <Text style={styles.icon}>{type.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{type.label}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDayLabel(workout.date)} · {formatTime(workout.start)}
                    {workout.source ? ` · ${workout.source}` : ''}
                  </Text>
                  <Text style={styles.rowDetails}>{details.join(' · ')}</Text>
                  {note?.symptoms?.length || note?.text ? (
                    <Text style={styles.rowNote}>Noted</Text>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        })}

        <Button title="Close" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { fontSize: 26 },
  rowTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  rowDetails: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.xs },
  rowNote: { fontSize: fonts.tiny, color: colors.primary, fontWeight: '700', marginTop: 2 },
});
