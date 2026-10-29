import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel, formatTime } from '../lib/dates';
import { saveWorkoutNote } from '../lib/store';
import { describeType, formatDuration, SYMPTOMS, WORKOUT_TYPES } from '../lib/workouts';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, Dropdown } from '../ui';
import RouteMap from './RouteMap';
import SheetHeader from './SheetHeader';

/**
 * How a session felt, in one tap each.
 *
 * The point is the pairing: a symptom logged against the heart rate and pace it
 * happened at is what a cardiologist can act on, where "sometimes I feel
 * breathless" is not. Nothing here interprets the answer.
 */
export default function WorkoutNoteSheet({ workout, note, onClose }) {
  const { user } = useAuth();
  const [symptoms, setSymptoms] = useState([]);
  const [text, setText] = useState('');
  const [typeOverride, setTypeOverride] = useState(null);
  const [milestone, setMilestone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSymptoms(note?.symptoms ?? []);
    setText(note?.text ?? '');
    setTypeOverride(note?.typeOverride ?? null);
    setMilestone(note?.milestone ?? '');
  }, [note, workout?.id]);

  if (!workout) return null;
  const recordedType = workout.originalType ?? workout.type;
  const type = describeType(typeOverride ?? recordedType);
  const typeOptions = Object.entries(WORKOUT_TYPES)
    .map(([value, info]) => ({ value: Number(value), label: `${info.icon} ${info.label}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  function toggle(key) {
    setSymptoms((current) => {
      if (key === 'fine') return current.includes('fine') ? [] : ['fine'];
      const without = current.filter((s) => s !== 'fine' && s !== key);
      return current.includes(key) ? without : [...without, key];
    });
  }

  async function save() {
    setSaving(true);
    try {
      await saveWorkoutNote(user.uid, workout.id, {
        symptoms,
        text: text.trim(),
        typeOverride: typeOverride && typeOverride !== recordedType ? typeOverride : null,
        milestone: milestone.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SheetHeader onBack={onClose} onDone={save} doneLabel={saving ? 'Saving…' : 'Save'} doneDisabled={saving} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>How did it feel?</Text>
        <Text style={styles.subtitle}>
          {type.icon} {type.label} · {formatDayLabel(workout.date)} {formatTime(workout.start)} ·{' '}
          {formatDuration(workout.durationMin)}
          {workout.avgHr ? ` · ${workout.avgHr} bpm avg` : ''}
        </Text>

        <RouteMap workout={workout} />

        <Dropdown
          label="Recorded as"
          value={typeOverride ?? recordedType}
          options={typeOptions}
          onChange={(value) => setTypeOverride(value)}
          hint="Health keeps whatever the watch recorded; Noodle uses what you choose here."
        />

        <Text style={styles.label}>How did it feel?</Text>
        <View style={styles.chips}>
          {SYMPTOMS.map((symptom) => {
            const on = symptoms.includes(symptom.key);
            return (
              <Pressable
                key={symptom.key}
                onPress={() => toggle(symptom.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{symptom.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Anything else — when in the session, what you were doing, how long it lasted"
          placeholderTextColor={colors.inkSoft}
          value={text}
          onChangeText={setText}
          multiline
        />

        <Text style={styles.label}>Milestone</Text>
        <TextInput
          style={[styles.input, styles.milestoneInput]}
          placeholder="Name it to keep it on Today — e.g. Victoria Marathon"
          placeholderTextColor={colors.inkSoft}
          value={milestone}
          onChangeText={setMilestone}
        />
        <Text style={styles.milestoneHint}>
          Sessions with the same name show as one milestone, so a multi-day trip can share one.
        </Text>

        <Button title="Save" onPress={save} loading={saving} />
        <Button title="Cancel" variant="ghost" onPress={onClose} />

        <Text style={styles.caveat}>
          Chest discomfort, pressure or unusual breathlessness during or after exercise is
          something to tell your cardiac team about now, not something to log and wait on. If
          it is happening right now, call 911.
        </Text>
      </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  milestoneInput: { minHeight: 0, marginBottom: spacing.xs },
  milestoneHint: { fontSize: fonts.tiny, color: colors.inkSoft, marginBottom: spacing.lg },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: colors.bg, flexGrow: 1 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.lg, lineHeight: 20 },
  label: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: fonts.small, color: colors.ink },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    padding: spacing.md,
    minHeight: 90,
    fontSize: fonts.body,
    color: colors.ink,
    marginBottom: spacing.lg,
    textAlignVertical: 'top',
  },
  caveat: { fontSize: fonts.tiny, color: colors.inkSoft, lineHeight: 18, marginTop: spacing.lg, textAlign: 'center' },
});
