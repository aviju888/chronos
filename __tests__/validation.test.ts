import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  validateCoordinates,
  validateYear,
  validateTimeRange,
  validateEvent,
} from '../lib/validation';

// ============================================
// sanitizeString
// ============================================
describe('sanitizeString', () => {
  it('returns null for non-string input', () => {
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString(undefined)).toBeNull();
    expect(sanitizeString(123)).toBeNull();
    expect(sanitizeString({})).toBeNull();
    expect(sanitizeString([])).toBeNull();
    expect(sanitizeString(true)).toBeNull();
  });

  it('trims whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });

  it('returns null for empty string', () => {
    expect(sanitizeString('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(sanitizeString('   ')).toBeNull();
  });

  it('returns null for special-chars-only string', () => {
    expect(sanitizeString('!@#$%^&*')).toBeNull();
  });

  it('strips HTML tags (preserves inner text)', () => {
    // Tags are removed but content between them is kept (React escapes output)
    expect(sanitizeString('<script>alert("xss")</script>hello')).toBe('alert("xss")hello');
    expect(sanitizeString('<img src=x onerror="alert(1)">test')).toBe('test');
    expect(sanitizeString('<b>bold</b>')).toBe('bold');
  });

  it('preserves allowed characters', () => {
    expect(sanitizeString("Rome's History (ancient)")).toBe("Rome's History (ancient)");
    expect(sanitizeString('San Francisco, California')).toBe('San Francisco, California');
    expect(sanitizeString('100-200 BC')).toBe('100-200 BC');
  });

  it('preserves accented characters', () => {
    expect(sanitizeString('Montréal')).toBe('Montréal');
    expect(sanitizeString('São Paulo')).toBe('São Paulo');
    expect(sanitizeString('Zürich')).toBe('Zürich');
  });

  it('enforces max length', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeString(long, 200)!.length).toBe(200);
    expect(sanitizeString(long, 10)!.length).toBe(10);
  });
});

// ============================================
// validateCoordinates
// ============================================
describe('validateCoordinates', () => {
  it('accepts valid coordinates', () => {
    expect(validateCoordinates(0, 0)).toEqual({ lat: 0, lng: 0 });
    expect(validateCoordinates(90, 180)).toEqual({ lat: 90, lng: 180 });
    expect(validateCoordinates(-90, -180)).toEqual({ lat: -90, lng: -180 });
    expect(validateCoordinates(41.9028, 12.4964)).toEqual({ lat: 41.9028, lng: 12.4964 });
  });

  it('rejects non-number inputs', () => {
    expect(validateCoordinates('41', '12')).toBeNull();
    expect(validateCoordinates(null, null)).toBeNull();
    expect(validateCoordinates(undefined, undefined)).toBeNull();
  });

  it('rejects NaN', () => {
    expect(validateCoordinates(NaN, 0)).toBeNull();
    expect(validateCoordinates(0, NaN)).toBeNull();
    expect(validateCoordinates(NaN, NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(validateCoordinates(Infinity, 0)).toBeNull();
    expect(validateCoordinates(0, -Infinity)).toBeNull();
    expect(validateCoordinates(Infinity, Infinity)).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    expect(validateCoordinates(91, 0)).toBeNull();
    expect(validateCoordinates(-91, 0)).toBeNull();
    expect(validateCoordinates(0, 181)).toBeNull();
    expect(validateCoordinates(0, -181)).toBeNull();
  });
});

// ============================================
// validateYear
// ============================================
describe('validateYear', () => {
  it('accepts valid AD years', () => {
    expect(validateYear(1776)).toBe(1776);
    expect(validateYear(2024)).toBe(2024);
    expect(validateYear(1)).toBe(1);
    expect(validateYear(476)).toBe(476);
  });

  it('accepts valid BC years (negative)', () => {
    expect(validateYear(-753)).toBe(-753);
    expect(validateYear(-3000)).toBe(-3000);
    expect(validateYear(-1)).toBe(-1);
  });

  it('rejects year 0 (does not exist historically)', () => {
    expect(validateYear(0)).toBeNull();
  });

  it('rejects NaN', () => {
    expect(validateYear(NaN)).toBeNull();
  });

  it('rejects Infinity', () => {
    expect(validateYear(Infinity)).toBeNull();
    expect(validateYear(-Infinity)).toBeNull();
  });

  it('rejects non-integers', () => {
    expect(validateYear(1776.5)).toBeNull();
    expect(validateYear(0.1)).toBeNull();
  });

  it('rejects non-number types', () => {
    expect(validateYear('1776')).toBeNull();
    expect(validateYear(null)).toBeNull();
    expect(validateYear(undefined)).toBeNull();
  });

  it('rejects out-of-range years', () => {
    expect(validateYear(-10001)).toBeNull();
    expect(validateYear(2101)).toBeNull();
    expect(validateYear(999999)).toBeNull();
  });

  it('accepts boundary years', () => {
    expect(validateYear(-10000)).toBe(-10000);
    expect(validateYear(2100)).toBe(2100);
  });
});

// ============================================
// validateTimeRange
// ============================================
describe('validateTimeRange', () => {
  it('accepts valid ranges', () => {
    expect(validateTimeRange(-753, 476)).toEqual({ start: -753, end: 476 });
    expect(validateTimeRange(1800, 2000)).toEqual({ start: 1800, end: 2000 });
    expect(validateTimeRange(-3000, -500)).toEqual({ start: -3000, end: -500 });
  });

  it('handles BC/AD crossing ranges', () => {
    expect(validateTimeRange(-500, 500)).toEqual({ start: -500, end: 500 });
    expect(validateTimeRange(-1, 1)).toEqual({ start: -1, end: 1 });
  });

  it('rejects inverted ranges', () => {
    expect(validateTimeRange(2000, 1800)).toBeNull();
  });

  it('rejects equal start and end', () => {
    expect(validateTimeRange(1776, 1776)).toBeNull();
  });

  it('rejects ranges exceeding 5000 years', () => {
    expect(validateTimeRange(-3000, 2100)).toBeNull(); // 5100 years
    expect(validateTimeRange(-10000, 1)).toBeNull(); // 10001 years
  });

  it('accepts ranges up to 5000 years', () => {
    expect(validateTimeRange(-3000, 2000)).toEqual({ start: -3000, end: 2000 }); // 5000 years
  });

  it('rejects ranges with year 0', () => {
    expect(validateTimeRange(0, 100)).toBeNull();
    expect(validateTimeRange(-100, 0)).toBeNull();
  });

  it('rejects non-number inputs', () => {
    expect(validateTimeRange('1800', '2000')).toBeNull();
    expect(validateTimeRange(null, null)).toBeNull();
  });
});

// ============================================
// validateEvent
// ============================================
describe('validateEvent', () => {
  const validEvent = {
    title: 'Battle of Thermopylae',
    year: -480,
    summary: 'A famous last stand by the Spartans.',
    category: 'War',
    confidenceScore: 'High',
    relevanceType: 'direct',
    location: { lat: 38.7967, lng: 22.5364, name: 'Thermopylae' },
  };

  it('accepts a valid event', () => {
    const result = validateEvent(validEvent);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects null/undefined', () => {
    expect(validateEvent(null).valid).toBe(false);
    expect(validateEvent(undefined).valid).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(validateEvent('string').valid).toBe(false);
    expect(validateEvent(123).valid).toBe(false);
  });

  it('requires title', () => {
    const result = validateEvent({ ...validEvent, title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or empty title');
  });

  it('requires year', () => {
    const noYear = validateEvent({ ...validEvent, year: undefined });
    expect(noYear.valid).toBe(false);

    const nanYear = validateEvent({ ...validEvent, year: NaN });
    expect(nanYear.valid).toBe(false);

    const floatYear = validateEvent({ ...validEvent, year: 1776.5 });
    expect(floatYear.valid).toBe(false);
  });

  it('rejects year 0', () => {
    const result = validateEvent({ ...validEvent, year: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Year 0 does not exist');
  });

  it('requires summary', () => {
    const result = validateEvent({ ...validEvent, summary: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing or empty summary');
  });

  it('validates category enum', () => {
    const result = validateEvent({ ...validEvent, category: 'InvalidCategory' });
    expect(result.valid).toBe(false);
  });

  it('validates relevanceType enum', () => {
    const result = validateEvent({ ...validEvent, relevanceType: 'invalid' });
    expect(result.valid).toBe(false);
  });

  it('validates location coordinates', () => {
    const result = validateEvent({ ...validEvent, location: { lat: NaN, lng: 0, name: 'test' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid location lat');
  });

  it('allows events without optional fields', () => {
    const minimal = { title: 'Test', year: 1776, summary: 'A test event.' };
    const result = validateEvent(minimal);
    expect(result.valid).toBe(true);
  });

  it('validates confidenceScore enum', () => {
    const result = validateEvent({ ...validEvent, confidenceScore: 'Invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid confidenceScore: Invalid');
  });

  it('validates location lng independently', () => {
    const result = validateEvent({ ...validEvent, location: { lat: 0, lng: NaN, name: 'test' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid location lng');
  });

  it('collects multiple errors', () => {
    const result = validateEvent({ title: '', year: NaN, summary: '' });
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
