import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { dayKey } from '../lib/dates';
import { sumMeals } from '../lib/nutrition';
import { askCoach, watchMeals } from '../lib/store';
import { colors, fonts, spacing } from '../theme';
import { Button, Card, Field } from '../ui';

/**
 * "What should I eat next?" — the reason the tracking is worth doing.
 * Logging food only pays off if it changes the next decision, so this screen turns
 * the day's running totals into a concrete answer rather than another chart.
 */
export default function CoachScreen({ onClose }) {
  const { user, targets } = useAuth();
  const [meals, setMeals] = useState([]);
  const [answer, setAnswer] = useState('');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    return watchMeals(user.uid, dayKey(), setMeals);
  }, [user]);

  const totals = sumMeals(meals);

  async function ask(customQuestion = '') {
    setLoading(true);
    setError('');
    try {
      const text = await askCoach({
        totals,
        targets,
        meals: meals.map((meal) => ({
          mealType: meal.mealType,
          name: meal.name,
          calories: meal.totals.calories,
          protein: meal.totals.protein,
        })),
        question: customQuestion,
      });
      setAnswer(text);
    } catch (caught) {
      setError(caught.message ?? 'Could not reach the coach.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>What next?</Text>

      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Stat
            label="Calories left"
            value={Math.round((targets.calories ?? 0) - totals.calories)}
          />
          <Stat
            label="Protein left"
            value={`${Math.round(Math.max((targets.protein ?? 0) - totals.protein, 0))}g`}
          />
        </View>
      </Card>

      {answer ? (
        <Card>
          <Text style={styles.answer}>{answer}</Text>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Thinking about your day…</Text>
        </View>
      ) : (
        <Button
          title={answer ? 'Ask again' : 'Suggest my next meal'}
          onPress={() => ask()}
          disabled={targets.calories === null}
        />
      )}

      {targets.calories === null ? (
        <Text style={styles.error}>Set your targets in Settings first.</Text>
      ) : null}

      <Field
        label="Or ask something specific"
        placeholder="e.g. can I fit a beer in tonight?"
        value={question}
        onChangeText={setQuestion}
        onSubmitEditing={() => question.trim() && ask(question.trim())}
        returnKeyType="send"
      />
      <Button
        title="Ask"
        variant="secondary"
        onPress={() => ask(question.trim())}
        disabled={!question.trim() || loading}
      />

      <Button title="Close" variant="ghost" onPress={onClose} />
    </ScrollView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { fontSize: fonts.title, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },

  statusCard: { paddingVertical: spacing.lg },
  statusRow: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: fonts.title, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: fonts.tiny, color: colors.inkSoft, textTransform: 'uppercase', marginTop: 2 },

  answer: { fontSize: fonts.body, color: colors.ink, lineHeight: 26 },

  loading: { alignItems: 'center', padding: spacing.lg },
  loadingText: { fontSize: fonts.small, color: colors.inkSoft, marginTop: spacing.sm },

  error: { fontSize: fonts.small, color: colors.danger, marginBottom: spacing.md },
});
