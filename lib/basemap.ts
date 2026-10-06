/**
 * Map tiles. CARTO's basemaps now return "API KEY REQUIRED" tiles without a key,
 * so we use Esri's Light Gray Canvas, which serves keyless tiles. Esri requires
 * this attribution; their tiles exist up to zoom 16 (Leaflet upscales beyond).
 */
export const BASEMAP_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';

export const BASEMAP_ATTRIBUTION =
  'Tiles &copy; <a href="https://goto.arcgisonline.com/maps/World_Light_Gray_Base">Esri</a> &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS user community';

export const BASEMAP_MAX_NATIVE_ZOOM = 16;
