"use client";

import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { View } from "@/modern/lib/chronos/geo";

/* ─────────────────────────────────────────────────────────
 * LAND — world land from world-atlas, sampled into dot grids.
 *
 * Polygons are split out with bounding boxes so a sample only
 * draws what's near the view. sampleLattice() fills the land
 * through a d3-geo equirectangular projection onto a canvas
 * with one pixel per grid point, then reads which points are
 * mostly land: a point-in-polygon test for the whole grid in
 * one fill. Grid points sit on multiples of the step, so a
 * pan reuses the same dots and zoom levels nest.
 * ───────────────────────────────────────────────────────── */

export type LandRes = "110m" | "50m";
type Poly = { geo: GeoJSON.Feature<GeoJSON.Polygon>; west: number; east: number; south: number; north: number };
export type Land = { res: LandRes; polys: Poly[] };

export type Lattice = { res: LandRes; level: number; step: number; extent: View; pts: Float32Array };

const loaded: Partial<Record<LandRes, Land>> = {};
const pending: Partial<Record<LandRes, Promise<Land>>> = {};

function split(input: GeoJSON.FeatureCollection | GeoJSON.Feature): Poly[] {
  const feats = "features" in input ? input.features : [input];
  const out: Poly[] = [];
  for (const f of feats) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const coords of polys) {
      let west = Infinity;
      let east = -Infinity;
      let south = Infinity;
      let north = -Infinity;
      for (const [lng, lat] of coords[0] ?? []) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
      out.push({ geo: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } }, west, east, south, north });
    }
  }
  return out;
}

export function landNow(res: LandRes): Land | null {
  return loaded[res] ?? null;
}

export function loadLand(res: LandRes): Promise<Land> {
  const have = loaded[res];
  if (have) return Promise.resolve(have);
  pending[res] ??= (res === "110m" ? import("world-atlas/land-110m.json") : import("world-atlas/land-50m.json")).then((mod) => {
    const topo = ((mod as { default?: unknown }).default ?? mod) as unknown as Topology<{ land: GeometryCollection }>;
    const land: Land = { res, polys: split(feature(topo, topo.objects.land) as GeoJSON.FeatureCollection | GeoJSON.Feature) };
    loaded[res] = land;
    return land;
  });
  return pending[res]!;
}

let scratch: HTMLCanvasElement | null = null;

/** Land points of the grid with this `step` (degrees) covering `extent`. */
export function sampleLattice(land: Land, level: number, step: number, extent: View): Lattice {
  const i0 = Math.floor(extent.west / step);
  const i1 = Math.ceil(extent.east / step);
  const j0 = Math.ceil(extent.north / step);
  const j1 = Math.floor(extent.south / step);
  const cols = Math.max(1, i1 - i0 + 1);
  const rows = Math.max(1, j0 - j1 + 1);
  scratch ??= document.createElement("canvas");
  scratch.width = cols;
  scratch.height = rows;
  const ctx = scratch.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { res: land.res, level, step, extent, pts: new Float32Array() };
  ctx.clearRect(0, 0, cols, rows);
  // grid point (i0 + a, j0 - b) lands on the centre of pixel (a, b)
  const k = 180 / Math.PI / step;
  const projection = geoEquirectangular()
    .scale(k)
    .translate([-i0 + 0.5, j0 + 0.5])
    .clipExtent([
      [-1, -1],
      [cols + 1, rows + 1],
    ]);
  const path = geoPath(projection, ctx);
  const pad = step * 2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  for (const p of land.polys) {
    if (p.east < extent.west - pad || p.west > extent.east + pad || p.north < extent.south - pad || p.south > extent.north + pad) continue;
    path(p.geo);
  }
  ctx.fill("evenodd");
  const { data } = ctx.getImageData(0, 0, cols, rows);
  const out: number[] = [];
  for (let b = 0; b < rows; b++) {
    for (let a = 0; a < cols; a++) {
      if (data[(b * cols + a) * 4 + 3] >= 110) out.push((i0 + a) * step, (j0 - b) * step);
    }
  }
  return {
    res: land.res,
    level,
    step,
    extent: { west: i0 * step, east: i1 * step, south: j1 * step, north: j0 * step },
    pts: Float32Array.from(out),
  };
}

/** Draw lattices (the current one, plus one fading out after a level change). */
export function paintLattices(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  view: View,
  layers: { lattice: Lattice; alpha: number }[],
  color: string,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = color;
  const sx = width / (view.east - view.west);
  const sy = height / (view.north - view.south);
  for (const { lattice, alpha } of layers) {
    if (alpha <= 0.002) continue;
    const pitch = lattice.step * sx;
    const r = Math.min(2.4, Math.max(0.75, pitch * 0.19));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    const pts = lattice.pts;
    for (let i = 0; i < pts.length; i += 2) {
      const x = (pts[i] - view.west) * sx;
      if (x < -r || x > width + r) continue;
      const y = (view.north - pts[i + 1]) * sy;
      if (y < -r || y > height + r) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
