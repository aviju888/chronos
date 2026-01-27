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
      <div className="p-6 bg-paper min-h-full flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <FileQuestion className="w-16 h-16 mx-auto mb-4 text-stone-400" />
          <h3 className="text-xl font-display font-bold text-ink mb-2">No Historical Eras Found</h3>
          <p className="text-slate text-sm leading-relaxed">
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
    <div className="p-6 space-y-8 bg-paper min-h-full">
      <h2 className="text-3xl font-display font-bold text-ink border-b-2 border-gold pb-2 inline-block">Chronological Eras</h2>

      <div className="space-y-6">
        {eras.map((era) => {
          // Only show events assigned to THIS era
          const eraEvents = events
            .filter(e => eventToEraMap.get(e.id) === era.id)
            .sort((a,b) => a.year - b.year);

          return (
            <div key={era.id} className="relative pl-8 border-l-4 border-stone-300 hover:border-gold transition-colors">
              {/* Era Header */}
              <div className="absolute -left-[1.35rem] top-0 bg-paper p-1 border border-stone-300 rounded-full shadow-sm">
                <div className="w-6 h-6 bg-gold rounded-full flex items-center justify-center text-xs text-white font-bold">
                  {era.startYear.toString().slice(0, 2)}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-2xl font-serif text-ink font-bold">{era.title}</h3>
                <span className="text-sm font-bold text-gold-dark uppercase tracking-wide">
                  {formatYearRange(era.startYear, era.endYear)}
                </span>
                <p className="mt-2 text-slate leading-relaxed">{era.summary}</p>
              </div>

              {/* Event Stream within Era */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eraEvents.map(evt => (
                  <div 
                    key={evt.id}
                    onClick={() => onEventClick(evt)}
                    className="group cursor-pointer bg-white rounded border border-stone-200 shadow-sm hover:shadow-md hover:border-gold transition-all overflow-hidden flex flex-col"
                  >
                    {/* Event Image Banner */}
                    <div className="h-32 w-full relative">
                        <EventImage 
                            query={evt.imageQuery || evt.title} 
                            alt={evt.title} 
                            className="w-full h-full"
                        />
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
                        <span className="text-sm font-bold text-slate bg-stone-100 px-2 py-0.5 rounded">{formatYear(evt.year)}</span>
                        <div className="flex gap-1">
                          {evt.isOutOfRange && (
                              <span className="text-[10px] font-bold text-orange-600 border border-orange-200 bg-orange-50 px-1 rounded uppercase tracking-tighter flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Range
                              </span>
                          )}
                          {evt.isDisputed && (
                              <span className="text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 px-1 rounded uppercase tracking-tighter flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Disputed
                              </span>
                          )}
                        </div>
                        </div>
                        <h4 className="font-serif font-bold text-ink group-hover:text-gold-dark mb-1 leading-tight">{evt.title}</h4>
                        <p className="text-sm text-slate line-clamp-3 mb-2 flex-1">{evt.summary}</p>
                        <div className="mt-auto pt-2 flex items-center text-xs text-stone-400 group-hover:text-gold font-bold transition-colors">
                            Read more <ChevronRight className="w-3 h-3 ml-1" />
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
