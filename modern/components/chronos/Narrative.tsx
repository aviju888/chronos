"use client";

import { memo, useMemo, useState } from "react";
import { ArrowUpRight, Check, Copy } from "@phosphor-icons/react";
import type { ChronosEvent, Intent, NarrativeSource } from "@/modern/lib/chronos/types";
import { narrativePlain, parseNarrative } from "@/modern/lib/chronos/cite";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { CONFIDENCE_TONE } from "./sources";
import { Tooltip } from "./Tooltip";

/* ─────────────────────────────────────────────────────────
 * NARRATIVE — Beautiful UI's Streaming Text, forked.
 * Real stream instead of a timer; the last words resolve out
 * of blur (the kit's .stream-tail), citations render inline
 * as year chips that jump to their event card.
 * ───────────────────────────────────────────────────────── */

type Para = ({ kind: "text"; text: string } | { kind: "cite"; id: string })[];

function toParagraphs(text: string): Para[] {
  const paras: Para[] = [[]];
  for (const tok of parseNarrative(text)) {
    if (tok.kind === "cite") {
      paras[paras.length - 1].push(tok);
      continue;
    }
    const chunks = tok.text.split(/\n{2,}/);
    chunks.forEach((chunk, i) => {
      if (i > 0) paras.push([]);
      if (chunk) paras[paras.length - 1].push({ kind: "text", text: chunk });
    });
  }
  return paras.filter((p) => p.length > 0);
}

function CiteChip({ event, onCite, emphasis }: { event: ChronosEvent; onCite: (id: string) => void; emphasis: "in" | "out" | null }) {
  return (
    <Tooltip
      content={
        <span>
          <span className="font-medium">{event.title}</span>
          <span style={{ color: "var(--tooltip-muted)" }}> · show event</span>
        </span>
      }
    >
      <button
        type="button"
        onClick={() => onCite(event.id)}
        className={cn(
          "mx-0.5 inline-flex h-[18px] translate-y-[-1px] items-center gap-1 rounded-[5px] px-1 align-middle font-mono text-[10.5px] hover:text-ink",
          emphasis === "in" ? "bg-accent-tint text-accent-ink shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent)_45%,transparent)]" : "bg-inset text-ink-2 shadow-hairline hover:bg-hover",
          emphasis === "out" && "opacity-40",
        )}
        style={{ animation: "pop-in 250ms cubic-bezier(0.23,1,0.32,1) both" }}
      >
        <span className={cn("size-[5px] rounded-full", CONFIDENCE_TONE[event.confidence])} />
        <span className="num">{formatYear(event.year)}</span>
      </button>
    </Tooltip>
  );
}

function NarrativeImpl({
  text,
  streaming,
  events,
  alias,
  intent,
  source = null,
  onCite,
  emphasis = null,
}: {
  text: string;
  streaming: boolean;
  events: Record<string, ChronosEvent>;
  alias: Record<string, string>;
  intent: Intent | null;
  source?: NarrativeSource | null;
  onCite: (id: string) => void;
  /** events inside the map's area filter; citations to them stand out, others recede */
  emphasis?: Set<string> | null;
}) {
  const [copied, setCopied] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const paras = useMemo(() => toParagraphs(text), [text]);
  const resolve = (id: string) => events[id] ?? events[alias[id] ?? ""];

  const cited = useMemo(() => {
    const seen = new Map<string, ChronosEvent>();
    for (const tok of parseNarrative(text)) {
      if (tok.kind !== "cite") continue;
      const ev = events[tok.id] ?? events[alias[tok.id] ?? ""];
      if (ev && !seen.has(ev.id)) seen.set(ev.id, ev);
    }
    return Array.from(seen.values());
  }, [text, events, alias]);

  if (!text && !streaming) return null;
  const done = !streaming && text.length > 0;
  const lastPara = paras.length - 1;

  return (
    <section aria-label="Narrative" className="w-full">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Narrative</h2>
        <span className="text-[11.5px] text-ink-3">
          {(source ?? (intent?.live ? "model" : "composed")) === "model" ? "Written by the model, cited against the events" : "Composed from the Wikipedia lead and the dated sentences behind the events"}
        </span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,68ch)_minmax(200px,1fr)]">
      <div className="flex min-w-0 flex-col gap-3 text-[13.5px] leading-[1.65] text-ink">
        {paras.map((p, pi) => (
          <p key={pi} className="text-pretty">
            {p.map((tok, ti) => {
              if (tok.kind === "cite") {
                const ev = resolve(tok.id);
                return ev ? <CiteChip key={ti} event={ev} onCite={onCite} emphasis={emphasis ? (emphasis.has(ev.id) ? "in" : "out") : null} /> : null;
              }
              const isTail = streaming && pi === lastPara && ti === p.length - 1;
              if (!isTail) return <span key={ti}>{tok.text}</span>;
              // the last few words resolve out of blur
              const cut = Math.max(0, tok.text.length - 18);
              const at = tok.text.lastIndexOf(" ", cut) + 1;
              return (
                <span key={ti}>
                  {tok.text.slice(0, at)}
                  <span className="stream-tail">{tok.text.slice(at)}</span>
                </span>
              );
            })}
            {streaming && pi === lastPara && <span className="stream-caret is-streaming" aria-hidden />}
          </p>
        ))}
        {streaming && paras.length === 0 && (
          <p>
            <span className="stream-caret" aria-hidden />
          </p>
        )}
      </div>

      {/* large screens: citations gather beside the text as it streams */}
      <aside aria-label="Cited events" className="hidden min-w-0 self-start lg:block">
        <div className="mb-1.5 flex items-center gap-2 px-1.5">
          <span className="text-[12px] font-medium text-ink-2">Cited</span>
          <span className="num text-[11.5px] text-ink-3">{cited.length}</span>
        </div>
        <div className="flex flex-col">
          {cited.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onCite(e.id)}
              className={cn(
                "flex items-center gap-2 rounded-[7px] px-1.5 py-1 text-left text-[12px] text-ink-2 hover:bg-hover hover:text-ink",
                emphasis && !emphasis.has(e.id) && "opacity-40",
              )}
              style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}
            >
              <span className={cn("size-[6px] shrink-0 rounded-full", CONFIDENCE_TONE[e.confidence])} />
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="num shrink-0 font-mono text-[10.5px] text-ink-3">{formatYear(e.year)}</span>
            </button>
          ))}
          {cited.length === 0 && <span className="px-1.5 text-[12px] text-ink-3">Citations appear here as the text streams.</span>}
        </div>
        {intent?.article && done && (
          <a
            href={intent.article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-1 px-1.5 text-[11.5px] text-ink-3 hover:text-ink"
          >
            Lead from Wikipedia: {intent.article.title}
            <ArrowUpRight size={10} weight="bold" />
          </a>
        )}
      </aside>
      </div>

      <div className="mt-2 flex items-center gap-0.5 transition-opacity duration-300" style={{ opacity: done ? 1 : 0, pointerEvents: done ? "auto" : "none" }}>
        <Tooltip content={copied ? "Copied" : "Copy text"}>
          <button
            type="button"
            aria-label="Copy narrative"
            onClick={() => {
              navigator.clipboard?.writeText(narrativePlain(text)).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                },
                () => undefined,
              );
            }}
            className="flex size-6 items-center justify-center rounded-[6px] text-ink-3 hover:bg-hover-2 hover:text-ink-2"
          >
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
          </button>
        </Tooltip>
        {cited.length > 0 && (
          <button
            type="button"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((o) => !o)}
            className="ml-1.5 flex items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left hover:bg-hover lg:pointer-events-none"
          >
            <span className="flex -space-x-1">
              {cited.slice(0, 4).map((e) =>
                e.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={e.id} src={e.thumbnail.url} alt="" className="source-avatar size-3.5 rounded-full bg-surface object-cover shadow-[0_0_0_1.5px_var(--canvas)]" />
                ) : (
                  <span key={e.id} className={cn("size-3.5 rounded-full shadow-[0_0_0_1.5px_var(--canvas)]", CONFIDENCE_TONE[e.confidence])} />
                ),
              )}
            </span>
            <span className="text-[12px] text-ink-2">
              {cited.length} cited {cited.length === 1 ? "event" : "events"}
            </span>
          </button>
        )}
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 lg:hidden"
        style={{ gridTemplateRows: done && sourcesOpen ? "1fr" : "0fr", opacity: done && sourcesOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
      >
        <div className="overflow-hidden">
          <div className="mt-1.5 flex max-w-[68ch] flex-col rounded-[10px] bg-inset p-1 shadow-hairline">
            {intent?.article && (
              <a
                href={intent.article.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12px] text-ink-2 hover:bg-hover hover:text-ink"
              >
                <span className="animated-underline">{intent.article.title}</span>
                <span className="ml-auto font-mono text-[10.5px] text-ink-3">lead · wikipedia</span>
                <ArrowUpRight size={11} weight="bold" className="text-ink-3" />
              </a>
            )}
            {cited.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onCite(e.id)}
                className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-left text-[12px] text-ink-2 hover:bg-hover hover:text-ink"
              >
                <span className={cn("size-[6px] shrink-0 rounded-full", CONFIDENCE_TONE[e.confidence])} />
                <span className="truncate">{e.title}</span>
                <span className="num ml-auto shrink-0 font-mono text-[10.5px] text-ink-3">{formatYear(e.year)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** memoized: playback re-renders the page every frame, this doesn't depend on the cursor */
export const Narrative = memo(NarrativeImpl);
