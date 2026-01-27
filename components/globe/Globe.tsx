import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { Mesh, Color, SRGBColorSpace, BackSide, AdditiveBlending, DoubleSide } from 'three';

interface GlobeProps {
  isDarkMode: boolean;
}

// Atmosphere shader for the glow effect
const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 glowColor;
  uniform float intensity;
  varying vec3 vNormal;
  void main() {
    float glow = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(glowColor, glow * intensity);
  }
`;

export const Globe: React.FC<GlobeProps> = ({ isDarkMode }) => {
  const globeRef = useRef<Mesh>(null);
  const atmosphereRef = useRef<Mesh>(null);

  // Use public texture URLs - NASA Blue Marble for light mode, night lights for dark
  // These are hosted textures that work well for globe visualization
  const textureUrl = isDarkMode
    ? 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg'
    : 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';

  const bumpUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';

  // Load textures
  const texture = useTexture(textureUrl);
  const bumpMap = useTexture(bumpUrl);

  // Configure texture settings
  useMemo(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);

  // Atmosphere uniforms
  const atmosphereUniforms = useMemo(() => ({
    glowColor: { value: new Color(isDarkMode ? '#c5a059' : '#87CEEB') },
    intensity: { value: isDarkMode ? 0.8 : 0.5 },
  }), [isDarkMode]);

  // Gentle rotation for atmosphere shimmer
  useFrame((state, delta) => {
    if (atmosphereRef.current) {
      atmosphereRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <group>
      {/* Main Globe */}
      <mesh ref={globeRef}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          map={texture}
          bumpMap={bumpMap}
          bumpScale={0.02}
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>

      {/* Atmospheric Glow */}
      <mesh ref={atmosphereRef} scale={[1.15, 1.15, 1.15]}>
        <sphereGeometry args={[1, 32, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={atmosphereUniforms}
          side={BackSide}
          transparent
          blending={AdditiveBlending}
        />
      </mesh>

      {/* Inner glow ring at equator (subtle) */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.99, 1.01, 64]} />
        <meshBasicMaterial
          color={isDarkMode ? '#c5a059' : '#8a6b32'}
          transparent
          opacity={0.1}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
};
