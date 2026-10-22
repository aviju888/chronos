// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  arcControl,
  boxFromPoints,
  clusterPins,
  clusterRadius,
  constrain,
  cubicBezier,
  easeOutStrong,
  inBox,
  latticeLevel,
  lerpView,
  MAP_BOUNDS,
  MIN_LNG_SPAN,
  normalizeLng,
  panBy,
  spanLimits,
  toGeo,
  toScreen,
  trailOrder,
  trailSegments,
  viewsClose,
  zoomAt,
  type TrailNode,
} from "../mapview";

const size = { width: 1000, height: 400 }; // aspect 2.5
const med = { west: -10, east: 40, south: 25, north: 45 }; // 50° × 20°, aspect 2.5

describe("screen ↔ geo", () => {
  it("round-trips", () => {
    const p = { lat: 41.9, lng: 12.5 };
    const back = toGeo(toScreen(p, med, size), med, size);
    expect(back.lat).toBeCloseTo(41.9, 9);
    expect(back.lng).toBeCloseTo(12.5, 9);
    expect(toScreen({ lat: 45, lng: -10 }, med, size)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const pt = { x: 700, y: 120 };
    const before = toGeo(pt, med, size);
    const v = zoomAt(med, pt, 2, size);
    const after = toGeo(pt, v, size);
    expect(after.lng).toBeCloseTo(before.lng, 6);
    expect(after.lat).toBeCloseTo(before.lat, 6);
    expect(v.east - v.west).toBeCloseTo(25, 6);
  });

  it("zooms out symmetrically and keeps the aspect", () => {
    const v = zoomAt(med, { x: 500, y: 200 }, 0.5, size);
    expect(v.east - v.west).toBeCloseTo(100, 6);
    expect((v.east - v.west) / (v.north - v.south)).toBeCloseTo(2.5, 6);
  });

  it("stops at city level and at the whole world", () => {
    const deep = zoomAt(med, { x: 500, y: 200 }, 10_000, size);
    expect(deep.east - deep.west).toBeCloseTo(MIN_LNG_SPAN, 6);
    const out = zoomAt(med, { x: 500, y: 200 }, 0.0001, size);
    expect(out.east - out.west).toBeCloseTo(spanLimits(2.5).max, 6);
    expect(out.west).toBeGreaterThanOrEqual(MAP_BOUNDS.west);
    expect(out.north).toBeLessThanOrEqual(MAP_BOUNDS.north);
  });

  it("limits zoom-out by the bounds' height on tall maps", () => {
    expect(spanLimits(1.5).max).toBeCloseTo((MAP_BOUNDS.north - MAP_BOUNDS.south) * 1.5);
    expect(spanLimits(3).max).toBe(360);
  });
});

describe("panBy", () => {
  it("moves the content with the pointer", () => {
    // dragging right by 100px shows what was to the west
    const v = panBy(med, 100, 0, size);
    expect(v.west).toBeCloseTo(med.west - 5, 6);
    // dragging down by 40px shows what was to the north
    const w = panBy(med, 0, 40, size);
    expect(w.north).toBeCloseTo(med.north + 2, 6);
  });

  it("clamps to the world without squashing the view", () => {
    const v = panBy(med, 100_000, 0, size);
    expect(v.west).toBe(MAP_BOUNDS.west);
    expect(v.east - v.west).toBeCloseTo(50, 6);
    const w = panBy(med, 0, 100_000, size);
    expect(w.north).toBe(MAP_BOUNDS.north);
    expect(w.north - w.south).toBeCloseTo(20, 6);
  });
});

describe("constrain", () => {
  it("fixes aspect around the center", () => {
    const v = constrain({ west: 0, east: 50, south: 0, north: 50 }, 2.5);
    expect(v.east - v.west).toBe(50);
    expect(v.north - v.south).toBe(20);
    expect((v.north + v.south) / 2).toBe(25);
  });
});

describe("lerpView", () => {
  it("hits both ends and zooms evenly in log space", () => {
    const a = { west: -180, east: 180, south: -72, north: 72 };
    const b = { west: 10, east: 12.5, south: 41, north: 42 };
    const start = lerpView(a, b, 0);
    for (const k of ["west", "east", "south", "north"] as const) expect(start[k]).toBeCloseTo(a[k], 9);
    const end = lerpView(a, b, 1);
    expect(end.west).toBeCloseTo(10, 9);
    expect(end.north).toBeCloseTo(42, 9);
    const mid = lerpView(a, b, 0.5);
    expect(mid.east - mid.west).toBeCloseTo(Math.sqrt(360 * 2.5), 6);
  });
  it("knows when two views are the same", () => {
    expect(viewsClose(med, { ...med, west: med.west + 0.1, east: med.east + 0.1 })).toBe(true);
    expect(viewsClose(med, panBy(med, 200, 0, size))).toBe(false);
  });
});

describe("easing", () => {
  it("is a proper ease-out", () => {
    expect(easeOutStrong(0)).toBe(0);
    expect(easeOutStrong(1)).toBe(1);
    expect(easeOutStrong(0.5)).toBeGreaterThan(0.85);
    let last = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = easeOutStrong(t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe("latticeLevel", () => {
  it("keeps dots between minPitch and twice that apart", () => {
    for (const span of [360, 120, 50, 12, 3, 0.6]) {
      const { pitch, step } = latticeLevel({ west: 0, east: span, south: 0, north: span / 2.5 }, size, 5);
      expect(pitch).toBeGreaterThanOrEqual(5);
      expect(pitch).toBeLessThan(10);
      expect(Math.log2(3 / step) % 1).toBeCloseTo(0, 9); // nested grids: step = 3° / 2^level
    }
  });
});

describe("clusterPins", () => {
  const pins = [
    { id: "a", x: 100, y: 100, weight: 50, year: 10 },
    { id: "b", x: 108, y: 104, weight: 5, year: 20 },
    { id: "c", x: 112, y: 96, weight: 9, year: 5 },
    { id: "d", x: 300, y: 300, weight: 1, year: 1 },
  ];

  it("groups pins within the radius under the heaviest one", () => {
    const out = clusterPins(pins, 17);
    expect(out).toHaveLength(2);
    const big = out.find((c) => c.members.length === 3)!;
    expect(big.id).toBe("cluster:a");
    expect(big.anchor).toBe("a");
    // members in chronological order
    expect(big.members).toEqual(["c", "a", "b"]);
    expect(big.x).toBeCloseTo(320 / 3);
    expect(out.find((c) => c.members.length === 1)!.id).toBe("d");
  });

  it("is independent of input order", () => {
    const shuffled = [pins[3], pins[1], pins[0], pins[2]];
    expect(clusterPins(shuffled, 17)).toEqual(clusterPins(pins, 17));
  });

  it("splits as the map zooms in, keeping the leader's id", () => {
    const zoomed = pins.map((p) => ({ ...p, x: (p.x - 100) * 3 + 100, y: (p.y - 100) * 3 + 100 }));
    const out = clusterPins(zoomed, 17);
    expect(out.map((c) => c.id).sort()).toEqual(["a", "b", "c", "d"]);
    // at 1.5×, c (12.6px → 19px) has left but b (8.9px → 13.4px) is still in
    const mid = clusterPins(
      pins.map((p) => ({ ...p, x: (p.x - 100) * 1.5 + 100, y: (p.y - 100) * 1.5 + 100 })),
      17,
    );
    expect(mid.find((c) => c.id === "cluster:a")?.members).toEqual(["a", "b"]);
    expect(mid.find((c) => c.id === "c")?.members).toEqual(["c"]);
  });

  it("sizes bubbles gently", () => {
    expect(clusterRadius(2)).toBeLessThan(clusterRadius(10));
    expect(clusterRadius(100) - clusterRadius(50)).toBeLessThan(clusterRadius(4) - clusterRadius(2) + 0.01);
  });
});

describe("area filter", () => {
  it("normalizes corners", () => {
    expect(boxFromPoints({ lat: 45, lng: 30 }, { lat: 35, lng: 10 })).toEqual({ west: 10, east: 30, south: 35, north: 45 });
  });

  it("filters points", () => {
    const box = { west: 10, east: 30, south: 35, north: 45 };
    expect(inBox({ lat: 41.9, lng: 12.5 }, box)).toBe(true);
    expect(inBox({ lat: 30, lng: 12.5 }, box)).toBe(false);
    expect(inBox({ lat: 41.9, lng: 31 }, box)).toBe(false);
  });

  it("handles boxes across the antimeridian", () => {
    const pacific = { west: 170, east: -170, south: -30, north: 10 };
    expect(inBox({ lat: -18, lng: 178.4 }, pacific)).toBe(true); // Fiji
    expect(inBox({ lat: -14, lng: -172 }, pacific)).toBe(true); // Samoa
    expect(inBox({ lat: 0, lng: 0 }, pacific)).toBe(false);
    // the same box written with an unwrapped east edge
    expect(inBox({ lat: -14, lng: -172 }, { west: 170, east: 190, south: -30, north: 10 })).toBe(true);
    expect(inBox({ lat: 0, lng: 100 }, { west: -180, east: 180, south: -90, north: 90 })).toBe(true);
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-180)).toBe(-180);
  });
});

describe("journey trail", () => {
  const node = (id: string, year: number, lat: number, lng: number, x: number, y: number): TrailNode => ({ id, year, lat, lng, x, y });

  it("orders events by year, then importance", () => {
    const out = trailOrder([
      { id: "z", year: 69, weight: 1 },
      { id: "y", year: 9, weight: 1 },
      { id: "x", year: 69, weight: 40 },
    ]);
    expect(out.map((e) => e.id)).toEqual(["y", "x", "z"]);
  });

  const nodes = [
    node("a", 0, 41.9, 12.5, 100, 100),
    node("b", 100, 41.9, 12.5, 100, 100), // same place as a: skipped
    node("c", 200, 31.2, 29.9, 300, 200),
    node("d", 300, 36.2, 36.2, 400, 160),
    node("e", 400, 41, 29, 280, 110),
  ];

  it("stops at the cursor and skips same-place hops", () => {
    expect(trailSegments(nodes, 150, 400)).toEqual([]);
    const segs = trailSegments(nodes, 300, 400);
    // b shares a's place, so the first hop leaves from a
    expect(segs.map((s) => s.id)).toEqual(["a>c", "c>d"]);
    expect(trailSegments(nodes, null, 400).map((s) => s.id)).toEqual(["a>c", "c>d", "d>e"]);
  });

  it("fades older segments and keeps the newest at full strength", () => {
    const segs = trailSegments(nodes, 400, 400, { fadeShare: 0.5, minOpacity: 0.1 });
    expect(segs[segs.length - 1].opacity).toBe(1);
    for (let i = 1; i < segs.length; i++) expect(segs[i].opacity).toBeGreaterThanOrEqual(segs[i - 1].opacity);
    expect(segs[0].opacity).toBeCloseTo(0.1); // 200 years old, fades over 200
  });

  it("keeps segment ids stable across zoom", () => {
    const zoomed = nodes.map((n) => ({ ...n, x: n.x * 3, y: n.y * 3 }));
    expect(trailSegments(zoomed, 400, 400).map((s) => s.id)).toEqual(trailSegments(nodes, 400, 400).map((s) => s.id));
  });

  it("arcs upward like a flight path, both directions", () => {
    const east = arcControl({ x: 0, y: 100 }, { x: 100, y: 100 });
    expect(east.y).toBeLessThan(100);
    const west = arcControl({ x: 100, y: 100 }, { x: 0, y: 100 });
    expect(west.y).toBeLessThan(100);
    expect(east.x).toBeCloseTo(50);
  });
});
