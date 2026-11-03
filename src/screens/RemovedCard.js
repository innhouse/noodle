import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel, formatTime } from '../lib/dates';
import { setWorkoutRemoved, watchWorkoutNotes } from '../lib/store';
import { describeType, formatDuration } from '../lib/workouts';
import { colors, fonts, spacing } from '../theme';
import { Card } from '../ui';

/** Sessions removed from Noodle in their sheet, each with a way back. */
export default function RemovedCard({ workouts }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState({});

  useEffect(() => (user ? watchWorkoutNotes(user.uid, setNotes) : undefined), [user]);

  const removed = useMemo(
    () => (workouts ?? []).filter((w) => notes[w.id]?.removed).sort((a, b) => b.start.localeCompare(a.start)),
    [workouts, notes]
  );
  if (!removed.length) return null;

  return (
    <Card>
      <Text style={styles.title}>Removed sessions</Text>
      <Text style={styles.body}>Left out of Noodle's counts and charts. Apple Health still has them.</Text>
      {removed.map((w) => {
        const { icon, label } = describeType(w.type);
        return (
          <View key={w.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {icon} {label}
              </Text>
              <Text style={styles.meta}>
                {formatDayLabel(w.date)} {formatTime(w.start)} · {formatDuration(w.durationMin)}
              </Text>
            </View>
            <Pressable onPress={() => setWorkoutRemoved(user.uid, w.id, false)} hitSlop={8}>
              <Text style={styles.action}>Bring back</Text>
            </Pressable>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  body: { fontSize: fonts.small, color: colors.inkSoft, lineHeight: 20, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  name: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  action: { fontSize: fonts.small, color: colors.primary, fontWeight: '700' },
});
