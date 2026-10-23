/* ─────────────────────────────────────────────────────────
 * QUERY — natural language in, topic + time range out.
 *
 *   "Roman Empire 27 BCE - 476 CE"     → Roman Empire, [-27, 476]
 *   "History of Berkeley, California"  → Berkeley, California (city)
 *   "the 1900s"                        → 20th century, [1900, 1999]
 *   "Fall of Rome"                     → Fall of Rome, range resolved later
 *
 * quickDetectQueryType and sanitizeString are ported from the
 * original Chronos (lib/parsing.ts, lib/validation.ts).
 * ───────────────────────────────────────────────────────── */

import type { QueryType, YearRange } from "./types.js";
import { parseTimeExprs, type TimeExpr } from "./time.js";

export type ParsedQuery = {
  raw: string;
  topic: string;
  range?: YearRange;
  /** "History of X" asked for X's history section specifically */
  historyOf: boolean;
  /** the query was only a time expression ("1960s") */
  pureTime: boolean;
  hint: QueryType | null;
};

/** Trim, strip tags and odd characters, cap length (ported). Null when nothing is left. */
export function sanitizeString(input: unknown, maxLength = 200): string | null {
  if (typeof input !== "string") return null;
  const sanitized = input
    .trim()
    .slice(0, maxLength)
    .replace(/<[^>]*?>/g, "")
    .replace(/[^\p{L}\p{N}\s\-–—.,'"()/]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > 0 ? sanitized : null;
}

const COUNTRIES = [
  "united states", "usa", "china", "india", "brazil", "russia", "japan", "germany", "france", "uk",
  "united kingdom", "italy", "spain", "mexico", "canada", "australia", "egypt", "greece", "turkey", "iran",
  "iraq", "israel", "korea", "vietnam", "thailand", "indonesia", "philippines", "nigeria", "south africa",
  "argentina", "chile", "peru", "colombia",
];
const ERA_WORDS = ["era", "age", "period", "century", "dynasty", "renaissance", "enlightenment", "medieval", "ancient", "classical", "modern"];
const TOPIC_WORDS = ["revolution", "war", "empire", "trade", "silk road", "crusades", "reformation", "industrial", "movement", "fall of"];

/** Heuristic query type; null when ambiguous (ported, with "fall of"/"movement" added) */
export function quickDetectQueryType(query: string): QueryType | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  if (/^[\p{L}\s.'-]+,\s*[\p{L}\s.'-]+$/u.test(q)) return "city";
  if (COUNTRIES.some((c) => q === c || q.startsWith(`${c} `) || q.endsWith(` ${c}`))) return "country";
  if (ERA_WORDS.some((e) => new RegExp(`\\b${e}\\b`).test(q))) return "era";
  if (TOPIC_WORDS.some((t) => q.includes(t))) return "topic";
  return null;
}

/** Event mix the live LLM prompt asks for, by query type (ported) */
export const EVENT_RATIOS: Record<QueryType, { direct: number; regional: number; contextual: number }> = {
  city: { direct: 70, regional: 20, contextual: 10 },
  region: { direct: 55, regional: 30, contextual: 15 },
  country: { direct: 50, regional: 30, contextual: 20 },
  topic: { direct: 50, regional: 30, contextual: 20 },
  era: { direct: 60, regional: 25, contextual: 15 },
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** A Wikipedia-style title for a bare time span: [1900, 1999] → "20th century" */
export function labelForSpan({ start, end }: YearRange): string {
  if (start === end) return start < 0 ? `${-start} BC` : String(start);
  if (start > 0 && start % 10 === 0 && end === start + 9) return `${start}s`;
  const len = end - start + 1;
  if (start > 0 && (start - 1) % 100 === 0 && len === 100) return `${ordinal((start - 1) / 100 + 1)} century`;
  if (start >= 1000 && start % 100 === 0 && end === start + 99) return `${ordinal(start / 100 + 1)} century`;
  if (start < 0 && end < 0 && -start % 100 === 0 && len === 100) return `${ordinal(-start / 100)} century BC`;
  return `${start < 0 ? `${-start} BC` : start}–${end < 0 ? `${-end} BC` : end}`;
}

function stripConnectors(input: string): string {
  let s = input;
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/\s*[(\[]\s*$/, "")
      .replace(/^\s*[)\]]\s*/, "")
      .replace(/[\s,;:–—-]+$/g, "")
      .replace(/^[\s,;:–—-]+/g, "")
      .replace(/\s+(?:from|in|during|between|circa|c\.|around|of|since|through|throughout|the)$/i, "")
      .replace(/^(?:from|in|during|between|circa|c\.|around|since|the)\s+/i, "")
      .trim();
    if (next === s) break;
    s = next;
  }
  return /^(?:the|a|an|from|in|during|between|of|since|circa|around)$/i.test(s) ? "" : s;
}

export function parseQuery(input: string, now = new Date().getFullYear()): ParsedQuery {
  const raw = sanitizeString(input) ?? "";
  let text = raw;
  let range: YearRange | undefined;

  const exprs = parseTimeExprs(text, { now, hundredsAsCentury: true, bareRanges: true });
  // a time expression at the end ("Roman Empire 27 BCE - 476 CE") or a span at the start ("1900s America")
  const atEnd = (x: TimeExpr) => /^[\s).,\]]*$/.test(text.slice(x.index + x.length));
  const atStart = (x: TimeExpr) => /^[\s(\[]*(?:the\s+|from\s+|in\s+)?$/i.test(text.slice(0, x.index));
  const chosen =
    [...exprs].reverse().find(atEnd) ?? exprs.find((x) => atStart(x) && (x.kind === "range" || x.text.length === text.length));
  if (chosen) {
    range = { start: chosen.start, end: Math.min(chosen.end, now) };
    text = `${text.slice(0, chosen.index)} ${text.slice(chosen.index + chosen.length)}`;
    text = text.replace(/\(\s*\)/g, " ");
  }

  let topic = stripConnectors(text.replace(/\s+/g, " "));
  let historyOf = false;
  const history = /^(?:a\s+)?(?:brief\s+)?history\s+of\s+(?:the\s+)?(.+)$/i.exec(topic);
  if (history) {
    historyOf = true;
    topic = history[1].trim();
  }
  topic = topic.replace(/^the\s+/i, "").replace(/\s+timeline$/i, "").trim();

  const pureTime = !topic && Boolean(range);
  if (pureTime && range) topic = labelForSpan(range);

  return { raw, topic, range, historyOf, pureTime, hint: pureTime ? "era" : quickDetectQueryType(topic) };
}

/** Refine the query type from a Wikipedia description / Wikidata class labels */
export function typeFromDescription(description: string): QueryType | null {
  const d = description.toLowerCase();
  if (/\b(city|town|village|municipality|borough|commune|neighbou?rhood|county seat)\b/.test(d)) return "city";
  if (/\b(country|nation|sovereign state|historical country|kingdom|republic)\b/.test(d)) return "country";
  if (/\b(region|province|state of|area|peninsula|island|continent|county)\b/.test(d)) return "region";
  if (/\b(period|era|age|dynasty|century|decade|millennium)\b/.test(d)) return "era";
  return null;
}
