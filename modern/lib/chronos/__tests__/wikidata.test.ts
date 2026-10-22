// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyRow, cleanDescription, crossCheckQuery, isValidQId, linkedQuery, parsePoint, parseRows, parseWikidataResults, type WikidataRow } from "../wikidata";

describe("isValidQId (ported)", () => {
  it("accepts item ids only", () => {
    expect(isValidQId("Q42")).toBe(true);
    expect(isValidQId("Q1190554")).toBe(true);
    for (const bad of ["", "P31", "42", "Q", "Qabc", "Q42abc"]) expect(isValidQId(bad)).toBe(false);
  });
});

describe("parseWikidataResults (ported cases)", () => {
  it("returns nothing for empty input", () => {
    expect(parseWikidataResults(null)).toEqual([]);
    expect(parseWikidataResults({ results: { bindings: [] } })).toEqual([]);
  });
  it("parses an AD event with coordinates", () => {
    const [e] = parseWikidataResults({
      results: {
        bindings: [
          {
            event: { value: "http://www.wikidata.org/entity/Q178561" },
            eventLabel: { value: "Battle of Hastings" },
            date: { value: "1066-10-14T00:00:00Z" },
            coord: { value: "Point(-0.4875 50.9144)" },
            wpTitle: { value: "Battle of Hastings" },
          },
        ],
      },
    });
    expect(e).toMatchObject({ title: "Battle of Hastings", year: 1066, exactDate: "October 14, 1066", coordinates: { lat: 50.9144, lng: -0.4875 } });
  });
  it("converts BC years and skips Jan 1 dates, unlabeled items and duplicates", () => {
    const out = parseWikidataResults({
      results: {
        bindings: [
          { event: { value: "x/Q12345" }, eventLabel: { value: "Assassination of Caesar" }, date: { value: "-0043-03-15T00:00:00Z" } },
          { event: { value: "x/Q99999" }, eventLabel: { value: "Some Event" }, date: { value: "1776-01-01T00:00:00Z" } },
          { event: { value: "x/Q99999" }, eventLabel: { value: "Some Event again" }, date: { value: "1776-01-01T00:00:00Z" } },
          { event: { value: "x/Q55555" }, eventLabel: { value: "Q55555" }, date: { value: "1500-01-01T00:00:00Z" } },
          { event: { value: "x/Q11111" }, eventLabel: { value: "No Date Event" } },
        ],
      },
    });
    expect(out.map((e) => [e.title, e.year, e.exactDate])).toEqual([
      ["Assassination of Caesar", -44, "March 15, 44 BC"],
      ["Some Event", 1776, undefined],
    ]);
  });
});

describe("queries", () => {
  it("filters by Wikidata years (BCE shifted by one)", () => {
    const q = linkedQuery("Q2277", { start: -27, end: 476 }, 50);
    expect(q).toContain("YEAR(?d) >= -26 && YEAR(?d) <= 476");
    expect(q).toContain("wdt:P710 wd:Q2277");
    expect(q).toContain("LIMIT 50");
  });
  it("only puts valid ids in VALUES", () => {
    expect(crossCheckQuery(["Q1", "nope", "Q22"])).toContain("VALUES ?item { wd:Q1 wd:Q22 }");
  });
});

describe("parsePoint", () => {
  it("reads WKT points as lat/lng", () => {
    expect(parsePoint("Point(12.5 41.9)")).toEqual({ lat: 41.9, lng: 12.5 });
    expect(parsePoint("Point(200 10)")).toBeUndefined();
    expect(parsePoint(undefined)).toBeUndefined();
  });
});

const row = (over: Partial<WikidataRow>): WikidataRow => ({
  qid: "Q1",
  label: "battle of somewhere",
  description: "a battle",
  date: "0451-06-21T00:00:00Z",
  precision: 11,
  dateProp: "point in time",
  sitelinks: 20,
  types: ["battle"],
  ...over,
});

describe("classifyRow", () => {
  const range = { start: -27, end: 476 };

  it("turns a dated battle into a Wikidata record", () => {
    const c = classifyRow(row({ coord: { lat: 48.9, lng: 4.4 }, place: "Catalaunian Plains", wikipediaTitle: "Battle of the Catalaunian Plains" }), range, "linked");
    expect(c.kind).toBe("event");
    if (c.kind === "event") {
      expect(c.record).toMatchObject({ id: "wd:Q1", source: "wikidata", year: 451, exactDate: "June 21, 451", qid: "Q1" });
      expect(c.record.location).toEqual({ lat: 48.9, lng: 4.4, name: "Catalaunian Plains" });
      expect(c.record.citation.url).toBe("https://www.wikidata.org/wiki/Q1");
    }
  });

  it("borrows the place's coordinates when the event has none", () => {
    const c = classifyRow(row({ placeCoord: { lat: 41.9, lng: 12.5 }, place: "Rome" }), range, "linked");
    if (c.kind !== "event") throw new Error("expected event");
    expect(c.record.location).toEqual({ lat: 41.9, lng: 12.5, name: "Rome", approx: true });
  });

  it("turns periods into era candidates", () => {
    const c = classifyRow(row({ label: "Principate", types: ["historical period"], date: "-0026-01-01T00:00:00Z", precision: 9, end: "0284-01-01T00:00:00Z", sitelinks: 52 }), range, "linked");
    expect(c).toMatchObject({ kind: "era", era: { title: "Principate", start: -27, end: 284, weight: 52 } });
  });

  it("drops noise and out-of-range items", () => {
    expect(classifyRow(row({ label: "1935 NCAA Championships", types: ["sports season"], sitelinks: 1 }), { start: 1700, end: 2026 }, "linked").kind).toBe("skip");
    expect(classifyRow(row({ date: "1066-10-14T00:00:00Z" }), range, "linked").kind).toBe("skip");
    expect(classifyRow(row({ sitelinks: 0, types: ["riot"] }), range, "linked").kind).toBe("skip");
  });

  it("marks century-precision dates as approximate", () => {
    const c = classifyRow(row({ date: "0100-01-01T00:00:00Z", precision: 7 }), range, "linked");
    if (c.kind !== "event") throw new Error("expected event");
    expect(c.record.approxYear).toBe(true);
  });

  it("needs an event-like class for cross-checked start-time items", () => {
    expect(classifyRow(row({ label: "Marcus Agrippa", types: ["human"], dateProp: "start time" }), range, "cross-check").kind).toBe("skip");
    expect(classifyRow(row({ types: ["rescript", "edict"], dateProp: "publication date", date: "0313-06-01T00:00:00Z" }), range, "cross-check").kind).toBe("event");
  });
});

describe("parseRows", () => {
  it("picks the main date by property priority", () => {
    const [r] = parseRows([
      {
        item: { value: "http://www.wikidata.org/entity/Q180764" },
        itemLabel: { value: "Edict of Milan" },
        published: { value: "0313-06-01T00:00:00Z" },
        sl: { value: "60" },
        types: { value: "rescript|edict" },
      },
    ]);
    expect(r).toMatchObject({ qid: "Q180764", dateProp: "publication date", sitelinks: 60, types: ["rescript", "edict"] });
  });
});

describe("cleanDescription", () => {
  it("drops leading years and thin descriptions", () => {
    expect(cleanDescription("243 battle between Roman and Sasanian forces")).toBe("Battle between Roman and Sasanian forces.");
    expect(cleanDescription("403")).toBe("");
    expect(cleanDescription("244 battle")).toBe("");
    expect(cleanDescription("pandemic in the Roman Empire (249–262 CE)")).toBe("Pandemic in the Roman Empire (249–262 CE).");
  });
});
