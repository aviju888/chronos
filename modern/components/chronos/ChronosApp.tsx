"use client";

import "./chronos.css";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, CaretDown, Lightning } from "@phosphor-icons/react";
import type { ChronosEvent, Mode, MergeIncoming, YearRange } from "@/modern/lib/chronos/types";
import { formatRange } from "@/modern/lib/chronos/time";
import { PROMPT_SUGGESTIONS } from "@/modern/lib/chronos/examples";
import { inBox, type GeoBox } from "@/modern/lib/chronos/mapview";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { playSfx } from "@/modern/lib/sfx";
import { useChronos, type ChronosState } from "./useChronos";
import { usePlayback } from "./usePlayback";
import { PromptComposer } from "./PromptComposer";
import { ChronosWordmark } from "@/components/brand/ChronosWordmark";
import { PixelLoader, TaskList, TraceLog } from "./PipelinePanel";
import { DotMap } from "./DotMap";
import { InvestigationMap } from './InvestigationMap';
import { TimeScrubber } from "./TimeScrubber";
import { EventList } from "./EventList";
import { Narrative } from "./Narrative";
import { EventDetail } from "./EventDetail";
import { ArchivesButton, DiscoveryControls, ExportButton, toolClass, type DateDraft } from './InvestigationTools';
import { rangeError, relatedTopics, createSurprisePicker, surpriseQuery } from '@/modern/lib/chronos/discovery';
import { saveArchive, snapshot, type Archive } from '@/modern/lib/chronos/archives';
import { progressLabel } from '@/modern/lib/chronos/progress';

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
  selected: "your selected dates",
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
  children,
}: {
  children?: ReactNode;
  draft: string;
  setDraft: (v: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  onSubmit: (q: string) => void;
}) {
  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-112px)] w-full max-w-[1240px] flex-col items-center justify-center overflow-hidden px-4 pt-8 pb-12 sm:px-6 sm:pb-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-[min(1180px,140vw)] -translate-y-1/2 opacity-80"
        style={{ maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, black 30%, transparent 78%)", WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, black 30%, transparent 78%)" }}
      >
        <DotMap events={[]} cursorYear={null} loading />
      </div>
      <div className="relative z-10 flex w-full max-w-[620px] flex-col items-center gap-5 text-center" style={{ animation: "fade-up 500ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <div className="flex flex-col items-center gap-3">
          <h1><ChronosWordmark /></h1>
          <p className="text-[14px] leading-relaxed text-ink-2">Explore history through interactive timelines.</p>
        </div>
        <div className="w-full pt-1">
          <PromptComposer value={draft} onChange={setDraft} onSubmit={onSubmit} mode={mode} onModeChange={setMode} tall autoFocus suggestions={PROMPT_SUGGESTIONS} />
        </div>
        {children}
      </div>
    </div>
  );
}

const RunHeader = memo(function RunHeader({ state, events, onLive }: { state: ChronosState; events: ChronosEvent[]; onLive: () => void }) {
  const { intent, status } = state;
  const running = status === "running";
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3" style={{ animation: "fade-in 300ms ease-out both" }}>
      <div className="min-w-0">
        <h1 className="mt-1 break-words text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{intent?.topic ?? state.query}</h1>
        <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2", status === "error" && !intent && "hidden")}>
          {intent && <span className="num">{formatRange(intent.range.start, intent.range.end)}</span>}
          {intent && <span className="text-ink-3">·</span>}
          <span className="inline-flex items-baseline gap-1">
            <RollingNumber value={events.length} duration={450} /> events
          </span>

        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:items-end">
        {!running && <PixelLoader label={progressLabel(state)} startedAt={state.startedAt} finishedAt={state.finishedAt} />}
        {state.notices.map((notice) => (
          <span key={notice.kind} role="status" className="inline-flex max-w-full items-center gap-1.5 rounded-card bg-accent-tint py-1 pr-1 pl-2.5 text-[11.5px] text-accent-ink" style={{ animation: "pop-in 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
            <Lightning size={11} weight="fill" />
            <span className="max-w-[52ch] text-pretty">{notice.text}</span>
            {!running && (
              <button type="button" onClick={onLive} className="press min-h-11 shrink-0 rounded-full bg-surface px-2 py-0.5 font-medium text-ink shadow-btn hover:bg-hover sm:min-h-0">
                Run live
              </button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
});

const PipelineSection = memo(function PipelineSection({ state, onStop }: { state: ChronosState; onStop: () => void }) {
  const running = state.status === "running";
  const [manual, setManual] = useState<{ runId: number; open: boolean } | null>(null);
  const open = running || (manual?.runId === state.runId && manual.open);
  return (
    <section aria-label="Investigation progress" className={cn("rounded-[18px]", running && "border border-line bg-inset p-4 sm:p-5")}>
      <div className="flex items-center justify-between gap-2">
        {running ? <PixelLoader label={progressLabel(state)} startedAt={state.startedAt} finishedAt={state.finishedAt} /> :
          <button type="button" aria-expanded={open} onClick={() => setManual({runId: state.runId, open: !open})} className={toolClass}>Sources & process <CaretDown size={13} style={{transform: open ? 'rotate(180deg)' : 'none'}} /></button>}
        {running && <button type="button" onClick={onStop} className={`${toolClass} -mr-2`}>Stop</button>}
      </div>
      {open && <div className="mt-3 flex flex-col gap-2">
        {state.intent && <p className="mb-1 text-[12px] text-ink-3">{RANGE_FROM[state.intent.rangeFrom]}{state.intent.article && <> · <a href={state.intent.article.url} target="_blank" rel="noreferrer" className="underline">Wikipedia article</a></>}</p>}
        <TaskList tasks={state.tasks} live={state.intent?.live ?? null} active={running} />
        <TraceLog key={state.runId} traces={state.traces} running={running} />
      </div>}
    </section>
  );
});

export function ChronosApp({ live, onRunChange }: { live?: boolean; onRunChange?: (hasRun: boolean) => void }) {
  const { state, run, stop, restore, reset } = useChronos();
  const [dates, setDates] = useState<DateDraft>({start: '', end: ''});
  const [dateError, setDateError] = useState<string | null>(null);
  const [runRange, setRunRange] = useState<YearRange | undefined>();
  const [view, setView] = useState('map');
  const sectionNav = useRef<HTMLElement>(null);
  const switchView = (next: string) => {
    setView(next);
    requestAnimationFrame(() => sectionNav.current?.scrollIntoView({block: 'start'}));
  };
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const savedRun = useRef<number | null>(null);
  const archive = useMemo(() => snapshot(state), [state]);
  const saveCurrent = useCallback(() => {
    const result = saveArchive(snapshot(state));
    setSaveFailed(Boolean(result.error));
    setSaveMessage(result.error ?? 'Saved');
  }, [state]);
  useEffect(() => {
    if ((state.status === 'done' || state.status === 'error') && state.order.length && savedRun.current !== state.runId) {
      savedRun.current = state.runId;
      saveCurrent();
    }
  }, [state.status, state.runId, state.order.length, saveCurrent]);
  const [draft, setDraft] = useState("");
  const [pickSurprise] = useState(() => createSurprisePicker());
  useEffect(() => { onRunChange?.(state.status !== "idle"); }, [state.status, onRunChange]);

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
    (q: string, opts: { replay?: boolean; mode?: Mode; range?: YearRange; useDates?: boolean } = {}) => {
      let selected = opts.range;
      if (!opts.replay && opts.useDates !== false && (dates.start || dates.end)) {
        selected = {start: Number(dates.start), end: Number(dates.end)};
        const error = rangeError(selected);
        if (error) { setDateError(error); return; }
      }
      setDateError(null);
      if (opts.replay) setDates({start: '', end: ''});
      setRunRange(selected);
      setSaveMessage(null);
      setSaveFailed(false);
      setView('map');
      stopPlayback();
      setDraft(q);
      setFocusId(null);
      setDetailId(null);
      setFlash(null);
      setHover(null);
      setArea(null);
      setReveal(null);
      run(q, opts.mode ?? mode, { replay: opts.replay, range: selected });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [run, mode, dates, stopPlayback],
  );

  const onCite = useCallback(
    (id: string) => {
      const target = state.events[id] ? id : state.alias[id];
      if (!target) return;
      stopPlayback();
      setFocusId(target);
      setFlash({ id: target, key: Date.now() });
      setDetailId(target);
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

  const runLive = useCallback(() => start(state.query, { replay: false, mode: state.mode, range: runRange, useDates: false }), [start, state.query, state.mode, runRange]);
  const closeDetail = useCallback(() => setDetailId(null), []);

  const onListHover = useCallback((id: string | null) => setHover(id ? { ids: [id], from: "list" } : null), []);
  const onMapHover = useCallback((ids: string[] | null) => setHover(ids && ids.length ? { ids, from: "map" } : null), []);
  const onMapFocus = useCallback((id: string) => {
    setFocusId(id);
    setReveal({ id, key: Date.now() });
  }, []);
  const clearArea = useCallback(() => setArea(null), []);
  const areaFilter = useMemo(() => (area ? { count: filtered.length, unplaced, onClear: clearArea } : null), [area, filtered.length, unplaced, clearArea]);

  const restoreArchive = (a: Archive) => {
    savedRun.current = state.runId + 1;
    stopPlayback();
    setDetailId(null); setFocusId(null); setArea(null); setHover(null); setReveal(null); setFlash(null);
    setDraft(a.state.query); setMode(a.state.mode); setView('map');
    setSaveMessage('Saved'); setSaveFailed(false); setDateError(null);
    const selected = a.state.intent?.rangeFrom === 'selected' ? a.state.intent.range : undefined;
    setRunRange(selected);
    setDates(selected ? {start: String(selected.start), end: String(selected.end)} : {start: '', end: ''});
    restore(a.state);
    window.scrollTo({top: 0});
  };
  const prepareTopic = (q: string, range?: YearRange) => {
    stopPlayback(); reset();
    setDraft(q); setDates(range ? {start: String(range.start), end: String(range.end)} : {start: '', end: ''}); setDateError(null);
    window.scrollTo({top: 0});
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Topic, place or period"]')?.focus({preventScroll: true}));
  };
  const discovery = <DiscoveryControls dates={dates} onDates={value => {setDates(value); setDateError(null);}}
    error={dateError} onSurprise={() => {
      const next = pickSurprise();
      if (next) prepareTopic(surpriseQuery(next), next.range);
    }}>
    <ArchivesButton onRestore={restoreArchive} />
  </DiscoveryControls>;

  if (state.status === "idle") {
    return <Hero draft={draft} setDraft={setDraft} mode={mode} setMode={setMode}
      onSubmit={(q) => start(q)}>
      {discovery}
    </Hero>;
  }

  const cursorForViews = playback.cursor === null ? null : Math.floor(playback.cursor);
  const related = relatedTopics(state.intent?.topic ?? state.query, events);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-12 sm:px-6">
      {!running && <div className="mb-4 flex flex-wrap items-center gap-1">
        <button type="button" className={toolClass} onClick={() => prepareTopic('')}>New search</button>
        <ArchivesButton onRestore={restoreArchive} />
        {events.length > 0 && <ExportButton archive={archive} />}
        {saveMessage && <span role="status" className={cn('px-2 text-[12px] sm:ml-auto', saveFailed ? 'text-red' : 'text-ink-3')}>{saveMessage}
          {saveFailed && <button type="button" className={toolClass} onClick={saveCurrent}>Try saving again</button>}
        </span>}
      </div>}
      <RunHeader state={state} events={events} onLive={runLive} />

      {state.status === 'error' && <div role="alert" className="mt-4 rounded-card bg-red-tint px-4 py-3 text-[13px] text-red">
        <p>{state.error}</p>
        <button type="button" className={toolClass} onClick={runLive}>Try again</button>
      </div>}

      <div className={cn('mt-4', running && !events.length && 'mx-auto max-w-[680px]')}>
        <PipelineSection state={state} onStop={stop} />
      </div>

      {events.length > 0 ? <>
        <nav ref={sectionNav} aria-label="Timeline sections" className="scroll-mt-12 sticky top-12 z-20 -mx-4 mt-4 flex gap-1 border-b border-line bg-page/95 px-4 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:hidden">
          {['map', 'events', 'story'].map(id => <button key={id} type="button" aria-controls={`chronos-${id}`} aria-pressed={view === id}
            onClick={() => {switchView(id); if(id !== 'map') stopPlayback();}}
            className={cn('min-h-11 flex-1 border-b-2 px-3 text-[14px] font-medium capitalize', view === id ? 'border-accent-ink text-ink' : 'border-transparent text-ink-3')}>{id[0].toUpperCase() + id.slice(1)}</button>)}
        </nav>
        <div data-mobile-view={view} className="chronos-results mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="chronos-stage min-w-0 lg:flex lg:flex-col lg:gap-4">
            <section id="chronos-map" aria-label="Map" className="chronos-map-panel flex flex-col gap-3">
              <div className="rounded-[14px] bg-surface p-2 shadow-card sm:p-3">
                <InvestigationMap events={events} cursorYear={cursorForViews} playing={playback.playing} range={range}
                  selectedId={focusId} hoverIds={hover?.ids ?? null} onHover={onMapHover} onFocusEvent={onMapFocus}
                  onOpen={onSelect} area={area} onAreaChange={setArea} interactive loading={running}
                  liveModel={isLive} resetKey={state.runId} legend />
              </div>
              {range && <div className="rounded-[14px] bg-surface px-3 pt-3 pb-1.5 shadow-card sm:px-4">
                <TimeScrubber range={range} events={filtered} eras={state.eras} cursor={playback.cursor} playing={playback.playing} onScrub={playback.scrub} onTogglePlay={playback.toggle} />
              </div>}
              {area && <button type="button" className={toolClass} onClick={() => switchView('events')}>View {filtered.length} events in this area</button>}
            </section>
            <section id="chronos-story" aria-label="Story" className="chronos-story-panel px-0.5 pt-2">
              {state.narrative ? <Narrative text={state.narrative} streaming={running && state.narrative.length > 0}
                events={state.events} alias={state.alias} intent={state.intent} source={state.narrativeSource} onCite={onCite} emphasis={emphasis} /> :
                <p className="py-8 text-[14px] text-ink-3">{running ? 'Your story will appear here after the sources finish.' : 'No story was completed. You can still explore and export the events.'}</p>}
            </section>
          </div>
          <ScrollFade id="chronos-events" axis="y" className="chronos-events-panel min-w-0 lg:sticky lg:top-[60px] lg:max-h-[calc(100dvh-72px)] lg:self-start lg:-mx-2 lg:px-2 lg:pb-2" fade={32}>
            <EventList events={filtered} live={isLive} cursor={cursorForViews} selectedId={focusId} flash={flash} merges={merges}
              running={running} onSelect={onSelect} linkedIds={hover?.from === 'map' ? hover.ids : null} onHover={onListHover} reveal={reveal} areaFilter={areaFilter} />
          </ScrollFade>
        </div>
        {!running && related.length > 0 && <section className="mt-8 border-t border-line pt-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-2">Keep exploring</h2>
          <div className="flex flex-wrap gap-2">{related.map(q => <button type="button" key={q} onClick={() => prepareTopic(q)} className={`${toolClass} max-w-full border border-line bg-surface text-left`}>{q}<ArrowUpRight className="shrink-0" size={13} /></button>)}</div>
        </section>}
      </> : !running && state.status !== 'error' && <p className="py-10 text-center text-[14px] text-ink-2">{state.stopped ? 'Stopped before any events arrived.' : 'No events were found. Try another topic or a wider date range.'}</p>}
      <EventDetail event={detailId ? state.events[detailId] ?? null : null} live={isLive} onClose={closeDetail} />
    </div>
  );
}
