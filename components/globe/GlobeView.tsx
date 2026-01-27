import React, { useRef, useEffect, useState, useCallback } from 'react';
import Globe, { GlobeInstance } from 'globe.gl';
import { useTheme } from '../../contexts/ThemeContext';
import { HistoricalEvent } from '../../types';

// Country feature type from GeoJSON
interface CountryFeature {
  type: 'Feature';
  properties: {
    NAME: string;
    ISO_A2: string;
    ISO_A3: string;
    CONTINENT: string;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

interface GlobeViewProps {
  events?: HistoricalEvent[];
  onCountryClick?: (countryName: string, lat: number, lng: number) => void;
  onEventClick?: (event: HistoricalEvent) => void;
  focusLocation?: { lat: number; lng: number } | null;
  isInteractive?: boolean;
}

// Natural Earth countries GeoJSON URL
const COUNTRIES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

export const GlobeView: React.FC<GlobeViewProps> = ({
  events = [],
  onCountryClick,
  onEventClick,
  focusLocation,
  isInteractive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const { isDark } = useTheme();
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load country data
  useEffect(() => {
    fetch(COUNTRIES_URL)
      .then(res => res.json())
      .then(data => {
        setCountries(data.features);
      })
      .catch(err => console.error('Failed to load countries:', err));
  }, []);

  // Initialize globe
  useEffect(() => {
    if (!containerRef.current || countries.length === 0) return;

    const globe = Globe()
      (containerRef.current)
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor(isDark ? '#8a6b32' : '#c5a059')
      .atmosphereAltitude(0.15)
      // Globe image - subtle earth texture
      .globeImageUrl(isDark
        ? '//unpkg.com/three-globe/example/img/earth-night.jpg'
        : '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
      )
      // Country polygons
      .polygonsData(countries)
      .polygonAltitude(0.006)
      .polygonCapColor((d: any) => {
        const country = d as CountryFeature;
        if (country.properties.NAME === hoveredCountry) {
          return isDark ? 'rgba(197, 160, 89, 0.4)' : 'rgba(197, 160, 89, 0.5)';
        }
        return 'rgba(0, 0, 0, 0)';
      })
      .polygonSideColor(() => 'rgba(197, 160, 89, 0.05)')
      .polygonStrokeColor(() => isDark ? 'rgba(197, 160, 89, 0.2)' : 'rgba(197, 160, 89, 0.4)')
      .polygonLabel((d: any) => {
        const country = d as CountryFeature;
        return `<div class="globe-tooltip">${country.properties.NAME}</div>`;
      })
      .onPolygonHover((polygon: any) => {
        if (!isInteractive) return;
        const country = polygon as CountryFeature | null;
        setHoveredCountry(country?.properties.NAME || null);
        if (containerRef.current) {
          containerRef.current.style.cursor = country ? 'pointer' : 'grab';
        }
      })
      .onPolygonClick((polygon: any, event: MouseEvent, coords: { lat: number; lng: number }) => {
        if (!isInteractive || !onCountryClick) return;
        const country = polygon as CountryFeature;
        if (country) {
          onCountryClick(country.properties.NAME, coords.lat, coords.lng);
        }
      });

    // Event markers (gold dots)
    if (events.length > 0) {
      const markerData = events
        .filter(e => e.location?.lat && e.location?.lng)
        .map(e => ({
          lat: e.location!.lat,
          lng: e.location!.lng,
          size: e.isDisputed ? 0.8 : 0.5,
          color: e.isDisputed ? '#ef4444' : '#c5a059',
          event: e,
        }));

      globe
        .pointsData(markerData)
        .pointAltitude(0.01)
        .pointColor('color')
        .pointRadius('size')
        .pointLabel((d: any) => `<div class="globe-tooltip">${d.event.title} (${d.event.year})</div>`)
        .onPointClick((point: any) => {
          if (onEventClick) {
            onEventClick(point.event);
          }
        });
    }

    // Auto-rotation
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.3;
    globe.controls().enableZoom = isInteractive;

    // Initial camera position
    globe.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

    globeRef.current = globe;
    setIsLoaded(true);

    // Handle resize
    const handleResize = () => {
      if (globeRef.current && containerRef.current) {
        globeRef.current.width(containerRef.current.clientWidth);
        globeRef.current.height(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (globeRef.current) {
        globeRef.current._destructor?.();
      }
    };
  }, [countries, isDark, isInteractive]);

  // Update globe when events change
  useEffect(() => {
    if (!globeRef.current || events.length === 0) return;

    const markerData = events
      .filter(e => e.location?.lat && e.location?.lng)
      .map(e => ({
        lat: e.location!.lat,
        lng: e.location!.lng,
        size: e.isDisputed ? 0.8 : 0.5,
        color: e.isDisputed ? '#ef4444' : '#c5a059',
        event: e,
      }));

    globeRef.current
      .pointsData(markerData)
      .pointAltitude(0.01)
      .pointColor('color')
      .pointRadius('size');
  }, [events]);

  // Update hover highlight
  useEffect(() => {
    if (!globeRef.current) return;
    // Trigger re-render of polygons when hover changes
    globeRef.current.polygonCapColor((d: any) => {
      const country = d as CountryFeature;
      if (country.properties.NAME === hoveredCountry) {
        return isDark ? 'rgba(197, 160, 89, 0.4)' : 'rgba(197, 160, 89, 0.5)';
      }
      return 'rgba(0, 0, 0, 0)';
    });
  }, [hoveredCountry, isDark]);

  // Focus on location when prop changes
  useEffect(() => {
    if (!globeRef.current || !focusLocation) return;

    globeRef.current.pointOfView(
      { lat: focusLocation.lat, lng: focusLocation.lng, altitude: 1.5 },
      1000 // animation duration in ms
    );

    // Stop auto-rotation when focusing
    globeRef.current.controls().autoRotate = false;
  }, [focusLocation]);

  // Stop rotation on interaction
  const handleInteractionStart = useCallback(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = false;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      onMouseDown={handleInteractionStart}
      onTouchStart={handleInteractionStart}
      style={{
        background: isDark
          ? 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f0f 100%)'
          : 'radial-gradient(ellipse at center, #e8e4db 0%, #d4cfc3 100%)'
      }}
    >
      {/* Loading indicator */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gold font-serif text-xl animate-pulse">
            Loading Globe...
          </div>
        </div>
      )}

      {/* Tooltip styles injected via CSS */}
      <style>{`
        .globe-tooltip {
          background: ${isDark ? 'rgba(26, 26, 26, 0.95)' : 'rgba(244, 241, 234, 0.95)'};
          color: ${isDark ? '#e6e2d6' : '#2b2622'};
          padding: 8px 12px;
          border-radius: 8px;
          font-family: 'Merriweather', serif;
          font-size: 14px;
          border: 1px solid ${isDark ? 'rgba(197, 160, 89, 0.3)' : 'rgba(197, 160, 89, 0.5)'};
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  );
};

export default GlobeView;
