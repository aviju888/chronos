import { describe, it, expect } from 'vitest';
import {
  safeParseJSON,
  extractYearFromText,
  extractExactDate,
  normalizeString,
  areTitlesSimilar,
  categorizeEvent,
  quickDetectQueryType,
  extractKeyFigures,
  deduplicateEvents,
} from '../lib/parsing';

// ============================================
// safeParseJSON
// ============================================
describe('safeParseJSON', () => {
  const fallback = { events: [] };

  it('parses valid JSON directly', () => {
    const result = safeParseJSON('{"name":"test"}', fallback);
    expect(result.data).toEqual({ name: 'test' });
    expect(result.recovered).toBe(false);
  });

  it('parses valid JSON arrays', () => {
    const result = safeParseJSON('[1,2,3]', fallback);
    expect(result.data).toEqual([1, 2, 3]);
    expect(result.recovered).toBe(false);
  });

  it('returns fallback for empty string', () => {
    const result = safeParseJSON('', fallback);
    expect(result.data).toBe(fallback);
    expect(result.recovered).toBe(true);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeParseJSON(null as unknown as string, fallback).data).toBe(fallback);
    expect(safeParseJSON(undefined as unknown as string, fallback).data).toBe(fallback);
  });

  it('returns fallback for non-string input', () => {
    expect(safeParseJSON(123 as unknown as string, fallback).data).toBe(fallback);
  });

  it('strips markdown code blocks', () => {
    const input = '```json\n{"name":"test"}\n```';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ name: 'test' });
    expect(result.recovered).toBe(true);
  });

  it('strips markdown code blocks (no language tag)', () => {
    const input = '```\n{"key":"value"}\n```';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.recovered).toBe(true);
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is the data: {"name":"test"} hope that helps!';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ name: 'test' });
    expect(result.recovered).toBe(true);
  });

  it('extracts JSON array from surrounding text', () => {
    const input = 'The events are: [{"id":1},{"id":2}] end of list.';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.recovered).toBe(true);
  });

  it('repairs truncated JSON (missing closing braces)', () => {
    const input = '{"events":[{"name":"test"}';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ events: [{ name: 'test' }] });
    expect(result.recovered).toBe(true);
  });

  it('repairs trailing comma', () => {
    const input = '{"events":[1,2,3,]}';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ events: [1, 2, 3] });
    expect(result.recovered).toBe(true);
  });

  it('repairs multiple missing brackets', () => {
    const input = '{"a":{"b":[1,2,3';
    const result = safeParseJSON(input, fallback);
    expect(result.data).toEqual({ a: { b: [1, 2, 3] } });
    expect(result.recovered).toBe(true);
  });

  it('returns fallback for completely invalid input', () => {
    const result = safeParseJSON('not json at all, no braces', fallback);
    expect(result.data).toBe(fallback);
    expect(result.recovered).toBe(true);
  });
});

// ============================================
// extractYearFromText
// ============================================
describe('extractYearFromText', () => {
  it('extracts BC years', () => {
    expect(extractYearFromText('in 44 BC')).toBe(-44);
    expect(extractYearFromText('around 753 BCE')).toBe(-753);
    expect(extractYearFromText('circa 3000 BC')).toBe(-3000);
  });

  it('extracts AD years with keywords', () => {
    expect(extractYearFromText('in 1776')).toBe(1776);
    expect(extractYearFromText('on 1066 AD')).toBe(1066);
    expect(extractYearFromText('circa 476')).toBe(476);
    expect(extractYearFromText('around 1453 CE')).toBe(1453);
  });

  it('extracts standalone 4-digit years', () => {
    expect(extractYearFromText('The year was 1776.')).toBe(1776);
    expect(extractYearFromText('Built in 1850')).toBe(1850);
  });

  it('extracts 3-digit years', () => {
    expect(extractYearFromText('Founded in 476')).toBe(476);
  });

  it('returns null for text without years', () => {
    expect(extractYearFromText('no dates here')).toBeNull();
    expect(extractYearFromText('')).toBeNull();
  });

  it('returns null for 0 BC', () => {
    expect(extractYearFromText('in 0 BC')).toBeNull();
  });

  it('prefers BC match over AD match', () => {
    expect(extractYearFromText('from 500 BC to 100 AD')).toBe(-500);
  });
});

// ============================================
// extractExactDate
// ============================================
describe('extractExactDate', () => {
  it('extracts "Month Day, Year" format', () => {
    expect(extractExactDate('on July 4, 1776 the declaration')).toBe('July 4, 1776');
  });

  it('extracts "Month Day Year" format (no comma)', () => {
    expect(extractExactDate('January 1 2000 was the start')).toBe('January 1 2000');
  });

  it('extracts "Day Month Year" format', () => {
    expect(extractExactDate('on 25 December 1066')).toBe('25 December 1066');
  });

  it('extracts abbreviated month format', () => {
    expect(extractExactDate('on 6 Jun 1944 the invasion')).toBe('6 Jun 1944');
  });

  it('returns undefined when no date found', () => {
    expect(extractExactDate('no dates here')).toBeUndefined();
    expect(extractExactDate('in 1776')).toBeUndefined();
  });
});

// ============================================
// normalizeString
// ============================================
describe('normalizeString', () => {
  it('lowercases strings', () => {
    expect(normalizeString('HELLO')).toBe('hello');
  });

  it('removes special characters', () => {
    expect(normalizeString("Rome's Fall!")).toBe('romes fall');
  });

  it('collapses whitespace', () => {
    expect(normalizeString('hello   world')).toBe('hello world');
  });

  it('trims whitespace', () => {
    expect(normalizeString('  hello  ')).toBe('hello');
  });

  it('preserves letters and numbers', () => {
    expect(normalizeString('World War 2')).toBe('world war 2');
  });
});

// ============================================
// areTitlesSimilar
// ============================================
describe('areTitlesSimilar', () => {
  it('detects exact matches after normalization', () => {
    expect(areTitlesSimilar('Battle of Thermopylae', 'battle of thermopylae')).toBe(true);
  });

  it('detects containment', () => {
    expect(areTitlesSimilar('Battle of Thermopylae', 'Thermopylae')).toBe(true);
    expect(areTitlesSimilar('Rome', 'Fall of Rome')).toBe(true);
  });

  it('detects high word overlap', () => {
    // 4/4 words overlap = 100% (fall, the, roman, empire)
    expect(areTitlesSimilar(
      'Fall of the Roman Empire',
      'The Fall of Roman Empire in Europe'
    )).toBe(true);
  });

  it('rejects dissimilar titles', () => {
    expect(areTitlesSimilar('Battle of Thermopylae', 'Treaty of Paris')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(areTitlesSimilar('', '')).toBe(true); // Both normalize to empty, so equal
  });

  it('handles titles with only short words', () => {
    // Words <= 2 chars are filtered out, leaving empty arrays
    expect(areTitlesSimilar('a b c', 'x y z')).toBe(false);
  });
});

// ============================================
// categorizeEvent
// ============================================
describe('categorizeEvent', () => {
  it('categorizes war events', () => {
    expect(categorizeEvent('Battle of Hastings')).toBe('War');
    expect(categorizeEvent('The Siege of Vienna')).toBe('War');
    expect(categorizeEvent('Norman Invasion of England')).toBe('War');
    expect(categorizeEvent('First Crusade')).toBe('War');
  });

  it('categorizes political events', () => {
    expect(categorizeEvent('Treaty of Versailles')).toBe('Politics');
    expect(categorizeEvent('Coronation of Charlemagne')).toBe('Politics');
    expect(categorizeEvent('Death of Caesar')).toBe('Politics');
    expect(categorizeEvent('French Revolution')).toBe('Politics');
    expect(categorizeEvent('Magna Carta Act')).toBe('Politics');
  });

  it('categorizes religious events', () => {
    expect(categorizeEvent('Council of Nicaea')).toBe('Religion');
    expect(categorizeEvent('Election of the Pope')).toBe('Religion');
  });

  it('categorizes economic events', () => {
    expect(categorizeEvent('Silk Road Trade Routes')).toBe('Economy');
    expect(categorizeEvent('The Great Famine')).toBe('Economy');
    expect(categorizeEvent('Black Plague Pandemic')).toBe('Economy');
  });

  it('categorizes cultural events', () => {
    expect(categorizeEvent('Renaissance Art Movement')).toBe('Culture');
    expect(categorizeEvent('The Discovery of Gravity')).toBe('Culture');
    expect(categorizeEvent('Foundation of the University')).toBe('Culture');
  });

  it('categorizes science events', () => {
    expect(categorizeEvent('Invention of the Printing Press')).toBe('Science');
    expect(categorizeEvent('Advances in Astronomy')).toBe('Science');
  });

  it('returns Other for unrecognized events', () => {
    expect(categorizeEvent('Something Happened')).toBe('Other');
    expect(categorizeEvent('Random Historical Event')).toBe('Other');
  });
});

// ============================================
// quickDetectQueryType
// ============================================
describe('quickDetectQueryType', () => {
  it('returns null for empty query', () => {
    expect(quickDetectQueryType('')).toBeNull();
  });

  it('detects city queries (comma-separated)', () => {
    const result = quickDetectQueryType('San Francisco, California');
    expect(result).not.toBeNull();
    expect(result!.queryType).toBe('city');
    expect(result!.specificLocation).toBe('San Francisco');
    expect(result!.broadContext).toBe('California');
    expect(result!.eventRatios.direct).toBe(70);
  });

  it('detects city queries (city, state abbreviation)', () => {
    const result = quickDetectQueryType('Portland, OR');
    expect(result).not.toBeNull();
    expect(result!.queryType).toBe('city');
  });

  it('detects country queries', () => {
    const result = quickDetectQueryType('France');
    expect(result).not.toBeNull();
    expect(result!.queryType).toBe('country');
    expect(result!.specificLocation).toBe('France');
    expect(result!.eventRatios.direct).toBe(50);
  });

  it('detects era queries', () => {
    const result = quickDetectQueryType('Medieval period');
    expect(result).not.toBeNull();
    expect(result!.queryType).toBe('era');
    expect(result!.eventRatios.direct).toBe(60);
  });

  it('detects topic queries', () => {
    const result = quickDetectQueryType('Silk Road trade');
    expect(result).not.toBeNull();
    expect(result!.queryType).toBe('topic');
    expect(result!.eventRatios.direct).toBe(50);
  });

  it('returns null for ambiguous queries', () => {
    expect(quickDetectQueryType('interesting things')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(quickDetectQueryType('FRANCE')).not.toBeNull();
    expect(quickDetectQueryType('medieval PERIOD')).not.toBeNull();
  });
});

// ============================================
// extractKeyFigures
// ============================================
describe('extractKeyFigures', () => {
  it('extracts titled figures from text', () => {
    const text = 'King Henry defeated the rebels. Emperor Augustus ruled Rome.';
    const figures = extractKeyFigures(text, []);
    expect(figures).toContain('King Henry');
    expect(figures).toContain('Emperor Augustus');
  });

  it('extracts "the Great" style names from text', () => {
    const text = 'Alexander the Great conquered Persia.';
    const figures = extractKeyFigures(text, []);
    expect(figures.some(f => f.includes('Alexander'))).toBe(true);
  });

  it('extracts person names from Wikipedia links', () => {
    const links = ['Julius Caesar', 'Marcus Aurelius', 'Battle of Actium', 'Roman Empire'];
    const figures = extractKeyFigures('Some text.', links);
    expect(figures).toContain('Julius Caesar');
    expect(figures).toContain('Marcus Aurelius');
  });

  it('filters out Battle/Treaty/War links', () => {
    const links = ['Battle of Thermopylae', 'Treaty of Paris', 'World War II'];
    const figures = extractKeyFigures('', links);
    expect(figures).not.toContain('Battle of Thermopylae');
    expect(figures).not.toContain('Treaty of Paris');
  });

  it('limits to 5 figures', () => {
    const links = [
      'Person One', 'Person Two', 'Person Three',
      'Person Four', 'Person Five', 'Person Six', 'Person Seven',
    ];
    const figures = extractKeyFigures('', links);
    expect(figures.length).toBeLessThanOrEqual(5);
  });

  it('deduplicates figures', () => {
    const text = 'King Henry was powerful. King Henry ruled well.';
    const figures = extractKeyFigures(text, ['King Henry']);
    // Should not have duplicates
    const uniqueFigures = new Set(figures);
    expect(figures.length).toBe(uniqueFigures.size);
  });

  it('returns empty array for no matches', () => {
    expect(extractKeyFigures('no names here', [])).toEqual([]);
  });
});

// ============================================
// deduplicateEvents
// ============================================
describe('deduplicateEvents', () => {
  it('returns empty for empty array', () => {
    expect(deduplicateEvents([])).toEqual([]);
  });

  it('returns same events when no duplicates', () => {
    const events = [
      { title: 'Battle of Hastings', year: 1066, summary: 'A battle' },
      { title: 'Treaty of Paris', year: 1783, summary: 'A treaty' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(2);
  });

  it('removes exact duplicates (same year and title)', () => {
    const events = [
      { title: 'Battle of Hastings', year: 1066, summary: 'Version 1' },
      { title: 'Battle of Hastings', year: 1066, summary: 'Version 2' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('removes similar duplicates (same year, similar title)', () => {
    const events = [
      { title: 'The Battle of Hastings', year: 1066, summary: 'V1' },
      { title: 'Battle of Hastings', year: 1066, summary: 'V2' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(1);
  });

  it('keeps events with same title but different years', () => {
    const events = [
      { title: 'Battle of Vienna', year: 1529, summary: 'First' },
      { title: 'Battle of Vienna', year: 1683, summary: 'Second' },
    ];
    expect(deduplicateEvents(events)).toHaveLength(2);
  });

  it('keeps event with more citations when deduplicating', () => {
    const events = [
      { title: 'Battle of Hastings', year: 1066, citations: [] },
      { title: 'Battle of Hastings', year: 1066, citations: [{source:'a',url:'b'},{source:'c',url:'d'}] },
    ];
    const result = deduplicateEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0].citations).toHaveLength(2);
  });

  it('skips events with missing year or title', () => {
    const events = [
      { title: 'Valid Event', year: 1066, summary: 'ok' },
      { year: 1066, summary: 'no title' },
      { title: 'No year', summary: 'missing' },
      null,
      undefined,
    ];
    const result = deduplicateEvents(events as any[]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid Event');
  });

  it('handles non-array input', () => {
    expect(deduplicateEvents(null as any)).toBeNull();
    expect(deduplicateEvents(undefined as any)).toBeUndefined();
  });

  it('handles large event sets without performance issues', () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      title: `Unique Event ${i}`,
      year: 1000 + i,
      summary: `Event ${i}`,
    }));
    const start = performance.now();
    const result = deduplicateEvents(events);
    const elapsed = performance.now() - start;
    expect(result).toHaveLength(100);
    expect(elapsed).toBeLessThan(500); // Should be fast
  });
});
