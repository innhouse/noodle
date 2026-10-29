import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme';
import HealthScreen from './HealthScreen';
import WeightScreen from './WeightScreen';

const VIEWS = [
  { key: 'heart', label: 'Heart & sleep' },
  { key: 'weight', label: 'Weight' },
];

/** Health and Weight under one tab, switched at the top. */
export default function HealthTab() {
  const [view, setView] = useState('heart');
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.switch}>
        {VIEWS.map((v) => {
          const on = v.key === view;
          return (
            <Pressable key={v.key} style={[styles.option, on && styles.optionOn]} onPress={() => setView(v.key)}>
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{v.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>{view === 'heart' ? <HealthScreen /> : <WeightScreen />}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  switch: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 3,
    borderRadius: 10,
    backgroundColor: colors.line,
  },
  option: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  optionOn: { backgroundColor: colors.card },
  optionText: { fontSize: fonts.small, fontWeight: '600', color: colors.inkSoft },
  optionTextOn: { color: colors.ink, fontWeight: '700' },
});
