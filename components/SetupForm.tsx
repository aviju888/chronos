import React, { useState, useEffect, useRef } from 'react';
import { GenerationMode } from '../types';
import { Map as MapIcon, Calendar, Zap, BookOpen, Clock, Loader2, CheckCircle2, Hourglass, Wand2, Search, Globe, ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { ProgressUpdate, getSearchSuggestions, getSmartTimeRange, getRegionsFromCoordinates } from '../services/apiService';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

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
}

// Preset regions with sensible default time ranges
const PRESET_REGIONS = [
  { region: "Ancient Rome", start: -753, end: 476 },
  { region: "Feudal Japan", start: 1185, end: 1603 },
  { region: "Victorian England", start: 1837, end: 1901 },
  { region: "The American West", start: 1803, end: 1912 },
  { region: "Ottoman Empire", start: 1299, end: 1922 },
  { region: "Mesoamerica (Aztec/Maya)", start: -2000, end: 1521 },
  { region: "Industrial Revolution Europe", start: 1760, end: 1840 },
  { region: "Modern China", start: 1912, end: 2000 },
];

// Expanded list for "Surprise Me" feature
const SURPRISE_REGIONS = [
  // Ancient Civilizations
  { region: "Ancient Egypt", start: -3100, end: -30 },
  { region: "Ancient Greece", start: -800, end: -31 },
  { region: "Ancient Rome", start: -753, end: 476 },
  { region: "Persian Empire", start: -550, end: -330 },
  { region: "Han Dynasty China", start: -206, end: 220 },
  { region: "Maurya Empire India", start: -322, end: -185 },
  { region: "Phoenicia", start: -1500, end: -300 },
  { region: "Carthage", start: -814, end: -146 },
  // Medieval
  { region: "Byzantine Empire", start: 330, end: 1453 },
  { region: "Viking Age Scandinavia", start: 793, end: 1066 },
  { region: "Medieval England", start: 1066, end: 1485 },
  { region: "Mongol Empire", start: 1206, end: 1368 },
  { region: "Islamic Golden Age", start: 750, end: 1258 },
  { region: "Song Dynasty China", start: 960, end: 1279 },
  { region: "Crusader States", start: 1099, end: 1291 },
  // Early Modern
  { region: "Renaissance Italy", start: 1300, end: 1600 },
  { region: "Spanish Empire", start: 1492, end: 1898 },
  { region: "Mughal Empire", start: 1526, end: 1857 },
  { region: "Edo Period Japan", start: 1603, end: 1868 },
  { region: "Dutch Golden Age", start: 1588, end: 1672 },
  { region: "French Revolution", start: 1789, end: 1799 },
  // Modern
  { region: "Victorian Britain", start: 1837, end: 1901 },
  { region: "American Civil War Era", start: 1850, end: 1877 },
  { region: "World War I Europe", start: 1914, end: 1918 },
  { region: "Weimar Germany", start: 1919, end: 1933 },
  { region: "Soviet Union", start: 1922, end: 1991 },
  { region: "Cold War America", start: 1947, end: 1991 },
  // Unique/Interesting
  { region: "Silk Road", start: -130, end: 1453 },
  { region: "Inca Empire", start: 1438, end: 1533 },
  { region: "Kingdom of Kongo", start: 1390, end: 1914 },
  { region: "Samurai Japan", start: 1185, end: 1868 },
  { region: "Ancient Mesopotamia", start: -3500, end: -539 },
  { region: "Elizabethan England", start: 1558, end: 1603 },
];

// Map Click Component
const MapClickReceiver: React.FC<{ onLocationSelected: (lat: number, lng: number) => void }> = ({ onLocationSelected }) => {
  useMapEvents({
    click(e) {
      onLocationSelected(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const SetupForm: React.FC<SetupFormProps> = ({ onGenerate, isLoading, progress, logs }) => {
  const [region, setRegion] = useState('');
  const [startYear, setStartYear] = useState<number>(1800);
  const [endYear, setEndYear] = useState<number>(2000);
  const [mode, setMode] = useState<GenerationMode>(GenerationMode.QUICK);
  
  // Search features state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [isTimeOptimizing, setIsTimeOptimizing] = useState(false);
  const suggestionBoxRef = useRef<HTMLDivElement>(null);
  
  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<[number, number] | null>(null);
  const [mapSuggestions, setMapSuggestions] = useState<string[]>([]);
  const [isMapLoading, setIsMapLoading] = useState(false);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Click outside suggestions to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce for text suggestions
  useEffect(() => {
    if (region.length < 3) {
      setSuggestions([]);
      return;
    }

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
    if (range) {
      setStartYear(range.start);
      setEndYear(range.end);
    }
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
    
    // Get historical suggestions from coords
    const suggestions = await getRegionsFromCoordinates(lat, lng);
    setMapSuggestions(suggestions);
    setIsMapLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="max-w-3xl mx-auto bg-paper-dark dark:bg-night-light shadow-archive rounded-lg overflow-hidden border-manuscript mt-10 mb-10 relative animate-page-turn">
      <div className="absolute top-0 left-0 w-full gold-strip"></div>

      <div className="bg-ink p-8 text-paper text-center relative overflow-hidden vignette">
         <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-20"></div>
        <h1 className="text-5xl font-display font-bold text-gold mb-2 tracking-[0.25em] relative z-10 text-embossed animate-candle">CHRONOS</h1>
        <p className="text-gold-light/70 font-antique text-lg tracking-widest relative z-10">Deep History Explorer</p>

        {/* Surprise Me Button */}
        <button
          type="button"
          onClick={handleSurpriseMe}
          disabled={isLoading}
          className="relative z-10 mt-4 px-6 py-2 bg-gold/20 hover:bg-gold/40 border border-gold/50 rounded-full text-gold font-bold text-sm uppercase tracking-widest transition-archival hover:scale-105 glow-gold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
        >
          <Shuffle className="w-4 h-4" />
          Surprise Me
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-paper dark:bg-night-light relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cream-paper.png')] dark:bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')] opacity-30 dark:opacity-10 pointer-events-none"></div>

        {/* Region Section */}
        <div className="space-y-4 relative z-20">
          <label className="block text-ink dark:text-paper font-dramatic font-bold text-lg flex items-center justify-between border-b border-gold/30 pb-2">
            <div className="flex items-center gap-2">
               <MapIcon className="w-5 h-5 text-gold" />
               Select Region or Topic
            </div>
            <button
               type="button"
               onClick={() => setShowMapPicker(!showMapPicker)}
               className="text-xs font-bold text-gold-dark uppercase tracking-widest flex items-center gap-1 hover:text-ink transition-colors"
            >
               <Globe className="w-3 h-3" />
               {showMapPicker ? 'Close Map' : 'Select on Map'}
               {showMapPicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </label>
          
          {/* Map Picker Modal Area */}
          {showMapPicker && (
             <div className="border-2 border-gold rounded-lg overflow-hidden bg-stone-200 relative animate-in fade-in zoom-in duration-300">
                <div className="h-48 md:h-64 w-full relative z-0">
                    <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                        <MapClickReceiver onLocationSelected={handleMapClick} />
                        {selectedCoords && <Marker position={selectedCoords} />}
                    </MapContainer>
                </div>
                
                {/* Overlay for Suggestions */}
                <div className="bg-ink/90 p-4 text-paper relative z-10">
                   {isMapLoading ? (
                       <div className="flex items-center justify-center gap-2 text-gold">
                           <Loader2 className="w-4 h-4 animate-spin" />
                           <span className="text-xs uppercase tracking-widest">Identifying Historical Significance...</span>
                       </div>
                   ) : mapSuggestions.length > 0 ? (
                       <div>
                           <div className="text-xs text-stone-400 uppercase tracking-widest mb-2">Historical Suggestions for this location:</div>
                           <div className="flex flex-wrap gap-2">
                               {mapSuggestions.map(s => (
                                   <button 
                                      key={s}
                                      type="button"
                                      onClick={() => handleSuggestionClick(s)}
                                      className="bg-gold/20 hover:bg-gold text-gold hover:text-ink border border-gold/50 rounded-full px-3 py-1 text-sm font-bold transition-all"
                                   >
                                      {s}
                                   </button>
                               ))}
                           </div>
                       </div>
                   ) : (
                       <div className="text-center text-stone-500 text-xs italic">
                           {selectedCoords ? "No specific historical suggestions found for this exact coordinate. Try a nearby city." : "Click anywhere on the map to identify historical regions."}
                       </div>
                   )}
                </div>
             </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            {PRESET_REGIONS.map((preset) => (
              <button
                key={preset.region}
                type="button"
                onClick={() => handlePresetClick(preset)}
                disabled={isLoading}
                className={`text-sm px-3 py-2.5 rounded border transition-archival font-elegant ${
                  region === preset.region
                    ? 'bg-ink dark:bg-gold text-gold dark:text-ink border-gold shadow-tome'
                    : 'bg-paper-cream dark:bg-night-lighter text-sepia dark:text-paper hover:bg-paper-dark dark:hover:bg-night border-gold/30 hover:border-gold card-inset hover-lift'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {preset.region}
              </button>
            ))}
          </div>
          
          <div className="relative" ref={suggestionBoxRef}>
            <input
              type="text"
              placeholder="Or type a specific region (e.g., 'Paris', 'California')..."
              value={region}
              onChange={(e) => { setRegion(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              disabled={isLoading}
              className="w-full p-4 border-2 border-gold/40 rounded focus:ring-2 focus:ring-gold focus:border-gold focus:outline-none bg-paper-cream dark:bg-night font-elegant text-lg card-inset disabled:opacity-50 text-ink dark:text-paper placeholder:text-sepia/50 dark:placeholder:text-stone-500"
              required
            />
            {isSuggestionsLoading && (
              <div className="absolute right-4 top-4 text-stone-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
            
            {/* Auto-Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && !isLoading && (
              <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-paper-dark border-2 border-gold rounded shadow-xl max-h-60 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => handleSuggestionClick(s)}
                      className="w-full text-left px-4 py-3 hover:bg-gold/20 hover:text-ink font-serif text-stone-700 transition-colors flex items-center gap-2"
                    >
                      <Search className="w-4 h-4 text-gold-dark opacity-50" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Time Range Section */}
        <div className="space-y-4 relative z-10">
          <div className="flex justify-between items-center border-b border-gold/30 pb-2">
            <label className="block text-ink dark:text-paper font-dramatic font-bold text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gold" />
              Time Range
            </label>
            <div className="flex gap-3">
              {isTimeOptimizing && (
                 <span className="text-xs font-bold text-gold-dark animate-pulse flex items-center gap-1">
                   <Wand2 className="w-3 h-3" /> Optimizing Era...
                 </span>
              )}
              <button
                type="button"
                onClick={handleRecentHistory}
                disabled={isLoading}
                className="text-xs font-bold font-display uppercase tracking-wider text-stone-500 hover:text-ink flex items-center gap-1 disabled:opacity-50 transition-colors"
              >
                <Clock className="w-3 h-3" /> Recent History
              </button>
            </div>
          </div>
          
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <span className="block text-xs font-bold text-stone-500 mb-1 font-antique tracking-widest">START YEAR</span>
              <input
                type="number"
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
                disabled={isLoading || isTimeOptimizing}
                className={`w-full p-3 border rounded focus:ring-2 focus:ring-gold bg-white text-xl font-display text-ink text-center disabled:opacity-50 transition-all ${isTimeOptimizing ? 'border-gold text-transparent' : 'border-stone-400'}`}
              />
              {isTimeOptimizing && <div className="absolute inset-0 top-6 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>}
            </div>
            <span className="text-gold-dark font-serif italic text-lg">to</span>
            <div className="flex-1 relative">
              <span className="block text-xs font-bold text-stone-500 mb-1 font-antique tracking-widest">END YEAR</span>
              <input
                type="number"
                value={endYear}
                onChange={(e) => setEndYear(Number(e.target.value))}
                disabled={isLoading || isTimeOptimizing}
                className={`w-full p-3 border rounded focus:ring-2 focus:ring-gold bg-white text-xl font-display text-ink text-center disabled:opacity-50 transition-all ${isTimeOptimizing ? 'border-gold text-transparent' : 'border-stone-400'}`}
              />
              {isTimeOptimizing && <div className="absolute inset-0 top-6 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>}
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div className="space-y-4">
          <label className="block text-ink dark:text-paper font-dramatic font-bold text-lg border-b border-gold/30 pb-2">Investigation Depth</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode(GenerationMode.QUICK)}
              disabled={isLoading}
              className={`p-5 rounded border-2 text-left transition-archival hover-lift ${
                mode === GenerationMode.QUICK
                  ? 'border-gold bg-gold/10 dark:bg-gold/20 shadow-tome'
                  : 'border-gold/30 hover:border-gold bg-paper-cream dark:bg-night card-inset'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`w-5 h-5 ${mode === GenerationMode.QUICK ? 'text-gold' : 'text-sepia dark:text-stone-400'}`} />
                <span className="font-display font-bold text-ink dark:text-paper">Quick Overview</span>
              </div>
              <p className="text-sm text-sepia dark:text-stone-400 font-elegant">Faster generation. Good for broad strokes. Single-pass verification.</p>
            </button>

            <button
              type="button"
              onClick={() => setMode(GenerationMode.DEEP)}
              disabled={isLoading}
              className={`p-5 rounded border-2 text-left transition-archival hover-lift ${
                mode === GenerationMode.DEEP
                  ? 'border-gold bg-gold/10 dark:bg-gold/20 shadow-tome'
                  : 'border-gold/30 hover:border-gold bg-paper-cream dark:bg-night card-inset'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className={`w-5 h-5 ${mode === GenerationMode.DEEP ? 'text-gold' : 'text-sepia dark:text-stone-400'}`} />
                <span className="font-display font-bold text-ink dark:text-paper">Deep Archive Search</span>
              </div>
              <p className="text-sm text-sepia dark:text-stone-400 font-elegant">Thorough analysis. Multiple sources. Detailed dispute resolution. Slower.</p>
            </button>
          </div>
        </div>

        {/* Action Button & Progress Log */}
        <div className="space-y-4 pt-4">
          {!isLoading ? (
            <button
              type="submit"
              disabled={!region || isLoading}
              className={`w-full py-5 text-xl font-display font-bold text-gold dark:text-ink tracking-[0.2em] uppercase transition-archival transform active:scale-[0.99] rounded shadow-tome bg-ink dark:bg-gold hover:shadow-archive border-2 border-gold glow-gold disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Construct Timeline
            </button>
          ) : (
            <div className="bg-ink rounded p-6 shadow-2xl border border-gold relative overflow-hidden">
               {/* Progress Bar */}
               <div className="w-full h-2 bg-stone-700 rounded-full mb-4 overflow-hidden">
                  <div 
                    className="h-full bg-gold transition-all duration-700 ease-out relative"
                    style={{ width: `${progress?.percent || 5}%` }}
                  >
                    <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/30 animate-pulse"></div>
                  </div>
               </div>

               <div className="flex items-center justify-between mb-4 border-b border-stone-600 pb-3">
                  <div className="flex items-center gap-3 text-gold-light">
                    <Loader2 className="w-5 h-5 animate-spin text-gold" />
                    <span className="font-display text-sm tracking-widest">RESEARCHING ARCHIVES...</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-stone-400 font-mono">
                    <Hourglass className="w-3 h-3" />
                    <span>~{progress?.timeLeft || '?'}s remaining</span>
                  </div>
               </div>
               
               <div 
                 ref={logContainerRef} 
                 className="h-32 overflow-y-auto font-mono text-xs space-y-2 pr-2 border-l border-stone-700 pl-3"
               >
                 {logs.length === 0 && <span className="text-stone-500 animate-pulse">Initializing request...</span>}
                 {logs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                       <span className={idx === logs.length - 1 ? "text-gold" : "text-stone-500"}>
                         {log}
                       </span>
                       {idx < logs.length - 1 && <CheckCircle2 className="w-3 h-3 text-green-700 mt-0.5 ml-auto" />}
                    </div>
                 ))}
                 <div className="flex items-center gap-2 animate-pulse mt-2">
                    <span className="w-2 h-4 bg-gold block"></span>
                 </div>
               </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
