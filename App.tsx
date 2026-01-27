import React, { useState, useEffect, useCallback } from 'react';
import { GlobeView } from './components/globe/GlobeView';
import { RegionInputPanel } from './components/overlays/RegionInputPanel';
import { TimeRangePanel } from './components/overlays/TimeRangePanel';
import { GenerationPanel } from './components/overlays/GenerationPanel';
import { ResultsSlidePanel } from './components/overlays/ResultsSlidePanel';
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
import { generateTimeline, getRegionsFromCoordinates, getTimeRange, ProgressUpdate } from './services/apiService';
import { TimelineData, GenerationMode, HistoricalEvent } from './types';
import { Layout, Map, List, BookOpen, MessageCircle, Share2, X, ChevronRight } from 'lucide-react';
import { formatYearRange } from './utils';

// Curated historical regions for "Surprise Me" feature
const SURPRISE_REGIONS = [
  { region: "Ancient Egypt", start: -3100, end: -30 },
  { region: "Ancient Greece", start: -800, end: -31 },
  { region: "Roman Empire", start: -753, end: 476 },
  { region: "Byzantine Empire", start: 330, end: 1453 },
  { region: "Viking Age Scandinavia", start: 793, end: 1066 },
  { region: "Medieval Japan", start: 1185, end: 1603 },
  { region: "Mongol Empire", start: 1206, end: 1368 },
  { region: "Renaissance Italy", start: 1300, end: 1600 },
  { region: "Aztec Empire", start: 1428, end: 1521 },
  { region: "Ottoman Empire", start: 1299, end: 1922 },
  { region: "Ming Dynasty China", start: 1368, end: 1644 },
  { region: "Mughal Empire", start: 1526, end: 1857 },
  { region: "Age of Exploration", start: 1400, end: 1600 },
  { region: "French Revolution", start: 1789, end: 1799 },
  { region: "American Civil War", start: 1861, end: 1865 },
  { region: "Victorian England", start: 1837, end: 1901 },
  { region: "Meiji Japan", start: 1868, end: 1912 },
  { region: "World War I", start: 1914, end: 1918 },
  { region: "Roaring Twenties America", start: 1920, end: 1929 },
  { region: "World War II", start: 1939, end: 1945 },
  { region: "Cold War Era", start: 1947, end: 1991 },
  { region: "Ancient Mesopotamia", start: -3500, end: -539 },
  { region: "Persian Empire", start: -550, end: -330 },
  { region: "Han Dynasty China", start: -206, end: 220 },
  { region: "Inca Empire", start: 1438, end: 1533 },
  { region: "Khmer Empire", start: 802, end: 1431 },
  { region: "Mali Empire", start: 1235, end: 1600 },
  { region: "Qing Dynasty China", start: 1644, end: 1912 },
  { region: "Spanish Golden Age", start: 1492, end: 1659 },
  { region: "Dutch Golden Age", start: 1588, end: 1672 },
];

// URL hash parsing and generation for deep linking
const parseHash = (): { timelineId?: string; view?: string; eventId?: string } => {
  const hash = window.location.hash.slice(1);
  if (!hash) return {};

  const parts = hash.split('/').filter(Boolean);
  const result: { timelineId?: string; view?: string; eventId?: string } = {};

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
    if (window.location.hash) {
      history.pushState(null, '', window.location.pathname);
    }
    return;
  }

  let hash = `#/timeline/${timelineId}/${view}`;
  if (eventId) {
    hash += `/event/${eventId}`;
  }

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

  const [selectedEvent, setSelectedEvent] = useState<HistoricalEvent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [pendingChatQuery, setPendingChatQuery] = useState<string | null>(null);

  // Globe/Region Selection State
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [startYear, setStartYear] = useState(-500);
  const [endYear, setEndYear] = useState(500);
  const [mode, setMode] = useState<GenerationMode>('quick');
  const [focusLocation, setFocusLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<HistoricalEvent | null>(null);

  // Toast notifications
  const { showError, showSuccess, ToastContainer } = useToast();

  // Onboarding
  const { showOnboarding, completeOnboarding } = useOnboarding();

  // Load from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chronos_archives');
      if (saved) {
        const loadedTimelines = JSON.parse(saved);
        setTimelines(loadedTimelines);

        const { timelineId, eventId } = parseHash();
        if (timelineId && loadedTimelines.some((t: TimelineData) => t.id === timelineId)) {
          setActiveTimelineId(timelineId);
          setIsResultsOpen(true);
          if (eventId) {
            const timeline = loadedTimelines.find((t: TimelineData) => t.id === timelineId);
            const event = timeline?.events.find((e: HistoricalEvent) => e.id === eventId);
            if (event) {
              setSelectedEvent(event);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load archives", e);
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    try {
      localStorage.setItem('chronos_archives', JSON.stringify(timelines));
    } catch (e) {
      console.error("Failed to save archives (quota exceeded?)", e);
    }
  }, [timelines]);

  // Update URL hash when state changes
  useEffect(() => {
    updateHash(activeTimelineId, 'map', selectedEvent?.id || null);
  }, [activeTimelineId, selectedEvent]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const { timelineId, eventId } = parseHash();

      if (timelineId && timelines.some(t => t.id === timelineId)) {
        setActiveTimelineId(timelineId);
        setIsResultsOpen(true);
        if (eventId) {
          const timeline = timelines.find(t => t.id === timelineId);
          const event = timeline?.events.find(e => e.id === eventId);
          setSelectedEvent(event || null);
        } else {
          setSelectedEvent(null);
        }
      } else {
        setActiveTimelineId(null);
        setIsResultsOpen(false);
        setSelectedEvent(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [timelines]);

  const activeData = timelines.find(t => t.id === activeTimelineId) || null;

  // Handle country click on globe
  const handleCountryClick = async (countryName: string, lat: number, lng: number) => {
    setSelectedCountry(countryName);
    setFocusLocation({ lat, lng });

    // Fetch historical region suggestions for this location
    try {
      const suggestions = await getRegionsFromCoordinates(lat, lng);
      if (suggestions.length > 0) {
        setSelectedRegion(suggestions[0]);

        // Also get optimal time range for this region
        try {
          const timeRange = await getTimeRange(suggestions[0]);
          setStartYear(timeRange.start);
          setEndYear(timeRange.end);
        } catch (e) {
          console.error('Failed to get time range:', e);
        }
      }
    } catch (e) {
      // Fallback to country name
      setSelectedRegion(countryName);
    }
  };

  // Handle region change from input
  const handleRegionChange = async (region: string) => {
    setSelectedRegion(region);

    // Get optimal time range for this region
    if (region.length > 2) {
      try {
        const timeRange = await getTimeRange(region);
        setStartYear(timeRange.start);
        setEndYear(timeRange.end);
      } catch (e) {
        console.error('Failed to get time range:', e);
      }
    }
  };

  // Generate timeline
  const handleGenerate = async () => {
    if (!selectedRegion.trim()) return;

    setLoading(true);
    setProgress(null);
    try {
      const result = await generateTimeline(selectedRegion, startYear, endYear, mode, (update) => {
        setProgress(update);
      });

      setTimelines(prev => [...prev, result]);
      setActiveTimelineId(result.id);
      setIsResultsOpen(true);
      showSuccess('Timeline Generated', `Successfully created timeline for ${selectedRegion}.`);
    } catch (error) {
      console.error(error);
      const { title, message } = parseApiError(error);
      showError(title, message, {
        label: 'Try Again',
        onClick: handleGenerate,
      });
    } finally {
      setLoading(false);
    }
  };

  // Surprise Me - pick random region
  const handleSurpriseMe = () => {
    const randomIndex = Math.floor(Math.random() * SURPRISE_REGIONS.length);
    const surprise = SURPRISE_REGIONS[randomIndex];
    setSelectedRegion(surprise.region);
    setStartYear(surprise.start);
    setEndYear(surprise.end);
    setSelectedCountry(null);
    setFocusLocation(null);
  };

  // Clear country selection
  const clearCountrySelection = () => {
    setSelectedCountry(null);
    setFocusLocation(null);
  };

  // Delete timeline
  const deleteTimeline = (id: string) => {
    if (confirm("Are you sure you want to delete this archive?")) {
      setTimelines(prev => prev.filter(t => t.id !== id));
      if (activeTimelineId === id) {
        setActiveTimelineId(null);
        setIsResultsOpen(false);
      }
    }
  };

  // Handle event click (from results panel or globe)
  const handleEventClick = (event: HistoricalEvent) => {
    setSelectedEvent(event);
    if (event.location?.lat && event.location?.lng) {
      setFocusLocation({ lat: event.location.lat, lng: event.location.lng });
    }
  };

  // Handle event hover (highlight on globe)
  const handleEventHover = (event: HistoricalEvent | null) => {
    setHoveredEvent(event);
    if (event?.location?.lat && event?.location?.lng) {
      // Could add visual feedback here
    }
  };

  // Ask historian from event modal
  const handleAskHistorian = (event: HistoricalEvent) => {
    setSelectedEvent(null);
    setIsChatOpen(true);
    setPendingChatQuery(`Tell me interesting details about the event "${event.title}" (${event.year}) that aren't in the summary.`);
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-night">
      {/* Global UI Elements */}
      <ThemeToggle />
      <ToastContainer />

      {/* Onboarding overlay */}
      {showOnboarding && (
        <OnboardingOverlay onComplete={completeOnboarding} />
      )}

      {/* History Sidebar */}
      <HistorySidebar
        timelines={timelines}
        activeId={activeTimelineId}
        onSelect={(id) => {
          setActiveTimelineId(id);
          setIsResultsOpen(true);
        }}
        onNew={() => {
          setActiveTimelineId(null);
          setIsResultsOpen(false);
          setSelectedRegion('');
          setSelectedCountry(null);
        }}
        onDelete={deleteTimeline}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      {/* 3D Globe - Full Screen Background */}
      <GlobeView
        events={activeData?.events || []}
        onCountryClick={handleCountryClick}
        onEventClick={handleEventClick}
        focusLocation={focusLocation}
        isInteractive={!loading}
      />

      {/* Floating Overlay Panels - Only show when no active timeline or results closed */}
      {!isResultsOpen && (
        <>
          <RegionInputPanel
            selectedRegion={selectedRegion}
            onRegionChange={handleRegionChange}
            selectedCountry={selectedCountry}
            onClearCountry={clearCountrySelection}
          />

          <TimeRangePanel
            startYear={startYear}
            endYear={endYear}
            onStartYearChange={setStartYear}
            onEndYearChange={setEndYear}
          />

          <GenerationPanel
            region={selectedRegion}
            mode={mode}
            onModeChange={setMode}
            onGenerate={handleGenerate}
            onSurpriseMe={handleSurpriseMe}
            isLoading={loading}
            progress={progress}
          />
        </>
      )}

      {/* Mini Header when results are open */}
      {isResultsOpen && activeData && (
        <div className="fixed top-4 left-16 z-50 flex items-center gap-3">
          <button
            onClick={() => setIsResultsOpen(false)}
            className="p-2 bg-paper/90 dark:bg-night/90 backdrop-blur-lg rounded-full shadow-lg border border-gold/20 hover:scale-105 transition-transform"
          >
            <X className="w-5 h-5 text-ink dark:text-paper" />
          </button>
          <div className="px-4 py-2 bg-paper/90 dark:bg-night/90 backdrop-blur-lg rounded-xl shadow-lg border border-gold/20">
            <span className="font-serif font-bold text-ink dark:text-paper">{activeData.region}</span>
            <span className="ml-2 text-xs text-gold">{formatYearRange(activeData.timeRange.start, activeData.timeRange.end)}</span>
          </div>

          {/* Action buttons */}
          <button
            onClick={() => setIsShareOpen(true)}
            className="p-2 bg-paper/90 dark:bg-night/90 backdrop-blur-lg rounded-full shadow-lg border border-gold/20 hover:scale-105 transition-transform"
          >
            <Share2 className="w-5 h-5 text-ink dark:text-paper" />
          </button>
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`p-2 backdrop-blur-lg rounded-full shadow-lg border transition-all ${
              isChatOpen
                ? 'bg-gold text-ink border-gold'
                : 'bg-paper/90 dark:bg-night/90 border-gold/20 hover:scale-105'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
          </button>

          {/* Reopen results button */}
          <button
            onClick={() => setIsResultsOpen(true)}
            className="p-2 bg-gold/90 backdrop-blur-lg rounded-full shadow-lg border border-gold hover:scale-105 transition-transform"
          >
            <ChevronRight className="w-5 h-5 text-ink" />
          </button>
        </div>
      )}

      {/* Results Slide Panel */}
      <ResultsSlidePanel
        isOpen={isResultsOpen}
        timeline={activeData}
        onClose={() => setIsResultsOpen(false)}
        onEventClick={handleEventClick}
        onEventHover={handleEventHover}
      />

      {/* Chat Panel */}
      {activeData && (
        <ChatPanel
          timelineData={activeData}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          pendingMessage={pendingChatQuery}
          onMessageHandled={() => setPendingChatQuery(null)}
        />
      )}

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onAskHistorian={handleAskHistorian}
      />

      {/* Share/Export Modal */}
      {activeData && (
        <ShareExport
          timeline={activeData}
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
