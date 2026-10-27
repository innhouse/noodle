import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  meetsTarget,
  outsideRange,
  rangeStatus,
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
  const [open, setOpen] = useState(null);
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
        const status = rangeStatus(value, marker.range);
        const flagged = status === 'high' || status === 'low';
        const edge = ok === false || flagged ? colors.accent : status === 'in' || ok ? colors.primary : colors.line;
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
                    {formatRange(marker.range) ? ` · lab range ${formatRange(marker.range)}` : ''}
                    {target != null
                      ? ` · your target ${marker.betterWhen === 'lower' ? '≤' : '≥'} ${target}`
                      : ''}
                  </Text>
                  <View style={styles.pillRow}>
                    {status ? (
                      <Pill tone={status === 'in' ? 'good' : 'warn'}>
                        {status === 'in' ? 'In lab range' : status === 'high' ? 'Above lab range' : 'Below lab range'}
                      </Pill>
                    ) : null}
                    {ok != null ? (
                      <Pill tone={ok ? 'good' : 'warn'}>
                        {ok ? 'Target met' : marker.betterWhen === 'lower' ? 'Above target' : 'Below target'}
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
                      (ok === false || flagged) && { color: colors.accent },
                    ]}
                  >
                    {formatLab(value, marker)}
                  </Text>
                  <Text style={styles.rowUnit}>{marker.unit}</Text>
                </View>
              </View>

              {history.length > 1 ? (
                <LabChart marker={marker} points={history} target={target} />
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
                <Pressable onPress={() => deleteLabs(user.uid, test.date)} hitSlop={10}>
                  <Text style={styles.delete}>Remove</Text>
                </Pressable>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      <Text style={styles.disclaimer}>
        Results as the lab reported them. “Lab range” is the laboratory’s usual interval for adults
        and is not a goal; your target is whatever your care team set, and after a heart attack it
        is usually well inside the lab range. Orange marks a value outside the range or short of
        your target; what to do about it is their call.
      </Text>
    </ScrollView>
  );
}

/**
 * One marker over time, as a lollipop chart.
 *
 * Shaded band: the lab's reference interval. Dashed line: the person's own target.
 * Dots: results, green inside the lab range and orange outside. Drawn with plain
 * views so phone and web render it identically with nothing native to install.
 */
function LabChart({ marker, points, target }) {
  const [width, setWidth] = useState(0);
  const height = 150;
  const padTop = 22;
  const padBottom = 26;
  const padX = 18;
  const plotH = height - padTop - padBottom;

  if (!points.length) return null;

  const values = points.map((p) => p.value);
  const candidates = [...values];
  if (marker.range?.low != null) candidates.push(marker.range.low);
  if (marker.range?.high != null) candidates.push(marker.range.high);
  if (target != null) candidates.push(Number(target));
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.12;
  min -= pad;
  max += pad;
  if (min < 0 && Math.min(...candidates) >= 0) min = 0;

  const yFor = (v) => padTop + plotH - ((v - min) / (max - min)) * plotH;
  const dayOf = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  };
  const t0 = dayOf(points[0].date);
  const t1 = dayOf(points[points.length - 1].date);
  const plotW = Math.max(0, width - padX * 2);
  const xFor = (key) => padX + (t1 === t0 ? plotW / 2 : ((dayOf(key) - t0) / (t1 - t0)) * plotW);

  const bandTop = marker.range?.high != null ? yFor(marker.range.high) : padTop;
  const bandBottom = marker.range?.low != null ? yFor(marker.range.low) : padTop + plotH;
  const baseline = padTop + plotH;

  return (
    <View
      style={[styles.chart, { height }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <>
          {marker.range ? (
            <View
              style={[
                styles.band,
                { top: bandTop, height: Math.max(2, bandBottom - bandTop), left: padX, width: plotW },
              ]}
            />
          ) : null}
          {marker.range ? (
            <Text style={[styles.bandLabel, { top: bandTop - 14, right: padX }]}>
              lab range {formatRange(marker.range)}
            </Text>
          ) : null}
          {target != null ? (
            <>
              <View style={[styles.targetLine, { top: yFor(Number(target)), left: padX, width: plotW }]} />
              <Text style={[styles.targetLabel, { top: yFor(Number(target)) - 14, left: padX }]}>
                target {target}
              </Text>
            </>
          ) : null}
          <View style={[styles.axis, { top: baseline, left: padX, width: plotW }]} />
          {points.map((point) => {
            const x = xFor(point.date);
            const y = yFor(point.value);
            const out = outsideRange(point.value, marker.range);
            const colour = out ? colors.accent : colors.primary;
            return (
              <View key={point.date}>
                <View style={[styles.stem, { left: x, top: y, height: baseline - y, backgroundColor: colour }]} />
                <View style={[styles.dot, { left: x - 6, top: y - 6, backgroundColor: colour }]} />
                <Text style={[styles.dotLabel, { left: x - 24, top: y - 20 }]}>
                  {formatLab(point.value, marker)}
                </Text>
                <Text style={[styles.dateLabel, { left: x - 24, top: baseline + 4 }]}>
                  {shortDate(point.date)}
                </Text>
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

function shortDate(key) {
  const [y, m] = key.split('-').map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  return `${month} ${String(y).slice(2)}`;
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  history: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.md, paddingTop: spacing.sm },
  chart: { width: '100%', marginTop: spacing.md, overflow: 'hidden' },
  band: { position: 'absolute', backgroundColor: colors.primarySoft, borderRadius: 4 },
  bandLabel: { position: 'absolute', fontSize: 10, color: colors.primary, fontWeight: '600' },
  targetLine: { position: 'absolute', height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.ink },
  targetLabel: { position: 'absolute', fontSize: 10, color: colors.ink, fontWeight: '600' },
  axis: { position: 'absolute', height: 1, backgroundColor: colors.line },
  stem: { position: 'absolute', width: 2, opacity: 0.5 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.card },
  dotLabel: { position: 'absolute', width: 48, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.ink },
  dateLabel: { position: 'absolute', width: 48, textAlign: 'center', fontSize: 9, color: colors.inkSoft },
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
