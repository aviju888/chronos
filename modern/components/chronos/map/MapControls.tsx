"use client";

import type { ReactNode } from "react";
import { ArrowCounterClockwise, Minus, Path, Plus, Selection } from "@phosphor-icons/react";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "../Tooltip";

/* Map controls, Beautiful UI style: raised groups of 28px icon buttons.
 * Group radius 10 = button radius 8 + 2px inset. Hover is instant. */

function IconButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip
      content={
        <span>
          {label}
          {shortcut ? <span style={{ color: "var(--tooltip-muted)" }}> {shortcut}</span> : null}
        </span>
      }
    >
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "primitive-icon-button press disabled:opacity-35",
          pressed ? "bg-accent-tint text-accent-ink" : "text-ink-2 enabled:hover:bg-hover enabled:hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}

const GROUP = "flex flex-col rounded-card bg-surface p-0.5 shadow-raised";

export function MapControls({
  onZoomIn,
  onZoomOut,
  onReset,
  canZoomIn,
  canZoomOut,
  drawing,
  onToggleDraw,
  trail,
  onToggleTrail,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
  drawing: boolean;
  onToggleDraw: () => void;
  trail: boolean;
  onToggleTrail: () => void;
}) {
  return (
    <div data-map-ui className="absolute right-2 bottom-2 z-20 flex flex-col gap-1.5">
      <div className={GROUP}>
        <IconButton label="Zoom in" shortcut="+" onClick={onZoomIn} disabled={!canZoomIn}>
          <Plus size={14} weight="bold" />
        </IconButton>
        <IconButton label="Zoom out" shortcut="−" onClick={onZoomOut} disabled={!canZoomOut}>
          <Minus size={14} weight="bold" />
        </IconButton>
      </div>
      <div className={GROUP}>
        <IconButton label="Reset view" shortcut="0" onClick={onReset}>
          <ArrowCounterClockwise size={14} weight="bold" />
        </IconButton>
        <IconButton label="Select area" shortcut="Shift + drag" pressed={drawing} onClick={onToggleDraw}>
          <Selection size={15} weight="bold" />
        </IconButton>
        <IconButton label={trail ? "Hide trail" : "Show trail"} pressed={trail} onClick={onToggleTrail}>
          <Path size={15} weight="bold" />
        </IconButton>
      </div>
    </div>
  );
}
