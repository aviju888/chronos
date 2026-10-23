"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { YearRange } from "@/modern/lib/chronos/types";

/* ─────────────────────────────────────────────────────────
 * usePlayback — one cursor shared by the scrubber, the map
 * and the event list. null means "not scrubbing": the whole
 * range is lit. Playback runs on requestAnimationFrame and
 * takes 9–16s depending on how much there is to see.
 * ───────────────────────────────────────────────────────── */

export function usePlayback(range: YearRange | null, eventCount: number) {
  const [cursor, setCursorState] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const cursorRef = useRef<number | null>(null);
  const rangeKey = range ? `${range.start}:${range.end}` : "";

  // a new range resets the playhead (adjusting state while rendering, not in an effect)
  const [seenRange, setSeenRange] = useState(rangeKey);
  if (seenRange !== rangeKey) {
    setSeenRange(rangeKey);
    setPlaying(false);
    setCursorState(null);
  }

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const setCursor = useCallback((year: number | null) => {
    cursorRef.current = year;
    setCursorState(year);
  }, []);

  useEffect(() => {
    if (!playing || !range) return;
    const span = range.end - range.start;
    const duration = Math.min(16000, Math.max(9000, eventCount * 160));
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const cur = cursorRef.current ?? range.start;
      const next = cur + (span * dt) / duration;
      if (next >= range.end) {
        setCursor(range.end);
        setPlaying(false);
        return;
      }
      setCursor(next);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rangeKey, eventCount, setCursor]);

  const toggle = useCallback(() => {
    if (!range) return;
    setPlaying((p) => {
      if (p) return false;
      const cur = cursorRef.current;
      if (cur === null || cur >= range.end - 0.5) setCursor(range.start);
      return true;
    });
  }, [range, setCursor]);

  const scrub = useCallback(
    (year: number) => {
      setPlaying(false);
      setCursor(year);
    },
    [setCursor],
  );

  const stop = useCallback(() => setPlaying(false), []);

  return { cursor, playing, toggle, scrub, setCursor, stop };
}
