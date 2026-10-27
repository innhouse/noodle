import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { dayKey, formatDayLabel } from '../lib/dates';
import {
  formatLab,
  LAB_MARKERS,
  latestAndPrevious,
  markerByKey,
  markersWithData,
  meetsTarget,
} from '../lib/labs';
import { deleteLabs, saveLabs, watchLabs } from '../lib/store';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, Card, Empty, Field, Pill } from '../ui';

/**
 * Blood tests, typed in from the report, against the person's own targets.
 *
 * Every number here came from a lab and every target from a cardiologist.
 * Noodle's only contribution is putting them side by side and keeping the
 * history, so the next appointment starts from "LDL went from 3.1 to 1.6"
 * rather than from memory.
 */
export default function LabsScreen() {
  const { user, profile, updateProfile } = useAuth();
  const [tests, setTests] = useState([]);
  const [mode, setMode] = useState(null); // null | 'entry' | 'targets' | 'paste'
  const [pasted, setPasted] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  const [draft, setDraft] = useState({ date: dayKey(), values: {} });
  const [targets, setTargets] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchLabs(user.uid, setTests);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargets(profile?.labTargets ?? {});
  }, [profile]);

  const markers = useMemo(() => markersWithData(tests), [tests]);

  function startEntry(existing) {
    setDraft(
      existing
        ? {
            date: existing.date,
            values: Object.fromEntries(
              Object.entries(existing.values ?? {}).map(([k, v]) => [k, String(v)])
            ),
          }
        : { date: dayKey(), values: {} }
    );
    setMode('entry');
  }

  async function saveEntry() {
    const values = {};
    for (const [key, raw] of Object.entries(draft.values)) {
      const number = Number(String(raw).replace(',', '.'));
      if (raw !== '' && Number.isFinite(number)) values[key] = number;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Object.keys(values).length === 0) return;
    setSaving(true);
    try {
      await saveLabs(user.uid, draft.date, values);
      setMode(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveTargets() {
    const cleaned = {};
    for (const [key, raw] of Object.entries(targets)) {
      const number = Number(String(raw).replace(',', '.'));
      if (raw !== '' && Number.isFinite(number)) cleaned[key] = number;
    }
    setSaving(true);
    try {
      await updateProfile({ labTargets: cleaned });
      setMode(null);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Bulk import from JSON: [{ "date": "YYYY-MM-DD", "values": { "ldl": 1.6, ... } }].
   * Exists so a history transcribed elsewhere can be loaded in one go without the
   * numbers ever being written into the app's own source.
   */
  async function importPasted() {
    let parsed;
    try {
      parsed = JSON.parse(pasted);
    } catch {
      setPasteResult('That is not valid JSON.');
      return;
    }
    const tests = Array.isArray(parsed) ? parsed : [parsed];
    const valid = tests.filter(
      (t) => /^\d{4}-\d{2}-\d{2}$/.test(t?.date) && t.values && typeof t.values === 'object'
    );
    if (!valid.length) {
      setPasteResult('No tests found. Each needs a date and a values object.');
      return;
    }
    setSaving(true);
    try {
      for (const test of valid) {
        const values = Object.fromEntries(
          Object.entries(test.values)
            .filter(([key, v]) => markerByKey(key) && Number.isFinite(Number(v)))
            .map(([key, v]) => [key, Number(v)])
        );
        if (Object.keys(values).length) await saveLabs(user.uid, test.date, values);
      }
      setPasteResult(`Imported ${valid.length} test${valid.length === 1 ? '' : 's'}.`);
      setPasted('');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'paste') {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Paste results</Text>
        <Text style={styles.subtitle}>
          JSON, one object per test, with a date and a values object keyed by marker.
        </Text>
        <TextInput
          style={styles.pasteBox}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          value={pasted}
          onChangeText={setPasted}
          placeholder='[{"date": "2026-09-16", "values": {"ldl": 1.6, "hdl": 1.2}}]'
          placeholderTextColor={colors.inkSoft}
        />
        {pasteResult ? <Text style={styles.pasteResult}>{pasteResult}</Text> : null}
        <Button title="Import" onPress={importPasted} loading={saving} disabled={!pasted.trim()} />
        <Button title="Done" variant="ghost" onPress={() => setMode(null)} />
      </ScrollView>
    );
  }

  if (mode === 'entry') {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Enter a blood test</Text>
        <Text style={styles.subtitle}>Leave anything the report didn’t include blank.</Text>
        <Card>
          <Field
            label="Collection date (YYYY-MM-DD)"
            value={draft.date}
            onChangeText={(date) => setDraft((d) => ({ ...d, date }))}
            placeholder={dayKey()}
          />
          {LAB_MARKERS.map((marker) => (
            <Field
              key={marker.key}
              label={`${marker.label} (${marker.unit})`}
              value={draft.values[marker.key] ?? ''}
              onChangeText={(text) =>
                setDraft((d) => ({ ...d, values: { ...d.values, [marker.key]: text } }))
              }
              keyboardType="decimal-pad"
              placeholder="—"
            />
          ))}
        </Card>
        <Button title="Save test" onPress={saveEntry} loading={saving} />
        <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
      </ScrollView>
    );
  }

  if (mode === 'targets') {
    return (
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Your targets</Text>
        <Text style={styles.subtitle}>
          The numbers your cardiologist gave you. Leave blank where there isn’t one.
        </Text>
        <Card>
          {LAB_MARKERS.filter((m) => m.betterWhen).map((marker) => (
            <Field
              key={marker.key}
              label={`${marker.label} (${marker.unit}) — ${
                marker.betterWhen === 'lower' ? 'at or below' : 'at or above'
              }`}
              value={targets[marker.key] == null ? '' : String(targets[marker.key])}
              onChangeText={(text) => setTargets((t) => ({ ...t, [marker.key]: text }))}
              keyboardType="decimal-pad"
              placeholder="—"
              hint={marker.hint}
            />
          ))}
        </Card>
        <Button title="Save targets" onPress={saveTargets} loading={saving} />
        <Button title="Cancel" variant="ghost" onPress={() => setMode(null)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Labs</Text>
      <Text style={styles.subtitle}>
        {tests.length
          ? `${tests.length} blood test${tests.length === 1 ? '' : 's'} · latest ${formatDayLabel(
              tests[0].date
            )}`
          : 'Typed in from your lab reports'}
      </Text>

      <View style={styles.actions}>
        <Button title="Enter a test" onPress={() => startEntry(null)} style={{ flex: 1 }} />
        <Button
          title="Targets"
          variant="secondary"
          onPress={() => setMode('targets')}
          style={{ flex: 1 }}
        />
      </View>
      <Pressable onPress={() => setMode('paste')}>
        <Text style={styles.pasteLink}>Paste results as JSON</Text>
      </Pressable>

      {!tests.length ? (
        <Empty
          title="No results yet"
          body="Enter the numbers from a lab report and they will show here against your targets, with the change since the previous test."
        />
      ) : null}

      {markers.map((marker) => {
        const { latest, previous } = latestAndPrevious(tests, marker.key);
        const value = latest.values[marker.key];
        const target = profile?.labTargets?.[marker.key];
        const ok = meetsTarget(value, target, marker);
        const change = previous ? value - previous.values[marker.key] : null;
        return (
          <Card key={marker.key} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{marker.label}</Text>
              <Text style={styles.rowMeta}>
                {formatDayLabel(latest.date)}
                {target != null ? ` · target ${marker.betterWhen === 'lower' ? '≤' : '≥'} ${target}` : ''}
              </Text>
              {change != null && Math.abs(change) >= 10 ** -marker.decimals ? (
                <View style={styles.pillWrap}>
                  <Pill
                    tone={
                      !marker.betterWhen
                        ? 'neutral'
                        : (marker.betterWhen === 'lower') === change < 0
                          ? 'good'
                          : 'warn'
                    }
                  >
                    {change > 0 ? '↑' : '↓'} {Math.abs(change).toFixed(marker.decimals)} since{' '}
                    {formatDayLabel(previous.date)}
                  </Pill>
                </View>
              ) : null}
            </View>
            <View style={styles.rowValueBlock}>
              <Text style={[styles.rowValue, ok === false && { color: colors.accent }]}>
                {formatLab(value, marker)}
              </Text>
              <Text style={styles.rowUnit}>{marker.unit}</Text>
            </View>
          </Card>
        );
      })}

      {tests.length ? (
        <>
          <Text style={styles.sectionHeading}>All tests</Text>
          {tests.map((test) => (
            <Pressable key={test.date} onPress={() => startEntry(test)}>
              <Card style={styles.testRow}>
                <Text style={styles.testDate}>{formatDayLabel(test.date)}</Text>
                <Text style={styles.testSummary} numberOfLines={2}>
                  {LAB_MARKERS.filter((m) => test.values?.[m.key] != null)
                    .slice(0, 4)
                    .map((m) => `${m.label.split(' ')[0]} ${formatLab(test.values[m.key], m)}`)
                    .join(' · ')}
                </Text>
                <Pressable onPress={() => deleteLabs(user.uid, test.date)} hitSlop={10}>
                  <Text style={styles.delete}>Remove</Text>
                </Pressable>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.disclaimer}>
        Results as the lab reported them, against targets your own care team set. An orange number
        is simply one that hasn’t reached its target yet; what to do about it is their call.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  pasteLink: { fontSize: fonts.tiny, color: colors.primary, fontWeight: '600', textAlign: 'right', marginBottom: spacing.md },
  pasteBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    padding: spacing.md,
    minHeight: 160,
    fontSize: fonts.small,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  pasteResult: { fontSize: fonts.small, color: colors.ink, marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontSize: fonts.body, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  pillWrap: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  rowValueBlock: { alignItems: 'flex-end' },
  rowValue: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  rowUnit: { fontSize: fonts.tiny, color: colors.inkSoft },

  sectionHeading: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.inkSoft,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  testDate: { fontSize: fonts.small, fontWeight: '700', color: colors.ink, width: 90 },
  testSummary: { flex: 1, fontSize: fonts.tiny, color: colors.inkSoft },
  delete: { fontSize: fonts.tiny, color: colors.danger, fontWeight: '600' },

  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
