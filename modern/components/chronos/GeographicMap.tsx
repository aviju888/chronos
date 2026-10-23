import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './geographic-map.css';
import { BASEMAP_URL, BASEMAP_ATTRIBUTION, BASEMAP_MAX_NATIVE_ZOOM } from '@/lib/basemap';
import { focusPoints } from '@/modern/lib/chronos/geo';
import { formatYear } from '@/modern/lib/chronos/time';
import type { ChronosEvent } from '@/modern/lib/chronos/types';
import type { DotMapProps } from './DotMap';

function MapContents({ events, cursorYear, selectedId, hoverIds, onFocusEvent, onHover, onOpen, area, onAreaChange, controlsHost }: DotMapProps & { controlsHost: HTMLDivElement | null }) {
  const map = useMap();
  const [revision, setRevision] = useState(0);
  const [panning, setPanning] = useState(false);
  const located = useMemo(() => events.filter(e => e.location), [events]);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const recenter = () => {
    const points = focusPoints(located.map(e => e.location!));
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 7, animate: !reduced });
    else map.setView([25, 0], 2, { animate: false });
  };
  useMapEvents({ moveend: () => setRevision(r => r + 1), resize: () => setRevision(r => r + 1) });
  useEffect(() => { recenter(); }, [located]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (!coarse || panning) map.dragging.enable();
    else map.dragging.disable();
  }, [coarse, panning, map]);
  useEffect(() => {
    const event = located.find(e => e.id === selectedId);
    if (event?.location && !map.getBounds().pad(-0.1).contains(event.location)) map.panTo(event.location, { animate: !reduced });
  }, [selectedId, located, map, reduced]);

  // Cluster in screen space, so every overlapping event remains reachable at every zoom.
  const clusters = useMemo(() => {
    const groups: { x: number; y: number; events: ChronosEvent[] }[] = [];
    for (const event of located) {
      const p = map.latLngToContainerPoint(event.location!);
      const group = groups.find(g => Math.hypot(g.x - p.x, g.y - p.y) < 26);
      if (group) group.events.push(event);
      else groups.push({ x: p.x, y: p.y, events: [event] });
    }
    return groups;
  }, [located, revision, map]);
  return <>
    {controlsHost && createPortal(<div className="chronos-geo-tools" role="group" aria-label="Map controls">
      <button type="button" onClick={recenter}>Recenter</button>
      <button type="button" aria-label="Zoom in" onClick={() => map.zoomIn()}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => map.zoomOut()}>−</button>
      {coarse && <button type="button" aria-pressed={panning} onClick={() => setPanning(!panning)}>{panning ? 'Done moving' : 'Move map'}</button>}
      <button type="button" onClick={() => {
        if (area) onAreaChange?.(null);
        else {
          const b = map.getBounds();
          onAreaChange?.({west: Math.max(-180, b.getWest()), east: Math.min(180, b.getEast()), south: b.getSouth(), north: b.getNorth()});
        }
      }}>{area ? 'Clear area' : 'Filter this area'}</button>
    </div>, controlsHost)}
    {area && <Rectangle bounds={[[area.south, area.west], [area.north, area.east]]} pathOptions={{color: '#a87d27', weight: 1, fillOpacity: 0.08}} interactive={false} />}
    {clusters.map(({events: group}) => {
      const first = group[0];
      const selected = group.some(e => e.id === selectedId || hoverIds?.includes(e.id));
      const dim = cursorYear !== null && group.every(e => e.year > cursorYear);
      const approximate = group.every(e => e.location?.approx);
      const icon = L.divIcon({className: 'chronos-geo-hit', iconSize: [44, 44], iconAnchor: [22, 22],
        html: `<span class="chronos-geo-pin${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${approximate ? ' is-approximate' : ''}${group.length > 1 ? ' is-cluster' : ''}">${group.length > 1 ? group.length : ''}</span>`});
      return <Marker key={group.map(e => e.id).join('|')} position={first.location!} icon={icon}
        title={group.length > 1 ? `${group.length} events near ${first.location?.name ?? first.title}` : first.title}
        eventHandlers={{click: () => onFocusEvent?.(first.id), mouseover: () => onHover?.(group.map(e => e.id)), mouseout: () => onHover?.(null)}}>
        <Popup minWidth={170} maxWidth={240} maxHeight={Math.min(210, Math.max(80, map.getSize().y - 110))} autoPanPadding={[12, 12]}>
          <div className="chronos-geo-events">{group.map(e => <button type="button" key={e.id} onClick={() => onOpen?.(e.id)}>
            <span>{formatYear(e.year)}{e.location?.approx ? ' · approximate place' : ''}</span>
            <strong>{e.title}</strong>
            <span>Open event →</span>
          </button>)}</div>
        </Popup>
      </Marker>;
    })}
  </>;
}

export default function GeographicMap(props: DotMapProps) {
  const [tileError, setTileError] = useState(false);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <div className="chronos-geographic-map">
    <div ref={setControlsHost} />
    <MapContainer center={[25, 0]} zoom={2} minZoom={2} maxZoom={18} maxBounds={[[-85, -180], [85, 180]]}
      maxBoundsViscosity={1} zoomControl={false} scrollWheelZoom={false} dragging={!matchMedia('(pointer: coarse)').matches}
      zoomAnimation={!reduced} fadeAnimation={!reduced} markerZoomAnimation={!reduced} aria-label="Geographic event map">
      <TileLayer url={BASEMAP_URL} attribution={BASEMAP_ATTRIBUTION} maxNativeZoom={BASEMAP_MAX_NATIVE_ZOOM} noWrap
        eventHandlers={{tileerror: () => setTileError(true), tileload: () => setTileError(false)}} />
      <MapContents {...props} controlsHost={controlsHost} />
    </MapContainer>
    <div className="chronos-geo-caption">
      {tileError ? <span role="status">Map tiles are unavailable. You can still use Dots.</span> : <span>Present-day geography · {props.events.filter(e => e.location).length} of {props.events.length} events placed</span>}
      <span>○ Approximate place</span>
    </div>
  </div>;
}
