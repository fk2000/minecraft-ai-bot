import { createServer, type Server } from 'node:http';

export interface HealthStatus {
  minecraft: boolean;
  discord: boolean;
}

/**
 * Minimal HTTP endpoint for hosting platforms (e.g. Render free web service).
 * GET /healthz -> 200 with connection flags only. Never include secrets.
 * Starts only when PORT is set, so local/Railway behavior is unchanged.
 */
export function startHealthServer(getStatus: () => HealthStatus, port = process.env.PORT): Server | undefined {
  const parsed = Number(port);
  if (!port || !Number.isInteger(parsed) || parsed <= 0) return undefined;
  const startedAt = Date.now();
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (path === '/healthz' || path === '/') {
        const status = getStatus();
        const body = JSON.stringify({
          ok: true,
          minecraft: status.minecraft ? 'connected' : 'disconnected',
          discord: status.discord ? 'connected' : 'disconnected',
          uptimeSec: Math.floor((Date.now() - startedAt) / 1000)
        });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  server.listen(parsed, '0.0.0.0', () => console.log(`[health] listening on :${parsed}`));
  server.on('error', (error) => console.error('[health] server error:', error));
  return server;
}
