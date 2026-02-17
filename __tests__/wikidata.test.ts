import { describe, it, expect } from 'vitest';
import {
  isValidQId,
  toWikidataYear,
  fromWikidataYear,
  parseWikidataResults,
} from '../lib/wikidata';

// ============================================
// isValidQId
// ============================================
describe('isValidQId', () => {
  it('accepts valid Q-IDs', () => {
    expect(isValidQId('Q42')).toBe(true);
    expect(isValidQId('Q220')).toBe(true);
    expect(isValidQId('Q1190554')).toBe(true);
  });

  it('rejects invalid Q-IDs', () => {
    expect(isValidQId('')).toBe(false);
    expect(isValidQId('P31')).toBe(false);
    expect(isValidQId('42')).toBe(false);
    expect(isValidQId('Q')).toBe(false);
    expect(isValidQId('Qabc')).toBe(false);
    expect(isValidQId('Q42abc')).toBe(false);
  });
});

// ============================================
// Year conversion (our convention <-> Wikidata proleptic Gregorian)
// ============================================
describe('toWikidataYear', () => {
  it('converts AD years unchanged', () => {
    expect(toWikidataYear(1776)).toBe(1776);
    expect(toWikidataYear(1)).toBe(1);
    expect(toWikidataYear(2024)).toBe(2024);
  });

  it('converts BC years (our -N to Wikidata -N+1)', () => {
    expect(toWikidataYear(-1)).toBe(0);     // 1 BC → year 0
    expect(toWikidataYear(-44)).toBe(-43);   // 44 BC → year -43
    expect(toWikidataYear(-753)).toBe(-752);  // 753 BC → year -752
  });
});

describe('fromWikidataYear', () => {
  it('converts AD years unchanged', () => {
    expect(fromWikidataYear(1776)).toBe(1776);
    expect(fromWikidataYear(1)).toBe(1);
  });

  it('converts Wikidata year 0 to our -1 (1 BC)', () => {
    expect(fromWikidataYear(0)).toBe(-1);
  });

  it('converts negative Wikidata years to our BC convention', () => {
    expect(fromWikidataYear(-43)).toBe(-44);   // 44 BC
    expect(fromWikidataYear(-752)).toBe(-753);  // 753 BC
  });

  it('roundtrips correctly', () => {
    // AD years
    expect(fromWikidataYear(toWikidataYear(1776))).toBe(1776);
    expect(fromWikidataYear(toWikidataYear(1))).toBe(1);
    // BC years
    expect(fromWikidataYear(toWikidataYear(-1))).toBe(-1);
    expect(fromWikidataYear(toWikidataYear(-44))).toBe(-44);
    expect(fromWikidataYear(toWikidataYear(-753))).toBe(-753);
    expect(fromWikidataYear(toWikidataYear(-3000))).toBe(-3000);
  });
});

// ============================================
// parseWikidataResults
// ============================================
describe('parseWikidataResults', () => {
  it('returns empty array for null/invalid input', () => {
    expect(parseWikidataResults(null)).toEqual([]);
    expect(parseWikidataResults({})).toEqual([]);
    expect(parseWikidataResults({ results: {} })).toEqual([]);
    expect(parseWikidataResults({ results: { bindings: [] } })).toEqual([]);
  });

  it('parses a valid AD event', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q178561' },
          eventLabel: { value: 'Battle of Hastings' },
          eventDescription: { value: 'Decisive Norman victory in 1066' },
          date: { value: '1066-10-14T00:00:00Z' },
          coord: { value: 'Point(-0.4875 50.9144)' },
          wpTitle: { value: 'Battle of Hastings' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Battle of Hastings');
    expect(events[0].year).toBe(1066);
    expect(events[0].exactDate).toBe('October 14, 1066');
    expect(events[0].coordinates).toEqual({ lat: 50.9144, lng: -0.4875 });
    expect(events[0].wikipediaTitle).toBe('Battle of Hastings');
    expect(events[0].wikidataId).toBe('Q178561');
  });

  it('parses a BC event with correct year conversion', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q12345' },
          eventLabel: { value: 'Assassination of Caesar' },
          eventDescription: { value: 'Murder of Julius Caesar' },
          date: { value: '-0043-03-15T00:00:00Z' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Assassination of Caesar');
    expect(events[0].year).toBe(-44); // Wikidata -43 = our -44 (44 BC)
    expect(events[0].exactDate).toBe('March 15, 44 BC');
  });

  it('skips Jan 1 exact dates (often means year-only precision)', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q99999' },
          eventLabel: { value: 'Some Event' },
          eventDescription: { value: 'Description' },
          date: { value: '1776-01-01T00:00:00Z' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(1);
    expect(events[0].year).toBe(1776);
    expect(events[0].exactDate).toBeUndefined();
  });

  it('deduplicates by wikidataId', () => {
    const data = {
      results: {
        bindings: [
          {
            event: { value: 'http://www.wikidata.org/entity/Q100' },
            eventLabel: { value: 'Event A' },
            date: { value: '1776-07-04T00:00:00Z' },
          },
          {
            event: { value: 'http://www.wikidata.org/entity/Q100' },
            eventLabel: { value: 'Event A duplicate' },
            date: { value: '1776-07-04T00:00:00Z' },
          },
        ],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Event A');
  });

  it('skips entries without labels (just Q-IDs)', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q55555' },
          eventLabel: { value: 'Q55555' }, // No label, just Q-ID
          date: { value: '1500-01-01T00:00:00Z' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(0);
  });

  it('skips entries without dates', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q11111' },
          eventLabel: { value: 'No Date Event' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(0);
  });

  it('handles events without coordinates or Wikipedia title', () => {
    const data = {
      results: {
        bindings: [{
          event: { value: 'http://www.wikidata.org/entity/Q22222' },
          eventLabel: { value: 'Minimal Event' },
          eventDescription: { value: '' },
          date: { value: '1800-06-15T00:00:00Z' },
        }],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(1);
    expect(events[0].coordinates).toBeUndefined();
    expect(events[0].wikipediaTitle).toBeUndefined();
    expect(events[0].exactDate).toBe('June 15, 1800');
  });

  it('parses multiple events in chronological order', () => {
    const data = {
      results: {
        bindings: [
          {
            event: { value: 'http://www.wikidata.org/entity/Q1' },
            eventLabel: { value: 'First' },
            date: { value: '1600-01-01T00:00:00Z' },
          },
          {
            event: { value: 'http://www.wikidata.org/entity/Q2' },
            eventLabel: { value: 'Second' },
            date: { value: '1700-01-01T00:00:00Z' },
          },
          {
            event: { value: 'http://www.wikidata.org/entity/Q3' },
            eventLabel: { value: 'Third' },
            date: { value: '1800-01-01T00:00:00Z' },
          },
        ],
      },
    };

    const events = parseWikidataResults(data);
    expect(events).toHaveLength(3);
    expect(events[0].title).toBe('First');
    expect(events[1].title).toBe('Second');
    expect(events[2].title).toBe('Third');
  });
});
