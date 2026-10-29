import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { saveRoute, saveWorkouts } from '../lib/store';
import { colors, fonts, radius, spacing } from '../theme';
import { Button, Card } from '../ui';

/**
 * Bring in sessions that never reached Apple Health — an old Garmin or Nike
 * history, converted to Noodle's own format — straight into the account.
 *
 * Each session is keyed by its id, so importing the same file twice rewrites
 * the same sessions rather than doubling them; and a session that overlaps one
 * from Health is shown once by the usual duplicate merge.
 */
export default function ImportCard() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function importText(raw) {
    setResult(null);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setResult('That file isn’t valid JSON.');
      return;
    }
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    // A routes file: [{ id, points: [[lat, lon], …] }, …], matched to sessions
    // already imported.
    const routes = entries.filter(validRoute);
    if (routes.length) {
      await importRoutes(routes);
      return;
    }
    const list = entries.filter(valid).map(clean);
    if (!list.length) {
      setResult('No sessions found in that file.');
      return;
    }
    setBusy(true);
    try {
      await saveWorkouts(user.uid, list);
      const years = list.map((w) => w.date.slice(0, 4)).sort();
      setResult(
        `Imported ${list.length} session${list.length === 1 ? '' : 's'}, ${years[0]}–${years[years.length - 1]}.`
      );
      setText('');
    } catch (error) {
      console.warn('import failed', error);
      setResult('The import didn’t go through. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function importRoutes(routes) {
    setBusy(true);
    try {
      let done = 0;
      // One small write each; a few at a time keeps a slow connection moving.
      for (let i = 0; i < routes.length; i += 10) {
        await Promise.all(
          routes.slice(i, i + 10).map((r) => saveRoute(user.uid, r.id, r.points.map(([a, b]) => [Number(a), Number(b)])))
        );
        done += Math.min(10, routes.length - i);
        setResult(`Importing routes… ${done} of ${routes.length}`);
      }
      setResult(`Imported ${routes.length} route${routes.length === 1 ? '' : 's'}. Open a session to see its map.`);
      setText('');
    } catch (error) {
      console.warn('route import failed', error);
      setResult('The route import didn’t finish. Importing the file again picks up where it stopped.');
    } finally {
      setBusy(false);
    }
  }

  function chooseFile() {
    // Web only: a plain file picker. On the phone, paste instead.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file.text().then(importText);
    };
    input.click();
  }

  return (
    <Card>
      <Text style={styles.title}>Import workouts</Text>
      <Text style={styles.body}>
        For history that isn’t in Apple Health, such as an old Garmin export converted for
        Noodle — the sessions file first, then its routes file. Importing the same file again
        won’t create duplicates.
      </Text>
      {Platform.OS === 'web' ? (
        <Button title="Choose file…" variant="secondary" onPress={chooseFile} loading={busy} />
      ) : null}
      <TextInput
        style={styles.box}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={text}
        onChangeText={setText}
        placeholder={Platform.OS === 'web' ? '…or paste the file’s contents here' : 'Paste the file’s contents here'}
        placeholderTextColor={colors.inkSoft}
      />
      <Button title="Import" onPress={() => importText(text)} loading={busy} disabled={!text.trim()} />
      {result ? <Text style={styles.result}>{result}</Text> : null}
    </Card>
  );
}

function validRoute(r) {
  return (
    r &&
    typeof r.id === 'string' &&
    !r.id.includes('/') &&
    Array.isArray(r.points) &&
    r.points.length >= 2 &&
    r.points.length <= 2000 &&
    r.points.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
  );
}

function valid(w) {
  return (
    w &&
    typeof w.id === 'string' &&
    w.id.length > 0 &&
    w.id.length < 200 &&
    !w.id.includes('/') &&
    Number.isFinite(Number(w.type)) &&
    typeof w.start === 'string' &&
    !Number.isNaN(Date.parse(w.start)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(w.date ?? '') &&
    Number(w.durationMin) > 0
  );
}

function num(v) {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? null : n;
}

/** Only the fields Noodle uses, with the types it expects. */
function clean(w) {
  return {
    id: w.id,
    type: Number(w.type),
    start: new Date(w.start).toISOString(),
    end: w.end && !Number.isNaN(Date.parse(w.end)) ? new Date(w.end).toISOString() : new Date(w.start).toISOString(),
    date: w.date,
    durationMin: Number(w.durationMin),
    metres: num(w.metres),
    kcal: num(w.kcal),
    avgHr: num(w.avgHr),
    maxHr: num(w.maxHr),
    hrr: null,
    zoneMin: null,
    indoor: Boolean(w.indoor),
    source: typeof w.source === 'string' ? w.source.slice(0, 40) : 'Imported',
    imported: true,
  };
}

const styles = StyleSheet.create({
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  body: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md, lineHeight: 20 },
  box: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    padding: spacing.md,
    minHeight: 90,
    maxHeight: 160,
    fontSize: fonts.tiny,
    color: colors.ink,
    marginVertical: spacing.md,
    textAlignVertical: 'top',
  },
  result: { fontSize: fonts.small, color: colors.ink, marginTop: spacing.sm, lineHeight: 20 },
});
