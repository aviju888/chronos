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

async function callGroq(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  model: string = MODELS.fast,
  jsonMode: boolean = true
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 8192,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Groq API error:', response.status, error);
    throw new Error(`AI service temporarily unavailable`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
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
      content: `For the historical region or topic "${region}", provide the most significant historical time range (start year and end year).
               Rules:
               1. Over-estimate slightly to ensure context is covered.
               2. For empires, include rise and fall.
               3. For cities, pick their 'Golden Age' or most eventful period if not specified, or 1000-2000 AD if generic.
               4. Return JSON in format: {"start": number, "end": number}`
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
  const eventCount = mode === 'deep' ? 80 : 40;

  // Step 1: Generate Eras
  const erasResponse = await callGroq([
    {
      role: 'system',
      content: 'You are an expert historian. Always respond with valid JSON matching the requested schema exactly.'
    },
    {
      role: 'user',
      content: `We are building a strict, citation-backed timeline for:
        Region: ${region}
        Time Period: ${startYear} to ${endYear}

        Divide this period into 5-10 logical historical eras.
        Return JSON in format:
        {
          "eras": [
            {
              "id": "string",
              "title": "string",
              "startYear": number,
              "endYear": number,
              "summary": "string"
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
      content: 'You are an expert historian. Always respond with valid JSON matching the requested schema exactly.'
    },
    {
      role: 'user',
      content: `Generate ${eventCount} significant historical events for ${region} from ${startYear} to ${endYear}.

        The eras are: ${eras.map((e: any) => e.title).join(', ')}

        Requirements:
        1. Distribute events across the eras.
        2. Include Lat/Lng for events where specific locations are relevant.
        3. Categorize each event as one of: Politics, War, Culture, Economy, Religion, Science, Other
        4. Provide citation sources (encyclopedic) for EVERY event.
        5. If an event is disputed, set isDisputed=true and list conflicting claims.
        6. Confidence Score: High/Medium/Low.
        7. Provide an 'imageQuery' for each event: best 2-4 word phrase to search Wikipedia for an image.

        Return JSON in format:
        {
          "events": [
            {
              "id": "string",
              "title": "string",
              "year": number,
              "category": "Politics" | "War" | "Culture" | "Economy" | "Religion" | "Science" | "Other",
              "summary": "string",
              "imageQuery": "string",
              "citations": [{"source": "string", "url": "string (optional)"}],
              "location": {"lat": number, "lng": number, "name": "string"} (optional),
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
      content: 'You are an expert historian. Always respond with valid JSON.'
    },
    {
      role: 'user',
      content: `Write a cohesive historical narrative (3-5 paragraphs) summarizing ${region} from ${startYear} to ${endYear}.

        Based on these eras: ${eras.map((e: any) => e.title).join(', ')}
        And ${events.length} events including: ${events.slice(0, 10).map((e: any) => e.title).join(', ')}...

        Mention key turning points and disputed historical interpretations if any.
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
      content: `You are an expert historian assistant. You have access to a generated timeline. Answer questions specifically about this timeline and period. Be academic but accessible. Keep responses concise (under 500 words).

Context: ${contextSummary.slice(0, 2000)}`, // Limit context size
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

  // CORS - restrict to your domain in production
  const allowedOrigins = [
    'https://chronos-explorer.vercel.app',
    'https://chronos.vercel.app',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
    'http://localhost:3000', // For local dev
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (origin && allowedOrigins.some(allowed => origin.startsWith(allowed.replace('https://', '').replace('http://', '')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
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
