/**
 * Shared parsing and data processing functions.
 * Extracted from api/generate.ts for testability.
 */

/**
 * Safely parse JSON with recovery for common LLM issues:
 * - Truncated responses (missing closing brackets)
 * - Extra text before/after JSON
 * - Markdown code blocks wrapping JSON
 */
export function safeParseJSON<T>(text: string, fallback: T): { data: T; recovered: boolean } {
  if (!text || typeof text !== 'string') {
    return { data: fallback, recovered: true };
  }

  // Step 1: Try direct parse first
  try {
    return { data: JSON.parse(text), recovered: false };
  } catch {
    // Continue to recovery
  }

  let cleaned = text;

  // Step 2: Remove markdown code blocks if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // Step 3: Extract JSON object/array from surrounding text
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    cleaned = jsonMatch[1];
  }

  // Step 4: Try parsing cleaned version
  try {
    return { data: JSON.parse(cleaned), recovered: true };
  } catch {
    // Continue to bracket repair
  }

  // Step 5: Attempt to repair truncated JSON by adding closing brackets
  let repaired = cleaned.trim();

  // Remove trailing comma/incomplete values
  repaired = repaired.replace(/,\s*$/, '');
  repaired = repaired.replace(/,\s*([}\]])/, '$1');

  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Add missing closing brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  try {
    return { data: JSON.parse(repaired), recovered: true };
  } catch {
    // Final fallback
    return { data: fallback, recovered: true };
  }
}

/**
 * Extract a year from text (handles BC/AD)
 */
export function extractYearFromText(text: string): number | null {
  // Try to find dates like "in 44 BC" or "on July 4, 1776"
  const bcMatch = text.match(/(\d{1,4})\s*(?:BC|BCE)/i);
  if (bcMatch) {
    const year = parseInt(bcMatch[1], 10);
    if (year > 0) return -year; // Convert to negative for BC
    return null;
  }

  const adMatch = text.match(/(?:in|on|circa|c\.|around)\s*(\d{3,4})(?:\s*(?:AD|CE))?/i);
  if (adMatch) {
    const year = parseInt(adMatch[1], 10);
    if (year > 0 && year < 2100) return year;
  }

  // Try to find standalone 4-digit years
  const yearMatch = text.match(/\b(1\d{3}|20\d{2}|\d{3})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year > 100 && year < 2100) return year;
  }

  return null;
}

/**
 * Extract exact date from article text
 */
export function extractExactDate(text: string): string | undefined {
  const datePatterns = [
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
    /\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i,
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

/**
 * Normalize a string for comparison (lowercase, remove special chars)
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Ordinal qualifiers that mark similarly-named titles as distinct events
// (e.g. the First and Second Battle of Zurich both took place in 1799)
const ORDINAL_QUALIFIERS = new Set([
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th',
  'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix',
]);

function ordinalSignature(normalizedTitle: string): string {
  return normalizedTitle
    .split(' ')
    .filter(w => ORDINAL_QUALIFIERS.has(w))
    .sort()
    .join(' ');
}

/**
 * Check if two event titles are similar enough to be considered duplicates
 */
export function areTitlesSimilar(a: string, b: string): boolean {
  const na = normalizeString(a);
  const nb = normalizeString(b);

  // Exact match after normalization
  if (na === nb) return true;

  // Titles that differ by an ordinal qualifier describe distinct events,
  // even when one otherwise contains the other
  if (ordinalSignature(na) !== ordinalSignature(nb)) return false;

  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;

  // Word overlap check
  const wordsA = na.split(' ').filter(w => w.length > 2);
  const wordsB = nb.split(' ').filter(w => w.length > 2);

  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const overlap = wordsA.filter(w => wordsB.includes(w)).length;
  const overlapRatio = overlap / Math.min(wordsA.length, wordsB.length);

  return overlapRatio >= 0.7;
}

/**
 * Categorize events based on title keywords
 */
export function categorizeEvent(title: string): string {
  const lower = title.toLowerCase();
  if (/battle|war|siege|invasion|conquest|campaign|crusade/.test(lower)) return 'War';
  if (/treaty|peace|alliance|agreement|accord/.test(lower)) return 'Politics';
  if (/coronation|death of|assassination|reign|emperor|king|queen/.test(lower)) return 'Politics';
  if (/act|law|edict|decree|constitution/.test(lower)) return 'Politics';
  if (/revolution|rebellion|uprising|revolt/.test(lower)) return 'Politics';
  if (/church|pope|council|religious|monastery/.test(lower)) return 'Religion';
  if (/trade|commerce|economic|famine|plague/.test(lower)) return 'Economy';
  if (/art|literature|philosophy|university|discovery/.test(lower)) return 'Culture';
  if (/invention|science|astronomy|mathematics/.test(lower)) return 'Science';
  return 'Other';
}

/**
 * Query intent detection types
 */
export interface QueryAnalysis {
  queryType: 'city' | 'region' | 'country' | 'topic' | 'era';
  specificLocation?: string;
  broadContext?: string;
  topics?: string[];
  eventRatios: {
    direct: number;
    regional: number;
    contextual: number;
  };
}

/**
 * Quick heuristic-based query type detection
 */
export function quickDetectQueryType(query: string): QueryAnalysis | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // City patterns
  const cityPatterns = [
    /^[\w\s]+,\s*[\w\s]+$/,
    /^[\w\s]+,\s*\w{2}$/,
  ];

  const countries = ['united states', 'usa', 'china', 'india', 'brazil', 'russia', 'japan', 'germany', 'france', 'uk', 'united kingdom', 'italy', 'spain', 'mexico', 'canada', 'australia', 'egypt', 'greece', 'turkey', 'iran', 'iraq', 'israel', 'korea', 'vietnam', 'thailand', 'indonesia', 'philippines', 'nigeria', 'south africa', 'argentina', 'chile', 'peru', 'colombia'];

  const eraIndicators = ['era', 'age', 'period', 'century', 'dynasty', 'renaissance', 'enlightenment', 'medieval', 'ancient', 'classical', 'modern'];

  const topicIndicators = ['revolution', 'war', 'empire', 'trade', 'silk road', 'crusades', 'reformation', 'industrial'];

  if (cityPatterns.some(p => p.test(q))) {
    const parts = query.split(',').map(s => s.trim());
    return {
      queryType: 'city',
      specificLocation: parts[0],
      broadContext: parts[1],
      eventRatios: { direct: 70, regional: 20, contextual: 10 }
    };
  }

  if (countries.some(c => q === c || q.startsWith(c + ' ') || q.endsWith(' ' + c))) {
    return {
      queryType: 'country',
      specificLocation: query,
      eventRatios: { direct: 50, regional: 30, contextual: 20 }
    };
  }

  if (eraIndicators.some(e => q.includes(e))) {
    return {
      queryType: 'era',
      topics: [query],
      eventRatios: { direct: 60, regional: 25, contextual: 15 }
    };
  }

  if (topicIndicators.some(t => q.includes(t))) {
    return {
      queryType: 'topic',
      topics: [query],
      eventRatios: { direct: 50, regional: 30, contextual: 20 }
    };
  }

  return null;
}

/**
 * Extract key historical figures from article text and Wikipedia links
 */
export function extractKeyFigures(text: string, links: string[]): string[] {
  const peoplePatterns = [
    /(?:King|Queen|Emperor|Empress|Pope|President|General|Admiral|Duke|Prince|Princess)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g,
    /[A-Z][a-z]+\s+(?:the\s+)?(?:Great|Younger|Elder|II|III|IV|V|VI)/g,
  ];

  const figures = new Set<string>();

  links.forEach(link => {
    if (link.includes('(') && (link.includes('person') || link.includes('ruler') || link.includes('king') || link.includes('emperor'))) return;
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(link) && !link.includes('Battle') && !link.includes('Treaty') && !link.includes('War')) {
      figures.add(link);
    }
  });

  peoplePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(m => figures.add(m));
  });

  return Array.from(figures).slice(0, 5);
}

/**
 * Deduplicate events by removing near-duplicates (same year + similar title).
 * Keeps the event with more citations/detail.
 */
export function deduplicateEvents(events: any[]): any[] {
  if (!Array.isArray(events) || events.length === 0) return events;

  const seen: Map<string, any> = new Map();
  const duplicatesRemoved: string[] = [];

  for (const event of events) {
    if (!event || typeof event.year !== 'number' || typeof event.title !== 'string') {
      continue;
    }

    const yearKey = event.year.toString();
    let isDuplicate = false;

    for (const [key, existing] of seen.entries()) {
      if (key.startsWith(yearKey + ':')) {
        if (areTitlesSimilar(event.title, existing.title)) {
          isDuplicate = true;

          const eventCitations = Array.isArray(event.citations) ? event.citations.length : 0;
          const existingCitations = Array.isArray(existing.citations) ? existing.citations.length : 0;

          if (eventCitations > existingCitations) {
            seen.delete(key);
            seen.set(`${yearKey}:${normalizeString(event.title)}`, event);
            duplicatesRemoved.push(existing.title);
          } else {
            duplicatesRemoved.push(event.title);
          }
          break;
        }
      }
    }

    if (!isDuplicate) {
      // Key on the full normalized title: a truncated key would let distinct
      // same-year events sharing a prefix silently overwrite each other
      seen.set(`${yearKey}:${normalizeString(event.title)}`, event);
    }
  }

  if (duplicatesRemoved.length > 0) {
    console.log(`Removed ${duplicatesRemoved.length} duplicate events:`, duplicatesRemoved);
  }

  return Array.from(seen.values());
}
