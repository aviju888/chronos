/* ─────────────────────────────────────────────────────────
 * WIKIPEDIA — articles, history sections, linked events.
 *
 * Ported from aviju888/chronos (searchWikipedia,
 * fetchWikipediaArticle, discoverSubEvents), reworked to be
 * gentler on the API: linked articles are looked up 20 at a
 * time through the Action API instead of one request each,
 * and every title is cached once resolved.
 *
 * mineHtml() reads a section the way a person would: prose
 * paragraphs in order, with the position of every link, so
 * a sentence like "…defeated at Actium in 31 BC" can be tied
 * to the Battle of Actium article.
 * ───────────────────────────────────────────────────────── */

import * as cheerio from "cheerio";
import type { SourceRecord, Thumb, YearRange } from "./types.js";
import { getJSON, mapLimit } from "./http.js";
import { inRange, wikipediaUrl } from "./merge.js";
import { parseTimeExprs, type TimeExpr } from "./time.js";
import { capitalize, cleanExtract, extractEventYear, isEventLike, leadSentences, splitSentences, stripParenthetical, tidyProse } from "./text.js";

export const WIKI_API = "https://en.wikipedia.org/w/api.php";
export const WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";

export type PageInfo = {
  title: string;
  qid?: string;
  description?: string;
  extract?: string;
  thumbnail?: Thumb;
  coordinates?: { lat: number; lng: number };
};

export type Summary = PageInfo & { url: string; lead: string };

export type Section = { index: number; line: string; level: number; anchor: string };

export type Link = { title: string; start: number; end: number; text: string };
export type Paragraph = { text: string; links: Link[]; heading: string; anchor: string };

const api = (params: Record<string, string>) =>
  `${WIKI_API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params }).toString()}`;

/* ── lookups ── */

type QueryPage = {
  title: string;
  missing?: boolean;
  invalid?: boolean;
  pageprops?: { wikibase_item?: string };
  description?: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  coordinates?: { lat: number; lon: number }[];
};
type QueryResponse = {
  query?: {
    pages?: QueryPage[];
    redirects?: { from: string; to: string; tofragment?: string }[];
    normalized?: { from: string; to: string }[];
    search?: { title: string }[];
  };
};

/**
 * Exact title first (following redirects, keeping "#History" fragments),
 * then full-text search. "Fall of Rome" → Fall of the Western Roman Empire.
 */
export async function resolveTitle(
  topic: string,
  signal?: AbortSignal,
  { exactOnly = false }: { exactOnly?: boolean } = {},
): Promise<{ title: string; fragment?: string; qid?: string; description?: string } | null> {
  const lookup = async (title: string) => {
    const data = await getJSON<QueryResponse>(
      api({ action: "query", titles: title, redirects: "1", prop: "pageprops|description", ppprop: "wikibase_item" }),
      { lane: "wikipedia", signal },
    );
    const page = data.query?.pages?.[0];
    if (!page || page.missing || page.invalid) return null;
    const redirect = data.query?.redirects?.find((r) => r.to === page.title);
    return { title: page.title, fragment: redirect?.tofragment, qid: page.pageprops?.wikibase_item, description: page.description };
  };

  const exact = (await lookup(topic)) ?? (topic === capitalize(topic) ? null : await lookup(capitalize(topic)));
  // a disambiguation page is not a topic
  if (exact && !/disambiguation|may refer to/i.test(exact.description ?? "")) return exact;
  if (exactOnly) return null;

  const search = await getJSON<QueryResponse>(api({ action: "query", list: "search", srsearch: topic, srlimit: "3", srprop: "" }), {
    lane: "wikipedia",
    signal,
  });
  const first = search.query?.search?.[0]?.title;
  return first ? lookup(first) : null;
}

/** REST summary: lead extract, thumbnail, coordinates, Wikidata id */
export async function fetchSummary(title: string, signal?: AbortSignal): Promise<Summary | null> {
  type Rest = {
    title: string;
    extract?: string;
    description?: string;
    wikibase_item?: string;
    thumbnail?: { source: string; width: number; height: number };
    coordinates?: { lat: number; lon: number };
    content_urls?: { desktop?: { page?: string } };
  };
  const data = await getJSON<Rest>(`${WIKI_REST}${encodeURIComponent(title.replace(/ /g, "_"))}`, { lane: "wikipedia", signal });
  if (!data?.title) return null;
  return {
    title: data.title,
    url: data.content_urls?.desktop?.page ?? wikipediaUrl(data.title),
    qid: data.wikibase_item,
    description: data.description,
    extract: data.extract,
    lead: cleanExtract(data.extract ?? ""),
    thumbnail: data.thumbnail ? { url: data.thumbnail.source, width: data.thumbnail.width, height: data.thumbnail.height } : undefined,
    coordinates: data.coordinates ? { lat: data.coordinates.lat, lng: data.coordinates.lon } : undefined,
  };
}

export async function fetchSections(title: string, signal?: AbortSignal): Promise<Section[]> {
  type Resp = { parse?: { sections?: { index: string; line: string; toclevel: number; anchor: string }[] }; error?: unknown };
  const data = await getJSON<Resp>(api({ action: "parse", page: title, prop: "sections", redirects: "1" }), { lane: "wikipedia", signal });
  return (data.parse?.sections ?? [])
    .filter((s) => /^\d+$/.test(s.index))
    .map((s) => ({ index: Number(s.index), line: s.line, level: s.toclevel, anchor: s.anchor }));
}

export async function fetchHtml(title: string, section: number | null, signal?: AbortSignal): Promise<string> {
  type Resp = { parse?: { text?: string } };
  const params: Record<string, string> = {
    action: "parse",
    page: title,
    prop: "text",
    redirects: "1",
    disableeditsection: "1",
    disablelimitreport: "1",
    disabletoc: "1",
  };
  if (section !== null) params.section = String(section);
  const data = await getJSON<Resp>(api(params), { lane: "wikipedia", signal, timeoutMs: 15000 });
  return data.parse?.text ?? "";
}

/** The "History" section and its subsections; `fragment` names a section to prefer */
export function historySections(sections: Section[], fragment?: string): Section[] {
  const want = (fragment ?? "History").replace(/_/g, " ").toLowerCase();
  const startIdx = sections.findIndex((s) => s.line.replace(/<[^>]+>/g, "").toLowerCase() === want || s.anchor.toLowerCase() === want.replace(/ /g, "_"));
  const idx = startIdx >= 0 ? startIdx : sections.findIndex((s) => /history/i.test(s.line));
  if (idx < 0) return [];
  const root = sections[idx];
  const out = [root];
  for (let i = idx + 1; i < sections.length && sections[i].level > root.level; i++) out.push(sections[i]);
  return out;
}

type InfoStore = {
  basics: Map<string, PageInfo | null>;
  details: Map<string, PageInfo | null>;
  aliases: Map<string, string>;
};
const g = globalThis as unknown as { __chronosPages?: InfoStore };
const info: InfoStore = (g.__chronosPages ??= { basics: new Map(), details: new Map(), aliases: new Map() });

const key = (t: string) => t.replace(/_/g, " ").trim();

/** keep the per-title caches from growing without bound over a long dev session */
function bound<K, V>(m: Map<K, V>, max = 8000) {
  if (m.size > max) m.clear();
}

/** canonical title for a link target, once pageBasics() has seen it */
export function canonicalTitle(title: string): string {
  return info.aliases.get(key(title)) ?? key(title);
}

function followFrom(q: NonNullable<QueryResponse["query"]>) {
  return (t: string) => {
    let cur = t;
    for (const n of q.normalized ?? []) if (n.from === cur) cur = n.to;
    for (const r of q.redirects ?? []) if (r.from === cur) cur = r.to;
    return cur;
  };
}

/**
 * Cheap lookup for many titles: canonical title (redirects followed),
 * Wikidata id and short description. 50 titles per request.
 */
export async function pageBasics(titles: string[], signal?: AbortSignal): Promise<Map<string, PageInfo | null>> {
  bound(info.aliases);
  bound(info.basics);
  const wanted = Array.from(new Set(titles.map(key)));
  const missing = wanted.filter((t) => !info.aliases.has(t));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50));
  await mapLimit(batches, 3, async (batch) => {
    const data = await getJSON<QueryResponse>(
      api({ action: "query", titles: batch.join("|"), redirects: "1", prop: "pageprops|description", ppprop: "wikibase_item" }),
      { lane: "wikipedia", signal },
    );
    const q = data.query ?? {};
    const follow = followFrom(q);
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      const final = follow(t);
      const page = byTitle.get(final);
      info.aliases.set(t, final);
      if (!page || page.missing || page.invalid) {
        info.basics.set(final, null);
        continue;
      }
      info.basics.set(final, { title: page.title, qid: page.pageprops?.wikibase_item, description: page.description });
    }
  });
  const out = new Map<string, PageInfo | null>();
  for (const t of titles) out.set(t, info.basics.get(canonicalTitle(t)) ?? null);
  return out;
}

/** Extract, thumbnail and coordinates for canonical titles. 20 per request (the extracts limit). */
export async function pageDetails(titles: string[], signal?: AbortSignal): Promise<Map<string, PageInfo | null>> {
  bound(info.details);
  const wanted = Array.from(new Set(titles.map((t) => canonicalTitle(t))));
  const missing = wanted.filter((t) => !info.details.has(t));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += 20) batches.push(missing.slice(i, i + 20));
  await mapLimit(batches, 3, async (batch) => {
    const data = await getJSON<QueryResponse>(
      api({
        action: "query",
        titles: batch.join("|"),
        redirects: "1",
        prop: "pageprops|description|extracts|pageimages|coordinates",
        ppprop: "wikibase_item",
        exintro: "1",
        explaintext: "1",
        exsentences: "3",
        exlimit: "20",
        piprop: "thumbnail",
        pithumbsize: "320",
        pilimit: "20",
        colimit: "50",
      }),
      { lane: "wikipedia", signal, timeoutMs: 15000 },
    );
    const q = data.query ?? {};
    const follow = followFrom(q);
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      const final = follow(t);
      const page = byTitle.get(final);
      if (final !== t) info.aliases.set(t, final);
      if (!page || page.missing || page.invalid) {
        info.details.set(t, null);
        continue;
      }
      const full: PageInfo = {
        title: page.title,
        qid: page.pageprops?.wikibase_item,
        description: page.description,
        extract: page.extract,
        thumbnail: page.thumbnail ? { url: page.thumbnail.source, width: page.thumbnail.width, height: page.thumbnail.height } : undefined,
        coordinates: page.coordinates?.[0] ? { lat: page.coordinates[0].lat, lng: page.coordinates[0].lon } : undefined,
      };
      info.details.set(t, full);
      info.details.set(final, full);
    }
  });
  const out = new Map<string, PageInfo | null>();
  for (const t of titles) out.set(t, info.details.get(canonicalTitle(t)) ?? null);
  return out;
}

const coordStore = ((globalThis as unknown as { __chronosCoords?: Map<string, { lat: number; lng: number; description?: string } | null> }).__chronosCoords ??= new Map());

/** Coordinates (and description) for many titles, 50 per request. Places have them; people and ideas don't. */
export async function pageCoords(
  titles: string[],
  signal?: AbortSignal,
): Promise<Map<string, { lat: number; lng: number; description?: string } | null>> {
  bound(coordStore);
  const wanted = Array.from(new Set(titles.map((t) => canonicalTitle(t))));
  const missing = wanted.filter((t) => !coordStore.has(t));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50));
  await mapLimit(batches, 3, async (batch) => {
    const data = await getJSON<QueryResponse>(
      api({ action: "query", titles: batch.join("|"), redirects: "1", prop: "coordinates|description", colimit: "max" }),
      { lane: "wikipedia", signal },
    );
    const q = data.query ?? {};
    const follow = followFrom(q);
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const t of batch) {
      const page = byTitle.get(follow(t));
      const c = page?.coordinates?.[0];
      coordStore.set(t, c ? { lat: c.lat, lng: c.lon, description: page?.description } : null);
    }
  });
  const out = new Map<string, { lat: number; lng: number; description?: string } | null>();
  for (const t of titles) out.set(t, coordStore.get(canonicalTitle(t)) ?? null);
  return out;
}

/* ── reading HTML ── */

const SKIP_NS = /^(File|Image|Help|Category|Template|Template talk|Wikipedia|Special|Portal|Talk|Module|MediaWiki|User|Draft|Wiktionary|wikt):/i;

export function mineHtml(html: string): { paragraphs: Paragraph[]; links: string[] } {
  if (!html) return { paragraphs: [], links: [] };
  const $ = cheerio.load(html);
  $(
    "style, script, sup.reference, sup.noprint, .mw-ref, .reference, .mw-editsection, table, .navbox, .hatnote, .thumb, figure, .reflist, .noprint, .shortdescription, .mw-empty-elt, math, .infobox, .sidebar, .metadata, .gallery, .mw-references-wrap",
  ).remove();

  const paragraphs: Paragraph[] = [];
  let heading = "";
  let anchor = "";

  type Node = { type: string; data?: string; name?: string; children?: Node[]; attribs?: Record<string, string> };

  const flatten = (root: Node): { text: string; links: Link[] } => {
    let text = "";
    const links: Link[] = [];
    const walk = (node: Node) => {
      if (node.type === "text") {
        const chunk = (node.data ?? "").replace(/\s+/g, " ");
        text += text.endsWith(" ") ? chunk.replace(/^ /, "") : chunk;
        return;
      }
      if (node.type !== "tag") return;
      if (node.name === "br") {
        if (!text.endsWith(" ")) text += " ";
        return;
      }
      if (node.name === "a") {
        const title = node.attribs?.title;
        const href = node.attribs?.href ?? "";
        const cls = node.attribs?.class ?? "";
        const start = text.length;
        for (const c of node.children ?? []) walk(c);
        const end = text.length;
        if (title && href.startsWith("/wiki/") && !SKIP_NS.test(title) && !/\bnew\b/.test(cls) && end > start) {
          links.push({ title, start, end, text: text.slice(start, end) });
        }
        return;
      }
      for (const c of node.children ?? []) walk(c);
    };
    walk(root);
    const lead = text.length - text.trimStart().length;
    return {
      text: text.trim(),
      links: links.map((l) => ({ ...l, start: l.start - lead, end: l.end - lead })),
    };
  };

  $("p, li, .mw-heading, h2, h3, h4").each((_, el) => {
    const node = el as unknown as Node;
    const $el = $(el);
    if ($el.is(".mw-heading") || /^h[2-4]$/.test(node.name ?? "")) {
      if ($el.is("h2, h3, h4") && $el.parent().is(".mw-heading")) return;
      heading = $el.text().trim();
      anchor = $el.find("h2, h3, h4").attr("id") ?? $el.attr("id") ?? anchor;
      return;
    }
    // skip list items nested in other list items, and anything left inside removed chrome
    if (node.name === "li" && $el.parents("li").length > 0) return;
    const { text, links } = flatten(node);
    if (text.length < 40) return;
    paragraphs.push({ text, links, heading, anchor });
  });

  const seen = new Set<string>();
  const links: string[] = [];
  for (const p of paragraphs) {
    for (const l of p.links) {
      const k = key(l.title);
      if (!seen.has(k)) {
        seen.add(k);
        links.push(k);
      }
    }
  }
  return { paragraphs, links };
}

/* ── the scripted model: dated sentences in the history prose ── */

export type Claim = {
  year: number;
  endYear?: number;
  approx: boolean;
  title: string;
  /** synthesized from the sentence, used if the linked article turns out not to be an event */
  altTitle?: string;
  synthTitle: boolean;
  wikipediaTitle?: string;
  sentence: string;
  /** every article linked in the sentence, in order (used to place it on the map) */
  linkTitles: string[];
  heading: string;
  anchor: string;
  weight: number;
};

const REPORTING = /\b(suggests?|says?|said|writes?|wrote|notes?|noted|argues?|argued|claims?|claimed|states?|stated|describes?|described|records?|recorded|reports?|reported|believes?|believed|estimates?|estimated|according)$/i;
const LIFESPAN_BEFORE = /\b(?:r|b|d|born|died|reigned|fl)\.?\s*$/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const LEAD_IN = /^(?:and|but|so|then|later|subsequently|thereafter|eventually|finally|meanwhile|also|however|that year|at that time|by then|while|when|after|as|although|though|which|who|where|following|during|with|despite|under|soon|shortly|thus)\b[\s,]*/i;
const HEDGE = /^(?:most|some|many|several|other)\s+(?:historians|scholars|chronologies|sources|accounts|studies|writers)\s+(?:place|date|consider|believe|say|argue|suggest|indicate|claim)\s+(?:that\s+)?/i;

/** "In 27 BC the Senate gave him the title Augustus…" → "The Senate gave him the title Augustus and made him princeps" */
export function synthesizeTitle(sentence: string, expr: TimeExpr): string | null {
  const datePhrase = new RegExp(
    String.raw`(?:\b(?:in|by|from|during|around|circa|c\.|on|after|before|until|since|between|of|throughout)\s+)?(?:the\s+)?(?:(?:early|late|mid)[\s-]+)?(?:${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+|\d{1,2}\s+${MONTH}\s+)?${escapeRe(expr.text)},?`,
    "i",
  );
  let s = sentence.replace(datePhrase, " § ");
  if (!s.includes("§")) return null;
  s = s.replace(/\s*\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").replace(/["“”]/g, "");

  const parts = s.split(/\s*[;:]\s*|,\s+|\s+[—–]\s+/);
  const idx = parts.findIndex((p) => p.includes("§"));
  if (idx < 0) return null;
  const [leftRaw, rightRaw = ""] = parts[idx].split("§");
  const left = leftRaw.trim();
  const right = rightRaw.trim();
  const words = (t: string) => (t ? t.split(/\s+/).length : 0);

  let clause: string;
  if (words(left) >= 4 && /^(?:when|as|after|while|which|who|where|with|following|during|before|until)\b/i.test(right)) clause = left;
  else clause = `${left} ${right}`.trim();
  if (words(clause) < 4 && parts[idx + 1]) clause = parts[idx + 1];

  for (let i = 0; i < 3; i++) clause = clause.replace(LEAD_IN, "").replace(HEDGE, "").trim();
  let t = clause.replace(/\s+/g, " ").trim();
  const cut = t.search(/\s(?:which|who|whom|whose|although|but|thus|thereby)\s/);
  if (cut > 16) t = t.slice(0, cut);
  const w = t.split(" ");
  if (w.length > 11) t = w.slice(0, 11).join(" ");
  for (let i = 0; i < 3; i++) t = t.replace(/\s+(?:the|a|an|of|and|or|in|to|by|for|with|on|at|from|as|its|his|her|their|that|was|were|is|had)$/i, "");
  t = t.replace(/[.,;:'"]+$/, "").trim();
  if (t.split(" ").length < 3 || t.length > 96 || /§/.test(t)) return null;
  return capitalize(t);
}

/** Dated claims from history prose, the way a model would propose seed events. */
export function proseClaims(paragraphs: Paragraph[], range: YearRange, now: number): Claim[] {
  const claims: Claim[] = [];
  for (const p of paragraphs) {
    let cursor = 0;
    for (const sentence of splitSentences(p.text)) {
      const at = p.text.indexOf(sentence, cursor);
      if (at < 0) continue;
      cursor = at + sentence.length;
      const words = sentence.split(/\s+/).length;
      if (words < 6 || words > 75) continue;

      const exprs = parseTimeExprs(sentence, { now }).filter((x) => {
        if (x.fuzzy && !/0s\b/.test(x.text)) return false; // centuries are too vague for an event
        return !LIFESPAN_BEFORE.test(sentence.slice(Math.max(0, x.index - 10), x.index));
      });
      if (exprs.length === 0) continue;

      const links = p.links.filter((l) => l.start >= at && l.end <= at + sentence.length);
      const eventLinks = links.filter((l) => isEventLike(l.title));
      const clean = tidyProse(cleanExtract(sentence));
      // prefer specific, plainly stated claims
      let base = 1;
      if (new RegExp(MONTH).test(sentence)) base += 0.5;
      if (words >= 10 && words <= 40) base += 0.5;
      if (HEDGE.test(sentence) || /^(?:according to|in the view of|it is|there (?:is|are|was|were))\b/i.test(sentence)) base -= 1;

      if (eventLinks.length > 0) {
        for (const l of eventLinks.slice(0, 2)) {
          const rel = l.start - at;
          const relEnd = l.end - at;
          // nearest date in the same clause: every comma or semicolon in between counts as distance
          const distance = (x: TimeExpr) => {
            const after = x.index >= relEnd;
            const gap = after ? x.index - relEnd : rel - (x.index + x.length);
            const between = after ? sentence.slice(relEnd, x.index) : sentence.slice(x.index + x.length, rel);
            return Math.max(0, gap) + (between.match(/[,;:]/g)?.length ?? 0) * 40;
          };
          const nearest = exprs.reduce((best, x) => (distance(x) < distance(best) ? x : best), exprs[0]);
          if (distance(nearest) > 140) continue;
          if (!inRange({ year: nearest.start, endYear: nearest.end }, range)) continue;
          claims.push({
            year: nearest.start,
            endYear: nearest.end !== nearest.start ? nearest.end : undefined,
            approx: nearest.fuzzy,
            title: stripParenthetical(l.title),
            altTitle: synthesizeTitle(clean, nearest) ?? undefined,
            synthTitle: false,
            wikipediaTitle: l.title,
            sentence: clean,
            linkTitles: links.map((x) => x.title),
            heading: p.heading,
            anchor: p.anchor,
            weight: base + 2 + eventLinks.length - (nearest.fuzzy ? 0.5 : 0),
          });
        }
        continue;
      }

      const x = exprs[0];
      if (!inRange({ year: x.start, endYear: x.end }, range)) continue;
      // broken or second-hand sentences make poor claims
      if (/[,;:]\s*\.?$/.test(clean) || !/[.!?]["”’)]?$/.test(clean)) continue;
      const title = synthesizeTitle(clean, x);
      if (!title || REPORTING.test(title)) continue;
      claims.push({
        year: x.start,
        endYear: x.end !== x.start ? x.end : undefined,
        approx: x.fuzzy,
        title,
        synthTitle: true,
        sentence: clean,
        linkTitles: links.map((l) => l.title),
        heading: p.heading,
        anchor: p.anchor,
        weight: base - (x.fuzzy ? 0.5 : 0),
      });
    }
  }

  // one claim per (year, title)
  const seen = new Set<string>();
  return claims.filter((c) => {
    const k = `${c.year}|${(c.wikipediaTitle ?? c.title).toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Spread picks across the range so one busy decade doesn't crowd out the rest. */
export function spreadPick<T extends { year: number; weight: number }>(items: T[], limit: number, range: YearRange, buckets = 8): T[] {
  if (items.length <= limit) return [...items].sort((a, b) => a.year - b.year);
  const span = Math.max(1, range.end - range.start);
  const groups: T[][] = Array.from({ length: buckets }, () => []);
  for (const it of items) {
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(((it.year - range.start) / span) * buckets)));
    groups[b].push(it);
  }
  for (const grp of groups) grp.sort((a, b) => b.weight - a.weight);
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const grp of groups) {
      if (grp[round] && out.length < limit) {
        out.push(grp[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out.sort((a, b) => a.year - b.year);
}

/* ── records ── */

/** A linked article → Wikipedia record, if its own text dates it inside the range. */
export function recordFromPage(page: PageInfo, range: YearRange, now: number, { trusted = false }: { trusted?: boolean } = {}): SourceRecord | null {
  // trusted = another source already says this article is an event (Wikidata, the model)
  if (!trusted && !isEventLike(page.title, page.description ?? "")) return null;
  const when = extractEventYear(page.description, page.extract, { now });
  if (!when || !inRange({ year: when.year, endYear: when.endYear }, range)) return null;
  const summary = leadSentences(page.extract ?? "", 2) || capitalize(page.description ?? "");
  if (!summary) return null;
  return {
    id: `wp:${page.title}`,
    source: "wikipedia",
    title: page.title,
    year: when.year,
    endYear: when.endYear,
    approxYear: when.approx || undefined,
    summary,
    location: page.coordinates ? { ...page.coordinates, name: stripParenthetical(page.title) } : undefined,
    qid: page.qid,
    wikipediaTitle: page.title,
    thumbnail: page.thumbnail,
    citation: {
      source: "wikipedia",
      label: `Wikipedia: ${page.title}`,
      url: wikipediaUrl(page.title),
      detail: when.from === "description" ? `"${page.description}"` : `dated from the article text`,
    },
    facts: page.description ? [{ label: "Wikipedia says", value: capitalize(page.description), source: "wikipedia" }] : [],
  };
}

export { leadSentences };
