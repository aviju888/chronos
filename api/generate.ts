import type { VercelRequest, VercelResponse } from '@vercel/node';

// Groq API endpoint
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Models
const MODELS = {
  fast: 'llama-3.1-8b-instant',
  deep: 'llama-3.3-70b-versatile'
};

interface GenerateRequest {
  action: 'suggestions' | 'regions' | 'timeRange' | 'timeline' | 'followUp';
  // For suggestions
  query?: string;
  // For regions
  lat?: number;
  lng?: number;
  // For timeRange
  region?: string;
  // For timeline
  startYear?: number;
  endYear?: number;
  mode?: 'quick' | 'deep';
  // For followUp
  contextSummary?: string;
  history?: { role: string; text: string }[];
  question?: string;
}

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
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

// Handler functions for each action
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
    return data.suggestions || [];
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
    return data.suggestions || [];
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

async function generateTimeline(
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
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `You are an expert historian assistant. You have access to a generated timeline. Answer questions specifically about this timeline and period. Be academic but accessible.

Context: ${contextSummary}`,
    },
    ...history.map((h) => ({
      role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: h.text,
    })),
    {
      role: 'user',
      content: question,
    },
  ];

  return callGroq(messages, MODELS.fast, false);
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: GenerateRequest = req.body;

    switch (body.action) {
      case 'suggestions': {
        if (!body.query) {
          return res.status(400).json({ error: 'Query required' });
        }
        const suggestions = await getSuggestions(body.query);
        return res.status(200).json({ suggestions });
      }

      case 'regions': {
        if (body.lat === undefined || body.lng === undefined) {
          return res.status(400).json({ error: 'Coordinates required' });
        }
        const suggestions = await getRegionsFromCoordinates(body.lat, body.lng);
        return res.status(200).json({ suggestions });
      }

      case 'timeRange': {
        if (!body.region) {
          return res.status(400).json({ error: 'Region required' });
        }
        const timeRange = await getSmartTimeRange(body.region);
        return res.status(200).json({ timeRange });
      }

      case 'timeline': {
        if (!body.region || body.startYear === undefined || body.endYear === undefined) {
          return res.status(400).json({ error: 'Region and time range required' });
        }
        const timeline = await generateTimeline(
          body.region,
          body.startYear,
          body.endYear,
          body.mode || 'quick'
        );
        return res.status(200).json({ timeline });
      }

      case 'followUp': {
        if (!body.contextSummary || !body.question) {
          return res.status(400).json({ error: 'Context and question required' });
        }
        const answer = await askFollowUp(
          body.contextSummary,
          body.history || [],
          body.question
        );
        return res.status(200).json({ answer });
      }

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
