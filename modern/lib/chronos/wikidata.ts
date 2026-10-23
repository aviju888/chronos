/* ─────────────────────────────────────────────────────────
 * WIKIDATA — structured facts over SPARQL.
 *
 * Ported from aviju888/chronos lib/wikidata.ts, with three
 * queries instead of one:
 *   entityQuery      the topic itself: dates, coords, classes
 *   linkedQuery      events tied to the topic (location,
 *                    country, part of, participant, significant
 *                    event…), ranked by sitelinks in a
 *                    subquery so labels are only fetched for
 *                    the survivors (≈1s instead of 20s)
 *   crossCheckQuery  dates and coords for Wikidata items behind
 *                    the articles Wikipedia linked to
 * ───────────────────────────────────────────────────────── */

import type { Fact, GeoPoint, SourceRecord, YearRange } from "./types.js";
import { getJSON } from "./http.js";
import { formatYear, fromWikidataYear, parseWikidataDate, toWikidataYear } from "./time.js";
import { capitalize } from "./text.js";
import { inRange } from "./merge.js";
import { isPeriodType, type EraCandidate } from "./eras.js";

export const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

/** A valid Wikidata item id ("Q42"), ported */
export function isValidQId(id: string): boolean {
  return /^Q\d+$/.test(id);
}

type Binding = Record<string, { value: string } | undefined>;

export async function runSparql(query: string, signal?: AbortSignal, timeoutMs = 25000): Promise<Binding[]> {
  const data = await getJSON<{ results?: { bindings?: Binding[] } }>(SPARQL_ENDPOINT, {
    lane: "sparql",
    method: "POST",
    body: `query=${encodeURIComponent(query)}`,
    accept: "application/sparql-results+json",
    signal,
    timeoutMs,
  });
  return data?.results?.bindings ?? [];
}

const LABELS = `SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . ?item rdfs:label ?itemLabel . ?item schema:description ?itemDescription . ?t rdfs:label ?typeLabel . ?placeItem rdfs:label ?placeLabel . }`;

export function entityQuery(qid: string): string {
  return `SELECT ?itemLabel ?itemDescription ?sl
  (SAMPLE(?st) AS ?startTime) (SAMPLE(?et) AS ?endTime) (SAMPLE(?inc) AS ?inception)
  (SAMPLE(?dis) AS ?dissolved) (SAMPLE(?pit) AS ?pointInTime) (SAMPLE(?coord) AS ?c)
  (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types)
WHERE {
  VALUES ?item { wd:${qid} }
  OPTIONAL { ?item wikibase:sitelinks ?sl . }
  OPTIONAL { ?item wdt:P580 ?st . }
  OPTIONAL { ?item wdt:P582 ?et . }
  OPTIONAL { ?item wdt:P571 ?inc . }
  OPTIONAL { ?item wdt:P576 ?dis . }
  OPTIONAL { ?item wdt:P585 ?pit . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P31 ?t . }
  ${LABELS}
}
GROUP BY ?itemLabel ?itemDescription ?sl`;
}

/** Events tied to the topic entity, filtered to the range and ranked by sitelinks. */
export function linkedQuery(qid: string, range: YearRange, limit: number): string {
  const from = toWikidataYear(range.start);
  const to = toWikidataYear(range.end);
  return `SELECT ?item ?itemLabel ?itemDescription ?date ?prec ?sl (MAX(?endDate) AS ?end)
  (SAMPLE(?coord) AS ?c) (SAMPLE(?pc) AS ?placeCoord) (SAMPLE(?placeLabel) AS ?place) (SAMPLE(?wpTitle) AS ?wp)
  (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types)
WHERE {
  {
    SELECT ?item (MIN(?d) AS ?date) (MAX(?p) AS ?prec) (MAX(?sitelinks) AS ?sl) WHERE {
      { ?item wdt:P276 wd:${qid} . } UNION
      { ?item wdt:P17 wd:${qid} . } UNION
      { ?item wdt:P131 wd:${qid} . } UNION
      { ?item wdt:P361 wd:${qid} . } UNION
      { ?item wdt:P710 wd:${qid} . } UNION
      { ?item wdt:P1001 wd:${qid} . } UNION
      { wd:${qid} wdt:P793 ?item . }
      { ?item p:P585/psv:P585 ?dv . } UNION { ?item p:P580/psv:P580 ?dv . }
      ?dv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      FILTER(?p >= 7)
      FILTER(YEAR(?d) >= ${from} && YEAR(?d) <= ${to})
      ?item wikibase:sitelinks ?sitelinks .
    }
    GROUP BY ?item
    ORDER BY DESC(?sl)
    LIMIT ${limit}
  }
  OPTIONAL { ?item wdt:P582 ?endDate . }
  OPTIONAL { ?item wdt:P31 ?t . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P276 ?placeItem . OPTIONAL { ?placeItem wdt:P625 ?pc . } }
  OPTIONAL { ?wpArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wpTitle . }
  ${LABELS}
}
GROUP BY ?item ?itemLabel ?itemDescription ?date ?prec ?sl
ORDER BY ?date`;
}

/** Dates and coordinates for specific items (the articles Wikipedia linked to). */
export function crossCheckQuery(qids: string[]): string {
  return `SELECT ?item ?itemLabel ?itemDescription ?sl
  (MIN(?pit) AS ?pointInTime) (MAX(?pitP) AS ?pointPrec) (MIN(?st) AS ?startTime) (MAX(?stP) AS ?startPrec)
  (MIN(?pub) AS ?published) (MIN(?inc) AS ?inception) (MAX(?et) AS ?end) (MAX(?dis) AS ?dissolved)
  (SAMPLE(?coord) AS ?c) (SAMPLE(?pc) AS ?placeCoord) (SAMPLE(?placeLabel) AS ?place) (SAMPLE(?wpTitle) AS ?wp)
  (GROUP_CONCAT(DISTINCT ?typeLabel; separator="|") AS ?types)
WHERE {
  VALUES ?item { ${qids.filter(isValidQId).map((q) => `wd:${q}`).join(" ")} }
  ?item wikibase:sitelinks ?sl .
  OPTIONAL { ?item p:P585/psv:P585 ?pv . ?pv wikibase:timeValue ?pit ; wikibase:timePrecision ?pitP . }
  OPTIONAL { ?item p:P580/psv:P580 ?sv . ?sv wikibase:timeValue ?st ; wikibase:timePrecision ?stP . }
  OPTIONAL { ?item wdt:P577 ?pub . }
  OPTIONAL { ?item wdt:P571 ?inc . }
  OPTIONAL { ?item wdt:P582 ?et . }
  OPTIONAL { ?item wdt:P576 ?dis . }
  OPTIONAL { ?item wdt:P31 ?t . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P276 ?placeItem . OPTIONAL { ?placeItem wdt:P625 ?pc . } }
  OPTIONAL { ?wpArticle schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?wpTitle . }
  ${LABELS}
}
GROUP BY ?item ?itemLabel ?itemDescription ?sl`;
}

/* ── parsing ── */

export type WikidataRow = {
  qid: string;
  label: string;
  description: string;
  /** chosen main date and the property it came from */
  date?: string;
  precision: number;
  dateProp?: "point in time" | "start time" | "publication date" | "inception";
  end?: string;
  coord?: { lat: number; lng: number };
  placeCoord?: { lat: number; lng: number };
  place?: string;
  wikipediaTitle?: string;
  sitelinks: number;
  types: string[];
};

/** "Point(12.5 41.9)" → { lat: 41.9, lng: 12.5 } */
export function parsePoint(wkt: string | undefined): { lat: number; lng: number } | undefined {
  if (!wkt) return undefined;
  const m = /Point\(([-\d.eE]+)\s+([-\d.eE]+)\)/.exec(wkt);
  if (!m) return undefined;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

const v = (b: Binding, k: string) => b[k]?.value;

export function parseRows(bindings: Binding[]): WikidataRow[] {
  const rows: WikidataRow[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    const qid = v(b, "item")?.split("/").pop() ?? "";
    if (!isValidQId(qid) || seen.has(qid)) continue;
    const label = v(b, "itemLabel") ?? "";
    if (!label || label === qid) continue; // no English label
    seen.add(qid);

    let date = v(b, "date");
    let precision = Number(v(b, "prec") ?? 9);
    let dateProp: WikidataRow["dateProp"] = date ? "point in time" : undefined;
    if (!date) {
      const pitPrec = Number(v(b, "pointPrec") ?? 9);
      const stPrec = Number(v(b, "startPrec") ?? 9);
      // "1840s" as a point in time is less useful than an exact start date
      if (v(b, "pointInTime") && pitPrec < 9 && v(b, "startTime") && stPrec >= 9) {
        date = v(b, "startTime");
        precision = stPrec;
        dateProp = "start time";
      } else if (v(b, "pointInTime")) {
        date = v(b, "pointInTime");
        precision = Number(v(b, "pointPrec") ?? 9);
        dateProp = "point in time";
      } else if (v(b, "startTime")) {
        date = v(b, "startTime");
        precision = Number(v(b, "startPrec") ?? 9);
        dateProp = "start time";
      } else if (v(b, "published")) {
        date = v(b, "published");
        precision = 9;
        dateProp = "publication date";
      } else if (v(b, "inception")) {
        date = v(b, "inception");
        precision = 9;
        dateProp = "inception";
      }
    }

    rows.push({
      qid,
      label,
      description: v(b, "itemDescription") ?? "",
      date,
      precision,
      dateProp,
      end: v(b, "end") ?? v(b, "endTime") ?? v(b, "dissolved"),
      coord: parsePoint(v(b, "c")),
      placeCoord: parsePoint(v(b, "placeCoord")),
      place: v(b, "place"),
      wikipediaTitle: v(b, "wp"),
      sitelinks: Number(v(b, "sl") ?? 0),
      types: (v(b, "types") ?? "")
        .split("|")
        .map((t) => t.trim())
        .filter((t) => t && !/^Q\d+$/.test(t)),
    });
  }
  return rows;
}

/**
 * Port of the original parseWikidataResults(): one event per item with a
 * parseable date, BCE years converted, Jan 1 treated as year-only.
 */
export function parseWikidataResults(data: unknown) {
  const bindings = (data as { results?: { bindings?: Binding[] } })?.results?.bindings ?? [];
  const out: { title: string; description: string; year: number; exactDate?: string; coordinates?: { lat: number; lng: number }; wikidataId: string; wikipediaTitle?: string }[] = [];
  const seen = new Set<string>();
  for (const b of bindings) {
    const wikidataId = v(b, "event")?.split("/").pop() ?? "";
    if (!wikidataId || seen.has(wikidataId)) continue;
    seen.add(wikidataId);
    const title = v(b, "eventLabel");
    if (!title || title === wikidataId) continue;
    const dateStr = v(b, "date");
    if (!dateStr) continue;
    const parsed = parseWikidataDate(dateStr);
    if (!parsed) continue;
    const jan1 = /-01-01T/.test(dateStr);
    out.push({
      title,
      description: v(b, "eventDescription") ?? "",
      year: parsed.year,
      exactDate: jan1 ? undefined : parsed.exactDate?.replace(" BCE", " BC"),
      coordinates: parsePoint(v(b, "coord")),
      wikidataId,
      wikipediaTitle: v(b, "wpTitle"),
    });
  }
  return out;
}

/**
 * Wikidata descriptions often lead with the year ("243 battle between Roman and
 * Sasanian forces") or are nothing but a date ("403"). Drop the leading year and
 * anything too thin to be a summary.
 */
export function cleanDescription(description: string): string {
  const d = description
    .trim()
    .replace(/^(?:c\.\s*)?\d{1,4}(?:\s*[–-]\s*\d{1,4})?(?:\s*(?:BCE?|CE|AD))?\s+/i, "")
    .trim();
  if (d.split(/\s+/).filter(Boolean).length < 2 || /^[\d\s–\-()]+$/.test(d)) return "";
  const text = capitalize(d);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/* ── classification ── */

const NOISE_TYPES =
  /\b(academic conference|conference|workshop|symposium|sports season|season|championships?|basketball game|football game|association football match|match|competition|convention|recurring event edition|award ceremony|concert|television|episode|film|album|single|song|video game|literary work|scholarly article|hotel|restaurant|building|structure|archaeological site|province|country|city|human settlement|human|family|organization|company|school|meeting|edition)\b/i;
const EVENT_TYPES =
  /\b(battle|war|siege|treaty|council|revolt|rebellion|uprising|massacre|earthquake|eruption|fire|firestorm|flood|famine|plague|pandemic|epidemic|riot|pogrom|protest|movement|campaign|expedition|invasion|conquest|coronation|assassination|election|crisis|disaster|accident|edict|law|decree|declaration|event|occurrence|conflict|sack|looting|persecution|migration|reform|incident|attack|strike|murder|trial|games|tournament|festival|ceremony|collapse|kidnapping|shooting|bombing|explosion|raid|ambush|rescript)\b/i;

const STATE_TYPES = /\b(historical country|country|sovereign state|empire|kingdom|city|human settlement|capital|province|state|polity)\b/i;

export type Classified =
  | { kind: "event"; record: SourceRecord }
  | { kind: "era"; era: EraCandidate }
  | { kind: "skip"; reason: string };

function point(c: { lat: number; lng: number } | undefined, name: string | undefined, approx = false): GeoPoint | undefined {
  return c ? { lat: c.lat, lng: c.lng, name, approx: approx || undefined } : undefined;
}

export function classifyRow(row: WikidataRow, range: YearRange, origin: "linked" | "cross-check"): Classified {
  if (!row.date) return { kind: "skip", reason: "no date" };
  const start = parseWikidataDate(row.date, row.precision);
  if (!start) return { kind: "skip", reason: "unreadable date" };
  const end = row.end ? parseWikidataDate(row.end, 9) : null;
  const span = end ? end.year - start.year : 0;
  const types = row.types;
  const typeText = types.join(" | ");
  const eventish = EVENT_TYPES.test(typeText) || EVENT_TYPES.test(row.label);
  const rangeSpan = Math.max(1, range.end - range.start);

  // named periods become era candidates; states, cities and other long-lived things are skipped
  const namedPeriod = /\b(historical period|period|era|age|dynasty|epoch)\b/i.test(typeText);
  if (end && (namedPeriod || (isPeriodType(types) && !STATE_TYPES.test(typeText)))) {
    if (span < 2) return { kind: "skip", reason: "period too short" };
    return {
      kind: "era",
      era: {
        title: capitalize(row.label),
        start: start.year,
        end: end.year,
        source: "wikidata",
        weight: row.sitelinks,
        url: `https://www.wikidata.org/wiki/${row.qid}`,
      },
    };
  }
  if (isPeriodType(types) && !end) return { kind: "skip", reason: "open-ended period" };
  if (!eventish && end && span > Math.max(40, rangeSpan * 0.15)) return { kind: "skip", reason: "long-lived, not an event" };
  if (STATE_TYPES.test(typeText) && !eventish) return { kind: "skip", reason: "a place or state" };
  if (row.dateProp === "inception" && !eventish) return { kind: "skip", reason: "inception of a non-event" };
  if (!eventish && NOISE_TYPES.test(typeText) && row.sitelinks < 8) return { kind: "skip", reason: `noise (${types[0]})` };
  if (origin === "linked" && row.sitelinks === 0 && !row.wikipediaTitle) return { kind: "skip", reason: "no coverage" };
  if (origin === "cross-check" && !eventish && row.dateProp !== "point in time") return { kind: "skip", reason: "not an event" };
  if (/^(person|people|member|group|style|genre|term|concept|ideology|subculture)\b/i.test(row.description)) return { kind: "skip", reason: "not an event" };

  const endYear = end && end.year > start.year && span <= 400 ? end.year : undefined;
  if (!inRange({ year: start.year, endYear }, range)) return { kind: "skip", reason: "outside range" };

  const dateLabel =
    start.exactDate ??
    (row.precision === 8 ? `${formatYear(start.year)}s` : row.precision === 7 ? `c. ${formatYear(start.year)}` : formatYear(start.year));
  const facts: Fact[] = [
    { label: "Wikidata item", value: row.qid, source: "wikidata" },
    { label: row.dateProp === "start time" ? "Start" : row.dateProp === "publication date" ? "Published" : "Date", value: dateLabel, source: "wikidata" },
  ];
  if (endYear !== undefined && end) facts.push({ label: "End", value: end.exactDate ?? formatYear(end.year), source: "wikidata" });
  if (types.length) facts.push({ label: "Instance of", value: types.slice(0, 3).join(", "), source: "wikidata" });
  if (row.place) facts.push({ label: "Location", value: row.place, source: "wikidata" });
  if (row.sitelinks) facts.push({ label: "Wikipedia editions", value: String(row.sitelinks), source: "wikidata" });

  return {
    kind: "event",
    record: {
      id: `wd:${row.qid}`,
      source: "wikidata",
      title: row.label,
      year: start.year,
      endYear,
      approxYear: start.approx || undefined,
      exactDate: start.exactDate,
      summary: cleanDescription(row.description),
      types,
      location: point(row.coord, row.place) ?? point(row.placeCoord, row.place, true),
      qid: row.qid,
      wikipediaTitle: row.wikipediaTitle,
      citation: {
        source: "wikidata",
        label: `Wikidata ${row.qid}`,
        url: `https://www.wikidata.org/wiki/${row.qid}`,
        detail: `${row.dateProp ?? "date"}: ${dateLabel}`,
      },
      facts,
      weight: row.sitelinks,
    },
  };
}

/* ── entity ── */

export type EntityInfo = {
  qid: string;
  label: string;
  description: string;
  sitelinks: number;
  types: string[];
  start?: number;
  end?: number;
  inception?: number;
  dissolved?: number;
  pointInTime?: number;
  coord?: { lat: number; lng: number };
};

export async function fetchEntity(qid: string, signal?: AbortSignal): Promise<EntityInfo | null> {
  if (!isValidQId(qid)) return null;
  const [b] = await runSparql(entityQuery(qid), signal, 15000);
  if (!b) return null;
  const year = (k: string) => {
    const raw = v(b, k);
    if (!raw) return undefined;
    const m = /^(-?\+?\d+)-/.exec(raw);
    return m ? fromWikidataYear(parseInt(m[1].replace("+", ""), 10)) : undefined;
  };
  return {
    qid,
    label: v(b, "itemLabel") ?? qid,
    description: v(b, "itemDescription") ?? "",
    sitelinks: Number(v(b, "sl") ?? 0),
    types: (v(b, "types") ?? "").split("|").filter(Boolean),
    start: year("startTime"),
    end: year("endTime"),
    inception: year("inception"),
    dissolved: year("dissolved"),
    pointInTime: year("pointInTime"),
    coord: parsePoint(v(b, "c")),
  };
}

export async function fetchLinked(qid: string, range: YearRange, limit: number, signal?: AbortSignal): Promise<{ query: string; rows: WikidataRow[] }> {
  const query = linkedQuery(qid, range, limit);
  return { query, rows: parseRows(await runSparql(query, signal)) };
}

export async function fetchCrossCheck(qids: string[], signal?: AbortSignal): Promise<{ query: string; rows: WikidataRow[] }> {
  const query = crossCheckQuery(qids);
  return { query, rows: parseRows(await runSparql(query, signal)) };
}
