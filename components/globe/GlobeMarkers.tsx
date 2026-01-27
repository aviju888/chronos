import React, { useRef, useMemo, useState, useCallback } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { HistoricalEvent } from '../../types';
import { latLngToVector3 } from '../../utils';
import { Mesh, Vector3, DoubleSide } from 'three';

interface GlobeMarkersProps {
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
}

interface MarkerData {
  id: string;
  position: [number, number, number];
  color: string;
  event: HistoricalEvent;
}

// Single marker component
function Marker({
  position,
  color,
  event,
  onEventClick,
  isHovered,
  onHover,
  onUnhover
}: {
  position: [number, number, number];
  color: string;
  event: HistoricalEvent;
  onEventClick: (event: HistoricalEvent) => void;
  isHovered: boolean;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const pulseRef = useRef<Mesh>(null);

  // Animate marker on hover
  useFrame((state, delta) => {
    if (meshRef.current) {
      const targetScale = isHovered ? 1.5 : 1;
      meshRef.current.scale.lerp(
        new Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }

    // Pulse animation for hovered marker
    if (pulseRef.current && isHovered) {
      pulseRef.current.scale.x = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.2;
      pulseRef.current.scale.y = pulseRef.current.scale.x;
      pulseRef.current.scale.z = pulseRef.current.scale.x;
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onEventClick(event);
  }, [event, onEventClick]);

  return (
    <group position={position}>
      {/* Hover pulse ring */}
      {isHovered && (
        <mesh ref={pulseRef}>
          <ringGeometry args={[0.025, 0.035, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            side={DoubleSide}
          />
        </mesh>
      )}

      {/* Main marker */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          onUnhover();
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshStandardMaterial
          color={isHovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={isHovered ? 0.8 : 0.4}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Pin stem */}
      <mesh position={[0, -0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.002, 0.002, 0.03, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>

      {/* Tooltip on hover */}
      {isHovered && (
        <Html
          position={[0, 0.05, 0]}
          center
          distanceFactor={2}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <div className="bg-ink text-paper px-3 py-2 rounded shadow-lg text-center whitespace-nowrap font-serif text-sm max-w-[200px]">
            <div className="font-bold truncate">{event.title}</div>
            <div className="text-xs text-gold mt-0.5">
              {event.year < 0 ? `${Math.abs(event.year)} BC` : event.year}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

export const GlobeMarkers: React.FC<GlobeMarkersProps> = ({ events, onEventClick }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Transform events to marker data
  const markers: MarkerData[] = useMemo(() => {
    return events
      .filter(e => e.location)
      .map(event => ({
        id: event.id,
        position: latLngToVector3(
          event.location!.lat,
          event.location!.lng,
          1.01 // Slightly above globe surface
        ),
        color: event.isDisputed ? '#ef4444' : '#c5a059',
        event,
      }));
  }, [events]);

  return (
    <group>
      {markers.map(marker => (
        <Marker
          key={marker.id}
          position={marker.position}
          color={marker.color}
          event={marker.event}
          onEventClick={onEventClick}
          isHovered={hoveredId === marker.id}
          onHover={() => setHoveredId(marker.id)}
          onUnhover={() => setHoveredId(null)}
        />
      ))}
    </group>
  );
};
