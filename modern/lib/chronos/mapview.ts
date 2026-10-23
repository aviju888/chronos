/* ─────────────────────────────────────────────────────────
 * MAPVIEW — the math behind the interactive Dot-matrix Map.
 * Pure functions, unit tested.
 *
 * The map is equirectangular, so a view is a lng/lat box and
 * every screen ↔ geo conversion is linear. A view always has
 * the aspect ratio of the map element, stays inside MAP_BOUNDS
 * and between whole-world and roughly city-level zoom.
 *
 *   zoomAt / panBy        gestures (the point under the cursor stays put)
 *   lerpView / easing     animated moves, zoom interpolated in log space
 *   latticeLevel          which dot grid to draw at this zoom
 *   clusterPins           screen-space clusters with stable ids
 *   inBox / boxFromPoints area filter (antimeridian-safe)
 *   trailOrder / Segments journey trail: order, fade by age, gentle arcs
 * ───────────────────────────────────────────────────────── */

import type { LatLng, View } from "./geo.js";

export type Size = { width: number; height: number };
export type ScreenPoint = { x: number; y: number };
/** a geographic rectangle; west > east means it crosses the antimeridian */
export type GeoBox = View;

/** world box the map can show (no Antarctica, nothing above Svalbard) */
export const MAP_BOUNDS: View = { west: -180, east: 180, south: -62, north: 84 };
/** narrowest view, in degrees of longitude: roughly a city */
export const MIN_LNG_SPAN = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function spanLimits(aspect: number, bounds: View = MAP_BOUNDS): { min: number; max: number } {
  const max = Math.min(bounds.east - bounds.west, (bounds.north - bounds.south) * aspect);
  return { min: Math.min(MIN_LNG_SPAN, max), max };
}

export function centerOf(v: View): LatLng {
  return { lat: (v.north + v.south) / 2, lng: (v.west + v.east) / 2 };
}

export function spanOf(v: View): number {
  return v.east - v.west;
}

/** The nearest legal view: aspect-correct, within zoom limits, inside the bounds (shifted, never squashed). */
export function constrain(view: View, aspect: number, bounds: View = MAP_BOUNDS): View {
  const { min, max } = spanLimits(aspect, bounds);
  const lngSpan = clamp(view.east - view.west, min, max);
  const latSpan = lngSpan / aspect;
  const c = centerOf(view);
  const west = clamp(c.lng - lngSpan / 2, bounds.west, bounds.east - lngSpan);
  const south = clamp(c.lat - latSpan / 2, bounds.south, bounds.north - latSpan);
  return { west, east: west + lngSpan, south, north: south + latSpan };
}

export function degPerPx(view: View, size: Size): number {
  return (view.east - view.west) / Math.max(1, size.width);
}

export function toScreen(p: LatLng, view: View, size: Size): ScreenPoint {
  return {
    x: ((p.lng - view.west) / (view.east - view.west)) * size.width,
    y: ((view.north - p.lat) / (view.north - view.south)) * size.height,
  };
}

export function toGeo(pt: ScreenPoint, view: View, size: Size): LatLng {
  return {
    lng: view.west + (pt.x / size.width) * (view.east - view.west),
    lat: view.north - (pt.y / size.height) * (view.north - view.south),
  };
}

/** Zoom by `factor` (> 1 zooms in) keeping the geo point under `pt` where it is. */
export function zoomAt(view: View, pt: ScreenPoint, factor: number, size: Size, bounds: View = MAP_BOUNDS): View {
  const aspect = size.width / size.height;
  const { min, max } = spanLimits(aspect, bounds);
  const span = view.east - view.west;
  const next = clamp(span / factor, min, max);
  const anchor = toGeo(pt, view, size);
  const fx = pt.x / size.width;
  const fy = pt.y / size.height;
  const latNext = next / aspect;
  return constrain(
    {
      west: anchor.lng - fx * next,
      east: anchor.lng + (1 - fx) * next,
      north: anchor.lat + fy * latNext,
      south: anchor.lat - (1 - fy) * latNext,
    },
    aspect,
    bounds,
  );
}

/** Move the map content by (dx, dy) screen pixels, as a drag does. */
export function panBy(view: View, dx: number, dy: number, size: Size, bounds: View = MAP_BOUNDS): View {
  const d = degPerPx(view, size);
  return constrain(
    { west: view.west - dx * d, east: view.east - dx * d, south: view.south + dy * d, north: view.north + dy * d },
    size.width / size.height,
    bounds,
  );
}

/** Interpolate views: center linearly, span geometrically, so zooms feel even. */
export function lerpView(a: View, b: View, t: number): View {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const sa = Math.max(1e-6, a.east - a.west);
  const sb = Math.max(1e-6, b.east - b.west);
  const span = Math.exp(lerp(Math.log(sa), Math.log(sb), t));
  const aspect = lerp(sa / (a.north - a.south), sb / (b.north - b.south), t);
  const lng = lerp(ca.lng, cb.lng, t);
  const lat = lerp(ca.lat, cb.lat, t);
  return { west: lng - span / 2, east: lng + span / 2, south: lat - span / aspect / 2, north: lat + span / aspect / 2 };
}

/** Same place, same zoom (within `tol` of the span). */
export function viewsClose(a: View, b: View, tol = 0.02): boolean {
  const s = Math.max(spanOf(a), spanOf(b));
  const ca = centerOf(a);
  const cb = centerOf(b);
  return (
    Math.abs(ca.lng - cb.lng) <= s * tol &&
    Math.abs(ca.lat - cb.lat) <= s * tol &&
    Math.abs(Math.log(spanOf(a) / spanOf(b))) <= tol * 2
  );
}

/** CSS-style cubic-bezier timing function. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    // bisection fallback
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** the lab's ease-out-strong: cubic-bezier(0.23, 1, 0.32, 1) */
export const easeOutStrong = cubicBezier(0.23, 1, 0.32, 1);

/* ── dot lattice ── */

/** step of the coarsest grid, in degrees; each level halves it */
export const LATTICE_BASE = 3;

/**
 * Pick the dot grid for this zoom: the step that puts dots `minPitch`
 * to `2 * minPitch` pixels apart. Grids nest (each level halves the step),
 * so zooming in fills new dots in between the old ones.
 */
export function latticeLevel(view: View, size: Size, minPitch = 5): { level: number; step: number; pitch: number } {
  const d = degPerPx(view, size);
  const level = Math.floor(Math.log2(LATTICE_BASE / (minPitch * d)));
  const step = LATTICE_BASE * Math.pow(2, -level);
  return { level, step, pitch: step / d };
}

/* ── clusters ── */

export type PinInput = { id: string; x: number; y: number; weight: number; year: number };
export type PinCluster = { id: string; anchor: string; members: string[]; x: number; y: number };

/**
 * Screen-space clustering. The heaviest pin leads; every other pin joins the
 * nearest leader within `radius` px or leads its own cluster. A cluster's id
 * comes from its leader, so it keeps the same id as the map zooms until it
 * splits, and a pin standing alone keeps its own id.
 */
export function clusterPins(pins: PinInput[], radius = 17): PinCluster[] {
  const order = [...pins].sort((a, b) => b.weight - a.weight || a.year - b.year || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const r2 = radius * radius;
  const groups: { lead: PinInput; members: PinInput[] }[] = [];
  for (const p of order) {
    let best: (typeof groups)[number] | null = null;
    let bestD = Infinity;
    for (const g of groups) {
      const dx = g.lead.x - p.x;
      const dy = g.lead.y - p.y;
      const d = dx * dx + dy * dy;
      if (d <= r2 && d < bestD) {
        best = g;
        bestD = d;
      }
    }
    if (best) best.members.push(p);
    else groups.push({ lead: p, members: [p] });
  }
  return groups.map(({ lead, members }) => {
    const sorted = [...members].sort((a, b) => a.year - b.year || (a.id < b.id ? -1 : 1));
    return {
      id: members.length > 1 ? `cluster:${lead.id}` : lead.id,
      anchor: lead.id,
      members: sorted.map((m) => m.id),
      x: members.reduce((s, m) => s + m.x, 0) / members.length,
      y: members.reduce((s, m) => s + m.y, 0) / members.length,
    };
  });
}

/** Bubble radius for a cluster of n: grows gently (log) */
export function clusterRadius(n: number): number {
  return 8.5 + 2.2 * Math.log2(Math.max(2, n));
}

/* ── area filter ── */

/** wrap a longitude into [-180, 180) */
export function normalizeLng(lng: number): number {
  const x = (((lng + 180) % 360) + 360) % 360;
  return x - 180;
}

/** The box between two corners dragged on the map. */
export function boxFromPoints(a: LatLng, b: LatLng): GeoBox {
  return {
    west: Math.min(a.lng, b.lng),
    east: Math.max(a.lng, b.lng),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  };
}

/** Is the point inside the box? A box with west > east wraps across the antimeridian. */
export function inBox(p: LatLng, box: GeoBox): boolean {
  if (p.lat < box.south || p.lat > box.north) return false;
  if (box.east - box.west >= 360) return true;
  const lng = normalizeLng(p.lng);
  const west = normalizeLng(box.west);
  // an east edge of exactly 180 is the world's edge, not -180
  const east = box.east === 180 ? 180 : normalizeLng(box.east);
  return west <= east ? lng >= west && lng <= east : lng >= west || lng <= east;
}

/* ── journey trail ── */

export type TrailNode = { id: string; year: number; lat: number; lng: number; x: number; y: number };
export type TrailSegment = { id: string; fromId: string; toId: string; year: number; d: string; opacity: number };

/** Located events in travel order: by year, then importance, then id. */
export function trailOrder<T extends { id: string; year: number; weight: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.year - b.year || b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Control point for a gentle arc from a to b that bulges upward on screen, like a flight path. */
export function arcControl(a: ScreenPoint, b: ScreenPoint, bend = 0.16): ScreenPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ...a };
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (ny === 0 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: (a.x + b.x) / 2 + nx * len * bend, y: (a.y + b.y) / 2 + ny * len * bend };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Trail segments up to the cursor (all of them when it's null). Consecutive
 * events at the same place are skipped so the trail never draws a zero-length
 * hop; ids depend only on the events, never the zoom, so a segment draws in
 * once. Opacity fades with age: the newest segment is full strength and one
 * `fadeShare` of the range back it bottoms out at `minOpacity`.
 */
export function trailSegments(
  nodes: TrailNode[],
  cursor: number | null,
  span: number,
  { fadeShare = 0.4, minOpacity = 0.14, samePlace = 0.002, bend = 0.16 }: { fadeShare?: number; minOpacity?: number; samePlace?: number; bend?: number } = {},
): TrailSegment[] {
  const shown = cursor === null ? nodes : nodes.filter((n) => n.year <= cursor);
  if (shown.length < 2) return [];
  const now = cursor ?? shown[shown.length - 1].year;
  const segs: TrailSegment[] = [];
  let prev = shown[0];
  for (let i = 1; i < shown.length; i++) {
    const n = shown[i];
    if (Math.abs(n.lat - prev.lat) < samePlace && Math.abs(n.lng - prev.lng) < samePlace) continue;
    const age = Math.max(0, now - n.year) / Math.max(1, span * fadeShare);
    const c = arcControl(prev, n, bend);
    segs.push({
      id: `${prev.id}>${n.id}`,
      fromId: prev.id,
      toId: n.id,
      year: n.year,
      d: `M${r2(prev.x)},${r2(prev.y)}Q${r2(c.x)},${r2(c.y)} ${r2(n.x)},${r2(n.y)}`,
      opacity: Math.max(minOpacity, 1 - age),
    });
    prev = n;
  }
  if (segs.length) segs[segs.length - 1].opacity = 1;
  return segs;
}
