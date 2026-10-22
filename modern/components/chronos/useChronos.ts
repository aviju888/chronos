"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { postSSE } from "@/modern/lib/sse-client";
import type { ChronosEvent, Era, Intent, MergeInfo, Mode, NarrativeSource, NarrativeUpdate, Notice, TaskId, TaskUpdate, TraceLine } from "@/modern/lib/chronos/types";

/* ─────────────────────────────────────────────────────────
 * useChronos — one run of the pipeline as React state.
 * Frames from POST /api/chronos/stream fold into a reducer;
 * merges are also kept in a short log so cards can play the
 * Merge Moment for them.
 * ───────────────────────────────────────────────────────── */

export type RunStatus = "idle" | "running" | "done" | "error";

export type MergeAnim = MergeInfo & { at: number; key: string };

export type ChronosState = {
  status: RunStatus;
  query: string;
  mode: Mode;
  replay: boolean;
  intent: Intent | null;
  tasks: Record<TaskId, TaskUpdate>;
  traces: TraceLine[];
  events: Record<string, ChronosEvent>;
  /** canonical ids sorted by year */
  order: string[];
  /** raw record id → canonical id, for citations that point at merged records */
  alias: Record<string, string>;
  merges: MergeAnim[];
  mergeCount: number;
  eras: Era[];
  narrative: string;
  narrativeSource: NarrativeSource | null;
  notices: Notice[];
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** the reader pressed stop before the run finished */
  stopped: boolean;
  runId: number;
};

const LABELS: Record<TaskId, string> = {
  llm: "Model pass",
  wikidata: "Wikidata SPARQL",
  wikipedia: "Wikipedia articles",
  dedup: "Dedup and merge",
};

function emptyTasks(): Record<TaskId, TaskUpdate> {
  return {
    llm: { id: "llm", label: LABELS.llm, status: "pending", count: 0, unit: "events" },
    wikidata: { id: "wikidata", label: LABELS.wikidata, status: "pending", count: 0, unit: "events" },
    wikipedia: { id: "wikipedia", label: LABELS.wikipedia, status: "pending", count: 0, unit: "events" },
    dedup: { id: "dedup", label: LABELS.dedup, status: "pending", count: 0, unit: "merges" },
  };
}

export const initialState: ChronosState = {
  status: "idle",
  query: "",
  mode: "quick",
  replay: false,
  intent: null,
  tasks: emptyTasks(),
  traces: [],
  events: {},
  order: [],
  alias: {},
  merges: [],
  mergeCount: 0,
  eras: [],
  narrative: "",
  narrativeSource: null,
  notices: [],
  error: null,
  startedAt: null,
  finishedAt: null,
  stopped: false,
  runId: 0,
};

type Action =
  | { type: "start"; query: string; mode: Mode; replay: boolean }
  | { type: "frame"; event: string; data: unknown; at: number }
  | { type: "finish"; at: number }
  | { type: "stop"; at: number }
  | { type: "fail"; message: string; at: number }
  | { type: "reset" };

function sortIds(events: Record<string, ChronosEvent>): string[] {
  return Object.values(events)
    .sort((a, b) => a.year - b.year || b.weight - a.weight || a.title.localeCompare(b.title))
    .map((e) => e.id);
}

function withEvent(state: ChronosState, ev: ChronosEvent): Pick<ChronosState, "events" | "order" | "alias"> {
  const events = { ...state.events, [ev.id]: ev };
  const isNew = !state.events[ev.id];
  const yearChanged = !isNew && state.events[ev.id].year !== ev.year;
  const alias = { ...state.alias };
  for (const rid of ev.mergedFrom) alias[rid] = ev.id;
  return { events, order: isNew || yearChanged ? sortIds(events) : state.order, alias };
}

export function reducer(state: ChronosState, action: Action): ChronosState {
  switch (action.type) {
    case "start":
      return {
        ...initialState,
        status: "running",
        query: action.query,
        mode: action.mode,
        replay: action.replay,
        startedAt: Date.now(),
        runId: state.runId + 1,
      };
    case "reset":
      return { ...initialState, runId: state.runId + 1 };
    case "finish":
      if (state.status !== "running") return state;
      return { ...state, status: "done", finishedAt: action.at };
    case "stop":
      if (state.status !== "running") return state;
      return { ...state, status: "done", stopped: true, finishedAt: action.at };
    case "fail":
      return { ...state, status: "error", error: action.message, finishedAt: action.at };
    case "frame": {
      if (state.status !== "running") return state;
      const { event, data } = action;
      switch (event) {
        case "intent":
          return { ...state, intent: data as Intent };
        case "task": {
          const t = data as TaskUpdate;
          return { ...state, tasks: { ...state.tasks, [t.id]: { ...state.tasks[t.id], ...t } } };
        }
        case "trace":
          return { ...state, traces: [...state.traces, data as TraceLine] };
        case "event":
          return { ...state, ...withEvent(state, (data as { event: ChronosEvent }).event) };
        case "merge": {
          const m = data as MergeInfo;
          const anim: MergeAnim = { ...m, at: action.at, key: `${m.keptId}:${m.mergedIds.join(",")}` };
          return {
            ...state,
            ...withEvent(state, m.event),
            merges: [...state.merges.filter((x) => action.at - x.at < 2500).slice(-40), anim],
            mergeCount: state.mergeCount + 1,
          };
        }
        case "eras":
          return { ...state, eras: (data as { eras: Era[] }).eras };
        case "narrative": {
          const update = data as NarrativeUpdate;
          return {
            ...state,
            narrative: (update.replace ? "" : state.narrative) + update.delta,
            narrativeSource: update.source ?? state.narrativeSource ?? (state.intent?.live ? "model" : "composed"),
          };
        }
        case "notice": {
          const notice = data as Notice;
          return { ...state, notices: [...state.notices.filter((n) => n.kind !== notice.kind), notice] };
        }
        case "error":
          return { ...state, status: "error", error: (data as { message: string }).message, finishedAt: action.at };
        case "done":
          return state.status === "running" ? { ...state, status: "done", finishedAt: action.at } : state;
        default:
          return state;
      }
    }
  }
}

export function useChronos() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "stop", at: Date.now() });
  }, []);

  const run = useCallback(async (query: string, mode: Mode, { replay = false }: { replay?: boolean } = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "start", query, mode, replay });
    try {
      await postSSE(
        "/api/chronos/stream",
        { query, mode, replay },
        (event, data) => {
          if (controller.signal.aborted) return;
          dispatch({ type: "frame", event, data, at: Date.now() });
        },
        controller.signal,
      );
      if (!controller.signal.aborted) dispatch({ type: "finish", at: Date.now() });
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      let friendly = message;
      try {
        const parsed = JSON.parse(message.replace(/^\d+\s+[^{]*/, "")) as { error?: string };
        if (parsed.error) friendly = parsed.error;
      } catch {
        // not JSON
      }
      dispatch({ type: "fail", message: friendly || "Something went wrong. Try again.", at: Date.now() });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, run, stop, reset };
}
