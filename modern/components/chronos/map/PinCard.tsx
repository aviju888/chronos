"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, MapPin, X } from "@phosphor-icons/react";
import type { ChronosEvent } from "@/modern/lib/chronos/types";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { Button } from "@/modern/components/atoms/Button";
import { SourceDots } from "../sources";

/* ─────────────────────────────────────────────────────────
 * PIN CARD — a small card anchored to a pin. Sits above the
 * pin and flips below when there's no room, stays inside the
 * map horizontally, and follows the pin while the map moves.
 * ───────────────────────────────────────────────────────── */

const GAP = 14;

function useHeight<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, height };
}

function Anchored({
  x,
  y,
  mapWidth,
  width,
  pinRadius,
  label,
  onClose,
  children,
}: {
  x: number;
  y: number;
  mapWidth: number;
  width: number;
  pinRadius: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { ref, height } = useHeight<HTMLDivElement>(150);
  const above = y - pinRadius - GAP - height > -36;
  const left = Math.min(Math.max(x - width / 2, 4), Math.max(4, mapWidth - width - 4));
  const top = above ? y - pinRadius - GAP - height : y + pinRadius + GAP;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-map-card
      className="absolute z-30 rounded-card bg-surface p-2.5 shadow-overlay"
      style={{
        left,
        top,
        width,
        transformOrigin: `${x - left}px ${above ? "100%" : "0%"}`,
        animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="press absolute top-0 right-0 flex size-11 items-center justify-center rounded-[7px] text-ink-3 hover:bg-hover hover:text-ink sm:top-1.5 sm:right-1.5 sm:size-6"
      >
        <X size={12} weight="bold" />
      </button>
      {children}
    </div>
  );
}

export function EventPinCard({
  event,
  live,
  x,
  y,
  mapWidth,
  pinRadius,
  onOpen,
  onClose,
}: {
  event: ChronosEvent;
  live: boolean | null;
  x: number;
  y: number;
  mapWidth: number;
  pinRadius: number;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const width = Math.min(268, mapWidth - 8);
  const place = event.location;
  return (
    <Anchored x={x} y={y} mapWidth={mapWidth} width={width} pinRadius={pinRadius} label={event.title} onClose={onClose}>
      <div className="flex items-center gap-1.5 pr-11 sm:pr-7">
        <span className="num text-[12px] font-semibold text-ink-2">
          {event.approxYear ? "c. " : ""}
          {formatYear(event.year)}
        </span>
        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-field px-1.5 text-[10.5px] font-medium text-ink-2">{event.category}</span>
        <span className="ml-auto">
          <SourceDots event={event} live={live} />
        </span>
      </div>
      <p className={cn("mt-1 line-clamp-2 text-[13px] leading-snug font-medium text-pretty", event.confidence === "inferred" ? "text-ink-2" : "text-ink")}>{event.title}</p>
      {event.summary && <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.45] text-pretty text-ink-2">{event.summary}</p>}
      <div className="mt-2 flex items-center gap-2">
        {place?.name ? (
          <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-ink-3">
            <MapPin size={11} weight="bold" className="shrink-0" />
            <span className="truncate">{place.approx ? `near ${place.name}` : place.name}</span>
          </span>
        ) : null}
        <Button size="xs" variant="secondary" className="ml-auto min-h-11 sm:min-h-0" onClick={() => onOpen(event.id)}>
          Open
          <ArrowUpRight size={11} weight="bold" />
        </Button>
      </div>
    </Anchored>
  );
}

export function ClusterCard({
  events,
  x,
  y,
  mapWidth,
  pinRadius,
  onPick,
  onClose,
}: {
  events: ChronosEvent[];
  x: number;
  y: number;
  mapWidth: number;
  pinRadius: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const width = Math.min(268, mapWidth - 8);
  const shown = events.slice(0, 6);
  const place = events.find((e) => e.location?.name)?.location?.name;
  return (
    <Anchored x={x} y={y} mapWidth={mapWidth} width={width} pinRadius={pinRadius} label={`${events.length} events`} onClose={onClose}>
      <p className="pr-11 text-[12px] font-medium text-ink sm:pr-7">
        <span className="num">{events.length}</span> events {place ? `near ${place}` : "in one place"}
      </p>
      <div className="mt-1.5 -mx-1 flex flex-col">
        {shown.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e.id)}
            className="flex min-h-11 items-center gap-2 rounded-[6px] px-1 py-1 text-left hover:bg-hover sm:min-h-0 sm:items-baseline"
          >
            <span className="num w-14 shrink-0 text-[11.5px] font-medium text-ink-3">{formatYear(e.year)}</span>
            <span className="min-w-0 truncate text-[12.5px] text-ink">{e.title}</span>
          </button>
        ))}
      </div>
      {events.length > shown.length && <p className="mt-1 text-[11.5px] text-ink-3">and {events.length - shown.length} more in the list</p>}
    </Anchored>
  );
}
