import type { ChronosEvent, YearRange } from './types';

export function rangeError(value: unknown, now = new Date().getFullYear()): string | null {
  if (!value || typeof value !== 'object') return 'Enter both a start and end year.';
  const { start, end } = value as YearRange;
  if (![start, end].every(y => Number.isInteger(y) && y !== 0 && y >= -10000 && y <= now)) {
    return `Use whole years from 10000 BCE to ${now} CE. There is no year 0.`;
  }
  return start > end ? 'The start year must come before the end year.' : null;
}

export const SURPRISE_TOPICS = [
  'The history of jazz in New Orleans', 'Kyoto during the Edo period',
  'The space race 1955 - 1975', 'The Islamic Golden Age 750 - 1258',
  'Renaissance Florence 1300 - 1600', 'The history of the printing press',
  'The Inca Empire', 'The history of ocean navigation',
];

/** Suggestions come from the investigation itself, without another model request. */
export function relatedTopics(topic: string, events: ChronosEvent[]): string[] {
  const candidates = [...events].sort((a, b) => b.weight - a.weight);
  return [...new Set(candidates.flatMap(e => [e.wikipediaTitle ?? e.title, e.location?.name]).filter(
    (name): name is string => Boolean(name?.trim()) && name!.toLowerCase() !== topic.toLowerCase(),
  ))].slice(0, 4);
}
