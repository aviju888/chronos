"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/modern/lib/cn";

/* ─────────────────────────────────────────────────────────
 * SCROLL FADE — craft "Scroll Fades": edges fade only in the
 * directions that still have content, so the fade doubles as a
 * "there's more" hint and disappears at the ends.
 * ───────────────────────────────────────────────────────── */

export function ScrollFade({
  children,
  className,
  axis = "y",
  fade = 28,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; axis?: "x" | "y" | "both"; fade?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const y = axis !== "x";
      const x = axis !== "y";
      el.dataset.fadeTop = String(y && el.scrollTop > 1);
      el.dataset.fadeBottom = String(y && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
      el.dataset.fadeLeft = String(x && el.scrollLeft > 1);
      el.dataset.fadeRight = String(x && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [axis]);

  return (
    <div
      ref={ref}
      className={cn(
        "scroll-fade",
        axis === "x" ? "overflow-x-auto" : axis === "y" ? "overflow-y-auto" : "overflow-auto",
        className,
      )}
      {...rest}
      style={{ ["--fade" as string]: `${fade}px`, ...style }}
    >
      {children}
    </div>
  );
}
