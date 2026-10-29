import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { dayKey, formatDayLabel } from '../lib/dates';
import {
  formatLab,
  formatRange,
  historyFor,
  LAB_MARKERS,
  latestAndPrevious,
  markerByKey,
  markersWithData,
  outsideRange,
  rangeStatus,
} from '../lib/labs';
import { deleteLabs, saveLabs, watchLabs } from '../lib/store';
import { TimeChart } from '../charts';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, Card, Empty, Field, Pill } from '../ui';

/**
 * Blood tests, typed in from the report, against the lab's normal range.
 *
 * Every number here came from a lab. Noodle's only contribution is keeping the
 * history and drawing it, so the next appointment starts from "LDL went from
 * 5.1 to 1.6" rather than from memory.
 */
export default function LabsScreen() {
  const { user } = useAuth();
  const [tests, setTests] = useState([]);
  // False until the account has answered, so a slow connection shows
  // "Loading" rather than "No results yet".
  const [loaded, setLoaded] = useState(false);
  // The test whose Remove was tapped once; a second tap deletes it.
  const [removing, setRemoving] = useState(null);
  const [mode, setMode] = useState(null); // null | 'entry' | 'paste'
  const [pasted, setPasted] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({ date: dayKey(), values: {} });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    return watchLabs(user.uid, (list) => {
      setTests(list);
      setLoaded(true);
    });
  }, [user]);

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
      </View>
      <Pressable onPress={() => setMode('paste')}>
        <Text style={styles.pasteLink}>Paste results as JSON</Text>
      </Pressable>

      {!loaded ? (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingNote}>Loading your results…</Text>
        </View>
      ) : null}

      {loaded && !tests.length ? (
        <Empty
          title="No results yet"
          body="Enter the numbers from a lab report and they will show here against the lab’s normal range, with a chart once there is more than one."
        />
      ) : null}

      {markers.map((marker) => {
        const { latest, previous } = latestAndPrevious(tests, marker.key);
        const value = latest.values[marker.key];
        const status = rangeStatus(value, marker.range);
        const flagged = status === 'high' || status === 'low';
        const edge = flagged ? colors.accent : status === 'in' ? colors.primary : colors.line;
        const change = previous ? value - previous.values[marker.key] : null;
        const expanded = open === marker.key;
        const history = historyFor(tests, marker.key);
        return (
          <Pressable key={marker.key} onPress={() => setOpen(expanded ? null : marker.key)}>
            <Card style={[styles.rowCard, { borderLeftWidth: 5, borderLeftColor: edge }]}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{marker.label}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDayLabel(latest.date)}
                    {formatRange(marker.range) ? ` · normal ${formatRange(marker.range)} ${marker.unit}` : ''}
                  </Text>
                  <View style={styles.pillRow}>
                    {status ? (
                      <Pill tone={status === 'in' ? 'good' : 'warn'}>
                        {status === 'in' ? 'Normal' : status === 'high' ? 'High' : 'Low'}
                      </Pill>
                    ) : null}
                  </View>
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
                  <Text
                    style={[
                      styles.rowValue,
                      flagged && { color: colors.accent },
                    ]}
                  >
                    {formatLab(value, marker)}
                  </Text>
                  <Text style={styles.rowUnit}>{marker.unit}</Text>
                </View>
              </View>

              {history.length > 1 ? (
                <View style={styles.chartWrap}>
                <TimeChart
                  points={history}
                  band={marker.range}
                  outside="both"
                  format={(v) => formatLab(v, marker)}
                  dateStyle="month"
                />
                </View>
              ) : null}

              {expanded ? (
                <View style={styles.history}>
                  {[...history].reverse().map((point) => (
                    <View key={point.date} style={styles.historyRow}>
                      <Text style={styles.historyDate}>{longDate(point.date)}</Text>
                      <Text
                        style={[
                          styles.historyValue,
                          outsideRange(point.value, marker.range) && { color: colors.accent },
                        ]}
                      >
                        {formatLab(point.value, marker)}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.historyHint}>Tap to collapse</Text>
                </View>
              ) : null}
            </Card>
          </Pressable>
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
                <Pressable
                  onPress={() => {
                    if (removing === test.date) {
                      setRemoving(null);
                      deleteLabs(user.uid, test.date);
                    } else {
                      setRemoving(test.date);
                    }
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.delete}>{removing === test.date ? 'Tap again to remove' : 'Remove'}</Text>
                </Pressable>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.disclaimer}>
        Results as the lab reported them, against the laboratory’s usual interval for adults.
        “Normal” here means inside that interval, not that it is where your care team wants it —
        after a heart attack the LDL they aim for sits well inside the normal range. What to do
        about any of it is their call.
      </Text>
    </ScrollView>
  );
}

function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  loadingNote: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },
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

  rowCard: {},
  chartWrap: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  history: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.md, paddingTop: spacing.sm },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  historyDate: { fontSize: fonts.small, color: colors.inkSoft },
  historyValue: { fontSize: fonts.small, fontWeight: '700', color: colors.ink },
  historyHint: { fontSize: fonts.tiny, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.xs },
  rowLabel: { fontSize: fonts.body, fontWeight: '600', color: colors.ink },
  rowMeta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  pillWrap: { marginTop: spacing.xs, alignSelf: 'flex-start' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
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
