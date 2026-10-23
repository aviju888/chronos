/* ─────────────────────────────────────────────────────────
 * GEO — map framing for the Dot-matrix Map.
 * Equirectangular, so a view is just a lng/lat box whose
 * shape matches the map's aspect ratio. Pure functions.
 * ───────────────────────────────────────────────────────── */

export type View = { west: number; east: number; south: number; north: number };
export type LatLng = { lat: number; lng: number };

/** The inhabited world, without Antarctica */
export const WORLD: View = { west: -180, east: 180, south: -58, north: 80 };

/** Grow or shrink a view so lngSpan / latSpan equals the aspect (width / height) */
export function matchAspect(view: View, aspect: number): View {
  const cx = (view.west + view.east) / 2;
  const cy = (view.south + view.north) / 2;
  let lngSpan = view.east - view.west;
  let latSpan = view.north - view.south;
  if (lngSpan / latSpan > aspect) latSpan = lngSpan / aspect;
  else lngSpan = latSpan * aspect;
  return { west: cx - lngSpan / 2, east: cx + lngSpan / 2, south: cy - latSpan / 2, north: cy + latSpan / 2 };
}

/** Keep a view inside the world box, shifting before shrinking */
export function clampView(view: View, bounds: View = { west: -180, east: 180, south: -90, north: 90 }): View {
  let { west, south } = view;
  const lngSpan = Math.min(view.east - view.west, bounds.east - bounds.west);
  const latSpan = Math.min(view.north - view.south, bounds.north - bounds.south);
  if (west < bounds.west) west = bounds.west;
  if (west + lngSpan > bounds.east) west = bounds.east - lngSpan;
  if (south < bounds.south) south = bounds.south;
  if (south + latSpan > bounds.north) south = bounds.north - latSpan;
  return { west, east: west + lngSpan, south, north: south + latSpan };
}

/**
 * Frame the points: their bounding box, padded, never tighter than `minLng`
 * degrees across (so a single city still shows its coastline), matched to the aspect.
 */
export function fitView(points: LatLng[], aspect: number, { pad = 0.2, minLng = 26 }: { pad?: number; minLng?: number } = {}): View {
  if (points.length === 0) return clampView(matchAspect(WORLD, aspect));
  let west = Math.min(...points.map((p) => p.lng));
  let east = Math.max(...points.map((p) => p.lng));
  let south = Math.min(...points.map((p) => p.lat));
  let north = Math.max(...points.map((p) => p.lat));
  const lngPad = Math.max((east - west) * pad, 1);
  const latPad = Math.max((north - south) * pad, 1);
  west -= lngPad;
  east += lngPad;
  south -= latPad;
  north += latPad;
  if (east - west < minLng) {
    const c = (west + east) / 2;
    west = c - minLng / 2;
    east = c + minLng / 2;
  }
  const minLat = minLng / aspect;
  if (north - south < minLat) {
    const c = (south + north) / 2;
    south = c - minLat / 2;
    north = c + minLat / 2;
  }
  return clampView(matchAspect({ west, east, south, north }, aspect));
}

/** lng/lat → px inside a width × height box showing `view` */
export function toXY(p: LatLng, view: View, width: number, height: number): [number, number] {
  return [((p.lng - view.west) / (view.east - view.west)) * width, ((view.north - p.lat) / (view.north - view.south)) * height];
}

/** Drop outliers (beyond 3 IQRs) so one far-off pin doesn't zoom the map out to the world */
export function trimOutliers(points: LatLng[]): LatLng[] {
  if (points.length < 6) return points;
  const q = (xs: number[], f: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) * f)];
  };
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const [l1, l3] = [q(lngs, 0.25), q(lngs, 0.75)];
  const [a1, a3] = [q(lats, 0.25), q(lats, 0.75)];
  const li = Math.max(l3 - l1, 4) * 3;
  const ai = Math.max(a3 - a1, 3) * 3;
  const kept = points.filter((p) => p.lng >= l1 - li && p.lng <= l3 + li && p.lat >= a1 - ai && p.lat <= a3 + ai);
  return kept.length >= points.length * 0.75 ? kept : points;
}

/**
 * The points worth framing: the tightest neighbourhood that holds most of them
 * (a city's own history rather than the one far-off war it mentions), else
 * everything minus far outliers.
 */
export function focusPoints(
  points: LatLng[],
  // a tight cluster only needs a majority; a wide one has to hold nearly everything
  steps: { cell: number; share: number }[] = [
    { cell: 5, share: 0.5 },
    { cell: 10, share: 0.75 },
    { cell: 22, share: 0.88 },
  ],
): LatLng[] {
  if (points.length < 5) return points;
  for (const { cell, share } of steps) {
    let best: LatLng[] = [];
    for (const p of points) {
      const near = points.filter((q) => Math.abs(q.lat - p.lat) <= cell && Math.abs(q.lng - p.lng) <= cell * 1.5);
      if (near.length > best.length) best = near;
    }
    if (best.length >= points.length * share) return best;
  }
  return trimOutliers(points);
}
