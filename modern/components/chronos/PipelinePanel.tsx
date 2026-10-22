"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import type { TaskId, TaskUpdate, TraceLine } from "@/modern/lib/chronos/types";
import { RollingNumber } from "@/modern/components/craft/RollingNumber";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { SourceGlyph } from "./sources";

/* ─────────────────────────────────────────────────────────
 * PIPELINE PANEL — three Beautiful UI parts, forked to be
 * driven by the real run instead of demo timers:
 *   PixelLoader  ← Loading State (Drive grid + label + elapsed; no shimmer band)
 *   TaskList     ← Task Rows (capsules, live counts, details)
 *   TraceLog     ← Thinking (expandable trace; SPARQL in mono)
 * ───────────────────────────────────────────────────────── */

/* ── Loading State fork ── */

const CHEVRON = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

export function LoaderGrid({ still = false }: { still?: boolean }) {
  return (
    <span aria-hidden className="grid shrink-0 grid-cols-[repeat(3,4px)] gap-[1.5px]">
      {CHEVRON.map((delay, i) => (
        <span
          key={i}
          className="size-[4px] rounded-[1px] bg-ink"
          style={{ opacity: still ? (i % 2 === 0 ? 0.55 : 0.18) : 0.15, animation: still ? "none" : `pixel-on 650ms ease-in-out ${delay}ms infinite` }}
        />
      ))}
    </span>
  );
}

function useElapsed(startedAt: number | null, finishedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [startedAt, finishedAt]);
  if (!startedAt) return 0;
  return Math.max(0, ((finishedAt ?? now) - startedAt) / 1000);
}

export function PixelLoader({ label, startedAt, finishedAt }: { label: string; startedAt: number | null; finishedAt: number | null }) {
  const elapsed = useElapsed(startedAt, finishedAt);
  const running = !finishedAt;
  const text = elapsed < 60 ? `${elapsed.toFixed(1)}s` : `${Math.floor(elapsed / 60)}m ${(elapsed % 60).toFixed(1)}s`;
  return (
    <div role="status" className="flex w-fit items-center gap-2.5">
      <LoaderGrid still={!running} />
      <span className={cn("text-[13px] font-medium", running ? "text-ink" : "text-ink-2")}>{label}</span>
      <span className="num font-mono text-[12px] text-ink-3">{text}</span>
    </div>
  );
}

/* ── Task Rows fork ── */

function SpinnerRing({ active, children }: { active?: boolean; children?: React.ReactNode }) {
  const size = 24;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center text-ink-2" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0" style={active ? { animation: "spin 1.1s linear infinite" } : undefined}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {active && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-3)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * 0.28} ${c * 0.72}`} />}
      </svg>
      <span className="relative flex">{children}</span>
    </span>
  );
}

function Badge({ tone, children }: { tone: "red" | "green"; children: React.ReactNode }) {
  return (
    <span
      className={cn("flex size-5.5 shrink-0 items-center justify-center rounded-full text-white", tone === "red" ? "bg-red" : "bg-green")}
      style={{ animation: "pop-in 300ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {children}
    </span>
  );
}

const ORDER: TaskId[] = ["llm", "wikidata", "wikipedia", "dedup"];

export function TaskList({ tasks, live }: { tasks: Record<TaskId, TaskUpdate>; live: boolean | null }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="flex flex-col gap-2">
      {ORDER.map((id, i) => {
        const t = tasks[id];
        const isOpen = open[id] ?? false;
        const label = id === "llm" ? (live === null ? "Model pass" : live ? "Model seed events" : "Model pass (scripted)") : t.label;
        const badge =
          t.status === "done" ? (
            <Badge tone="green">
              <Check size={12} weight="bold" />
            </Badge>
          ) : t.status === "failed" ? (
            <Badge tone="red">
              <X size={11} weight="bold" />
            </Badge>
          ) : (
            <SpinnerRing active={t.status === "running"}>
              <SourceGlyph source={id} size={11} />
            </SpinnerRing>
          );
        const pill =
          t.status === "done" ? (
            <span className="inline-flex h-5.5 items-center rounded-full bg-green-tint px-2 text-[11.5px] font-medium text-green" style={{ animation: "fade-in 200ms ease-out both" }}>
              Done
            </span>
          ) : t.status === "failed" ? (
            <span className="inline-flex h-5.5 items-center rounded-full bg-red-tint px-2 text-[11.5px] font-medium text-red">Partial</span>
          ) : t.status === "skipped" ? (
            <span className="inline-flex h-5.5 items-center rounded-full bg-field px-2 text-[11.5px] font-medium text-ink-2">Skipped</span>
          ) : null;
        const steps = t.steps ?? [];
        return (
          <div
            key={id}
            className="self-stretch overflow-hidden bg-surface shadow-card transition-[border-radius] duration-300 hover:bg-inset"
            style={{ borderRadius: isOpen ? 14 : 22, animation: `fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${i * 60}ms both` }}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              disabled={steps.length === 0}
              onClick={() => setOpen((cur) => ({ ...cur, [id]: !isOpen }))}
              className="flex h-11 w-full items-center gap-2.5 px-2.5 text-left disabled:cursor-default"
            >
              <span className="flex size-6 shrink-0 items-center justify-center">{badge}</span>
              <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", t.status === "pending" ? "text-ink-2" : "text-ink")}>{label}</span>
              <span className="flex items-baseline gap-1 text-[12.5px] whitespace-nowrap text-ink-2">
                <RollingNumber value={t.count ?? 0} duration={500} />
                <span>{t.unit === "merges" ? ((t.count ?? 0) === 1 ? "merge" : "merges") : (t.count ?? 0) === 1 ? "event" : "events"}</span>
              </span>
              {pill}
              <span aria-hidden className={cn("-ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3", steps.length === 0 && "opacity-0")}>
                <CaretDown size={13} weight="bold" className="transition-transform duration-300" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows,opacity] duration-300"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
            >
              <div className="overflow-hidden">
                <div className="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-2.5">
                  <span aria-hidden className="mx-auto h-full w-px bg-line" />
                  <div className="flex flex-col gap-1.5">
                    {steps.map((d, j) => (
                      <div
                        key={d.label}
                        className="flex items-center justify-between gap-3"
                        style={isOpen ? { animation: `fade-up 300ms cubic-bezier(0.23,1,0.32,1) ${120 + j * 60}ms both` } : undefined}
                      >
                        <span className="text-[12px] text-ink-2">{d.label}</span>
                        <span className="num truncate font-mono text-[11.5px] text-ink-3">{d.meta}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Thinking fork: the live trace ── */

function SparqlBlock({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  return (
    <ScrollFade axis="both" fade={18} className="max-h-44 rounded-[8px] bg-inset shadow-hairline" tabIndex={0} aria-label="SPARQL query">
      <pre className="px-2.5 py-2 font-mono text-[10.5px] leading-[1.55] whitespace-pre text-ink-2">
        {lines.map((line, i) => (
          <span key={i} className="block">
            {highlight(line)}
          </span>
        ))}
      </pre>
    </ScrollFade>
  );
}

/** tiny SPARQL highlighter: keywords, ids, variables */
function highlight(line: string) {
  const parts = line.split(/(\b(?:SELECT|WHERE|OPTIONAL|UNION|FILTER|VALUES|GROUP BY|ORDER BY|LIMIT|SERVICE|AS|DESC|MIN|MAX|SAMPLE|GROUP_CONCAT|YEAR|DISTINCT)\b|wdt?:\w+|psv?:\w+|\?\w+)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (/^(SELECT|WHERE|OPTIONAL|UNION|FILTER|VALUES|GROUP BY|ORDER BY|LIMIT|SERVICE|AS|DESC|MIN|MAX|SAMPLE|GROUP_CONCAT|YEAR|DISTINCT)$/.test(p))
      return (
        <span key={i} className="text-accent-ink">
          {p}
        </span>
      );
    if (/^(wdt?|psv?):/.test(p))
      return (
        <span key={i} className="text-ink">
          {p}
        </span>
      );
    if (p.startsWith("?"))
      return (
        <span key={i} className="text-ink-3">
          {p}
        </span>
      );
    return <span key={i}>{p}</span>;
  });
}

export function TraceLog({ traces, running }: { traces: TraceLine[]; running: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const expanded = manual ?? running;
  const contentRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  // follow the newest line unless the reader scrolled up (the ScrollFade div is the scroller)
  useLayoutEffect(() => {
    const scroller = contentRef.current?.parentElement;
    if (scroller && stick.current && expanded) scroller.scrollTop = scroller.scrollHeight;
  }, [traces.length, expanded]);

  const merges = traces.filter((t) => t.source === "dedup" && t.text.startsWith("Merged")).length;

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setManual(!expanded)}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-control px-1.5 py-1 hover:bg-hover-2"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={running ? "var(--ink-2)" : "var(--ink-3)"} aria-hidden>
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span role="status" className="contents">
          {running ? (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink">Tracing sources</span>
          ) : (
            <span className="text-[13px] font-medium whitespace-nowrap text-ink-2" style={{ animation: "fade-in 350ms ease-out both" }}>
              Traced {traces.length} steps{merges ? `, ${merges} merges` : ""}
            </span>
          )}
        </span>
        <CaretDown size={13} weight="bold" className="text-ink-3 transition-transform duration-300" style={{ transform: expanded ? "rotate(180deg)" : "none" }} />
      </button>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-400"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
      >
        <div className="overflow-hidden">
          <div className="relative mt-1 ml-[6px] pl-4">
            <span aria-hidden className="absolute top-0 bottom-2 left-[3px] w-px bg-line" />
            <ScrollFade
              axis="y"
              fade={22}
              className="max-h-[300px]"
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
              }}
            >
              <div ref={contentRef} className="flex flex-col gap-1.5 py-1 pr-1">
                {traces.map((t, i) => {
                  const merge = t.source === "dedup" && t.text.startsWith("Merged");
                  return (
                    <div key={i} className="flex min-w-0 items-start gap-2" style={{ animation: "fade-up 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
                      <span className={cn("mt-[3px] flex size-3.5 shrink-0 items-center justify-center", merge ? "text-ink-3" : "text-ink-2")}>
                        <SourceGlyph source={t.source === "intent" ? "wikipedia" : t.source} size={11} />
                      </span>
                      {t.kind === "query" ? (
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-[12px] font-medium text-ink">{t.source === "wikidata" ? "SPARQL on query.wikidata.org" : "Query"}</span>
                          <SparqlBlock text={t.text} />
                        </div>
                      ) : (
                        <span className={cn("min-w-0 flex-1 text-[12px] leading-[1.45]", merge ? "truncate text-ink-3" : "text-ink-2")}>{t.text}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollFade>
          </div>
        </div>
      </div>
    </div>
  );
}
