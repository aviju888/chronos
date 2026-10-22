"use client";

import { Barcode, GitMerge, Sparkle } from "@phosphor-icons/react";
import { SOURCE_ORDER, type ChronosEvent, type Confidence, type SourceId } from "@/modern/lib/chronos/types";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "./Tooltip";

/* ─────────────────────────────────────────────────────────
 * SOURCES — glyphs and the Source Agreement dots.
 *
 *   ● ● ●   model · Wikidata · Wikipedia, always in that order
 *   filled  that source independently gave this event
 *   tone    green = all three agree, accent = two, ink = one
 *   hollow  that source didn't mention it
 * ───────────────────────────────────────────────────────── */

export const SOURCE_NAME: Record<SourceId, string> = {
  llm: "Model",
  wikidata: "Wikidata",
  wikipedia: "Wikipedia",
};

export function SourceGlyph({ source, size = 13, className }: { source: SourceId | "dedup"; size?: number; className?: string }) {
  if (source === "llm") return <Sparkle size={size} weight="fill" className={className} aria-hidden />;
  if (source === "wikidata") return <Barcode size={size} weight="bold" className={className} aria-hidden />;
  if (source === "dedup") return <GitMerge size={size} weight="bold" className={className} aria-hidden />;
  // no Wikipedia mark in Phosphor: a serif W in the same box
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center justify-center font-serif leading-none font-semibold", className)}
      style={{ width: size, height: size, fontSize: size * 0.92, fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      W
    </span>
  );
}

/** "Wikidata Q123" → "Q123", "Wikipedia: Battle of X" → "Battle of X" (the source name is shown beside it) */
export function shortLabel(label: string): string {
  return label.replace(/^(?:Wikidata|Wikipedia:?|Model:?)\s+/, "");
}

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: "bg-green",
  medium: "bg-accent",
  low: "bg-ink-2",
  inferred: "bg-ink-3",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "All three sources agree",
  medium: "Two sources agree",
  low: "One source",
  inferred: "Inferred: only the model says this",
};

export function SourceDotsRow({ event, size = 7, animateKey }: { event: Pick<ChronosEvent, "sources" | "confidence">; size?: number; animateKey?: string }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${CONFIDENCE_LABEL[event.confidence]}: ${event.sources.map((s) => SOURCE_NAME[s]).join(", ")}`}>
      {SOURCE_ORDER.map((s) => {
        const filled = event.sources.includes(s);
        return (
          <span key={s} className="relative inline-flex" style={{ width: size, height: size }}>
            {filled ? (
              <>
                <span
                  key={`${animateKey ?? ""}-${s}-on`}
                  className={cn("absolute inset-0 rounded-full", CONFIDENCE_TONE[event.confidence], animateKey && "chronos-dot-pop")}
                />
                {animateKey && <span key={`${animateKey}-${s}-ring`} className={cn("chronos-dot-ring absolute inset-0 rounded-full", CONFIDENCE_TONE[event.confidence])} />}
              </>
            ) : (
              <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1.25px_var(--line-strong)]" />
            )}
          </span>
        );
      })}
    </span>
  );
}

/** What each source said, for the dots' tooltip */
export function SourceList({ event, live }: { event: ChronosEvent; live: boolean | null }) {
  return (
    <div className="flex flex-col gap-1.5 py-0.5">
      <div className="font-medium">{CONFIDENCE_LABEL[event.confidence]}</div>
      {SOURCE_ORDER.map((s) => {
        const cites = event.citations.filter((c) => c.source === s);
        const has = event.sources.includes(s);
        return (
          <div key={s} className="flex items-start gap-1.5" style={{ color: has ? "var(--tooltip-fg)" : "var(--tooltip-muted)" }}>
            <SourceGlyph source={s} size={12} className="mt-[1px] shrink-0" />
            <div className="min-w-0">
              <span className="font-medium">{s === "llm" && live === false ? "Model (scripted)" : SOURCE_NAME[s]}</span>
              {has ? (
                cites.slice(0, 2).map((c) => (
                  <div key={c.label} className="break-words" style={{ color: "var(--tooltip-muted)" }}>
                    {shortLabel(c.label)}
                    {c.detail ? `, ${c.detail}` : ""}
                  </div>
                ))
              ) : (
                <span style={{ color: "var(--tooltip-muted)" }}> did not list it</span>
              )}
            </div>
          </div>
        );
      })}
      {event.yearConflicts?.length ? (
        <div style={{ color: "var(--tooltip-muted)" }}>
          Also dated {event.yearConflicts.map((c) => `${formatYear(c.year)} by ${SOURCE_NAME[c.source]}`).join(", ")}
        </div>
      ) : null}
    </div>
  );
}

export function SourceDots({ event, live, animateKey, size }: { event: ChronosEvent; live: boolean | null; animateKey?: string; size?: number }) {
  return (
    <Tooltip content={<SourceList event={event} live={live} />} wide>
      <span tabIndex={0} className="hit-area inline-flex rounded-[4px] outline-offset-4">
        <SourceDotsRow event={event} animateKey={animateKey} size={size} />
      </span>
    </Tooltip>
  );
}
