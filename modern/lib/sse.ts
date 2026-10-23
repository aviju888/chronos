/** Standard SSE framing. The response wrapper alone owns terminal done. */
export type SSESend = (event: string, data: unknown) => void;

export function encodeFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseResponse(
  req: Request,
  run: (send: SSESend, signal: AbortSignal) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let open = true;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const close = () => {
    if (!open) return;
    open = false;
    req.signal.removeEventListener('abort', cancel);
    try { controller.close(); } catch { /* reader already cancelled */ }
  };
  const cancel = () => { abort.abort(); close(); };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      req.signal.addEventListener('abort', cancel, { once: true });
      if (req.signal.aborted) { cancel(); return; }
      const send: SSESend = (event, data) => {
        if (!open || abort.signal.aborted) return;
        try { controller.enqueue(encoder.encode(encodeFrame(event, data))); }
        catch { cancel(); }
      };
      // Do not make start() wait on the run: a reader must be able to cancel it.
      void (async () => {
        try { await run(send, abort.signal); }
        catch (err) {
          if (!abort.signal.aborted) send('error', { message: err instanceof Error ? err.message : String(err) });
        } finally {
          if (!abort.signal.aborted) send('done', {});
          close();
        }
      })();
    },
    cancel,
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
