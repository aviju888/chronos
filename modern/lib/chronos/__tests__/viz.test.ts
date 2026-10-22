// @vitest-environment node
import { describe, expect, it } from "vitest";
import { densityCurve, niceStep, niceTicks, ribbonPath, xToYear, yearToX } from "../density";
import { clampView, fitView, focusPoints, matchAspect, toXY, trimOutliers, WORLD } from "../geo";
import { narrativePlain, parseNarrative } from "../cite";
import { CiteRewriter, composeNarrative } from "../narrative";

describe("densityCurve", () => {
  it("peaks where events cluster and is normalized", () => {
    const curve = densityCurve([{ year: 100 }, { year: 102 }, { year: 105 }, { year: 400 }], { start: 0, end: 500 }, 51);
    expect(Math.max(...curve)).toBe(1);
    const at = (year: number) => curve[Math.round((year / 500) * 50)];
    expect(at(100)).toBeGreaterThan(at(400));
    expect(at(250)).toBeLessThan(0.05);
  });
  it("is flat zero with no events", () => {
    expect(densityCurve([], { start: 0, end: 10 }, 5)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("ribbonPath", () => {
  it("draws a closed smooth band", () => {
    const d = ribbonPath([0, 0.5, 1, 0.5, 0], 100, 20, 10);
    expect(d.startsWith("M0,19.25")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain("C");
  });
});

describe("ticks and scales", () => {
  it("picks 1-2-5 steps", () => {
    expect(niceStep(503, 6)).toBe(100);
    expect(niceStep(160, 6)).toBe(20);
    expect(niceStep(1666, 6)).toBe(200);
  });
  it("never labels year 0", () => {
    expect(niceTicks({ start: -27, end: 476 })).toEqual([1, 100, 200, 300, 400]);
    expect(niceTicks({ start: 1776, end: 2026 })).toEqual([1800, 1850, 1900, 1950, 2000]);
  });
  it("maps years and pixels both ways", () => {
    const range = { start: -27, end: 476 };
    expect(yearToX(-27, range, 503)).toBe(0);
    expect(yearToX(476, range, 503)).toBe(503);
    expect(xToYear(27, range, 503)).toBe(1); // would be year 0
    expect(xToYear(9999, range, 503)).toBe(476);
  });
});

describe("geo", () => {
  it("matches aspect without shrinking", () => {
    const v = matchAspect({ west: 0, east: 10, south: 0, north: 10 }, 2);
    expect(v.east - v.west).toBe(20);
    expect(v.north - v.south).toBe(10);
  });
  it("fits points with a minimum span", () => {
    const v = fitView([{ lat: 37.87, lng: -122.27 }], 2);
    expect(v.east - v.west).toBeGreaterThanOrEqual(26);
    expect(v.west).toBeLessThan(-122.27);
    expect(v.east).toBeGreaterThan(-122.27);
    expect((v.east - v.west) / (v.north - v.south)).toBeCloseTo(2);
  });
  it("frames the whole world when there is nothing to show", () => {
    const v = fitView([], 2);
    expect(v.west).toBe(-180);
    expect(v.east).toBe(180);
  });
  it("clamps to the world", () => {
    const v = clampView({ west: 170, east: 200, south: 0, north: 10 });
    expect(v.east).toBe(180);
    expect(v.west).toBe(150);
  });
  it("projects", () => {
    expect(toXY({ lat: 80, lng: -180 }, WORLD, 360, 138)).toEqual([0, 0]);
  });
  it("frames a city's cluster instead of every far-off mention", () => {
    const bay = Array.from({ length: 8 }, (_, i) => ({ lat: 37.8 + i * 0.02, lng: -122.2 - i * 0.02 }));
    const far = [
      { lat: 19.4, lng: -99.1 },
      { lat: 38.9, lng: -77 },
      { lat: 16, lng: 107 },
    ];
    expect(focusPoints([...bay, ...far])).toHaveLength(8);
    // spread-out points are kept
    const spread = [{ lat: 41, lng: 12 }, { lat: 48, lng: 2 }, { lat: 31, lng: 35 }, { lat: 38, lng: 23 }, { lat: 50, lng: 8 }, { lat: 34, lng: 108 }];
    expect(focusPoints(spread).length).toBeGreaterThanOrEqual(5);
  });
  it("drops far outliers", () => {
    const pts = [...Array.from({ length: 10 }, (_, i) => ({ lat: 40 + i * 0.1, lng: 12 + i * 0.1 })), { lat: -33, lng: 151 }];
    expect(trimOutliers(pts)).toHaveLength(10);
  });
});

describe("narrative citations", () => {
  it("parses markers and holds back a partial one", () => {
    expect(parseNarrative("Rome fell.[[cite:wd:Q1]] Then")).toEqual([
      { kind: "text", text: "Rome fell." },
      { kind: "cite", id: "wd:Q1" },
      { kind: "text", text: " Then" },
    ]);
    expect(parseNarrative("Rome fell.[[cite:wd:Q")).toEqual([{ kind: "text", text: "Rome fell." }]);
    expect(narrativePlain("A.[[cite:x]] B.")).toBe("A. B.");
    // ids with spaces survive the round trip
    expect(parseNarrative(`Varus fell.${"[[cite:" + encodeURIComponent("wp:Battle of the Teutoburg Forest") + "]]"}`)[1]).toEqual({ kind: "cite", id: "wp:Battle of the Teutoburg Forest" });
  });

  it("rewrites numbered citations across chunk boundaries", () => {
    const ids = ["a", "b", "c"];
    const rw = new CiteRewriter((n) => ids[n - 1]);
    const out = rw.push("Actium decided it [") + rw.push("2]. Then [1, 3]") + rw.push(" and [9].") + rw.flush();
    expect(out).toBe("Actium decided it[[cite:b]]. Then[[cite:a]][[cite:c]] and.");
  });

  it("composes from the lead and dated sentences, citing events", () => {
    const text = composeNarrative({
      lead: "The Roman Empire was a state. It ruled the Mediterranean. It had many roads.",
      claims: [
        { year: 9, sentence: "Three legions were destroyed in AD 9.", eventId: "e1", weight: 3 },
        { year: 64, sentence: "Additionally, a fire burned Rome in 64", eventId: "e2", weight: 3 },
      ],
      events: [],
      range: { start: -27, end: 476 },
      limit: 2,
    });
    expect(text.split("\n\n")[0]).toBe("The Roman Empire was a state. It ruled the Mediterranean.");
    expect(text).toContain("Three legions were destroyed in AD 9.[[cite:e1]]");
    expect(text).toContain("A fire burned Rome in 64.[[cite:e2]]");
  });
});
