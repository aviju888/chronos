import React, { useState, useEffect, useCallback } from 'react';
import { SetupForm } from './components/SetupForm';
import { MapView } from './components/MapView';
import { TimelineView } from './components/TimelineView';
import { EventListView } from './components/EventListView';
import { NarrativeView } from './components/NarrativeView';
import { EventDetailModal } from './components/EventDetailModal';
import { ChatPanel } from './components/ChatPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { OnboardingOverlay, useOnboarding } from './components/OnboardingOverlay';
import { useToast, parseApiError } from './components/Toast';
import { ThemeToggle } from './components/ThemeToggle';
import { ShareExport } from './components/ShareExport';
import { generateTimeline, ProgressUpdate } from './services/apiService';
import { loadTimelines, saveTimelines, deleteTimeline as deleteTimelineFromStorage } from './services/storageService';
import { TimelineData, GenerationMode, HistoricalEvent } from './types';
import { Layout, Map, List, BookOpen, MessageCircle, Menu, HelpCircle, Share2 } from 'lucide-react';
import { formatYearRange } from './utils';

// URL hash parsing and generation for deep linking
const parseHash = (): { timelineId?: string; view?: string; eventId?: string } => {
  const hash = window.location.hash.slice(1); // Remove #
  if (!hash) return {};

  const parts = hash.split('/').filter(Boolean);
  const result: { timelineId?: string; view?: string; eventId?: string } = {};

  // Format: /timeline/{id}/{view} or /timeline/{id}/{view}/event/{eventId}
  if (parts[0] === 'timeline' && parts[1]) {
    result.timelineId = parts[1];
    if (parts[2] && ['map', 'timeline', 'list', 'narrative'].includes(parts[2])) {
      result.view = parts[2];
    }
    if (parts[3] === 'event' && parts[4]) {
      result.eventId = parts[4];
    }
  }

  return result;
};

const updateHash = (timelineId: string | null, view: string, eventId: string | null = null): void => {
  if (!timelineId) {
    // Clear hash when no timeline is active
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname);
    }
    return;
  }

  let hash = `#/timeline/${timelineId}/${view}`;
  if (eventId) {
    hash += `/event/${eventId}`;
  }

  // Only update if different to avoid unnecessary history entries
  if (window.location.hash !== hash) {
    history.pushState(null, '', hash);
  }
};

const App: React.FC = () => {
  // Persistence State
  const [timelines, setTimelines] = useState<TimelineData[]>([]);
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const [view, setView] = useState<'map' | 'timeline' | 'list' | 'narrative'>('map');
  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [pendingChatQuery, setPendingChatQuery] = useState<string | null>(null);

  // Toast notifications
  const { showError, showSuccess, ToastContainer } = useToast();

  // Onboarding
  const { showOnboarding, resetOnboarding, completeOnboarding } = useOnboarding();

  // Load from local storage on mount and restore URL state
  useEffect(() => {
    const loadedTimelines = loadTimelines();
    setTimelines(loadedTimelines);

    // Restore state from URL hash after timelines load
    const { timelineId, view: urlView, eventId } = parseHash();
    if (timelineId && loadedTimelines.some((t: TimelineData) => t.id === timelineId)) {
      setActiveTimelineId(timelineId);
      if (urlView) {
        setView(urlView as typeof view);
      }
      if (eventId) {
        const timeline = loadedTimelines.find((t: TimelineData) => t.id === timelineId);
        const event = timeline?.events.find((e: HistoricalEvent) => e.id === eventId);
        if (event) {
          setSelectedEvent(event);
        }
      }
    }
  }, []);

  // Save to local storage on change (with auto-cleanup)
  useEffect(() => {
    if (timelines.length === 0) return; // Don't save empty state on initial load

    const result = saveTimelines(timelines);

    if (!result.success) {
      showError('Storage Error', result.error || 'Failed to save timeline data.');
    } else if (result.cleanedUp && result.cleanedUp > 0) {
      showSuccess(
        'Storage Cleaned Up',
        `Removed ${result.cleanedUp} old timeline${result.cleanedUp > 1 ? 's' : ''} to make room for new data.`
      );
      // Reload timelines to reflect cleanup
      setTimelines(loadTimelines());
    }
  }, [timelines, showError, showSuccess]);

  // Update URL hash when state changes
  useEffect(() => {
    updateHash(activeTimelineId, view, selectedEvent?.id || null);
  }, [activeTimelineId, view, selectedEvent]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const { timelineId, view: urlView, eventId } = parseHash();

      if (timelineId && timelines.some(t => t.id === timelineId)) {
        setActiveTimelineId(timelineId);
        if (urlView) {
          setView(urlView as typeof view);
        }
        if (eventId) {
          const timeline = timelines.find(t => t.id === timelineId);
          const event = timeline?.events.find(e => e.id === eventId);
          setSelectedEvent(event || null);
        } else {
          setSelectedEvent(null);
        }
      } else {
        setActiveTimelineId(null);
        setSelectedEvent(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [timelines]);

  const activeData = timelines.find(t => t.id === activeTimelineId) || null;

  const handleGenerate = async (region: string, start: number, end: number, mode: GenerationMode) => {
    setLoading(true);
    setLogs([]);
    setProgress(null);
    try {
      const result = await generateTimeline(region, start, end, mode, (update) => {
        setProgress(update);
        setLogs(prev => {
             // Avoid duplicate logs if update sends same message
             if(prev[prev.length - 1] === update.message) return prev;
             return [...prev, update.message];
        });
      });

      setTimelines(prev => [...prev, result]);
      setActiveTimelineId(result.id);
      setView('map');

      // Warn if timeline has no events or very few events
      if (!result.events || result.events.length === 0) {
        showError('No Events Found', `The AI couldn't find documented events for "${region}" in this time period. Try a broader range or different region.`);
      } else if (result.events.length < 5) {
        showSuccess('Timeline Generated', `Found ${result.events.length} events for ${region}. Consider expanding the time range for more results.`);
      } else {
        showSuccess('Timeline Generated', `Successfully created timeline for ${region} with ${result.events.length} events.`);
      }
    } catch (error) {
      console.error(error);
      const { title, message } = parseApiError(error);
      showError(title, message, {
        label: 'Try Again',
        onClick: () => handleGenerate(region, start, end, mode),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTimeline = (id: string) => {
    if(confirm("Are you sure you want to burn this archive?")) {
      setTimelines(prev => deleteTimelineFromStorage(prev, id));
      if (activeTimelineId === id) setActiveTimelineId(null);
    }
  };

  const handleAskHistorian = (event: HistoricalEvent) => {
    setSelectedEvent(null);
    setIsChatOpen(true);
    setPendingChatQuery(`Tell me interesting details about the event "${event.title}" (${event.year}) that aren't in the summary.`);
  };

  const NavButton = ({ id, icon: Icon, label }: { id: typeof view, icon: React.ElementType, label: string }) => (
    <button
      onClick={() => setView(id)}
      aria-label={label}
      aria-pressed={view === id}
      className={`flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] px-3 md:px-4 py-2 rounded-full font-bold text-sm transition-all ${
        view === id
          ? 'bg-ink text-gold shadow-md border border-gold'
          : 'bg-paper text-slate hover:bg-stone-200 border border-transparent'
      }`}
    >
      <Icon className="w-5 h-5 md:w-4 md:h-4" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-paper dark:bg-night overflow-hidden text-ink dark:text-paper transition-colors duration-300">
      <ThemeToggle />
      <ToastContainer />

      {/* Onboarding overlay for first-time users */}
      {showOnboarding && (
        <OnboardingOverlay onComplete={completeOnboarding} />
      )}

      <HistorySidebar 
        timelines={timelines}
        activeId={activeTimelineId}
        onSelect={setActiveTimelineId}
        onNew={() => setActiveTimelineId(null)}
        onDelete={handleDeleteTimeline}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {!activeData ? (
        <div className="flex-1 overflow-auto bg-grid-pattern relative">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] opacity-50 pointer-events-none"></div>
             <div className="absolute inset-0 bg-gradient-to-b from-stone-100/50 to-stone-300/50 pointer-events-none"></div>
             
             <div className="relative z-10 pt-10 px-4">
                 <SetupForm 
                    onGenerate={handleGenerate} 
                    isLoading={loading} 
                    progress={progress}
                    logs={logs}
                 />
                 
                 {/* Decorative Hero Elements if empty */}
                 {!loading && (
                     <div className="mt-16 text-center opacity-30 select-none pointer-events-none">
                         <p className="font-display text-7xl text-stone-400 font-bold uppercase tracking-[1rem]">History Awaits</p>
                         <p className="font-serif italic text-stone-500 mt-4">Select an existing archive from the sidebar or start a new investigation.</p>
                     </div>
                 )}

                 {/* Help button to restart onboarding */}
                 {!loading && (
                   <div className="fixed bottom-6 right-6 z-50">
                     <button
                       onClick={resetOnboarding}
                       className="p-3 bg-ink text-paper rounded-full shadow-lg hover:bg-ink-light transition-colors flex items-center gap-2 group"
                       aria-label="Take a tour"
                     >
                       <HelpCircle className="w-5 h-5" />
                       <span className="hidden group-hover:inline text-sm font-medium">Take a Tour</span>
                     </button>
                   </div>
                 )}
             </div>
        </div>
      ) : (
        <>
          {/* Main App Layout */}
          
          {/* Header Bar */}
          <header className="bg-paper-dark dark:bg-night-light border-b-2 border-gold-dark/30 px-6 py-3 flex justify-between items-center shadow-lg z-20 relative">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/aged-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-50 dark:opacity-30 pointer-events-none"></div>
            
            <div className="flex items-center gap-4 relative z-10 ml-12 md:ml-0">
              <h1 className="font-display font-bold text-xl text-ink dark:text-gold hidden md:block tracking-widest">CHRONOS</h1>
              <div className="h-6 w-px bg-gold-dark hidden md:block"></div>
              <div>
                <span className="block font-serif font-bold text-ink dark:text-paper text-lg leading-none">{activeData.region}</span>
                <span className="text-xs text-gold-dark dark:text-gold-light font-bold tracking-widest uppercase font-antique">
                    {formatYearRange(activeData.timeRange.start, activeData.timeRange.end)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 relative z-10 overflow-x-auto pb-1 md:pb-0">
              <NavButton id="map" icon={Map} label="Map" />
              <NavButton id="timeline" icon={Layout} label="Timeline" />
              <NavButton id="list" icon={List} label="Events" />
              <NavButton id="narrative" icon={BookOpen} label="Narrative" />
            </div>

            <div className="flex gap-2 items-center relative z-10">
              <button
                onClick={() => setIsShareOpen(true)}
                aria-label="Share & Export"
                className="p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-200 dark:bg-night-lighter text-slate dark:text-paper hover:bg-stone-300 dark:hover:bg-night"
              >
                <Share2 className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                aria-label="Ask Historian"
                aria-pressed={isChatOpen}
                className={`p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${isChatOpen ? 'bg-gold text-ink shadow-lg ring-2 ring-gold-light' : 'bg-stone-200 dark:bg-night-lighter text-slate dark:text-paper hover:bg-stone-300 dark:hover:bg-night'}`}
              >
                <MessageCircle className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 relative overflow-hidden bg-stone-100 dark:bg-night">
             {view === 'map' && <MapView events={activeData.events} timeRange={activeData.timeRange} onEventClick={setSelectedEvent} />}
             {view === 'timeline' && <div className="h-full overflow-y-auto"><TimelineView eras={activeData.eras} events={activeData.events} onEventClick={setSelectedEvent} /></div>}
             {view === 'list' && <EventListView events={activeData.events} onEventClick={setSelectedEvent} />}
             {view === 'narrative' && <div className="h-full overflow-y-auto"><NarrativeView text={activeData.narrative} /></div>}
             
             {/* Chat Panel Overlay */}
             <ChatPanel 
                timelineData={activeData} 
                isOpen={isChatOpen} 
                onClose={() => setIsChatOpen(false)} 
                pendingMessage={pendingChatQuery}
                onMessageHandled={() => setPendingChatQuery(null)}
             />
          </main>

          {/* Event Detail Modal */}
          <EventDetailModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onAskHistorian={handleAskHistorian}
          />

          {/* Share/Export Modal */}
          <ShareExport
            timeline={activeData}
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
          />
        </>
      )}
    </div>
  );
};

export default App;
