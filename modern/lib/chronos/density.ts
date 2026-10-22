/* ─────────────────────────────────────────────────────────
 * DENSITY — the Time Scrubber's ribbon and axis math.
 * Pure functions (client and server safe).
 *
 *   densityCurve  Gaussian kernel density of event years
 *   ribbonPath    a smoothed band, symmetric about the axis
 *   niceTicks     1-2-5 spaced year labels (no year 0)
 * ───────────────────────────────────────────────────────── */

import type { YearRange } from "./types.js";

export type WeightedYear = { year: number; weight?: number };

/** Kernel density sampled at `samples` points across the range, normalized to 0..1. */
export function densityCurve(points: WeightedYear[], range: YearRange, samples = 120, bandwidth?: number): number[] {
  const span = Math.max(1, range.end - range.start);
  const h = bandwidth ?? Math.max(span / 48, 0.75);
  const out = new Array<number>(samples).fill(0);
  if (points.length === 0) return out;
  for (let i = 0; i < samples; i++) {
    const x = range.start + (span * i) / (samples - 1);
    let sum = 0;
    for (const p of points) {
      const u = (x - p.year) / h;
      if (u > 4 || u < -4) continue;
      sum += (p.weight ?? 1) * Math.exp(-0.5 * u * u);
    }
    out[i] = sum;
  }
  const max = Math.max(...out);
  return max > 0 ? out.map((v) => v / max) : out;
}

/** Catmull-Rom spline through the points, as cubic Bezier path commands (no leading M). */
export function catmullRom(points: [number, number][], tension = 0.5): string {
  if (points.length < 2) return "";
  const t = (1 - tension) * 2;
  let d = "";
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * t;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * t;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * t;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * t;
    d += `C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(p2[0])},${r(p2[1])}`;
  }
  return d;
}

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * A closed band around y = mid: top edge left→right, bottom edge right→left.
 * `minHalf` keeps a hairline visible where nothing happened.
 */
export function ribbonPath(values: number[], width: number, mid: number, amplitude: number, minHalf = 0.75): string {
  if (values.length < 2 || width <= 0) return "";
  const step = width / (values.length - 1);
  const top: [number, number][] = values.map((v, i) => [i * step, mid - Math.max(minHalf, v * amplitude)]);
  const bottom: [number, number][] = values.map((v, i) => [i * step, mid + Math.max(minHalf, v * amplitude)]).reverse() as [number, number][];
  return `M${r(top[0][0])},${r(top[0][1])}${catmullRom(top)}L${r(bottom[0][0])},${r(bottom[0][1])}${catmullRom(bottom)}Z`;
}

/** 1, 2 or 5 × 10^k so that span/step ≈ target */
export function niceStep(span: number, target = 6): number {
  const raw = Math.max(1, span) / Math.max(1, target);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / pow;
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10;
  return Math.max(1, nice * pow);
}

/** Round-numbered years inside the range. Year 0 does not exist, so a tick there becomes 1 CE. */
export function niceTicks(range: YearRange, target = 6): number[] {
  const step = niceStep(range.end - range.start, target);
  const first = Math.ceil(range.start / step) * step;
  const ticks: number[] = [];
  for (let y = first; y <= range.end; y += step) ticks.push(y === 0 ? 1 : y);
  return ticks;
}

/** year → x across a track of `width` px */
export function yearToX(year: number, range: YearRange, width: number): number {
  const span = Math.max(1, range.end - range.start);
  return ((year - range.start) / span) * width;
}

/** x → year (rounded, never 0) */
export function xToYear(x: number, range: YearRange, width: number): number {
  const span = Math.max(1, range.end - range.start);
  const y = Math.round(range.start + (Math.min(Math.max(x, 0), width) / Math.max(1, width)) * span);
  return y === 0 ? 1 : y;
}
