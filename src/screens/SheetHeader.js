import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';

/**
 * The bar across the top of a drill-down sheet: "‹ Back" to the step before
 * (when there is one) and "Done" to close. It stays put while the list
 * scrolls, so the way out is always in the same place.
 */
export default function SheetHeader({ backLabel, onBack, onDone }) {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.side}>
          <Text style={styles.back} numberOfLines={1}>
            ‹ {backLabel ?? 'Back'}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
      <Pressable onPress={onDone} hitSlop={12}>
        <Text style={styles.done}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  side: { flex: 1, paddingRight: spacing.md },
  back: { fontSize: fonts.body, color: colors.primary, fontWeight: '700' },
  done: { fontSize: fonts.body, color: colors.primary, fontWeight: '700' },
});
