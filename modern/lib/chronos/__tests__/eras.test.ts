// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildEras, erasFromHeadings, fallbackEras, isPeriodType } from "../eras";

describe("erasFromHeadings", () => {
  it("reads dated headings from a history article", () => {
    const eras = erasFromHeadings(
      [
        { line: "Augustus (27 BC–AD 14)", level: 1 },
        { line: "Julio-Claudian Dynasty (14–68)", level: 1 },
        { line: "Tiberius (14–37)", level: 2 },
        { line: "Later Roman Empire", level: 1 },
        { line: "<i>Pax Romana</i>", level: 1 },
      ],
      "https://en.wikipedia.org/wiki/History_of_the_Roman_Empire",
      2026,
    );
    expect(eras.map((e) => [e.title, e.start, e.end])).toEqual([
      ["Augustus", -27, 14],
      ["Julio-Claudian Dynasty", 14, 68],
      ["Tiberius", 14, 37],
    ]);
    expect(eras[0].weight).toBeGreaterThan(eras[2].weight);
  });

  it("keeps headings that are only dates", () => {
    const eras = erasFromHeadings(
      [
        { line: "Late 19th century", level: 2 },
        { line: "1940s–1960s", level: 2 },
        { line: "Decline (15th century–present)", level: 2 },
      ],
      undefined,
      2026,
    );
    expect(eras.map((e) => [e.title, e.start, e.end])).toEqual([
      ["Late 19th century", 1867, 1900],
      ["1940s–1960s", 1940, 1969],
      ["Decline", 1401, 2026],
    ]);
  });
});

describe("buildEras", () => {
  const range = { start: -27, end: 476 };

  it("packs overlapping periods into lanes, most important first", () => {
    const eras = buildEras(
      [
        { title: "Principate", start: -27, end: 284, source: "wikidata", weight: 52 },
        { title: "Dominate", start: 284, end: 476, source: "wikidata", weight: 49 },
        { title: "Crisis of the Third Century", start: 235, end: 284, source: "wikidata", weight: 53 },
        { title: "Flavian dynasty", start: 69, end: 96, source: "wikipedia", weight: 30 },
      ],
      range,
    );
    const lane0 = eras.filter((e) => e.lane === 0).map((e) => e.title);
    expect(lane0).toContain("Crisis of the Third Century");
    expect(new Set(eras.map((e) => e.title))).toEqual(new Set(["Principate", "Dominate", "Crisis of the Third Century", "Flavian dynasty"]));
    for (const lane of [0, 1, 2]) {
      const items = eras.filter((e) => e.lane === lane).sort((a, b) => a.startYear - b.startYear);
      for (let i = 1; i < items.length; i++) expect(items[i].startYear).toBeGreaterThanOrEqual(items[i - 1].endYear - 6);
    }
  });

  it("clips to the range and drops slivers and whole-range eras", () => {
    const eras = buildEras(
      [
        { title: "Roman Republic", start: -509, end: -27, source: "wikidata", weight: 90 },
        { title: "Year of the Four Emperors", start: 68, end: 69, source: "wikipedia", weight: 30 },
        { title: "Roman Empire", start: -27, end: 476, source: "wikidata", weight: 200 },
        { title: "High Roman Empire", start: -50, end: 235, source: "wikidata", weight: 3 },
      ],
      range,
    );
    expect(eras.map((e) => [e.title, e.startYear, e.endYear])).toEqual([["High Roman Empire", -27, 235]]);
  });

  it("dedupes the same period from two sources", () => {
    const eras = buildEras(
      [
        { title: "Crisis of the Third Century", start: 235, end: 284, source: "wikidata", weight: 53 },
        { title: "Crisis of the third century", start: 235, end: 284, source: "wikipedia", weight: 30 },
      ],
      range,
    );
    expect(eras).toHaveLength(1);
    expect(eras[0].source).toBe("wikidata");
  });
});

describe("isPeriodType", () => {
  it("spots periods by class label", () => {
    expect(isPeriodType(["historical period"])).toBe(true);
    expect(isPeriodType(["state system"])).toBe(true);
    expect(isPeriodType(["battle"])).toBe(false);
  });
});

describe("fallbackEras", () => {
  it("uses centuries for long spans and decades for short ones", () => {
    expect(fallbackEras({ start: 1901, end: 2000 }).map((e) => e.title).slice(0, 2)).toEqual(["1900s", "1910s"]);
    const long = fallbackEras({ start: 1, end: 500 });
    expect(long[0].title).toBe("1st century");
    expect(fallbackEras({ start: 1990, end: 1995 })).toEqual([]);
  });
});
