// Image cache service for Wikipedia images
// Caches successful image URLs in localStorage with expiration

interface CacheEntry {
  url: string;
  timestamp: number;
}

const CACHE_KEY = 'chronos_image_cache';
const CACHE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_CACHE_ENTRIES = 500;

// In-memory cache for faster lookups during session
const memoryCache = new Map<string, string>();

// Persistent cache loaded lazily once per session
let persistentCache: Map<string, CacheEntry> | null = null;

// Load cache from localStorage (cached after first load)
const loadCache = (): Map<string, CacheEntry> => {
  if (persistentCache) return persistentCache;
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      persistentCache = new Map(Object.entries(parsed));
      return persistentCache;
    }
  } catch (e) {
    console.warn('Failed to load image cache', e);
  }
  persistentCache = new Map();
  return persistentCache;
};

// Save cache to localStorage (and update persistent cache reference)
const saveCache = (cache: Map<string, CacheEntry>): void => {
  persistentCache = cache;
  try {
    // Convert Map to object for JSON storage
    const obj: Record<string, CacheEntry> = {};
    cache.forEach((value, key) => {
      obj[key] = value;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Failed to save image cache', e);
  }
};

// Clean expired entries and limit cache size
const cleanCache = (cache: Map<string, CacheEntry>): Map<string, CacheEntry> => {
  const now = Date.now();
  const validEntries: [string, CacheEntry][] = [];

  cache.forEach((entry, key) => {
    if (now - entry.timestamp < CACHE_EXPIRY_MS) {
      validEntries.push([key, entry]);
    }
  });

  // Sort by timestamp (newest first) and limit size
  validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
  const limited = validEntries.slice(0, MAX_CACHE_ENTRIES);

  return new Map(limited);
};

// Get cached image URL
export const getCachedImage = (query: string): string | null => {
  // Check memory cache first
  if (memoryCache.has(query)) {
    return memoryCache.get(query)!;
  }

  // Check localStorage cache
  const cache = loadCache();
  const entry = cache.get(query);

  if (entry) {
    const now = Date.now();
    if (now - entry.timestamp < CACHE_EXPIRY_MS) {
      // Valid entry - add to memory cache
      memoryCache.set(query, entry.url);
      return entry.url;
    }
  }

  return null;
};

// Cache an image URL
export const cacheImage = (query: string, url: string): void => {
  // Add to memory cache
  memoryCache.set(query, url);

  // Add to localStorage cache
  let cache = loadCache();
  cache.set(query, { url, timestamp: Date.now() });

  // Clean and save
  cache = cleanCache(cache);
  saveCache(cache);
};

// Clear all cached images
export const clearImageCache = (): void => {
  memoryCache.clear();
  persistentCache = null;
  localStorage.removeItem(CACHE_KEY);
};

// Fetch image with caching
export const fetchImageWithCache = async (query: string): Promise<string | null> => {
  // Check cache first
  const cached = getCachedImage(query);
  if (cached) {
    return cached;
  }

  // Fetch from Wikipedia API
  try {
    const searchQuery = encodeURIComponent(query);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${searchQuery}&prop=pageimages&format=json&pithumbsize=400&origin=*`;

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pages = data.query?.pages;

    if (pages) {
      const pageId = Object.keys(pages)[0];
      const thumbnail = pages[pageId]?.thumbnail?.source;

      if (thumbnail) {
        // Cache the result
        cacheImage(query, thumbnail);
        return thumbnail;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch Wikipedia image', e);
  }

  return null;
};
