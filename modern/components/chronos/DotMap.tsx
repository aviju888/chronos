"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrosshairSimple, MapPin, X } from "@phosphor-icons/react";
import type { ChronosEvent, YearRange } from "@/modern/lib/chronos/types";
import { fitView, focusPoints, matchAspect, WORLD, type View } from "@/modern/lib/chronos/geo";
import {
  boxFromPoints,
  clusterPins,
  clusterRadius,
  constrain,
  easeOutStrong,
  inBox,
  lerpView,
  MIN_LNG_SPAN,
  panBy,
  spanLimits,
  toGeo,
  toScreen,
  trailOrder,
  trailSegments,
  viewsClose,
  zoomAt,
  type GeoBox,
  type PinCluster,
  type ScreenPoint,
  type Size,
} from "@/modern/lib/chronos/mapview";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { Tooltip } from "./Tooltip";
import { LandCanvas } from "./map/LandCanvas";
import { MapControls } from "./map/MapControls";
import { ClusterCard, EventPinCard } from "./map/PinCard";

/* ─────────────────────────────────────────────────────────
 * DOT-MATRIX MAP — world land as a grid of dots (the kit's
 * pixel loader, as geography), with the run's events on top.
 *
 *   pan & zoom   drag; ⌘/Ctrl + wheel or pinch; double-click
 *                (⇧ zooms out); arrows, + − 0 when focused.
 *                A plain wheel and one-finger touch scroll the
 *                page and show a hint instead (cooperative).
 *   follow       frames new pins until the reader moves the
 *                map; then a Recenter pill brings it back.
 *   clusters     pins within 17px merge into a count bubble;
 *                click zooms to its members, or lists them
 *                when they share a place.
 *   pin card     click a pin: summary, sources, Open.
 *   area         Select area or ⇧ + drag filters everything
 *                to a box that stays put on the map.
 *   trail        events joined in time order up to the
 *                playback cursor, newest strongest.
 * ───────────────────────────────────────────────────────── */

type Card = { kind: "event"; id: string } | { kind: "list"; ids: string[] } | null;
type TrailMode = "auto" | "on" | "off";

const CLUSTER_PX = 17;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const keyOf = (v: View) => [v.west, v.east, v.south, v.north].map((n) => n.toFixed(3)).join(",");

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export type DotMapProps = {
  events: ChronosEvent[];
  /** playback cursor; pins after it dim, pins it passes pulse. null = everything lit */
  cursorYear: number | null;
  playing?: boolean;
  /** the timeline's range, for fading the trail by age */
  range?: YearRange | null;
  selectedId?: string | null;
  /** events highlighted from elsewhere (the list) */
  hoverIds?: string[] | null;
  onHover?: (ids: string[] | null) => void;
  /** a pin was clicked */
  onFocusEvent?: (id: string) => void;
  /** "Open" on a pin card */
  onOpen?: (id: string) => void;
  area?: GeoBox | null;
  onAreaChange?: (box: GeoBox | null) => void;
  /** pan, zoom, controls; off for decoration */
  interactive?: boolean;
  loading?: boolean;
  /** counts and pin key under the map */
  legend?: boolean;
  /** model is live (Groq) rather than scripted, for source labels */
  liveModel?: boolean | null;
  /** changes on every new run: back to following, cards closed */
  resetKey?: string | number;
  className?: string;
};

export function DotMap({
  events,
  cursorYear,
  playing = false,
  range = null,
  selectedId = null,
  hoverIds = null,
  onHover,
  onFocusEvent,
  onOpen,
  area = null,
  onAreaChange,
  interactive = false,
  loading = false,
  legend = false,
  liveModel = false,
  resetKey,
  className,
}: DotMapProps) {
  const { ref: boxRef, width } = useWidth<HTMLDivElement>();
  const aspect = !width ? 2.6 : width < 560 ? 1.5 : width < 900 ? 2.2 : 2.65;
  const height = width ? Math.round(width / aspect) : 0;
  const size = useMemo<Size>(() => ({ width, height }), [width, height]);
  const minPitch = width && width < 560 ? 4 : 5;

  const located = useMemo(() => events.filter((e) => e.location), [events]);
  const byId = useMemo(() => new Map(located.map((e) => [e.id, e])), [located]);
  const target = useMemo(() => {
    const pts = focusPoints(located.map((e) => e.location!));
    return constrain(pts.length ? fitView(pts, aspect) : matchAspect(WORLD, aspect), aspect);
  }, [located, aspect]);

  const [view, setView] = useState<View | null>(null);
  const [settled, setSettled] = useState<View | null>(null);
  const [follow, setFollow] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawRect, setDrawRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [card, setCard] = useState<Card>(null);
  const [trailMode, setTrailMode] = useState<TrailMode>("auto");
  const [hint, setHint] = useState<{ text: string; on: boolean }>({ text: "", on: false });

  // a new run starts fresh (adjusting state while rendering, the React way to reset on a prop change)
  const [seenReset, setSeenReset] = useState(resetKey);
  if (seenReset !== resetKey) {
    setSeenReset(resetKey);
    setFollow(true);
    setCard(null);
    setDrawMode(false);
    setDrawRect(null);
    setTrailMode("auto");
  }
  // pin the first framing, so later framings animate instead of jumping
  if (view === null && width > 0) {
    setView(target);
    setSettled(target);
  }

  const live: View = view ? constrain(view, aspect) : target;

  /* ── view plumbing: gestures write a ref, React catches up once per frame ── */

  const viewRef = useRef<View | null>(null);
  const latest = useRef({ live, size, aspect, target });
  useEffect(() => {
    latest.current = { live, size, aspect, target };
  });
  const current = useCallback((): View => constrain(viewRef.current ?? latest.current.live, latest.current.aspect), []);

  const raf = useRef<number | null>(null);
  const anim = useRef<{ id: number; to: View | null } | null>(null);
  const commit = useCallback((v: View) => {
    viewRef.current = v;
    if (raf.current === null) {
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        setView(viewRef.current);
      });
    }
  }, []);
  const settleSoon = useCallback(() => {
    requestAnimationFrame(() => setSettled(viewRef.current));
  }, []);
  const stopAnim = useCallback(() => {
    if (anim.current) cancelAnimationFrame(anim.current.id);
    anim.current = null;
  }, []);
  const animate = useCallback(
    (at: (t: number) => View, duration: number, to: View | null = null) => {
      stopAnim();
      if (reducedMotion()) {
        const v = at(1);
        viewRef.current = v;
        setView(v);
        setSettled(v);
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const v = at(easeOutStrong(t));
        viewRef.current = v;
        setView(v);
        if (t < 1) anim.current = { id: requestAnimationFrame(step), to };
        else {
          anim.current = null;
          setSettled(v);
        }
      };
      anim.current = { id: requestAnimationFrame(step), to };
    },
    [stopAnim],
  );
  const flyTo = useCallback(
    (to: View, duration = 440) => {
      const from = current();
      animate((t) => lerpView(from, to, t), duration, to);
    },
    [animate, current],
  );
  const zoomAround = useCallback(
    (pt: ScreenPoint, k: number, duration = 380) => {
      const from = current();
      const s = latest.current.size;
      animate((t) => zoomAt(from, pt, Math.pow(k, t), s), duration);
    },
    [animate, current],
  );

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      if (anim.current) cancelAnimationFrame(anim.current.id);
    },
    [],
  );

  // follow: glide to new framings as pins stream in, until the reader takes over
  const targetKey = keyOf(target);
  useEffect(() => {
    if (!follow || !width) return;
    const t = setTimeout(
      () => {
        const tgt = latest.current.target;
        if (anim.current?.to && viewsClose(anim.current.to, tgt, 0.005)) return;
        if (viewsClose(current(), tgt, 0.005)) return;
        flyTo(tgt, 520);
      },
      loading ? 420 : 30,
    );
    return () => clearTimeout(t);
  }, [targetKey, follow, width, loading, flyTo, current]);

  const takeOver = useCallback(() => {
    stopAnim();
    setFollow(false);
  }, [stopAnim]);

  const reset = useCallback(() => {
    setFollow(true);
    flyTo(latest.current.target, 460);
  }, [flyTo]);

  /* ── hints ── */

  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((text: string) => {
    setHint({ text, on: true });
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint((h) => ({ ...h, on: false })), 1400);
  }, []);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  /* ── pins, clusters ── */

  const inArea = useCallback((e: ChronosEvent) => !area || inBox(e.location!, area), [area]);
  const active = useMemo(() => located.filter(inArea), [located, inArea]);
  const outside = useMemo(() => (area ? located.filter((e) => !inArea(e)) : []), [located, inArea, area]);

  const clusterView = settled ? constrain(settled, aspect) : live;
  const clusterKey = keyOf(clusterView);
  const clusters = useMemo(() => {
    if (!width) return [] as PinCluster[];
    const cv = clusterView;
    return clusterPins(
      active.map((e) => {
        const p = toScreen(e.location!, cv, size);
        return { id: e.id, x: p.x, y: p.y, weight: e.weight + e.sources.length * 25, year: e.year };
      }),
      CLUSTER_PX,
    );
    // clusterView is captured through clusterKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, clusterKey, size, width]);

  const at = useCallback((e: ChronosEvent) => toScreen(e.location!, live, size), [live, size]);
  const hoverSet = useMemo(() => new Set(hoverIds ?? []), [hoverIds]);
  const isLit = (e: ChronosEvent) => cursorYear === null || e.year <= cursorYear;

  // pulse each pin as the cursor passes its year
  const prevCursor = useRef<number | null>(cursorYear);
  const [pulses, setPulses] = useState<Record<string, number>>({});
  useEffect(() => {
    const prev = prevCursor.current;
    prevCursor.current = cursorYear;
    if (prev === null || cursorYear === null || cursorYear <= prev) return;
    const passed = located.filter((e) => e.year > prev && e.year <= cursorYear);
    if (passed.length === 0) return;
    setPulses((cur) => {
      const next = { ...cur };
      for (const e of passed) next[e.id] = (next[e.id] ?? 0) + 1;
      return next;
    });
  }, [cursorYear, located]);

  /* ── interactions ── */

  const vpRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; start: ScreenPoint; startView: View; moved: boolean } | null>(null);
  const draw = useRef<{ id: number; start: ScreenPoint } | null>(null);
  const suppressClick = useRef(false);

  const local = (e: { clientX: number; clientY: number }): ScreenPoint => {
    const r = vpRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const inside = (p: ScreenPoint): ScreenPoint => ({
    x: Math.min(Math.max(p.x, 0), latest.current.size.width),
    y: Math.min(Math.max(p.y, 0), latest.current.size.height),
  });

  const openEvent = (id: string) => {
    if (suppressClick.current) return;
    setCard({ kind: "event", id });
    onFocusEvent?.(id);
  };

  const clickCluster = (c: PinCluster, members: ChronosEvent[]) => {
    if (suppressClick.current) return;
    takeOver();
    const cur = current();
    const span = cur.east - cur.west;
    const lngs = members.map((m) => m.location!.lng);
    const lats = members.map((m) => m.location!.lat);
    const samePlace = Math.max(...lngs) - Math.min(...lngs) < 0.02 && Math.max(...lats) - Math.min(...lats) < 0.02;
    const fit = constrain(fitView(members.map((m) => m.location!), aspect, { pad: 0.5, minLng: MIN_LNG_SPAN * 1.4 }), aspect);
    // members that share a place can't be split by zooming: list them instead
    if (samePlace || span <= MIN_LNG_SPAN * 1.6 || fit.east - fit.west > span * 0.82) {
      setCard({ kind: "list", ids: c.members });
      return;
    }
    setCard(null);
    flyTo(fit, 450);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return;
    if ((e.target as Element).closest("[data-map-ui]")) return;
    const drawing = drawMode || e.shiftKey;
    // one finger belongs to the page; two fingers are handled by the touch listeners
    if (e.pointerType === "touch" && !drawing) return;
    const pt = local(e);
    if (drawing) {
      e.preventDefault();
      stopAnim();
      e.currentTarget.setPointerCapture(e.pointerId);
      draw.current = { id: e.pointerId, start: pt };
      setDrawRect({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y });
      return;
    }
    stopAnim();
    suppressClick.current = false;
    drag.current = { id: e.pointerId, start: pt, startView: current(), moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draw.current?.id === e.pointerId) {
      const pt = inside(local(e));
      setDrawRect((r) => (r ? { ...r, x1: pt.x, y1: pt.y } : r));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const pt = local(e);
    const dx = pt.x - d.start.x;
    const dy = pt.y - d.start.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      suppressClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      takeOver();
    }
    commit(panBy(d.startView, dx, dy, latest.current.size));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (draw.current?.id === e.pointerId) {
      const start = draw.current.start;
      draw.current = null;
      const pt = inside(local(e));
      setDrawRect(null);
      setDrawMode(false);
      if (!cancelled && Math.abs(pt.x - start.x) > 8 && Math.abs(pt.y - start.y) > 8) {
        const v = current();
        const s = latest.current.size;
        takeOver();
        onAreaChange?.(boxFromPoints(toGeo(start, v, s), toGeo(pt, v, s)));
      }
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.moved) {
      setDragging(false);
      settleSoon();
    } else if (!cancelled && !(e.target as Element).closest("[data-pin],[data-cluster]")) {
      setCard(null);
    }
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if ((e.target as Element).closest("[data-pin],[data-cluster],[data-map-ui]")) return;
    takeOver();
    zoomAround(local(e), e.shiftKey ? 0.5 : 2);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || e.metaKey || e.ctrlKey || e.altKey) return;
    const s = latest.current.size;
    const mid = { x: s.width / 2, y: s.height / 2 };
    const pan = (dx: number, dy: number) => {
      takeOver();
      const from = current();
      animate((t) => panBy(from, dx * t, dy * t, s), 220);
    };
    switch (e.key) {
      case "ArrowLeft":
        pan(s.width * 0.15, 0);
        break;
      case "ArrowRight":
        pan(-s.width * 0.15, 0);
        break;
      case "ArrowUp":
        pan(0, s.height * 0.15);
        break;
      case "ArrowDown":
        pan(0, -s.height * 0.15);
        break;
      case "+":
      case "=":
        takeOver();
        zoomAround(mid, 1.6, 260);
        break;
      case "-":
      case "_":
        takeOver();
        zoomAround(mid, 1 / 1.6, 260);
        break;
      case "0":
        reset();
        break;
      case "Escape":
        if (card) setCard(null);
        else if (drawMode) setDrawMode(false);
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // wheel, touch and Safari gesture listeners need passive: false
  useEffect(() => {
    const el = vpRef.current;
    if (!el || !interactive) return;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    let pinch: { c0: ScreenPoint; d0: number; startView: View } | null = null;
    let single: { x: number; y: number; hinted: boolean } | null = null;
    let gesture: { view: View; pt: ScreenPoint } | null = null;
    let pointer: ScreenPoint = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const rel = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const settleLater = () => {
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => setSettled(viewRef.current), 160);
    };

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        showHint(IS_MAC ? "⌘ + scroll to zoom" : "Ctrl + scroll to zoom");
        return;
      }
      e.preventDefault();
      takeOver();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const delta = e.deltaY * unit;
      // trackpad pinches send small deltas, mouse wheels big notches
      const rate = Math.abs(delta) >= 40 ? 0.0022 : 0.011;
      const k = Math.min(2, Math.max(0.5, Math.exp(-delta * rate)));
      commit(zoomAt(current(), rel(e.clientX, e.clientY), k, latest.current.size));
      settleLater();
    };

    const two = (t: TouchList) => {
      const a = rel(t[0].clientX, t[0].clientY);
      const b = rel(t[1].clientX, t[1].clientY);
      return { c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const { c, d } = two(e.touches);
        pinch = { c0: c, d0: d, startView: current() };
        single = null;
        takeOver();
      } else if (e.touches.length === 1) {
        single = { x: e.touches[0].clientX, y: e.touches[0].clientY, hinted: false };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length >= 2) {
        if (!e.cancelable) return;
        e.preventDefault();
        const { c, d } = two(e.touches);
        const s = latest.current.size;
        let v = zoomAt(pinch.startView, pinch.c0, d / pinch.d0, s);
        v = panBy(v, c.x - pinch.c0.x, c.y - pinch.c0.y, s);
        commit(v);
        return;
      }
      if (single && e.touches.length === 1 && !single.hinted) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - single.x, t.clientY - single.y) > 12) {
          single.hinted = true;
          showHint("Use two fingers to move the map");
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (pinch && e.touches.length < 2) {
        pinch = null;
        settleLater();
      }
      if (e.touches.length === 0) single = null;
    };

    const onPointerTrack = (e: PointerEvent) => {
      pointer = rel(e.clientX, e.clientY);
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      takeOver();
      gesture = { view: current(), pt: pointer };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      if (gesture) commit(zoomAt(gesture.view, gesture.pt, scale, latest.current.size));
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gesture = null;
      settleLater();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("pointermove", onPointerTrack);
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("gestureend", onGestureEnd);
    return () => {
      if (wheelTimer) clearTimeout(wheelTimer);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("pointermove", onPointerTrack);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [interactive, commit, current, showHint, takeOver]);

  // a card closes on Esc or a click anywhere outside the map
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCard(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setCard(null);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [card]);

  /* ── what to draw ── */

  const items = width
    ? clusters.map((c) => {
        const members = c.members.map((id) => byId.get(id)).filter((e): e is ChronosEvent => Boolean(e));
        const pts = members.map(at);
        const x = pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length);
        const y = pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
        const hot = members.some((m) => hoverSet.has(m.id) || m.id === selectedId);
        return { c, members, x, y, hot };
      })
    : [];
  const visible = (x: number, y: number, pad = 24) => x > -pad && y > -pad && x < width + pad && y < height + pad;

  const trailOn = trailMode === "on" || (trailMode === "auto" && playing);
  const span = range ? Math.max(1, range.end - range.start) : 100;
  const trailNodes = useMemo(() => trailOrder(active), [active]);
  // the trail meets pins where they're drawn: merged events at their cluster's bubble
  const drawnAt = new Map<string, ScreenPoint>();
  for (const it of items) if (it.members.length > 1) for (const m of it.members) drawnAt.set(m.id, { x: it.x, y: it.y });
  const segments =
    trailOn && width
      ? trailSegments(
          trailNodes.map((e) => {
            const p = drawnAt.get(e.id) ?? at(e);
            return { id: e.id, year: e.year, lat: e.location!.lat, lng: e.location!.lng, x: p.x, y: p.y };
          }),
          cursorYear,
          span,
        ).filter((sgm) => !sgm.d.match(/^M([\d.-]+),([\d.-]+)Q[\d.-]+,[\d.-]+ \1,\2$/))
      : [];

  const areaRect = (() => {
    if (!area || !width) return null;
    const a = toScreen({ lat: area.north, lng: area.west }, live, size);
    const b = toScreen({ lat: area.south, lng: area.east }, live, size);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  })();
  const drawBox = drawRect
    ? {
        x: Math.min(drawRect.x0, drawRect.x1),
        y: Math.min(drawRect.y0, drawRect.y1),
        w: Math.abs(drawRect.x1 - drawRect.x0),
        h: Math.abs(drawRect.y1 - drawRect.y0),
      }
    : null;

  const offscreen = active.filter((e) => {
    const p = at(e);
    return !visible(p.x, p.y, 0);
  }).length;
  const approxCount = located.filter((e) => e.location?.approx).length;
  const { min: minSpan, max: maxSpan } = spanLimits(aspect);
  const liveSpan = live.east - live.west;
  const showRecenter = interactive && !follow && located.length > 0 && !viewsClose(live, target, 0.01);

  const pinVisual = (e: ChronosEvent, ring: boolean) => {
    const sel = e.id === selectedId;
    const approx = Boolean(e.location?.approx);
    const r = sel ? 4.6 : approx ? 2.9 : 3.4;
    return (
      <>
        {ring && <circle r={r + 4} fill="none" stroke="var(--accent)" strokeWidth={sel ? 2 : 1.5} opacity={0.85} />}
        <circle r={r} fill={approx ? "var(--surface)" : "var(--accent)"} stroke={approx ? "var(--accent)" : "var(--surface)"} strokeWidth={approx ? 1.6 : 1.2} />
      </>
    );
  };

  const clusterVisual = (members: ChronosEvent[], ring: boolean) => {
    const n = members.length;
    const r = clusterRadius(n);
    const filled = members.some((m) => !m.location?.approx);
    return (
      <>
        {ring && <circle r={r + 3.5} fill="none" stroke="var(--accent)" strokeWidth={1.75} opacity={0.9} />}
        <circle r={r} fill={filled ? "var(--accent)" : "var(--surface)"} stroke={filled ? "var(--surface)" : "var(--accent)"} strokeWidth={1.5} />
        <text
          textAnchor="middle"
          dy="0.35em"
          className="num"
          style={{ fontSize: n >= 100 ? 10 : 11, fontWeight: 600, fill: filled ? "var(--accent-fg)" : "var(--accent-ink)", pointerEvents: "none" }}
        >
          {n}
        </text>
      </>
    );
  };

  const renderPin = (e: ChronosEvent, p: ScreenPoint) => {
    const lit = isLit(e);
    const approx = Boolean(e.location?.approx);
    const cardOpen = card?.kind === "event" && card.id === e.id;
    return (
      <Tooltip
        key={e.id}
        as="g"
        disabled={!interactive || cardOpen}
        content={
          <span>
            <span className="num font-medium">{formatYear(e.year)}</span> {e.title}
            {approx && e.location?.name ? <span style={{ color: "var(--tooltip-muted)" }}> · near {e.location.name}</span> : null}
          </span>
        }
      >
        <g
          data-pin={e.id}
          data-highlight={hoverSet.has(e.id) || undefined}
          transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
          style={{ opacity: lit ? 1 : 0.28, transition: "opacity 240ms ease-out", cursor: interactive ? "pointer" : undefined }}
          onClick={interactive ? () => openEvent(e.id) : undefined}
          onPointerEnter={interactive ? () => onHover?.([e.id]) : undefined}
          onPointerLeave={interactive ? () => onHover?.(null) : undefined}
        >
          <circle r={11} fill="transparent" />
          {pulses[e.id] ? <circle key={`${e.id}-${pulses[e.id]}`} r={3.5} fill="var(--accent)" className="chronos-pin-pulse" /> : null}
          {pinVisual(e, false)}
        </g>
      </Tooltip>
    );
  };

  const renderCluster = (c: PinCluster, members: ChronosEvent[], x: number, y: number, hot: boolean) => {
    const n = members.length;
    const r = clusterRadius(n);
    const lit = members.some(isLit);
    const pulseKey = members.reduce((s, m) => s + (pulses[m.id] ?? 0), 0);
    return (
      <Tooltip
        key={c.id}
        as="g"
        wide
        disabled={!interactive || card?.kind === "list"}
        content={
          <span className="flex flex-col gap-0.5">
            {members.slice(0, 3).map((m) => (
              <span key={m.id}>
                <span className="num font-medium">{formatYear(m.year)}</span> {m.title}
              </span>
            ))}
            {n > 3 ? <span style={{ color: "var(--tooltip-muted)" }}>and {n - 3} more</span> : null}
          </span>
        }
      >
        <g
          data-cluster={c.id}
          data-count={n}
          data-highlight={hot || undefined}
          transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
          style={{ opacity: lit ? 1 : 0.3, transition: "opacity 240ms ease-out", cursor: interactive ? "pointer" : undefined }}
          onClick={interactive ? () => clickCluster(c, members) : undefined}
          onPointerEnter={interactive ? () => onHover?.(c.members) : undefined}
          onPointerLeave={interactive ? () => onHover?.(null) : undefined}
        >
          {pulseKey ? <circle key={`pulse-${pulseKey}`} r={r} fill="var(--accent)" className="chronos-cluster-pulse" /> : null}
          {clusterVisual(members, false)}
        </g>
      </Tooltip>
    );
  };

  const renderItem = ({ c, members, x, y, hot }: (typeof items)[number]) => {
    if (!visible(x, y)) return null;
    if (members.length === 1) return renderPin(members[0], at(members[0]));
    return renderCluster(c, members, x, y, hot);
  };

  /* hovered and selected items are drawn again on a top layer (ring included),
   * so they sit above their neighbours without moving the interactive node */
  const renderRaised = ({ c, members, x, y }: (typeof items)[number]) => {
    if (!visible(x, y)) return null;
    if (members.length === 1) {
      const p = at(members[0]);
      return (
        <g key={`raised-${c.id}`} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`} style={{ opacity: isLit(members[0]) ? 1 : 0.5 }}>
          {pinVisual(members[0], true)}
        </g>
      );
    }
    return (
      <g key={`raised-${c.id}`} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`} style={{ opacity: members.some(isLit) ? 1 : 0.5 }}>
        {clusterVisual(members, true)}
      </g>
    );
  };

  // the open card, anchored to its pin, or its cluster when the pin is merged
  let cardNode: React.ReactNode = null;
  if (card && width) {
    if (card.kind === "event") {
      const e = byId.get(card.id);
      if (e && inArea(e)) {
        const it = items.find((i) => i.c.members.includes(e.id));
        const merged = it && it.members.length > 1;
        const p = merged ? { x: it.x, y: it.y } : at(e);
        if (visible(p.x, p.y, 4)) {
          cardNode = (
            <EventPinCard
              event={e}
              live={liveModel}
              x={p.x}
              y={p.y}
              mapWidth={width}
              pinRadius={merged ? clusterRadius(it.members.length) : 5}
              onOpen={(id) => onOpen?.(id)}
              onClose={() => setCard(null)}
            />
          );
        }
      }
    } else {
      const members = card.ids.map((id) => byId.get(id)).filter((e): e is ChronosEvent => Boolean(e) && inArea(e!));
      if (members.length) {
        const pts = members.map(at);
        const p = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
        if (visible(p.x, p.y, 4)) {
          cardNode = (
            <ClusterCard
              events={members}
              x={p.x}
              y={p.y}
              mapWidth={width}
              pinRadius={clusterRadius(members.length)}
              onPick={(id) => {
                setCard({ kind: "event", id });
                onFocusEvent?.(id);
              }}
              onClose={() => setCard(null)}
            />
          );
        }
      }
    }
  }

  const cursor = !interactive ? undefined : drawMode ? "crosshair" : dragging ? "grabbing" : "grab";

  return (
    <div ref={rootRef} className={cn("w-full", className)} onPointerLeave={interactive ? () => onHover?.(null) : undefined}>
      <div ref={boxRef} className="relative w-full" style={{ height: height || undefined, aspectRatio: height ? undefined : `${aspect}` }}>
        <div
          ref={vpRef}
          className={cn("absolute inset-0 overflow-hidden rounded-[4px] select-none", interactive && "outline-offset-2")}
          style={{ cursor, touchAction: interactive ? (drawMode ? "none" : "pan-x pan-y") : undefined }}
          tabIndex={interactive ? 0 : undefined}
          role={interactive ? "group" : undefined}
          aria-roledescription={interactive ? "map" : undefined}
          aria-label={
            interactive
              ? `Map of ${located.length} events. Drag to move, ${IS_MAC ? "Command" : "Control"} plus scroll to zoom. Arrow keys move, plus and minus zoom, 0 resets.`
              : undefined
          }
          data-map-view={width ? keyOf(live) : undefined}
          data-follow={interactive ? String(follow) : undefined}
          onPointerDown={interactive ? onPointerDown : undefined}
          onPointerMove={interactive ? onPointerMove : undefined}
          onPointerUp={interactive ? (e) => endPointer(e, false) : undefined}
          onPointerCancel={interactive ? (e) => endPointer(e, true) : undefined}
          onDoubleClick={interactive ? onDoubleClick : undefined}
          onKeyDown={interactive ? onKeyDown : undefined}
        >
          {width > 0 && <LandCanvas view={live} size={size} minPitch={minPitch} alpha={interactive ? 0.2 : 0.15} />}
          {width > 0 && (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0" role="img" aria-label={`${located.length} located events`}>
              {segments.map((s) => (
                <path
                  key={s.id}
                  d={s.d}
                  pathLength={1}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  opacity={s.opacity}
                  className="chronos-trail-seg"
                  data-trail-seg={s.id}
                />
              ))}
              {areaRect && (
                <rect
                  x={areaRect.x}
                  y={areaRect.y}
                  width={Math.max(0, areaRect.w)}
                  height={Math.max(0, areaRect.h)}
                  rx={3}
                  style={{ fill: "color-mix(in oklch, var(--accent) 8%, transparent)", stroke: "var(--accent)", strokeWidth: 1.25, strokeDasharray: "5 4" }}
                />
              )}
              {drawBox && (
                <rect
                  x={drawBox.x}
                  y={drawBox.y}
                  width={drawBox.w}
                  height={drawBox.h}
                  rx={3}
                  style={{ fill: "color-mix(in oklch, var(--accent) 10%, transparent)", stroke: "var(--accent)", strokeWidth: 1.25, strokeDasharray: "5 4" }}
                />
              )}
              {outside.map((e) => {
                const p = at(e);
                return visible(p.x, p.y) ? <circle key={e.id} cx={p.x} cy={p.y} r={2.2} fill="var(--ink-3)" opacity={0.4} pointerEvents="none" /> : null;
              })}
              {items.map(renderItem)}
              <g pointerEvents="none">{items.filter((i) => i.hot || (card?.kind === "event" && i.c.members.includes(card.id))).map(renderRaised)}</g>
            </svg>
          )}

          {areaRect && interactive && (
            <button
              type="button"
              data-map-ui
              aria-label="Clear area"
              onClick={() => onAreaChange?.(null)}
              className="press absolute z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-ink-2 shadow-raised hover:text-ink"
              style={{ left: areaRect.x + areaRect.w, top: areaRect.y }}
            >
              <X size={10} weight="bold" />
            </button>
          )}

          {interactive && (
            <div aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span
                className="rounded-full px-3 py-1.5 text-[12px] font-medium shadow-overlay transition-opacity duration-150 ease-out"
                style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-fg)", opacity: hint.on ? 1 : 0 }}
              >
                {hint.text}
              </span>
            </div>
          )}
        </div>

        {cardNode}

        {interactive && width > 0 && (
          <MapControls
            onZoomIn={() => {
              takeOver();
              zoomAround({ x: width / 2, y: height / 2 }, 1.6, 300);
            }}
            onZoomOut={() => {
              takeOver();
              zoomAround({ x: width / 2, y: height / 2 }, 1 / 1.6, 300);
            }}
            onReset={reset}
            canZoomIn={liveSpan > minSpan * 1.01}
            canZoomOut={liveSpan < maxSpan * 0.99}
            drawing={drawMode}
            onToggleDraw={() => setDrawMode((d) => !d)}
            trail={trailOn}
            onToggleTrail={() => setTrailMode(trailOn ? "off" : "on")}
          />
        )}

        {showRecenter && (
          <button
            type="button"
            data-map-ui
            onClick={reset}
            className="press absolute top-2 right-2 z-20 inline-flex h-7 items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-2 text-[12px] font-medium text-ink-2 shadow-raised hover:bg-hover hover:text-ink"
            style={{ animation: "fade-in 160ms ease-out both" }}
          >
            <CrosshairSimple size={13} weight="bold" />
            Recenter
          </button>
        )}

        {drawMode && (
          <span
            data-map-ui
            className="pointer-events-none absolute top-2 left-2 z-20 rounded-full px-2.5 py-1 text-[11.5px] font-medium shadow-overlay"
            style={{ background: "var(--tooltip-bg)", color: "var(--tooltip-fg)", animation: "fade-in 140ms ease-out both" }}
          >
            Drag to select an area
          </span>
        )}
      </div>

      {legend && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[11.5px] text-ink-3">
          <span className="inline-flex items-center gap-1">
            <MapPin size={12} weight="bold" />
            <span className="num">
              {located.length} of {events.length}
            </span>{" "}
            events have a place
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-[7px] rounded-full bg-accent" /> on the spot
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-[7px] rounded-full shadow-[inset_0_0_0_1.5px_var(--accent)]" /> near a place its source mentions
            {approxCount ? ` (${approxCount})` : ""}
          </span>
          {offscreen > 0 && interactive && (
            <button
              type="button"
              onClick={() => {
                takeOver();
                flyTo(constrain(fitView(active.map((e) => e.location!), aspect, { pad: 0.15, minLng: 4 }), aspect), 460);
              }}
              className="press ml-auto rounded-[6px] px-1.5 py-0.5 font-medium text-ink-2 hover:bg-hover hover:text-ink"
            >
              <span className="num">{offscreen}</span> outside the view · Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
