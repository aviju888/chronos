"use client";

import { Lightning } from "@phosphor-icons/react";
import { ScrollFade } from "@/modern/components/craft/ScrollFade";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "./Tooltip";

/* Saved runs: clicking one replays the recorded pipeline instantly. */
export function SuggestionChips({
  examples,
  onPick,
  disabled,
  className,
  label = "Try",
  wrap = false,
}: {
  examples: string[];
  onPick: (q: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  /** wrap onto more lines (hero) instead of a horizontal rail with scroll fades */
  wrap?: boolean;
}) {
  const chips = (
    <>
      <span className="shrink-0 pr-0.5 text-[12px] text-ink-3">{label}</span>
      {examples.map((q, i) => (
        <Tooltip key={q} content="Replays a recorded run of the real pipeline">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="press inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-2 text-[12.5px] font-medium whitespace-nowrap text-ink-2 shadow-btn hover:bg-hover hover:text-ink disabled:opacity-50 sm:h-7"
            style={{ animation: `fade-up 360ms cubic-bezier(0.23,1,0.32,1) ${120 + i * 50}ms both` }}
          >
            <Lightning size={12} weight="fill" className="text-accent" />
            {q.replace(" - ", " – ")}
          </button>
        </Tooltip>
      ))}
    </>
  );

  if (wrap) return <div className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}>{chips}</div>;
  return (
    <ScrollFade axis="x" fade={24} className={cn("chronos-rail min-w-0", className)}>
      {/* padding keeps the chips' shadows from being clipped by the scroller */}
      <div className="flex w-max items-center gap-1.5 px-0.5 py-1">{chips}</div>
    </ScrollFade>
  );
}
