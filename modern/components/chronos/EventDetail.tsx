"use client";

import { memo, useEffect, useRef, type RefObject } from "react";
import { ArrowUpRight, MapPin, X } from "@phosphor-icons/react";
import { SOURCE_ORDER, type ChronosEvent, type Fact, type SourceId } from "@/modern/lib/chronos/types";
import { formatYear } from "@/modern/lib/chronos/time";
import { cn } from "@/modern/lib/cn";
import { CONFIDENCE_LABEL, SOURCE_NAME, SourceDotsRow, SourceGlyph, shortLabel } from "./sources";

/** Evidence expands beneath its event so the map and neighboring cards stay accessible. */

const BADGE: Record<SourceId, { tone: string; text: string }> = {
  // bg-ink flips light in dark mode, so its letter uses the canvas color
  wikipedia: { tone: "bg-ink text-canvas", text: "W" },
  wikidata: { tone: "bg-green text-white", text: "WD" },
  llm: { tone: "bg-accent text-accent-fg", text: "AI" },
};

function SourceChip({ source, label, href }: { source: SourceId; label: string; href?: string }) {
  const body = (
    <>
      <span className={cn("flex h-3.5 min-w-3.5 items-center justify-center rounded-[4px] px-[2px] text-[7px] font-bold", BADGE[source].tone)}>
        {BADGE[source].text}
      </span>
      <span className="truncate">{label}</span>
      {href && <ArrowUpRight size={9} weight="bold" className="shrink-0" />}
    </>
  );
  const cls = "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn hover:bg-hover";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

function ContextCard({ title, meta, children, chip, i }: { title: string; meta?: string; children: React.ReactNode; chip?: React.ReactNode; i: number }) {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card" style={{ animation: `fade-up 220ms cubic-bezier(0.23,1,0.32,1) ${i * 25}ms both` }}>
      <div className="primitive-card-bar flex items-center gap-2.5 border-b border-line">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          <span className="truncate">{title}</span>
        </span>
        {meta && <span className="num ml-auto shrink-0 text-[12px] text-ink-3">{meta}</span>}
      </div>
      <div className="px-3 pt-2 pb-1 text-[12.5px] leading-relaxed text-ink-2">{children}</div>
      {chip && <div className="px-3 pb-3">{chip}</div>}
    </div>
  );
}

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pb-1">
      {facts.map((f) => (
        <div key={f.label} className="contents">
          <dt className="text-ink-3">{f.label}</dt>
          <dd className="num min-w-0 break-words text-ink">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EventDetailImpl({ event, live, onClose, returnFocusRef }: { event: ChronosEvent | null; live: boolean | null; onClose: () => void; returnFocusRef?: RefObject<HTMLButtonElement | null> }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const eventId = event?.id;
  useEffect(() => {
    if (!eventId) return;
    // Safari touch activation does not focus buttons, so use the actual event trigger.
    returnFocus.current = returnFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeRef.current?.focus({ preventScroll: true });
  }, [eventId, returnFocusRef]);
  const dismiss = () => {
    onClose();
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  };
  if (!event) return null;
  return (
    <section id={`event-detail-${event.id}`} aria-label={`Sources for ${event.title}`}
      className="chronos-detail mt-2 rounded-[12px] border border-line bg-inset p-3"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Sources & context</h3>
        <button ref={closeRef} type="button" onClick={dismiss} aria-label="Close event details"
          className="press -mr-1 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink sm:size-8">
          <X size={16} weight="bold" />
        </button>
      </div>
      {(event.exactDate || event.endYear) && <p className="num mb-2 text-[12px] text-ink-2">
        {event.approxYear ? 'c. ' : ''}{event.exactDate ?? formatYear(event.year)}{event.endYear ? ` to ${formatYear(event.endYear)}` : ''}
      </p>}
      <div className="flex min-w-0 flex-col gap-3 break-words">
        {event.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumbnail.url}
            alt=""
            className="image-outline max-h-48 w-full rounded-[10px] bg-field object-cover"
            style={{ aspectRatio: `${event.thumbnail.width} / ${event.thumbnail.height}`, animation: "fade-in 300ms ease-out both" }}
          />
        )}

        {/* agreement */}
        <div className="rounded-card bg-surface p-3 shadow-card" style={{ animation: "fade-up 220ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-center gap-2">
            <SourceDotsRow event={event} size={8} />
            <span className="text-[13px] font-medium text-ink">{CONFIDENCE_LABEL[event.confidence]}</span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {SOURCE_ORDER.map((s) => {
              const has = event.sources.includes(s);
              const cite = event.citations.find((c) => c.source === s);
              return (
                <li key={s} className={cn("flex items-start gap-2 text-[12px]", has ? "text-ink-2" : "text-ink-3")}>
                  <SourceGlyph source={s} size={12} className="mt-[2px] shrink-0" />
                  <span className="min-w-0">
                    <span className={cn("font-medium", has ? "text-ink" : "text-ink-3")}>{s === "llm" && live === false ? "Model (scripted)" : SOURCE_NAME[s]}</span>
                    {has && cite ? (
                      <>
                        {" "}
                        {cite.url ? (
                          <a href={cite.url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-current">
                            {shortLabel(cite.label)}
                          </a>
                        ) : (
                          shortLabel(cite.label)
                        )}
                        {cite.detail ? <span className="text-ink-3"> · {cite.detail}</span> : null}
                      </>
                    ) : (
                      <span> did not list this event</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {event.yearConflicts?.length ? (
            <p className="mt-2 rounded-[7px] bg-orange-tint px-2 py-1 text-[11.5px] text-orange">
              Sources disagree on the year: also {event.yearConflicts.map((c) => `${formatYear(c.year)} (${SOURCE_NAME[c.source]})`).join(", ")}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2 px-0.5 pt-1">
          <span className="text-[13px] font-semibold text-ink">Context</span>
          <span className="inline-flex h-5 items-center rounded-md bg-inset px-1.5 text-[11.5px] font-medium text-ink-2 shadow-hairline">
            {event.mergedFrom.length} {event.mergedFrom.length === 1 ? "record" : "records"}
          </span>
        </div>

        {event.summary && (
          <ContextCard
            i={0}
            title={event.sources.includes("wikipedia") ? "Wikipedia extract" : event.sources.includes("wikidata") ? "Wikidata description" : "Model claim"}
            meta={`${event.summary.length.toLocaleString()} characters`}
            chip={
              event.wikipediaUrl ? (
                <SourceChip source="wikipedia" label={event.wikipediaTitle ?? event.title} href={event.wikipediaUrl} />
              ) : (
                (() => {
                  const cite = event.citations.find((c) => c.source === "llm" && c.url);
                  return cite ? <SourceChip source="llm" label={cite.label} href={cite.url} /> : undefined;
                })()
              )
            }
          >
            {event.summary}
          </ContextCard>
        )}

        {event.facts.some((f) => f.source === "wikidata") && (
          <ContextCard
            i={1}
            title="Wikidata facts"
            meta={event.qid}
            chip={event.qid ? <SourceChip source="wikidata" label={`Wikidata ${event.qid}`} href={`https://www.wikidata.org/wiki/${event.qid}`} /> : undefined}
          >
            <FactList facts={event.facts.filter((f) => f.source === "wikidata" && f.label !== "Wikidata item")} />
          </ContextCard>
        )}

        {event.facts
          // an inferred event's summary already is the model's sentence
          .filter((f) => f.source === "llm" && f.value !== event.summary)
          .slice(0, 1)
          .map((f) => {
            const cite = event.citations.find((c) => c.source === "llm");
            return (
              <ContextCard key={f.label} i={2} title={live ? "Model seed" : "Model read this sentence"} chip={cite?.url ? <SourceChip source="llm" label={cite.label} href={cite.url} /> : undefined}>
                <span className="italic">“{f.value}”</span>
              </ContextCard>
            );
          })}

        {event.location && (
          <div className="flex items-center gap-1.5 px-0.5 text-[12px] text-ink-2">
            <MapPin size={13} weight="bold" className="text-ink-3" />
            {event.location.approx ? `Placed near ${event.location.name ?? "a mentioned place"} (approximate)` : event.location.name ?? "Mapped"}
            <span className="num ml-auto font-mono text-[11px] text-ink-3">
              {event.location.lat.toFixed(2)}, {event.location.lng.toFixed(2)}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

export const EventDetail = memo(EventDetailImpl);
