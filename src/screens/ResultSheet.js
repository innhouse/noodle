import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatClock, parseClock } from '../lib/milestones';
import { deleteResult, saveResult } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Button, Field, Segmented } from '../ui';
import SheetHeader from './SheetHeader';

const SPORTS = [
  { value: 13, label: '🚴 Ride' },
  { value: 37, label: '🏃 Run' },
  { value: 46, label: '🏊 Swim' },
  { value: 3000, label: '💪 Other' },
];

const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/[,\s]/g, '')) || null);
const str = (v) => (v == null ? '' : String(v));

/**
 * An official result, typed in from the results site — finish time and
 * placings. With a name matching a milestone it joins that milestone; without
 * one it becomes a milestone of its own, for events Health never saw.
 */
export default function ResultSheet({ result, defaults, onClose }) {
  const { user } = useAuth();
  const start = result ?? defaults ?? {};
  const [form, setForm] = useState({
    name: str(start.name),
    date: str(start.date),
    type: start.type ?? 13,
    km: str(start.km),
    time: formatClock(start.timeSec) ?? '',
    overall: str(start.overall?.place),
    overallOf: str(start.overall?.of),
    gender: str(start.gender?.place),
    genderOf: str(start.gender?.of),
    category: str(start.category?.label),
    categoryPlace: str(start.category?.place),
    categoryOf: str(start.category?.of),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    const name = form.name.trim();
    if (!name) return setError('Give it a name — the same name as the milestone if it has one.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) return setError('Date as YYYY-MM-DD, e.g. 2013-09-07.');
    const timeSec = parseClock(form.time);
    if (form.time.trim() && timeSec == null) return setError('Finish time as h:mm:ss, e.g. 5:45:23.');
    setSaving(true);
    try {
      await saveResult(user.uid, {
        id: result?.id,
        name,
        date: form.date.trim(),
        type: form.type,
        km: num(form.km),
        timeSec,
        overall: { place: num(form.overall), of: num(form.overallOf) },
        gender: { place: num(form.gender), of: num(form.genderOf) },
        category: { label: form.category.trim() || null, place: num(form.categoryPlace), of: num(form.categoryOf) },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm) return setConfirm(true);
    await deleteResult(user.uid, result.id);
    onClose();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader onBack={onClose} onDone={save} doneLabel={saving ? 'Saving…' : 'Save'} doneDisabled={saving} />
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{result ? 'Race result' : 'Add a race result'}</Text>
          <Text style={styles.body}>
            From the results page — Sportstats, Race Roster. It shows as a milestone even when Health has
            no session for the day.
          </Text>

          <Field label="Event" value={form.name} onChangeText={(name) => set({ name })} placeholder="Whistler GranFondo 2013" />
          <Field
            label="Date"
            value={form.date}
            onChangeText={(date) => set({ date })}
            placeholder="2013-09-07"
            autoCapitalize="none"
          />
          <Segmented options={SPORTS} value={form.type} onChange={(type) => set({ type })} style={styles.gap} />
          <View style={styles.pair}>
            <View style={styles.half}>
              <Field label="Distance, km" value={form.km} onChangeText={(km) => set({ km })} placeholder="122" keyboardType="decimal-pad" />
            </View>
            <View style={styles.half}>
              <Field label="Finish time" value={form.time} onChangeText={(time) => set({ time })} placeholder="5:45:23" keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          <Text style={styles.label}>Placings</Text>
          <PlaceRow label="Overall" place={form.overall} of={form.overallOf} onPlace={(overall) => set({ overall })} onOf={(overallOf) => set({ overallOf })} />
          <PlaceRow label="Gender" place={form.gender} of={form.genderOf} onPlace={(gender) => set({ gender })} onOf={(genderOf) => set({ genderOf })} />
          <Field label="Category" value={form.category} onChangeText={(category) => set({ category })} placeholder="M50-59" autoCapitalize="characters" />
          <PlaceRow
            label="In category"
            place={form.categoryPlace}
            of={form.categoryOf}
            onPlace={(categoryPlace) => set({ categoryPlace })}
            onOf={(categoryOf) => set({ categoryOf })}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title="Save" onPress={save} loading={saving} />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          {result ? (
            <Text style={styles.remove} onPress={remove}>
              {confirm ? 'Tap again to delete this result' : 'Delete result'}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PlaceRow({ label, place, of, onPlace, onOf }) {
  return (
    <View style={styles.pair}>
      <View style={styles.half}>
        <Field label={`${label}, place`} value={place} onChangeText={onPlace} placeholder="2099" keyboardType="number-pad" />
      </View>
      <View style={styles.half}>
        <Field label="of" value={of} onChangeText={onOf} placeholder="3418" keyboardType="number-pad" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  body: { fontSize: fonts.small, color: colors.inkSoft, lineHeight: 20, marginBottom: spacing.md },
  label: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md, marginBottom: spacing.xs },
  pair: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  gap: { marginVertical: spacing.sm },
  error: { fontSize: fonts.small, color: colors.danger, marginVertical: spacing.sm },
  remove: { fontSize: fonts.small, color: colors.danger, fontWeight: '700', textAlign: 'center', marginTop: spacing.lg },
});
