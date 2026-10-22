// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

describe('Classic development entry', () => {
  let server: ViteDevServer;
  let origin: string;

  beforeAll(async () => {
    server = await createServer({
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('Missing preview address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => { await server?.close(); });

  it('canonicalizes bare /classic and preserves its query before serving a document', async () => {
    const response = await fetch(`${origin}/classic?from=legacy%20link`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/classic/?from=legacy%20link');
  });
});
