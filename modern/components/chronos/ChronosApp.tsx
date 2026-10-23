"use client";

import "./chronos.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CaretDown, Lightning } from "@phosphor-icons/react";
import type { ChronosEvent, Mode, MergeIncoming } from "@/modern/lib/chronos/types";
import { formatRange } from "@/modern/lib/chronos/time";
import { inBox, type GeoBox } from "@/modern/lib/chronos/mapview";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import { useChronos, type ChronosState } from "./useChronos";
import { usePlayback } from "./usePlayback";
import { PromptComposer } from "./PromptComposer";
import { SuggestionChips } from "./SuggestionChips";
import { PixelLoader, TaskList, TraceLog } from "./PipelinePanel";
import { DotMap } from "./DotMap";
import { TimeScrubber } from "./TimeScrubber";
import { EventList } from "./EventList";
import { Narrative } from "./Narrative";
import { EventDetail } from "./EventDetail";

/* ─────────────────────────────────────────────────────────
 * CHRONOS — query in, a cited timeline assembling out.
 *
 *   idle      hero composer over a dot-matrix world
 *   running   pipeline panel prominent; map, scrubber and the
 *             event list fill in as frames arrive
 *   done      map + scrubber take the stage, pipeline folds
 *             into a one-line summary, narrative below
 * ───────────────────────────────────────────────────────── */

const RANGE_FROM: Record<string, string> = {
  query: "range from your query",
  wikipedia: "range from Wikipedia",
  wikidata: "range from Wikidata",
  llm: "range from the model",
  events: "range from the events",
  default: "default range, add years to narrow it",
};

function Hero({
  draft,
  setDraft,
  mode,
  setMode,
  onSubmit,
  examples,
  onExample,
}: {
  draft: string;
  setDraft: (v: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  onSubmit: (q: string) => void;
  examples: string[];
  onExample: (q: string) => void;
}) {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-48px)] w-full max-w-[1240px] flex-col items-center justify-center overflow-hidden px-4 pt-8 pb-20 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-[min(1180px,140vw)] -translate-y-1/2 opacity-80"
        style={{ maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, black 30%, transparent 78%)", WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, black 30%, transparent 78%)" }}
      >
        <DotMap events={[]} cursorYear={null} loading />
      </div>
      <div className="relative z-10 flex w-full max-w-[620px] flex-col items-center gap-5 text-center" style={{ animation: "fade-up 500ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[48px] leading-none font-semibold tracking-[-0.04em] text-ink sm:text-[64px]">Chronos</h1>
          <p className="text-[14px] leading-relaxed text-ink-2">Explore history through interactive timelines.</p>
        </div>
        <div className="w-full pt-1">
          <PromptComposer value={draft} onChange={setDraft} onSubmit={onSubmit} mode={mode} onModeChange={setMode} tall autoFocus placeholder="Roman Empire 27 BCE - 476 CE" />
        </div>
        <SuggestionChips examples={examples} onPick={onExample} wrap />
      </div>
    </div>
  );
}

const RunHeader = memo(function RunHeader({ state, events, onLive }: { state: ChronosState; events: ChronosEvent[]; onLive: () => void }) {
  const { intent, status } = state;
  const running = status === "running";
  const sources = new Set(events.flatMap((e) => e.sources)).size;
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3" style={{ animation: "fade-in 300ms ease-out both" }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          {intent ? (
            <>
              <span className="inline-flex h-5 items-center rounded-[5px] bg-field px-1.5 font-medium text-ink-2 capitalize">{intent.queryType}</span>
              <span>{RANGE_FROM[intent.rangeFrom]}</span>
              {intent.article && (
                <a href={intent.article.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-3 hover:text-ink">
                  Wikipedia
                  <ArrowUpRight size={11} weight="bold" />
                </a>
              )}
            </>
          ) : (
            <span>{status === "error" ? "Couldn't resolve" : "Resolving"} “{state.query}”</span>
          )}
        </div>
        <h1 className="mt-1 truncate text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{intent?.topic ?? state.query}</h1>
        <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2", status === "error" && !intent && "hidden")}>
          {intent && <span className="num">{formatRange(intent.range.start, intent.range.end)}</span>}
          {intent && <span className="text-ink-3">·</span>}
          <span className="inline-flex items-baseline gap-1">
            <RollingNumber value={events.length} duration={450} /> events
          </span>
          <span className="text-ink-3">·</span>
          <span className="inline-flex items-baseline gap-1">
            <RollingNumber value={state.mergeCount} duration={450} /> merges
          </span>
          {!running && events.length > 0 && (
            <>
              <span className="text-ink-3">·</span>
              <span>{sources} of 3 sources</span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        <PixelLoader label={running ? (intent ? "Assembling timeline" : "Resolving topic") : status === "error" ? "Failed" : state.stopped ? "Stopped early" : "Assembled"} startedAt={state.startedAt} finishedAt={state.finishedAt} />
        {state.notices.map((notice) => (
          <span key={notice.kind} role="status" className="inline-flex max-w-full items-center gap-1.5 rounded-card bg-accent-tint py-1 pr-1 pl-2.5 text-[11.5px] text-accent-ink" style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <Lightning size={11} weight="fill" />
            <span className="max-w-[52ch] text-pretty">{notice.text}</span>
            {!running && (
              <button type="button" onClick={onLive} className="press rounded-full bg-surface px-2 py-0.5 font-medium text-ink shadow-btn hover:bg-hover">
                Run live
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
});

const PipelineSection = memo(function PipelineSection({ state }: { state: ChronosState }) {
  const running = state.status === "running";
  // open while running (or failed); after that the reader decides, until the next run
  const [manual, setManual] = useState<{ runId: number; open: boolean } | null>(null);
  const auto = running || state.status === "error";
  const open = running ? true : manual && manual.runId === state.runId ? manual.open : auto;
  const setOpen = (fn: (o: boolean) => boolean) => setManual({ runId: state.runId, open: fn(open) });
  const live = state.intent?.live ?? null;
  const totalEvents = Object.keys(state.events).length;

  return (
    <section aria-label="Pipeline" className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={running}
        className="-mx-1 flex items-center gap-2 rounded-control px-1 py-0.5 text-left enabled:hover:bg-hover"
      >
        <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Pipeline</h2>
        <span className="truncate text-[12px] text-ink-3">
          {running ? "Model, Wikidata and Wikipedia in parallel" : `${totalEvents} events, ${state.mergeCount} ${state.mergeCount === 1 ? "merge" : "merges"} · ${state.traces.length} trace steps`}
        </span>
        {!running && <CaretDown size={13} weight="bold" className="ml-auto shrink-0 text-ink-3 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }} />}
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
      >
        <div className={cn("flex min-h-0 flex-col gap-3", open ? "overflow-visible pt-2.5" : "overflow-hidden")}>
          <TaskList tasks={state.tasks} live={live} />
          <TraceLog traces={state.traces} running={running} />
        </div>
      </div>
    </section>
  );
});

export function ChronosApp({ examples, live }: { examples: string[]; live?: boolean }) {
  const { state, run, stop } = useChronos();
  const [draft, setDraft] = useState("");

  // sound (off unless the viewer turns it on): a soft tap as sources merge,
  // rate-limited so a burst of merges reads as texture, and a chord when done
  const lastTap = useRef(0);
  useEffect(() => {
    if (state.mergeCount === 0) return;
    const now = performance.now();
    if (now - lastTap.current < 280) return;
    lastTap.current = now;
    playSfx("tap", 0.45);
  }, [state.mergeCount]);
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (prevStatus.current === "running" && state.status === "done" && !state.stopped) playSfx("success", 0.7);
    if (prevStatus.current === "running" && state.status === "error") playSfx("error");
    prevStatus.current = state.status;
  }, [state.status, state.stopped]);
  const [mode, setMode] = useState<Mode>("quick");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; key: number } | null>(null);
  // map ↔ list: what's hovered (and where), the area filter, and which card to bring into view
  const [hover, setHover] = useState<{ ids: string[]; from: "map" | "list" } | null>(null);
  const [area, setArea] = useState<GeoBox | null>(null);
  const [reveal, setReveal] = useState<{ id: string; key: number } | null>(null);

  const events = useMemo(() => state.order.map((id) => state.events[id]).filter(Boolean), [state.order, state.events]);
  const filtered = useMemo(() => (area ? events.filter((e) => e.location && inBox(e.location, area)) : events), [events, area]);
  const unplaced = area ? events.filter((e) => !e.location).length : 0;
  const emphasis = useMemo(() => (area ? new Set(filtered.map((e) => e.id)) : null), [area, filtered]);
  const range = state.intent?.range ?? null;
  const playback = usePlayback(range, events.length);
  const stopPlayback = playback.stop;
  const running = state.status === "running";
  const isLive = state.intent?.live ?? live ?? null;

  const merges = useMemo(() => {
    const out: Record<string, { key: string; incoming: MergeIncoming[] }> = {};
    for (const m of state.merges) out[m.keptId] = { key: m.key, incoming: m.incoming };
    return out;
  }, [state.merges]);

  const start = useCallback(
    (q: string, opts: { replay?: boolean; mode?: Mode } = {}) => {
      setDraft(q);
      setFocusId(null);
      setDetailId(null);
      setFlash(null);
      setHover(null);
      setArea(null);
      setReveal(null);
      run(q, opts.mode ?? mode, { replay: opts.replay });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [run, mode],
  );

  const onCite = useCallback(
    (id: string) => {
      const target = state.events[id] ? id : state.alias[id];
      if (!target) return;
      stopPlayback();
      setFocusId(target);
      setFlash({ id: target, key: Date.now() });
    },
    [state.events, state.alias, stopPlayback],
  );

  const onSelect = useCallback(
    (id: string) => {
      stopPlayback();
      setFocusId(id);
      setDetailId(id);
    },
    [stopPlayback],
  );

  const runLive = useCallback(() => start(state.query, { replay: false, mode: state.mode }), [start, state.query, state.mode]);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const onListHover = useCallback((id: string | null) => setHover(id ? { ids: [id], from: "list" } : null), []);
  const onMapHover = useCallback((ids: string[] | null) => setHover(ids && ids.length ? { ids, from: "map" } : null), []);
  const onMapFocus = useCallback((id: string) => {
    setFocusId(id);
    setReveal({ id, key: Date.now() });
  }, []);
  const clearArea = useCallback(() => setArea(null), []);
  const areaFilter = useMemo(() => (area ? { count: filtered.length, unplaced, onClear: clearArea } : null), [area, filtered.length, unplaced, clearArea]);

  if (state.status === "idle") {
    return (
      <Hero
        draft={draft}
        setDraft={setDraft}
        mode={mode}
        setMode={setMode}
        onSubmit={(q) => start(q)}
        examples={examples}
        onExample={(q) => start(q, { replay: true, mode: "quick" })}
      />
    );
  }

  const cursorForViews = playback.cursor === null ? null : Math.floor(playback.cursor);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-20 sm:px-6">
      <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2.5">
        <div className="w-full shrink-0 md:max-w-[620px]">
          <PromptComposer value={draft} onChange={setDraft} onSubmit={(q) => start(q)} mode={mode} onModeChange={setMode} running={running} onStop={stop} />
        </div>
        <SuggestionChips examples={examples} onPick={(q) => start(q, { replay: true, mode: "quick" })} disabled={running} className="md:ml-1" label="Saved" />
      </div>

      <div className="mt-6">
        <RunHeader state={state} events={events} onLive={runLive} />
      </div>

      {state.status === "error" && (
        <div role="alert" className="mt-5 flex flex-col gap-3 rounded-card bg-red-tint px-4 py-3 text-[13px] text-red sm:flex-row sm:items-center" style={{ animation: "fade-up 300ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <span className="flex-1 text-pretty">{state.error}</span>
          <SuggestionChips examples={examples} onPick={(q) => start(q, { replay: true, mode: "quick" })} label="Try" wrap />
        </div>
      )}

      {/* an error before the topic resolved has nothing to show below the message */}
      {!(state.status === "error" && !state.intent) && (
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* stage (second on phones while the pipeline runs above it) */}
        <div className="flex min-w-0 flex-col gap-4 max-lg:order-2">
          <div className="rounded-[14px] bg-surface p-3 shadow-card">
            <DotMap
              events={events}
              cursorYear={cursorForViews}
              playing={playback.playing}
              range={range}
              selectedId={focusId}
              hoverIds={hover?.ids ?? null}
              onHover={onMapHover}
              onFocusEvent={onMapFocus}
              onOpen={onSelect}
              area={area}
              onAreaChange={setArea}
              interactive
              loading={running}
              liveModel={isLive}
              resetKey={state.runId}
              legend
            />
          </div>

          <div className="rounded-[14px] bg-surface px-3 pt-3 pb-1.5 shadow-card sm:px-4">
            {range ? (
              <TimeScrubber range={range} events={filtered} eras={state.eras} cursor={playback.cursor} playing={playback.playing} onScrub={playback.scrub} onTogglePlay={playback.toggle} />
            ) : (
              <div className="flex h-[120px] items-center gap-3 px-1 text-[12.5px] text-ink-3">
                <span className="h-px flex-1 bg-line" />
                Waiting for a time range
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
          </div>

          <div className="px-0.5 pt-2">
            <Narrative
              text={state.narrative}
              streaming={running && state.narrative.length > 0}
              events={state.events}
              alias={state.alias}
              intent={state.intent}
              source={state.narrativeSource}
              onCite={onCite}
              emphasis={emphasis}
            />
          </div>
        </div>

        {/* side: pipeline + events; on phones these become grid items so the pipeline can lead */}
        <div className="flex min-w-0 flex-col gap-5 max-lg:contents lg:sticky lg:top-[60px] lg:max-h-[calc(100dvh-72px)] lg:self-start">
          <div className="max-lg:order-1">
            <PipelineSection state={state} />
          </div>
          <ScrollFade axis="y" className="min-h-0 flex-1 max-lg:order-3 lg:-mx-2 lg:px-2 lg:pb-2" fade={32}>
            <EventList
              events={filtered}
              live={isLive}
              cursor={cursorForViews}
              selectedId={focusId}
              flash={flash}
              merges={merges}
              running={running}
              onSelect={onSelect}
              linkedIds={hover?.from === "map" ? hover.ids : null}
              onHover={onListHover}
              reveal={reveal}
              areaFilter={areaFilter}
            />
          </ScrollFade>
        </div>
      </div>

      )}

      <EventDetail event={detailId ? state.events[detailId] ?? null : null} live={isLive} onClose={closeDetail} />
    </div>
  );
}
