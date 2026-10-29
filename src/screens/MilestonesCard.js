import { memo, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { formatDayLabel } from '../lib/dates';
import { milestonesFrom, suggestMilestones } from '../lib/milestones';
import { saveMilestone } from '../lib/store';
import { describeType, formatDuration, formatKm } from '../lib/workouts';
import { colors, fonts, radius, spacing } from '../theme';
import { Card } from '../ui';
import RouteMap from './RouteMap';
import SheetHeader from './SheetHeader';
import WorkoutNoteSheet from './WorkoutNoteSheet';

const SHOWN = 5;

/**
 * Named milestones on Today, newest first, with Noodle's suggestions under
 * them — races and multi-day treks — to add with a tap or dismiss.
 */
function MilestonesCard({ workouts, notes }) {
  const { user, profile, updateProfile } = useAuth();
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const [naming, setNaming] = useState(null); // { key, name }
  const dismissed = profile?.milestoneDismissed;

  const milestones = useMemo(() => milestonesFrom(workouts), [workouts]);
  const suggestions = useMemo(() => suggestMilestones(workouts, dismissed ?? []), [workouts, dismissed]);
  if (!milestones.length && !suggestions.length) return null;

  const chosen = open ? milestones.find((m) => m.name === open) : null;
  const shown = all ? milestones : milestones.slice(0, SHOWN);

  async function add(suggestion, name) {
    const clean = name.trim();
    if (!clean) return;
    setNaming(null);
    await saveMilestone(user.uid, suggestion.ids, clean);
  }

  function dismiss(suggestion) {
    updateProfile({ milestoneDismissed: [...(dismissed ?? []), suggestion.key] });
  }

  return (
    <Card>
      <Text style={styles.title}>Milestones</Text>
      {milestones.length ? (
        shown.map((m) => (
          <Pressable key={m.name} style={styles.row} onPress={() => setOpen(m.name)}>
            <Text style={styles.star}>★</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.meta}>{line(m)}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))
      ) : (
        <Text style={styles.body}>
          Races, summits, first runs back — name a session in its sheet, or add one of the
          suggestions below.
        </Text>
      )}
      {milestones.length > SHOWN ? (
        <Pressable onPress={() => setAll(!all)} hitSlop={8}>
          <Text style={styles.more}>{all ? 'Show fewer' : `Show all ${milestones.length}`}</Text>
        </Pressable>
      ) : null}

      {suggestions.length ? (
        <>
          <Text style={styles.sub}>Suggested</Text>
          {suggestions.map((s) =>
            naming?.key === s.key ? (
              <View key={s.key} style={styles.naming}>
                <TextInput
                  style={styles.nameInput}
                  value={naming.name}
                  onChangeText={(name) => setNaming({ key: s.key, name })}
                  autoFocus
                  placeholder="Name this milestone"
                  placeholderTextColor={colors.inkSoft}
                  onSubmitEditing={() => add(s, naming.name)}
                />
                <Pressable onPress={() => add(s, naming.name)} hitSlop={8}>
                  <Text style={styles.action}>Save</Text>
                </Pressable>
              </View>
            ) : (
              <View key={s.key} style={styles.row}>
                <Text style={[styles.star, styles.starSoft]}>☆</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.meta}>{line(s)}</Text>
                </View>
                <Pressable onPress={() => setNaming({ key: s.key, name: s.name })} hitSlop={8}>
                  <Text style={styles.action}>Add</Text>
                </Pressable>
                <Pressable onPress={() => dismiss(s)} hitSlop={8}>
                  <Text style={styles.dismiss}>✕</Text>
                </Pressable>
              </View>
            )
          )}
          <Text style={styles.hint}>Add lets you rename it first — “Kilimanjaro” rather than “Trek”.</Text>
        </>
      ) : null}

      {chosen ? (
        <MilestoneSheet
          milestone={chosen}
          notes={notes}
          onRemove={() => {
            saveMilestone(user.uid, chosen.ids, null);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
}

function line(m) {
  const dates =
    m.start === m.end ? formatDayLabel(m.start) : `${formatDayLabel(m.start)} – ${formatDayLabel(m.end)}`;
  const { icon } = describeType(m.type);
  return [
    `${icon} ${dates}`,
    m.sessions.length > 1 ? `${m.sessions.length} sessions` : null,
    formatDuration(Math.round(m.minutes)),
    m.metres >= 500 ? formatKm(m.metres) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function MilestoneSheet({ milestone, notes, onRemove, onClose }) {
  const [noting, setNoting] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const withRoute = milestone.sessions.find((w) => w.metres > 0 && !w.indoor) ?? milestone.sessions[0];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader onDone={onClose} />
        <ScrollView contentContainerStyle={styles.sheet}>
          <Text style={styles.sheetTitle}>★ {milestone.name}</Text>
          <Text style={styles.sheetMeta}>{line(milestone)}</Text>
          {milestone.sessions.length === 1 ? <RouteMap workout={withRoute} /> : null}
          {milestone.sessions.map((w) => {
            const { icon, label } = describeType(w.type);
            return (
              <Pressable key={w.id} onPress={() => setNoting(w)}>
                <Card style={styles.sessionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {icon} {label} · {formatDayLabel(w.date)}
                    </Text>
                    <Text style={styles.meta}>
                      {[formatDuration(w.durationMin), w.metres >= 500 ? formatKm(w.metres) : null, w.avgHr ? `${w.avgHr} bpm` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Card>
              </Pressable>
            );
          })}
          <Pressable onPress={() => (confirm ? onRemove() : setConfirm(true))} hitSlop={8}>
            <Text style={styles.remove}>{confirm ? 'Tap again to remove this milestone' : 'Remove milestone'}</Text>
          </Pressable>
        </ScrollView>
      </View>
      {noting ? (
        <WorkoutNoteSheet workout={noting} note={notes?.[noting.id]} onClose={() => setNoting(null)} />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  body: { fontSize: fonts.small, color: colors.inkSoft, lineHeight: 20 },
  sub: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  star: { fontSize: 18, color: colors.accent, width: 22, textAlign: 'center' },
  starSoft: { color: colors.inkSoft },
  name: { fontSize: fonts.body, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  chevron: { fontSize: fonts.title, color: colors.inkSoft },
  more: { fontSize: fonts.small, color: colors.primary, fontWeight: '700', marginTop: spacing.xs },
  action: { fontSize: fonts.small, color: colors.primary, fontWeight: '700', paddingHorizontal: spacing.xs },
  dismiss: { fontSize: fonts.small, color: colors.inkSoft, paddingHorizontal: spacing.xs },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs },
  naming: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  nameInput: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius / 2, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: fonts.body, color: colors.ink, backgroundColor: colors.card },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  sheetTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  sheetMeta: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md },
  sessionRow: { flexDirection: 'row', alignItems: 'center' },
  remove: { fontSize: fonts.small, color: colors.danger, fontWeight: '700', textAlign: 'center', marginTop: spacing.lg },
});

export default memo(MilestonesCard);
