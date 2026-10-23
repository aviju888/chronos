"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "@phosphor-icons/react";
import type { Mode } from "@/modern/lib/chronos/types";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "./Tooltip";

/* ─────────────────────────────────────────────────────────
 * PROMPT COMPOSER — Beautiful UI's Prompt Bar, forked.
 * Same shell (hairline border, card shadow, 14/22px radius,
 * ink send square), with the model picker's slot holding a
 * Quick / Deep toggle. While a run streams, send → stop.
 * ───────────────────────────────────────────────────────── */

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "quick", label: "Quick", hint: "The topic's history section, 16 model claims, 50 Wikidata events" },
  { id: "deep", label: "Deep", hint: "Reads the full History of… article (or the whole topic article), about twice the lookups" },
];

export function ModeToggle({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Depth" className="inline-flex shrink-0 rounded-control bg-field p-0.5 shadow-inset-field">
      {MODES.map((m) => (
        <Tooltip key={m.id} content={m.hint}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={cn(
              "h-6 rounded-[6px] px-2 text-[12px] font-medium disabled:opacity-50",
              mode === m.id ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:text-ink",
            )}
          >
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  mode,
  onModeChange,
  running = false,
  onStop,
  tall = false,
  autoFocus = false,
  placeholder = "Type an era, a place or a topic",
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  running?: boolean;
  onStop?: () => void;
  tall?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  suggestions?: readonly string[];
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;
  const hintId = useId();
  const [focused, setFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  const suggestion = suggestions?.[suggestionIndex % suggestions.length];
  const showSuggestion = value.length === 0 && !running && Boolean(suggestion);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!showSuggestion || reducedMotion || !suggestions || suggestions.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setSuggestionIndex((index) => (index + 1) % suggestions.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [showSuggestion, reducedMotion, suggestions]);

  // grow with the text, up to a compact maximum (same rule as the kit's composer)
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const min = tall ? 48 : 28;
    input.style.height = "0px";
    const h = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(h, min), 96)}px`;
    input.style.overflowY = h > 96 ? "auto" : "hidden";
  }, [value, tall]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const submit = () => {
    if (!canSend || running) return;
    onSubmit(value.trim());
  };

  const sendButton = (
    <button
      type="button"
      aria-label={running ? "Stop" : "Build timeline"}
      disabled={!running && !canSend}
      onClick={running ? onStop : submit}
      className="flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-transform duration-150 enabled:active:scale-[0.94]"
      style={{
        background: running || canSend ? "var(--ink)" : "var(--line-strong)",
        color: running || canSend ? "var(--surface)" : "var(--ink-2)",
      }}
    >
      {running ? <Square size={11} weight="fill" /> : <ArrowUp size={16} weight="bold" />}
    </button>
  );

  return (
    <div
      className={cn(
        "relative isolate flex w-full flex-col overflow-hidden border border-line bg-surface shadow-card transition-[border-color,border-radius] duration-150 focus-within:border-line-strong",
        tall ? "gap-2 rounded-[22px] p-3" : "gap-1.5 rounded-[14px] p-1.5",
      )}
    >
      <div className={cn("flex items-end gap-1.5", tall && "flex-col items-stretch gap-2")}>
        <div className="relative min-w-0 flex-1 self-stretch text-left">
          {showSuggestion && (
            <span
              key={suggestion}
              aria-hidden="true"
              data-prompt-suggestion
              className={cn("pointer-events-none absolute inset-x-0 top-0 px-1.5 text-ink-3", tall ? "py-1 text-[15px] leading-6" : "py-[5px] text-[13px] leading-[18px]")}
              style={!reducedMotion && suggestions && suggestions.length > 1 ? { animation: 'chronos-prompt-suggestion 4500ms ease-in-out infinite' } : undefined}
            >{suggestion}</span>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && showSuggestion && suggestion) {
                e.preventDefault();
                onChange(suggestion);
                return;
              }
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={showSuggestion ? undefined : placeholder}
            aria-label="Topic, place or period"
            aria-describedby={showSuggestion ? hintId : undefined}
            spellCheck={false}
            className={cn(
              "block w-full min-w-0 resize-none bg-transparent text-ink outline-none [overflow-wrap:anywhere] placeholder:text-ink-3",
              tall ? "px-1.5 py-1 text-[15px] leading-6" : "min-h-7 px-1.5 py-[5px] text-[13px] leading-[18px]",
            )}
          />
          {showSuggestion && <span id={hintId} className="sr-only">Suggested prompt: {suggestion}. Press Tab to use it, or type your own topic.</span>}
        </div>
        <div className={cn("flex shrink-0 items-center gap-1.5", tall && "justify-between")}>
          <ModeToggle
            mode={mode}
            disabled={running}
            onChange={onModeChange}
          />
          {tall && focused && showSuggestion && <span aria-hidden="true" className="ml-auto mr-2 hidden items-center gap-1.5 text-[11px] text-ink-3 sm:inline-flex"><kbd className="rounded border border-line px-1 py-0.5 font-sans">Tab</kbd> to use</span>}
          {sendButton}
        </div>
      </div>
    </div>
  );
}
