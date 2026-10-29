import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { healthSupported, requestHealthAccess, workoutRoute } from '../lib/health';
import { saveRoute, watchRoute } from '../lib/store';
import { colors, fonts, radius, spacing } from '../theme';

const TILE = 256;
const PAD = 18;
// OpenStreetMap's own tiles: free, no key, attribution required.
const TILES = 'https://tile.openstreetmap.org';

/**
 * Where a session went: its GPS route over a street map, start in green and
 * finish in dark. The route is read from Health on the phone the first time the
 * session is opened and kept in the account, so the web shows it too.
 *
 * Drawn with plain images and lines rather than a map library, so it ships as an
 * ordinary update and works the same on the web.
 */
export default function RouteMap({ workout, height = 220 }) {
  const route = useRoute(workout);
  const [width, setWidth] = useState(0);

  if (!route || !route.points || route.points.length < 2) {
    if (route?.loading) return <Text style={styles.note}>Looking for a route…</Text>;
    const why = noRouteReason(workout, route);
    return why ? <Text style={styles.note}>{why}</Text> : null;
  }

  return (
    <View>
      <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? <Drawing points={route.points} width={width} height={height} /> : null}
      </View>
      <Text style={styles.credit}>© OpenStreetMap contributors</Text>
    </View>
  );
}

/** A line saying why a session has no map, once that is known. */
function noRouteReason(workout, route) {
  if (!workout) return null;
  if (workout.indoor) return 'Indoor session: no route.';
  if (workout.imported) return route === null ? 'Imported session: no route on file.' : null;
  if (!(workout.metres > 0)) return null;
  if (route?.points) return 'No route recorded for this session.';
  return null;
}

/** undefined/null while unknown; { loading }; or { points }. */
function useRoute(workout) {
  const { user } = useAuth();
  const [stored, setStored] = useState(undefined);
  // What Health said on this phone, drawn at once without waiting for the
  // account — on a slow connection that round trip alone takes seconds.
  const [local, setLocal] = useState(undefined);
  const id = workout?.id;
  const eligible =
    healthSupported && workout && !workout.imported && !workout.indoor && workout.metres > 0;

  useEffect(() => {
    if (!user || !id) return undefined;
    return watchRoute(user.uid, id, setStored);
  }, [user, id]);

  useEffect(() => {
    if (!eligible || !id) return undefined;
    let cancelled = false;
    (async () => {
      if (!(await requestHealthAccess())) return;
      const points = await workoutRoute(id);
      if (!cancelled) setLocal(points ?? []);
    })().catch((error) => {
      console.warn('route read failed', error);
      if (!cancelled) setLocal([]);
    });
    return () => {
      cancelled = true;
    };
  }, [eligible, id]);

  // Keep it in the account for the web, once the account has said it has none.
  useEffect(() => {
    if (stored === null && local && user && id) {
      saveRoute(user.uid, id, local).catch((error) => console.warn('route save failed', error));
    }
  }, [stored, local, user, id]);

  if (stored?.points?.length) return stored;
  if (local) return { points: local };
  if (stored) return stored;
  // undefined until the account answers, null once it says there is none.
  return eligible ? { loading: true } : stored;
}

// Web Mercator, in pixels at zoom z.
function project([lat, lon], z) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function Drawing({ points, width, height }) {
  // The closest zoom at which the whole route fits inside the frame.
  let z = 18;
  let projected;
  for (; z > 2; z -= 1) {
    projected = points.map((p) => project(p, z));
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    if (Math.max(...xs) - Math.min(...xs) <= width - PAD * 2 && Math.max(...ys) - Math.min(...ys) <= height - PAD * 2) break;
  }
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const originX = (Math.max(...xs) + Math.min(...xs)) / 2 - width / 2;
  const originY = (Math.max(...ys) + Math.min(...ys)) / 2 - height / 2;
  // Points closer than a few pixels are merged: tiny rotated segments leave
  // hairline gaps, which turned dense tracks into dashes.
  const local = [];
  for (const p of projected) {
    const q = { x: p.x - originX, y: p.y - originY };
    const last = local[local.length - 1];
    if (!last || Math.hypot(q.x - last.x, q.y - last.y) >= 3) local.push(q);
  }
  const lastPoint = projected[projected.length - 1];
  local.push({ x: lastPoint.x - originX, y: lastPoint.y - originY });

  const tiles = [];
  const max = 2 ** z;
  for (let tx = Math.floor(originX / TILE); tx <= Math.floor((originX + width) / TILE); tx += 1) {
    for (let ty = Math.floor(originY / TILE); ty <= Math.floor((originY + height) / TILE); ty += 1) {
      if (ty < 0 || ty >= max) continue;
      const wrapped = ((tx % max) + max) % max;
      tiles.push(
        <Image
          key={`${tx}-${ty}`}
          source={{ uri: `${TILES}/${z}/${wrapped}/${ty}.png` }}
          style={{ position: 'absolute', left: tx * TILE - originX, top: ty * TILE - originY, width: TILE, height: TILE }}
        />
      );
    }
  }

  const segments = [];
  for (let i = 0; i + 1 < local.length; i += 1) {
    const a = local[i];
    const b = local[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;
    segments.push(
      <View
        key={i}
        style={[
          styles.segment,
          {
            left: (a.x + b.x) / 2 - length / 2,
            top: (a.y + b.y) / 2 - 2,
            width: length + 3,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          },
        ]}
      />
    );
  }
  const start = local[0];
  const end = local[local.length - 1];

  return (
    <>
      {tiles}
      {segments}
      <View style={[styles.dot, styles.end, { left: end.x - 6, top: end.y - 6 }]} />
      <View style={[styles.dot, styles.start, { left: start.x - 6, top: start.y - 6 }]} />
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: radius,
    backgroundColor: colors.line,
    marginBottom: 2,
  },
  segment: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.primary },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  start: { backgroundColor: '#2E9E57' },
  end: { backgroundColor: colors.ink },
  credit: { fontSize: 9, color: colors.inkSoft, textAlign: 'right', marginBottom: spacing.md },
  note: { fontSize: fonts.tiny, color: colors.inkSoft, marginBottom: spacing.sm },
});
