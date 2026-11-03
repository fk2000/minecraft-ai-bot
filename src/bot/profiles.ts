export type MinecraftAuth = 'offline' | 'microsoft' | 'mojang';

export interface McProfile {
  name: string;
  host: string;
  port: number;
  username: string;
  auth: MinecraftAuth;
  version?: string;
  inventoryShared: boolean;
}

export interface LoadedProfiles {
  profiles: Map<string, McProfile>;
  defaultProfileName: string;
}

function readPort(value: unknown, field: string): number {
  const port = typeof value === 'number' ? value : Number(value ?? '25565');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${field} must be an integer from 1 to 65535`);
  }
  return port;
}

function readAuth(value: unknown): MinecraftAuth {
  const auth = typeof value === 'string' ? value.trim() : 'offline';
  if (auth !== 'offline' && auth !== 'microsoft' && auth !== 'mojang') {
    throw new Error('profile auth must be one of: offline, microsoft, mojang');
  }
  return auth;
}

function normalizeProfile(raw: unknown, index: number): McProfile {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`MC_PROFILES_JSON[${index}] must be an object`);
  }
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) throw new Error(`MC_PROFILES_JSON[${index}].name is required`);
  const host = typeof record.host === 'string' ? record.host.trim() : '';
  if (!host) throw new Error(`profile "${name}" host is required`);
  return {
    name,
    host,
    port: readPort(record.port, `profile "${name}" port`),
    username: typeof record.username === 'string' && record.username.trim()
      ? record.username.trim()
      : 'JevAIBot',
    auth: readAuth(record.auth),
    version: typeof record.version === 'string' && record.version.trim()
      ? record.version.trim()
      : undefined,
    inventoryShared: record.inventoryShared === true
  };
}

function legacyDefaultProfile(env: NodeJS.ProcessEnv): McProfile {
  const host = (env.MC_SERVER_HOST ?? env.MC_HOST ?? '').trim();
  if (!host) {
    throw new Error('MC_SERVER_HOST (or legacy MC_HOST) is required when MC_PROFILES_JSON is unset');
  }
  const portRaw = env.MC_SERVER_PORT ?? env.MC_PORT;
  return {
    name: 'default',
    host,
    port: readPort(portRaw, 'MC_SERVER_PORT'),
    username: env.MC_USERNAME?.trim() || 'JevAIBot',
    auth: readAuth(env.MC_AUTH),
    version: env.MC_VERSION?.trim() || undefined,
    inventoryShared: env.MC_INVENTORY_SHARED === 'true'
  };
}

export function loadMcProfiles(env: NodeJS.ProcessEnv = process.env): LoadedProfiles {
  const json = env.MC_PROFILES_JSON?.trim();
  if (!json) {
    const profile = legacyDefaultProfile(env);
    return {
      profiles: new Map([[profile.name, profile]]),
      defaultProfileName: profile.name
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`MC_PROFILES_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('MC_PROFILES_JSON must be a non-empty array');
  }

  const profiles = new Map<string, McProfile>();
  for (let index = 0; index < parsed.length; index += 1) {
    const profile = normalizeProfile(parsed[index], index);
    if (profiles.has(profile.name)) {
      throw new Error(`duplicate profile name "${profile.name}" in MC_PROFILES_JSON`);
    }
    profiles.set(profile.name, profile);
  }

  const defaultName = env.MC_DEFAULT_PROFILE?.trim() || 'default';
  if (!profiles.has(defaultName)) {
    const first = profiles.keys().next().value;
    if (!first) throw new Error('MC_PROFILES_JSON produced no profiles');
    return { profiles, defaultProfileName: first };
  }
  return { profiles, defaultProfileName: defaultName };
}

export function listProfileNames(profiles: Map<string, McProfile>): string[] {
  return [...profiles.keys()].sort((left, right) => left.localeCompare(right));
}
