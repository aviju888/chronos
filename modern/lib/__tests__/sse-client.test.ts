import { afterEach, describe, expect, it, vi } from 'vitest';
import { postSSE } from '../sse-client';
afterEach(() => vi.unstubAllGlobals());
function respond(text: string) { vi.stubGlobal('fetch', vi.fn(async () => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } }))); }
describe('stream completion', () => {
  it('rejects clean EOF without a terminal event', async () => {
    respond('event: narrative\ndata: {"delta":"partial"}\n\n');
    await expect(postSSE('/owned', {}, vi.fn())).rejects.toThrow(/before.*complet/i);
  });
  it.each(['done', 'error'])('preserves explicit %s terminal frames', async (event) => {
    respond(`event: ${event}\ndata: {}\n\n`); const emit = vi.fn();
    await postSSE('/owned', {}, emit); expect(emit).toHaveBeenCalledWith(event, {});
  });
});
