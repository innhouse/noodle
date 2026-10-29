import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BarChart } from "../charts";
import { formatDayLabel } from "../lib/dates";
import {
  SLEEP_GOAL_HOURS,
  sleepByMonth,
  sleepByYear,
  sleepOverall,
} from "../lib/sleep";
import { formatHours } from "../lib/useHealthData";
import { useSleepHistory } from "../lib/useSleepHistory";
import { colors, fonts, spacing } from "../theme";
import { Button, Card } from "../ui";

/**
 * Every night on record: twelve months as bars, then by year and by month.
 * Tapping a month or a bar lists its nights.
 */
export default function SleepSheet({ onClose }) {
  const { nights, syncing, added } = useSleepHistory();
  const [month, setMonth] = useState(null);

  const data = useMemo(
    () => ({
      overall: sleepOverall(nights),
      months: sleepByMonth(nights),
      years: sleepByYear(nights),
    }),
    [nights],
  );
  const chosen = month ? data.months.find((m) => m.key === month) : null;
  const bars = data.months
    .slice(0, 12)
    .reverse()
    .map((m) => ({
      label: monthLabel(m.key, false),
      value: m.hours,
      month: m.key,
    }));

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <ScrollView contentContainerStyle={styles.container}>
        {chosen ? (
          <>
            <Pressable onPress={() => setMonth(null)} hitSlop={10}>
              <Text style={styles.back}>‹ Sleep history</Text>
            </Pressable>
            <Text style={styles.title}>{monthLabel(chosen.key, true)}</Text>
            <Text style={styles.subtitle}>{summaryLine(chosen)}</Text>
            <Card>
              <HeadRow first="Night" />
              {chosen.list.map((n) => (
                <View key={n.date} style={styles.row}>
                  <Text style={[styles.cell, styles.first]}>
                    {formatDayLabel(n.date)}
                  </Text>
                  <Text
                    style={[
                      styles.cell,
                      n.hours < SLEEP_GOAL_HOURS && styles.short,
                    ]}
                  >
                    {formatHours(n.hours)}
                  </Text>
                  <Text style={styles.cell}>{stage(n.deep, n)}</Text>
                  <Text style={styles.cell}>{stage(n.rem, n)}</Text>
                  <Text style={styles.cell}>{stage(n.core, n)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : (
          <>
            <Text style={styles.title}>Sleep history</Text>
            {data.overall ? (
              <Text style={styles.subtitle}>
                {data.overall.nights.toLocaleString()} nights since{" "}
                {monthLabel(data.overall.list.at(-1).date.slice(0, 7), true)} ·{" "}
                {formatHours(data.overall.hours)} average
              </Text>
            ) : null}
            {syncing ? (
              <Text style={styles.note}>
                {nights?.length
                  ? "Checking Apple Health for new nights…"
                  : "Reading your full sleep history from Apple Health — the first time takes a moment…"}
              </Text>
            ) : added ? (
              <Text style={styles.note}>
                Added {added} night{added === 1 ? "" : "s"} from Apple Health.
              </Text>
            ) : null}

            {nights === null || (syncing && !nights.length) ? (
              <ActivityIndicator
                style={{ marginTop: spacing.xl }}
                color={colors.primary}
              />
            ) : !data.overall ? (
              <Text style={styles.note}>
                No sleep recorded yet. Open Noodle on your iPhone to read it
                from Health.
              </Text>
            ) : (
              <>
                <Card>
                  <Text style={styles.cardTitle}>
                    Average per night, last 12 months
                  </Text>
                  <BarChart
                    bars={bars}
                    target={SLEEP_GOAL_HOURS}
                    format={(v) => v.toFixed(1)}
                    height={130}
                    onBarPress={(bar) => setMonth(bar.month)}
                  />
                  <Text style={styles.hint}>
                    Line at {SLEEP_GOAL_HOURS} hours. Tap a bar or a month to
                    see its nights.
                  </Text>
                </Card>

                <Table title="By year" rows={data.years} label={(k) => k} />
                <Table
                  title="By month"
                  rows={data.months}
                  label={(k) => monthLabel(k, false, true)}
                  onPress={setMonth}
                />

                <Text style={styles.hint}>
                  Deep, REM and core are averaged over nights the watch recorded
                  stages — watches before 2022 recorded only time asleep. “
                  {SLEEP_GOAL_HOURS}h+” is the share of nights at or over{" "}
                  {SLEEP_GOAL_HOURS} hours.
                </Text>
              </>
            )}
          </>
        )}
        <Button title="Close" variant="ghost" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

function Table({ title, rows, label, onPress }) {
  return (
    <>
      <Text style={styles.section}>{title}</Text>
      <Card>
        <HeadRow first={title === "By year" ? "Year" : "Month"} share />
        {rows.map((r) => (
          <Pressable
            key={r.key}
            style={styles.row}
            onPress={onPress ? () => onPress(r.key) : undefined}
          >
            <Text style={[styles.cell, styles.first]}>
              {label(r.key)} <Text style={styles.count}>{r.nights}</Text>
            </Text>
            <Text style={[styles.cell, styles.strong]}>
              {formatHours(r.hours)}
            </Text>
            <Text style={styles.cell}>
              {r.deep != null ? formatHours(r.deep) : "—"}
            </Text>
            <Text style={styles.cell}>
              {r.rem != null ? formatHours(r.rem) : "—"}
            </Text>
            <Text style={styles.cell}>{Math.round(r.goalShare * 100)}%</Text>
          </Pressable>
        ))}
      </Card>
    </>
  );
}

function HeadRow({ first, share }) {
  return (
    <View style={[styles.row, styles.head]}>
      <Text style={[styles.cell, styles.first, styles.headText]}>{first}</Text>
      <Text style={[styles.cell, styles.headText]}>Asleep</Text>
      <Text style={[styles.cell, styles.headText]}>Deep</Text>
      <Text style={[styles.cell, styles.headText]}>REM</Text>
      <Text style={[styles.cell, styles.headText]}>
        {share ? `${SLEEP_GOAL_HOURS}h+` : "Core"}
      </Text>
    </View>
  );
}

function stage(hours, night) {
  return (night.deep ?? 0) + (night.rem ?? 0) > 0 ? formatHours(hours) : "—";
}

function summaryLine(m) {
  const parts = [
    `${m.nights} night${m.nights === 1 ? "" : "s"}`,
    `${formatHours(m.hours)} average`,
    m.deep != null
      ? `${formatHours(m.deep)} deep · ${formatHours(m.rem)} REM`
      : null,
    `${Math.round(m.goalShare * 100)}% at ${SLEEP_GOAL_HOURS}h+`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function monthLabel(key, long, withYear = false) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  if (long)
    return date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  const short = date.toLocaleDateString(undefined, { month: "short" });
  return withYear ? `${short} ${String(y).slice(2)}` : short;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    backgroundColor: colors.bg,
    flexGrow: 1,
  },
  back: {
    fontSize: fonts.small,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.title, fontWeight: "800", color: colors.ink },
  subtitle: {
    fontSize: fonts.small,
    color: colors.inkSoft,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  note: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: fonts.small,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  section: {
    fontSize: fonts.small,
    fontWeight: "700",
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  head: { borderBottomColor: colors.inkSoft },
  headText: {
    color: colors.inkSoft,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 10,
  },
  cell: { flex: 1, fontSize: 12, color: colors.ink, textAlign: "right" },
  first: { flex: 1.5, textAlign: "left", fontWeight: "600" },
  count: { color: colors.inkSoft, fontWeight: "400", fontSize: 10 },
  strong: { fontWeight: "700" },
  short: { color: colors.accent, fontWeight: "700" },
  hint: {
    fontSize: fonts.tiny,
    color: colors.inkSoft,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
});
