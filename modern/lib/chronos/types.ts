/* ─────────────────────────────────────────────────────────
 * CHRONOS — data model.
 * Ported from aviju888/chronos types.ts, reshaped around
 * provenance: every event remembers which sources produced
 * it (`sources`) and which raw records were folded into it
 * (`mergedFrom`). Years never include 0; BCE is negative.
 * ───────────────────────────────────────────────────────── */

export type SourceId = "llm" | "wikidata" | "wikipedia";
export const SOURCE_ORDER: SourceId[] = ["llm", "wikidata", "wikipedia"];

/** 3 agreeing sources = high, 2 = medium, 1 = low, model-only = inferred */
export type Confidence = "high" | "medium" | "low" | "inferred";

export type Category =
  | "Politics"
  | "War"
  | "Culture"
  | "Economy"
  | "Religion"
  | "Science"
  | "Disaster"
  | "Other";

export type QueryType = "city" | "region" | "country" | "topic" | "era";
export type Mode = "quick" | "deep";
export type YearRange = { start: number; end: number };

export type Thumb = { url: string; width: number; height: number };

export type GeoPoint = {
  lat: number;
  lng: number;
  name?: string;
  /** borrowed from the event's place, not the event itself */
  approx?: boolean;
};

export type Citation = {
  source: SourceId;
  label: string;
  url?: string;
  /** what this source says, e.g. "point in time 31 BCE" or a quoted sentence */
  detail?: string;
};

export type Fact = { label: string; value: string; source: SourceId };

/** One raw claim from one source, before dedup. */
export type SourceRecord = {
  /** "wd:Q160387" | "wp:Battle of Actium" | "llm:3" */
  id: string;
  source: SourceId;
  title: string;
  year: number;
  endYear?: number;
  /** the year is only known to decade/century precision */
  approxYear?: boolean;
  exactDate?: string;
  summary: string;
  category?: Category;
  /** Wikidata class labels ("battle", "ecumenical council") used for categorizing */
  types?: string[];
  location?: GeoPoint;
  qid?: string;
  wikipediaTitle?: string;
  thumbnail?: Thumb;
  citation: Citation;
  facts?: Fact[];
  /** importance hint, e.g. Wikidata sitelink count */
  weight?: number;
  /** the title was synthesized from a sentence, not taken from an article */
  synthTitle?: boolean;
};

export type ChronosEvent = {
  id: string;
  title: string;
  year: number;
  endYear?: number;
  approxYear?: boolean;
  exactDate?: string;
  category: Category;
  summary: string;
  location?: GeoPoint;
  sources: SourceId[];
  mergedFrom: string[];
  confidence: Confidence;
  citations: Citation[];
  facts: Fact[];
  qid?: string;
  wikipediaTitle?: string;
  wikipediaUrl?: string;
  thumbnail?: Thumb;
  weight: number;
  /** sources that put the event in a different year than the one shown */
  yearConflicts?: { source: SourceId; year: number }[];
};

export type Era = {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  source: SourceId;
  /** row in the era band (0 = top), assigned so bands never overlap */
  lane: number;
  url?: string;
};

export type RangeOrigin = "query" | "wikipedia" | "wikidata" | "llm" | "events" | "default";

export type Intent = {
  query: string;
  topic: string;
  range: YearRange;
  rangeFrom: RangeOrigin;
  queryType: QueryType;
  mode: Mode;
  live: boolean;
  article?: {
    title: string;
    url: string;
    description?: string;
    qid?: string;
    thumbnail?: Thumb;
  };
};

export type TaskId = "llm" | "wikidata" | "wikipedia" | "dedup";
export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type TaskStep = { label: string; meta: string };

export type TaskUpdate = {
  id: TaskId;
  label: string;
  status: TaskStatus;
  count?: number;
  /** unit for the count: "events", "merges" */
  unit?: string;
  steps?: TaskStep[];
};

export type TraceLine = {
  source: TaskId | "intent";
  kind: "query" | "note";
  text: string;
};

export type MergeIncoming = { id: string; source: SourceId; title: string; year: number };

export type MergeInfo = {
  keptId: string;
  mergedIds: string[];
  sources: SourceId[];
  incoming: MergeIncoming[];
  reason: string;
  event: ChronosEvent;
};

export type Notice = { kind: "replay" | "fallback" | "partial"; text: string };

/** SSE contract for POST /api/chronos/stream */
export type ChronosFrame =
  | { event: "intent"; data: Intent }
  | { event: "task"; data: TaskUpdate }
  | { event: "trace"; data: TraceLine }
  | { event: "event"; data: { event: ChronosEvent } }
  | { event: "merge"; data: MergeInfo }
  | { event: "eras"; data: { eras: Era[] } }
  | { event: "narrative"; data: { delta: string } }
  | { event: "notice"; data: Notice }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, never> };

export type FrameName = ChronosFrame["event"];

export type Fixture = {
  query: string;
  mode: Mode;
  recordedAt: string;
  /** relative ms since the run started */
  frames: { t: number; event: FrameName; data: unknown }[];
};
