import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { HistoricalEvent } from '../types';
import { ChevronLeft, ChevronRight, Play, Pause, Book, MapPinOff } from 'lucide-react';
import { EventImage } from './EventImage';
import { formatYear } from '../utils';

// Fix for default Leaflet marker icons in React
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Gold Marker for non-disputed events
const GoldIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #c5a059; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// Custom Red Marker for disputed events
const RedIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

// Cluster marker icon generator
const createClusterIcon = (count: number, hasDisputed: boolean) => L.divIcon({
  className: 'custom-cluster-icon',
  html: `<div style="
    background-color: ${hasDisputed ? '#ef4444' : '#c5a059'};
    width: ${Math.min(40, 24 + count * 2)}px;
    height: ${Math.min(40, 24 + count * 2)}px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow: 0 3px 8px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 11px;
    color: #fff;
    font-family: system-ui;
  ">${count}</div>`,
  iconSize: [Math.min(40, 24 + count * 2), Math.min(40, 24 + count * 2)],
  iconAnchor: [Math.min(40, 24 + count * 2) / 2, Math.min(40, 24 + count * 2) / 2]
});

// Types for clustering
interface Cluster {
  lat: number;
  lng: number;
  events: HistoricalEvent[];
}

// Simple clustering algorithm
const clusterEvents = (events: HistoricalEvent[], gridSize: number): Cluster[] => {
  const clusters: Map<string, Cluster> = new Map();

  events.forEach(event => {
    if (!event.location) return;

    // Create grid cell key based on location
    const cellX = Math.floor(event.location.lng / gridSize);
    const cellY = Math.floor(event.location.lat / gridSize);
    const key = `${cellX},${cellY}`;

    if (clusters.has(key)) {
      clusters.get(key)!.events.push(event);
    } else {
      clusters.set(key, {
        lat: event.location.lat,
        lng: event.location.lng,
        events: [event]
      });
    }
  });

  // Recalculate center for clusters with multiple events
  clusters.forEach(cluster => {
    if (cluster.events.length > 1) {
      const sumLat = cluster.events.reduce((sum, e) => sum + (e.location?.lat || 0), 0);
      const sumLng = cluster.events.reduce((sum, e) => sum + (e.location?.lng || 0), 0);
      cluster.lat = sumLat / cluster.events.length;
      cluster.lng = sumLng / cluster.events.length;
    }
  });

  return Array.from(clusters.values());
};

interface MapViewProps {
  events: HistoricalEvent[];
  timeRange: { start: number; end: number };
  onEventClick: (event: HistoricalEvent) => void;
}

// Component to handle auto-zooming to bounds
const MapBoundsController: React.FC<{ events: HistoricalEvent[] }> = ({ events }) => {
  const map = useMap();

  useEffect(() => {
    if (events.length === 0) return;

    const locations = events
      .filter(e => e.location)
      .map(e => [e.location!.lat, e.location!.lng] as [number, number]);

    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations);
      // Pad the bounds slightly so markers aren't on the edge
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8, animate: true });
      } catch(e) {
        console.warn("Map bounds error", e);
      }
    }
  }, [events, map]);

  return null;
};

// Component to track zoom level
const ZoomTracker: React.FC<{ onZoomChange: (zoom: number) => void }> = ({ onZoomChange }) => {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ events, timeRange, onEventClick }) => {
  const [currentYear, setCurrentYear] = useState(timeRange.start);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(2);

  const handleZoomChange = useCallback((zoom: number) => {
    setZoomLevel(zoom);
  }, []);

  // Initialize currentYear
  useEffect(() => {
    setCurrentYear(timeRange.start);
  }, [timeRange]);

  // Memoize sorted years for auto-play and navigation
  const sortedYears = useMemo(() => {
    return Array.from(new Set(events.map(e => e.year))).sort((a: number, b: number) => a - b);
  }, [events]);

  // Auto-play logic - smooth but skips empty periods quickly
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentYear(prev => {
          if (prev >= timeRange.end) {
            setIsPlaying(false);
            return prev;
          }

          // Find the next event year
          const nextEventYear = sortedYears.find(y => y > prev);
          if (nextEventYear === undefined) {
            setIsPlaying(false);
            return timeRange.end;
          }

          // Calculate gap to next event
          const gap = nextEventYear - prev;

          // If gap is small (< 20 years), move year by year for smoothness
          // If gap is large, jump in bigger steps (10% of gap) but animate smoothly
          if (gap <= 20) {
            return prev + 1;
          } else {
            // Move quickly through empty periods but in steps, not instant jumps
            const step = Math.max(1, Math.floor(gap / 10));
            const newYear = prev + step;
            // Don't overshoot the next event
            return Math.min(newYear, nextEventYear);
          }
        });
      }, 80); // Smooth 80ms intervals
    }
    return () => clearInterval(interval);
  }, [isPlaying, sortedYears, timeRange.end]);

  const visibleEvents = useMemo(() => {
      // Show events from start up to current year
      return events.filter(e => e.location && e.year <= currentYear && e.year >= timeRange.start);
  }, [events, currentYear, timeRange.start]);

  // Check if ANY events have location data
  const hasAnyLocations = useMemo(() => {
      return events.some(e => e.location);
  }, [events]);

  // Cluster events based on zoom level - larger grid at low zoom, smaller at high zoom
  const clusteredEvents = useMemo(() => {
    // At high zoom levels (8+), show individual markers
    if (zoomLevel >= 8) {
      return visibleEvents.map(event => ({ lat: event.location!.lat, lng: event.location!.lng, events: [event] }));
    }

    // Calculate grid size based on zoom - smaller grid = more clusters at low zoom
    const gridSize = Math.max(2, 40 / Math.pow(2, zoomLevel));
    return clusterEvents(visibleEvents, gridSize);
  }, [visibleEvents, zoomLevel]);

  // Safe duration calculation to avoid division by zero
  const duration = timeRange.end - timeRange.start;
  const safeDuration = Math.max(duration, 1);

  // Generate ticks for the slider histogram
  const timelineTicks = useMemo(() => {
     if (duration <= 0) return [];
     
     // Create a density map for the background track
     const bins = 60; // number of bars to render
     const binSize = duration / bins;
     const distribution = new Array(bins).fill(0);
     
     events.forEach(e => {
        if (e.year >= timeRange.start && e.year <= timeRange.end) {
            const binIndex = Math.min(Math.floor((e.year - timeRange.start) / binSize), bins - 1);
            if(binIndex >= 0) distribution[binIndex]++;
        }
     });
     
     const maxCount = Math.max(...distribution, 1);
     return distribution.map(count => count / maxCount); // normalize 0-1
  }, [events, timeRange]);

  const handleJump = (direction: 'prev' | 'next') => {
      if (direction === 'next') {
          const nextYear = sortedYears.find(y => y > currentYear);
          setCurrentYear(nextYear || timeRange.end);
      } else {
          // find last year less than current
          const prevYear = [...sortedYears].reverse().find(y => y < currentYear);
          setCurrentYear(prevYear || timeRange.start);
      }
  };

  return (
    <div className="h-full flex flex-col relative bg-stone-100 dark:bg-night">
      <div className="flex-1 z-0 relative">
        <MapContainer
            center={[20, 0]}
            zoom={2}
            scrollWheelZoom={true}
            style={{ height: "100%", width: "100%", background: '#e6e2d6' }}
            zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          />
          <MapBoundsController events={events} />
          <ZoomTracker onZoomChange={handleZoomChange} />

          {clusteredEvents.map((cluster) => {
            const isSingleEvent = cluster.events.length === 1;
            const hasDisputed = cluster.events.some(e => e.isDisputed);

            if (isSingleEvent) {
              const evt = cluster.events[0];
              return (
                <Marker
                  key={evt.id}
                  position={[cluster.lat, cluster.lng]}
                  eventHandlers={{ click: () => onEventClick(evt) }}
                  icon={evt.isDisputed ? RedIcon : GoldIcon}
                >
                  <Popup closeButton={false} className="font-serif">
                    <div className="p-1 text-center cursor-pointer w-48" onClick={() => onEventClick(evt)}>
                      <div className="w-full h-24 mb-2 rounded overflow-hidden">
                        <EventImage query={evt.imageQuery || evt.title} alt={evt.title} className="w-full h-full" />
                      </div>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${evt.isDisputed ? 'bg-red-100 text-red-800 border-red-300' : 'bg-ink text-gold border-gold'}`}>
                          {formatYear(evt.year)}
                        </span>
                        <span className="text-[10px] text-stone-500 flex items-center gap-0.5">
                          <Book className="w-2 h-2" /> {evt.citations.length}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm text-ink leading-tight">{evt.title}</h3>
                    </div>
                  </Popup>
                </Marker>
              );
            }

            // Cluster marker: key by content, not array index — clusters are
            // recomputed every playback tick and index-keys let React reuse a
            // marker whose events have changed, showing a stale popup
            return (
              <Marker
                key={`cluster-${cluster.events[0].id}-${cluster.events.length}`}
                position={[cluster.lat, cluster.lng]}
                icon={createClusterIcon(cluster.events.length, hasDisputed)}
              >
                <Popup closeButton={false} className="font-serif">
                  <div className="p-2 w-56 max-h-64 overflow-y-auto">
                    <div className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2 border-b border-stone-200 pb-1">
                      {cluster.events.length} Events in this area
                    </div>
                    <ul className="space-y-2">
                      {cluster.events.slice(0, 8).map(evt => (
                        <li
                          key={evt.id}
                          onClick={() => onEventClick(evt)}
                          className="cursor-pointer hover:bg-stone-100 p-1 rounded transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${evt.isDisputed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                              {formatYear(evt.year)}
                            </span>
                            <span className="text-xs font-medium text-ink leading-tight">{evt.title}</span>
                          </div>
                        </li>
                      ))}
                      {cluster.events.length > 8 && (
                        <li className="text-xs text-stone-400 italic text-center pt-1">
                          +{cluster.events.length - 8} more events
                        </li>
                      )}
                    </ul>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Overlay Gradient for vintage look */}
        <div className="absolute inset-0 pointer-events-none z-[400] bg-[radial-gradient(circle_at_center,transparent_0%,rgba(92,77,60,0.1)_100%)]"></div>

        {/* Empty State Overlay - show the most relevant message */}
        {events.length === 0 ? (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-stone-100/80 dark:bg-night/80 backdrop-blur-sm">
            <div className="text-center p-8 bg-paper dark:bg-night-light rounded-lg shadow-xl border-2 border-gold/30 max-w-md mx-4">
              <MapPinOff className="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-stone-600" />
              <h3 className="text-xl font-display font-bold text-ink dark:text-paper mb-2">No Events Found</h3>
              <p className="text-slate dark:text-stone-400 text-sm leading-relaxed">
                No historical events were generated for this timeline.
                Try adjusting the time range or selecting a different region.
              </p>
            </div>
          </div>
        ) : !hasAnyLocations && (
          <div className="absolute inset-0 z-[500] flex items-center justify-center bg-stone-100/80 dark:bg-night/80 backdrop-blur-sm">
            <div className="text-center p-8 bg-paper dark:bg-night-light rounded-lg shadow-xl border-2 border-gold/30 max-w-md mx-4">
              <MapPinOff className="w-16 h-16 mx-auto mb-4 text-gold-dark opacity-60" />
              <h3 className="text-xl font-display font-bold text-ink dark:text-paper mb-2">No Location Data Available</h3>
              <p className="text-slate dark:text-stone-400 text-sm leading-relaxed">
                The events in this timeline don't have specific geographic coordinates.
                Try the <span className="font-bold text-gold-dark dark:text-gold">Timeline</span> or <span className="font-bold text-gold-dark dark:text-gold">Events</span> view to explore the historical records.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Time Scrubber Control */}
      <div className="absolute bottom-3 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:transform md:-translate-x-1/2 md:w-3/4 max-w-4xl bg-paper border-double-archival shadow-2xl z-[1000] p-1 rounded-lg">
        <div className="bg-ink p-3 md:p-4 rounded text-paper relative overflow-hidden">
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/black-leather.png')]"></div>
            
            <div className="relative z-10 flex flex-col gap-3">
                {/* Header Info */}
                <div className="flex justify-between items-end mb-1">
                    <div className="flex items-center gap-3 md:gap-4">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            aria-label={isPlaying ? "Pause" : "Play History"}
                            aria-pressed={isPlaying}
                            className="w-14 h-14 md:w-12 md:h-12 flex items-center justify-center rounded-full bg-gold hover:bg-gold-light text-ink shadow-lg transition-transform active:scale-95 border-2 border-ink"
                        >
                            {isPlaying ? <Pause className="w-6 h-6 md:w-5 md:h-5 fill-current" /> : <Play className="w-6 h-6 md:w-5 md:h-5 fill-current ml-0.5" />}
                        </button>
                        <div>
                             <h3 className="text-[10px] font-bold tracking-[0.2em] text-stone-400 uppercase font-sans">Current Year</h3>
                             <div className="text-3xl md:text-4xl font-display font-bold text-white tabular-nums leading-none tracking-tight">
                                {formatYear(currentYear)}
                             </div>
                        </div>
                    </div>
                    
                    <div className="text-right">
                        <div className="text-[10px] font-bold tracking-[0.2em] text-stone-400 uppercase mb-1 hidden md:block">{visibleEvents.length} Events Revealed</div>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => handleJump('prev')}
                                aria-label="Jump to Previous Event"
                                className="px-4 py-3 md:px-3 md:py-1 bg-ink-light border border-stone-600 rounded-lg md:rounded hover:border-gold hover:text-gold transition-colors flex items-center gap-1 text-xs font-bold uppercase min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                            >
                                <ChevronLeft className="w-4 h-4 md:w-3 md:h-3" />
                                <span className="hidden md:inline">Prev Event</span>
                            </button>
                            <button
                                onClick={() => handleJump('next')}
                                aria-label="Jump to Next Event"
                                className="px-4 py-3 md:px-3 md:py-1 bg-ink-light border border-stone-600 rounded-lg md:rounded hover:border-gold hover:text-gold transition-colors flex items-center gap-1 text-xs font-bold uppercase min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                            >
                                <span className="hidden md:inline">Next Event</span>
                                <ChevronRight className="w-4 h-4 md:w-3 md:h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Slider Track Container */}
                <div className="relative h-14 flex items-center group">
                    {/* Visual Histogram Background */}
                    <div className="absolute inset-x-2 inset-y-2 flex items-end justify-between opacity-40 pointer-events-none gap-0.5">
                        {timelineTicks.map((height, i) => (
                            <div 
                                key={i} 
                                className="flex-1 bg-gold rounded-t-[1px] transition-all hover:bg-white"
                                style={{ height: `${Math.max(10, height * 100)}%` }}
                            ></div>
                        ))}
                    </div>

                    {/* Actual Input */}
                    <input
                      type="range"
                      min={timeRange.start}
                      max={timeRange.end}
                      value={currentYear}
                      onChange={(e) => { setIsPlaying(false); setCurrentYear(Number(e.target.value)); }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />

                    {/* Custom Styled Thumb/Track Representation */}
                    <div className="absolute inset-0 pointer-events-none flex items-center px-2">
                        {/* Track line */}
                        <div className="w-full h-1 bg-stone-700 rounded-full relative">
                            {/* Progress Fill */}
                            <div 
                                className="h-full bg-gold rounded-l-full" 
                                style={{ width: `${((currentYear - timeRange.start) / safeDuration) * 100}%` }}
                            ></div>
                        </div>
                        
                        {/* Thumb - larger on mobile for touch */}
                        <div
                            className="absolute top-1/2 w-10 h-10 md:w-6 md:h-6 bg-paper border-4 border-gold rounded-full shadow-[0_0_15px_rgba(197,160,89,0.8)] transition-transform group-hover:scale-110 z-30"
                            style={{
                                left: `${((currentYear - timeRange.start) / safeDuration) * 100}%`,
                                transform: `translate(-50%, -50%)`
                            }}
                        ></div>
                    </div>
                </div>

                {/* Range Labels */}
                <div className="flex justify-between text-xs text-stone-500 font-mono font-bold px-1">
                    <span>{formatYear(timeRange.start)}</span>
                    <span>{formatYear(timeRange.end)}</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
