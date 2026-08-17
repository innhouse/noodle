import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { healthSupported } from '../lib/health';
import {
  ACTIVE_ENERGY_SHARES,
  ACTIVITY_LEVELS,
  computeTargets,
  LOSS_RATES,
} from '../lib/nutrition';
import {
  cmToFeetInches,
  displayLb,
  FEET_OPTIONS,
  feetInchesToCm,
  INCH_OPTIONS,
  lbToKg,
} from '../lib/units';
import { colors, fonts, spacing } from '../theme';
import { Button, Card, Dropdown, Field } from '../ui';

export default function SettingsScreen() {
  const { user, profile, updateProfile, signOut } = useAuth();
  // The draft holds what the user typed, in pounds and feet/inches. It is converted
  // to metric only on save and on the live preview below.
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const height = cmToFeetInches(profile?.heightCm);
    setDraft({
      ...profile,
      weightLb: displayLb(profile?.weightKg),
      goalWeightLb: displayLb(profile?.goalWeightKg),
      feet: height.feet,
      inches: height.inches,
    });
  }, [profile]);

  const metric = {
    ...draft,
    weightKg: draft.weightLb ? lbToKg(Number(draft.weightLb)) : undefined,
    goalWeightKg: draft.goalWeightLb ? lbToKg(Number(draft.goalWeightLb)) : undefined,
    heightCm: feetInchesToCm(draft.feet, draft.inches) ?? undefined,
    age: Number(draft.age) || undefined,
  };

  // Preview the budget the current draft would produce, so the effect of changing
  // activity level or loss rate is visible before committing to it.
  const preview = computeTargets(metric);

  function set(patch) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  }

  async function save() {
    await updateProfile({
      weightKg: metric.weightKg ?? null,
      heightCm: metric.heightCm ?? null,
      age: metric.age ?? null,
      goalWeightKg: metric.goalWeightKg ?? null,
      sex: draft.sex ?? 'male',
      activity: draft.activity ?? 1.375,
      lossRate: draft.lossRate ?? 0.4536,
      manualCalories: Number(draft.manualCalories) || null,
      manualProtein: Number(draft.manualProtein) || null,
      activeEnergyShare: draft.activeEnergyShare ?? (draft.useActiveEnergy ? 0.5 : 0),
      useActiveEnergy: Boolean(draft.useActiveEnergy),
    });
    setSaved(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      <Card>
        <Text style={styles.cardTitle}>About you</Text>
        <Text style={styles.cardBody}>
          Used to work out how many calories you burn in a day. Nothing leaves your account.
        </Text>

        <Field
          label="Weight (lb)"
          value={String(draft.weightLb ?? '')}
          onChangeText={(text) => set({ weightLb: text })}
          keyboardType="decimal-pad"
          placeholder="180"
        />
        <View style={styles.heightRow}>
          <View style={{ flex: 1 }}>
            <Dropdown
              label="Height"
              value={draft.feet ?? null}
              options={FEET_OPTIONS}
              onChange={(feet) => set({ feet })}
              placeholder="ft"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Dropdown
              label=" "
              value={draft.inches ?? null}
              options={INCH_OPTIONS}
              onChange={(inches) => set({ inches })}
              placeholder="in"
            />
          </View>
        </View>
        <Field
          label="Age"
          value={String(draft.age ?? '')}
          onChangeText={(text) => set({ age: text })}
          keyboardType="number-pad"
          placeholder="40"
        />
        <Dropdown
          label="Sex"
          hint="Only affects the metabolic rate equation."
          value={draft.sex ?? 'male'}
          options={[
            { label: 'Male', value: 'male' },
            { label: 'Female', value: 'female' },
          ]}
          onChange={(sex) => set({ sex })}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Goal</Text>

        <Field
          label="Goal weight (lb)"
          value={String(draft.goalWeightLb ?? '')}
          onChangeText={(text) => set({ goalWeightLb: text })}
          keyboardType="decimal-pad"
          placeholder="160"
          hint="Your protein target is set against this, since it exists to protect muscle rather than scale with fat."
        />
        <Dropdown
          label="Activity level"
          value={draft.activity ?? 1.375}
          options={ACTIVITY_LEVELS.map((level) => ({
            label: level.label,
            value: level.value,
            hint: level.hint,
          }))}
          onChange={(activity) => set({ activity })}
        />
        <Dropdown
          label="Rate of loss"
          value={draft.lossRate ?? 0.4536}
          options={LOSS_RATES}
          onChange={(lossRate) => set({ lossRate })}
          hint="Faster is not better. Above about 1½ lb a week you start losing muscle along with the fat."
        />
      </Card>

      {preview.calories ? (
        <Card style={styles.previewCard}>
          <Text style={styles.previewTitle}>Your daily targets</Text>
          <View style={styles.previewRow}>
            <Preview label="Calories" value={preview.calories} />
            <Preview label="Protein" value={`${preview.protein}g`} />
            <Preview label="Carbs" value={`${preview.carbs}g`} />
            <Preview label="Fat" value={`${preview.fat}g`} />
          </View>
          {preview.tdee ? (
            <Text style={styles.previewDetail}>
              You burn roughly {preview.tdee} kcal a day ({preview.bmr} at rest).
            </Text>
          ) : null}
        </Card>
      ) : null}

      {healthSupported ? (
        <Card>
          <Text style={styles.cardTitle}>Apple Health</Text>
          <Dropdown
            label="How much of your activity counts towards your budget?"
            value={draft.activeEnergyShare ?? (draft.useActiveEnergy ? 0.5 : 0)}
            options={ACTIVE_ENERGY_SHARES}
            onChange={(activeEnergyShare) => set({ activeEnergyShare })}
            hint="Health reports active energy only — your resting burn is already in the target, so never add the larger total figure. Phone-only estimates run high; a watch is more trustworthy."
          />
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Override the numbers</Text>
        <Text style={styles.cardBody}>
          Leave blank to use the calculated targets. Fill these in if a dietitian or your own
          experience says different.
        </Text>
        <Field
          label="Calorie target"
          value={String(draft.manualCalories ?? '')}
          onChangeText={(text) => set({ manualCalories: text })}
          keyboardType="number-pad"
          placeholder="Calculated"
        />
        <Field
          label="Protein target (g)"
          value={String(draft.manualProtein ?? '')}
          onChangeText={(text) => set({ manualProtein: text })}
          keyboardType="number-pad"
          placeholder="Calculated"
        />
      </Card>

      <Button title={saved ? 'Saved' : 'Save'} onPress={save} />

      <View style={{ height: spacing.xl }} />
      <Text style={styles.account}>Signed in as {user?.email}</Text>
      <Button title="Sign out" variant="ghost" onPress={signOut} />

      <Text style={styles.disclaimer}>
        Noodle estimates. Photo-based calorie counts carry real error bars, and nothing here is
        medical advice — if you have a condition that makes intake matter clinically, work with
        someone qualified.
      </Text>
    </ScrollView>
  );
}

function Preview({ label, value }) {
  return (
    <View style={styles.preview}>
      <Text style={styles.previewValue}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },

  heightRow: { flexDirection: 'row', gap: spacing.md },
  cardTitle: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  cardBody: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md, lineHeight: 20 },

  previewCard: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  previewTitle: { fontSize: fonts.small, fontWeight: '700', color: colors.primary, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.6 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  preview: { alignItems: 'center', flex: 1 },
  previewValue: { fontSize: fonts.big, fontWeight: '800', color: colors.ink },
  previewLabel: { fontSize: fonts.tiny, color: colors.inkSoft, textTransform: 'uppercase' },
  previewDetail: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: spacing.md, textAlign: 'center' },

  account: { fontSize: fonts.small, color: colors.inkSoft, textAlign: 'center' },
  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
