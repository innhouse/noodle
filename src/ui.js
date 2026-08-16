import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fonts, radius, spacing } from './theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }) {
  const tint = {
    primary: { bg: colors.primary, fg: '#FFFFFF' },
    secondary: { bg: colors.primarySoft, fg: colors.primary },
    ghost: { bg: 'transparent', fg: colors.inkSoft },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tint.bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && styles.buttonGhost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: tint.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/**
 * A dropdown that works identically on iOS, Android and web.
 *
 * React Native has no cross-platform picker worth using, and this is the control the
 * whole logging flow rests on — every portion size and clarifying answer goes through
 * it — so it is a plain modal list rather than a native picker that behaves three
 * different ways.
 */
export function Dropdown({ label, value, options, onChange, hint, placeholder = 'Choose…' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable style={styles.dropdown} onPress={() => setOpen(true)}>
        <Text style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={styles.dropdownChevron}>▾</Text>
      </Pressable>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(event) => event.stopPropagation()}>
            {label ? <Text style={styles.modalTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: 380 }}>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={String(option.value)}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionLabel, isSelected && { color: colors.primary }]}>
                        {option.label}
                      </Text>
                      {option.hint ? <Text style={styles.optionHint}>{option.hint}</Text> : null}
                    </View>
                    {isSelected ? <Text style={styles.optionCheck}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.segmented, style]}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isSelected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, ...inputProps }) {
  return (
    <View style={styles.fieldBlock}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.inkSoft}
        {...inputProps}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/** A single macro's progress against its target. */
export function MacroBar({ label, value, target, color, unit = 'g' }) {
  const safeTarget = target || 1;
  const ratio = Math.min(value / safeTarget, 1);
  const over = value > safeTarget * 1.05;

  return (
    <View style={styles.macroBlock}>
      <View style={styles.macroLabelRow}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text style={styles.macroValue}>
          {Math.round(value)}
          <Text style={styles.macroTarget}>
            {' / '}
            {Math.round(target)}
            {unit}
          </Text>
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View
          style={[
            styles.macroFill,
            { width: `${ratio * 100}%`, backgroundColor: over ? colors.over : color },
          ]}
        />
      </View>
    </View>
  );
}

export function Pill({ children, tone = 'neutral' }) {
  const tint = {
    neutral: { bg: colors.line, fg: colors.inkSoft },
    good: { bg: colors.primarySoft, fg: colors.primary },
    warn: { bg: colors.accentSoft, fg: colors.accent },
    bad: { bg: colors.dangerSoft, fg: colors.danger },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: tint.bg }]}>
      <Text style={[styles.pillText, { color: tint.fg }]}>{children}</Text>
    </View>
  );
}

export function Empty({ title, body }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: { fontSize: fonts.small, fontWeight: '700', color: colors.inkSoft, letterSpacing: 0.6, textTransform: 'uppercase' },

  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonGhost: { minHeight: 40, paddingVertical: spacing.sm },
  buttonText: { fontSize: fonts.body, fontWeight: '700' },

  fieldBlock: { marginBottom: spacing.md },
  fieldLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.inkSoft, marginBottom: spacing.xs },
  fieldHint: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.xs },

  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    padding: spacing.md,
    fontSize: fonts.body,
    color: colors.ink,
    backgroundColor: colors.card,
  },

  dropdown: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    padding: spacing.md,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  dropdownText: { fontSize: fonts.body, color: colors.ink, flex: 1 },
  dropdownPlaceholder: { color: colors.inkSoft },
  dropdownChevron: { fontSize: fonts.body, color: colors.inkSoft, marginLeft: spacing.sm },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,22,28,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderRadius: radius,
    padding: spacing.md,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: fonts.body,
    fontWeight: '700',
    color: colors.ink,
    padding: spacing.sm,
    paddingBottom: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius - 4,
  },
  optionRowSelected: { backgroundColor: colors.primarySoft },
  optionLabel: { fontSize: fonts.body, color: colors.ink },
  optionHint: { fontSize: fonts.small, color: colors.inkSoft, marginTop: 2 },
  optionCheck: { fontSize: fonts.body, color: colors.primary, fontWeight: '700' },

  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.line,
    borderRadius: radius,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius - 4, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.card },
  segmentText: { fontSize: fonts.small, color: colors.inkSoft, fontWeight: '600' },
  segmentTextSelected: { color: colors.ink },

  macroBlock: { marginBottom: spacing.md },
  macroLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  macroLabel: { fontSize: fonts.small, color: colors.inkSoft, fontWeight: '600' },
  macroValue: { fontSize: fonts.small, color: colors.ink, fontWeight: '700' },
  macroTarget: { color: colors.inkSoft, fontWeight: '400' },
  macroTrack: { height: 8, backgroundColor: colors.line, borderRadius: 4, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 4 },

  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: fonts.tiny, fontWeight: '700' },

  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontSize: fonts.body, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  emptyBody: { fontSize: fonts.small, color: colors.inkSoft, textAlign: 'center', lineHeight: 21 },
});

export { styles as uiStyles };
