// @vitest-environment node
import { describe, expect, it } from "vitest";
import { combine, confidenceFor, deduplicateEvents, inRange, MergeEngine } from "../merge";
import type { SourceId, SourceRecord } from "../types";

let n = 0;
function rec(source: SourceId, title: string, year: number, extra: Partial<SourceRecord> = {}): SourceRecord {
  n += 1;
  return {
    id: `${source}:${n}`,
    source,
    title,
    year,
    summary: `${title} summary`,
    citation: { source, label: `${source} ${title}` },
    ...extra,
  };
}

describe("confidenceFor", () => {
  it("counts independent sources", () => {
    expect(confidenceFor(["llm", "wikidata", "wikipedia"])).toBe("high");
    expect(confidenceFor(["wikidata", "wikipedia"])).toBe("medium");
    expect(confidenceFor(["wikidata"])).toBe("low");
    expect(confidenceFor(["wikipedia", "wikipedia"])).toBe("low");
    expect(confidenceFor(["llm"])).toBe("inferred");
  });
});

describe("deduplicateEvents (ported cases, provenance kept)", () => {
  it("handles empty input", () => {
    expect(deduplicateEvents([])).toEqual([]);
    expect(deduplicateEvents(null as unknown as SourceRecord[])).toEqual([]);
  });

  it("keeps distinct events", () => {
    expect(deduplicateEvents([rec("wikidata", "Battle of Hastings", 1066), rec("wikipedia", "Treaty of Paris", 1783)])).toHaveLength(2);
  });

  it("merges exact and near-exact duplicates across sources", () => {
    const out = deduplicateEvents([rec("llm", "Battle of Hastings", 1066), rec("wikipedia", "The Battle of Hastings", 1066)]);
    expect(out).toHaveLength(1);
    expect(out[0].sources).toEqual(["llm", "wikipedia"]);
    expect(out[0].mergedFrom).toHaveLength(2);
    expect(out[0].confidence).toBe("medium");
  });

  it("keeps same title in different years", () => {
    expect(deduplicateEvents([rec("wikidata", "Battle of Vienna", 1529), rec("wikipedia", "Battle of Vienna", 1683)])).toHaveLength(2);
  });

  it("keeps ordinal-qualified events apart", () => {
    expect(deduplicateEvents([rec("wikidata", "Battle of Zurich", 1799), rec("wikipedia", "Second Battle of Zurich", 1799)])).toHaveLength(2);
  });

  it("keeps same-year events that share a long prefix", () => {
    expect(
      deduplicateEvents([
        rec("wikidata", "Construction of the Colosseum begins", 72),
        rec("wikipedia", "Construction of the Temple of Peace", 72),
      ]),
    ).toHaveLength(2);
  });

  it("unions citations instead of picking a winner", () => {
    const out = deduplicateEvents([
      rec("wikidata", "Battle of Hastings", 1066, { citation: { source: "wikidata", label: "Q1" } }),
      rec("wikipedia", "Battle of Hastings", 1066, { citation: { source: "wikipedia", label: "Battle of Hastings" } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].citations.map((c) => c.source)).toEqual(["wikidata", "wikipedia"]);
  });

  it("skips records without a usable year or title", () => {
    const out = deduplicateEvents([
      rec("wikidata", "Valid Event", 1066),
      rec("wikidata", "", 1066),
      rec("wikidata", "Year zero", 0),
      rec("wikidata", "Fractional", 10.5),
    ]);
    expect(out.map((e) => e.title)).toEqual(["Valid Event"]);
  });

  it("stays fast on large sets", () => {
    const records = Array.from({ length: 300 }, (_, i) => rec("wikidata", `Unique Event ${i}`, 1000 + i));
    const t0 = performance.now();
    expect(deduplicateEvents(records)).toHaveLength(300);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("MergeEngine", () => {
  it("merges on shared Wikidata item even when titles differ", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikidata", "battle of the Maureaco Fields", 451, { qid: "Q1" }));
    const r = engine.add(rec("wikipedia", "Battle of the Catalaunian Plains", 451, { qid: "Q1", wikipediaTitle: "Battle of the Catalaunian Plains" }));
    expect(r.kind).toBe("merge");
    if (r.kind === "merge") {
      expect(r.reason).toMatch(/Wikidata/);
      expect(r.event.title).toBe("Battle of the Catalaunian Plains");
      expect(r.event.sources).toEqual(["wikidata", "wikipedia"]);
    }
  });

  it("merges on shared Wikipedia article", () => {
    const engine = new MergeEngine();
    engine.add(rec("llm", "Sack of Rome by Alaric", 410, { wikipediaTitle: "Sack of Rome (410)" }));
    const r = engine.add(rec("wikipedia", "Sack of Rome (410)", 410, { wikipediaTitle: "Sack_of_Rome_(410)" }));
    expect(r.kind).toBe("merge");
    if (r.kind === "merge") expect(r.event.title).toBe("Sack of Rome");
  });

  it("tolerates a one-year disagreement on exact titles and records it", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikipedia", "Battle of Actium", -31));
    const r = engine.add(rec("wikidata", "Battle of Actium", -32));
    expect(r.kind).toBe("merge");
    // Wikidata wins the year; a one-year gap is not flagged as a conflict
    expect(engine.list()[0].year).toBe(-32);
    expect(engine.list()[0].yearConflicts).toBeUndefined();
  });

  it("flags larger year conflicts between identified records", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikipedia", "Battle of Talas", 750, { qid: "Q9" }));
    engine.add(rec("wikidata", "Battle of Talas", 751, { qid: "Q9" }));
    engine.add(rec("llm", "Battle of Talas", 755, { qid: "Q9" }));
    const ev = engine.list()[0];
    expect(ev.year).toBe(751);
    expect(ev.yearConflicts).toEqual([{ source: "llm", year: 755 }]);
    expect(ev.confidence).toBe("high");
  });

  it("never merges two different items from one source on title alone", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikidata", "Siege of Nisibis", 252, { qid: "Q10" }));
    const r = engine.add(rec("wikidata", "Siege of Nisibis", 252, { qid: "Q11" }));
    expect(r.kind).toBe("new");
    expect(engine.size).toBe(2);
  });

  it("absorbs a source restating its own event", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikidata", "Battle of Actium", -31, { qid: "Q5" }));
    const r = engine.add(rec("wikidata", "Battle of Actium", -31, { qid: "Q5" }));
    expect(r.kind).toBe("absorb");
    expect(engine.list()[0].sources).toEqual(["wikidata"]);
    expect(engine.list()[0].mergedFrom).toHaveLength(2);
  });

  it("does not merge weak containment like Rome / Fall of Rome", () => {
    const engine = new MergeEngine();
    engine.add(rec("wikidata", "Rome", 476));
    expect(engine.add(rec("wikipedia", "Fall of Rome", 476)).kind).toBe("new");
  });

  it("resolves record ids to their canonical event", () => {
    const engine = new MergeEngine();
    const a = rec("wikidata", "Edict of Milan", 313, { qid: "Q7" });
    const b = rec("llm", "Edict of Milan", 313);
    engine.add(a);
    engine.add(b);
    expect(engine.resolve(b.id)?.id).toBe(a.id);
  });

  it("prefers structured coordinates over borrowed ones", () => {
    const ev = combine("x", [
      rec("wikidata", "Battle of Talas", 751, { location: { lat: 44.1, lng: 69.8, approx: true } }),
      rec("wikipedia", "Battle of Talas", 751, { location: { lat: 42.5, lng: 72.2 } }),
    ]);
    expect(ev.location).toEqual({ lat: 42.5, lng: 72.2 });
  });
});

describe("inRange", () => {
  it("accepts events that start inside or span into the range", () => {
    expect(inRange({ year: 100 }, { start: -27, end: 476 })).toBe(true);
    expect(inRange({ year: -31 }, { start: -27, end: 476 })).toBe(false);
    expect(inRange({ year: -40, endYear: -20 }, { start: -27, end: 476 })).toBe(true);
  });

  it("drops long-lived spans that only overlap the range", () => {
    // "United States Secretary of War" (1789–1947) is not an event of 1896–1898
    expect(inRange({ year: 1789, endYear: 1947 }, { start: 1896, end: 1898 })).toBe(false);
    // a war that began a few years before the range still counts
    expect(inRange({ year: 1895, endYear: 1898 }, { start: 1896, end: 1898 })).toBe(true);
  });
});
