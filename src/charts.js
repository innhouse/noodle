/**
 * The one chart Noodle draws, in two shapes.
 *
 * TimeChart: values over dates. A green band marks the range that counts as
 * expected — the lab's reference interval on Labs, the person's own usual on
 * Health — and the side of it that would be unwelcome is shaded orange. Dots are
 * coloured by the zone they land in; a grey least-squares line shows the trend.
 *
 * BarChart: an amount per period against a target line.
 *
 * Both are plain views, so phone and web render them identically with nothing
 * native to install. Neither judges anything: the band and its unwelcome side
 * are decided by the caller, who knows what the metric means.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme';

const PAD_TOP = 22;
const PAD_BOTTOM = 26;
const PAD_LEFT = 44;
const PAD_RIGHT = 18;

function dayMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function shortDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function monthYear(key) {
  const [y, m] = key.split('-').map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short' });
  return `${month} ${String(y).slice(2)}`;
}

/**
 * @param points    [{ date: 'YYYY-MM-DD', value }], any order
 * @param band      { low, high } or null — the expected range (either bound optional)
 * @param outside   'above' | 'below' | 'both' | 'none' — which side of the band is unwelcome
 * @param format    value → string for labels
 * @param labels    'all' | 'ends' | 'none' — which dots get a value label
 * @param height    px
 * @param onPointPress  called with the point when a dot is tapped
 */
export function TimeChart({
  points,
  band,
  outside = 'both',
  format = (v) => String(v),
  labels = 'all',
  height = 150,
  dateStyle = 'auto',
  onPointPress,
}) {
  const [width, setWidth] = useState(0);
  const sorted = [...(points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;

  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const values = sorted.map((p) => p.value);
  const candidates = [...values];
  if (band?.low != null) candidates.push(band.low);
  if (band?.high != null) candidates.push(band.high);
  let min = Math.min(...candidates);
  let max = Math.max(...candidates);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  // Keep room on the unwelcome side so the orange zone is on screen even when
  // every point is inside the band.
  if (band?.high != null && (outside === 'above' || outside === 'both')) max = Math.max(max, band.high + span * 0.25);
  if (band?.low != null && (outside === 'below' || outside === 'both')) min = Math.min(min, band.low - span * 0.25);
  const pad = (max - min) * 0.1;
  min -= pad;
  max += pad;
  if (min < 0 && Math.min(...candidates) >= 0) min = 0;

  const yFor = (v) => PAD_TOP + plotH - ((v - min) / (max - min)) * plotH;
  const t0 = dayMs(sorted[0].date);
  const t1 = dayMs(sorted[sorted.length - 1].date);
  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const xFor = (key) => PAD_LEFT + (t1 === t0 ? plotW / 2 : ((dayMs(key) - t0) / (t1 - t0)) * plotW);
  const baseline = PAD_TOP + plotH;

  const bandTop = band?.high != null ? yFor(band.high) : PAD_TOP;
  const bandBottom = band?.low != null ? yFor(band.low) : baseline;
  const isOut = (v) =>
    (band?.high != null && v > band.high && (outside === 'above' || outside === 'both')) ||
    (band?.low != null && v < band.low && (outside === 'below' || outside === 'both'));

  const guides = [];
  const addGuide = (v, strong) => {
    if (v == null) return;
    if (guides.some((g) => Math.abs(g.v - v) < (max - min) * 0.07)) return;
    guides.push({ v, strong });
  };
  addGuide(band?.low, true);
  addGuide(band?.high, true);
  addGuide(Math.max(...values), false);
  addGuide(Math.min(...values), false);

  let trend = null;
  if (sorted.length >= 3 && plotW > 0 && t1 > t0) {
    const xs = sorted.map((p) => xFor(p.date));
    const ys = sorted.map((p) => yFor(p.value));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i += 1) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den > 0) {
      const slope = num / den;
      const clamp = (y) => Math.min(baseline, Math.max(PAD_TOP, y));
      const y0 = clamp(my + slope * (xs[0] - mx));
      const y1 = clamp(my + slope * (xs[n - 1] - mx));
      const dx = xs[n - 1] - xs[0];
      const dy = y1 - y0;
      trend = { length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx), cx: (xs[0] + xs[n - 1]) / 2, cy: (y0 + y1) / 2 };
    }
  }

  const dense = sorted.length > 14;
  const dot = dense ? 7 : 12;
  const labelThese = new Set();
  if (labels === 'all' && !dense) sorted.forEach((p) => labelThese.add(p.date));
  if (labels !== 'none') {
    labelThese.add(sorted[0].date);
    labelThese.add(sorted[sorted.length - 1].date);
  }
  // Date labels: as many as fit without overlapping, always including the ends.
  const maxLabels = Math.max(2, Math.floor(plotW / 64));
  const step = Math.max(1, Math.ceil(sorted.length / maxLabels));
  const dateLabels = sorted.filter((p, i) => i % step === 0 || i === sorted.length - 1);
  if (dateLabels.length >= 2) {
    const a = dateLabels[dateLabels.length - 2];
    const b = dateLabels[dateLabels.length - 1];
    if (xFor(b.date) - xFor(a.date) < 56) dateLabels.splice(dateLabels.length - 2, 1);
  }
  const fmtDate = dateStyle === 'month' || (dateStyle === 'auto' && t1 - t0 > 200 * 86_400_000) ? monthYear : shortDate;

  return (
    <View style={[styles.chart, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          {band?.high != null && (outside === 'above' || outside === 'both') ? (
            <View style={[styles.outBand, { top: PAD_TOP, height: Math.max(0, bandTop - PAD_TOP), left: PAD_LEFT, width: plotW }]} />
          ) : null}
          {band?.low != null && (outside === 'below' || outside === 'both') ? (
            <View style={[styles.outBand, { top: bandBottom, height: Math.max(0, baseline - bandBottom), left: PAD_LEFT, width: plotW }]} />
          ) : null}
          {band ? (
            <View style={[styles.band, { top: bandTop, height: Math.max(2, bandBottom - bandTop), left: PAD_LEFT, width: plotW }]} />
          ) : null}
          {guides.map((g) => (
            <View key={g.v}>
              <View style={[styles.guide, g.strong && styles.guideStrong, { top: yFor(g.v), left: PAD_LEFT, width: plotW }]} />
              <Text style={[styles.yLabel, g.strong && styles.yLabelStrong, { top: yFor(g.v) - 7, width: PAD_LEFT - 6 }]}>
                {format(g.v)}
              </Text>
            </View>
          ))}
          {trend ? (
            <View
              style={[
                styles.trend,
                { width: trend.length, left: trend.cx - trend.length / 2, top: trend.cy, transform: [{ rotate: `${trend.angle}rad` }] },
              ]}
            />
          ) : null}
          <View style={[styles.axis, { top: baseline, left: PAD_LEFT, width: plotW }]} />
          {sorted.map((p) => {
            const x = xFor(p.date);
            const y = yFor(p.value);
            const colour = isOut(p.value) ? colors.accent : colors.primary;
            const hit = onPointPress ? 28 : dot;
            return (
              <View key={p.id ?? p.date}>
                {!dense ? <View style={[styles.stem, { left: x, top: y, height: baseline - y, backgroundColor: colour }]} /> : null}
                <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2, left: x - dot / 2, top: y - dot / 2, backgroundColor: colour }]} />
                {labelThese.has(p.date) ? (
                  <Text style={[styles.dotLabel, { left: x - 24, top: y - 20 }]}>{format(p.value)}</Text>
                ) : null}
                {onPointPress ? (
                  <Pressable
                    onPress={() => onPointPress(p)}
                    style={{ position: 'absolute', left: x - hit / 2, top: y - hit / 2, width: hit, height: hit }}
                  />
                ) : null}
              </View>
            );
          })}
          {dateLabels.map((p) => (
            <Text key={`d${p.date}`} style={[styles.dateLabel, { left: xFor(p.date) - 28, top: baseline + 4 }]}>
              {fmtDate(p.date)}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

/**
 * @param bars    [{ label, value }] in display order
 * @param target  number or null — drawn as a dashed line
 */
export function BarChart({ bars, target, format = (v) => String(Math.round(v)), height = 140 }) {
  const [width, setWidth] = useState(0);
  if (!bars?.length) return null;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const max = Math.max(...bars.map((b) => b.value), target ?? 0, 1) * 1.1;
  const yFor = (v) => PAD_TOP + plotH - (v / max) * plotH;
  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const slot = plotW / bars.length;
  const barW = Math.max(6, slot * 0.6);
  const baseline = PAD_TOP + plotH;
  // Label only as many bars as fit without overlapping, counting back from the
  // latest so the most recent week is always named.
  const labelEvery = Math.max(1, Math.ceil(60 / slot));
  const labelled = (i) => (bars.length - 1 - i) % labelEvery === 0;

  return (
    <View style={[styles.chart, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          {target != null ? (
            <>
              <View style={[styles.targetLine, { top: yFor(target), left: PAD_LEFT, width: plotW }]} />
              <Text style={[styles.yLabel, styles.yLabelStrong, { top: yFor(target) - 7, width: PAD_LEFT - 6 }]}>{format(target)}</Text>
            </>
          ) : null}
          <View style={[styles.axis, { top: baseline, left: PAD_LEFT, width: plotW }]} />
          {bars.map((b, i) => {
            const x = PAD_LEFT + slot * i + (slot - barW) / 2;
            const y = yFor(b.value);
            const met = target != null && b.value >= target;
            return (
              <View key={b.label}>
                <View style={[styles.bar, { left: x, top: y, width: barW, height: Math.max(0, baseline - y), backgroundColor: met ? colors.primary : colors.primarySoft, borderColor: colors.primary }]} />
                {b.value > 0 && (slot >= 40 || labelled(i)) ? (
                  <Text style={[styles.dotLabel, { left: x + barW / 2 - 24, top: y - 18 }]}>{format(b.value)}</Text>
                ) : null}
                {labelled(i) ? (
                  <Text style={[styles.dateLabel, { left: x + barW / 2 - 28, top: baseline + 4 }]}>{b.label}</Text>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%', maxWidth: 640, overflow: 'hidden' },
  band: { position: 'absolute', backgroundColor: colors.primarySoft },
  outBand: { position: 'absolute', backgroundColor: colors.accentSoft, opacity: 0.8 },
  guide: { position: 'absolute', height: 1, backgroundColor: colors.line, opacity: 0.7 },
  guideStrong: { backgroundColor: colors.primary, opacity: 0.35 },
  yLabel: { position: 'absolute', left: 0, textAlign: 'right', fontSize: 10, color: colors.inkSoft },
  yLabelStrong: { color: colors.primary, fontWeight: '700' },
  axis: { position: 'absolute', height: 1, backgroundColor: colors.line },
  trend: { position: 'absolute', height: 2, backgroundColor: colors.inkSoft, opacity: 0.45, borderRadius: 1 },
  targetLine: { position: 'absolute', height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.ink },
  stem: { position: 'absolute', width: 2, opacity: 0.5 },
  dot: { position: 'absolute', borderWidth: 2, borderColor: colors.card },
  dotLabel: { position: 'absolute', width: 48, textAlign: 'center', fontSize: 10, fontWeight: '700', color: colors.ink },
  dateLabel: { position: 'absolute', width: 56, textAlign: 'center', fontSize: 9, color: colors.inkSoft },
  bar: { position: 'absolute', borderRadius: 3, borderWidth: 1 },
});
