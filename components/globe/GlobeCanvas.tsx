import React, { Suspense, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Globe } from './Globe';
import { GlobeMarkers } from './GlobeMarkers';
import { GlobeArcs } from './GlobeArcs';
import { HistoricalEvent } from '../../types';

interface GlobeCanvasProps {
  events: HistoricalEvent[];
  onEventClick: (event: HistoricalEvent) => void;
  isDarkMode: boolean;
}

// Camera controller for auto-rotation and smooth navigation
function CameraController({ isInteracting }: { isInteracting: boolean }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  useFrame((state, delta) => {
    if (!isInteracting && controlsRef.current) {
      // Gentle auto-rotation when not interacting
      controlsRef.current.autoRotate = true;
      controlsRef.current.autoRotateSpeed = 0.3;
    } else if (controlsRef.current) {
      controlsRef.current.autoRotate = false;
    }
    controlsRef.current?.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={true}
      minDistance={1.3}
      maxDistance={4}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      enableDamping={true}
      dampingFactor={0.05}
    />
  );
}

// Loading fallback
function GlobeLoader() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color="#c5a059" wireframe />
    </mesh>
  );
}

export const GlobeCanvas: React.FC<GlobeCanvasProps> = ({ events, onEventClick, isDarkMode }) => {
  const [isInteracting, setIsInteracting] = useState(false);
  const interactionTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleInteractionStart = useCallback(() => {
    setIsInteracting(true);
    if (interactionTimeout.current) {
      clearTimeout(interactionTimeout.current);
    }
  }, []);

  const handleInteractionEnd = useCallback(() => {
    // Resume auto-rotation after 3 seconds of no interaction
    interactionTimeout.current = setTimeout(() => {
      setIsInteracting(false);
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (interactionTimeout.current) {
        clearTimeout(interactionTimeout.current);
      }
    };
  }, []);

  // Filter events with valid locations
  const eventsWithLocations = events.filter(e => e.location);

  return (
    <div
      className="w-full h-full"
      onMouseDown={handleInteractionStart}
      onMouseUp={handleInteractionEnd}
      onTouchStart={handleInteractionStart}
      onTouchEnd={handleInteractionEnd}
    >
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: isDarkMode ? '#0f0f0f' : '#e6e2d6' }}
      >
        <Suspense fallback={<GlobeLoader />}>
          {/* Ambient light for base illumination */}
          <ambientLight intensity={isDarkMode ? 0.3 : 0.6} />

          {/* Main directional light (sun) */}
          <directionalLight
            position={[5, 3, 5]}
            intensity={isDarkMode ? 0.8 : 1.2}
            color={isDarkMode ? '#ffeedd' : '#ffffff'}
          />

          {/* Fill light from opposite side */}
          <directionalLight
            position={[-3, -1, -3]}
            intensity={0.2}
            color={isDarkMode ? '#c5a059' : '#87ceeb'}
          />

          {/* Stars background in dark mode */}
          {isDarkMode && (
            <Stars
              radius={100}
              depth={50}
              count={3000}
              factor={4}
              saturation={0}
              fade
              speed={0.5}
            />
          )}

          {/* The Globe */}
          <Globe isDarkMode={isDarkMode} />

          {/* Event Markers */}
          <GlobeMarkers
            events={eventsWithLocations}
            onEventClick={onEventClick}
          />

          {/* Arc Lines connecting events */}
          <GlobeArcs events={eventsWithLocations} isDarkMode={isDarkMode} />

          {/* Camera Controls */}
          <CameraController isInteracting={isInteracting} />
        </Suspense>
      </Canvas>
    </div>
  );
};
