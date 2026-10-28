import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { firebaseReady } from './src/lib/firebase';
import { HealthDataProvider } from './src/lib/useHealthData';
import HealthScreen from './src/screens/HealthScreen';
import LabsScreen from './src/screens/LabsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SignInScreen from './src/screens/SignInScreen';
import TodayScreen from './src/screens/TodayScreen';
import WeightScreen from './src/screens/WeightScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import { colors, fonts, spacing } from './src/theme';

const TABS = [
  { key: 'today', label: 'Today', icon: '☀️' },
  { key: 'workouts', label: 'Workouts', icon: '🏃' },
  { key: 'health', label: 'Health', icon: '❤️' },
  { key: 'weight', label: 'Weight', icon: '⚖️' },
  { key: 'labs', label: 'Labs', icon: '🧪' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
];

function Shell() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState('today');

  if (!firebaseReady) {
    return (
      <View style={styles.centered}>
        <Text style={styles.setupTitle}>Firebase isn’t configured yet</Text>
        <Text style={styles.setupBody}>
          Paste your project’s web config into firebaseConfig.js, then reload. See SETUP.md.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <SignInScreen />;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'today' ? <TodayScreen /> : null}
        {tab === 'workouts' ? <WorkoutsScreen /> : null}
        {tab === 'health' ? <HealthScreen /> : null}
        {tab === 'weight' ? <WeightScreen /> : null}
        {tab === 'labs' ? <LabsScreen /> : null}
        {tab === 'settings' ? <SettingsScreen /> : null}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((entry) => {
          const active = entry.key === tab;
          return (
            <Pressable key={entry.key} style={styles.tab} onPress={() => setTab(entry.key)}>
              <Text style={[styles.tabIcon, !active && styles.tabInactive]}>{entry.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HealthDataProvider>
        <SafeAreaView style={styles.safe}>
          <ExpoStatusBar style="dark" />
          <Shell />
        </SafeAreaView>
      </HealthDataProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    // SafeAreaView only insets on iOS, so Android needs the status bar height added
    // by hand or the first row of content sits underneath the clock.
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  setupTitle: { fontSize: fonts.big, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  setupBody: { fontSize: fonts.small, color: colors.inkSoft, textAlign: 'center', lineHeight: 21 },

  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    paddingBottom: Platform.OS === 'ios' ? spacing.sm : 0,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  tabIcon: { fontSize: 22 },
  tabInactive: { opacity: 0.4 },
  tabLabel: { fontSize: fonts.tiny, color: colors.inkSoft, marginTop: 2 },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
});
