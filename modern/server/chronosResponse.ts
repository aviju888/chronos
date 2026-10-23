import { sseResponse } from '../lib/sse.js';
import { runChronos } from '../lib/chronos/pipeline.js';
import { sanitizeString } from '../lib/chronos/query.js';
import { rangeError } from '../lib/chronos/dateRange.js';
import type { YearRange } from '../lib/chronos/types.js';

/** Standard Request/Response boundary, shared by Vercel and focused tests. */
export async function createChronosResponse(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }
  const raw: unknown = await req.json().catch(() => null);
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const query = sanitizeString(body.query, 200);
  if (!query) {
    return Response.json({ error: 'Send a query, like “Silk Road” or “Roman Empire 27 BCE - 476 CE”.' }, { status: 400 });
  }
  const mode = body.mode === 'deep' ? 'deep' : 'quick';
  if (body.replay === true) {
    return Response.json({ error: 'Recorded runs are only available in local tests. Start a live investigation instead.' }, { status: 400 });
  }
  if (body.range !== undefined) {
    const error = rangeError(body.range);
    if (error) return Response.json({ error }, { status: 400 });
  }
  const range = body.range as YearRange | undefined;
  return sseResponse(req, (send, signal) => runChronos({ query, mode, ...(range ? { range } : {}) }, send, signal, { live: true }));
}
