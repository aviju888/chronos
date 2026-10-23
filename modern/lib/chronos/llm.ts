/* ─────────────────────────────────────────────────────────
 * LLM — the live Groq path (seed events, eras, narrative).
 *
 * Prompts adapted from aviju888/chronos api/generate.ts.
 * Model output never goes straight to the UI: normalizers
 * coerce years, validate fields and clip to the range, and
 * every seed's Wikipedia title is handed to the Wikipedia
 * lane so real sources can confirm or contradict it.
 *
 * Only runs when GROQ_API_KEY is set (llmMode() === "live").
 * ───────────────────────────────────────────────────────── */

import { completeJSON, stream, type Msg } from "../llm.js";
import type { Category, ChronosEvent, Mode, QueryType, SourceRecord, YearRange } from "./types.js";
import { EVENT_RATIOS } from "./query.js";
import { coerceYear, validateCoordinates, validateEvent } from "./validation.js";
import { capitalize } from "./text.js";
import { inRange } from "./merge.js";
import { CiteRewriter } from "./narrative.js";
import type { EraCandidate } from "./eras.js";

const fmt = (y: number) => (y < 0 ? `${-y} BC` : `${y} AD`);

export function seedMessages(topic: string, range: YearRange, queryType: QueryType, mode: Mode): Msg[] {
  const count = mode === "deep" ? 15 : 10;
  const ratios = EVENT_RATIOS[queryType];
  const direct = Math.ceil((count * ratios.direct) / 100);
  return [
    {
      role: "system",
      content: `You are a rigorous academic historian. List historically significant events with accurate dates.
Rules:
1. Each event must have its own English Wikipedia article; give the EXACT article title.
2. AD years are positive (1776), BC years are negative (-44). There is no year 0.
3. No more than 30% War events; include culture, economy, science, religion and politics.
4. Mark isDisputed=true when historians debate the date or details.
Always respond with valid JSON.`,
    },
    {
      role: "user",
      content: `Generate ${count} events for "${topic}" (a ${queryType}) from ${fmt(range.start)} to ${fmt(range.end)}.
At least ${direct} must be directly about ${topic}. Spread them across the whole period.
Return JSON: {"events":[{"title":"string","wikipediaTitle":"string","year":number,"category":"Politics|War|Culture|Economy|Religion|Science|Disaster|Other","summary":"one sentence","location":{"lat":number,"lng":number,"name":"string"},"isDisputed":boolean}]}`,
    },
  ];
}

const CATEGORY_SET = new Set<Category>(["Politics", "War", "Culture", "Economy", "Religion", "Science", "Disaster", "Other"]);

/** Model JSON → SourceRecords (source "llm"), dropping anything invalid or out of range. */
export function normalizeSeedEvents(raw: unknown, range: YearRange, model: string): SourceRecord[] {
  const list = (raw as { events?: unknown[] })?.events;
  if (!Array.isArray(list)) return [];
  const out: SourceRecord[] = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const e = { ...(item as Record<string, unknown>) };
    const year = coerceYear(e.year);
    if (year === null) return;
    e.year = year;
    if (!validateEvent(e).valid) return;
    if (!inRange({ year }, range)) return;
    const loc = e.location as { lat?: unknown; lng?: unknown; name?: unknown } | undefined;
    const coords = loc ? validateCoordinates(loc.lat, loc.lng) : null;
    const category = CATEGORY_SET.has(e.category as Category) ? (e.category as Category) : undefined;
    const title = String(e.title).trim();
    out.push({
      id: `llm:${i}`,
      source: "llm",
      title,
      year,
      summary: capitalize(String(e.summary).trim()),
      category,
      location: coords ? { ...coords, name: typeof loc?.name === "string" ? loc.name : undefined } : undefined,
      wikipediaTitle: typeof e.wikipediaTitle === "string" && e.wikipediaTitle.trim() ? e.wikipediaTitle.trim() : undefined,
      citation: {
        source: "llm",
        label: `Model: ${model}`,
        detail: e.isDisputed ? "Seed event, marked as disputed by the model" : "Seed event proposed by the model",
      },
      facts: e.isDisputed ? [{ label: "Disputed", value: "Historians debate the date or details", source: "llm" }] : [],
    });
  });
  return out;
}

export async function llmSeedEvents(
  topic: string,
  range: YearRange,
  queryType: QueryType,
  mode: Mode,
  signal?: AbortSignal,
): Promise<{ records: SourceRecord[]; model: string }> {
  const model = mode === "deep" ? "deep" : "fast";
  const label = mode === "deep" ? "GPT OSS 120B" : "GPT OSS 20B";
  const raw = await completeJSON<unknown>({
    messages: seedMessages(topic, range, queryType, mode),
    model,
    maxTokens: mode === "deep" ? 4500 : 3500,
    signal,
  });
  return { records: normalizeSeedEvents(raw, range, label), model: label };
}

export function eraMessages(topic: string, range: YearRange): Msg[] {
  return [
    {
      role: "system",
      content: "You are a rigorous academic historian. Use only standard, textbook periodization. AD years positive, BC years negative. Always respond with valid JSON.",
    },
    {
      role: "user",
      content: `Divide the history of ${topic} from ${fmt(range.start)} to ${fmt(range.end)} into 4-8 standard historical eras.
Return JSON: {"eras":[{"title":"string","startYear":number,"endYear":number}]}`,
    },
  ];
}

export function normalizeEras(raw: unknown, range: YearRange): EraCandidate[] {
  const list = (raw as { eras?: unknown[] })?.eras;
  if (!Array.isArray(list)) return [];
  const out: EraCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    let start = coerceYear(e.startYear);
    let end = coerceYear(e.endYear);
    if (start === null || end === null || typeof e.title !== "string") continue;
    // the original fixed sign errors when an AD range came back negative
    if (range.start > 0 && start < 0 && Math.abs(start) >= 100) start = Math.abs(start);
    if (range.start > 0 && end < 0 && Math.abs(end) >= 100) end = Math.abs(end);
    if (start >= end) continue;
    out.push({ title: e.title.trim(), start, end, source: "llm", weight: 25 });
  }
  return out;
}

export async function llmEras(topic: string, range: YearRange, signal?: AbortSignal): Promise<EraCandidate[]> {
  const raw = await completeJSON<unknown>({ messages: eraMessages(topic, range), model: "fast", maxTokens: 2000, signal });
  return normalizeEras(raw, range);
}

export function narrativeMessages(topic: string, range: YearRange, events: ChronosEvent[]): Msg[] {
  const list = events.map((e, i) => `[${i + 1}] ${e.title} (${fmt(e.year)})`).join("\n");
  return [
    {
      role: "system",
      content:
        "You are a historian writing an encyclopedia-style overview. State only well-established facts, neutral tone, no drama. Plain prose, no headings, no lists.",
    },
    {
      role: "user",
      content: `Write a 3-paragraph overview of ${topic} from ${fmt(range.start)} to ${fmt(range.end)}.
Cite events from this list with their bracket number right after the sentence that mentions them, like [3]. Cite at least 6.
${list}`,
    },
  ];
}

/** Streams narrative deltas with [n] citations rewritten to [[cite:eventId]] markers. */
export async function* llmNarrative(topic: string, range: YearRange, events: ChronosEvent[], signal?: AbortSignal): AsyncGenerator<string> {
  const picked = events.slice(0, 30);
  const rewriter = new CiteRewriter((n) => picked[n - 1]?.id);
  for await (const delta of stream({ messages: narrativeMessages(topic, range, picked), model: "deep", maxTokens: 1500, signal })) {
    const out = rewriter.push(delta);
    if (out) yield out;
  }
  const rest = rewriter.flush();
  if (rest) yield rest;
}

export function normalizeRange(raw: unknown): YearRange | null {
  const r = raw as { start?: unknown; end?: unknown };
  const start = coerceYear(r?.start);
  const end = coerceYear(r?.end);
  if (start === null || end === null || start >= end) return null;
  return { start, end };
}

/** The original getSmartTimeRange: ask the model for the topic's span */
export async function llmRange(topic: string, now: number, signal?: AbortSignal): Promise<YearRange | null> {
  const raw = await completeJSON<unknown>({
    messages: [
      { role: "system", content: "You suggest historical time ranges. BC years are negative, AD positive. Always respond with valid JSON." },
      { role: "user", content: `For "${topic}", give the most significant historical time range (end no later than ${now}). Return JSON: {"start": number, "end": number}` },
    ],
    model: "fast",
    maxTokens: 150,
    signal,
  });
  return normalizeRange(raw);
}
