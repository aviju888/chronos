/* ─────────────────────────────────────────────────────────
 * FIXTURES — saved pipeline runs for instant replay.
 *
 * Recorded from real Wikidata/Wikipedia responses with
 * lib/chronos/scripts/record-fixtures.mjs. The suggestion
 * chips replay them (same SSE frames, compressed timing) and
 * the pipeline falls back to them when the network fails.
 * ───────────────────────────────────────────────────────── */

import type { SSESend } from "../sse.js";
import { sleep } from "../scripted.js";
import type { Fixture } from "./types.js";
import { parseQuery } from "./query.js";
import { normalizeString, titleKey } from "./text.js";
import roman from "./fixtures/roman-empire.json" with { type: "json" };
import silk from "./fixtures/silk-road.json" with { type: "json" };
import berkeley from "./fixtures/berkeley.json" with { type: "json" };

export const FIXTURES: Fixture[] = ([roman, silk, berkeley] as unknown as Fixture[]).filter((f) => f.frames?.length);

export { EXAMPLE_QUERIES } from "./examples.js";

function intentTopic(fx: Fixture): string | undefined {
  const frame = fx.frames.find((f) => f.event === "intent");
  return (frame?.data as { topic?: string } | undefined)?.topic;
}

/** A saved run for this query: same query text, same parsed topic, or same resolved article. */
export function findFixture(query: string, fixtures: Fixture[] = FIXTURES): Fixture | null {
  const q = normalizeString(query);
  const topic = titleKey(parseQuery(query).topic);
  if (!q) return null;
  // A recording must contain both an intent and usable timeline content.
  // Empty/diagnostic-only recordings must never authorize live work.
  const usable = fixtures.filter((f) => Array.isArray(f.frames) &&
    f.frames.some((frame) => frame.event === "intent" && Boolean((frame.data as { topic?: string } | null)?.topic)) &&
    f.frames.some((frame) => {
      const event = (frame.data as { event?: { id?: string; title?: string; year?: number } } | null)?.event;
      return frame.event === "event" && event?.id && event.title && Number.isFinite(event.year);
    }));
  return (
    usable.find((f) => normalizeString(f.query) === q) ??
    usable.find((f) => titleKey(parseQuery(f.query).topic) === topic) ??
    usable.find((f) => {
      const t = intentTopic(f);
      return t ? titleKey(t) === topic : false;
    }) ??
    null
  );
}

/**
 * Replay a fixture: structural frames are squeezed into ~2.4s (keeping their
 * order and relative rhythm), then the narrative streams at a fast reading pace.
 */
export async function replayFixture(
  fx: Fixture,
  send: SSESend,
  signal: AbortSignal,
  { notice = true, targetMs = 3200, pace = true }: { notice?: boolean; targetMs?: number; pace?: boolean } = {},
): Promise<void> {
  if (signal.aborted) return;
  if (notice) {
    const when = fx.recordedAt ? new Date(fx.recordedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "earlier";
    send("notice", { kind: "replay", text: `Replaying a saved run from ${when}. Type your own query for a live one.` });
  }
  const structural = fx.frames.filter((f) => f.event !== "narrative" && f.event !== "done");
  const narrative = fx.frames.filter((f) => f.event === "narrative");
  const total = Math.max(1, structural[structural.length - 1]?.t ?? 1);
  const scale = Math.min(1, targetMs / total);

  // schedule against a clock so many tiny gaps add up instead of being dropped
  const t0 = Date.now();
  for (const f of structural) {
    if (signal.aborted) return;
    const ahead = f.t * scale - (Date.now() - t0);
    if (pace && ahead > 4) await sleep(ahead, signal).catch(() => undefined);
    if (signal.aborted) return;
    send(f.event, f.data);
  }
  for (const f of narrative) {
    if (signal.aborted) return;
    if (pace) await sleep(10, signal).catch(() => undefined);
    if (signal.aborted) return;
    send(f.event, f.data);
  }
}
