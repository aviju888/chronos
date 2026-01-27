import { TimelineData, GenerationMode } from "../types";

// API endpoint - uses relative URL for same-origin requests on Vercel
const API_URL = '/api/generate';

// For local development, you can override this
const getApiUrl = () => {
  // In development, Vite proxy will handle /api routes
  return API_URL;
};

export interface ProgressUpdate {
  message: string;
  percent: number;
  timeLeft: number;
}

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

export const getSearchSuggestions = async (query: string): Promise<string[]> => {
  if (query.length < 3) return [];

  try {
    const result = await callApi<{ suggestions: string[] }>({
      action: 'suggestions',
      query,
    });
    return result.suggestions || [];
  } catch (e) {
    console.error("Suggestion error", e);
    return [];
  }
};

export const getRegionsFromCoordinates = async (lat: number, lng: number): Promise<string[]> => {
  try {
    const result = await callApi<{ suggestions: string[] }>({
      action: 'regions',
      lat,
      lng,
    });
    return result.suggestions || [];
  } catch (e) {
    console.error("Coordinate reverse lookup error", e);
    return [];
  }
};

export const getSmartTimeRange = async (region: string): Promise<{ start: number; end: number } | null> => {
  try {
    const result = await callApi<{ timeRange: { start: number; end: number } | null }>({
      action: 'timeRange',
      region,
    });
    return result.timeRange;
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
  const startTime = Date.now();

  // Simulate progress updates since we can't stream from serverless functions easily
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const estimatedTotal = mode === GenerationMode.DEEP ? 60 : 30;
    const percent = Math.min(90, (elapsed / estimatedTotal) * 100);
    const timeLeft = Math.max(0, Math.round(estimatedTotal - elapsed));

    let message = "Initializing historical context analysis...";
    if (percent > 10) message = "Identifying historical eras and periodization...";
    if (percent > 30) message = `Retrieving records (Scanning ${mode === GenerationMode.DEEP ? 'deep' : 'quick'} archives)...`;
    if (percent > 60) message = "Cataloging significant events...";
    if (percent > 80) message = "Synthesizing historical narrative...";

    onProgress({ message, percent, timeLeft });
  }, 500);

  try {
    const result = await callApi<{ timeline: TimelineData }>({
      action: 'timeline',
      region,
      startYear,
      endYear,
      mode: mode === GenerationMode.DEEP ? 'deep' : 'quick',
    });

    clearInterval(progressInterval);
    onProgress({ message: "Finalizing archives...", percent: 100, timeLeft: 0 });

    return result.timeline;
  } catch (error) {
    clearInterval(progressInterval);
    throw error;
  }
};

export const askFollowUp = async (
  contextData: TimelineData,
  history: { role: string; text: string }[],
  question: string
): Promise<string> => {
  const safeEras = Array.isArray(contextData.eras) ? contextData.eras : [];
  const safeEvents = Array.isArray(contextData.events) ? contextData.events : [];

  const contextSummary = `
    Region: ${contextData.region} (${contextData.timeRange.start}-${contextData.timeRange.end})
    Eras: ${safeEras.map(e => e.title).join(', ')}
    Major Events Summary: ${safeEvents.slice(0, 20).map(e => `${e.year}: ${e.title}`).join('; ')}... (dataset contains ${safeEvents.length} events)
  `;

  try {
    const result = await callApi<{ answer: string }>({
      action: 'followUp',
      contextSummary,
      history,
      question,
    });
    return result.answer || "I could not generate a response.";
  } catch (e) {
    console.error("Follow-up error", e);
    return "I could not generate a response.";
  }
};
