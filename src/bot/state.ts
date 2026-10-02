import type { MinecraftServerCheck } from '../mc/checker.js';

export const SERVER_STATE_KEY = 'minecraft:server-status';

export interface ServerState {
  status: 'ONLINE' | 'OFFLINE';
  checkedAt: string;
  lastSuccessAt: string | null;
  responseTimeMs: number;
  version?: string;
  onlinePlayers?: number;
  maxPlayers?: number;
  motd?: string;
  error?: string;
}

export interface StateUpdate {
  previous: ServerState | null;
  current: ServerState;
}

function isServerState(value: unknown): value is ServerState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (state.status === 'ONLINE' || state.status === 'OFFLINE') &&
    typeof state.checkedAt === 'string' &&
    (state.lastSuccessAt === null || typeof state.lastSuccessAt === 'string') &&
    typeof state.responseTimeMs === 'number';
}

export async function getServerState(kv: KVNamespace): Promise<ServerState | null> {
  const state = await kv.get<unknown>(SERVER_STATE_KEY, 'json');
  if (state === null) return null;
  if (!isServerState(state)) throw new Error('Stored Minecraft server state has an invalid format');
  return state;
}

export async function updateServerState(
  kv: KVNamespace,
  check: MinecraftServerCheck
): Promise<StateUpdate> {
  const previous = await getServerState(kv);
  const current: ServerState = {
    status: check.status,
    checkedAt: check.checkedAt,
    lastSuccessAt: check.status === 'ONLINE' ? check.checkedAt : previous?.lastSuccessAt ?? null,
    responseTimeMs: check.responseTimeMs,
    ...(check.version !== undefined ? { version: check.version } : {}),
    ...(check.onlinePlayers !== undefined ? { onlinePlayers: check.onlinePlayers } : {}),
    ...(check.maxPlayers !== undefined ? { maxPlayers: check.maxPlayers } : {}),
    ...(check.motd !== undefined ? { motd: check.motd } : {}),
    ...(check.error !== undefined ? { error: check.error } : {})
  };
  await kv.put(SERVER_STATE_KEY, JSON.stringify(current));
  return { previous, current };
}
