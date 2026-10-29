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
  const [undo, setUndo] = useState(null); // the suggestion just dismissed
  const [showHidden, setShowHidden] = useState(false);
  const dismissed = profile?.milestoneDismissed;

  const milestones = useMemo(() => milestonesFrom(workouts), [workouts]);
  const suggestions = useMemo(() => suggestMilestones(workouts, dismissed ?? []), [workouts, dismissed]);
  // Dismissed ones, so a stray tap on ✕ can be put right.
  const hidden = useMemo(
    () => (dismissed?.length ? suggestMilestones(workouts, []).filter((m) => dismissed.includes(m.key)) : []),
    [workouts, dismissed]
  );
  if (!milestones.length && !suggestions.length && !hidden.length) return null;

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
    setUndo(suggestion);
  }

  function restore(suggestion) {
    updateProfile({ milestoneDismissed: (dismissed ?? []).filter((k) => k !== suggestion.key) });
    setUndo(null);
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
                <Pressable onPress={() => setNaming({ key: s.key, name: s.name })} hitSlop={6} style={styles.addButton}>
                  <Text style={styles.addText}>Add</Text>
                </Pressable>
                <Pressable onPress={() => dismiss(s)} hitSlop={4} style={styles.dismissButton}>
                  <Text style={styles.dismiss}>Hide</Text>
                </Pressable>
              </View>
            )
          )}
          <Text style={styles.hint}>Add lets you rename it first — “Kilimanjaro” rather than “Trek”.</Text>
        </>
      ) : null}

      {undo ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText} numberOfLines={1}>
            Hid “{undo.name}”
          </Text>
          <Pressable onPress={() => restore(undo)} hitSlop={8}>
            <Text style={styles.action}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      {hidden.length ? (
        <>
          <Pressable onPress={() => setShowHidden(!showHidden)} hitSlop={8}>
            <Text style={styles.more}>
              {showHidden ? 'Close hidden suggestions' : `Hidden suggestions (${hidden.length})`}
            </Text>
          </Pressable>
          {showHidden
            ? hidden.map((s) => (
                <View key={s.key} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.name}</Text>
                    <Text style={styles.meta}>{line(s)}</Text>
                  </View>
                  <Pressable onPress={() => restore(s)} hitSlop={8}>
                    <Text style={styles.action}>Bring back</Text>
                  </Pressable>
                </View>
              ))
            : null}
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
          onRename={async (name) => {
            await saveMilestone(user.uid, chosen.ids, name);
            setOpen(name);
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

function MilestoneSheet({ milestone, notes, onRemove, onRename, onClose }) {
  const [renaming, setRenaming] = useState(null);
  const [noting, setNoting] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const withRoute = milestone.sessions.find((w) => w.metres > 0 && !w.indoor) ?? milestone.sessions[0];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader onDone={onClose} />
        <ScrollView contentContainerStyle={styles.sheet}>
          {renaming != null ? (
            <View style={styles.naming}>
              <TextInput
                style={styles.nameInput}
                value={renaming}
                onChangeText={setRenaming}
                autoFocus
                onSubmitEditing={() => renaming.trim() && onRename(renaming.trim()).then(() => setRenaming(null))}
              />
              <Pressable
                onPress={() => renaming.trim() && onRename(renaming.trim()).then(() => setRenaming(null))}
                hitSlop={8}
              >
                <Text style={styles.action}>Save</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setRenaming(milestone.name)}>
              <Text style={styles.sheetTitle}>★ {milestone.name}</Text>
              <Text style={styles.renameHint}>Tap the name to rename it{milestone.sessions.length > 1 ? ' — all its sessions change together' : ''}.</Text>
            </Pressable>
          )}
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
  dismiss: { fontSize: fonts.tiny, color: colors.inkSoft },
  addButton: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  addText: { fontSize: fonts.small, color: colors.primary, fontWeight: '700' },
  dismissButton: { marginLeft: spacing.lg, paddingVertical: 6 },
  undoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg, borderRadius: 10, padding: spacing.sm, marginTop: spacing.sm },
  undoText: { flex: 1, fontSize: fonts.small, color: colors.ink, marginRight: spacing.sm },
  hint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs },
  naming: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  nameInput: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius / 2, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: fonts.body, color: colors.ink, backgroundColor: colors.card },
  sheet: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  sheetTitle: { fontSize: fonts.title, fontWeight: '800', color: colors.ink },
  renameHint: { fontSize: fonts.tiny, color: colors.primary, marginBottom: spacing.xs },
  sheetMeta: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md },
  sessionRow: { flexDirection: 'row', alignItems: 'center' },
  remove: { fontSize: fonts.small, color: colors.danger, fontWeight: '700', textAlign: 'center', marginTop: spacing.lg },
});

export default memo(MilestonesCard);
