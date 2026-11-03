export interface Env {
  CONTROL_DB: D1Database;
  CONTROL_API_TOKEN: string;
}

type JobStatus =
  | 'queued'
  | 'withdrawing'
  | 'in_transit'
  | 'depositing'
  | 'done'
  | 'failed';

interface JobRow {
  id: string;
  route_id: string | null;
  from_server: string;
  to_server: string;
  status: JobStatus;
  manifest_json: string;
  moved_json: string | null;
  failure_reason: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function bearerAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  return match[1] === env.CONTROL_API_TOKEN;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function getRouteInventoryShared(
  db: D1Database,
  fromServer: string,
  toServer: string
): Promise<boolean> {
  const row = await db.prepare(
    `SELECT r.inventory_shared AS shared
     FROM routes r
     JOIN servers fs ON fs.id = r.from_server_id
     JOIN servers ts ON ts.id = r.to_server_id
     WHERE fs.name = ? AND ts.name = ?`
  ).bind(fromServer, toServer).first<{ shared: number }>();
  return row?.shared === 1;
}

function serializeJob(row: JobRow, inventoryShared: boolean) {
  return {
    id: row.id,
    from_server: row.from_server,
    to_server: row.to_server,
    status: row.status,
    manifest_json: row.manifest_json,
    manifest: JSON.parse(row.manifest_json),
    moved_json: row.moved_json,
    moved: row.moved_json ? JSON.parse(row.moved_json) : null,
    failure_reason: row.failure_reason,
    inventory_shared: inventoryShared,
    claimed_at: row.claimed_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handlePostJobs(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const fromServer = String(body.from_server ?? body.fromServer ?? '').trim();
  const toServer = String(body.to_server ?? body.toServer ?? '').trim();
  const manifest = body.manifest ?? body.manifest_json;
  if (!fromServer || !toServer || manifest == null) {
    return json({ error: 'from_server, to_server, and manifest are required' }, 400);
  }
  const manifestJson = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
  const id = newId('job');
  const now = new Date().toISOString();
  await env.CONTROL_DB.prepare(
    `INSERT INTO jobs (id, route_id, from_server, to_server, status, manifest_json, created_at, updated_at)
     VALUES (?, NULL, ?, ?, 'queued', ?, ?, ?)`
  ).bind(id, fromServer, toServer, manifestJson, now, now).run();
  const row = await env.CONTROL_DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();
  if (!row) return json({ error: 'failed to create job' }, 500);
  const inventoryShared = await getRouteInventoryShared(env.CONTROL_DB, fromServer, toServer);
  return json(serializeJob(row, inventoryShared), 201);
}

async function handleGetNextJob(env: Env): Promise<Response> {
  const row = await env.CONTROL_DB.prepare(
    `SELECT * FROM jobs
     WHERE status IN ('queued', 'withdrawing', 'in_transit', 'depositing')
     ORDER BY created_at ASC
     LIMIT 1`
  ).first<JobRow>();
  if (!row) return new Response(null, { status: 204 });
  const now = new Date().toISOString();
  await env.CONTROL_DB.prepare(
    `UPDATE jobs SET claimed_at = COALESCE(claimed_at, ?), updated_at = ? WHERE id = ?`
  ).bind(now, now, row.id).run();
  const inventoryShared = await getRouteInventoryShared(env.CONTROL_DB, row.from_server, row.to_server);
  return json(serializeJob(row, inventoryShared));
}

async function handlePatchJob(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as Record<string, unknown>;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.status != null) {
    updates.push('status = ?');
    values.push(String(body.status));
  }
  if (body.moved_json != null || body.moved != null) {
    updates.push('moved_json = ?');
    const moved = body.moved_json ?? body.moved;
    values.push(typeof moved === 'string' ? moved : JSON.stringify(moved));
  }
  if (body.failure_reason != null) {
    updates.push('failure_reason = ?');
    values.push(String(body.failure_reason));
  }
  if (updates.length === 0) return json({ error: 'no fields to update' }, 400);
  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  await env.CONTROL_DB.prepare(
    `UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();
  const row = await env.CONTROL_DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();
  if (!row) return json({ error: 'not found' }, 404);
  const inventoryShared = await getRouteInventoryShared(env.CONTROL_DB, row.from_server, row.to_server);
  return json(serializeJob(row, inventoryShared));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.CONTROL_API_TOKEN?.trim()) {
      return json({ error: 'CONTROL_API_TOKEN is not configured' }, 503);
    }
    if (!bearerAuthorized(request, env)) return unauthorized();

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/jobs') {
      return handlePostJobs(request, env);
    }
    if (request.method === 'GET' && url.pathname === '/jobs/next') {
      return handleGetNextJob(env);
    }
    const patchMatch = /^\/jobs\/([^/]+)$/.exec(url.pathname);
    if (request.method === 'PATCH' && patchMatch) {
      return handlePatchJob(decodeURIComponent(patchMatch[1]), request, env);
    }
    return json({ error: 'not found' }, 404);
  }
} satisfies ExportedHandler<Env>;
