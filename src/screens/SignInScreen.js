import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors, fonts, spacing } from '../theme';
import { Button, Card, Field } from '../ui';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
    } catch (caught) {
      setError(friendlyError(caught.code) ?? caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Noodle</Text>
        <Text style={styles.tagline}>Photograph your food. Know what you ate.</Text>

        <Card>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            title={mode === 'signin' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email.trim() || password.length < 6}
          />
        </Card>

        <Button
          title={mode === 'signin' ? 'Need an account?' : 'Already have an account?'}
          variant="ghost"
          onPress={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(code) {
  return {
    'auth/invalid-credential': 'That email and password do not match an account.',
    'auth/invalid-email': 'That does not look like an email address.',
    'auth/weak-password': 'Use at least six characters.',
    'auth/email-already-in-use': 'There is already an account with that email — sign in instead.',
    'auth/network-request-failed': 'No connection. Check your network and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  }[code];
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingTop: spacing.xl * 3, flexGrow: 1, justifyContent: 'center' },
  logo: { fontSize: 44, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  tagline: {
    fontSize: fonts.body,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  error: { fontSize: fonts.small, color: colors.danger, marginBottom: spacing.md },
});
