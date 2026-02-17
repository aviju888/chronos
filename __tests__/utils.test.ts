import { describe, it, expect, beforeEach } from 'vitest';
import { formatYear, formatYearRange, parseHash, updateHash } from '../utils';

// ============================================
// formatYear
// ============================================
describe('formatYear', () => {
  it('formats BC years with "BC" suffix', () => {
    expect(formatYear(-753)).toBe('753 BC');
    expect(formatYear(-44)).toBe('44 BC');
    expect(formatYear(-1)).toBe('1 BC');
    expect(formatYear(-3000)).toBe('3000 BC');
  });

  it('formats early AD years with "AD" suffix', () => {
    expect(formatYear(1)).toBe('1 AD');
    expect(formatYear(476)).toBe('476 AD');
    expect(formatYear(499)).toBe('499 AD');
  });

  it('formats years >= 500 without suffix', () => {
    expect(formatYear(500)).toBe('500');
    expect(formatYear(1776)).toBe('1776');
    expect(formatYear(2024)).toBe('2024');
  });

  it('handles year 0 (edge case)', () => {
    // Year 0 doesn't exist historically, but the function treats it as early AD
    expect(formatYear(0)).toBe('0 AD');
  });
});

// ============================================
// formatYearRange
// ============================================
describe('formatYearRange', () => {
  it('formats BC to AD ranges', () => {
    expect(formatYearRange(-753, 476)).toBe('753 BC — 476 AD');
  });

  it('formats BC to BC ranges', () => {
    expect(formatYearRange(-3000, -500)).toBe('3000 BC — 500 BC');
  });

  it('formats AD to AD ranges (early)', () => {
    expect(formatYearRange(1, 499)).toBe('1 AD — 499 AD');
  });

  it('formats AD to AD ranges (modern)', () => {
    expect(formatYearRange(1800, 2000)).toBe('1800 — 2000');
  });

  it('formats cross-threshold ranges', () => {
    expect(formatYearRange(400, 1800)).toBe('400 AD — 1800');
  });
});

// ============================================
// parseHash
// ============================================
describe('parseHash', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('returns empty object for no hash', () => {
    window.location.hash = '';
    expect(parseHash()).toEqual({});
  });

  it('returns empty object for non-timeline hash', () => {
    window.location.hash = '#/something';
    expect(parseHash()).toEqual({});
  });

  it('parses timeline ID', () => {
    window.location.hash = '#/timeline/abc-123';
    const result = parseHash();
    expect(result.timelineId).toBe('abc-123');
  });

  it('parses timeline ID with view', () => {
    window.location.hash = '#/timeline/abc-123/map';
    const result = parseHash();
    expect(result.timelineId).toBe('abc-123');
    expect(result.view).toBe('map');
  });

  it('parses all valid view types', () => {
    for (const view of ['map', 'timeline', 'list', 'narrative']) {
      window.location.hash = `#/timeline/id/${view}`;
      expect(parseHash().view).toBe(view);
    }
  });

  it('ignores invalid view types', () => {
    window.location.hash = '#/timeline/id/invalid';
    const result = parseHash();
    expect(result.timelineId).toBe('id');
    expect(result.view).toBeUndefined();
  });

  it('parses event ID', () => {
    window.location.hash = '#/timeline/abc-123/map/event/evt-456';
    const result = parseHash();
    expect(result.timelineId).toBe('abc-123');
    expect(result.view).toBe('map');
    expect(result.eventId).toBe('evt-456');
  });

  it('requires "event" prefix for event ID', () => {
    window.location.hash = '#/timeline/abc-123/map/other/evt-456';
    const result = parseHash();
    expect(result.eventId).toBeUndefined();
  });
});

// ============================================
// updateHash
// ============================================
describe('updateHash', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('sets hash with timeline and view', () => {
    updateHash('abc-123', 'map');
    expect(window.location.hash).toBe('#/timeline/abc-123/map');
  });

  it('sets hash with event ID', () => {
    updateHash('abc-123', 'map', 'evt-456');
    expect(window.location.hash).toBe('#/timeline/abc-123/map/event/evt-456');
  });

  it('clears hash when timelineId is null', () => {
    window.location.hash = '#/timeline/abc-123/map';
    updateHash(null, 'map');
    expect(window.location.hash).toBe('');
  });

  it('does not create unnecessary history entries for same hash', () => {
    updateHash('abc-123', 'map');
    const hashBefore = window.location.hash;
    updateHash('abc-123', 'map');
    expect(window.location.hash).toBe(hashBefore);
  });
});
