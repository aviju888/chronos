import React, { useMemo } from 'react';
import { QuadraticBezierLine } from '@react-three/drei';
import { HistoricalEvent } from '../../types';
import { latLngToVector3, getArcMidpoint } from '../../utils';
import * as THREE from 'three';

interface GlobeArcsProps {
  events: HistoricalEvent[];
  isDarkMode: boolean;
}

interface ArcData {
  start: THREE.Vector3;
  mid: THREE.Vector3;
  end: THREE.Vector3;
}

export const GlobeArcs: React.FC<GlobeArcsProps> = ({ events, isDarkMode }) => {
  // Generate arcs connecting chronologically adjacent events
  const arcs = useMemo<ArcData[]>(() => {
    // Sort events by year
    const sortedEvents = [...events]
      .filter(e => e.location)
      .sort((a, b) => a.year - b.year);

    if (sortedEvents.length < 2) return [];

    const result: ArcData[] = [];

    // Connect events in chronological order
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const current = sortedEvents[i];
      const next = sortedEvents[i + 1];

      if (!current.location || !next.location) continue;

      // Skip if events are too close (same location)
      const distance = Math.sqrt(
        Math.pow(current.location.lat - next.location.lat, 2) +
        Math.pow(current.location.lng - next.location.lng, 2)
      );
      if (distance < 2) continue;

      const startPos = latLngToVector3(
        current.location.lat,
        current.location.lng,
        1.005
      );
      const endPos = latLngToVector3(
        next.location.lat,
        next.location.lng,
        1.005
      );

      // Calculate arc height based on distance
      const arcHeight = Math.min(0.4, distance * 0.01);
      const midPos = getArcMidpoint(startPos, endPos, arcHeight);

      result.push({
        start: new THREE.Vector3(...startPos),
        mid: new THREE.Vector3(...midPos),
        end: new THREE.Vector3(...endPos),
      });
    }

    // Limit to last 10 arcs to avoid visual clutter
    return result.slice(-10);
  }, [events]);

  if (arcs.length === 0) return null;

  return (
    <group>
      {arcs.map((arc, index) => (
        <QuadraticBezierLine
          key={index}
          start={arc.start}
          mid={arc.mid}
          end={arc.end}
          color={isDarkMode ? '#c5a059' : '#8a6b32'}
          lineWidth={1}
          transparent
          opacity={0.4 + (index / arcs.length) * 0.4} // Fade older arcs
          dashed={false}
        />
      ))}
    </group>
  );
};
