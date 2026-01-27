export enum GenerationMode {
  QUICK = 'Quick',
  DEEP = 'Deep'
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
}

export interface Era {
  id: string;
  title: string;
  startYear: number;
  endYear: number;
  summary: string;
}

export interface TimelineData {
  id: string; // Unique ID for persistence
  createdAt: number; // Timestamp
  region: string;
  timeRange: { start: number; end: number };
  eras: Era[];
  events: HistoricalEvent[];
  narrative: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}
