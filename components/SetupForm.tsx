import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GenerationMode } from '../types';
import { Calendar, Zap, BookOpen, Clock, Loader2, CheckCircle2, Hourglass, Wand2, Search, Globe, Shuffle, MapPin, Compass, BookMarked, History } from 'lucide-react';
import { ProgressUpdate, getSearchSuggestions, getSmartTimeRange, getRegionsFromCoordinates } from '../services/apiService';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Categorize suggestions
interface CategorizedSuggestion {
  name: string;
  category: 'city' | 'region' | 'topic' | 'era' | 'other';
}

function categorizeSuggestion(suggestion: string): CategorizedSuggestion {
  const s = suggestion.toLowerCase();
  const eraPatterns = ['dynasty', 'era', 'age', 'period', 'century', 'renaissance', 'enlightenment', 'medieval', 'ancient', 'classical', 'modern', 'pre-', 'post-', 'golden age'];
  if (eraPatterns.some(p => s.includes(p))) return { name: suggestion, category: 'era' };
  const topicPatterns = ['revolution', 'war', 'empire', 'trade', 'silk road', 'crusade', 'reformation', 'industrial', 'movement', 'rebellion', 'conquest'];
  if (topicPatterns.some(p => s.includes(p))) return { name: suggestion, category: 'topic' };
  const regionPatterns = ['kingdom', 'republic', 'confederation', 'states', 'union', 'federation', 'territory', 'province', 'empire'];
  if (regionPatterns.some(p => s.includes(p))) return { name: suggestion, category: 'region' };
  // Nothing matched: don't confidently label unknown input as a city —
  // group it under a neutral "Search for..." bucket instead
  return { name: suggestion, category: 'other' };
}

const categoryConfig = {
  city: { label: 'Cities', icon: MapPin, order: 1 },
  region: { label: 'Regions', icon: Compass, order: 2 },
  topic: { label: 'Topics', icon: BookMarked, order: 3 },
  era: { label: 'Eras', icon: History, order: 4 },
  other: { label: 'Search for...', icon: Search, order: 5 }
};

// Leaflet Icon fix
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface SetupFormProps {
  onGenerate: (region: string, start: number, end: number, mode: GenerationMode) => void;
  isLoading: boolean;
  progress: ProgressUpdate | null;
  logs: string[];
  initialQuery?: string | null;
  onQueryHandled?: () => void;
}

const PRESET_CHIPS = [
  { region: "Ancient Rome", start: -753, end: 476 },
  { region: "Feudal Japan", start: 1185, end: 1603 },
  { region: "Victorian England", start: 1837, end: 1901 },
  { region: "Ancient Egypt", start: -3100, end: -30 },
  { region: "Renaissance Italy", start: 1300, end: 1600 },
  { region: "The Silk Road", start: -130, end: 1453 },
];

const SURPRISE_REGIONS = [
  { region: "Ancient Egypt", start: -3100, end: -30 },
  { region: "Ancient Greece", start: -800, end: -31 },
  { region: "Ancient Rome", start: -753, end: 476 },
  { region: "Persian Empire", start: -550, end: -330 },
  { region: "Han Dynasty China", start: -206, end: 220 },
  { region: "Byzantine Empire", start: 330, end: 1453 },
  { region: "Viking Age Scandinavia", start: 793, end: 1066 },
  { region: "Medieval England", start: 1066, end: 1485 },
  { region: "Mongol Empire", start: 1206, end: 1368 },
  { region: "Islamic Golden Age", start: 750, end: 1258 },
  { region: "Renaissance Italy", start: 1300, end: 1600 },
  { region: "Spanish Empire", start: 1492, end: 1898 },
  { region: "Mughal Empire", start: 1526, end: 1857 },
  { region: "Edo Period Japan", start: 1603, end: 1868 },
  { region: "French Revolution", start: 1789, end: 1799 },
  { region: "Victorian Britain", start: 1837, end: 1901 },
  { region: "Soviet Union", start: 1922, end: 1991 },
  { region: "Silk Road", start: -130, end: 1453 },
  { region: "Inca Empire", start: 1438, end: 1533 },
  { region: "Ancient Mesopotamia", start: -3500, end: -539 },
];

// Map Click Component
const MapClickReceiver: React.FC<{ onLocationSelected: (lat: number, lng: number) => void }> = ({ onLocationSelected }) => {
  useMapEvents({ click(e) { onLocationSelected(e.latlng.lat, e.latlng.lng); } });
  return null;
};

// Categorized Suggestions Dropdown
const CategorizedSuggestionsDropdown: React.FC<{
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}> = ({ suggestions, onSelect }) => {
  const categorized = useMemo(() => {
    const grouped: Record<string, CategorizedSuggestion[]> = { city: [], region: [], topic: [], era: [], other: [] };
    suggestions.forEach(s => {
      const cat = categorizeSuggestion(s);
      grouped[cat.category].push(cat);
    });
    return Object.entries(grouped)
      .filter(([_, items]) => items.length > 0)
      .sort(([a], [b]) => categoryConfig[a as keyof typeof categoryConfig].order - categoryConfig[b as keyof typeof categoryConfig].order);
  }, [suggestions]);

  return (
    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-paper dark:bg-night-light border-2 border-gold rounded-lg shadow-xl max-h-72 overflow-y-auto">
      {categorized.map(([category, items]) => {
        const config = categoryConfig[category as keyof typeof categoryConfig];
        const Icon = config.icon;
        return (
          <div key={category}>
            <div className="px-3 py-2 bg-ink/5 dark:bg-white/5 border-b border-gold/20 sticky top-0">
              <div className="flex items-center gap-2 text-xs font-bold text-sepia dark:text-stone-400 uppercase tracking-widest">
                <Icon className="w-3 h-3 text-gold" />
                {config.label}
              </div>
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.name}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.name)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gold/20 text-ink dark:text-paper font-serif transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4 text-gold opacity-50" />
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

export const SetupForm: React.FC<SetupFormProps> = ({ onGenerate, isLoading, progress, logs, initialQuery, onQueryHandled }) => {
  const [region, setRegion] = useState('');
  const [startYear, setStartYear] = useState<number>(1800);
  const [endYear, setEndYear] = useState<number>(2000);
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.QUICK);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isTimeOptimizing, setIsTimeOptimizing] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
  const [mapSuggestions, setMapSuggestions] = useState<string[]>([]);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const suggestionBoxRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setRegion(initialQuery);
      optimizeTimeRange(initialQuery);
      onQueryHandled?.();
    }
  }, [initialQuery, onQueryHandled]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (region.length < 3) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setIsSuggestionsLoading(true);
      const results = await getSearchSuggestions(region);
      setSuggestions(results);
      if (results.length > 0) setShowSuggestions(true);
      setIsSuggestionsLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [region]);

  const optimizeTimeRange = async (selectedRegion: string) => {
    setIsTimeOptimizing(true);
    const range = await getSmartTimeRange(selectedRegion);
    if (range) { setStartYear(range.start); setEndYear(range.end); }
    setIsTimeOptimizing(false);
  };

  const handleSuggestionClick = (s: string) => {
    setRegion(s);
    setShowSuggestions(false);
    optimizeTimeRange(s);
  };

  const handlePresetClick = (preset: { region: string; start: number; end: number }) => {
    setRegion(preset.region);
    setStartYear(preset.start);
    setEndYear(preset.end);
  };

  const handleMapClick = async (lat: number, lng: number) => {
    setSelectedCoords([lat, lng]);
    setIsMapLoading(true);
    setMapSuggestions([]);
    const suggestions = await getRegionsFromCoordinates(lat, lng);
    setMapSuggestions(suggestions);
    setIsMapLoading(false);
  };

  // Validation for year range
  const yearValidationError = (() => {
    if (startYear === 0 || endYear === 0) return 'Year 0 does not exist (use -1 for 1 BC).';
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear)) return 'Years must be whole numbers.';
    if (startYear >= endYear) return 'Start year must be before end year.';
    if (endYear - startYear > 5000) return 'Time range cannot exceed 5,000 years.';
    return null;
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (yearValidationError) return;
    onGenerate(region, startYear, endYear, mode);
  };

  const handleRecentHistory = () => {
    const currentYear = new Date().getFullYear();
    setStartYear(currentYear - 100);
    setEndYear(currentYear);
  };

  const handleSurpriseMe = () => {
    const randomIndex = Math.floor(Math.random() * SURPRISE_REGIONS.length);
    const surprise = SURPRISE_REGIONS[randomIndex];
    setRegion(surprise.region);
    setStartYear(surprise.start);
    setEndYear(surprise.end);
  };

  return (
    <div className="max-w-3xl mx-2 md:mx-auto bg-paper-dark dark:bg-night-light shadow-archive rounded-lg overflow-hidden border-manuscript mt-4 md:mt-10 mb-4 md:mb-10 relative animate-page-turn">
      <div className="absolute top-0 left-0 w-full gold-strip"></div>

      <div className="bg-ink p-5 md:p-8 text-paper text-center relative overflow-hidden vignette">
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-20"></div>
        <h1 className="text-3xl md:text-5xl font-display font-bold text-gold mb-1 md:mb-2 tracking-[0.15em] md:tracking-[0.25em] relative z-10 text-embossed animate-candle">CHRONOS</h1>
        <p className="text-gold-light/70 font-antique text-sm md:text-lg tracking-widest relative z-10">Deep History Explorer</p>

          <button
            type="button"
            onClick={handleSurpriseMe}
            disabled={isLoading}
            className="relative z-10 mt-4 px-5 py-1.5 text-xs font-bold text-gold border border-gold/50 rounded-full hover:bg-gold/20 transition-all uppercase tracking-widest flex items-center gap-2 mx-auto disabled:opacity-50"
          >
            <Shuffle className="w-3 h-3" />
            Surprise Me
          </button>
        </div>

      <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-6 md:space-y-8 bg-paper dark:bg-night-light relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

          {/* Search Input - Spacious */}
          <div className="relative" ref={suggestionBoxRef}>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gold" />
              <input
                type="text"
                placeholder="Enter a region, city, or topic..."
                value={region}
                onChange={(e) => { setRegion(e.target.value); setShowSuggestions(true); }}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                disabled={isLoading}
                className="w-full pl-12 pr-12 py-4 text-lg border-2 border-gold/40 dark:border-gold/50 rounded-lg focus:ring-2 focus:ring-gold focus:border-gold focus:outline-none bg-white dark:bg-night font-serif text-ink dark:text-paper placeholder:text-stone-400 dark:placeholder:text-stone-500 disabled:opacity-50"
                required
              />
              {isSuggestionsLoading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-gold" />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && !isLoading && (
              <CategorizedSuggestionsDropdown suggestions={suggestions} onSelect={handleSuggestionClick} />
            )}
          </div>

          {/* Subtle Text Pills */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-sm">
            <span className="text-stone-400 dark:text-stone-500">Try:</span>
            {PRESET_CHIPS.map((preset) => (
              <button
                key={preset.region}
                type="button"
                onClick={() => handlePresetClick(preset)}
                disabled={isLoading}
                className={`transition-colors disabled:opacity-50 ${
                  region === preset.region
                    ? 'text-gold font-bold'
                    : 'text-sepia dark:text-stone-400 hover:text-gold'
                }`}
              >
                {preset.region}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMapPicker(!showMapPicker)}
              disabled={isLoading}
              className="text-sepia dark:text-stone-400 hover:text-gold transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Globe className="w-3 h-3" />
              Map
            </button>
          </div>

          {/* Map Picker */}
          {showMapPicker && (
            <div className="border border-gold/30 rounded-lg overflow-hidden">
              <div className="h-40 w-full relative z-0">
                <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                  <MapClickReceiver onLocationSelected={handleMapClick} />
                  {selectedCoords && <Marker position={selectedCoords} />}
                </MapContainer>
              </div>
              <div className="bg-ink/90 p-3 text-center">
                {isMapLoading ? (
                  <span className="text-gold text-xs flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Finding regions...
                  </span>
                ) : mapSuggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {mapSuggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { handleSuggestionClick(s); setShowMapPicker(false); }}
                        className="text-gold hover:text-gold-light text-sm transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-stone-500 text-xs">
                    {selectedCoords ? "No suggestions found" : "Click anywhere on the map"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Compact Settings Section */}
          <div className="border-t border-gold/20 pt-5 space-y-5">

            {/* Time Range - Compact Row */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-bold text-ink dark:text-paper shrink-0">
                <Calendar className="w-4 h-4 text-gold" />
                Time Range
              </div>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  value={startYear}
                  onChange={(e) => setStartYear(Number(e.target.value))}
                  disabled={isLoading || isTimeOptimizing}
                  className="w-24 p-2 border border-gold/30 dark:border-gold/40 rounded focus:ring-2 focus:ring-gold bg-white dark:bg-night text-center font-display text-ink dark:text-paper disabled:opacity-50"
                />
                <span className="text-gold">—</span>
                <input
                  type="number"
                  value={endYear}
                  onChange={(e) => setEndYear(Number(e.target.value))}
                  disabled={isLoading || isTimeOptimizing}
                  className="w-24 p-2 border border-gold/30 dark:border-gold/40 rounded focus:ring-2 focus:ring-gold bg-white dark:bg-night text-center font-display text-ink dark:text-paper disabled:opacity-50"
                />
                {isTimeOptimizing && <Loader2 className="w-4 h-4 animate-spin text-gold" />}
              </div>
              <button
                type="button"
                onClick={handleRecentHistory}
                disabled={isLoading}
                className="text-xs text-sepia dark:text-stone-400 hover:text-gold flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0"
              >
                <Clock className="w-3 h-3" /> Recent
              </button>
            </div>
            {yearValidationError && (
              <p className="text-xs text-crimson dark:text-crimson-light font-bold mt-1">{yearValidationError}</p>
            )}

            {/* Mode Selection - Two Cards */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode(GenerationMode.QUICK)}
                disabled={isLoading}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  mode === GenerationMode.QUICK
                    ? 'border-gold bg-gold/10 dark:bg-gold/20'
                    : 'border-gold/20 dark:border-gold/30 hover:border-gold/50 bg-paper-cream dark:bg-night'
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Zap className={`w-4 h-4 ${mode === GenerationMode.QUICK ? 'text-gold' : 'text-sepia dark:text-stone-400'}`} />
                  <span className={`font-bold text-sm ${mode === GenerationMode.QUICK ? 'text-ink dark:text-paper' : 'text-ink dark:text-paper'}`}>
                    Quick Overview
                  </span>
                </div>
                <p className="text-xs text-sepia dark:text-stone-400">Fast generation, broad strokes</p>
              </button>

              <button
                type="button"
                onClick={() => setMode(GenerationMode.DEEP)}
                disabled={isLoading}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  mode === GenerationMode.DEEP
                    ? 'border-gold bg-gold/10 dark:bg-gold/20'
                    : 'border-gold/20 dark:border-gold/30 hover:border-gold/50 bg-paper-cream dark:bg-night'
                } disabled:opacity-50`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className={`w-4 h-4 ${mode === GenerationMode.DEEP ? 'text-gold' : 'text-sepia dark:text-stone-400'}`} />
                  <span className={`font-bold text-sm ${mode === GenerationMode.DEEP ? 'text-ink dark:text-paper' : 'text-ink dark:text-paper'}`}>
                    Deep Research
                  </span>
                </div>
                <p className="text-xs text-sepia dark:text-stone-400">Thorough analysis, multiple sources</p>
              </button>
            </div>
          </div>

          {/* Submit or Loading */}
          {!isLoading ? (
            <button
              type="submit"
              disabled={!region || !!yearValidationError}
              className="w-full py-4 text-lg font-display font-bold text-ink bg-gold hover:bg-gold-light tracking-widest uppercase transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Construct Timeline
            </button>
          ) : (
            <div className="bg-ink rounded-lg p-5 border border-gold">
              <div className="w-full h-1.5 bg-stone-700 rounded-full mb-4 overflow-hidden">
                <div
                  className="h-full bg-gold transition-all duration-700 ease-out"
                  style={{ width: `${progress?.percent || 5}%` }}
                />
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-gold-light">
                  <Loader2 className="w-4 h-4 animate-spin text-gold" />
                  <span className="font-display text-xs tracking-widest">RESEARCHING...</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-stone-400 font-mono">
                  <Hourglass className="w-3 h-3" />
                  <span>~{progress?.timeLeft || '?'}s</span>
                </div>
              </div>
              <div ref={logContainerRef} className="h-24 overflow-y-auto font-mono text-xs space-y-1 text-stone-400">
                {logs.length === 0 && <span className="animate-pulse">Initializing...</span>}
                {logs.map((log, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className={idx === logs.length - 1 ? "text-gold" : ""}>{log}</span>
                    {idx < logs.length - 1 && <CheckCircle2 className="w-3 h-3 text-green-600 ml-auto flex-shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>
    </div>
  );
};
