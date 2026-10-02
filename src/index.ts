import { checkMinecraftServer } from './mc/checker.js';
import { getServerState, updateServerState } from './bot/state.js';
import type { ServerState } from './bot/state.js';

interface Env {
  MY_BOT_KV: KVNamespace;
  MC_SERVER_HOST: string;
  MC_SERVER_PORT: string;
  CHECK_TIMEOUT_MS?: string;
  DISCORD_WEBHOOK_URL?: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function notifyDiscord(
  webhookUrl: string,
  host: string,
  state: ServerState
): Promise<void> {
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error('DISCORD_WEBHOOK_URL must be a valid URL');
  }
  if (url.protocol !== 'https:') throw new Error('DISCORD_WEBHOOK_URL must use HTTPS');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: `Minecraft サーバーが起動しました: ${host} (${state.checkedAt})`
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Discord webhook returned HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function runHealthCheck(env: Env): Promise<ServerState> {
  const port = readPositiveInteger(env.MC_SERVER_PORT, 25565, 'MC_SERVER_PORT');
  const timeoutMs = readPositiveInteger(env.CHECK_TIMEOUT_MS, 2_000, 'CHECK_TIMEOUT_MS');
  const check = await checkMinecraftServer(env.MC_SERVER_HOST, port, timeoutMs);
  const { previous, current } = await updateServerState(env.MY_BOT_KV, check);

  console.info(JSON.stringify({
    event: 'minecraft.health_check',
    status: current.status,
    checkedAt: current.checkedAt,
    responseTimeMs: current.responseTimeMs,
    error: current.error
  }));

  if (current.status === 'OFFLINE') {
    console.info('[minecraft] Server is offline; skipping bot and AI work');
    return current;
  }

  if (previous?.status === 'OFFLINE' && env.DISCORD_WEBHOOK_URL) {
    try {
      await notifyDiscord(env.DISCORD_WEBHOOK_URL, env.MC_SERVER_HOST, current);
    } catch (error) {
      console.error('[discord] Failed to send server-online notification:', error);
    }
  }

  return current;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/status') return jsonResponse({ error: 'Not found' }, 404);
    if (request.method !== 'GET') {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    try {
      const state = await getServerState(env.MY_BOT_KV);
      return jsonResponse(state ?? {
        status: 'UNKNOWN',
        checkedAt: null,
        lastSuccessAt: null,
        message: 'No health check has completed yet'
      });
    } catch (error) {
      console.error('[status] Failed to read Minecraft server state:', error);
      return jsonResponse({ error: 'Could not read server status' }, 500);
    }
  },

  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(runHealthCheck(env));
  }
};
