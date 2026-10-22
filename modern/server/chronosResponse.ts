import { sseResponse } from '../lib/sse.js';
import { runChronos } from '../lib/chronos/pipeline.js';
import { sanitizeString } from '../lib/chronos/query.js';

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
  const replay = body.replay === true;
  return sseResponse(req, (send, signal) => runChronos({ query, mode, replay }, send, signal));
}
