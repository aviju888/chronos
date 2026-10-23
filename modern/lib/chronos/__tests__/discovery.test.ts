import { expect, it } from 'vitest';
import { rangeError, relatedTopics, SURPRISE_TOPICS, READY_SURPRISE_TOPICS, createSurprisePicker, surpriseQuery } from '../discovery';
import { parseQuery } from '../query';
import { progressLabel } from '../progress';
import { initialState } from '../../../components/chronos/useChronos';

it.each([null, {}, {start:0,end:20}, {start:20,end:10}, {start:-10001,end:1}, {start:1,end:3000}, {start:'1',end:2}, {start:1.5,end:2}])('rejects invalid explicit dates %j', range => expect(rangeError(range,2026)).toBeTruthy());
it('accepts BCE/CE, same-year, and current-year ranges', () => {
  for(const range of [{start:-27,end:476},{start:1969,end:1969},{start:2000,end:2026}]) expect(rangeError(range,2026)).toBeNull();
});
it('derives progress only from received evidence', () => {
  const state={...initialState,status:'running' as const,startedAt:1};
  expect(progressLabel(state)).toBe('Finding your topic');
  const resolved={...state,intent:{topic:'Rome'} as any};
  expect(progressLabel(resolved)).toBe('Looking for events');
  expect(progressLabel({...resolved,order:['a']})).toBe('Building your timeline');
  expect(progressLabel({...resolved,narrative:'Story'})).toBe('Writing the story');
  expect(progressLabel({...resolved,status:'done',stopped:true})).toBe('Stopped early');
  expect(progressLabel({...resolved,status:'error'})).toBe('Investigation interrupted');
});
it('suggests real event topics and places without duplicating the topic', () => {
  expect(relatedTopics('Rome',[{title:'Rome',weight:1,location:{name:'Rome'}},{title:'Actium',weight:5,location:{name:'Greece'}},{title:'Actium',weight:2}] as any)).toEqual(['Actium','Greece']);
});

it('keeps the curated catalog unique, valid and parseable with explicit dates', () => {
  expect(SURPRISE_TOPICS).toHaveLength(500);
  expect(new Set(SURPRISE_TOPICS.map(t => t.id)).size).toBe(500);
  expect(new Set(SURPRISE_TOPICS.map(t => t.topic.toLowerCase())).size).toBe(500);
  for (const topic of SURPRISE_TOPICS) {
    expect(rangeError(topic.range, 2026), topic.topic).toBeNull();
    expect(parseQuery(surpriseQuery(topic)).range, topic.topic).toEqual(topic.range);
    expect(surpriseQuery(topic).length).toBeLessThanOrEqual(200);
  }
});

it('visits every pick before repeating, including across deck boundaries', () => {
  const pick = createSurprisePicker(SURPRISE_TOPICS, () => 0.5);
  const seen = Array.from({length: 500}, () => pick()!.id);
  expect(new Set(seen).size).toBe(500);
  expect(pick()!.id).not.toBe(seen.at(-1));
  expect(createSurprisePicker([])()).toBeUndefined();
});

it('only offers evaluated topics in the production Surprise me deck', () => {
  expect(READY_SURPRISE_TOPICS.length).toBeGreaterThan(0);
  const pick = createSurprisePicker();
  const allowed = new Set(READY_SURPRISE_TOPICS.map(t => t.id));
  for (let i = 0; i < READY_SURPRISE_TOPICS.length + 1; i++) expect(allowed.has(pick()!.id)).toBe(true);
});
