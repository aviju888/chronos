/* ─────────────────────────────────────────────────────────
 * NARRATIVE — prose with citations that point at events.
 *
 * Citations travel inside the text as [[cite:<eventId>]] so
 * they stream like words. Demo mode composes the narrative
 * from real fetched text: the topic's Wikipedia lead, then
 * the dated sentences behind the strongest events, each
 * followed by a citation. Live mode asks the model to cite
 * a numbered event list and rewrites [3] → [[cite:id]] on
 * the fly, even when a marker is split across chunks.
 * ───────────────────────────────────────────────────────── */

import type { ChronosEvent, YearRange } from "./types.js";
import { splitSentences } from "./text.js";
import { spreadPick } from "./wikipedia.js";

export { citeMarker, parseNarrative, narrativePlain, type NarrativeToken } from "./cite.js";
import { citeMarker } from "./cite.js";

/**
 * Streaming rewrite of numbered citations: "…in 31 BC [3]." → "…in 31 BC [[cite:wd:Q1]]."
 * Holds back an unfinished "[1" until it can tell what it is.
 */
export class CiteRewriter {
  private buffer = "";
  constructor(private idFor: (n: number) => string | undefined) {}

  push(delta: string): string {
    this.buffer += delta;
    let cut = this.buffer.lastIndexOf("[");
    let ready = this.buffer;
    if (cut >= 0 && !this.buffer.slice(cut).includes("]") && this.buffer.length - cut < 12) {
      // keep the space before a pending "[" too, so a citation sits flush against its sentence
      while (cut > 0 && /\s/.test(this.buffer[cut - 1])) cut--;
      ready = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
    } else {
      this.buffer = "";
    }
    return this.rewrite(ready);
  }

  flush(): string {
    const rest = this.rewrite(this.buffer);
    this.buffer = "";
    return rest;
  }

  private rewrite(text: string): string {
    return text.replace(/\s*\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g, (match, nums: string) => {
      const ids = nums
        .split(",")
        .map((n) => this.idFor(Number(n.trim())))
        .filter((x): x is string => Boolean(x));
      return ids.length ? ids.map(citeMarker).join("") : "";
    });
  }
}

const CONNECTIVE = /^(?:additionally|however|also|meanwhile|then|finally|in addition|moreover|furthermore|subsequently|thereafter|thus|consequently|nevertheless|still|later),\s+/i;
const META = /\b(?:the history of the|this article|see also|is covered in)\b/i;

/** "Additionally, in 251…" → "In 251…" */
function stripConnective(sentence: string): string {
  const s = sentence.replace(CONNECTIVE, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** sentences that lean on the previous one ("His edict…", "This led…") read badly out of context */
function dangling(sentence: string): boolean {
  return /^(?:he|she|it|they|his|her|its|their|this|these|those|that|such|there)\b/i.test(sentence.replace(CONNECTIVE, ""));
}

export type NarrativeClaim = { year: number; sentence: string; eventId: string; weight: number };

/**
 * Demo narrative: the article's lead, then dated sentences spread across the
 * range (each citing the event it produced), topped up with event summaries
 * when the prose has few dated sentences.
 */
export function composeNarrative({
  lead,
  claims,
  events,
  range,
  limit = 7,
}: {
  lead: string;
  claims: NarrativeClaim[];
  events: ChronosEvent[];
  range: YearRange;
  limit?: number;
}): string {
  const leadPart = splitSentences(lead).slice(0, 2).join(" ");

  const seenEvents = new Set<string>();
  const usable = claims
    .map((c) => ({ ...c, sentence: stripConnective(c.sentence), weight: c.weight - (dangling(c.sentence) ? 4 : 0) }))
    .filter((c) => {
      if (seenEvents.has(c.eventId) || c.sentence.length > 320 || META.test(c.sentence)) return false;
      seenEvents.add(c.eventId);
      return true;
    });
  let picks = spreadPick(usable, limit, range, Math.min(limit, 7));

  if (picks.length < Math.min(4, limit)) {
    const extra = [...events]
      .filter((e) => !seenEvents.has(e.id) && e.summary && e.confidence !== "inferred")
      .sort((a, b) => b.weight + b.sources.length * 20 - (a.weight + a.sources.length * 20))
      .slice(0, limit - picks.length)
      .map((e) => ({ year: e.year, sentence: splitSentences(e.summary)[0] ?? e.summary, eventId: e.id, weight: e.weight }));
    picks = [...picks, ...extra].sort((a, b) => a.year - b.year);
  }

  const body = picks.map((p) => {
    const s = p.sentence.trim();
    const end = /[.!?]["”’)]?$/.test(s) ? s : `${s}.`;
    return `${end}${citeMarker(p.eventId)}`;
  });
  const half = Math.ceil(body.length / 2);
  const paragraphs = [leadPart, body.slice(0, half).join(" "), body.slice(half).join(" ")].filter(Boolean);
  return paragraphs.join("\n\n");
}
