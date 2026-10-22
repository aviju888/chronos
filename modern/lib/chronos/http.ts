/* ─────────────────────────────────────────────────────────
 * HTTP — a polite client for Wikimedia APIs.
 *
 *  - descriptive User-Agent on every request
 *  - per-host concurrency caps (Wikipedia 4, SPARQL 2)
 *  - in-memory cache (1h) kept on globalThis so dev reloads
 *    don't re-hit the APIs, plus in-flight de-duplication
 *  - one retry on 429/503 honouring Retry-After (≤ 4s)
 *  - per-request timeout; cancellation aborts upstream work
 *    once every waiting run disconnects
 * ───────────────────────────────────────────────────────── */

import { sleep as wait } from "../scripted.js";

export const USER_AGENT = "Chronos/1.0 (historical timeline; https://chronos-history.vercel.app)";

export type Lane = "wikipedia" | "sparql" | "wikidata";

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

type Pending = { promise: Promise<unknown>; abort: AbortController; waiters: number };

type Store = {
  cache: Map<string, { at: number; value: unknown }>;
  inflight: Map<string, Pending>;
  stats: { requests: number; cacheHits: number };
};

const g = globalThis as unknown as { __chronosHttp?: Store };
const store: Store = (g.__chronosHttp ??= { cache: new Map(), inflight: new Map(), stats: { requests: 0, cacheHits: 0 } });

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 600;

class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const limiters: Record<Lane, Limiter> = {
  wikipedia: new Limiter(4),
  sparql: new Limiter(2),
  wikidata: new Limiter(2),
};

type Fetcher = typeof fetch;
let fetcher: Fetcher = (input, init) => fetch(input, init);

/** test seam: swap the network for a stub */
export function setFetcher(f: Fetcher | null): void {
  fetcher = f ?? ((input, init) => fetch(input, init));
}

export function clearHttpCache(): void {
  store.cache.clear();
  store.inflight.clear();
}

export function httpStats() {
  return { ...store.stats, cached: store.cache.size };
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

async function attempt(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    store.stats.requests++;
    return await fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function load<T>(url: string, init: RequestInit, lane: Lane, timeoutMs: number): Promise<T> {
  return limiters[lane].run(async () => {
    init.signal?.throwIfAborted();
    let res: Response;
    try {
      res = await attempt(url, init, timeoutMs);
    } catch (err) {
      init.signal?.throwIfAborted();
      // one retry on network failure / timeout; disconnects never retry
      await wait(600, init.signal);
      try {
        res = await attempt(url, init, timeoutMs);
      } catch {
        init.signal?.throwIfAborted();
        const reason = err instanceof Error && err.name === "AbortError" ? `timed out after ${timeoutMs / 1000}s` : "network error";
        throw new HttpError(reason, 0, url);
      }
    }
    if (res.status === 429 || res.status === 503) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
      if (delay <= 4000) {
        await wait(delay, init.signal);
        res = await attempt(url, init, timeoutMs);
      }
    }
    if (!res.ok) {
      const label = res.status === 429 ? "rate limited" : `HTTP ${res.status}`;
      throw new HttpError(label, res.status, url);
    }
    return (await res.json()) as T;
  });
}

export async function getJSON<T>(
  url: string,
  {
    lane,
    signal,
    timeoutMs = 12000,
    method = "GET",
    body,
    accept = "application/json",
  }: { lane: Lane; signal?: AbortSignal; timeoutMs?: number; method?: "GET" | "POST"; body?: string; accept?: string },
): Promise<T> {
  signal?.throwIfAborted();
  const key = `${method} ${url} ${body ?? ""}`;
  const hit = store.cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    store.stats.cacheHits++;
    return hit.value as T;
  }

  let pending = store.inflight.get(key);
  if (!pending || pending.abort.signal.aborted) {
    const abort = new AbortController();
    pending = { abort, waiters: 0, promise: Promise.resolve() };
    const entry = pending;
    const init: RequestInit = {
      method,
      headers: {
        "User-Agent": USER_AGENT,
        "Api-User-Agent": USER_AGENT,
        Accept: accept,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
      signal: abort.signal,
    };
    pending.promise = load<T>(url, init, lane, timeoutMs)
      .then((value) => {
        store.cache.set(key, { at: Date.now(), value });
        if (store.cache.size > MAX_ENTRIES) {
          const oldest = store.cache.keys().next().value;
          if (oldest !== undefined) store.cache.delete(oldest);
        }
        return value;
      })
      .finally(() => { if (store.inflight.get(key) === entry) store.inflight.delete(key); });
    store.inflight.set(key, pending);
  }
  const entry = pending;
  entry.waiters++;
  try { return await raceAbort(entry.promise as Promise<T>, signal); }
  finally {
    if (--entry.waiters === 0) {
      entry.abort.abort();
      if (store.inflight.get(key) === entry) store.inflight.delete(key);
    }
  }
}

/** Run async work over items with a concurrency cap (results keep input order). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
