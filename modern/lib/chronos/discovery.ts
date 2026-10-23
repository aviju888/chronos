import type { ChronosEvent, YearRange } from './types';
import catalog from './surprise-topics.json';
import readyIds from './surprise-ready.json';
import { formatRange } from './time';

export function rangeError(value: unknown, now = new Date().getFullYear()): string | null {
  if (!value || typeof value !== 'object') return 'Enter both a start and end year.';
  const { start, end } = value as YearRange;
  if (![start, end].every(y => Number.isInteger(y) && y !== 0 && y >= -10000 && y <= now)) {
    return `Use whole years from 10000 BCE to ${now} CE. There is no year 0.`;
  }
  return start > end ? 'The start year must come before the end year.' : null;
}

export type SurpriseTopic = { id: string; topic: string; category: string; range: YearRange };
export const SURPRISE_TOPICS: SurpriseTopic[] = catalog;
const ready = new Set(readyIds);
export const READY_SURPRISE_TOPICS = SURPRISE_TOPICS.filter(topic => ready.has(topic.id));
export const surpriseQuery = (topic: SurpriseTopic) => `${topic.topic} ${formatRange(topic.range.start, topic.range.end, ' – ')}`;

/** A shuffled deck prevents repeated picks until the reader has seen the whole collection. */
export function createSurprisePicker(topics = READY_SURPRISE_TOPICS, random = Math.random) {
  let remaining: SurpriseTopic[] = [];
  let previous: string | undefined;
  return () => {
    if (!remaining.length) {
      remaining = [...topics];
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining.at(-1)?.id === previous) {
        [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1], remaining[0]];
      }
    }
    const next = remaining.pop();
    previous = next?.id;
    return next;
  };
}

/** Suggestions come from the investigation itself, without another model request. */
export function relatedTopics(topic: string, events: ChronosEvent[]): string[] {
  const candidates = [...events].sort((a, b) => b.weight - a.weight);
  return [...new Set(candidates.flatMap(e => [e.wikipediaTitle ?? e.title, e.location?.name]).filter(
    (name): name is string => Boolean(name?.trim()) && name!.toLowerCase() !== topic.toLowerCase(),
  ))].slice(0, 4);
}
