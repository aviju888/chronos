import React from 'react';
import { Era, HistoricalEvent } from '../types';
import { ChevronRight, Book, AlertTriangle, Clock, FileQuestion } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatYear, formatYearRange } from '../utils';

interface TimelineViewProps {
  eras: Era[];
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ eras, events, onEventClick }) => {
  // Empty state
  if (!eras || eras.length === 0) {
    return (
      <div className="p-6 bg-paper dark:bg-night min-h-full flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <FileQuestion className="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-stone-600" />
          <h3 className="text-xl font-display font-bold text-ink dark:text-paper mb-2">No Historical Eras Found</h3>
          <p className="text-slate dark:text-stone-400 text-sm leading-relaxed">
            {events.length === 0
              ? "No events or eras were generated for this timeline. Try a different region or time range."
              : `${events.length} events were found but no defined eras. Try the Events view to explore the records.`
            }
          </p>
        </div>
      </div>
    );
  }

  // Pre-assign each event to exactly ONE era to avoid duplicates
  // Strategy: assign to the era where the event year is closest to the era's midpoint
  const eventToEraMap = new Map<string, string>();

  events.forEach(event => {
    let bestEraId: string | null = null;
    let bestScore = Infinity;

    eras.forEach(era => {
      // Check if event falls within era bounds
      if (event.year >= era.startYear && event.year <= era.endYear) {
        // Score: prefer era where event is NOT on the boundary
        // Lower score = better fit
        const distFromStart = Math.abs(event.year - era.startYear);
        const distFromEnd = Math.abs(event.year - era.endYear);
        const score = Math.min(distFromStart, distFromEnd);

        // If event is on boundary (score = 0), prefer the later era
        // Otherwise prefer era where event is more "inside"
        if (bestEraId === null || score > bestScore || (score === bestScore && era.startYear > (eras.find(e => e.id === bestEraId)?.startYear || 0))) {
          bestScore = score;
          bestEraId = era.id;
        }
      }
    });

    if (bestEraId) {
      eventToEraMap.set(event.id, bestEraId);
    }
  });

  return (
    <div className="px-3 py-4 md:p-6 space-y-6 md:space-y-8 bg-paper dark:bg-night min-h-full relative">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

      <div className="relative z-10">
        <h2 className="text-xl md:text-3xl font-display font-bold text-ink dark:text-paper text-embossed tracking-wide">Chronological Eras</h2>
        <div className="gold-strip mt-2 w-32 md:w-48"></div>
      </div>

      <div className="space-y-6 md:space-y-8 relative z-10">
        {eras.map((era) => {
          const eraEvents = events
            .filter(e => eventToEraMap.get(e.id) === era.id)
            .sort((a,b) => a.year - b.year);

          return (
            <div key={era.id} className="relative pl-6 md:pl-8 border-l-4 border-gold/30 dark:border-gold/20 hover:border-gold transition-colors">
              {/* Era Header - Wax Seal Style */}
              <div className="absolute -left-[1.1rem] md:-left-[1.35rem] top-0 bg-paper dark:bg-night p-0.5 md:p-1 rounded-full shadow-tome">
                <div className="w-6 h-6 md:w-7 md:h-7 bg-gradient-to-br from-gold to-gold-dark rounded-full flex items-center justify-center text-[10px] md:text-xs text-white font-bold shadow-inner border border-gold-light/50">
                  {era.startYear.toString().slice(0, 2)}
                </div>
              </div>

              <div className="mb-4 md:mb-6 animate-ink-fade">
                <h3 className="text-lg md:text-2xl font-dramatic text-ink dark:text-paper font-bold">{era.title}</h3>
                <span className="text-xs md:text-sm font-bold text-gold-dark dark:text-gold uppercase tracking-widest font-antique">
                  {formatYearRange(era.startYear, era.endYear)}
                </span>
                <p className="mt-1.5 md:mt-2 text-sm md:text-base text-sepia dark:text-stone-400 leading-relaxed font-elegant line-clamp-3 md:line-clamp-none">{era.summary}</p>
              </div>

              {/* Mobile: horizontal scroll cards | Desktop: grid */}
              <div className="flex md:hidden gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
                {eraEvents.map(evt => (
                  <div
                    key={evt.id}
                    onClick={() => onEventClick(evt)}
                    className="group cursor-pointer bg-paper-cream dark:bg-night-light rounded-lg border border-gold/20 dark:border-gold/30 shadow-md active:shadow-sm transition-all overflow-hidden flex flex-col flex-shrink-0 w-[70vw] max-w-[280px] snap-start"
                  >
                    <div className="h-28 w-full relative">
                        <EventImage query={evt.imageQuery || evt.title} alt={evt.title} className="w-full h-full" />
                        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent"></div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <span className="text-[10px] font-bold text-gold bg-ink/70 px-1.5 py-0.5 rounded backdrop-blur-sm">{formatYear(evt.year)}</span>
                        </div>
                        {evt.isDisputed && (
                          <div className="absolute top-2 right-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400 drop-shadow-md" />
                          </div>
                        )}
                    </div>
                    <div className="p-3 flex-1 flex flex-col">
                        <h4 className="font-dramatic font-bold text-sm text-ink dark:text-paper leading-tight mb-1">{evt.title}</h4>
                        <p className="text-xs text-sepia dark:text-stone-400 line-clamp-2 font-elegant">{evt.summary}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: grid layout */}
              <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 gap-4">
                {eraEvents.map(evt => (
                  <div
                    key={evt.id}
                    onClick={() => onEventClick(evt)}
                    className="group cursor-pointer bg-paper-cream dark:bg-night-light rounded border border-gold/20 dark:border-gold/30 shadow-tome hover-lift transition-archival overflow-hidden flex flex-col border-manuscript"
                  >
                    <div className="h-32 w-full relative">
                        <EventImage query={evt.imageQuery || evt.title} alt={evt.title} className="w-full h-full" />
                        <div className="absolute top-2 right-2 flex gap-1">
                            {evt.citations.length > 0 && (
                                <div className="bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 backdrop-blur-sm">
                                    <Book className="w-2 h-2" /> {evt.citations.length}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-bold text-ink dark:text-gold bg-gold/20 dark:bg-gold/10 px-2 py-0.5 rounded font-antique">[{formatYear(evt.year)}]</span>
                        <div className="flex gap-1">
                          {evt.isOutOfRange && (
                              <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 px-1 rounded uppercase tracking-tighter flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Range
                              </span>
                          )}
                          {evt.isDisputed && (
                              <span className="text-[10px] font-bold text-crimson dark:text-crimson-light border border-crimson/30 dark:border-crimson/50 bg-crimson/10 dark:bg-crimson/20 px-1 rounded uppercase tracking-tighter flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Disputed
                              </span>
                          )}
                        </div>
                        </div>
                        <h4 className="font-dramatic font-bold text-ink dark:text-paper group-hover:text-gold-dark dark:group-hover:text-gold mb-1 leading-tight transition-colors">{evt.title}</h4>
                        <p className="text-sm text-sepia dark:text-stone-400 line-clamp-3 mb-2 flex-1 font-elegant">{evt.summary}</p>
                        <div className="mt-auto pt-2 flex items-center text-xs text-sepia dark:text-stone-500 group-hover:text-gold font-elegant italic transition-colors">
                            Continue reading... <ChevronRight className="w-3 h-3 ml-1" />
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
