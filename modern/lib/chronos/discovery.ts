import type { ChronosEvent, YearRange } from './types.js';
import catalog from './surprise-topics.json' with { type: 'json' };
import readyIds from './surprise-ready.json' with { type: 'json' };
import { formatRange } from './time.js';
export { rangeError } from './dateRange.js';

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

/** Only offer validated named topics actually present in this investigation's evidence.
 * A sentence is not a searchable topic. If there is no supported match, omit the section.
 */
export function relatedTopics(topic: string, events: ChronosEvent[]): SurpriseTopic[] {
  const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const current = normalize(topic);
  const names = new Set(events.flatMap(e => [e.wikipediaTitle, e.location?.name])
    .filter((name): name is string => Boolean(name?.trim())).map(normalize));
  return READY_SURPRISE_TOPICS.filter(candidate => {
    const name = normalize(candidate.topic);
    return name !== current && names.has(name);
  }).slice(0, 4);
}
