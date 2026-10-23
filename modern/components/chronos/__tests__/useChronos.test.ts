import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reducer, useChronos } from '../useChronos';
import { postSSE } from '../../../lib/sse-client';
vi.mock('../../../lib/sse-client', () => ({ postSSE: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const start = { type: 'start', query: 'first', mode: 'quick', replay: true } as const;
describe('run isolation', () => {
  it('ignores frames after a stopped reducer', () => {
    const stopped = reducer(reducer(initialState, start), { type: 'stop', at: 1 });
    expect(reducer(stopped, { type: 'frame', event: 'narrative', data: { delta: 'late' }, at: 2 })).toBe(stopped);
  });
  it('stops requests and ignores later frames', async () => {
    let emit: Parameters<typeof postSSE>[2]; let signal: AbortSignal;
    vi.mocked(postSSE).mockImplementation(async (_url, _body, cb, s) => {
      emit = cb; signal = s!; await new Promise(() => {});
    });
    const { result } = renderHook(() => useChronos());
    act(() => { void result.current.run('first', 'quick'); });
    act(() => result.current.stop());
    act(() => emit('narrative', { delta: 'late' }));
    expect(signal!.aborted).toBe(true);
    expect(result.current.state.stopped).toBe(true);
    expect(result.current.state.narrative).toBe('');
  });
  it('ignores earlier frames and failures after replacement', async () => {
    const calls: { emit: Parameters<typeof postSSE>[2]; reject: (e: Error) => void }[] = [];
    vi.mocked(postSSE).mockImplementation((_url, _body, emit) => new Promise((_resolve, reject) => { calls.push({ emit, reject }); }));
    const { result } = renderHook(() => useChronos());
    act(() => { void result.current.run('first', 'quick'); });
    act(() => { void result.current.run('second', 'deep'); });
    await act(async () => { calls[0].emit('narrative', { delta: 'stale' }); calls[0].reject(new Error('old')); });
    act(() => calls[1].emit('narrative', { delta: 'current' }));
    expect(result.current.state.query).toBe('second');
    expect(result.current.state.narrative).toBe('current');
    expect(result.current.state.status).toBe('running');
  });
});


describe('narrative provenance and persistent notices', () => {
  it('keeps source coverage warnings when narrative fallback arrives and the run finishes', () => {
    let state = reducer(initialState, start);
    for (const notice of [{kind: 'partial', text: 'Wikipedia could not finish collecting.'}, {kind: 'fallback', text: 'Narrative model failed.'}]) {
      state = reducer(state, {type: 'frame', event: 'notice', data: notice, at: 1});
    }
    state = reducer(state, {type: 'frame', event: 'done', data: {}, at: 2});
    expect(state.notices.map(n => n.kind)).toEqual(['partial', 'fallback']);
    expect(reducer(state, {type: 'start', query: 'next', mode: 'quick', replay: false}).notices).toEqual([]);
  });
  it('retains compatibility with recorded narrative deltas and replaces failed model prose', () => {
    let state = reducer(initialState, start);
    state = reducer(state, {type: 'frame', event: 'narrative', data: {delta: 'Recorded text. '}, at: 1});
    expect(state.narrativeSource).toBe('composed');
    state = reducer(state, {type: 'frame', event: 'narrative', data: {delta: 'Model prefix.', replace: true, source: 'model'}, at: 2});
    state = reducer(state, {type: 'frame', event: 'narrative', data: {delta: '', replace: true, source: 'composed'}, at: 3});
    state = reducer(state, {type: 'frame', event: 'narrative', data: {delta: 'Replacement.'}, at: 4});
    expect(state.narrative).toBe('Replacement.');
    expect(state.narrativeSource).toBe('composed');
  });
});

it('restores saved evidence without a request and ignores frames from the interrupted run', () => {
  let emit: Parameters<typeof postSSE>[2]; let signal: AbortSignal;
  vi.mocked(postSSE).mockImplementation(async (_url,_body,cb,s) => {emit=cb;signal=s!;await new Promise(()=>{});});
  const {result}=renderHook(()=>useChronos());
  act(()=>{void result.current.run('live','quick');});
  act(()=>result.current.restore({...initialState,status:'done',query:'archive',narrative:'saved story',stopped:true}));
  act(()=>emit('narrative',{delta:'late live fragment'}));
  expect(signal!.aborted).toBe(true); expect(postSSE).toHaveBeenCalledTimes(1);
  expect(result.current.state.narrative).toBe('saved story'); expect(result.current.state.stopped).toBe(true);
});
