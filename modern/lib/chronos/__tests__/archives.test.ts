import { describe, expect, it, vi } from 'vitest';
import { ARCHIVE_KEY, exportText, readArchives, removeArchive, saveArchive, snapshot } from '../archives';
import { initialState, reducer } from '../../../components/chronos/useChronos';
import fixture from '../fixtures/roman-empire.json';

function example() {
  let state = reducer(initialState, {type: 'start', query: fixture.query, mode: 'quick', replay: true});
  for (const frame of fixture.frames) state = reducer(state, {type:'frame', event: frame.event, data:frame.data, at:1});
  return snapshot(reducer(state, {type:'finish', at:2}));
}
function memory() {
  const data = new Map<string, string>([['chronos_archives', 'classic'], ['chronos_chat_owned', 'chat']]);
  return {data, getItem: (k:string) => data.get(k) ?? null, setItem: (k:string,v:string) => {data.set(k,v);}};
}
describe('modern archives', () => {
  it('round trips evidence and citations without touching Classic; repeated saves replace the same run', () => {
    const store=memory(); const archive=example();
    expect(saveArchive(archive,store).error).toBeNull();
    saveArchive(archive,store);
    expect(readArchives(store).items).toEqual([archive]);
    expect(store.data.get('chronos_archives')).toBe('classic');
    expect(store.data.get('chronos_chat_owned')).toBe('chat');
    expect(removeArchive(archive.id,store).items).toEqual([]);
    expect(store.data.get('chronos_archives')).toBe('classic');
  });
  it('retains existing archives if a write fails', () => {
    const store=memory(); saveArchive(example(),store); const before=store.getItem(ARCHIVE_KEY);
    store.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
    expect(saveArchive({...example(),id:'new'},store).error).toMatch(/could not be saved/);
    expect(store.getItem(ARCHIVE_KEY)).toBe(before);
  });
  it.each(['not json','{}','[{"version":99}]'])('never overwrites unreadable storage: %s', raw => {
    const store=memory(); store.setItem(ARCHIVE_KEY,raw);
    expect(readArchives(store).error).toBeTruthy();
    saveArchive(example(),store); removeArchive('anything',store);
    expect(store.getItem(ARCHIVE_KEY)).toBe(raw);
  });
  it('handles unavailable storage', () => {
    expect(readArchives({getItem:()=>{throw new Error('denied');},setItem:vi.fn()}).error).toBeTruthy();
  });
  it('retains readable entries when another entry is corrupt', () => {
    const store=memory(); const archive=example(); store.setItem(ARCHIVE_KEY,JSON.stringify([archive,{version:1,state:{}}]));
    expect(readArchives(store).items).toEqual([archive]); expect(readArchives(store).error).toBeTruthy();
  });
  it('exports a readable story with numbered evidence and source URLs, including partial notices', () => {
    const archive=example(); const event=archive.state.events[archive.state.order[0]];
    archive.state.narrative=`A claim [[cite:${encodeURIComponent(event.mergedFrom[0] ?? event.id)}]].`;
    archive.state.stopped=true; archive.state.notices=[{kind:'partial',text:'Wikipedia could not finish.'}];
    const text=exportText(archive);
    expect(text).toContain('A claim [1].'); expect(text).not.toContain('[[cite:');
    expect(text).toContain('Stopped early'); expect(text).toContain('Wikipedia could not finish.');
    expect(text).toContain(event.citations.find(c=>c.url)!.url);
  });
});
