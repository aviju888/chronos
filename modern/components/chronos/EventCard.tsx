"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ChronosEvent, MergeIncoming } from "@/modern/lib/chronos/types";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { SOURCE_NAME, SourceDots, SourceGlyph } from "./sources";
import { CategoryGlyph } from "./CategoryGlyph";

/* ─────────────────────────────────────────────────────────
 * EVENT CARD — one event, with its Source Agreement dots.
 *
 * MERGE MOMENT: when another source confirms an event, a
 * ghost card for that source drops out from behind this one,
 * shows who it came from, then folds back in (~550ms). The
 * card gives a small beat and the new source dot pops.
 * Inferred events (model only) get a dashed outline.
 * ───────────────────────────────────────────────────────── */

const EASE = [0.23, 1, 0.32, 1] as const;

type Ghost = MergeIncoming & { key: string };

/**
 * Bring a card into view inside the event list's own scroller. Only falls back
 * to scrolling the page when asked (citation clicks on phones, where the list
 * doesn't scroll on its own); playback never moves the page.
 */
function reveal(el: HTMLElement, block: "center" | "nearest", smooth: boolean, allowWindow: boolean) {
  const scroller = el.closest(".scroll-fade") as HTMLElement | null;
  if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
    const er = el.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    let delta = 0;
    if (block === "center") delta = er.top + er.height / 2 - (sr.top + sr.height / 2);
    else if (er.top < sr.top + 12) delta = er.top - sr.top - 12;
    else if (er.bottom > sr.bottom - 12) delta = er.bottom - sr.bottom + 12;
    if (Math.abs(delta) > 1) scroller.scrollBy({ top: delta, behavior: smooth ? "smooth" : "auto" });
    return;
  }
  if (allowWindow) el.scrollIntoView({ block, behavior: smooth ? "smooth" : "auto" });
}

export type EventCardProps = {
  event: ChronosEvent;
  live: boolean | null;
  /** playback: false while the cursor hasn't reached this event */
  lit: boolean;
  /** playback: the event the cursor passed most recently */
  current: boolean;
  selected: boolean;
  /** changes whenever a citation points here, to replay the flash */
  flashKey?: number;
  /** the latest merge into this event, if it just happened */
  merge?: { key: string; incoming: MergeIncoming[] };
  /** highlighted from the map (a hovered pin or cluster) */
  linked?: boolean;
  /** changes when the map focuses this event, to scroll it into view */
  revealKey?: number;
  onSelect: (id: string) => void;
  /** hover or focus in, and out (null), for lighting the matching pin */
  onHover?: (id: string | null) => void;
};

function EventCardImpl({ event, live, lit, current, selected, flashKey, merge, linked = false, revealKey, onSelect, onHover }: EventCardProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [beat, setBeat] = useState(0);
  // the first merge seen at mount already happened; only new ones animate
  const [seenMerge, setSeenMerge] = useState(merge?.key);
  if (merge && merge.key !== seenMerge) {
    setSeenMerge(merge.key);
    if (!reduce) {
      setGhosts((g) => [...g, ...merge.incoming.map((m, i) => ({ ...m, key: `${merge.key}:${i}` }))]);
      setBeat((b) => b + 1);
    }
  }

  useEffect(() => {
    if (flashKey && ref.current) reveal(ref.current, "center", !reduce, true);
  }, [flashKey, reduce]);

  useEffect(() => {
    if (current && ref.current) reveal(ref.current, "nearest", !reduce, false);
  }, [current, reduce]);

  useEffect(() => {
    if (revealKey && ref.current) reveal(ref.current, "nearest", !reduce, false);
  }, [revealKey, reduce]);

  const inferred = event.confidence === "inferred";

  return (
    <motion.div
      ref={ref}
      layout="position"
      transition={{ layout: { duration: 0.32, ease: EASE } }}
      initial={reduce ? false : { opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: lit ? 1 : 0.42, y: 0, scale: 1 }}
      className="relative"
      // while ghosts fold in, sit above the next card so they're visible
      style={{ zIndex: ghosts.length ? 20 : undefined }}
      data-event-id={event.id}
    >
      {/* ghosts sit behind the card: they peek out below, then fold in */}
      <AnimatePresence>
        {ghosts.map((g, i) => (
          <motion.div
            key={g.key}
            aria-hidden
            className="absolute inset-x-2 bottom-0 z-0 flex h-full items-end rounded-[11px] bg-surface px-2.5 pb-[4px] shadow-raised"
            initial={{ y: 0, opacity: 0, scale: 0.97 }}
            animate={{ y: [0, 19 + i * 8, 19 + i * 8, 0], opacity: [0, 1, 1, 0], scale: [0.97, 0.97, 0.97, 0.93] }}
            transition={{
              y: { duration: 0.5, times: [0, 0.26, 0.56, 1], ease: EASE },
              scale: { duration: 0.5, times: [0, 0.26, 0.56, 1], ease: EASE },
              // opacity runs on WAAPI, where one bezier would warp the keyframe times: keep it linear
              opacity: { duration: 0.5, times: [0, 0.16, 0.6, 1], ease: "linear" },
            }}
            onAnimationComplete={() => setGhosts((cur) => cur.filter((x) => x.key !== g.key))}
          >
            <span className="flex min-w-0 items-center gap-1 text-[10.5px] leading-none text-ink-2">
              <SourceGlyph source={g.source} size={10} />
              <span className="font-medium">{SOURCE_NAME[g.source]}</span>
              <span className="truncate text-ink-3">· {g.title}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => onSelect(event.id)}
        onPointerEnter={onHover ? () => onHover(event.id) : undefined}
        onPointerLeave={onHover ? () => onHover(null) : undefined}
        onFocus={onHover ? () => onHover(event.id) : undefined}
        onBlur={onHover ? () => onHover(null) : undefined}
        animate={beat ? { scale: [1, 1.012, 1] } : undefined}
        transition={{ duration: 0.4, delay: 0.22, ease: EASE }}
        key={flashKey ? `flash-${flashKey}` : "card"}
        data-linked={linked || undefined}
        className={cn(
          // hover is instant: no fades on highlights
          "group relative z-10 flex w-full items-start gap-2.5 rounded-[12px] p-2 text-left",
          inferred ? "border border-dashed border-line-strong bg-surface/60 hover:bg-hover" : "bg-surface shadow-card hover:bg-inset",
          linked && (inferred ? "bg-hover" : "bg-inset"),
        )}
        style={{
          ...(flashKey ? { animation: "chronos-flash 1.4s cubic-bezier(0.23,1,0.32,1) both" } : null),
          // inline so it always wins over the card shadow token
          ...(selected
            ? { boxShadow: "0 0 0 2px var(--accent), var(--sh-card)" }
            : linked
              ? { boxShadow: "0 0 0 1.5px color-mix(in oklch, var(--accent) 75%, transparent), var(--sh-card)" }
              : null),
        }}
      >
        {current && <span aria-hidden className="absolute top-2.5 bottom-2.5 -left-[5px] w-[3px] rounded-full bg-accent" />}
        {event.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumbnail.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="image-outline size-11 shrink-0 rounded-[4px] bg-field object-cover"
            onError={(e) => (e.currentTarget.style.visibility = "hidden")}
          />
        ) : (
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[4px] bg-field text-ink-3">
            <CategoryGlyph category={event.category} />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className={cn("num text-[12px] font-semibold", inferred ? "text-ink-3" : "text-ink-2")}>
              {event.approxYear ? "c. " : ""}
              {formatYear(event.year)}
            </span>
            <span className="inline-flex h-[18px] items-center rounded-[5px] bg-field px-1.5 text-[10.5px] font-medium text-ink-2">{event.category}</span>
            <span className="ml-auto pl-1" onClick={(e) => e.stopPropagation()}>
              <SourceDots event={event} live={live} animateKey={beat ? seenMerge : undefined} />
            </span>
          </span>
          <span className={cn("text-[13px] leading-snug font-medium text-pretty", inferred ? "text-ink-2" : "text-ink")}>{event.title}</span>
          {event.summary && (
            <span className={cn("line-clamp-2 text-[12px] leading-[1.45] text-pretty", inferred ? "text-ink-3" : "text-ink-2")}>{event.summary}</span>
          )}
        </span>
      </motion.button>
    </motion.div>
  );
}

export const EventCard = memo(EventCardImpl);
