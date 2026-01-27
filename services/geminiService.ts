import { GoogleGenAI, Type, Schema } from "@google/genai";
import { TimelineData, GenerationMode } from "../types";

// --- Schemas ---

const erasSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    eras: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          startYear: { type: Type.INTEGER },
          endYear: { type: Type.INTEGER },
          summary: { type: Type.STRING },
        },
        required: ["id", "title", "startYear", "endYear", "summary"],
      },
    },
  },
  required: ["eras"],
};

const eventsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          year: { type: Type.INTEGER },
          category: {
            type: Type.STRING,
            enum: ["Politics", "War", "Culture", "Economy", "Religion", "Science", "Other"]
          },
          summary: { type: Type.STRING },
          imageQuery: { type: Type.STRING, description: "A specific noun phrase to search Wikipedia for an image representing this event (e.g. 'Battle of Waterloo' not 'The Battle')." },
          citations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                url: { type: Type.STRING },
              },
              required: ["source"]
            }
          },
          location: {
            type: Type.OBJECT,
            properties: {
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              name: { type: Type.STRING },
            }
          },
          isDisputed: { type: Type.BOOLEAN },
          disputeClaims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                citations: {
                  type: Type.ARRAY,
                  items: {
                     type: Type.OBJECT,
                     properties: {
                       source: { type: Type.STRING }
                     }
                  }
                }
              }
            }
          },
          confidenceScore: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
        },
        required: ["id", "title", "year", "category", "summary", "citations", "isDisputed", "confidenceScore"]
      },
    },
  },
  required: ["events"],
};

const narrativeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    narrative: { type: Type.STRING },
  },
  required: ["narrative"],
};

// --- Helper Schemas for Search Features ---

const suggestionsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  }
};

const timeRangeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    start: { type: Type.INTEGER },
    end: { type: Type.INTEGER }
  }
};

// --- Service ---

export interface ProgressUpdate {
  message: string;
  percent: number;
  timeLeft: number; // in seconds
}

// Quick helper to get AI instance
const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
  return new GoogleGenAI({ apiKey });
};

export const getSearchSuggestions = async (query: string): Promise<string[]> => {
  if (query.length < 3) return [];
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `List 5 historically significant regions, empires, or cities that match the search term: "${query}". 
                 Examples: "Rom" -> ["Roman Empire", "Romania", "Roman Republic", "Rome (City)", "Holy Roman Empire"].
                 Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: suggestionsSchema
      }
    });
    const data = JSON.parse(response.text || "{}");
    return data.suggestions || [];
  } catch (e) {
    console.error("Suggestion error", e);
    return [];
  }
};

export const getRegionsFromCoordinates = async (lat: number, lng: number): Promise<string[]> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Given the coordinates (${lat}, ${lng}), list 4 distinct historically significant names for this region or major powers that controlled it.
                 Include broad empires and specific cities if relevant.
                 Example for Rome coords: ["Roman Empire", "Papal States", "Kingdom of Italy", "City of Rome"].
                 Return JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: suggestionsSchema
      }
    });
    const data = JSON.parse(response.text || "{}");
    return data.suggestions || [];
  } catch (e) {
    console.error("Coordinate reverse lookup error", e);
    return [];
  }
};

export const getSmartTimeRange = async (region: string): Promise<{start: number, end: number} | null> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `For the historical region or topic "${region}", provide the most significant historical time range (start year and end year).
                 Rules:
                 1. Over-estimate slightly to ensure context is covered.
                 2. For empires, include rise and fall.
                 3. For cities, pick their 'Golden Age' or most eventful period if not specified, or 1000-2000 AD if generic.
                 4. Return JSON { start, end }.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: timeRangeSchema
      }
    });
    const data = JSON.parse(response.text || "{}");
    if (typeof data.start === 'number' && typeof data.end === 'number') {
      return { start: data.start, end: data.end };
    }
    return null;
  } catch (e) {
    console.error("Time range estimate error", e);
    return null;
  }
};

export const generateTimeline = async (
  region: string,
  startYear: number,
  endYear: number,
  mode: GenerationMode,
  onProgress: (update: ProgressUpdate) => void
): Promise<TimelineData> => {
  const ai = getAI();

  // Select model based on mode
  const modelName = mode === GenerationMode.DEEP
    ? "gemini-3-pro-preview"
    : "gemini-3-flash-preview";

  // Track actual elapsed time for better estimates
  const startTime = Date.now();
  let lastStepDuration = 0;

  // Step weights for progress calculation (based on typical API response times)
  // Eras: ~20%, Events: ~60%, Narrative: ~20%
  const STEP_WEIGHTS = { init: 5, eras: 25, events: 85, narrative: 100 };

  const updateProgress = (step: keyof typeof STEP_WEIGHTS, message: string) => {
    const elapsed = (Date.now() - startTime) / 1000;
    const percent = STEP_WEIGHTS[step];

    // Estimate remaining time based on elapsed time and progress
    const estimatedTotal = percent > 5 ? (elapsed / (percent / 100)) : (mode === GenerationMode.DEEP ? 60 : 30);
    const timeLeft = Math.max(0, Math.round(estimatedTotal - elapsed));

    onProgress({ message, percent, timeLeft });
  };

  // Initialize Chat Session
  const chat = ai.chats.create({
    model: modelName,
    config: {
      // For deep mode, we can enable thinking to improve reasoning quality
      ...(mode === GenerationMode.DEEP ? { thinkingConfig: { thinkingBudget: 2048 } } : {})
    }
  });

  // Step 1: Initialize Context & Generate Eras
  updateProgress('init', "Initializing historical context analysis...");

  const erasPrompt = `
    You are an expert historian. We are building a strict, citation-backed timeline for:
    Region: ${region}
    Time Period: ${startYear} to ${endYear}
    Mode: ${mode}

    First, divide this period into 5-10 logical historical eras.
    Return JSON matching the schema.
  `;

  updateProgress('init', "Identifying historical eras and periodization...");
  const erasResponse = await chat.sendMessage({
    message: erasPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: erasSchema
    }
  });

  if (!erasResponse.text) throw new Error("Failed to generate eras");

  let erasData;
  try {
      erasData = JSON.parse(erasResponse.text);
  } catch (e) {
      throw new Error("Failed to parse eras JSON");
  }

  // Defensive check for eras array
  const eras = Array.isArray(erasData?.eras) ? erasData.eras : [];

  const eraCount = eras.length;
  updateProgress('eras', `Identified ${eraCount} distinct historical eras.`);

  // Step 2: Generate Events
  updateProgress('eras', `Retrieving records (Scanning ${mode === GenerationMode.DEEP ? 'deep' : 'quick'} archives)...`);
  const eventCount = mode === GenerationMode.DEEP ? 80 : 40;

  const eventsPrompt = `
    Now, generate a list of ${eventCount} significant historical events for these eras.

    Requirements:
    1. Distribute events across the eras defined previously.
    2. Include Lat/Lng for events where specific locations are relevant.
    3. STRICTLY categorize: Politics, War, Culture, Economy, Religion, Science.
    4. Provide citation sources (encyclopedic) for EVERY event.
    5. If an event is disputed, set isDisputed=true and list specific conflicting claims with their sources.
    6. Confidence Score: High/Medium/Low.
    7. Provide an 'imageQuery' for each event: the best 2-4 word phrase to search Wikipedia for a relevant picture (e.g. for "Coronation of Charlemagne", use "Charlemagne").

    Return JSON matching the schema.
  `;

  const eventsResponse = await chat.sendMessage({
    message: eventsPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: eventsSchema
    }
  });

  if (!eventsResponse.text) throw new Error("Failed to generate events");

  let eventsData;
  try {
      eventsData = JSON.parse(eventsResponse.text);
  } catch (e) {
      throw new Error("Failed to parse events JSON");
  }

  // Defensive check for events array and inner arrays
  const events = (Array.isArray(eventsData?.events) ? eventsData.events : []).map((evt: any) => ({
      ...evt,
      citations: Array.isArray(evt.citations) ? evt.citations : [],
      disputeClaims: Array.isArray(evt.disputeClaims) ? evt.disputeClaims.map((dc: any) => ({
          ...dc,
          citations: Array.isArray(dc.citations) ? dc.citations : []
      })) : []
  }));

  updateProgress('events', `Cataloged ${events.length} significant events.`);

  // Step 3: Generate Narrative
  updateProgress('events', "Synthesizing historical narrative and resolving disputes...");
  const narrativePrompt = `
    Finally, write a cohesive historical narrative (3-5 paragraphs) summarizing this period based on the events you just generated.
    Mention key turning points and disputed historical interpretations if any.
    Return JSON matching the schema.
  `;

  const narrativeResponse = await chat.sendMessage({
    message: narrativePrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: narrativeSchema
    }
  });

  if (!narrativeResponse.text) throw new Error("Failed to generate narrative");

  let narrativeData;
  try {
      narrativeData = JSON.parse(narrativeResponse.text);
  } catch (e) {
     throw new Error("Failed to parse narrative JSON");
  }

  updateProgress('narrative', "Finalizing archives...");

  // Assemble final data structure
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    region,
    timeRange: { start: startYear, end: endYear },
    eras: eras,
    events: events,
    narrative: narrativeData.narrative || ""
  };
};

export const askFollowUp = async (
  contextData: TimelineData,
  history: { role: string; text: string }[],
  question: string
): Promise<string> => {
  const ai = getAI();
  
  // Defensive checks for context summary to avoid map errors on contextData properties
  const safeEras = Array.isArray(contextData.eras) ? contextData.eras : [];
  const safeEvents = Array.isArray(contextData.events) ? contextData.events : [];

  const contextSummary = `
    Region: ${contextData.region} (${contextData.timeRange.start}-${contextData.timeRange.end})
    Eras: ${safeEras.map(e => e.title).join(', ')}
    Major Events Summary: ${safeEvents.slice(0, 20).map(e => `${e.year}: ${e.title}`).join('; ')}... (dataset contains ${safeEvents.length} events)
  `;

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are an expert historian assistant. You have access to a generated timeline for ${contextData.region}. Answer the user's questions specifically about this timeline and period. Be academic but accessible.`
    },
    history: [
        {
            role: 'user',
            parts: [{ text: `Here is the context of the timeline we are discussing:\n${JSON.stringify(contextSummary)}` }]
        },
        {
            role: 'model',
            parts: [{ text: "Understood. I am ready to discuss this historical timeline." }]
        },
        ...history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    ]
  });

  const response = await chat.sendMessage({ message: question });
  return response.text || "I could not generate a response.";
};
