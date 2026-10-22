"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { View } from "@/modern/lib/chronos/geo";
import { degPerPx, latticeLevel, type Size } from "@/modern/lib/chronos/mapview";
import { landNow, loadLand, paintLattices, sampleLattice, type Land, type Lattice } from "./land";

/* ─────────────────────────────────────────────────────────
 * LAND CANVAS — the dot layer. Redrawn every frame from a
 * cached lattice (cheap: project and fill a few thousand
 * dots), so dots stay crisp mid-gesture. The lattice is only
 * re-sampled when the zoom crosses into another grid level,
 * the view leaves the sampled area, or land-50m arrives;
 * level changes crossfade in 200ms.
 * ───────────────────────────────────────────────────────── */

const FALLBACK_LIGHT = "rgb(36, 37, 41)";
const FALLBACK_DARK = "rgb(244, 245, 247)";
let probe: CanvasRenderingContext2D | null = null;

function readInk(): string {
  const root = document.documentElement;
  const dark = root.classList.contains("dark");
  const value = getComputedStyle(root).getPropertyValue("--ink").trim();
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe || !value) return dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  probe.fillStyle = "#010203";
  probe.fillStyle = value;
  // a colour the canvas can't parse leaves fillStyle untouched
  return probe.fillStyle === "#010203" ? (dark ? FALLBACK_DARK : FALLBACK_LIGHT) : value;
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-project"] });
  return () => mo.disconnect();
}

/** the --ink token, following theme switches */
export function useInkColor(): string {
  return useSyncExternalStore(subscribeTheme, readInk, () => FALLBACK_LIGHT);
}

function useLand(res: "110m" | "50m", wanted: boolean): Land | null {
  const [land, setLand] = useState<Land | null>(() => landNow(res));
  useEffect(() => {
    if (!wanted || land) return;
    let alive = true;
    loadLand(res).then((l) => alive && setLand(l));
    return () => {
      alive = false;
    };
  }, [res, wanted, land]);
  return land;
}

const FADE_MS = 200;
const within = (inner: View, outer: View) => inner.west >= outer.west && inner.east <= outer.east && inner.south >= outer.south && inner.north <= outer.north;

function expand(v: View, f: number): View {
  const w = (v.east - v.west) * f;
  const h = (v.north - v.south) * f;
  return {
    west: Math.max(-180, v.west - w),
    east: Math.min(180, v.east + w),
    south: Math.max(-89, v.south - h),
    north: Math.min(89, v.north + h),
  };
}

export function LandCanvas({ view, size, minPitch = 5, alpha = 0.2 }: { view: View; size: Size; minPitch?: number; alpha?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const span = view.east - view.west;
  const land110 = useLand("110m", true);
  // regional zooms read the 50m coastline, loaded on demand
  const land50 = useLand("50m", span < 30);
  const land = span < 30 && land50 ? land50 : land110;
  const color = useInkColor();
  const current = useRef<Lattice | null>(null);
  const fading = useRef<{ lattice: Lattice; start: number } | null>(null);
  const frame = useRef<number | null>(null);
  const latest = useRef({ view, size, color, alpha });

  useLayoutEffect(() => {
    latest.current = { view, size, color, alpha };
    const canvas = ref.current;
    if (!canvas || !land || !size.width || !size.height) return;

    // pick the grid: keep the current one while its pitch is near the band (no flicker at the edges)
    const cur = current.current;
    const pitchNow = cur ? cur.step / degPerPx(view, size) : 0;
    const keep = cur && cur.res === land.res && pitchNow >= minPitch * 0.9 && pitchNow < minPitch * 2.2;
    const level = keep ? { level: cur.level, step: cur.step } : latticeLevel(view, size, minPitch);
    if (!cur || !keep || !within(view, cur.extent)) {
      const next = sampleLattice(land, level.level, level.step, expand(view, 0.5));
      if (cur && (cur.level !== next.level || cur.res !== next.res)) fading.current = { lattice: cur, start: performance.now() };
      current.current = next;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(size.width * dpr);
    const h = Math.round(size.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      frame.current = null;
      const { view: v, size: s, color: c, alpha: a } = latest.current;
      const lattice = current.current;
      if (!lattice) return;
      const f = fading.current;
      const t = f ? Math.min(1, (performance.now() - f.start) / FADE_MS) : 1;
      const layers = f && t < 1 ? [{ lattice: f.lattice, alpha: a * (1 - t) }, { lattice, alpha: a * t }] : [{ lattice, alpha: a }];
      if (f && t >= 1) fading.current = null;
      paintLattices(ctx, s.width, s.height, dpr, v, layers, c);
      if (fading.current) frame.current = requestAnimationFrame(paint);
    };
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    paint();
  }, [view, size, land, color, alpha, minPitch]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
