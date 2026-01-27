import React, { useState } from 'react';
import { X, Map, List, BookOpen, Clock, ChevronLeft } from 'lucide-react';
import { TimelineData, HistoricalEvent } from '../../types';
import { formatYear } from '../../utils';

interface ResultsSlidePanelProps {
  isOpen: boolean;
  timeline: TimelineData | null;
  onClose: () => void;
  onEventClick: (event: HistoricalEvent) => void;
  onEventHover?: (event: HistoricalEvent | null) => void;
}

type TabType = 'timeline' | 'events' | 'narrative';

export const ResultsSlidePanel: React.FC<ResultsSlidePanelProps> = ({
  isOpen,
  timeline,
  onClose,
  onEventClick,
  onEventHover,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('timeline');

  if (!timeline) return null;

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
    { id: 'events', label: 'Events', icon: <List className="w-4 h-4" /> },
    { id: 'narrative', label: 'Narrative', icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`
          fixed z-50 transition-transform duration-500 ease-out
          bg-paper dark:bg-night-light
          border-l border-gold/20 dark:border-gold/10
          shadow-2xl

          /* Mobile: slide from bottom */
          inset-x-0 bottom-0 h-[70vh] rounded-t-3xl
          md:inset-y-0 md:right-0 md:left-auto md:h-full md:w-[450px] md:rounded-none md:rounded-l-3xl

          ${isOpen ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-y-0 md:translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-paper/95 dark:bg-night-light/95 backdrop-blur-sm border-b border-gold/10">
          {/* Drag handle (mobile) */}
          <div className="flex justify-center py-2 md:hidden">
            <div className="w-12 h-1 bg-gold/30 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 hover:bg-gold/10 rounded-lg transition-colors text-ink/60 dark:text-paper/60"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="font-serif font-bold text-ink dark:text-paper text-lg leading-tight">
                  {timeline.region}
                </h2>
                <p className="text-xs text-ink/50 dark:text-paper/50">
                  {formatYear(timeline.timeRange.start)} — {formatYear(timeline.timeRange.end)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gold/10 rounded-lg transition-colors hidden md:block"
            >
              <X className="w-5 h-5 text-ink/60 dark:text-paper/60" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex px-4 pb-2 gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                  transition-all duration-200
                  ${activeTab === tab.id
                    ? 'bg-gold/20 text-gold dark:text-gold-light'
                    : 'text-ink/50 dark:text-paper/50 hover:bg-gold/10'
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-140px)] md:h-[calc(100%-120px)]">
          {activeTab === 'timeline' && (
            <TimelineContent
              timeline={timeline}
              onEventClick={onEventClick}
              onEventHover={onEventHover}
            />
          )}
          {activeTab === 'events' && (
            <EventsContent
              events={timeline.events}
              onEventClick={onEventClick}
              onEventHover={onEventHover}
            />
          )}
          {activeTab === 'narrative' && (
            <NarrativeContent narrative={timeline.narrative} />
          )}
        </div>
      </div>
    </>
  );
};

// Timeline tab content
const TimelineContent: React.FC<{
  timeline: TimelineData;
  onEventClick: (event: HistoricalEvent) => void;
  onEventHover?: (event: HistoricalEvent | null) => void;
}> = ({ timeline, onEventClick, onEventHover }) => {
  return (
    <div className="p-4 space-y-6">
      {timeline.eras.map((era) => {
        const eraEvents = timeline.events.filter(
          (e) => e.year >= era.startYear && e.year <= era.endYear
        );

        return (
          <div key={era.id} className="relative pl-6 border-l-2 border-gold/30">
            {/* Era marker */}
            <div className="absolute -left-2 top-0 w-4 h-4 bg-gold rounded-full border-2 border-paper dark:border-night-light" />

            <div className="mb-3">
              <h3 className="font-serif font-bold text-ink dark:text-paper">
                {era.title}
              </h3>
              <p className="text-xs text-gold dark:text-gold-light">
                {formatYear(era.startYear)} — {formatYear(era.endYear)}
              </p>
            </div>

            <div className="space-y-2">
              {eraEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  onMouseEnter={() => onEventHover?.(event)}
                  onMouseLeave={() => onEventHover?.(null)}
                  className="
                    w-full text-left p-3 rounded-lg
                    bg-white/50 dark:bg-night/50
                    hover:bg-gold/10 dark:hover:bg-gold/5
                    border border-transparent hover:border-gold/20
                    transition-all duration-200
                  "
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-gold dark:text-gold-light whitespace-nowrap">
                      {formatYear(event.year)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-ink dark:text-paper text-sm leading-tight">
                        {event.title}
                      </h4>
                      {event.isDisputed && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                          Disputed
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Events list tab content
const EventsContent: React.FC<{
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
  onEventHover?: (event: HistoricalEvent | null) => void;
}> = ({ events, onEventClick, onEventHover }) => {
  const sortedEvents = [...events].sort((a, b) => a.year - b.year);

  return (
    <div className="p-4 space-y-2">
      {sortedEvents.map((event) => (
        <button
          key={event.id}
          onClick={() => onEventClick(event)}
          onMouseEnter={() => onEventHover?.(event)}
          onMouseLeave={() => onEventHover?.(null)}
          className="
            w-full text-left p-4 rounded-xl
            bg-white/50 dark:bg-night/50
            hover:bg-gold/10 dark:hover:bg-gold/5
            border border-gold/10 hover:border-gold/30
            transition-all duration-200
          "
        >
          <div className="flex justify-between items-start gap-3 mb-2">
            <h4 className="font-serif font-bold text-ink dark:text-paper">
              {event.title}
            </h4>
            <span className="text-sm font-mono text-gold dark:text-gold-light whitespace-nowrap">
              {formatYear(event.year)}
            </span>
          </div>
          <p className="text-sm text-ink/70 dark:text-paper/70 line-clamp-2">
            {event.summary}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 bg-gold/10 text-gold dark:text-gold-light rounded">
              {event.category}
            </span>
            {event.isDisputed && (
              <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                Disputed
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
};

// Narrative tab content
const NarrativeContent: React.FC<{ narrative: string }> = ({ narrative }) => {
  return (
    <div className="p-6">
      <div className="prose prose-stone dark:prose-invert max-w-none">
        {narrative.split('\n\n').map((paragraph, i) => (
          <p
            key={i}
            className="text-ink/80 dark:text-paper/80 leading-relaxed mb-4 font-serif"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
};

export default ResultsSlidePanel;
