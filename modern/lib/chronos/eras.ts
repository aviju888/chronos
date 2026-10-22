/* ─────────────────────────────────────────────────────────
 * ERAS — periodization without a model.
 *
 * Candidates come from Wikidata "historical period" items
 * (Principate, Dominate…) and from dated section headings in
 * the Wikipedia history article ("Flavian dynasty (69–96)",
 * "Islamic era (8th–13th centuries)"). Real periods overlap,
 * so instead of forcing one row they're packed into up to
 * three lanes, most important first.
 * ───────────────────────────────────────────────────────── */

import type { Era, SourceId, YearRange } from "./types.js";
import { parseTimeExprs } from "./time.js";
import { areTitlesSimilar, capitalize, titleKey } from "./text.js";

export type EraCandidate = {
  title: string;
  start: number;
  end: number;
  source: SourceId;
  /** importance: sitelinks for Wikidata, heading level for Wikipedia */
  weight: number;
  url?: string;
};

export type SectionHeading = { line: string; level: number; anchor?: string };

const PERIOD_TYPES = /\b(historical period|period|era|age|dynasty|state system|form of government|reign|epoch|time interval|historical era|archaeological culture)\b/i;

/** Is a Wikidata item (by its class labels) a period rather than an event? */
export function isPeriodType(types: string[]): boolean {
  return types.some((t) => PERIOD_TYPES.test(t));
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();

/**
 * Dated section headings → era candidates.
 * "Augustus (27 BC–AD 14)" → Augustus, [-27, 14]; "Late 19th century" → [1867, 1900].
 */
export function erasFromHeadings(headings: SectionHeading[], baseUrl: string | undefined, now: number): EraCandidate[] {
  const out: EraCandidate[] = [];
  const minLevel = Math.min(...headings.map((h) => h.level), 9);
  for (const h of headings) {
    if (h.level > minLevel + 1) continue;
    const line = stripTags(h.line);
    // "Crisis of the Third Century (235–284)": the parenthetical is the date, the rest is the name
    const paren = /\(([^()]*)\)\s*$/.exec(line);
    const parenExpr = paren ? parseTimeExprs(paren[1], { now })[0] : undefined;
    const expr = parenExpr ? { ...parenExpr, text: paren![0] } : parseTimeExprs(line, { now }).find((x) => !x.fuzzy) ?? parseTimeExprs(line, { now })[0];
    if (!expr || expr.start === expr.end) continue;
    let title = line
      .replace(expr.text, "")
      .replace(/\(\s*\)/g, "")
      .replace(/[\s:,–—-]+$/, "")
      .replace(/^[\s:,–—-]+/, "")
      .trim();
    // a heading that is only a date ("1940s–1960s", "Late 19th century") keeps its text as the name
    if (!title || /^(and|to|the|from)$/i.test(title)) title = line.replace(/[()]/g, "").trim();
    title = title.replace(/^Interlude:\s*/i, "");
    out.push({
      title: capitalize(title),
      start: expr.start,
      end: expr.end,
      source: "wikipedia",
      weight: 10 + (3 - Math.min(2, h.level - minLevel)) * 10,
      url: baseUrl && h.anchor ? `${baseUrl}#${h.anchor}` : baseUrl,
    });
  }
  return out;
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Clip, dedupe, rank and pack candidates into lanes. */
export function buildEras(
  candidates: EraCandidate[],
  range: YearRange,
  { maxLanes = 2, maxEras = 14, topic }: { maxLanes?: number; maxEras?: number; topic?: string } = {},
): Era[] {
  const topicKey = topic ? titleKey(topic) : null;
  const span = Math.max(1, range.end - range.start);
  const minSpan = Math.max(2, span * 0.015);

  const clipped = candidates
    // a period that starts before and ends after the range is context, not a division of it
    .filter((c) => !(c.start < range.start && c.end > range.end))
    .map((c) => ({ ...c, start: Math.max(c.start, range.start), end: Math.min(c.end, range.end) }))
    .filter((c) => c.end - c.start >= minSpan)
    // an era covering (nearly) the whole range divides nothing, and the topic is not its own era
    .filter((c) => (c.end - c.start) / span < 0.8 && titleKey(c.title) !== topicKey);

  // dedupe: same name, or near-identical span with a similar name
  const unique: EraCandidate[] = [];
  for (const c of clipped.sort((a, b) => b.weight - a.weight)) {
    const dupe = unique.find((u) => {
      if (titleKey(u.title) === titleKey(c.title)) return true;
      const iou = overlap(u, c) / Math.max(1, Math.max(u.end, c.end) - Math.min(u.start, c.start));
      return iou > 0.85 && areTitlesSimilar(u.title, c.title);
    });
    if (!dupe) unique.push(c);
  }

  // most important first: each lane takes an era only where it has room
  const lanes: { start: number; end: number }[][] = [];
  const placed: Era[] = [];
  const tolerance = Math.max(1, span * 0.01);
  for (const c of unique.slice(0, maxEras * 2)) {
    if (placed.length >= maxEras) break;
    let lane = lanes.findIndex((items) => items.every((it) => overlap(it, c) <= tolerance));
    if (lane === -1) {
      if (lanes.length >= maxLanes) continue;
      lanes.push([]);
      lane = lanes.length - 1;
    }
    lanes[lane].push({ start: c.start, end: c.end });
    placed.push({
      id: `${slug(c.title)}-${c.start}`,
      title: c.title,
      startYear: c.start,
      endYear: c.end,
      source: c.source,
      lane,
      url: c.url,
    });
  }

  return placed.sort((a, b) => a.lane - b.lane || a.startYear - b.startYear);
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Generic periodization when no source has one: decades, centuries or millennia, at most 16 bands. */
export function fallbackEras(range: YearRange): Era[] {
  const span = range.end - range.start;
  const step = span / 10 <= 16 ? 10 : span / 100 <= 16 ? 100 : 1000;
  if (span < step * 2) return [];
  const eras: Era[] = [];
  // align to calendar boundaries: decades start at x0, centuries at x01 (CE) / x00 (BCE)
  let start = Math.floor(range.start / step) * step + (step > 10 && range.start > 0 ? 1 : 0);
  if (start > range.start) start -= step;
  while (start <= range.end && eras.length < 16) {
    const end = start + step - 1;
    const s = Math.max(start, range.start);
    const e = Math.min(end, range.end);
    if (e - s >= step * 0.25) {
      let label: string;
      if (step === 10) label = start < 0 ? `${-end}s BCE` : `${start}s`;
      else {
        const n = start > 0 ? Math.ceil(end / step) : Math.ceil(-start / step);
        label = `${ordinalSuffix(n)} ${step === 100 ? "century" : "millennium"}${start < 0 ? " BCE" : ""}`;
      }
      eras.push({ id: `fallback-${s}`, title: label, startYear: s, endYear: e, source: "wikipedia", lane: 0 });
    }
    start = end + 1;
    if (start === 0) start = 1;
  }
  return eras;
}
