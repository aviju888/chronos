"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import type { ChronosEvent, Era, YearRange } from "@/modern/lib/chronos/types";
import { densityCurve, niceTicks, ribbonPath, xToYear, yearToX } from "@/modern/lib/chronos/density";
import { formatRange, formatYear } from "@/modern/lib/chronos/time";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "./Tooltip";

/* ─────────────────────────────────────────────────────────
 * TIME SCRUBBER
 *
 *   era bands      up to two lanes; the one under the cursor lights up
 *   readout        RollingNumber year in tabular slots, "44 BCE"
 *   ribbon         kernel density of event years, smoothed,
 *                  accent up to the cursor, quiet after it
 *   ticks          one per event, lit once the cursor passes
 *   axis           1-2-5 spaced labels, never a year 0
 *
 * Drag anywhere on the ribbon; ←/→ step a decade (⇧ a century),
 * Home/End jump, Space plays.
 * ───────────────────────────────────────────────────────── */

const RIBBON_H = 58;
const LANE_H = 20;
const LANE_GAP = 3;

const CONF_WEIGHT = { high: 1.3, medium: 1.1, low: 1, inferred: 0.7 } as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export function TimeScrubber({
  range,
  events,
  eras,
  cursor,
  playing,
  onScrub,
  onTogglePlay,
  className,
}: {
  range: YearRange;
  events: ChronosEvent[];
  eras: Era[];
  cursor: number | null;
  playing: boolean;
  onScrub: (year: number) => void;
  onTogglePlay: () => void;
  className?: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const clipId = useId().replace(/:/g, "");
  const [dragging, setDragging] = useState(false);
  const crosses = range.start < 0 && range.end > 0;
  const value = cursor ?? range.end;
  const year = Math.round(value) === 0 ? 1 : Math.round(value);
  const x = width ? yearToX(value, range, width) : 0;

  // phones get the top lane only; two lanes of slivers is noise at that width
  const shownEras = width && width < 500 ? eras.filter((e) => e.lane === 0) : eras;
  const lanes = shownEras.length ? Math.max(...shownEras.map((e) => e.lane)) + 1 : 0;
  const erasH = lanes ? lanes * LANE_H + (lanes - 1) * LANE_GAP : 0;
  const READOUT_H = 30;
  const ribbonTop = erasH + (lanes ? 6 : 0) + READOUT_H;

  const samples = Math.max(40, Math.min(180, Math.round(width / 5)));
  const curve = useMemo(
    () => densityCurve(events.map((e) => ({ year: e.year, weight: CONF_WEIGHT[e.confidence] })), range, samples),
    [events, range, samples],
  );
  const ribbon = useMemo(() => (width ? ribbonPath(curve, width, RIBBON_H / 2, RIBBON_H / 2 - 3) : ""), [curve, width]);
  const ticks = useMemo(() => niceTicks(range, width && width < 480 ? 4 : 6), [range, width]);

  const fromPointer = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onScrub(xToYear(clientX - rect.left, range, rect.width));
  };

  const step = (delta: number) => {
    const next = Math.round(Math.min(range.end, Math.max(range.start, value + delta)));
    onScrub(next === 0 ? (delta > 0 ? 1 : -1) : next);
  };

  const readoutLeft = Math.min(Math.max(x, 34), Math.max(34, width - 34));
  const activeEra = (e: Era) => cursor !== null && value >= e.startYear && value <= e.endYear;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <Tooltip content={playing ? "Pause" : "Play through the range"}>
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={events.length === 0}
          aria-label={playing ? "Pause playback" : "Play timeline"}
          className="press flex size-11 -translate-y-1/2 shrink-0 items-center justify-center rounded-full bg-ink text-canvas shadow-hairline hover:opacity-90 disabled:opacity-40 sm:size-8"
          style={{ marginTop: ribbonTop + RIBBON_H / 2 }}
        >
          {playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" className="translate-x-[1px]" />}
        </button>
      </Tooltip>

      <div ref={ref} className="relative min-w-0 flex-1" style={{ height: ribbonTop + RIBBON_H + 22 }}>
        {/* era bands */}
        {width > 0 &&
          shownEras.map((e) => {
            const left = yearToX(Math.max(e.startYear, range.start), range, width);
            const right = yearToX(Math.min(e.endYear, range.end), range, width);
            const w = Math.max(2, right - left - 2);
            const on = activeEra(e);
            const showLabel = w > 30;
            return (
              <Tooltip
                key={e.id}
                content={
                  <span>
                    <span className="font-medium">{e.title}</span>
                    <span className="num" style={{ color: "var(--tooltip-muted)" }}>
                      {" "}
                      {formatRange(e.startYear, e.endYear, "–")}
                    </span>
                  </span>
                }
              >
                <button
                  type="button"
                  onClick={() => onScrub(Math.max(e.startYear, range.start))}
                  className={cn(
                    "absolute flex items-center overflow-hidden rounded-[6px] px-1.5 text-left text-[11px] font-medium whitespace-nowrap",
                    on
                      ? "bg-accent-tint text-accent-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--accent)_35%,transparent)]"
                      : showLabel
                        ? "bg-field text-ink-2 hover:bg-hover-2 hover:text-ink"
                        : "bg-line-strong hover:bg-ink-3",
                  )}
                  style={{
                    left: left + 1,
                    width: w,
                    // too narrow for a label: a short bar instead of an empty pill
                    top: e.lane * (LANE_H + LANE_GAP) + (showLabel ? 0 : LANE_H / 2 - 3),
                    height: showLabel ? LANE_H : 6,
                    transition: "background-color 160ms ease-out, color 160ms ease-out",
                  }}
                >
                  <span className={cn("truncate", !showLabel && "opacity-0")}>{e.title}</span>
                </button>
              </Tooltip>
            );
          })}

        {/* readout */}
        {width > 0 && events.length > 0 && (
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 items-center rounded-[7px] bg-surface px-1.5 py-[3px] text-[12px] font-semibold text-ink shadow-raised"
            style={{ left: readoutLeft, top: ribbonTop - READOUT_H + 2, transition: dragging || playing ? "none" : "left 240ms cubic-bezier(0.23,1,0.32,1)" }}
          >
            <RollingNumber value={Math.abs(year)} duration={playing ? 160 : 420} />
            {(year < 0 || crosses) && <span className="ml-1 text-[10.5px] font-medium text-ink-3">{year < 0 ? "BCE" : "CE"}</span>}
          </div>
        )}

        {/* ribbon */}
        <div
          className="absolute inset-x-0 cursor-ew-resize touch-none"
          style={{ top: ribbonTop, height: RIBBON_H }}
          onPointerDown={(e) => {
            if (!events.length) return;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            fromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (dragging) fromPointer(e.clientX);
          }}
          onPointerUp={(e) => {
            setDragging(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => setDragging(false)}
        >
          {width > 0 && (
            <svg width={width} height={RIBBON_H} className="absolute inset-0 overflow-visible" aria-hidden>
              <defs>
                <clipPath id={`${clipId}-played`}>
                  <rect x={-2} y={-4} width={Math.max(0, x + 2)} height={RIBBON_H + 8} />
                </clipPath>
              </defs>
              <line x1={0} x2={width} y1={RIBBON_H / 2} y2={RIBBON_H / 2} stroke="var(--line-strong)" strokeWidth={1} />
              {ribbon && (
                <>
                  <path d={ribbon} fill="var(--ink)" opacity={cursor === null ? 0.16 : 0.1} style={{ transition: "d 400ms cubic-bezier(0.23,1,0.32,1)" }} />
                  {cursor !== null && (
                    <path d={ribbon} fill="var(--accent)" opacity={0.9} clipPath={`url(#${clipId}-played)`} style={{ transition: "d 400ms cubic-bezier(0.23,1,0.32,1)" }} />
                  )}
                </>
              )}
              {events.map((e) => {
                const ex = yearToX(e.year, range, width);
                const lit = e.year <= value;
                return <circle key={e.id} cx={ex} cy={RIBBON_H / 2} r={1.7} fill={lit ? "var(--ink)" : "var(--ink-3)"} opacity={lit ? 0.75 : 0.45} />;
              })}
            </svg>
          )}

          {/* handle */}
          {width > 0 && events.length > 0 && (
            <div className="pointer-events-none absolute inset-y-[-4px]" style={{ left: x, transition: dragging || playing ? "none" : "left 240ms cubic-bezier(0.23,1,0.32,1)" }}>
              <span className="absolute inset-y-0 left-[-0.75px] w-[1.5px] rounded-full bg-ink" />
              <span
                role="slider"
                tabIndex={0}
                aria-label="Timeline cursor"
                aria-valuemin={range.start}
                aria-valuemax={range.end}
                aria-valuenow={year}
                aria-valuetext={formatYear(year, { era: crosses ? "always" : "auto" })}
                onKeyDown={(e) => {
                  const big = e.shiftKey ? 100 : 10;
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") step(big);
                  else if (e.key === "ArrowLeft" || e.key === "ArrowDown") step(-big);
                  else if (e.key === "PageUp") step(50);
                  else if (e.key === "PageDown") step(-50);
                  else if (e.key === "Home") onScrub(range.start);
                  else if (e.key === "End") onScrub(range.end);
                  else if (e.key === " ") onTogglePlay();
                  else return;
                  e.preventDefault();
                }}
                className="pointer-events-auto absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface shadow-[0_0_0_1.5px_var(--ink),0_1px_3px_oklch(0%_0_0/0.25)] outline-offset-4"
              />
            </div>
          )}
        </div>

        {/* axis */}
        {width > 0 && (
          <div className="pointer-events-none absolute inset-x-0" style={{ top: ribbonTop + RIBBON_H + 6, height: 14 }}>
            {ticks.map((t) => {
              const tx = yearToX(t, range, width);
              if (tx < 52 || tx > width - 52) return null;
              return (
                <span key={t} className="num absolute -translate-x-1/2 text-[10.5px] whitespace-nowrap text-ink-3" style={{ left: tx }}>
                  {formatYear(t, { era: crosses && t === 1 ? "always" : "auto" })}
                </span>
              );
            })}
            <span className="num absolute left-0 text-[10.5px] text-ink-3">{formatYear(range.start)}</span>
            <span className="num absolute right-0 text-[10.5px] text-ink-3">{formatYear(range.end)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
