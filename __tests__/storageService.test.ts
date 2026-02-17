import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStorageUsage,
  loadTimelines,
  saveTimelines,
  deleteTimeline,
  clearAllData,
} from '../services/storageService';

const ARCHIVES_KEY = 'chronos_archives';
const CHAT_PREFIX = 'chronos_chat_';

// Helper to create a minimal valid timeline
function makeTimeline(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id || crypto.randomUUID(),
    region: 'Rome, Italy',
    createdAt: overrides.createdAt || Date.now(),
    timeRange: { start: -753, end: 476 },
    eras: [{ title: 'Era', startYear: -753, endYear: 476 }],
    events: [{ title: 'Event', year: -753, summary: 'test' }],
    narrative: 'Test narrative',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ============================================
// getStorageUsage
// ============================================
describe('getStorageUsage', () => {
  it('returns zero usage for empty localStorage', () => {
    const usage = getStorageUsage();
    expect(usage.used).toBe(0);
    expect(usage.total).toBeGreaterThan(0);
    expect(usage.percent).toBe(0);
  });

  it('returns non-zero usage after storing data', () => {
    localStorage.setItem('test', 'hello world');
    const usage = getStorageUsage();
    expect(usage.used).toBeGreaterThan(0);
    // Percent may round to 0 for tiny data relative to 4MB quota
    expect(usage.percent).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// loadTimelines
// ============================================
describe('loadTimelines', () => {
  it('returns empty array when nothing stored', () => {
    expect(loadTimelines()).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    localStorage.setItem(ARCHIVES_KEY, 'not json');
    expect(loadTimelines()).toEqual([]);
  });

  it('returns empty array for non-array data', () => {
    localStorage.setItem(ARCHIVES_KEY, '{"not":"array"}');
    expect(loadTimelines()).toEqual([]);
  });

  it('loads valid timelines', () => {
    const timeline = makeTimeline({ id: 'test-1' });
    localStorage.setItem(ARCHIVES_KEY, JSON.stringify([timeline]));

    const loaded = loadTimelines();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('test-1');
  });

  it('filters out invalid timelines', () => {
    const valid = makeTimeline({ id: 'valid' });
    const invalid1 = { id: 'no-region', createdAt: 1 }; // Missing region
    const invalid2 = { region: 'test' }; // Missing id
    const invalid3 = null;

    localStorage.setItem(ARCHIVES_KEY, JSON.stringify([valid, invalid1, invalid2, invalid3]));

    const loaded = loadTimelines();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('valid');
  });

  it('filters timelines without required nested fields', () => {
    const noTimeRange = makeTimeline({ id: 'no-tr', timeRange: null });
    const noEras = makeTimeline({ id: 'no-eras', eras: 'not-array' });
    const noEvents = makeTimeline({ id: 'no-evts', events: null });

    localStorage.setItem(ARCHIVES_KEY, JSON.stringify([noTimeRange, noEras, noEvents]));
    expect(loadTimelines()).toHaveLength(0);
  });
});

// ============================================
// saveTimelines
// ============================================
describe('saveTimelines', () => {
  it('saves timelines successfully', () => {
    const timelines = [makeTimeline({ id: 'save-1' })];
    const result = saveTimelines(timelines);

    expect(result.success).toBe(true);
    expect(localStorage.getItem(ARCHIVES_KEY)).toBeTruthy();
  });

  it('overwrites existing data', () => {
    const old = [makeTimeline({ id: 'old' })];
    saveTimelines(old);

    const newTimelines = [makeTimeline({ id: 'new' })];
    saveTimelines(newTimelines);

    const loaded = JSON.parse(localStorage.getItem(ARCHIVES_KEY)!);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('new');
  });

  it('saves empty array', () => {
    const result = saveTimelines([]);
    expect(result.success).toBe(true);
    expect(JSON.parse(localStorage.getItem(ARCHIVES_KEY)!)).toEqual([]);
  });
});

// ============================================
// deleteTimeline
// ============================================
describe('deleteTimeline', () => {
  it('removes timeline by ID', () => {
    const timelines = [
      makeTimeline({ id: 'keep' }),
      makeTimeline({ id: 'delete-me' }),
    ];

    const result = deleteTimeline(timelines, 'delete-me');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('keep');
  });

  it('returns all timelines if ID not found', () => {
    const timelines = [makeTimeline({ id: 'a' }), makeTimeline({ id: 'b' })];
    const result = deleteTimeline(timelines, 'nonexistent');
    expect(result).toHaveLength(2);
  });

  it('removes associated chat history', () => {
    localStorage.setItem(`${CHAT_PREFIX}delete-me`, 'chat data');
    const timelines = [makeTimeline({ id: 'delete-me' })];

    deleteTimeline(timelines, 'delete-me');
    expect(localStorage.getItem(`${CHAT_PREFIX}delete-me`)).toBeNull();
  });

  it('handles empty timeline array', () => {
    expect(deleteTimeline([], 'any-id')).toEqual([]);
  });
});

// ============================================
// clearAllData
// ============================================
describe('clearAllData', () => {
  it('removes archives', () => {
    localStorage.setItem(ARCHIVES_KEY, 'data');
    clearAllData();
    expect(localStorage.getItem(ARCHIVES_KEY)).toBeNull();
  });

  it('removes chat history', () => {
    localStorage.setItem(`${CHAT_PREFIX}abc`, 'chat');
    localStorage.setItem(`${CHAT_PREFIX}xyz`, 'chat');
    clearAllData();
    expect(localStorage.getItem(`${CHAT_PREFIX}abc`)).toBeNull();
    expect(localStorage.getItem(`${CHAT_PREFIX}xyz`)).toBeNull();
  });

  it('removes theme preference', () => {
    localStorage.setItem('chronos-theme', 'dark');
    clearAllData();
    expect(localStorage.getItem('chronos-theme')).toBeNull();
  });

  it('preserves non-Chronos data', () => {
    localStorage.setItem('other_app_data', 'keep this');
    clearAllData();
    expect(localStorage.getItem('other_app_data')).toBe('keep this');
  });

  it('handles empty localStorage', () => {
    expect(() => clearAllData()).not.toThrow();
  });
});
