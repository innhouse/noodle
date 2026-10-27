import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { healthSupported } from '../lib/health';
import { deleteMealData, hasMealData } from '../lib/store';
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

const SYNC_WEIGHT_OPTIONS = [
  { value: true, label: 'Import from Apple Health automatically' },
  { value: false, label: 'Log by hand only' },
];

export default function SettingsScreen() {
  const { user, profile, updateProfile, signOut } = useAuth();
  // The draft holds what the user typed, in pounds and feet/inches. It is converted
  // to metric only on save.
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);
  const [cleanup, setCleanup] = useState(null);
  const [leftovers, setLeftovers] = useState(false);

  useEffect(() => {
    const height = cmToFeetInches(profile?.heightCm);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({
      ...profile,
      weightLb: displayLb(profile?.weightKg),
      feet: height.feet,
      inches: height.inches,
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    hasMealData(user.uid)
      .then((any) => {
        if (!cancelled) setLeftovers(any);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  function set(patch) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  }

  async function save() {
    await updateProfile({
      weightKg: draft.weightLb ? lbToKg(Number(draft.weightLb)) : null,
      heightCm: feetInchesToCm(draft.feet, draft.inches) ?? null,
      age: Number(draft.age) || null,
      syncHealthWeight: draft.syncHealthWeight !== false,
      weeklyMinutesTarget: Number(draft.weeklyMinutesTarget) || 150,
    });
    setSaved(true);
  }

  async function removeMeals() {
    setCleanup({ running: true });
    try {
      const result = await deleteMealData(user.uid);
      setCleanup({ done: true, ...result });
    } catch (error) {
      console.warn('meal cleanup failed', error);
      setCleanup({ failed: true });
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>

      <Card>
        <Text style={styles.cardTitle}>About you</Text>
        <Text style={styles.cardBody}>
          Weight is kept in step with the Weight tab. Nothing leaves your account.
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
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Training</Text>
        <Field
          label="Weekly exercise target (minutes)"
          value={String(draft.weeklyMinutesTarget ?? 150)}
          onChangeText={(text) => set({ weeklyMinutesTarget: text })}
          keyboardType="number-pad"
          placeholder="150"
          hint="Whatever your rehab program set. The Today and Workouts tabs show this week against it."
        />
      </Card>

      {healthSupported ? (
        <Card>
          <Text style={styles.cardTitle}>Apple Health</Text>
          <Text style={styles.cardBody}>
            Workouts, sleep and heart readings are read every time Noodle opens and copied to
            your account so the web app can show them. Noodle never writes to Health.
          </Text>
          <Dropdown
            label="Weigh-ins"
            value={draft.syncHealthWeight !== false}
            options={SYNC_WEIGHT_OPTIONS}
            onChange={(syncHealthWeight) => set({ syncHealthWeight })}
            hint="On, every reading your scale sends to Health is added to the Weight log when you open it. Off, you log weigh-ins by hand."
          />
        </Card>
      ) : null}

      <Button title={saved ? 'Saved' : 'Save'} onPress={save} />

      {leftovers || cleanup?.done ? (
      <Card style={styles.cleanupCard}>
        <Text style={styles.cardTitle}>Old meal data</Text>
        <Text style={styles.cardBody}>
          Noodle used to track meals. The logged meals and photos are still in your account;
          this removes them for good.
        </Text>
        {cleanup?.done ? (
          <Text style={styles.cleanupResult}>
            Removed {cleanup.meals} meal{cleanup.meals === 1 ? '' : 's'} and {cleanup.photos}{' '}
            photo{cleanup.photos === 1 ? '' : 's'}.
          </Text>
        ) : (
          <Button
            title="Delete meal data"
            variant="danger"
            onPress={removeMeals}
            loading={cleanup?.running}
          />
        )}
        {cleanup?.failed ? (
          <Text style={styles.cleanupResult}>That didn’t work. Try again in a moment.</Text>
        ) : null}
      </Card>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Text style={styles.account}>Signed in as {user?.email}</Text>
      <Button title="Sign out" variant="ghost" onPress={signOut} />

      <Text style={styles.disclaimer}>
        Noodle shows your own Health readings back to you and compares them only with your own
        earlier ones. It is not a medical device and nothing here is medical advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },

  heightRow: { flexDirection: 'row', gap: spacing.md },
  cardTitle: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  cardBody: { fontSize: fonts.small, color: colors.inkSoft, marginBottom: spacing.md, lineHeight: 20 },

  cleanupCard: { marginTop: spacing.lg },
  cleanupResult: { fontSize: fonts.small, color: colors.ink, lineHeight: 20 },

  account: { fontSize: fonts.small, color: colors.inkSoft, textAlign: 'center' },
  disclaimer: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    lineHeight: 18,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
