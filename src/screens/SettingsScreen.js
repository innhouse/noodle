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
      kpiRuns: profile?.kpis?.runs ?? 3,
      kpiStrength: profile?.kpis?.strength ?? 2,
      kpiOther: profile?.kpis?.other ?? 1,
      kpiZoneMin: profile?.kpis?.zoneMin ?? 0,
      kpiYogaMin: profile?.kpis?.yogaMin ?? 70,
      monthlyMinutes: profile?.monthly?.minutes ?? 0,
      monthlyRunKm: profile?.monthly?.runKm ?? 0,
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
      weeklyMinutesTarget: Number(draft.weeklyMinutesTarget) || 630,
      kpis: {
        runs: Number(draft.kpiRuns) || 0,
        strength: Number(draft.kpiStrength) || 0,
        other: Number(draft.kpiOther) || 0,
        zoneMin: Number(draft.kpiZoneMin) || 0,
        yogaMin: Number(draft.kpiYogaMin) || 0,
      },
      zone1Low: Number(draft.zone1Low) || null,
      zone1High: Number(draft.zone1High) || null,
      monthly: {
        minutes: Number(draft.monthlyMinutes) || 0,
        runKm: Number(draft.monthlyRunKm) || 0,
      },
      events: draft.events ?? '',
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
        <Text style={styles.cardBody}>
          Sessions per week you are aiming for. Runs are runs; strength is any lifting or
          core session (Jefit included); other is everything else — walks, yoga, volleyball.
        </Text>
        <View style={styles.kpiRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Runs"
              value={String(draft.kpiRuns ?? '')}
              onChangeText={(text) => set({ kpiRuns: text })}
              keyboardType="number-pad"
              placeholder="3"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Strength"
              value={String(draft.kpiStrength ?? '')}
              onChangeText={(text) => set({ kpiStrength: text })}
              keyboardType="number-pad"
              placeholder="2"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Other"
              value={String(draft.kpiOther ?? '')}
              onChangeText={(text) => set({ kpiOther: text })}
              keyboardType="number-pad"
              placeholder="1"
            />
          </View>
        </View>
        <Field
          label="Yoga and mobility (minutes per week)"
          value={String(draft.kpiYogaMin ?? '')}
          onChangeText={(text) => set({ kpiYogaMin: text })}
          keyboardType="number-pad"
          placeholder="70"
          hint="Yoga, pilates, tai chi, stretching and cooldowns, added up over the week. 10 minutes a day is 70. Set 0 to turn it off."
        />
        <Text style={[styles.cardBody, { marginTop: spacing.sm }]}>
          Zone 1 in beats per minute, as set on your watch or by your rehab program. Noodle
          can’t read the watch’s zones, and on a beta-blocker the usual formulas are wrong, so
          this is typed in. Leave blank to skip zone tracking.
        </Text>
        <View style={styles.kpiRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Zone 1 from (bpm)"
              value={String(draft.zone1Low ?? '')}
              onChangeText={(text) => set({ zone1Low: text })}
              keyboardType="number-pad"
              placeholder="95"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="to (bpm)"
              value={String(draft.zone1High ?? '')}
              onChangeText={(text) => set({ zone1High: text })}
              keyboardType="number-pad"
              placeholder="115"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Min / week"
              value={String(draft.kpiZoneMin ?? '')}
              onChangeText={(text) => set({ kpiZoneMin: text })}
              keyboardType="number-pad"
              placeholder="150"
            />
          </View>
        </View>
        <Text style={[styles.cardBody, { marginTop: spacing.sm }]}>
          Monthly targets, if you want them. Leave at 0 for totals only.
        </Text>
        <View style={styles.kpiRow}>
          <View style={{ flex: 1 }}>
            <Field
              label="Minutes / month"
              value={String(draft.monthlyMinutes ?? '')}
              onChangeText={(text) => set({ monthlyMinutes: text })}
              keyboardType="number-pad"
              placeholder="0"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Km run / month"
              value={String(draft.monthlyRunKm ?? '')}
              onChangeText={(text) => set({ monthlyRunKm: text })}
              keyboardType="decimal-pad"
              placeholder="0"
            />
          </View>
        </View>
        <Field
          label="Weekly exercise target (minutes)"
          value={String(draft.weeklyMinutesTarget ?? 630)}
          onChangeText={(text) => set({ weeklyMinutesTarget: text })}
          keyboardType="number-pad"
          placeholder="630"
          hint="Your Fitness Exercise-ring goal times seven (90 min/day = 630). Noodle can read the ring's minutes from Health but not its goal, so this one number is kept by hand."
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Events</Text>
        <Text style={styles.cardBody}>
          Dates that divide your history — a cardiac event, a medication change. One per line,
          as a date then a label. Tables and charts show them as dividers, because numbers on
          either side of one are not the same measurement.
        </Text>
        <Field
          label="Events"
          value={draft.events ?? ''}
          onChangeText={(text) => set({ events: text })}
          multiline
          placeholder={'2026-08-27 STEMI\n2018-03-01 Heart attack'}
          autoCapitalize="none"
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
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
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
