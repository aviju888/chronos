/**
 * Wikipedia API Service
 * Free, unlimited API for historical data enrichment
 */

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

// Rate limiting - be a good citizen
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface WikiArticle {
  title: string;
  extract: string;
  url: string;
  coordinates?: { lat: number; lng: number };
  links: string[];
  categories: string[];
}

interface WikiEvent {
  title: string;
  year: number | null;
  summary: string;
  wikipediaTitle: string;
  wikipediaUrl: string;
  coordinates?: { lat: number; lng: number };
  keyFigures: string[];
  exactDate?: string;
}

/**
 * Search Wikipedia for articles matching a query
 */
export async function searchWikipedia(query: string, limit: number = 5): Promise<string[]> {
  try {
    const url = `${WIKI_API}?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&format=json&origin=*`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    // OpenSearch returns [query, [titles], [descriptions], [urls]]
    return Array.isArray(data[1]) ? data[1] : [];
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return [];
  }
}

/**
 * Fetch a Wikipedia article with extract, links, and coordinates
 */
export async function fetchWikipediaArticle(title: string): Promise<WikiArticle | null> {
  try {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|links|coordinates|categories',
      exintro: '1',
      explaintext: '1',
      pllimit: '100',
      cllimit: '20',
      format: 'json',
      origin: '*'
    });

    const response = await fetch(`${WIKI_API}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    const pages = data.query?.pages;
    if (!pages) return null;

    const pageId = Object.keys(pages)[0];
    if (pageId === '-1') return null; // Page not found

    const page = pages[pageId];

    return {
      title: page.title,
      extract: page.extract || '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
      coordinates: page.coordinates?.[0] ? {
        lat: page.coordinates[0].lat,
        lng: page.coordinates[0].lon
      } : undefined,
      links: (page.links || []).map((l: any) => l.title),
      categories: (page.categories || []).map((c: any) => c.title.replace('Category:', ''))
    };
  } catch (error) {
    console.error('Wikipedia fetch error:', error);
    return null;
  }
}

/**
 * Extract a year from text (handles BC/AD)
 */
function extractYearFromText(text: string): number | null {
  // Try to find dates like "in 44 BC" or "on July 4, 1776"
  const bcMatch = text.match(/(\d{1,4})\s*(?:BC|BCE)/i);
  if (bcMatch) {
    return -parseInt(bcMatch[1], 10);
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
 * Extract key figures (people) from article text
 */
function extractKeyFigures(text: string, links: string[]): string[] {
  // Look for linked people (usually have titles like "King X" or names)
  const peoplePatterns = [
    /(?:King|Queen|Emperor|Empress|Pope|President|General|Admiral|Duke|Prince|Princess)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g,
    /[A-Z][a-z]+\s+(?:the\s+)?(?:Great|Younger|Elder|II|III|IV|V|VI)/g,
  ];

  const figures = new Set<string>();

  // Check links for person-like entries
  links.forEach(link => {
    // Skip generic articles
    if (link.includes('(') && (link.includes('person') || link.includes('ruler') || link.includes('king') || link.includes('emperor'))) {
      return;
    }
    // Names typically have 2-3 capitalized words
    if (/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(link) && !link.includes('Battle') && !link.includes('Treaty') && !link.includes('War')) {
      figures.add(link);
    }
  });

  // Extract from text patterns
  peoplePatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(m => figures.add(m));
  });

  return Array.from(figures).slice(0, 5);
}

/**
 * Extract exact date from article text
 */
function extractExactDate(text: string): string | undefined {
  // Look for full dates like "July 4, 1776" or "4 July 1776"
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
 * Discover sub-events from Wikipedia article links
 * Filters for historical events (battles, treaties, etc.)
 */
export async function discoverSubEvents(
  links: string[],
  parentYear: number,
  yearRange: { start: number; end: number },
  limit: number = 10
): Promise<WikiEvent[]> {
  // Patterns that indicate historical events
  const eventPatterns = [
    /^Battle of/i,
    /^Siege of/i,
    /^Treaty of/i,
    /^Act of/i,
    /^Edict of/i,
    /^Declaration of/i,
    /^Fall of/i,
    /^Sack of/i,
    /^Massacre/i,
    /^Assassination of/i,
    /^Coronation of/i,
    /^Death of/i,
    /^Birth of/i,
    /Revolution$/i,
    /Rebellion$/i,
    /Uprising$/i,
    /War$/i,
    /Campaign$/i,
    /Crusade$/i,
  ];

  // Filter links to potential events
  const potentialEvents = links.filter(link =>
    eventPatterns.some(pattern => pattern.test(link))
  );

  const subEvents: WikiEvent[] = [];

  // Fetch each potential sub-event (with rate limiting)
  for (const title of potentialEvents.slice(0, limit * 2)) {
    if (subEvents.length >= limit) break;

    await sleep(50); // Rate limit

    const article = await fetchWikipediaArticle(title);
    if (!article || !article.extract) continue;

    // Try to extract the year
    let year = extractYearFromText(article.extract);

    // If no year found, estimate from parent event
    if (year === null) {
      // Skip events without clear dates
      continue;
    }

    // Filter by year range
    if (year < yearRange.start || year > yearRange.end) continue;

    subEvents.push({
      title: article.title,
      year,
      summary: article.extract.slice(0, 500),
      wikipediaTitle: article.title,
      wikipediaUrl: article.url,
      coordinates: article.coordinates,
      keyFigures: extractKeyFigures(article.extract, article.links),
      exactDate: extractExactDate(article.extract)
    });
  }

  return subEvents;
}

/**
 * Enrich a seed event with Wikipedia data
 * Returns the enriched event plus any discovered sub-events
 */
export async function enrichEventFromWikipedia(
  seedEvent: { title: string; year: number; wikipediaTitle?: string },
  yearRange: { start: number; end: number }
): Promise<{ enriched: WikiEvent | null; subEvents: WikiEvent[] }> {
  // Find the Wikipedia article
  let articleTitle = seedEvent.wikipediaTitle;

  if (!articleTitle) {
    // Search for the article
    const results = await searchWikipedia(seedEvent.title, 3);
    articleTitle = results[0];
  }

  if (!articleTitle) {
    return { enriched: null, subEvents: [] };
  }

  await sleep(50); // Rate limit

  const article = await fetchWikipediaArticle(articleTitle);
  if (!article) {
    return { enriched: null, subEvents: [] };
  }

  // Create enriched event
  const enriched: WikiEvent = {
    title: seedEvent.title,
    year: seedEvent.year,
    summary: article.extract.slice(0, 600),
    wikipediaTitle: article.title,
    wikipediaUrl: article.url,
    coordinates: article.coordinates,
    keyFigures: extractKeyFigures(article.extract, article.links),
    exactDate: extractExactDate(article.extract)
  };

  // Discover sub-events from links
  const subEvents = await discoverSubEvents(
    article.links,
    seedEvent.year,
    yearRange,
    8 // Max sub-events per anchor
  );

  return { enriched, subEvents };
}

/**
 * Batch enrich multiple seed events
 */
export async function batchEnrichEvents(
  seedEvents: Array<{ title: string; year: number; wikipediaTitle?: string }>,
  yearRange: { start: number; end: number }
): Promise<{ enrichedEvents: WikiEvent[]; allSubEvents: WikiEvent[] }> {
  const enrichedEvents: WikiEvent[] = [];
  const allSubEvents: WikiEvent[] = [];
  const seenTitles = new Set<string>();

  for (const seed of seedEvents) {
    const { enriched, subEvents } = await enrichEventFromWikipedia(seed, yearRange);

    if (enriched && !seenTitles.has(enriched.title.toLowerCase())) {
      enrichedEvents.push(enriched);
      seenTitles.add(enriched.title.toLowerCase());
    }

    for (const sub of subEvents) {
      if (!seenTitles.has(sub.title.toLowerCase())) {
        allSubEvents.push(sub);
        seenTitles.add(sub.title.toLowerCase());
      }
    }
  }

  return { enrichedEvents, allSubEvents };
}
