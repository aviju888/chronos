import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCachedImage, cacheImage, clearImageCache } from '../services/imageCache';

const CACHE_KEY = 'chronos_image_cache';

beforeEach(() => {
  localStorage.clear();
  clearImageCache(); // Also clears in-memory cache
});

// ============================================
// cacheImage + getCachedImage
// ============================================
describe('image caching', () => {
  it('caches and retrieves an image URL', () => {
    cacheImage('Battle of Hastings', 'https://example.com/hastings.jpg');
    expect(getCachedImage('Battle of Hastings')).toBe('https://example.com/hastings.jpg');
  });

  it('returns null for uncached query', () => {
    expect(getCachedImage('nonexistent')).toBeNull();
  });

  it('persists to localStorage', () => {
    cacheImage('test query', 'https://example.com/test.jpg');
    const stored = localStorage.getItem(CACHE_KEY);
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed['test query']).toBeDefined();
    expect(parsed['test query'].url).toBe('https://example.com/test.jpg');
  });

  it('serves from memory cache on second access', () => {
    cacheImage('fast', 'https://example.com/fast.jpg');

    // Clear localStorage but memory cache should still work
    localStorage.removeItem(CACHE_KEY);
    expect(getCachedImage('fast')).toBe('https://example.com/fast.jpg');
  });

  it('overwrites existing cache entry', () => {
    cacheImage('query', 'https://example.com/old.jpg');
    cacheImage('query', 'https://example.com/new.jpg');
    expect(getCachedImage('query')).toBe('https://example.com/new.jpg');
  });

  it('handles multiple different queries', () => {
    cacheImage('query1', 'url1');
    cacheImage('query2', 'url2');
    cacheImage('query3', 'url3');

    expect(getCachedImage('query1')).toBe('url1');
    expect(getCachedImage('query2')).toBe('url2');
    expect(getCachedImage('query3')).toBe('url3');
  });
});

// ============================================
// clearImageCache
// ============================================
describe('clearImageCache', () => {
  it('clears all cached images', () => {
    cacheImage('a', 'url-a');
    cacheImage('b', 'url-b');

    clearImageCache();

    expect(getCachedImage('a')).toBeNull();
    expect(getCachedImage('b')).toBeNull();
  });

  it('removes from localStorage', () => {
    cacheImage('test', 'url');
    clearImageCache();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('is idempotent', () => {
    clearImageCache();
    clearImageCache();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

// ============================================
// Cache expiration
// ============================================
describe('cache expiration', () => {
  it('returns null for expired entries from localStorage', () => {
    // Manually set an expired entry (49 hours ago)
    const expired = {
      'old query': {
        url: 'https://example.com/old.jpg',
        timestamp: Date.now() - 49 * 60 * 60 * 1000, // 49 hours
      },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(expired));

    // Clear memory cache so it checks localStorage
    clearImageCache();

    // Re-set the expired localStorage entry (clearImageCache removed it)
    localStorage.setItem(CACHE_KEY, JSON.stringify(expired));

    expect(getCachedImage('old query')).toBeNull();
  });

  it('returns valid non-expired entries from localStorage', () => {
    // Set a fresh entry (1 hour ago)
    const fresh = {
      'fresh query': {
        url: 'https://example.com/fresh.jpg',
        timestamp: Date.now() - 1 * 60 * 60 * 1000, // 1 hour
      },
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));

    // Must clear memory cache to force localStorage read
    clearImageCache();
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));

    expect(getCachedImage('fresh query')).toBe('https://example.com/fresh.jpg');
  });
});
