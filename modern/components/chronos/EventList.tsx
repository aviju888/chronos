"use client";

import { useMemo, useState } from "react";
import { LayoutGroup } from "motion/react";
import { Selection } from "@phosphor-icons/react";
import type { ChronosEvent, MergeIncoming } from "@/modern/lib/chronos/types";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { cn } from "@/modern/lib/cn";
import { EventCard } from "./EventCard";
import { SourceGlyph } from "./sources";

type Filter = "all" | "agreed" | "single";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "agreed", label: "2+ sources" },
  { id: "single", label: "1 source" },
];

export function EventListHeader({
  count,
  filter,
  onFilter,
}: {
  count: number;
  filter: Filter;
  onFilter: (f: Filter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Events</h2>
        <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline">
          <RollingNumber value={count} duration={500} />
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-3" aria-label="Dot order">
        <SourceGlyph source="llm" size={10} />
        <span>Model</span>
        <span aria-hidden>·</span>
        <SourceGlyph source="wikidata" size={10} />
        <span>Wikidata</span>
        <span aria-hidden>·</span>
        <SourceGlyph source="wikipedia" size={10} />
        <span>Wikipedia</span>
      </div>
      <div role="radiogroup" aria-label="Filter by agreement" className="ml-auto inline-flex rounded-control bg-field p-0.5 shadow-inset-field">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => onFilter(f.id)}
            className={cn(
              "h-6 rounded-[6px] px-2 text-[11.5px] font-medium",
              filter === f.id ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:text-ink",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SkeletonCard({ i }: { i: number }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] bg-surface p-2 shadow-card" style={{ animation: `fade-up 400ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both` }}>
      <span className="size-11 shrink-0 rounded-[4px] bg-field" />
      <span className="flex flex-1 flex-col gap-2 pt-1">
        <span className="h-2.5 w-20 rounded-full bg-field" />
        <span className="h-3 w-3/4 rounded-full bg-field" />
        <span className="h-2.5 w-full rounded-full bg-field/70" />
      </span>
    </div>
  );
}

export function EventList({
  events,
  live,
  cursor,
  selectedId,
  flash,
  merges,
  running,
  onSelect,
  linkedIds = null,
  onHover,
  reveal = null,
  areaFilter = null,
  className,
}: {
  events: ChronosEvent[];
  live: boolean | null;
  cursor: number | null;
  selectedId: string | null;
  flash: { id: string; key: number } | null;
  merges: Record<string, { key: string; incoming: MergeIncoming[] }>;
  running: boolean;
  onSelect: (id: string) => void;
  /** events lit from the map (hovered pin or cluster) */
  linkedIds?: string[] | null;
  onHover?: (id: string | null) => void;
  /** scroll this event into view (the map focused it) */
  reveal?: { id: string; key: number } | null;
  /** the map's area filter, when one is drawn */
  areaFilter?: { count: number; unplaced: number; onClear: () => void } | null;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const linked = useMemo(() => new Set(linkedIds ?? []), [linkedIds]);
  const shown = useMemo(
    () =>
      events.filter((e) => (filter === "agreed" ? e.sources.length >= 2 : filter === "single" ? e.sources.length === 1 : true)),
    [events, filter],
  );
  const litYear = cursor === null ? null : Math.floor(cursor);
  const currentId = useMemo(() => {
    if (litYear === null) return null;
    let id: string | null = null;
    for (const e of shown) if (e.year <= litYear) id = e.id;
    return id;
  }, [shown, litYear]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <EventListHeader count={events.length} filter={filter} onFilter={setFilter} />
      {areaFilter && (
        <div className="flex flex-col gap-1" style={{ animation: "fade-in 160ms ease-out both" }}>
          <span className="inline-flex h-7 w-fit items-center gap-1.5 rounded-full bg-accent-tint pr-1 pl-2.5 text-[12px] text-accent-ink">
            <Selection size={12} weight="bold" />
            <span>
              <span className="num font-semibold">{areaFilter.count}</span> {areaFilter.count === 1 ? "event" : "events"} in this area
            </span>
            <span aria-hidden>·</span>
            <button type="button" onClick={areaFilter.onClear} className="press rounded-full bg-surface px-2 py-0.5 font-medium text-ink shadow-btn hover:bg-hover">
              Clear
            </button>
          </span>
          {areaFilter.unplaced > 0 && (
            <p className="px-0.5 text-[11.5px] text-ink-3">
              <span className="num">{areaFilter.unplaced}</span> {areaFilter.unplaced === 1 ? "event has" : "events have"} no place, so {areaFilter.unplaced === 1 ? "it is" : "they are"} hidden while filtering.
            </p>
          )}
        </div>
      )}
      {events.length === 0 && running ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} i={i} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-[12px] bg-inset px-3 py-4 text-center text-[12.5px] text-ink-2 shadow-hairline">
          {events.length === 0 ? (areaFilter ? "No events in this area." : "No dated events yet.") : "No events match this filter."}
        </p>
      ) : (
        <LayoutGroup>
          <div className="flex flex-col gap-2 pl-[5px]">
            {shown.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                live={live}
                lit={litYear === null || e.year <= litYear}
                current={e.id === currentId}
                selected={e.id === selectedId}
                flashKey={flash?.id === e.id ? flash.key : undefined}
                merge={merges[e.id]}
                linked={linked.has(e.id)}
                revealKey={reveal?.id === e.id ? reveal.key : undefined}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        </LayoutGroup>
      )}
    </div>
  );
}
