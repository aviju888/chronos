import type { VercelRequest, VercelResponse } from '@vercel/node';
import { batchEnrichEvents, discoverSubEvents, fetchWikipediaArticle } from './services/wikipediaService';

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

// Input validation & sanitization
function sanitizeString(input: unknown, maxLength: number = 200): string | null {
  if (typeof input !== 'string') return null;
  // Remove any potential XSS or injection attempts
  const sanitized = input
    .trim()
    .slice(0, maxLength)
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[^\w\s\-.,'"()]/gi, ''); // Only allow safe characters
  return sanitized.length > 0 ? sanitized : null;
}

function validateCoordinates(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function validateYear(year: unknown): number | null {
  if (typeof year !== 'number') return null;
  if (!Number.isInteger(year)) return null;
  if (year < -10000 || year > 2100) return null; // Reasonable range for history
  return year;
}

function validateTimeRange(start: unknown, end: unknown): { start: number; end: number } | null {
  const startYear = validateYear(start);
  const endYear = validateYear(end);
  if (startYear === null || endYear === null) return null;
  if (startYear >= endYear) return null;
  if (endYear - startYear > 5000) return null; // Max 5000 year span
  return { start: startYear, end: endYear };
}

// ============================================
// JSON PARSING HELPERS
// ============================================

/**
 * Safely parse JSON with recovery for common LLM issues:
 * - Truncated responses (missing closing brackets)
 * - Extra text before/after JSON
 * - Markdown code blocks wrapping JSON
 */
function safeParseJSON<T>(text: string, fallback: T): { data: T; recovered: boolean } {
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

  // Count open brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Add missing closing brackets (limit to prevent runaway)
  const maxRepairs = 10;
  let repairs = 0;

  // Remove trailing comma if present
  repaired = repaired.replace(/,\s*$/, '');

  // Add missing braces
  while (repairs < maxRepairs && (repaired.match(/\{/g) || []).length > (repaired.match(/\}/g) || []).length) {
    repaired += '}';
    repairs++;
  }

  // Add missing brackets
  while (repairs < maxRepairs && (repaired.match(/\[/g) || []).length > (repaired.match(/\]/g) || []).length) {
    repaired += ']';
    repairs++;
  }

  // Step 6: Try parsing repaired version
  try {
    const parsed = JSON.parse(repaired);
    console.log(`JSON recovered with ${repairs} bracket repairs`);
    return { data: parsed, recovered: true };
  } catch (e) {
    console.error('JSON parse failed even after recovery attempts:', e);
    return { data: fallback, recovered: true };
  }
}

// ============================================
// EVENT DEDUPLICATION
// ============================================

/**
 * Normalize a string for comparison (lowercase, remove punctuation, extra spaces)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two event titles are similar enough to be considered duplicates
 * Uses simple substring matching and word overlap
 */
function areTitlesSimilar(title1: string, title2: string): boolean {
  const norm1 = normalizeString(title1);
  const norm2 = normalizeString(title2);

  // Exact match
  if (norm1 === norm2) return true;

  // One contains the other
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  // Word overlap (at least 70% of words match)
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return false;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const unionSize = Math.min(words1.size, words2.size);

  return intersection / unionSize >= 0.7;
}

/**
 * Deduplicate events by removing near-duplicates (same year + similar title)
 * Keeps the event with more citations/detail
 */
function deduplicateEvents(events: any[]): any[] {
  if (!Array.isArray(events) || events.length === 0) return events;

  const seen: Map<string, any> = new Map();
  const duplicatesRemoved: string[] = [];

  for (const event of events) {
    if (!event || typeof event.year !== 'number' || typeof event.title !== 'string') {
      continue;
    }

    // Create a key based on year and normalized title start
    const yearKey = event.year.toString();
    let isDuplicate = false;

    // Check against all events in the same year
    for (const [key, existing] of seen.entries()) {
      if (key.startsWith(yearKey + ':')) {
        if (areTitlesSimilar(event.title, existing.title)) {
          isDuplicate = true;

          // Keep the one with more citations
          const eventCitations = Array.isArray(event.citations) ? event.citations.length : 0;
          const existingCitations = Array.isArray(existing.citations) ? existing.citations.length : 0;

          if (eventCitations > existingCitations) {
            // Replace with the better one
            seen.delete(key);
            seen.set(`${yearKey}:${normalizeString(event.title).slice(0, 20)}`, event);
            duplicatesRemoved.push(existing.title);
          } else {
            duplicatesRemoved.push(event.title);
          }
          break;
        }
      }
    }

    if (!isDuplicate) {
      seen.set(`${yearKey}:${normalizeString(event.title).slice(0, 20)}`, event);
    }
  }

  if (duplicatesRemoved.length > 0) {
    console.log(`Removed ${duplicatesRemoved.length} duplicate events:`, duplicatesRemoved);
  }

  return Array.from(seen.values());
}

// ============================================
// GROQ API INTEGRATION
// ============================================

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MODELS = {
  fast: 'llama-3.1-8b-instant',
  deep: 'llama-3.3-70b-versatile'
};

// Helper to delay execution
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  model: string = MODELS.fast,
  jsonMode: boolean = true,
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
          max_tokens: 6000, // Reduced to stay under token limits
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
          throw new Error('API key issue. Please check configuration.');
        }
        throw new Error(`AI service error (${response.status})`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
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
  ]);

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
  ]);

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
  ]);

  const parsed = safeParseJSON<{ start?: number; end?: number }>(response, {});
  if (typeof parsed.data.start === 'number' && typeof parsed.data.end === 'number') {
    return { start: parsed.data.start, end: parsed.data.end };
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
  ], model);

  let eras = [];
  const erasParsed = safeParseJSON<{ eras?: any[] }>(erasResponse, { eras: [] });
  eras = Array.isArray(erasParsed.data?.eras) ? erasParsed.data.eras : [];
  if (erasParsed.recovered) {
    console.log('Eras response required JSON recovery');
  }

  // ============================================
  // STEP 2: Generate SEED Events (major anchor events with Wikipedia titles)
  // ============================================
  console.log('Step 2: Generating seed events...');
  const seedEventsResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian. Your task is to identify MAJOR ANCHOR events that have dedicated Wikipedia articles.

CRITICAL RULES:
1. Focus on PIVOTAL events only (wars, regime changes, major treaties, revolutions, famous battles)
2. Each event MUST have its own Wikipedia article
3. Include the EXACT Wikipedia article title - this will be used to fetch more details
4. AD years are POSITIVE (1776), BC years are NEGATIVE (-44)

Always respond with valid JSON.`
    },
    {
      role: 'user',
      content: `Generate ${seedEventCount} MAJOR anchor events for ${region} from ${startDisplay} (year ${startYear}) to ${endDisplay} (year ${endYear}).

        The eras are: ${eras.map((e: any) => e.title).join(', ')}

        REQUIREMENTS:
        1. Each event MUST have a corresponding Wikipedia article
        2. Include the EXACT Wikipedia article title in "wikipediaTitle" field
        3. Focus on: Wars, Battles, Treaties, Revolutions, Coronations, Deaths of rulers, Major laws/edicts
        4. Spread events across the entire time period
        5. Include coordinates (lat/lng) for each event location

        Return JSON in format:
        {
          "events": [
            {
              "id": "string",
              "title": "string (common name)",
              "wikipediaTitle": "string (EXACT Wikipedia article title, e.g., 'Battle of Thermopylae' or 'Julius Caesar')",
              "year": number (positive for AD, negative for BC),
              "category": "Politics" | "War" | "Culture" | "Economy" | "Religion" | "Science" | "Other",
              "summary": "string (1 sentence)",
              "imageQuery": "string (2-4 words for image search)",
              "location": {"lat": number, "lng": number, "name": "string"},
              "isDisputed": boolean,
              "confidenceScore": "High" | "Medium"
            }
          ]
        }`
    }
  ], model);

  const seedEventsParsed = safeParseJSON<{ events?: any[] }>(seedEventsResponse, { events: [] });
  if (seedEventsParsed.recovered) {
    console.log('Seed events response required JSON recovery');
  }

  const seedEvents = (Array.isArray(seedEventsParsed.data?.events) ? seedEventsParsed.data.events : [])
    .filter((evt: any) => evt && typeof evt.year === 'number' && evt.year >= startYear && evt.year <= endYear);

  console.log(`Generated ${seedEvents.length} seed events`);

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
        isSubEvent: false
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
        parentEventId: parent?.id
      });
    }
  } catch (wikiError) {
    console.error('Wikipedia enrichment failed, using seed events only:', wikiError);
    // Fall back to seed events without enrichment
    allEvents = seedEvents.map((e: any) => ({
      ...e,
      id: e.id || crypto.randomUUID(),
      citations: e.citations || [],
      sourceType: 'llm' as const
    }));
  }

  // Deduplicate events
  const events = deduplicateEvents(allEvents);
  console.log(`Final event count after deduplication: ${events.length}`);

  // ============================================
  // STEP 4: Generate Narrative (enhanced with more events)
  // ============================================
  console.log('Step 4: Generating narrative...');
  const narrativeResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian writing an encyclopedia-style summary. Include ONLY well-established historical facts. Do not speculate or embellish.`
    },
    {
      role: 'user',
      content: `Write a factual historical overview (3-4 paragraphs) of ${region} from ${startDisplay} to ${endDisplay}.

        Reference these eras: ${eras.map((e: any) => e.title).join(', ')}
        Key events include: ${events.slice(0, 15).map((e: any) => `${e.title} (${formatYearForPrompt(e.year)})`).join(', ')}

        REQUIREMENTS:
        - Write in encyclopedia style (factual, neutral tone)
        - Only state facts that would appear in Britannica or Wikipedia
        - Mention major turning points and their consequences
        - Note any well-known historical debates
        - Do NOT invent details or dramatize

        Return JSON in format: {"narrative": "string"}`
    }
  ], model);

  let narrative = '';
  const narrativeParsed = safeParseJSON<{ narrative?: string }>(narrativeResponse, { narrative: '' });
  if (narrativeParsed.recovered) {
    console.log('Narrative response required JSON recovery');
  }
  narrative = narrativeParsed.data?.narrative || '';

  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    region,
    timeRange: { start: startYear, end: endYear },
    eras,
    events,
    narrative,
  };
}

// Helper to categorize events based on title
function categorizeEvent(title: string): string {
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

  return callGroq(messages, MODELS.fast, false);
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
    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
}
