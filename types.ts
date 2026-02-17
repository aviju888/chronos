export enum GenerationMode {
  QUICK = 'Quick',
  DEEP = 'Deep'
}

export enum QueryType {
  CITY = 'city',           // Specific city/town
  REGION = 'region',       // State, province, geographic area
  COUNTRY = 'country',     // Nation/country level
  TOPIC = 'topic',         // Thematic (e.g., "Silk Road", "Industrial Revolution")
  ERA = 'era'              // Time period focus (e.g., "Renaissance", "Bronze Age")
}

export enum RelevanceType {
  DIRECT = 'direct',       // Happened at this exact location/directly about this topic
  REGIONAL = 'regional',   // Happened in the broader region/closely related
  CONTEXTUAL = 'contextual' // Global/national events that provide historical context
}

export enum EventCategory {
  POLITICS = 'Politics',
  WAR = 'War',
  CULTURE = 'Culture',
  ECONOMY = 'Economy',
  RELIGION = 'Religion',
  SCIENCE = 'Science',
  OTHER = 'Other'
}

export interface Citation {
  source: string;
  url?: string;
}

export interface DisputeClaim {
  summary: string;
  citations: Citation[];
}

export interface HistoricalEvent {
  id: string;
  title: string;
  year: number;
  category: EventCategory;
  summary: string;
  citations: Citation[];
  location?: { lat: number; lng: number; name: string };
  isDisputed: boolean;
  disputeClaims?: DisputeClaim[];
  confidenceScore: 'High' | 'Medium' | 'Low'; // For UI indication
  imageQuery?: string; // Optimized search term for finding an image
  isOutOfRange?: boolean; // Event year is outside the requested time range

  // Wikipedia enrichment fields
  wikipediaTitle?: string;       // Source Wikipedia article title
  wikipediaUrl?: string;         // Direct link to Wikipedia article
  exactDate?: string;            // Full date like "July 4, 1776"
  keyFigures?: string[];         // Key people involved
  parentEventId?: string;        // Links sub-events to anchor events
  isSubEvent?: boolean;          // True for events discovered from Wikipedia links
  sourceType?: 'llm' | 'wikipedia' | 'search';  // Origin of the event data
  relevanceType?: RelevanceType;  // How directly relevant to the user's query
}

export interface Era {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  summary: string;
}

export interface QueryAnalysis {
  queryType: QueryType;
  specificLocation?: string;  // The specific place if city/region
  broadContext?: string;      // Broader geographic context
  topics?: string[];          // Detected themes/topics
}

export interface TimelineData {
  id: string; // Unique ID for persistence
  createdAt: number; // Timestamp
  region: string;
  timeRange: { start: number; end: number };
  eras: Era[];
  events: HistoricalEvent[];
  narrative: string;
  queryAnalysis?: QueryAnalysis;  // Analysis of user's search intent
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
