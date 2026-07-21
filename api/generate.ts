import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  sanitizeString,
  validateCoordinates,
  validateYear,
  validateTimeRange,
  validateEvent,
} from '../lib/validation.js';
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
  type QueryAnalysis,
} from '../lib/parsing.js';
import { enrichFromWikidata } from '../lib/wikidata.js';

// ============================================
// WIKIPEDIA API SERVICE (inlined for Vercel compatibility)
// ============================================

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

// Helper to delay execution (rate limiting)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Truncate text at the last complete sentence within maxLen
function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  // Find last sentence-ending punctuation
  const lastPeriod = truncated.lastIndexOf('. ');
  const lastExcl = truncated.lastIndexOf('! ');
  const lastQ = truncated.lastIndexOf('? ');
  const lastBreak = Math.max(lastPeriod, lastExcl, lastQ);
  if (lastBreak > maxLen * 0.3) {
    return truncated.slice(0, lastBreak + 1);
  }
  // If no sentence boundary found in a reasonable range, try end-of-string period
  if (truncated.endsWith('.')) return truncated;
  const veryLastPeriod = truncated.lastIndexOf('.');
  if (veryLastPeriod > maxLen * 0.3) {
    return truncated.slice(0, veryLastPeriod + 1);
  }
  return truncated + '...';
}

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

async function searchWikipedia(query: string, limit: number = 5): Promise<string[]> {
  try {
    const url = `${WIKI_API}?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&format=json&origin=*`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data[1]) ? data[1] : [];
  } catch (error) {
    console.error('Wikipedia search error:', error);
    return [];
  }
}

async function fetchWikipediaArticle(title: string): Promise<WikiArticle | null> {
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
    if (pageId === '-1') return null;

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

async function discoverSubEvents(
  links: string[],
  parentYear: number,
  yearRange: { start: number; end: number },
  limit: number = 10
): Promise<WikiEvent[]> {
  const eventPatterns = [
    // War & conflict
    /^Battle of/i, /^Siege of/i, /^Sack of/i, /^Massacre/i,
    /War$/i, /Campaign$/i, /Crusade$/i,
    // Politics & governance
    /^Treaty of/i, /^Act of/i, /^Edict of/i, /^Declaration of/i,
    /^Coronation of/i, /^Assassination of/i, /^Abdication of/i,
    /^Fall of/i, /^Unification of/i, /^Partition of/i,
    /Revolution$/i, /Rebellion$/i, /Uprising$/i,
    // Culture & architecture
    /^Construction of/i, /^Founding of/i, /^Opening of/i, /^Building of/i,
    /University$/i, /Cathedral$/i, /Library$/i, /Academy$/i,
    // Science & exploration
    /^Discovery of/i, /^Invention of/i, /^Expedition/i, /^Exploration of/i,
    /^Voyage of/i,
    // Religion
    /^Council of/i, /^Synod of/i, /^Reformation/i, /^Conversion of/i,
    // Economy & disasters
    /^Great Fire/i, /^Great Famine/i, /Earthquake$/i, /Plague$/i, /Famine$/i,
    /^Death of/i, /^Birth of/i,
  ];

  const potentialEvents = links.filter(link => eventPatterns.some(pattern => pattern.test(link)));
  const subEvents: WikiEvent[] = [];

  for (const title of potentialEvents.slice(0, limit * 2)) {
    if (subEvents.length >= limit) break;

    await sleep(50);

    const article = await fetchWikipediaArticle(title);
    if (!article || !article.extract) continue;

    const year = extractYearFromText(article.extract);
    if (year === null || year < yearRange.start || year > yearRange.end) continue;

    subEvents.push({
      title: article.title,
      year,
      summary: truncateAtSentence(article.extract, 800),
      wikipediaTitle: article.title,
      wikipediaUrl: article.url,
      coordinates: article.coordinates,
      keyFigures: extractKeyFigures(article.extract, article.links),
      exactDate: extractExactDate(article.extract)
    });
  }

  return subEvents;
}

async function enrichEventFromWikipedia(
  seedEvent: { title: string; year: number; wikipediaTitle?: string },
  yearRange: { start: number; end: number }
): Promise<{ enriched: WikiEvent | null; subEvents: WikiEvent[] }> {
  let articleTitle = seedEvent.wikipediaTitle;

  if (!articleTitle) {
    const results = await searchWikipedia(seedEvent.title, 3);
    articleTitle = results[0];
  }

  if (!articleTitle) return { enriched: null, subEvents: [] };

  await sleep(50);

  const article = await fetchWikipediaArticle(articleTitle);
  if (!article) return { enriched: null, subEvents: [] };

  const enriched: WikiEvent = {
    title: seedEvent.title,
    year: seedEvent.year,
    summary: truncateAtSentence(article.extract, 800),
    wikipediaTitle: article.title,
    wikipediaUrl: article.url,
    coordinates: article.coordinates,
    keyFigures: extractKeyFigures(article.extract, article.links),
    exactDate: extractExactDate(article.extract)
  };

  const subEvents = await discoverSubEvents(article.links, seedEvent.year, yearRange, 8);

  return { enriched, subEvents };
}

async function batchEnrichEvents(
  seedEvents: Array<{ title: string; year: number; wikipediaTitle?: string }>,
  yearRange: { start: number; end: number }
): Promise<{ enrichedEvents: WikiEvent[]; allSubEvents: WikiEvent[] }> {
  const enrichedEvents: WikiEvent[] = [];
  const allSubEvents: WikiEvent[] = [];
  const seenTitles = new Set<string>();

  // Process in parallel batches of 5 to speed up enrichment while respecting rate limits
  const batchSize = 5;
  for (let i = 0; i < seedEvents.length; i += batchSize) {
    const batch = seedEvents.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(seed => enrichEventFromWikipedia(seed, yearRange).catch(() => ({ enriched: null, subEvents: [] })))
    );

    for (const { enriched, subEvents } of results) {
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
  }

  return { enrichedEvents, allSubEvents };
}

// ============================================
// SECURITY & RATE LIMITING
// ============================================

// In-memory rate limiting (resets on cold start, but good enough for serverless)
// For production, consider using Vercel KV or Upstash Redis
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration
const RATE_LIMITS = {
  // Per IP limits
  suggestions: { max: 30, windowMs: 60 * 1000 },      // 30 per minute
  regions: { max: 20, windowMs: 60 * 1000 },          // 20 per minute
  timeRange: { max: 20, windowMs: 60 * 1000 },        // 20 per minute
  timeline: { max: 5, windowMs: 60 * 60 * 1000 },     // 5 per hour (expensive!)
  followUp: { max: 30, windowMs: 60 * 1000 },         // 30 per minute
};

// Global daily limit to protect your API quota
const GLOBAL_DAILY_LIMIT = {
  timeline: 100,  // Max 100 timeline generations per day globally
};

let globalTimelineCount = 0;
let globalResetTime = Date.now() + 24 * 60 * 60 * 1000;

function getClientIP(req: VercelRequest): string {
  // Get real IP from various headers (Vercel/Cloudflare/etc)
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];

  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (typeof realIp === 'string') {
    return realIp;
  }
  return 'unknown';
}

function checkRateLimit(ip: string, action: keyof typeof RATE_LIMITS): { allowed: boolean; retryAfter?: number } {
  const config = RATE_LIMITS[action];
  const key = `${ip}:${action}`;
  const now = Date.now();

  // Check global daily limit for timeline
  if (action === 'timeline') {
    if (now > globalResetTime) {
      globalTimelineCount = 0;
      globalResetTime = now + 24 * 60 * 60 * 1000;
    }
    if (globalTimelineCount >= GLOBAL_DAILY_LIMIT.timeline) {
      return { allowed: false, retryAfter: Math.ceil((globalResetTime - now) / 1000) };
    }
  }

  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true };
  }

  if (record.count >= config.max) {
    return { allowed: false, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
  }

  record.count++;
  return { allowed: true };
}

function incrementGlobalCount(action: string) {
  if (action === 'timeline') {
    globalTimelineCount++;
  }
}

// ============================================
// QUERY INTENT DETECTION
// ============================================

// ============================================
// EVENT DEDUPLICATION
// ============================================

// ============================================
// GROQ API INTEGRATION
// ============================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS = {
  fast: 'llama-3.1-8b-instant',
  deep: 'llama-3.3-70b-versatile'
};

// Groq free tier enforces tokens-per-minute limits (fast: 6000 TPM, deep: 12000 TPM)
// and pre-checks prompt + max_tokens per request, so every call must request only
// the completion budget it actually needs or Groq rejects it outright with a 413.
const MAX_TOKENS = {
  suggestions: 400,
  regions: 300,
  timeRange: 150,
  intent: 400,
  eras: 2000,
  seedEventsQuick: 3500,
  seedEventsDeep: 4500,
  narrative: 1500,
  followUp: 800,
};

// Errors where retrying the same request can never succeed (bad key, oversized request)
class NonRetryableError extends Error {}

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  model: string = MODELS.fast,
  jsonMode: boolean = true,
  maxTokens: number = 1024,
  retries: number = 3
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3, // Lower temperature for factual accuracy
          max_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (response.status === 429) {
        // Rate limited - wait and retry with exponential backoff
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        console.error('Groq API error:', response.status, error);
        if (response.status === 401) {
          throw new NonRetryableError('API key issue. Please check configuration.');
        }
        if (response.status === 413) {
          // Request exceeds the model's per-request token limit; identical retries can't succeed
          throw new NonRetryableError('The AI service is at capacity right now. Please try again in a minute.');
        }
        throw new Error(`AI service error (${response.status})`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof NonRetryableError) {
        throw error;
      }
      lastError = error as Error;
      if (attempt < retries - 1) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Error, waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`);
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error('Failed after retries');
}

// ============================================
// QUERY ANALYSIS (LLM-based for complex cases)
// ============================================

async function analyzeQueryIntent(query: string): Promise<QueryAnalysis> {
  // First try quick detection
  const quickResult = quickDetectQueryType(query);
  if (quickResult) {
    console.log(`Quick query detection: ${quickResult.queryType}`);
    return quickResult;
  }

  // Fall back to LLM analysis
  console.log('Using LLM for query intent analysis...');
  const response = await callGroq([
    {
      role: 'system',
      content: `You are a query analyzer. Determine what type of historical query the user is making.
Always respond with valid JSON.`
    },
    {
      role: 'user',
      content: `Analyze this historical search query: "${query}"

Determine:
1. queryType: Is this a specific "city", broader "region", a "country", a thematic "topic", or a time "era"?
2. specificLocation: If it's a place, what's the specific location name?
3. broadContext: What's the broader geographic or historical context?
4. topics: What themes or topics might be relevant?

Examples:
- "San Francisco" -> {"queryType": "city", "specificLocation": "San Francisco", "broadContext": "California, United States", "topics": ["Gold Rush", "tech industry", "earthquakes"]}
- "Ancient Mesopotamia" -> {"queryType": "region", "specificLocation": "Mesopotamia", "broadContext": "Middle East", "topics": ["Sumer", "Babylon", "early civilization"]}
- "Industrial Revolution" -> {"queryType": "topic", "broadContext": "Europe", "topics": ["manufacturing", "steam power", "urbanization"]}
- "Ming Dynasty" -> {"queryType": "era", "specificLocation": "China", "topics": ["Chinese empire", "trade", "porcelain"]}

Return JSON: {"queryType": "city|region|country|topic|era", "specificLocation": "string or null", "broadContext": "string or null", "topics": ["array", "of", "topics"]}`
    }
  ], MODELS.fast, true, MAX_TOKENS.intent);

  const parsed = safeParseJSON<{
    queryType?: string;
    specificLocation?: string;
    broadContext?: string;
    topics?: string[];
  }>(response, { queryType: 'region' });

  const queryType = (['city', 'region', 'country', 'topic', 'era'].includes(parsed.data.queryType || '')
    ? parsed.data.queryType
    : 'region') as QueryAnalysis['queryType'];

  // Set event ratios based on query type
  const ratioMap: Record<string, { direct: number; regional: number; contextual: number }> = {
    city: { direct: 70, regional: 20, contextual: 10 },
    region: { direct: 55, regional: 30, contextual: 15 },
    country: { direct: 50, regional: 30, contextual: 20 },
    topic: { direct: 50, regional: 30, contextual: 20 },
    era: { direct: 60, regional: 25, contextual: 15 }
  };

  return {
    queryType,
    specificLocation: parsed.data.specificLocation || undefined,
    broadContext: parsed.data.broadContext || undefined,
    topics: parsed.data.topics,
    eventRatios: ratioMap[queryType]
  };
}

// ============================================
// HANDLER FUNCTIONS
// ============================================

async function getSuggestions(query: string): Promise<string[]> {
  if (query.length < 3) return [];

  const response = await callGroq([
    {
      role: 'system',
      content: 'You are a helpful assistant that suggests historically significant regions. Always respond with valid JSON.'
    },
    {
      role: 'user',
      content: `List 5 historically significant regions, empires, or cities that match the search term: "${query}".

               IMPORTANT: If the user types a specific city name (like "San Francisco", "Paris", "Tokyo"),
               the FIRST suggestion should be that exact city, then related regions/empires.

               Examples:
               - "Rom" -> ["Rome", "Roman Empire", "Roman Republic", "Romania", "Holy Roman Empire"]
               - "San Francisco" -> ["San Francisco", "California", "Spanish California", "Mexican California", "United States West Coast"]
               - "Paris" -> ["Paris", "France", "French Empire", "Kingdom of France", "Île-de-France"]

               Return JSON in format: {"suggestions": ["item1", "item2", ...]}`
    }
  ], MODELS.fast, true, MAX_TOKENS.suggestions);

  const parsed = safeParseJSON<{ suggestions?: string[] }>(response, { suggestions: [] });
  return Array.isArray(parsed.data.suggestions) ? parsed.data.suggestions.slice(0, 5) : [];
}

async function getRegionsFromCoordinates(lat: number, lng: number): Promise<string[]> {
  const response = await callGroq([
    {
      role: 'system',
      content: 'You are a helpful assistant that identifies historical regions from coordinates. Always respond with valid JSON.'
    },
    {
      role: 'user',
      content: `Given the coordinates (${lat}, ${lng}), list 4 distinct historically significant names for this region or major powers that controlled it.
               Include broad empires and specific cities if relevant.
               Example for Rome coords: ["Roman Empire", "Papal States", "Kingdom of Italy", "City of Rome"].
               Return JSON in format: {"suggestions": ["item1", "item2", ...]}`
    }
  ], MODELS.fast, true, MAX_TOKENS.regions);

  const parsed = safeParseJSON<{ suggestions?: string[] }>(response, { suggestions: [] });
  return Array.isArray(parsed.data.suggestions) ? parsed.data.suggestions.slice(0, 4) : [];
}

async function getSmartTimeRange(region: string): Promise<{ start: number; end: number } | null> {
  const currentYear = new Date().getFullYear();
  const response = await callGroq([
    {
      role: 'system',
      content: 'You are a helpful assistant that suggests historical time ranges. Always respond with valid JSON.'
    },
    {
      role: 'user',
      content: `For the historical region or topic "${region}", provide the most significant historical time range.

               DATE FORMAT RULES:
               - For BC/BCE dates: use NEGATIVE numbers (753 BC = -753, 3000 BC = -3000)
               - For AD/CE dates: use POSITIVE numbers (1776 AD = 1776, 2000 AD = 2000)
               - Start year must ALWAYS be less than end year

               EXAMPLES:
               - Ancient Rome: {"start": -753, "end": 476}
               - San Francisco: {"start": 1776, "end": ${currentYear}}
               - Ancient Egypt: {"start": -3100, "end": -30}
               - Victorian England: {"start": 1837, "end": 1901}
               - Medieval Europe: {"start": 500, "end": 1500}

               Rules:
               1. For modern cities (founded after 1 AD), use POSITIVE start years
               2. For ancient civilizations (BC/BCE), use NEGATIVE start years
               3. For regions that exist today, end year can be current year (${currentYear})
               4. Over-estimate slightly to ensure context is covered

               Return JSON in format: {"start": number, "end": number}`
    }
  ], MODELS.fast, true, MAX_TOKENS.timeRange);

  const parsed = safeParseJSON<{ start?: number | string; end?: number | string }>(response, {});
  // Coerce strings to numbers (LLMs sometimes return "1776" instead of 1776)
  const start = typeof parsed.data.start === 'string' ? parseInt(parsed.data.start, 10) : parsed.data.start;
  const end = typeof parsed.data.end === 'string' ? parseInt(parsed.data.end, 10) : parsed.data.end;
  if (typeof start === 'number' && typeof end === 'number' && !isNaN(start) && !isNaN(end) && start < end) {
    return { start, end };
  }
  return null;
}

async function generateTimelineData(
  region: string,
  startYear: number,
  endYear: number,
  mode: 'quick' | 'deep'
): Promise<any> {
  const model = mode === 'deep' ? MODELS.deep : MODELS.fast;
  const seedEventCount = mode === 'deep' ? 15 : 10; // Seed events (will be expanded via Wikipedia)

  // Format years for display in prompts
  const formatYearForPrompt = (year: number) => year < 0 ? `${Math.abs(year)} BC` : `${year} AD`;
  const startDisplay = formatYearForPrompt(startYear);
  const endDisplay = formatYearForPrompt(endYear);
  const yearRange = { start: startYear, end: endYear };

  // ============================================
  // STEP 0: Analyze Query Intent
  // ============================================
  console.log('Step 0: Analyzing query intent...');
  const queryAnalysis = await analyzeQueryIntent(region);
  console.log(`Query type: ${queryAnalysis.queryType}, Ratios: ${JSON.stringify(queryAnalysis.eventRatios)}`);

  // Calculate minimum event counts by relevance type
  const directCount = Math.ceil(seedEventCount * queryAnalysis.eventRatios.direct / 100);
  const regionalCount = Math.ceil(seedEventCount * queryAnalysis.eventRatios.regional / 100);
  const contextualCount = Math.ceil(seedEventCount * queryAnalysis.eventRatios.contextual / 100);

  // ============================================
  // STEP 1: Generate Eras (unchanged)
  // ============================================
  console.log('Step 1: Generating eras...');
  const erasResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian. Use ONLY standard historical periodization that would appear in textbooks and encyclopedias. Do not invent era names - use established historical terminology.

CRITICAL DATE FORMAT:
- AD/CE years are POSITIVE: 1760 AD = 1760, 1840 AD = 1840, 476 AD = 476
- BC/BCE years are NEGATIVE: 753 BC = -753, 3000 BC = -3000
- NEVER use negative numbers for AD years!`
    },
    {
      role: 'user',
      content: `Divide the history of ${region} from ${startDisplay} (year ${startYear}) to ${endDisplay} (year ${endYear}) into 5-10 standard historical eras.

        REQUIREMENTS:
        - Use ONLY well-established historical period names (e.g., "Renaissance", "Ming Dynasty", "Victorian Era")
        - Each era must be a recognized historical period found in academic sources
        - Do NOT invent creative era names
        - Eras must have accurate, historically accepted date ranges
        - AD years are POSITIVE (1760, 1840, etc.)
        - BC years are NEGATIVE (-753, -500, etc.)

        Return JSON in format:
        {
          "eras": [
            {
              "id": "string",
              "title": "string (standard historical name)",
              "startYear": number (positive for AD, negative for BC),
              "endYear": number (positive for AD, negative for BC),
              "summary": "string (1-2 sentences)"
            }
          ]
        }`
    }
  ], model, true, MAX_TOKENS.eras);

  let eras = [];
  const erasParsed = safeParseJSON<{ eras?: any[] }>(erasResponse, { eras: [] });
  eras = Array.isArray(erasParsed.data?.eras) ? erasParsed.data.eras : [];
  if (erasParsed.recovered) {
    console.log('Eras response required JSON recovery');
  }

  // Coerce era years from strings to numbers (LLMs sometimes return "1760" instead of 1760)
  eras = eras.map((era: any) => {
    if (typeof era.startYear === 'string') era.startYear = parseInt(era.startYear, 10);
    if (typeof era.endYear === 'string') era.endYear = parseInt(era.endYear, 10);
    return era;
  }).filter((era: any) => typeof era.startYear === 'number' && typeof era.endYear === 'number' && !isNaN(era.startYear) && !isNaN(era.endYear));

  // Fix LLM year sign errors: if user requested AD range but LLM returned negative years, flip them
  if (startYear > 0 && endYear > 0) {
    eras = eras.map((era: any) => {
      let { startYear: eStart, endYear: eEnd } = era;
      // If era years are negative but should be positive (AD range requested)
      if (typeof eStart === 'number' && eStart < 0 && Math.abs(eStart) >= 100) {
        eStart = Math.abs(eStart);
        console.warn(`Fixed era "${era.title}" startYear: ${era.startYear} -> ${eStart}`);
      }
      if (typeof eEnd === 'number' && eEnd < 0 && Math.abs(eEnd) >= 100) {
        eEnd = Math.abs(eEnd);
        console.warn(`Fixed era "${era.title}" endYear: ${era.endYear} -> ${eEnd}`);
      }
      return { ...era, startYear: eStart, endYear: eEnd };
    });
  }

  // ============================================
  // STEP 2: Generate SEED Events (with relevance typing)
  // ============================================
  console.log('Step 2: Generating seed events with relevance typing...');

  // Build context-aware prompt based on query analysis
  const queryTypeGuidance = {
    city: `The user is searching for a SPECIFIC CITY: "${region}".
           PRIORITY: Events that happened IN or AT this exact location.
           - "direct" events: Things that physically occurred in ${region} (founding, local incidents, buildings, local figures, city-specific events)
           - "regional" events: Events in the surrounding area/state/province that affected ${region}
           - "contextual" events: National/global events that provide historical backdrop (limit these!)`,
    region: `The user is searching for a REGION: "${region}".
           - "direct" events: Events that occurred within this region
           - "regional" events: Events in neighboring areas that significantly impacted this region
           - "contextual" events: Broader events that shaped the region's history`,
    country: `The user is searching for a COUNTRY: "${region}".
           - "direct" events: Major national events (independence, wars, political changes)
           - "regional" events: Events in specific parts of the country
           - "contextual" events: International events affecting the country`,
    topic: `The user is searching for a TOPIC: "${region}".
           - "direct" events: Core events directly about this topic
           - "regional" events: Related developments and parallel movements
           - "contextual" events: Background events that set the stage`,
    era: `The user is searching for an ERA: "${region}".
           - "direct" events: Defining events of this time period
           - "regional" events: Regional variations and manifestations
           - "contextual" events: Preceding/following events for context`
  };

  const seedEventsResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian. Your task is to identify historically significant events with ACCURATE RELEVANCE CLASSIFICATION.

${queryTypeGuidance[queryAnalysis.queryType]}

CRITICAL RULES:
1. Each event MUST have its own Wikipedia article
2. Include the EXACT Wikipedia article title
3. ACCURATELY classify each event's relevance:
   - "direct": Happened AT this exact place or is DIRECTLY about this topic
   - "regional": Happened nearby or is closely related
   - "contextual": Broader historical context (world events, national events for local searches)
4. AD years are POSITIVE (1776), BC years are NEGATIVE (-44)
5. CATEGORY DIVERSITY: Do NOT over-represent War events. History includes culture, science, religion, economics, and politics beyond warfare. Aim for:
   - No more than 30% War events
   - Include at least 2 Culture/Science/Economy events (founding of universities, architectural achievements, inventions, trade developments, artistic movements, etc.)
   - Include political events that are NOT wars (constitutions, reforms, elections, diplomatic achievements)
6. DISPUTED EVENTS: Set isDisputed=true when:
   - The event's date is debated by historians (e.g., founding of Rome, dating of Troy)
   - The event's causes or details are contested (e.g., assassination conspiracies, disputed succession claims)
   - The event is based on tradition rather than documented evidence (e.g., legendary founders, mythological origins)
   - Modern historians disagree about the event's significance or interpretation
   Mark at least 1-2 events as disputed if any exist in the timeline — most historical periods have scholarly debates.

Always respond with valid JSON.`
    },
    {
      role: 'user',
      content: `Generate ${seedEventCount} historically significant events for "${region}" from ${startDisplay} to ${endDisplay}.

        The eras are: ${eras.map((e: any) => e.title).join(', ')}
        ${queryAnalysis.broadContext ? `Broader context: ${queryAnalysis.broadContext}` : ''}
        ${queryAnalysis.topics ? `Related topics: ${queryAnalysis.topics.join(', ')}` : ''}

        REQUIRED EVENT DISTRIBUTION:
        - At least ${directCount} events must be "direct" (happened HERE, specifically about THIS)
        - About ${regionalCount} events can be "regional" (nearby or closely related)
        - At most ${contextualCount} events should be "contextual" (broader historical backdrop)

        IMPORTANT: For a ${queryAnalysis.queryType} search like "${region}", users expect to see LOCAL/SPECIFIC events first!
        ${queryAnalysis.queryType === 'city' ? `Find events that ACTUALLY happened in ${region} - founding date, notable incidents, important buildings, local historical figures, city milestones, local disasters, etc.` : ''}

        CATEGORY DIVERSITY (important!):
        - Maximum 30% of events should be "War" category
        - Include cultural milestones (art, architecture, literature, universities, inventions)
        - Include economic events (trade routes, market changes, famines, prosperity)
        - Include political events beyond wars (reforms, constitutions, elections, diplomatic breakthroughs)
        - Include religious/scientific events where relevant
        - Wars are important but history is MORE than just conflicts!

        DISPUTED EVENTS:
        - Mark isDisputed=true for events where dates, causes, or details are debated by historians
        - Most timelines should have 1-3 disputed events (legendary founders, contested dates, debated causes)

        REQUIREMENTS:
        1. Each event MUST have a corresponding Wikipedia article
        2. Include the EXACT Wikipedia article title in "wikipediaTitle" field
        3. Include relevanceType for EVERY event
        4. Include coordinates (lat/lng) - for "direct" events, these MUST be in/at ${region}
        5. Spread events across the time period AND across categories

        Return JSON in format:
        {
          "events": [
            {
              "id": "string",
              "title": "string (common name)",
              "wikipediaTitle": "string (EXACT Wikipedia article title)",
              "year": number (positive for AD, negative for BC),
              "category": "Politics" | "War" | "Culture" | "Economy" | "Religion" | "Science" | "Other",
              "summary": "string (1 sentence)",
              "relevanceType": "direct" | "regional" | "contextual",
              "relevanceReason": "string (why this event is relevant to ${region})",
              "imageQuery": "string (2-4 words for image search)",
              "location": {"lat": number, "lng": number, "name": "string"},
              "isDisputed": boolean,
              "confidenceScore": "High" | "Medium"
            }
          ]
        }`
    }
  ], model, true, mode === 'deep' ? MAX_TOKENS.seedEventsDeep : MAX_TOKENS.seedEventsQuick);

  const seedEventsParsed = safeParseJSON<{ events?: any[] }>(seedEventsResponse, { events: [] });
  if (seedEventsParsed.recovered) {
    console.log('Seed events response required JSON recovery');
  }

  const seedEvents = (Array.isArray(seedEventsParsed.data?.events) ? seedEventsParsed.data.events : [])
    .map((evt: any) => {
      if (!evt) return null;
      // Coerce year from string to number (LLMs often return "1776" instead of 1776)
      if (typeof evt.year === 'string') {
        const parsed = parseInt(evt.year, 10);
        if (!isNaN(parsed)) evt.year = parsed;
      }
      return evt;
    })
    .filter((evt: any) => {
      if (!evt || typeof evt.year !== 'number' || !Number.isFinite(evt.year)) return false;
      if (evt.year < startYear || evt.year > endYear) return false;
      const validation = validateEvent(evt);
      if (!validation.valid) {
        console.warn(`Dropping invalid seed event "${evt.title}": ${validation.errors.join(', ')}`);
        return false;
      }
      return true;
    });

  console.log(`Generated ${seedEvents.length} valid seed events`);

  // ============================================
  // STEP 3: Wikipedia Enrichment
  // ============================================
  console.log('Step 3: Enriching events via Wikipedia...');

  let allEvents: any[] = [];

  try {
    const { enrichedEvents, allSubEvents } = await batchEnrichEvents(
      seedEvents.map((e: any) => ({
        title: e.title,
        year: e.year,
        wikipediaTitle: e.wikipediaTitle
      })),
      yearRange
    );

    console.log(`Wikipedia enriched: ${enrichedEvents.length} events, discovered ${allSubEvents.length} sub-events`);

    // Merge seed events with Wikipedia data
    for (const seed of seedEvents) {
      const enriched = enrichedEvents.find(e =>
        e.title.toLowerCase() === seed.title.toLowerCase() ||
        e.wikipediaTitle?.toLowerCase() === seed.wikipediaTitle?.toLowerCase()
      );

      allEvents.push({
        id: seed.id || crypto.randomUUID(),
        title: seed.title,
        year: seed.year,
        category: seed.category || 'Other',
        summary: enriched?.summary || seed.summary,
        imageQuery: seed.imageQuery,
        citations: [
          ...(seed.citations || []),
          enriched?.wikipediaUrl ? {
            source: `Wikipedia: ${enriched.wikipediaTitle}`,
            url: enriched.wikipediaUrl
          } : null
        ].filter(Boolean),
        location: seed.location || (enriched?.coordinates ? {
          lat: enriched.coordinates.lat,
          lng: enriched.coordinates.lng,
          name: seed.title
        } : undefined),
        isDisputed: seed.isDisputed || false,
        confidenceScore: 'High',
        wikipediaTitle: enriched?.wikipediaTitle || seed.wikipediaTitle,
        wikipediaUrl: enriched?.wikipediaUrl,
        exactDate: enriched?.exactDate,
        keyFigures: enriched?.keyFigures,
        sourceType: 'llm' as const,
        isSubEvent: false,
        relevanceType: seed.relevanceType || 'direct',
        relevanceReason: seed.relevanceReason
      });
    }

    // Add discovered sub-events
    for (const sub of allSubEvents) {
      // Find parent event
      const parent = allEvents.find(e =>
        Math.abs(e.year - sub.year) < 50 // Within 50 years
      );

      allEvents.push({
        id: crypto.randomUUID(),
        title: sub.title,
        year: sub.year,
        category: categorizeEvent(sub.title),
        summary: sub.summary,
        imageQuery: sub.title.split(' ').slice(0, 3).join(' '),
        citations: [{
          source: `Wikipedia: ${sub.wikipediaTitle}`,
          url: sub.wikipediaUrl
        }],
        location: sub.coordinates ? {
          lat: sub.coordinates.lat,
          lng: sub.coordinates.lng,
          name: sub.title
        } : parent?.location,
        isDisputed: false,
        confidenceScore: 'High',
        wikipediaTitle: sub.wikipediaTitle,
        wikipediaUrl: sub.wikipediaUrl,
        exactDate: sub.exactDate,
        keyFigures: sub.keyFigures,
        sourceType: 'wikipedia' as const,
        isSubEvent: true,
        parentEventId: parent?.id,
        // Sub-events inherit parent's relevance or default to regional
        relevanceType: parent?.relevanceType || 'regional',
        relevanceReason: `Related to ${parent?.title || 'discovered events'}`
      });
    }
  } catch (wikiError) {
    console.error('Wikipedia enrichment failed, using seed events only:', wikiError);
    // Fall back to seed events without enrichment
    allEvents = seedEvents.map((e: any) => ({
      ...e,
      id: e.id || crypto.randomUUID(),
      citations: e.citations || [],
      sourceType: 'llm' as const,
      relevanceType: e.relevanceType || 'direct',
      relevanceReason: e.relevanceReason
    }));
  }

  // ============================================
  // STEP 3.5: Wikidata SPARQL Enrichment
  // ============================================
  // Only for location-based queries where Wikidata adds the most value
  if (['city', 'region', 'country'].includes(queryAnalysis.queryType)) {
    try {
      console.log('Step 3.5: Querying Wikidata SPARQL for additional events...');
      const wikidataEvents = await enrichFromWikidata(region, startYear, endYear);

      if (wikidataEvents.length > 0) {
        // Build a set of existing event titles for quick duplicate checking
        const existingTitles = new Set(
          allEvents.map((e: any) => normalizeString(e.title))
        );

        let added = 0;
        for (const wdEvent of wikidataEvents) {
          // Skip if we already have this event (by normalized title)
          const normTitle = normalizeString(wdEvent.title);
          if (existingTitles.has(normTitle)) continue;

          // Skip if similar to an existing event
          if (allEvents.some((e: any) => areTitlesSimilar(e.title, wdEvent.title))) continue;

          allEvents.push({
            id: crypto.randomUUID(),
            title: wdEvent.title,
            year: wdEvent.year,
            category: categorizeEvent(wdEvent.title),
            summary: wdEvent.description || `Historical event: ${wdEvent.title}`,
            imageQuery: wdEvent.title.split(' ').slice(0, 3).join(' '),
            citations: wdEvent.wikipediaTitle ? [{
              source: `Wikipedia: ${wdEvent.wikipediaTitle}`,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(wdEvent.wikipediaTitle.replace(/ /g, '_'))}`
            }] : [],
            location: wdEvent.coordinates ? {
              lat: wdEvent.coordinates.lat,
              lng: wdEvent.coordinates.lng,
              name: wdEvent.title,
            } : undefined,
            isDisputed: false,
            confidenceScore: 'High',
            wikipediaTitle: wdEvent.wikipediaTitle,
            exactDate: wdEvent.exactDate,
            sourceType: 'search' as const, // Wikidata-sourced events use 'search' type
            isSubEvent: false,
            relevanceType: 'direct',
            relevanceReason: `Discovered from Wikidata (${wdEvent.wikidataId})`,
          });

          existingTitles.add(normTitle);
          added++;
        }

        console.log(`Wikidata: added ${added} new events (${wikidataEvents.length - added} were duplicates)`);
      }
    } catch (wdError) {
      console.error('Wikidata enrichment failed (non-fatal):', wdError);
      // Continue without Wikidata — it's supplementary
    }
  } else {
    console.log('Step 3.5: Skipping Wikidata (query type is topic/era, not location)');
  }

  // Deduplicate events
  const deduped = deduplicateEvents(allEvents);
  console.log(`Event count after deduplication: ${deduped.length}`);

  // Final validation pass - ensure all events have required fields (coerce types first)
  const events = deduped
    .map((evt: any) => {
      if (!evt) return null;
      // Coerce year from string to number one more time for Wikipedia/Wikidata-sourced events
      if (typeof evt.year === 'string') {
        const parsed = parseInt(evt.year, 10);
        if (!isNaN(parsed)) evt.year = parsed;
      }
      return evt;
    })
    .filter((evt: any) => {
      if (!evt) return false;
      if (!evt.title || typeof evt.title !== 'string' || evt.title.trim().length === 0) return false;
      if (typeof evt.year !== 'number' || !Number.isFinite(evt.year) || evt.year === 0) return false;
      if (!evt.summary || typeof evt.summary !== 'string') return false;
      return true;
    });

  if (events.length < deduped.length) {
    console.warn(`Dropped ${deduped.length - events.length} invalid events in final validation`);
  }
  console.log(`Final event count: ${events.length}`);

  // ============================================
  // STEP 4: Generate Narrative (enhanced with more events)
  // ============================================
  console.log('Step 4: Generating narrative...');
  const eraNames = eras.map((e: any) => e.title).join(', ');
  const eventNames = events.slice(0, 15).map((e: any) => `${e.title} (${formatYearForPrompt(e.year)})`).join(', ');
  const narrativeResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian writing an encyclopedia-style summary. Include ONLY well-established historical facts. Do not speculate or embellish.`
    },
    {
      role: 'user',
      content: `Write a factual historical overview (3-4 paragraphs) of ${region} from ${startDisplay} to ${endDisplay}.

        ${eraNames ? `Reference these eras: ${eraNames}` : ''}
        ${eventNames ? `Key events include: ${eventNames}` : ''}

        REQUIREMENTS:
        - Write in encyclopedia style (factual, neutral tone)
        - Only state facts that would appear in Britannica or Wikipedia
        - Mention major turning points and their consequences
        - Note any well-known historical debates
        - Do NOT invent details or dramatize

        Return JSON in format: {"narrative": "string"}`
    }
  ], model, true, MAX_TOKENS.narrative);

  let narrative = '';
  const narrativeParsed = safeParseJSON<{ narrative?: string }>(narrativeResponse, { narrative: '' });
  if (narrativeParsed.recovered) {
    console.log('Narrative response required JSON recovery');
  }
  narrative = narrativeParsed.data?.narrative || '';

  // Log relevance distribution
  const relevanceCounts = events.reduce((acc: any, e: any) => {
    acc[e.relevanceType || 'unknown'] = (acc[e.relevanceType || 'unknown'] || 0) + 1;
    return acc;
  }, {});
  console.log('Event relevance distribution:', relevanceCounts);

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    region,
    timeRange: { start: startYear, end: endYear },
    eras,
    events,
    narrative,
    queryAnalysis: {
      queryType: queryAnalysis.queryType,
      specificLocation: queryAnalysis.specificLocation,
      broadContext: queryAnalysis.broadContext,
      topics: queryAnalysis.topics
    }
  };
}

async function askFollowUp(
  contextSummary: string,
  history: { role: string; text: string }[],
  question: string
): Promise<string> {
  // Limit history to prevent abuse
  const limitedHistory = history.slice(-10);

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `You are a rigorous academic historian specializing in the timeline the user is exploring. Answer questions ONLY about history and this timeline.

STRICT RULES:
1. ONLY answer questions related to history, the timeline, or historical topics
2. If asked about anything unrelated to history (recipes, coding, personal advice, etc.), politely refuse: "I'm a historian - I can only help with historical questions about this timeline."
3. Only state facts you are confident are historically accurate
4. If uncertain, say "Historical records suggest..." or "Some historians believe..."
5. Clearly distinguish between established facts and scholarly interpretation
6. If you don't know something, admit it rather than guessing
7. Keep responses concise (under 300 words)
8. Stay focused on the region and time period in this timeline

Context from timeline: ${contextSummary.slice(0, 2000)}`, // Limit context size
    },
    ...limitedHistory.map((h) => ({
      role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: h.text.slice(0, 1000), // Limit each message
    })),
    {
      role: 'user',
      content: question.slice(0, 500), // Limit question length
    },
  ];

  return callGroq(messages, MODELS.fast, false, MAX_TOKENS.followUp);
}

// ============================================
// MAIN HANDLER
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CORS - allow all origins for now (Vercel handles security)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get client IP for rate limiting
  const clientIP = getClientIP(req);

  try {
    const body = req.body;

    // Validate action
    const validActions = ['suggestions', 'regions', 'timeRange', 'timeline', 'followUp'];
    if (!body?.action || !validActions.includes(body.action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const action = body.action as keyof typeof RATE_LIMITS;

    // Check rate limit
    const rateCheck = checkRateLimit(clientIP, action);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfter));
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: rateCheck.retryAfter
      });
    }

    switch (action) {
      case 'suggestions': {
        const query = sanitizeString(body.query, 100);
        if (!query) {
          return res.status(400).json({ error: 'Valid query required' });
        }
        const suggestions = await getSuggestions(query);
        return res.status(200).json({ suggestions });
      }

      case 'regions': {
        const coords = validateCoordinates(body.lat, body.lng);
        if (!coords) {
          return res.status(400).json({ error: 'Valid coordinates required' });
        }
        const suggestions = await getRegionsFromCoordinates(coords.lat, coords.lng);
        return res.status(200).json({ suggestions });
      }

      case 'timeRange': {
        const region = sanitizeString(body.region, 200);
        if (!region) {
          return res.status(400).json({ error: 'Valid region required' });
        }
        const timeRange = await getSmartTimeRange(region);
        return res.status(200).json({ timeRange });
      }

      case 'timeline': {
        const region = sanitizeString(body.region, 200);
        const timeRange = validateTimeRange(body.startYear, body.endYear);
        const mode = body.mode === 'deep' ? 'deep' : 'quick';

        if (!region || !timeRange) {
          return res.status(400).json({ error: 'Valid region and time range required' });
        }

        // Increment global counter for timeline generations
        incrementGlobalCount('timeline');

        const timeline = await generateTimelineData(
          region,
          timeRange.start,
          timeRange.end,
          mode
        );
        return res.status(200).json({ timeline });
      }

      case 'followUp': {
        const contextSummary = sanitizeString(body.contextSummary, 3000);
        const question = sanitizeString(body.question, 500);

        if (!contextSummary || !question) {
          return res.status(400).json({ error: 'Context and question required' });
        }

        // Validate history array
        const history = Array.isArray(body.history)
          ? body.history.filter((h: any) =>
              h && typeof h.role === 'string' && typeof h.text === 'string'
            ).slice(-10)
          : [];

        const answer = await askFollowUp(contextSummary, history, question);
        return res.status(200).json({ answer });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('API Error:', error);
    if (error instanceof NonRetryableError) {
      return res.status(503).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
}
