// Type declarations for globe.gl
declare module 'globe.gl' {
  interface GlobeInstance {
    (element: HTMLElement): GlobeInstance;

    // Globe appearance
    globeImageUrl(url?: string): GlobeInstance;
    bumpImageUrl(url?: string): GlobeInstance;
    showAtmosphere(show?: boolean): GlobeInstance;
    atmosphereColor(color?: string): GlobeInstance;
    atmosphereAltitude(altitude?: number): GlobeInstance;
    backgroundColor(color?: string): GlobeInstance;

    // Polygons (countries)
    polygonsData(data?: any[]): GlobeInstance;
    polygonAltitude(altitude?: number | ((d: any) => number)): GlobeInstance;
    polygonCapColor(color?: string | ((d: any) => string)): GlobeInstance;
    polygonSideColor(color?: string | ((d: any) => string)): GlobeInstance;
    polygonStrokeColor(color?: string | ((d: any) => string)): GlobeInstance;
    polygonLabel(label?: string | ((d: any) => string)): GlobeInstance;
    onPolygonHover(callback?: (polygon: any, prevPolygon: any) => void): GlobeInstance;
    onPolygonClick(callback?: (polygon: any, event: MouseEvent, coords: { lat: number; lng: number }) => void): GlobeInstance;

    // Points (markers)
    pointsData(data?: any[]): GlobeInstance;
    pointLat(accessor?: string | ((d: any) => number)): GlobeInstance;
    pointLng(accessor?: string | ((d: any) => number)): GlobeInstance;
    pointAltitude(altitude?: number | ((d: any) => number)): GlobeInstance;
    pointRadius(radius?: number | string | ((d: any) => number)): GlobeInstance;
    pointColor(color?: string | ((d: any) => string)): GlobeInstance;
    pointLabel(label?: string | ((d: any) => string)): GlobeInstance;
    onPointClick(callback?: (point: any, event: MouseEvent, coords: { lat: number; lng: number }) => void): GlobeInstance;
    onPointHover(callback?: (point: any, prevPoint: any) => void): GlobeInstance;

    // Arcs
    arcsData(data?: any[]): GlobeInstance;
    arcStartLat(accessor?: string | ((d: any) => number)): GlobeInstance;
    arcStartLng(accessor?: string | ((d: any) => number)): GlobeInstance;
    arcEndLat(accessor?: string | ((d: any) => number)): GlobeInstance;
    arcEndLng(accessor?: string | ((d: any) => number)): GlobeInstance;
    arcColor(color?: string | ((d: any) => string | string[])): GlobeInstance;
    arcAltitude(altitude?: number | ((d: any) => number)): GlobeInstance;
    arcStroke(stroke?: number | ((d: any) => number)): GlobeInstance;
    arcDashLength(length?: number | ((d: any) => number)): GlobeInstance;
    arcDashGap(gap?: number | ((d: any) => number)): GlobeInstance;
    arcDashAnimateTime(time?: number | ((d: any) => number)): GlobeInstance;

    // Labels
    labelsData(data?: any[]): GlobeInstance;
    labelLat(accessor?: string | ((d: any) => number)): GlobeInstance;
    labelLng(accessor?: string | ((d: any) => number)): GlobeInstance;
    labelText(accessor?: string | ((d: any) => string)): GlobeInstance;
    labelSize(size?: number | ((d: any) => number)): GlobeInstance;
    labelColor(color?: string | ((d: any) => string)): GlobeInstance;
    labelAltitude(altitude?: number | ((d: any) => number)): GlobeInstance;

    // Camera controls
    pointOfView(pov?: { lat?: number; lng?: number; altitude?: number }, transitionMs?: number): GlobeInstance | { lat: number; lng: number; altitude: number };
    controls(): any;

    // Dimensions
    width(width?: number): GlobeInstance | number;
    height(height?: number): GlobeInstance | number;

    // Internals
    scene(): any;
    camera(): any;
    renderer(): any;

    // Cleanup
    _destructor?(): void;
  }

  function Globe(): GlobeInstance;
  export default Globe;
  export { GlobeInstance };
}
