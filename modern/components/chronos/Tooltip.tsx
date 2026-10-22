"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/* ─────────────────────────────────────────────────────────
 * TOOLTIP — craft "Tooltip Delay": the first one waits
 * ~500ms; once one has shown, neighbours open instantly
 * until the pointer rests elsewhere for a moment.
 * Wraps its trigger in a layout-neutral element (a
 * display:contents span, or a <g> inside SVG), portals the
 * bubble, and flips below when there's no room above.
 * ───────────────────────────────────────────────────────── */

const FIRST_DELAY = 500;
const WARM_FOR = 450;
const warmth = { lastClosedAt: 0, anyOpen: false };

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** wider bubble for lists (citations) */
  wide?: boolean;
  disabled?: boolean;
  /** render the wrapper as an SVG group (for map pins) */
  as?: "span" | "g";
};

export function Tooltip({ content, children, side = "top", wide = false, disabled = false, as = "span" }: Props) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const wrapRef = useRef<HTMLSpanElement & SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anchor = (): Element | null => {
    const w = wrapRef.current;
    if (!w) return null;
    return as === "g" ? w : (w.firstElementChild ?? w);
  };

  const show = () => {
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    const warm = warmth.anyOpen || Date.now() - warmth.lastClosedAt < WARM_FOR;
    timer.current = setTimeout(
      () => {
        warmth.anyOpen = true;
        setOpen(true);
      },
      warm ? 0 : FIRST_DELAY,
    );
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (warmth.anyOpen) warmth.lastClosedAt = Date.now();
    warmth.anyOpen = false;
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const el = anchor();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = tipRef.current?.getBoundingClientRect().height ?? 28;
    const below = side === "bottom" || r.top - h - 10 < 8;
    const x = Math.min(Math.max(r.left + r.width / 2, 12), window.innerWidth - 12);
    setBox({ x, y: below ? r.bottom + 8 : r.top - 8, below });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side, content]);

  // close on scroll so a bubble never floats away from its anchor
  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (timer.current) clearTimeout(timer.current);
      warmth.anyOpen = false;
      warmth.lastClosedAt = Date.now();
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const handlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") show();
    },
    onPointerLeave: hide,
    onFocus: show,
    onBlur: hide,
  };

  const bubble =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className={`pointer-events-none fixed z-[70] rounded-[8px] px-2 py-1.5 text-[11.5px] leading-snug shadow-overlay ${wide ? "w-max max-w-72" : "w-max max-w-60"}`}
            style={{
              left: box?.x ?? -999,
              top: box?.y ?? -999,
              transform: `translate(-50%, ${box?.below ? "0" : "-100%"})`,
              background: "var(--tooltip-bg)",
              color: "var(--tooltip-fg)",
              border: "1px solid var(--tooltip-border)",
              visibility: box ? "visible" : "hidden",
              animation: "chronos-tip-in 140ms cubic-bezier(0.23,1,0.32,1) both",
            }}
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  if (as === "g") {
    return (
      <g ref={wrapRef} {...handlers}>
        {children}
        {bubble}
      </g>
    );
  }
  return (
    <span ref={wrapRef} className="contents" {...handlers}>
      {children}
      {bubble}
    </span>
  );
}
