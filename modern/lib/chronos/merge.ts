/* ─────────────────────────────────────────────────────────
 * MERGE — real-time dedup that keeps provenance.
 *
 * Port of deduplicateEvents from the original Chronos, with
 * two changes: nothing is thrown away (every raw record is
 * kept under its canonical event, so `sources` and
 * `mergedFrom` say exactly who claimed what), and records can
 * arrive one at a time while the pipeline streams.
 *
 * Two records are the same event when, in order:
 *   1. they point at the same Wikidata item, or
 *   2. they point at the same Wikipedia article, or
 *   3. their years are within one of each other and their
 *      titles match after normalization, or they share a year
 *      and areTitlesSimilar() says so (ordinal guard included:
 *      "Battle of Zurich" ≠ "Second Battle of Zurich").
 * Records from one source never merge on title alone: if a
 * source lists two items, it means two events.
 * ───────────────────────────────────────────────────────── */

import {
  SOURCE_ORDER,
  type ChronosEvent,
  type Citation,
  type Confidence,
  type Fact,
  type SourceId,
  type SourceRecord,
  type YearRange,
} from "./types.js";
import { areTitlesSimilar, capitalize, categorizeEvent, significantWords, stripParenthetical, titleKey } from "./text.js";
import { yearsBetween } from "./time.js";

export function confidenceFor(sources: SourceId[]): Confidence {
  const unique = new Set(sources);
  if (unique.size >= 3) return "high";
  if (unique.size === 2) return "medium";
  if (unique.size === 1 && unique.has("llm")) return "inferred";
  return "low";
}

export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

const wpKey = (title: string) => title.replace(/_/g, " ").trim().toLowerCase();

export type AddResult =
  | { kind: "new"; event: ChronosEvent }
  | { kind: "merge"; event: ChronosEvent; keptId: string; incoming: SourceRecord; reason: string }
  /** the same source restated an event it already gave: folded in silently */
  | { kind: "absorb"; event: ChronosEvent; keptId: string; incoming: SourceRecord }
  | { kind: "skip"; reason: string };

function validRecord(rec: SourceRecord): boolean {
  return (
    typeof rec.title === "string" &&
    rec.title.trim().length > 0 &&
    typeof rec.year === "number" &&
    Number.isInteger(rec.year) &&
    rec.year !== 0 &&
    rec.year >= -10000 &&
    rec.year <= 2100
  );
}

/**
 * Does an event (or its span) touch the range? A span that starts before the
 * range only counts if it starts close to it: long-lived offices and institutions
 * ("Secretary of War, 1789–1947") overlap almost any range without being events in it.
 */
export function inRange(rec: { year: number; endYear?: number }, range: YearRange): boolean {
  if (rec.year >= range.start && rec.year <= range.end) return true;
  if (rec.endYear === undefined || rec.year >= range.start || rec.endYear < range.start) return false;
  const lead = Math.max(10, range.end - range.start);
  return range.start - rec.year <= lead;
}

function pick<T>(records: SourceRecord[], order: SourceId[], get: (r: SourceRecord) => T | undefined, accept?: (r: SourceRecord) => boolean): T | undefined {
  for (const source of order) {
    for (const r of records) {
      if (r.source !== source || (accept && !accept(r))) continue;
      const v = get(r);
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return undefined;
}

const spaced = (t: string) => t.replace(/_/g, " ").trim();

function titleFrom(r: SourceRecord): string {
  if (r.source === "wikipedia") return stripParenthetical(spaced(r.wikipediaTitle ?? r.title));
  if (r.source === "wikidata") return capitalize(r.title);
  return capitalize(r.title);
}

function summaryFrom(r: SourceRecord): string | undefined {
  const s = r.summary?.trim();
  if (!s) return undefined;
  const text = capitalize(s);
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** Recompute one canonical event from every record that claims it. */
export function combine(id: string, records: SourceRecord[]): ChronosEvent {
  const sources = SOURCE_ORDER.filter((s) => records.some((r) => r.source === s));

  const title =
    pick(records, ["wikipedia"], titleFrom) ??
    pick(records, ["wikidata"], titleFrom) ??
    pick(records, ["llm"], titleFrom, (r) => !r.synthTitle) ??
    titleFrom(records[0]);

  const yearRecord =
    records.find((r) => r.source === "wikidata" && !r.approxYear) ??
    records.find((r) => r.source === "wikipedia" && !r.approxYear) ??
    records.find((r) => r.source === "llm" && !r.approxYear) ??
    records[0];
  const year = yearRecord.year;
  const endYear = yearRecord.endYear ?? records.find((r) => r.endYear !== undefined && r.year === year)?.endYear;

  const conflicts = records
    .filter((r) => !r.approxYear && Math.abs(yearsBetween(r.year, year)) > 1)
    .map((r) => ({ source: r.source, year: r.year }));
  const yearConflicts = conflicts.filter((c, i) => conflicts.findIndex((d) => d.source === c.source && d.year === c.year) === i);

  const summary =
    pick(records, ["wikipedia"], summaryFrom) ??
    pick(records, ["llm"], summaryFrom) ??
    pick(records, ["wikidata"], summaryFrom) ??
    "";

  const location =
    pick(records, ["wikidata"], (r) => r.location, (r) => !r.location?.approx) ??
    pick(records, ["wikipedia"], (r) => r.location) ??
    pick(records, ["wikidata"], (r) => r.location) ??
    pick(records, ["llm"], (r) => r.location);

  const citations: Citation[] = [];
  for (const source of SOURCE_ORDER) {
    for (const r of records) {
      if (r.source !== source) continue;
      if (!citations.some((c) => c.source === r.citation.source && c.label === r.citation.label)) citations.push(r.citation);
    }
  }

  const facts: Fact[] = [];
  for (const r of records) for (const f of r.facts ?? []) if (!facts.some((g) => g.label === f.label)) facts.push(f);

  const types = Array.from(new Set(records.flatMap((r) => r.types ?? [])));
  const llmCategory = records.find((r) => r.category)?.category;
  let category = categorizeEvent(title, types, summary);
  if (category === "Other" && llmCategory) category = llmCategory;

  const wpTitle = pick(records, ["wikipedia", "wikidata", "llm"], (r) => r.wikipediaTitle);
  const wikipediaTitle = wpTitle ? spaced(wpTitle) : undefined;

  return {
    id,
    title,
    year,
    endYear: endYear !== undefined && endYear > year ? endYear : undefined,
    approxYear: yearRecord.approxYear || undefined,
    exactDate: pick(records, ["wikidata", "wikipedia", "llm"], (r) => r.exactDate, (r) => r.year === year),
    category,
    summary,
    location,
    sources,
    mergedFrom: records.map((r) => r.id),
    confidence: confidenceFor(sources),
    citations,
    facts,
    qid: pick(records, ["wikidata", "wikipedia", "llm"], (r) => r.qid),
    wikipediaTitle,
    wikipediaUrl: wikipediaTitle ? wikipediaUrl(wikipediaTitle) : undefined,
    thumbnail: pick(records, ["wikipedia", "wikidata", "llm"], (r) => r.thumbnail),
    weight: Math.max(0, ...records.map((r) => r.weight ?? 0)),
    yearConflicts: yearConflicts.length ? yearConflicts : undefined,
  };
}

function compareEvents(a: ChronosEvent, b: ChronosEvent): number {
  return a.year - b.year || b.weight - a.weight || a.title.localeCompare(b.title);
}

export class MergeEngine {
  private events = new Map<string, ChronosEvent>();
  private records = new Map<string, SourceRecord[]>();
  private byQid = new Map<string, string>();
  private byWikipedia = new Map<string, string>();
  private recordIds = new Set<string>();

  get size(): number {
    return this.events.size;
  }

  get(id: string): ChronosEvent | undefined {
    return this.events.get(id);
  }

  /** canonical event that a raw record id ended up in */
  resolve(recordId: string): ChronosEvent | undefined {
    if (this.events.has(recordId)) return this.events.get(recordId);
    for (const ev of this.events.values()) if (ev.mergedFrom.includes(recordId)) return ev;
    return undefined;
  }

  list(): ChronosEvent[] {
    return Array.from(this.events.values()).sort(compareEvents);
  }

  recordsOf(id: string): SourceRecord[] {
    return this.records.get(id) ?? [];
  }

  /** remove an event entirely (e.g. it fell outside the final range) */
  remove(id: string): void {
    const ev = this.events.get(id);
    if (!ev) return;
    this.events.delete(id);
    this.records.delete(id);
    for (const [k, v] of this.byQid) if (v === id) this.byQid.delete(k);
    for (const [k, v] of this.byWikipedia) if (v === id) this.byWikipedia.delete(k);
  }

  private findMatch(rec: SourceRecord): { event: ChronosEvent; reason: string } | null {
    if (rec.qid) {
      const id = this.byQid.get(rec.qid);
      if (id) return { event: this.events.get(id)!, reason: `same Wikidata item (${rec.qid})` };
    }
    if (rec.wikipediaTitle) {
      const id = this.byWikipedia.get(wpKey(rec.wikipediaTitle));
      if (id) return { event: this.events.get(id)!, reason: "same Wikipedia article" };
    }

    const key = titleKey(rec.title);
    let best: { event: ChronosEvent; score: number; reason: string } | null = null;
    for (const ev of this.events.values()) {
      const dy = Math.abs(yearsBetween(ev.year, rec.year));
      if (dy > 1) continue;
      // distinct identities in either source mean distinct events
      if (rec.qid && ev.qid && rec.qid !== ev.qid) continue;
      if (rec.wikipediaTitle && ev.wikipediaTitle && wpKey(rec.wikipediaTitle) !== wpKey(ev.wikipediaTitle)) continue;
      // one source listing two similar titles means two events
      if (ev.sources.includes(rec.source) && rec.source !== "llm") continue;

      const names = [ev.title, ...this.recordsOf(ev.id).map((r) => r.title)];
      for (const name of names) {
        const exact = titleKey(name) === key;
        const similar =
          !exact &&
          dy === 0 &&
          areTitlesSimilar(rec.title, name) &&
          Math.min(significantWords(rec.title), significantWords(name)) >= 2;
        const score = exact ? 3 - dy * 0.5 : similar ? 1 : 0;
        if (score > 0 && (!best || score > best.score)) {
          best = { event: ev, score, reason: exact ? "same title" : "similar title, same year" };
        }
      }
    }
    return best ? { event: best.event, reason: best.reason } : null;
  }

  private index(ev: ChronosEvent, records: SourceRecord[]) {
    for (const r of records) {
      if (r.qid) this.byQid.set(r.qid, ev.id);
      if (r.wikipediaTitle) this.byWikipedia.set(wpKey(r.wikipediaTitle), ev.id);
    }
  }

  add(rec: SourceRecord): AddResult {
    if (!validRecord(rec)) return { kind: "skip", reason: "missing title or year" };
    if (this.recordIds.has(rec.id)) return { kind: "skip", reason: "already seen" };
    this.recordIds.add(rec.id);

    const match = this.findMatch(rec);
    if (!match) {
      const event = combine(rec.id, [rec]);
      this.events.set(event.id, event);
      this.records.set(event.id, [rec]);
      this.index(event, [rec]);
      return { kind: "new", event };
    }

    const keptId = match.event.id;
    const hadSource = match.event.sources.includes(rec.source);
    const records = [...this.recordsOf(keptId), rec];
    const event = combine(keptId, records);
    this.events.set(keptId, event);
    this.records.set(keptId, records);
    this.index(event, records);
    if (hadSource) return { kind: "absorb", event, keptId, incoming: rec };
    return { kind: "merge", event, keptId, incoming: rec, reason: match.reason };
  }
}

/**
 * Batch form of the engine, the provenance-keeping port of the original
 * deduplicateEvents(): same-event records collapse into one event that
 * lists every source and record id it came from.
 */
export function deduplicateEvents(records: SourceRecord[]): ChronosEvent[] {
  if (!Array.isArray(records)) return [];
  const engine = new MergeEngine();
  for (const r of records) if (r) engine.add(r);
  return engine.list();
}
