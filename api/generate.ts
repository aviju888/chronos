import type { VercelRequest, VercelResponse } from '@vercel/node';

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
               Examples: "Rom" -> ["Roman Empire", "Romania", "Roman Republic", "Rome (City)", "Holy Roman Empire"].
               Return JSON in format: {"suggestions": ["item1", "item2", ...]}`
    }
  ]);

  try {
    const data = JSON.parse(response);
    return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : [];
  } catch {
    return [];
  }
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

  try {
    const data = JSON.parse(response);
    return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 4) : [];
  } catch {
    return [];
  }
}

async function getSmartTimeRange(region: string): Promise<{ start: number; end: number } | null> {
  const response = await callGroq([
    {
      role: 'system',
      content: 'You are a helpful assistant that suggests historical time ranges. Always respond with valid JSON.'
    },
    {
      role: 'user',
      content: `For the historical region or topic "${region}", provide the most significant historical time range.

               CRITICAL: Use NEGATIVE numbers for BC/BCE dates!
               Examples:
               - 753 BC = -753
               - 476 AD = 476
               - 3000 BC = -3000

               Rules:
               1. Start year must be LESS than end year (e.g., -753 < 476)
               2. Over-estimate slightly to ensure context is covered.
               3. For empires, include rise and fall.
               4. For ancient civilizations, use negative numbers for BC dates.

               Return JSON in format: {"start": number, "end": number}
               Example for Ancient Rome: {"start": -753, "end": 476}`
    }
  ]);

  try {
    const data = JSON.parse(response);
    if (typeof data.start === 'number' && typeof data.end === 'number') {
      return { start: data.start, end: data.end };
    }
    return null;
  } catch {
    return null;
  }
}

async function generateTimelineData(
  region: string,
  startYear: number,
  endYear: number,
  mode: 'quick' | 'deep'
): Promise<any> {
  const model = mode === 'deep' ? MODELS.deep : MODELS.fast;
  const eventCount = mode === 'deep' ? 30 : 15; // Reduced to stay under token limits

  // Step 1: Generate Eras
  // Format years for display in prompts
  const formatYearForPrompt = (year: number) => year < 0 ? `${Math.abs(year)} BC` : `${year} AD`;
  const startDisplay = formatYearForPrompt(startYear);
  const endDisplay = formatYearForPrompt(endYear);

  const erasResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian. Use ONLY standard historical periodization that would appear in textbooks and encyclopedias. Do not invent era names - use established historical terminology.

IMPORTANT: For dates, use NEGATIVE numbers for BC/BCE years.
Examples: 753 BC = -753, 476 AD = 476, 3000 BC = -3000`
    },
    {
      role: 'user',
      content: `Divide the history of ${region} from ${startDisplay} (year ${startYear}) to ${endDisplay} (year ${endYear}) into 5-10 standard historical eras.

        REQUIREMENTS:
        - Use ONLY well-established historical period names (e.g., "Renaissance", "Ming Dynasty", "Victorian Era")
        - Each era must be a recognized historical period found in academic sources
        - Do NOT invent creative era names
        - Eras must have accurate, historically accepted date ranges
        - Use NEGATIVE numbers for BC dates (e.g., 500 BC = -500)

        Return JSON in format:
        {
          "eras": [
            {
              "id": "string",
              "title": "string (standard historical name)",
              "startYear": number (negative for BC),
              "endYear": number (negative for BC),
              "summary": "string (1-2 sentences)"
            }
          ]
        }`
    }
  ], model);

  let eras = [];
  try {
    const erasData = JSON.parse(erasResponse);
    eras = Array.isArray(erasData?.eras) ? erasData.eras : [];
  } catch {
    eras = [];
  }

  // Step 2: Generate Events
  const eventsResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian. Your PRIMARY DIRECTIVE is factual accuracy.

CRITICAL RULES:
1. ONLY include events that are WELL-DOCUMENTED in mainstream historical sources
2. NEVER invent, fabricate, or guess at historical events
3. If unsure about an event, DO NOT include it
4. Prefer FEWER accurate events over MORE questionable ones
5. Use EXACT dates when known, approximate decades when uncertain
6. Every event MUST be verifiable in Wikipedia, Britannica, or academic sources
7. Citations must reference REAL sources that actually discuss the event
8. Use NEGATIVE numbers for BC/BCE years (e.g., 44 BC = -44)

Always respond with valid JSON matching the requested schema exactly.`
    },
    {
      role: 'user',
      content: `Generate ${eventCount} VERIFIED historical events for ${region} from ${startDisplay} (year ${startYear}) to ${endDisplay} (year ${endYear}).

        The eras are: ${eras.map((e: any) => e.title).join(', ')}

        STRICT REQUIREMENTS:
        1. ONLY include events you are CERTAIN are historically accurate
        2. Each event must be findable in Wikipedia or Encyclopaedia Britannica
        3. If you cannot verify an event exists, DO NOT include it
        4. Better to return 20 accurate events than 40 with fabrications
        5. For ancient history, stick to major well-documented events only
        6. Include Lat/Lng only for events with KNOWN specific locations
        7. Categorize: Politics, War, Culture, Economy, Religion, Science, Other
        8. Citation sources must be REAL encyclopedic sources
        9. Set confidenceScore="High" only for textbook-level well-known events
        10. Set confidenceScore="Medium" for events with some scholarly debate on details
        11. Provide 'imageQuery': 2-4 word Wikipedia search term for the event
        12. Use NEGATIVE year numbers for BC dates (44 BC = -44, 509 BC = -509)

        Return JSON in format:
        {
          "events": [
            {
              "id": "string",
              "title": "string (use common historical name)",
              "year": number (NEGATIVE for BC, e.g., -44 for 44 BC),
              "category": "Politics" | "War" | "Culture" | "Economy" | "Religion" | "Science" | "Other",
              "summary": "string (2-3 sentences, factual only)",
              "imageQuery": "string",
              "citations": [{"source": "Wikipedia: Article Name" or "Britannica: Article Name", "url": "string (optional)"}],
              "location": {"lat": number, "lng": number, "name": "string"} (optional, only if location is certain),
              "isDisputed": boolean,
              "disputeClaims": [{"summary": "string", "citations": [{"source": "string"}]}] (optional),
              "confidenceScore": "High" | "Medium" | "Low"
            }
          ]
        }`
    }
  ], model);

  let events = [];
  try {
    const eventsData = JSON.parse(eventsResponse);
    events = (Array.isArray(eventsData?.events) ? eventsData.events : []).map((evt: any) => ({
      ...evt,
      citations: Array.isArray(evt.citations) ? evt.citations : [],
      disputeClaims: Array.isArray(evt.disputeClaims)
        ? evt.disputeClaims.map((dc: any) => ({
            ...dc,
            citations: Array.isArray(dc.citations) ? dc.citations : [],
          }))
        : [],
    }));
  } catch {
    events = [];
  }

  // Step 3: Generate Narrative
  const narrativeResponse = await callGroq([
    {
      role: 'system',
      content: `You are a rigorous academic historian writing an encyclopedia-style summary. Include ONLY well-established historical facts. Do not speculate or embellish.`
    },
    {
      role: 'user',
      content: `Write a factual historical overview (3-4 paragraphs) of ${region} from ${startDisplay} to ${endDisplay}.

        Reference these eras: ${eras.map((e: any) => e.title).join(', ')}
        Key events include: ${events.slice(0, 10).map((e: any) => e.title).join(', ')}

        REQUIREMENTS:
        - Write in encyclopedia style (factual, neutral tone)
        - Only state facts that would appear in Britannica or Wikipedia
        - Mention major turning points
        - Note any well-known historical debates (with "historians debate..." framing)
        - Do NOT invent details or dramatize

        Return JSON in format: {"narrative": "string"}`
    }
  ], model);

  let narrative = '';
  try {
    const narrativeData = JSON.parse(narrativeResponse);
    narrative = narrativeData.narrative || '';
  } catch {
    narrative = '';
  }

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
      content: `You are a rigorous academic historian. Answer questions about history with FACTUAL ACCURACY as your top priority.

RULES:
1. Only state facts you are confident are historically accurate
2. If uncertain, say "Historical records suggest..." or "Some historians believe..."
3. Clearly distinguish between established facts and scholarly interpretation
4. If you don't know something, admit it rather than guessing
5. Keep responses concise (under 400 words)
6. Cite the type of source (e.g., "According to ancient Roman records..." or "Modern archaeology suggests...")

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
