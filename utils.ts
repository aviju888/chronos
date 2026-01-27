// Utility functions for Chronos

/**
 * Format a year number for display, handling BC dates
 * @param year - Year as number (negative for BC)
 * @returns Formatted string like "753 BC" or "476 AD"
 */
export function formatYear(year: number): string {
  if (year < 0) {
    return `${Math.abs(year)} BC`;
  } else if (year < 500) {
    // Show AD for early common era years to avoid ambiguity
    return `${year} AD`;
  }
  return year.toString();
}

/**
 * Format a year range for display
 * @param start - Start year (negative for BC)
 * @param end - End year (negative for BC)
 * @returns Formatted string like "753 BC — 476 AD"
 */
export function formatYearRange(start: number, end: number): string {
  return `${formatYear(start)} — ${formatYear(end)}`;
}

// === GLOBE UTILITIES ===

const GLOBE_RADIUS = 1;

/**
 * Convert latitude/longitude to 3D coordinates on a sphere
 * @param lat - Latitude in degrees (-90 to 90)
 * @param lng - Longitude in degrees (-180 to 180)
 * @param radius - Sphere radius (default 1)
 * @returns [x, y, z] coordinates
 */
export function latLngToVector3(lat: number, lng: number, radius: number = GLOBE_RADIUS): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return [x, y, z];
}

/**
 * Convert 3D coordinates back to latitude/longitude
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns { lat, lng } in degrees
 */
export function vector3ToLatLng(x: number, y: number, z: number): { lat: number; lng: number } {
  const radius = Math.sqrt(x * x + y * y + z * z);
  const lat = 90 - Math.acos(y / radius) * (180 / Math.PI);
  const lng = Math.atan2(z, -x) * (180 / Math.PI) - 180;
  return { lat, lng };
}

/**
 * Check if WebGL is supported in the current browser
 * @returns true if WebGL is available
 */
export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/**
 * Calculate the midpoint of an arc on a sphere surface
 * Used for creating bezier curves between two points on the globe
 * @param start - [x, y, z] start point
 * @param end - [x, y, z] end point
 * @param altitude - How high above the surface (0-1, default 0.3)
 * @returns [x, y, z] midpoint
 */
export function getArcMidpoint(
  start: [number, number, number],
  end: [number, number, number],
  altitude: number = 0.3
): [number, number, number] {
  // Calculate midpoint between start and end
  const midX = (start[0] + end[0]) / 2;
  const midY = (start[1] + end[1]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  // Normalize to sphere surface and add altitude
  const length = Math.sqrt(midX * midX + midY * midY + midZ * midZ);
  const scale = (GLOBE_RADIUS + altitude) / length;

  return [midX * scale, midY * scale, midZ * scale];
}
