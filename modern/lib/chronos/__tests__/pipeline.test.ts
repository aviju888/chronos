// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runChronos } from "../pipeline";
import { clearHttpCache, setFetcher } from "../http";
import { findFixture, FIXTURES } from "../fixtures";
import { parseNarrative } from "../cite";
import type { ChronosEvent, MergeInfo } from "../types";

type Frame = { event: string; data: unknown };

async function collect(query: string, opts: Parameters<typeof runChronos>[3] = {}) {
  const frames: Frame[] = [];
  const controller = new AbortController();
  await runChronos({ query, mode: "quick" }, (event, data) => frames.push({ event, data }), controller.signal, {
    live: false,
    pace: false,
    now: 2026,
    ...opts,
  });
  return frames;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

/* A tiny fake Wikipedia + Wikidata: one topic, a history section with three linked events. */
const HISTORY_HTML = `<div class="mw-parser-output">
<div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
<p>In 31 BC Octavian won the <a href="/wiki/Battle_of_Actium" title="Battle of Actium">Battle of Actium</a> at sea. In AD 9 three legions were lost at the <a href="/wiki/Battle_of_the_Teutoburg_Forest" title="Battle of the Teutoburg Forest">Battle of the Teutoburg Forest</a> in Germania.</p>
<p>The <a href="/wiki/Great_Fire_of_Rome" title="Great Fire of Rome">Great Fire of Rome</a> burned the city in 64 while Nero was away at <a href="/wiki/Antium" title="Antium">Antium</a>.</p>
</div>`;

const PAGES: Record<string, { qid: string; description: string; extract: string; coords?: [number, number] }> = {
  "Battle of Actium": { qid: "Q160387", description: "Naval battle (31 BC)", extract: "The Battle of Actium was a naval battle fought on 2 September 31 BC.", coords: [38.9, 20.7] },
  "Battle of the Teutoburg Forest": { qid: "Q87779", description: "Battle in AD 9", extract: "The Battle of the Teutoburg Forest was fought in AD 9 in Germania.", coords: [52.4, 8.1] },
  "Great Fire of Rome": { qid: "Q215231", description: "Urban fire in 64 AD", extract: "The Great Fire of Rome began on 18 July 64 AD.", coords: [41.9, 12.5] },
  Antium: { qid: "Q1000", description: "Ancient city in Italy", extract: "Antium was an ancient coastal town.", coords: [41.45, 12.62] },
};

function fakeNetwork(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url);
  if (u.hostname === "query.wikidata.org") {
    const q = decodeURIComponent(String(init?.body ?? "").replace(/^query=/, ""));
    if (q.includes("VALUES ?item { wd:Q2277 }")) {
      return json({ results: { bindings: [{ itemLabel: { value: "Roman Empire" }, itemDescription: { value: "state" }, sl: { value: "200" }, startTime: { value: "-0026-01-01T00:00:00Z" }, endTime: { value: "0476-01-01T00:00:00Z" }, types: { value: "historical country" } }] } });
    }
    if (q.includes("wdt:P710 wd:Q2277")) {
      // the linked-events query: Wikidata knows Actium and a period
      return json({
        results: {
          bindings: [
            { item: { value: "http://www.wikidata.org/entity/Q87779" }, itemLabel: { value: "Battle of the Teutoburg Forest" }, itemDescription: { value: "AD 9 battle" }, date: { value: "0009-09-09T00:00:00Z" }, prec: { value: "11" }, sl: { value: "80" }, types: { value: "battle" }, c: { value: "Point(8.1 52.4)" }, wp: { value: "Battle of the Teutoburg Forest" } },
            { item: { value: "http://www.wikidata.org/entity/Q5" }, itemLabel: { value: "Principate" }, itemDescription: { value: "period" }, date: { value: "-0026-01-01T00:00:00Z" }, prec: { value: "9" }, sl: { value: "52" }, types: { value: "historical period" }, end: { value: "0284-01-01T00:00:00Z" } },
          ],
        },
      });
    }
    // cross-check: dates for whatever Wikipedia linked
    const ids = Array.from(q.matchAll(/wd:(Q\d+)/g)).map((m) => m[1]);
    const bindings = [];
    if (ids.includes("Q215231")) {
      bindings.push({ item: { value: "http://www.wikidata.org/entity/Q215231" }, itemLabel: { value: "Great Fire of Rome" }, itemDescription: { value: "fire in 64" }, sl: { value: "60" }, pointInTime: { value: "0064-07-18T00:00:00Z" }, pointPrec: { value: "11" }, types: { value: "conflagration|fire" }, wp: { value: "Great Fire of Rome" } });
    }
    return json({ results: { bindings } });
  }

  if (u.pathname.startsWith("/api/rest_v1/page/summary/")) {
    return json({ title: "Roman Empire", description: "27 BC–476 AD state", wikibase_item: "Q2277", extract: "The Roman Empire was a state. It ruled the Mediterranean.", content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Roman_Empire" } } });
  }

  const p = u.searchParams;
  if (p.get("action") === "parse" && p.get("prop") === "sections") {
    const page = p.get("page");
    if (page === "Roman Empire") return json({ parse: { sections: [{ index: "1", line: "History", toclevel: 1, anchor: "History" }] } });
    return json({ error: { code: "missingtitle" } });
  }
  if (p.get("action") === "parse") return json({ parse: { text: HISTORY_HTML } });

  if (p.get("action") === "query") {
    const titles = (p.get("titles") ?? "").split("|").filter(Boolean);
    if (titles.length === 1 && titles[0] === "Roman Empire") {
      return json({ query: { pages: [{ title: "Roman Empire", pageprops: { wikibase_item: "Q2277" }, description: "27 BC–476 AD state" }] } });
    }
    if (titles.length === 1 && /^History of/.test(titles[0])) return json({ query: { pages: [{ title: titles[0], missing: true }] } });
    const pages = titles.map((t) => {
      const info = PAGES[t];
      if (!info) return { title: t, missing: true };
      return {
        title: t,
        pageprops: { wikibase_item: info.qid },
        description: info.description,
        extract: info.extract,
        coordinates: info.coords ? [{ lat: info.coords[0], lon: info.coords[1] }] : undefined,
      };
    });
    return json({ query: { pages } });
  }
  return json({}, 404);
}

describe("runChronos on a fake network", () => {
  beforeEach(() => {
    clearHttpCache();
    setFetcher(((input: RequestInfo | URL, init?: RequestInit) => fakeNetwork(String(input), init)) as typeof fetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setFetcher(null);
    clearHttpCache();
  });

  it("streams intent, tasks, the SPARQL trace, events, merges, eras and a cited narrative", async () => {
    const frames = await collect("Roman Empire 27 BCE - 476 CE", { fixtureFallback: false });
    const names = frames.map((f) => f.event);
    expect(names[0]).toBe("task");
    expect(names).toContain("intent");
    expect(names.indexOf("intent")).toBeLessThan(names.indexOf("event"));
    expect(names).toContain("eras");
    expect(names[names.length - 1]).toBe("trace");

    const intent = frames.find((f) => f.event === "intent")!.data as { topic: string; range: { start: number; end: number }; rangeFrom: string };
    expect(intent).toMatchObject({ topic: "Roman Empire", range: { start: -27, end: 476 }, rangeFrom: "query" });

    const sparql = frames.filter((f) => f.event === "trace" && (f.data as { kind: string }).kind === "query");
    expect(sparql.length).toBeGreaterThanOrEqual(1);
    expect((sparql[0].data as { text: string }).text).toContain("wdt:P710 wd:Q2277");

    // final state of every event
    const events = new Map<string, ChronosEvent>();
    for (const f of frames) {
      if (f.event === "event") events.set((f.data as { event: ChronosEvent }).event.id, (f.data as { event: ChronosEvent }).event);
      if (f.event === "merge") events.set((f.data as MergeInfo).keptId, (f.data as MergeInfo).event);
    }
    const byTitle = (t: string) => [...events.values()].find((e) => e.title === t)!;
    // model (prose) + Wikidata (linked) + Wikipedia (article) all agree on Teutoburg
    expect(byTitle("Battle of the Teutoburg Forest")).toMatchObject({ year: 9, confidence: "high", sources: ["llm", "wikidata", "wikipedia"] });
    expect(byTitle("Battle of the Teutoburg Forest").mergedFrom).toHaveLength(3);
    // Wikidata only learned about the fire through the cross-check
    expect(byTitle("Great Fire of Rome").sources).toEqual(["llm", "wikidata", "wikipedia"]);
    // Actium is before 27 BCE: out of range everywhere
    expect([...events.values()].some((e) => e.title === "Battle of Actium")).toBe(false);
    // Antium is a place, not an event
    expect([...events.values()].some((e) => e.title === "Antium")).toBe(false);

    const merges = frames.filter((f) => f.event === "merge").map((f) => f.data as MergeInfo);
    expect(merges.length).toBeGreaterThanOrEqual(4);
    expect(merges.every((m) => m.incoming.length === 1 && m.event.sources.length >= 2)).toBe(true);

    const eras = frames.filter((f) => f.event === "eras").pop()!.data as { eras: { title: string }[] };
    expect(eras.eras.map((e) => e.title)).toContain("Principate");

    const narrative = frames.filter((f) => f.event === "narrative").map((f) => (f.data as { delta: string }).delta).join("");
    expect(narrative.startsWith("The Roman Empire was a state.")).toBe(true);
    const cites = parseNarrative(narrative).filter((t) => t.kind === "cite");
    expect(cites.length).toBeGreaterThanOrEqual(2);
    for (const c of cites) {
      const id = (c as { id: string }).id;
      expect([...events.values()].some((e) => e.id === id || e.mergedFrom.includes(id))).toBe(true);
    }

    const tasks = frames.filter((f) => f.event === "task").map((f) => f.data as { id: string; status: string; count?: number });
    const last = (id: string) => tasks.filter((t) => t.id === id).pop()!;
    expect(last("wikidata").status).toBe("done");
    expect(last("wikipedia").status).toBe("done");
    expect(last("dedup")).toMatchObject({ status: "done" });
    expect(last("dedup").count).toBe(merges.length);
  });

  it.each([
    ['provider error', 'data: {"error":{"message":"provider stream failed","type":"server_error"}}\n\ndata: [DONE]\n\n', 'provider stream failed'],
    ['premature EOF', '', 'Groq stream ended before [DONE]'],
  ])('provider stream failure: %s reaches the honest narrative fallback', async (_name, tail, detail) => {
    vi.stubEnv('GROQ_API_KEY', 'test-only-placeholder');
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (!request.stream) return Response.json({ choices: [{ message: { content: '{}' } }] });
      return new Response('data: {"choices":[{"delta":{"content":"Partial model prose. "}}]}\n\n' + tail);
    }));
    const frames = await collect('Roman Empire 27 BCE - 476 CE', { live: true, fixtureFallback: false });
    const fallback = frames.findIndex(f => f.event === 'trace' && String((f.data as { text?: string }).text).includes('Narrative model failed'));
    expect(fallback).toBeGreaterThan(-1);
    expect((frames[fallback].data as { text: string }).text).toContain(detail);
    expect((frames[fallback].data as { text: string }).text).toContain('composing from Wikipedia instead');
    const narrativeAfterFailure = frames.slice(fallback + 1).filter(f => f.event === 'narrative').map(f => (f.data as { delta: string }).delta).join('');
    expect(narrativeAfterFailure).toContain('The Roman Empire was a state.');
    expect(frames.at(-1)?.event).toBe('trace');
    expect((frames.at(-1)?.data as { text: string }).text).toMatch(/^Done in/);
  });

  it('provider stream failure: request abort suppresses fallback and successful completion', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-only-placeholder');
    const abort = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      if (!request.stream) return Response.json({ choices: [{ message: { content: '{}' } }] });
      return new Response(new ReadableStream({
        start(controller) {
          setTimeout(() => { abort.abort(); controller.error(new DOMException('Aborted', 'AbortError')); }, 0);
        },
      }));
    }));
    const frames: Frame[] = [];
    await runChronos({ query: 'Roman Empire 27 BCE - 476 CE', mode: 'quick' }, (event, data) => frames.push({ event, data }), abort.signal, { live: true, pace: false, fixtureFallback: false });
    expect(abort.signal.aborted).toBe(true);
    expect(frames.some(f => f.event === 'narrative')).toBe(false);
    const traces = frames.filter(f => f.event === 'trace').map(f => (f.data as { text: string }).text);
    expect(traces.some(text => text.includes('Narrative model failed') || text.startsWith('Done in'))).toBe(false);
  });

  it("explains a missing topic", async () => {
    setFetcher(((input: RequestInfo | URL) => {
      const u = new URL(String(input));
      if (u.searchParams.get("list") === "search") return json({ query: { search: [] } });
      return json({ query: { pages: [{ title: "Xyzzy", missing: true }] } });
    }) as typeof fetch);
    await expect(collect("Xyzzy", { fixtureFallback: false })).rejects.toThrow(/No Wikipedia article matches/);
  });
});

describe("degrading to fixtures", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setFetcher(null);
    clearHttpCache();
  });

  it("has a recording for every suggestion chip", () => {
    expect(FIXTURES).toHaveLength(3);
    for (const q of ["Roman Empire 27 BCE - 476 CE", "Silk Road", "History of Berkeley, California"]) expect(findFixture(q)?.query).toBe(q);
    // matches by topic, too
    expect(findFixture("roman empire")?.query).toBe("Roman Empire 27 BCE - 476 CE");
    expect(findFixture("Berkeley, California")?.query).toBe("History of Berkeley, California");
    expect(findFixture("Ottoman Empire")).toBeNull();
  });

  it("replays the saved run when the network is down", async () => {
    clearHttpCache();
    setFetcher((() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch);
    const frames = await collect("Silk Road", { pace: false });
    const notice = frames.find((f) => f.event === "notice")!.data as { kind: string; text: string };
    expect(notice.kind).toBe("fallback");
    expect(notice.text).toMatch(/unreachable/);
    expect(frames.filter((f) => f.event === "event").length).toBeGreaterThan(10);
    expect(frames.some((f) => f.event === "narrative")).toBe(true);
  });

  it("fails with a clear message when there's no saved run", async () => {
    clearHttpCache();
    setFetcher((() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch);
    await expect(collect("Ottoman Empire")).rejects.toThrow(/Couldn't reach Wikipedia/);
  });
});
