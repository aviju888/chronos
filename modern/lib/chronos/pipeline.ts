/* ─────────────────────────────────────────────────────────
 * PIPELINE — one query in, a stream of timeline frames out.
 *
 *   intent ─┬─ model lane     (live: Groq seed events · demo: scripted
 *           │                  pass over dated sentences in the prose)
 *           ├─ Wikidata       (events linked to the topic entity)
 *           ├─ Wikipedia      (linked articles, dated by their own text)
 *           └─ Wikidata x2    (cross-check: dates for what Wikipedia linked)
 *                      ↓ every record
 *                 MergeEngine  → event / merge frames as they happen
 *                      ↓ once all lanes finish
 *                 eras → narrative → done
 *
 * Frames go through a paced outbox so the UI visibly assembles
 * instead of receiving one burst per HTTP response.
 * ───────────────────────────────────────────────────────── */

import type { SSESend } from "../sse.js";
import { hasLLM } from "../llm.js";
import { scriptedStream, sleep } from "../scripted.js";
import type {
  ChronosEvent,
  Era,
  Intent,
  MergeInfo,
  Mode,
  QueryType,
  RangeOrigin,
  SourceId,
  SourceRecord,
  TaskId,
  TaskStatus,
  TaskStep,
  TaskUpdate,
  TraceLine,
  YearRange,
} from "./types.js";
import { parseQuery, typeFromDescription, type ParsedQuery } from "./query.js";
import { formatRange, formatYear, parseTimeExpr, spanOf } from "./time.js";
import { isEventLike, splitSentences, stripParenthetical } from "./text.js";
import { MergeEngine } from "./merge.js";
import { buildEras, erasFromHeadings, fallbackEras, type EraCandidate } from "./eras.js";
import {
  fetchHtml,
  fetchSections,
  fetchSummary,
  historySections,
  mineHtml,
  pageBasics,
  pageCoords,
  pageDetails,
  proseClaims,
  recordFromPage,
  resolveTitle,
  spreadPick,
  type Claim,
  type Paragraph,
  type Section,
  type Summary,
} from "./wikipedia.js";
import { classifyRow, crossCheckQuery, fetchEntity, linkedQuery, parseRows, runSparql, type EntityInfo } from "./wikidata.js";
import { composeNarrative, type NarrativeClaim } from "./narrative.js";
import { llmEras, llmNarrative, llmRange, llmSeedEvents } from "./llm.js";
import { HttpError } from "./http.js";
import { findFixture, replayFixture } from "./fixtures.js";

export type RunInput = { query: string; mode: Mode; replay?: boolean; range?: YearRange };
export type RunOptions = {
  /** force live (Groq) or demo; defaults to whether GROQ_API_KEY is set */
  live?: boolean;
  now?: number;
  /** pace frames for the assembling effect (off for tests) */
  pace?: boolean;
  /** replay a saved run when the network fails */
  fixtureFallback?: boolean;
};

const LIMITS: Record<Mode, { linked: number; links: number; details: number; claims: number; narrative: number }> = {
  quick: { linked: 50, links: 320, details: 45, claims: 16, narrative: 6 },
  deep: { linked: 90, links: 600, details: 90, claims: 28, narrative: 9 },
};

/* ── plumbing ── */

type Frame = { event: string; data: unknown; gap: number; taskId?: TaskId };

/** Ordered, paced frame queue. Task updates for the same row coalesce while queued. */
class Outbox {
  private queue: Frame[] = [];
  private draining: Promise<void> | null = null;
  constructor(
    private send: SSESend,
    private signal: AbortSignal,
    private pace: boolean,
  ) {}

  push(event: string, data: unknown, gap = 0) {
    if (this.signal.aborted) return;
    this.queue.push({ event, data, gap });
    this.kick();
  }

  task(update: TaskUpdate) {
    if (this.signal.aborted) return;
    const queued = this.queue.find((f) => f.taskId === update.id);
    if (queued) queued.data = update;
    else this.queue.push({ event: "task", data: update, gap: 0, taskId: update.id });
    this.kick();
  }

  trace(line: TraceLine) {
    this.push("trace", line);
  }

  private kick() {
    if (!this.draining) this.draining = this.drain().finally(() => (this.draining = null));
  }

  private async drain() {
    while (this.queue.length) {
      if (this.signal.aborted) { this.queue = []; return; }
      const f = this.queue.shift()!;
      if (this.pace && f.gap > 0 && !this.signal.aborted) {
        const backlog = this.queue.filter((x) => x.gap > 0).length;
        const scale = backlog > 40 ? 0.35 : backlog > 20 ? 0.6 : 1;
        try {
          await sleep(f.gap * scale, this.signal);
        } catch {
          // aborted: flush the rest without waiting
        }
      }
      if (this.signal.aborted) { this.queue = []; return; }
      this.send(f.event, f.data);
    }
  }

  async flush() {
    while (this.draining || this.queue.length) {
      if (this.draining) await this.draining;
      else this.kick();
    }
  }
}

/** Async queue with multiple producers; consumers read it in batches. */
class WorkQueue<T> {
  private items: T[] = [];
  private waiters: (() => void)[] = [];
  private closed = 0;
  constructor(private producers: number) {}

  push(...xs: T[]) {
    if (xs.length === 0) return;
    this.items.push(...xs);
    this.wake();
  }

  close() {
    this.closed++;
    this.wake();
  }

  get done() {
    return this.closed >= this.producers && this.items.length === 0;
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const fn of w) fn();
  }

  /** yields batches; waits briefly to fill a batch while producers are still running */
  async *batches(size: number, settleMs = 250): AsyncGenerator<T[]> {
    for (;;) {
      if (this.items.length >= size || (this.items.length > 0 && this.closed >= this.producers)) {
        yield this.items.splice(0, size);
        continue;
      }
      if (this.items.length > 0) {
        await Promise.race([new Promise<void>((r) => this.waiters.push(r)), sleep(settleMs)]);
        if (this.items.length > 0 && this.items.length < size && this.closed < this.producers) {
          await sleep(settleMs);
        }
        if (this.items.length > 0) yield this.items.splice(0, size);
        continue;
      }
      if (this.closed >= this.producers) return;
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }
}

const TASK_LABELS = (live: boolean): Record<TaskId, string> => ({
  llm: live ? "Model seed events" : "Model pass (scripted)",
  wikidata: "Wikidata SPARQL",
  wikipedia: "Wikipedia articles",
  dedup: "Dedup and merge",
});

class TaskBoard {
  private state = new Map<TaskId, TaskUpdate>();
  constructor(
    private out: Outbox,
    live: boolean,
  ) {
    const labels = TASK_LABELS(live);
    for (const id of ["llm", "wikidata", "wikipedia", "dedup"] as TaskId[]) {
      this.state.set(id, { id, label: labels[id], status: "pending", count: 0, unit: id === "dedup" ? "merges" : "events", steps: [] });
    }
  }
  init() {
    for (const t of this.state.values()) this.out.task({ ...t });
  }
  set(id: TaskId, patch: Partial<TaskUpdate>) {
    const next = { ...this.state.get(id)!, ...patch };
    this.state.set(id, next);
    this.out.task({ ...next, steps: next.steps ? [...next.steps] : undefined });
  }
  status(id: TaskId): TaskStatus {
    return this.state.get(id)!.status;
  }
  step(id: TaskId, label: string, meta: string) {
    const cur = this.state.get(id)!;
    const steps: TaskStep[] = [...(cur.steps ?? []).filter((s) => s.label !== label), { label, meta }];
    this.set(id, { steps });
  }
}

function errorText(err: unknown): string {
  if (err instanceof HttpError) return err.status === 429 ? "rate limited (429)" : err.message;
  if (err instanceof Error) return err.name === "AbortError" ? "timed out" : err.message;
  return String(err);
}

/* ── intent helpers ── */

async function findHistoryArticle(title: string, signal: AbortSignal, onError: (err: unknown) => void): Promise<{ title: string; qid?: string } | null> {
  if (/^history of /i.test(title)) return null;
  for (const candidate of [`History of ${title}`, `History of the ${title}`]) {
    const r = await resolveTitle(candidate, signal, { exactOnly: true }).catch((err) => { onError(err); return null; });
    if (r && r.title !== title && /^history of/i.test(r.title)) return { title: r.title, qid: r.qid };
  }
  return null;
}

function resolveRange(
  parsed: ParsedQuery,
  summary: Summary | null,
  entity: EntityInfo | null,
  queryType: QueryType,
  claims: Claim[],
  now: number,
): { range: YearRange; from: RangeOrigin } | null {
  if (parsed.range) return { range: parsed.range, from: "query" };

  const desc = summary?.description ? parseTimeExpr(summary.description, { now }) : null;
  if (desc && desc.kind === "range" && desc.end - desc.start >= 5) return { range: { start: desc.start, end: Math.min(desc.end, now) }, from: "wikipedia" };

  if (entity) {
    const start = entity.start ?? entity.inception;
    const end = entity.end ?? entity.dissolved;
    if (start !== undefined && end !== undefined && end > start && queryType !== "city") return { range: { start, end: Math.min(end, now) }, from: "wikidata" };
  }

  // the first sentence of the lead often states the span ("from the second century BCE until the mid-15th century")
  const first = summary?.lead ? splitSentences(summary.lead)[0] : "";
  const leadSpan = first ? spanOf(first, { now }) : null;
  if (leadSpan && leadSpan.end - leadSpan.start >= 20 && queryType !== "city") return { range: { start: leadSpan.start, end: Math.min(leadSpan.end, now) }, from: "wikipedia" };

  if (entity?.pointInTime !== undefined) {
    const p = entity.pointInTime;
    return { range: { start: p - 80, end: Math.min(p + 20, now) }, from: "wikidata" };
  }

  // places: from the earliest dated sentence in their history to today
  const years = claims.filter((c) => !c.approx).map((c) => c.year).sort((a, b) => a - b);
  if (years.length >= 3) {
    const floor = entity?.inception !== undefined ? entity.inception - 400 : -Infinity;
    const start = years.find((y) => y >= floor) ?? years[0];
    const end = queryType === "city" || queryType === "country" || queryType === "region" ? now : years[years.length - 1];
    if (end > start) return { range: { start, end }, from: "wikipedia" };
  }
  if (entity?.inception !== undefined) return { range: { start: entity.inception, end: now }, from: "wikidata" };
  return null;
}

/* ── the run ── */

export async function runChronos(input: RunInput, send: SSESend, signal: AbortSignal, opts: RunOptions = {}): Promise<void> {
  if (signal.aborted) return;
  const now = opts.now ?? new Date().getFullYear();
  const live = opts.live ?? hasLLM();
  const pace = opts.pace ?? true;
  const mode: Mode = input.mode === "deep" ? "deep" : "quick";
  const L = LIMITS[mode];
  const started = Date.now();

  if (input.replay) {
    const fx = findFixture(input.query);
    if (!fx) throw new Error(`No usable saved run is available for “${input.query}”. Choose a saved example or turn off replay to run live.`);
    return replayFixture(fx, send, signal, { pace });
  }

  const parsed = parseQuery(input.query, now);
  if (input.range) parsed.range = input.range;
  if (!parsed.topic) throw new Error("Type a topic, place or period, like “Silk Road”.");

  const out = new Outbox(send, signal, pace);
  const tasks = new TaskBoard(out, live);
  tasks.init();
  const sourceFailures = new Set<SourceId>();
  const sourceFailure = (source: SourceId, label: string, err: unknown) => {
    if (signal.aborted) return;
    sourceFailures.add(source);
    out.trace({ source, kind: "note", text: `${label}: ${errorText(err)}.` });
  };

  const fallback = async (reason: string): Promise<boolean> => {
    if (opts.fixtureFallback === false || input.range) return false;
    const fx = findFixture(input.query);
    if (!fx) return false;
    await out.flush();
    send("notice", { kind: "fallback", text: `${reason} Showing a saved run instead.` });
    await replayFixture(fx, send, signal, { notice: false, pace });
    return true;
  };

  out.trace({ source: "intent", kind: "note", text: `Reading “${parsed.raw}”: topic “${parsed.topic}”${parsed.range ? `, ${formatRange(parsed.range.start, parsed.range.end)}` : ""}` });

  // ── resolve the topic ──
  tasks.set("wikipedia", { status: "running" });
  let resolved: Awaited<ReturnType<typeof resolveTitle>>;
  try {
    resolved = await resolveTitle(parsed.topic, signal);
  } catch (err) {
    if (signal.aborted) return;
    if (await fallback(`Wikipedia is unreachable (${errorText(err)}).`)) return;
    throw new Error(`Couldn't reach Wikipedia (${errorText(err)}). Try again in a moment, or pick a saved example.`);
  }
  if (!resolved) {
    if (await fallback(`No Wikipedia article matches “${parsed.topic}”.`)) return;
    throw new Error(`No Wikipedia article matches “${parsed.topic}”. Check the spelling or try a broader topic.`);
  }

  const [summary, sections, entity, historyOf] = await Promise.all([
    fetchSummary(resolved.title, signal).catch((err) => { sourceFailure("wikipedia", "Article summary failed", err); return null; }),
    fetchSections(resolved.title, signal).catch((err) => { sourceFailure("wikipedia", "Article sections failed", err); return [] as Section[]; }),
    resolved.qid
      ? fetchEntity(resolved.qid, signal).catch((err) => {
          sourceFailure("wikidata", "Entity lookup failed", err);
          return null;
        })
      : Promise.resolve(null),
    resolved.fragment ? Promise.resolve(null) : findHistoryArticle(resolved.title, signal, (err) => sourceFailure("wikipedia", "History article lookup failed", err)),
  ]);
  if (signal.aborted) return;

  const articleUrl = summary?.url ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(resolved.title.replace(/ /g, "_"))}`;
  const hist = historySections(sections, resolved.fragment);
  let paragraphs: Paragraph[] = [];
  let links: string[] = [];
  const mineInto = (html: string, sourceUrl = articleUrl) => {
    const mined = mineHtml(html);
    paragraphs = [...paragraphs, ...mined.paragraphs.map(p => ({...p, sourceUrl}))];
    links = Array.from(new Set([...links, ...mined.links]));
  };
  // deep mode with no "History of X" article reads the whole topic article instead of just its History section
  const wholeArticle = mode === "deep" && !historyOf && !resolved.fragment;
  const [historyHtml, historyOfSections] = await Promise.all([
    wholeArticle
      ? fetchHtml(resolved.title, null, signal).catch((err) => { sourceFailure("wikipedia", "Article text failed", err); return ""; })
      : hist.length
        ? fetchHtml(resolved.title, hist[0].index, signal).catch((err) => { sourceFailure("wikipedia", "History text failed", err); return ""; })
        : Promise.resolve(""),
    historyOf ? fetchSections(historyOf.title, signal).catch((err) => { sourceFailure("wikipedia", "History sections failed", err); return [] as Section[]; }) : Promise.resolve([] as Section[]),
  ]);
  mineInto(historyHtml);
  // a dedicated "History of X" article is the richest source; read it when the section is thin or in deep mode
  if (historyOf && (mode === "deep" || paragraphs.length < 18)) {
    mineInto(await fetchHtml(historyOf.title, null, signal).catch((err) => { sourceFailure("wikipedia", "History article text failed", err); return ""; }), `https://en.wikipedia.org/wiki/${encodeURIComponent(historyOf.title.replace(/ /g, '_'))}`);
  }
  if (!historyHtml && !historyOf && !wholeArticle && summary) {
    // no history section: read the whole article
    mineInto(await fetchHtml(resolved.title, null, signal).catch((err) => { sourceFailure("wikipedia", "Article text failed", err); return ""; }));
  }
  if (signal.aborted) return;

  const queryType: QueryType =
    parsed.hint ??
    typeFromDescription(summary?.description ?? resolved.description ?? "") ??
    (entity ? typeFromDescription(entity.types.join(" ")) : null) ??
    "topic";

  const wideRange = { start: -5000, end: now };
  const allClaims = proseClaims(paragraphs, parsed.range ?? wideRange, now);
  let rangeInfo = resolveRange(parsed, summary, entity, queryType, allClaims, now);
  if (!rangeInfo && live) {
    const r = await llmRange(parsed.topic, now, signal).catch(() => null);
    if (r) rangeInfo = { range: r, from: "llm" };
  }
  if (!rangeInfo) rangeInfo = { range: { start: now - 300, end: now }, from: "default" };
  const range = rangeInfo.range;
  const claims = allClaims.filter((c) => c.year >= range.start && c.year <= range.end);

  const intent: Intent = {
    query: parsed.raw,
    topic: resolved.title,
    range,
    rangeFrom: input.range ? 'selected' : rangeInfo.from,
    queryType,
    mode,
    live,
    article: {
      title: resolved.title,
      url: articleUrl,
      description: summary?.description ?? resolved.description,
      qid: resolved.qid,
      thumbnail: summary?.thumbnail,
    },
  };
  out.push("intent", intent);
  const rangeWhy: Record<RangeOrigin, string> = {
    selected: "from your selected dates",
    query: "from your query",
    wikipedia: "from the Wikipedia article",
    wikidata: "from Wikidata start and end dates",
    llm: "suggested by the model",
    events: "from the events found",
    default: "default window, add years to narrow it",
  };
  out.trace({
    source: "intent",
    kind: "note",
    text: `Wikipedia: “${resolved.title}”${resolved.qid ? ` (${resolved.qid})` : ""}${resolved.fragment ? ` › ${resolved.fragment}` : ""}. Range ${formatRange(range.start, range.end)}, ${rangeWhy[rangeInfo.from]}.`,
  });

  tasks.step("wikipedia", "Article", resolved.title);
  tasks.step("wikipedia", wholeArticle ? "Article text" : "History text", `${paragraphs.length} paragraphs`);
  if (historyOf) tasks.step("wikipedia", "Also read", historyOf.title);

  // ── shared state ──
  const engine = new MergeEngine();
  // distinct events each source contributed to (a source restating itself doesn't count twice)
  const perSource: Record<SourceId, Set<string>> = { llm: new Set(), wikidata: new Set(), wikipedia: new Set() };
  const found = { get llm() { return perSource.llm.size; }, get wikidata() { return perSource.wikidata.size; }, get wikipedia() { return perSource.wikipedia.size; } };
  let merges = 0;
  let records = 0;
  const knownQids = new Set<string>();
  const eraCands: EraCandidate[] = [
    ...erasFromHeadings(hist.slice(1).map((s) => ({ line: s.line, level: s.level, anchor: s.anchor })), articleUrl, now),
    ...erasFromHeadings(
      historyOfSections.map((s) => ({ line: s.line, level: s.level, anchor: s.anchor })),
      historyOf ? `https://en.wikipedia.org/wiki/${encodeURIComponent(historyOf.title.replace(/ /g, "_"))}` : undefined,
      now,
    ),
  ];
  const claimRecords: { recordId: string; claim: Claim }[] = [];
  const budget = AbortSignal.any([signal, AbortSignal.timeout(mode === "deep" ? 40000 : 28000)]);

  const accept = (rec: SourceRecord) => {
    const r = engine.add(rec);
    if (r.kind === "skip") return;
    records++;
    perSource[rec.source].add(r.event.id);
    if (r.kind === "new" || r.kind === "absorb") {
      out.push("event", { event: r.event }, r.kind === "new" ? (mode === "deep" ? 32 : 45) : 0);
    } else {
      merges++;
      const info: MergeInfo = {
        keptId: r.keptId,
        mergedIds: [rec.id],
        sources: r.event.sources,
        incoming: [{ id: rec.id, source: rec.source, title: rec.title, year: rec.year }],
        reason: r.reason,
        event: r.event,
      };
      out.push("merge", info, 70);
      out.trace({ source: "dedup", kind: "note", text: `Merged “${r.event.title}” (${formatYear(r.event.year)}) from ${r.event.sources.length} sources: ${r.reason}` });
    }
    tasks.set(rec.source, { count: found[rec.source] });
    tasks.set("dedup", { status: "running", count: merges });
  };

  // producers for the Wikipedia queue: history links, Wikidata titles, model seeds (live)
  const wpQueue = new WorkQueue<{ title: string; boost: number; trusted?: boolean }>(live ? 3 : 2);
  const xcQueue = new WorkQueue<string>(1);

  /* Wikidata: events linked to the topic entity */
  const wikidataLinked = async () => {
    try {
      if (!resolved.qid) {
        tasks.set("wikidata", { status: "running" });
        out.trace({ source: "wikidata", kind: "note", text: "No Wikidata item for this article; Wikidata will only cross-check linked articles." });
        return;
      }
      tasks.set("wikidata", { status: "running" });
      tasks.step("wikidata", "Entity", `${resolved.qid}${entity?.label ? ` · ${entity.label}` : ""}`);
      const query = linkedQuery(resolved.qid, range, L.linked);
      out.trace({ source: "wikidata", kind: "query", text: query });
      const rows = parseRows(await runSparql(query, budget));
      let kept = 0;
      let periods = 0;
      for (const row of rows) {
        knownQids.add(row.qid);
        const c = classifyRow(row, range, "linked");
        if (c.kind === "event") {
          kept++;
          accept(c.record);
          if (row.wikipediaTitle) wpQueue.push({ title: row.wikipediaTitle, boost: Math.min(40, row.sitelinks), trusted: true });
        } else if (c.kind === "era") {
          periods++;
          eraCands.push(c.era);
        }
      }
      tasks.step("wikidata", "Linked items", `${rows.length} rows, ${kept} events`);
      out.trace({ source: "wikidata", kind: "note", text: `${rows.length} items linked to ${resolved.qid}: ${kept} dated events, ${periods} periods, ${rows.length - kept - periods} skipped as noise or undated.` });
    } catch (err) {
      if (signal.aborted) return;
      sourceFailure("wikidata", "Linked-events query failed; continuing with the other sources", err);
      tasks.step("wikidata", "Linked items", "failed");
    } finally {
      wpQueue.close();
    }
  };

  /* Wikipedia: articles linked from the history text (and Wikidata/model titles), dated by their own text */
  const wikipediaLane = async () => {
    const claimLinks = new Set(claims.map((c) => c.wikipediaTitle).filter((t): t is string => Boolean(t)));
    const ranked = links
      .map((title, i) => ({ title, i, score: claimLinks.has(title) ? 2 : isEventLike(title) ? 1 : 0 }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, L.links);
    wpQueue.push(...ranked.map((r) => ({ title: r.title, boost: r.score * 6 })));
    out.trace({ source: "wikipedia", kind: "note", text: `${links.length} articles linked from the history text; checking ${ranked.length}.` });
    wpQueue.close();

    let looked = 0;
    let detailBudget = L.details;
    let trustedBudget = L.linked + 20;
    const seen = new Set<string>();
    try {
      for await (const batch of wpQueue.batches(50)) {
        const fresh = batch.filter((b) => !seen.has(b.title));
        fresh.forEach((b) => seen.add(b.title));
        if (fresh.length === 0) continue;
        const basics = await pageBasics(
          fresh.map((b) => b.title),
          budget,
        );
        looked += fresh.length;
        const take: { title: string; boost: number; trusted: boolean }[] = [];
        for (const b of fresh) {
          const page = basics.get(b.title);
          if (!page) continue;
          if (page.qid && !knownQids.has(page.qid)) {
            knownQids.add(page.qid);
            xcQueue.push(page.qid);
          }
          if (b.trusted && trustedBudget > 0) {
            trustedBudget--;
            take.push({ title: page.title, boost: b.boost, trusted: true });
          } else if (detailBudget > 0 && isEventLike(page.title, page.description ?? "")) {
            detailBudget--;
            take.push({ title: page.title, boost: b.boost, trusted: false });
          }
        }
        if (take.length) {
          const details = await pageDetails(
            take.map((t) => t.title),
            budget,
          );
          for (const t of take) {
            const page = details.get(t.title);
            const rec = page ? recordFromPage(page, range, now, { trusted: t.trusted }) : null;
            if (rec) accept({ ...rec, weight: t.boost });
          }
        }
        tasks.step("wikipedia", "Linked articles", `${looked} checked`);
      }
    } catch (err) {
      sourceFailure("wikipedia", "Article lookups stopped", err);
    } finally {
      xcQueue.close();
    }
  };

  /* Wikidata cross-check: structured dates for the items behind linked articles */
  const crossCheckLane = async () => {
    let checked = 0;
    let shown = false;
    try {
      for await (const batch of xcQueue.batches(90, 350)) {
        tasks.set("wikidata", { status: "running" });
        const query = crossCheckQuery(batch);
        if (!shown) {
          out.trace({ source: "wikidata", kind: "query", text: query.replace(/VALUES \?item \{[^}]*\}/, `VALUES ?item { ${batch.slice(0, 4).map((q) => `wd:${q}`).join(" ")} … ${batch.length} items }`) });
          shown = true;
        }
        const rows = parseRows(await runSparql(query, budget));
        checked += batch.length;
        let dated = 0;
        for (const row of rows) {
          const c = classifyRow(row, range, "cross-check");
          if (c.kind === "event") {
            dated++;
            accept(c.record);
          } else if (c.kind === "era") eraCands.push({ ...c.era, weight: Math.min(30, c.era.weight * 0.3) });
        }
        tasks.step("wikidata", "Cross-check", `${checked} items`);
        out.trace({ source: "wikidata", kind: "note", text: `Cross-checked ${batch.length} linked items: ${dated} have dates in range.` });
      }
    } catch (err) {
      sourceFailure("wikidata", "Cross-check failed", err);
    }
  };

  /* Model lane: live seeds from Groq, or the scripted pass over dated sentences */
  const modelLane = async () => {
    tasks.set("llm", { status: "running" });
    if (live) {
      try {
        const { records: seeds, model } = await llmSeedEvents(resolved.title, range, queryType, mode, budget);
        tasks.step("llm", "Model", model);
        out.trace({ source: "llm", kind: "note", text: `${model} proposed ${seeds.length} seed events; sending their articles to Wikipedia for checking.` });
        for (const rec of seeds) {
          accept(rec);
          if (rec.wikipediaTitle) wpQueue.push({ title: rec.wikipediaTitle, boost: 10, trusted: true });
        }
        tasks.set("llm", { status: "done" });
      } catch (err) {
        if (!signal.aborted) {
          sourceFailure("llm", "Model call failed; continuing with Wikidata and Wikipedia", err);
          tasks.set("llm", { status: "failed" });
        }
      } finally {
        wpQueue.close();
      }
      return;
    }

    const picked = spreadPick(claims, L.claims, range);
    tasks.step("llm", "Dated sentences", String(claims.length));
    out.trace({
      source: "llm",
      kind: "note",
      text: `No GROQ_API_KEY, so the model step is scripted: it reads ${claims.length} dated sentences in the history text and proposes ${picked.length} as seed events.`,
    });
    const linkTitles = picked.map((c) => c.wikipediaTitle).filter((t): t is string => Boolean(t));
    const [basics, coords] = await Promise.all([
      linkTitles.length ? pageBasics(linkTitles, budget).catch((err) => { sourceFailure("wikipedia", "Claim article lookup failed", err); return new Map(); }) : Promise.resolve(new Map()),
      pageCoords(picked.flatMap((c) => c.linkTitles), budget).catch((err) => { sourceFailure("wikipedia", "Place lookup failed", err); return new Map(); }),
    ]);
    // a claim with no coordinates of its own sits at the first place its sentence mentions
    // (people and ideas have no coordinates on Wikipedia, so the first hit is a place or an event)
    const placeOf = (c: Claim) => {
      for (const t of c.linkTitles) {
        const hit = coords.get(t);
        if (hit) return { lat: hit.lat, lng: hit.lng, name: stripParenthetical(t), approx: true };
      }
      return undefined;
    };
    for (const [i, c] of picked.entries()) {
      if (pace) await sleep(110, signal).catch(() => undefined);
      if (signal.aborted) return;
      const linked = c.wikipediaTitle ? basics.get(c.wikipediaTitle) : null;
      // a link that redirects to a general article ("Edict") is not the event itself
      const page = linked && isEventLike(linked.title, linked.description ?? "") ? linked : null;
      const title = page ? stripParenthetical(page.title) : c.wikipediaTitle ? c.altTitle : c.title;
      if (!title) continue;
      const id = `llm:${i}`;
      claimRecords.push({ recordId: id, claim: c });
      accept({
        id,
        source: "llm",
        title,
        year: c.year,
        endYear: c.endYear,
        approxYear: c.approx || undefined,
        summary: c.sentence,
        wikipediaTitle: page?.title,
        qid: page?.qid,
        synthTitle: !page,
        location: placeOf(c),
        facts: [{ label: "Model read", value: c.sentence, source: "llm" }],
        weight: c.weight,
        citation: {
          source: "llm",
          label: `${resolved.title} › ${c.heading || "History"}`,
          url: c.anchor ? `${articleUrl}#${c.anchor}` : articleUrl,
          detail: "proposed from a dated sentence there",
        },
      });
    }
    tasks.step("llm", "Claims proposed", String(picked.length));
    tasks.set("llm", { status: "done" });
  };

  const emitEras = async (final: boolean): Promise<Era[]> => {
    let candidates = eraCands;
    if (final && live) {
      const fromModel = await llmEras(resolved.title, range, budget).catch(() => []);
      candidates = [...fromModel, ...eraCands];
    }
    let eras = buildEras(candidates, range, { topic: resolved.title });
    // one real era beats generic centuries; fall back only when nothing named the period
    if (eras.length === 0) eras = fallbackEras(range);
    out.push("eras", { eras });
    return eras;
  };

  // ── run the lanes ──
  const linkedDone = wikidataLinked().then(() => emitEras(false));
  await Promise.all([linkedDone, wikipediaLane(), crossCheckLane(), modelLane()]);
  if (signal.aborted) return;

  // A provider limit must not discard useful dates already read from the source.
  // These are attributed to Wikipedia, with the actual sentence and article;
  // they are never counted as independent model confirmation.
  if (live && engine.list().filter(e => e.sources.some(s => s !== 'llm')).length < 5) {
    const picked = spreadPick(claims, L.claims, range);
    for (const [i, claim] of picked.entries()) {
      const id = `wp-prose:${i}`;
      const url = claim.sourceUrl ?? articleUrl;
      const title = claim.altTitle ?? claim.title;
      accept({id, source: 'wikipedia', title, year: claim.year, endYear: claim.endYear,
        approxYear: claim.approx || undefined, summary: claim.sentence, synthTitle: true,
        weight: claim.weight,
        citation: {source: 'wikipedia', label: claim.heading || resolved.title,
          url: claim.anchor ? `${url}#${claim.anchor}` : url, detail: claim.sentence},
      });
      claimRecords.push({recordId: id, claim});
    }
    if (picked.length) tasks.step('wikipedia', 'Dated source passages', String(picked.length));
  }

  tasks.set("wikidata", { status: sourceFailures.has("wikidata") ? "failed" : "done", count: found.wikidata });
  tasks.set("wikipedia", { status: sourceFailures.has("wikipedia") ? "failed" : "done", count: found.wikipedia });
  if (tasks.status("llm") === "running") tasks.set("llm", { status: "done" });

  const events = engine.list();
  if (events.length === 0) {
    await out.flush();
    if (await fallback(`No dated events came back for “${resolved.title}”.`)) return;
    throw new Error(`No dated events found for “${resolved.title}” between ${formatRange(range.start, range.end)}. Try a wider range.`);
  }

  if (sourceFailures.size) {
    const labels: Record<SourceId, string> = { wikipedia: "Wikipedia", wikidata: "Wikidata", llm: "Model seed events" };
    const names = [...sourceFailures].map((source) => labels[source]).join(", ");
    out.push("notice", { kind: "partial", text: `${names} could not finish collecting. Available events are shown; source coverage is incomplete.` });
  }

  const high = events.filter((e) => e.confidence === "high").length;
  const medium = events.filter((e) => e.confidence === "medium").length;
  tasks.step("dedup", "Records in", String(records));
  tasks.step("dedup", "Merged", String(merges));
  tasks.step("dedup", "Events out", String(events.length));
  tasks.set("dedup", { status: "done", count: merges });
  out.trace({
    source: "dedup",
    kind: "note",
    text: `${records} records became ${events.length} events: ${high} confirmed by three sources, ${medium} by two.`,
  });

  await emitEras(true);
  await out.flush();

  // ── narrative ──
  const writeComposed = async () => {
    const nClaims: NarrativeClaim[] = [];
    for (const { recordId, claim } of claimRecords) {
      const ev = engine.resolve(recordId);
      if (ev) nClaims.push({ year: claim.year, sentence: claim.sentence, eventId: ev.id, weight: claim.weight + ev.sources.length * 2 + Math.log1p(ev.weight) });
    }
    const text = composeNarrative({ lead: summary?.lead ?? "", claims: nClaims, events, range, limit: L.narrative });
    for await (const chunk of scriptedStream(text, { wordsPerSecond: pace ? 42 : 100000, signal })) send("narrative", { delta: chunk, source: "composed" });
  };

  try {
    if (live) {
      const ranked = [...events].sort((a, b) => b.sources.length - a.sources.length || b.weight - a.weight).slice(0, 30).sort((a, b) => a.year - b.year);
      try {
        for await (const delta of llmNarrative(resolved.title, range, ranked, signal)) send("narrative", { delta, source: "model" });
      } catch (err) {
        if (signal.aborted) return;
        send("trace", { source: "llm", kind: "note", text: `Narrative model failed (${errorText(err)}); composing from Wikipedia instead.` });
        send("narrative", { delta: "", replace: true, source: "composed" });
        send("notice", { kind: "fallback", text: "Narrative model failed. The narrative was composed from Wikipedia and the collected events instead." });
        await writeComposed();
      }
    } else {
      await writeComposed();
    }
  } catch (err) {
    if (signal.aborted) return;
    throw err;
  }

  send("trace", {
    source: "dedup",
    kind: "note",
    text: `Done in ${((Date.now() - started) / 1000).toFixed(1)}s: ${events.length} events, ${merges} merges.`,
  });
}

export type { ChronosEvent };
