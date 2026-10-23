// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChronosResponse } from '../chronosResponse';
import { runChronos } from '../../lib/chronos/pipeline';
import { encodeFrame } from '../../lib/sse';
vi.mock('../../lib/chronos/pipeline', () => ({ runChronos: vi.fn() }));
const pipeline = vi.mocked(runChronos);
const request = (body: unknown, signal?: AbortSignal) => new Request('http://localhost/api/chronos/stream', {
  method: 'POST', body: JSON.stringify(body), signal,
});
beforeEach(() => { pipeline.mockReset().mockResolvedValue(undefined); });
describe('Chronos response', () => {
  it.each(['GET', 'PUT', 'OPTIONS', 'DELETE'])('allows POST only (%s)', async method => {
    const res = await createChronosResponse(new Request('http://localhost/api/chronos/stream', { method }));
    expect(res.status).toBe(405); expect(res.headers.get('allow')).toBe('POST'); expect(pipeline).not.toHaveBeenCalled();
  });
  it.each([{}, {query: ''}, {query: '   '}, {query: 123}, null, [], 'Silk Road', true])('rejects missing query/non-object JSON (%j)', async body => {
    expect((await createChronosResponse(request(body))).status).toBe(400); expect(pipeline).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => {
    const res = await createChronosResponse(new Request('http://localhost/api/chronos/stream', {method:'POST', body:'{'}));
    expect(res.status).toBe(400); expect(pipeline).not.toHaveBeenCalled();
  });
  it('sanitizes to 200 characters and defaults to quick', async () => {
    await (await createChronosResponse(request({query: '  ' + 'x'.repeat(230) + '  ', mode:'invalid'}))).text();
    expect(pipeline.mock.calls[0][0]).toEqual({query:'x'.repeat(200), mode:'quick', replay:false});
  });
  it.each([true, false, 'true', 1, {}, null])('uses strict boolean replay (%j)', async replay => {
    await (await createChronosResponse(request({query:'Silk Road', mode:'deep', replay}))).text();
    expect(pipeline.mock.calls[0][0]).toEqual({query:'Silk Road', mode:'deep', replay:replay === true});
  });
  it('preserves ordered frame names/data and owns terminal done', async () => {
    const names = ['intent','task','trace','event','merge','eras','narrative','notice'];
    pipeline.mockImplementation(async (_input, send) => { for(const name of names) send(name, {value:name}); });
    const res = await createChronosResponse(request({query:'Silk Road'}));
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(await res.text()).toBe(names.map(name=>encodeFrame(name,{value:name})).join('')+encodeFrame('done',{}));
  });
  it('emits error then done on pipeline failure', async () => {
    pipeline.mockRejectedValue(new Error('Groq 429: rate limited'));
    expect(await (await createChronosResponse(request({query:'Silk Road'}))).text()).toBe(encodeFrame('error',{message:'Groq 429: rate limited'})+encodeFrame('done',{}));
  });
  it('passes request abort into the pipeline and suppresses success after cancellation', async () => {
    const abort = new AbortController();
    pipeline.mockImplementation(async (_input, send, signal) => {
      send('task',{status:'running'});
      await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
      send('event',{title:'misleading late result'});
    });
    const response=await createChronosResponse(request({query:'Silk Road'},abort.signal));
    abort.abort();
    expect(pipeline.mock.calls[0][2].aborted).toBe(true);
    const text=await response.text(); expect(text).not.toContain('misleading'); expect(text).not.toContain('event: done');
  });
  it('cancelling the response reader aborts the pipeline', async () => {
    pipeline.mockImplementation(async (_input, send, signal) => {
      send('task',{}); await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
    });
    const response=await createChronosResponse(request({query:'Silk Road'}));
    const reader=response.body!.getReader(); await reader.read(); await reader.cancel();
    expect(pipeline.mock.calls[0][2].aborted).toBe(true);
  });
  it('does not start a pre-aborted request', async () => {
    const abort=new AbortController(); abort.abort();
    expect(await (await createChronosResponse(request({query:'Silk Road'},abort.signal))).text()).toBe('');
    expect(pipeline).not.toHaveBeenCalled();
  });
});

it('passes selected dates as structured input', async () => {
  await (await createChronosResponse(request({query:'Rome',range:{start:-27,end:476}}))).text();
  expect(pipeline.mock.calls[0][0]).toEqual({query:'Rome',mode:'quick',replay:false,range:{start:-27,end:476}});
});
it.each([{start:0,end:476},{start:476,end:-27},{start:1},null,'1-2'])('rejects invalid range before starting research (%j)', async range => {
  expect((await createChronosResponse(request({query:'Rome',range}))).status).toBe(400);
  expect(pipeline).not.toHaveBeenCalled();
});
it('does not silently ignore selected dates for a recorded run', async () => {
  expect((await createChronosResponse(request({query:'Rome',range:{start:1,end:10},replay:true}))).status).toBe(400);
  expect(pipeline).not.toHaveBeenCalled();
});
