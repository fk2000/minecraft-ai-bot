import type { Bot } from 'mineflayer';
import { chestPut, chestTake } from './chest-ops.js';
import type { McProfile } from './profiles.js';
import { nextStatusAfterWithdraw } from './job-state.js';

export type ControlJobStatus =
  | 'queued'
  | 'withdrawing'
  | 'in_transit'
  | 'depositing'
  | 'done'
  | 'failed';

export interface TransferManifestEntry {
  item: string;
  count: number;
}

export interface TransferManifest {
  chest: { x: number; y: number; z: number };
  items: TransferManifestEntry[];
  depositChest?: { x: number; y: number; z: number };
}

export interface ControlJob {
  id: string;
  fromServer: string;
  toServer: string;
  status: ControlJobStatus;
  manifest: TransferManifest;
  moved?: Record<string, number>;
  failureReason?: string | null;
  inventoryShared: boolean;
}

export interface ControlClientConfig {
  baseUrl: string;
  token: string;
}

export interface JobRunnerDeps {
  getBot: () => Bot | undefined;
  getCurrentProfileName: () => string;
  switchServer: (name: string) => Promise<void>;
  getProfile: (name: string) => McProfile | undefined;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

export async function fetchNextJob(config: ControlClientConfig): Promise<ControlJob | null> {
  const url = new URL('/jobs/next', config.baseUrl.replace(/\/+$/, '') + '/');
  const response = await fetch(url, { headers: authHeaders(config.token) });
  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`control GET /jobs/next failed: ${response.status} ${await response.text()}`);
  }
  return parseJob(await response.json());
}

export async function patchJob(
  config: ControlClientConfig,
  id: string,
  body: Record<string, unknown>
): Promise<ControlJob> {
  const url = new URL(`/jobs/${encodeURIComponent(id)}`, config.baseUrl.replace(/\/+$/, '') + '/');
  const response = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders(config.token),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`control PATCH /jobs/${id} failed: ${response.status} ${await response.text()}`);
  }
  return parseJob(await response.json());
}

function parseJob(raw: unknown): ControlJob {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid job payload');
  const job = raw as Record<string, unknown>;
  const manifest = typeof job.manifest === 'object' && job.manifest !== null
    ? job.manifest as TransferManifest
    : JSON.parse(String(job.manifest_json ?? '{}')) as TransferManifest;
  return {
    id: String(job.id),
    fromServer: String(job.from_server ?? job.fromServer),
    toServer: String(job.to_server ?? job.toServer),
    status: String(job.status) as ControlJobStatus,
    manifest,
    moved: typeof job.moved === 'object' && job.moved !== null
      ? job.moved as Record<string, number>
      : job.moved_json
        ? JSON.parse(String(job.moved_json)) as Record<string, number>
        : undefined,
    failureReason: job.failure_reason != null ? String(job.failure_reason) : null,
    inventoryShared: job.inventory_shared === true || job.inventoryShared === true
  };
}

export async function runControlJobStep(
  config: ControlClientConfig,
  job: ControlJob,
  deps: JobRunnerDeps
): Promise<void> {
  const profileFor = (serverName: string) => deps.getProfile(serverName);
  const moved: Record<string, number> = { ...(job.moved ?? {}) };

  if (job.status === 'queued' || job.status === 'withdrawing') {
    if (deps.getCurrentProfileName() !== job.fromServer) {
      await deps.switchServer(job.fromServer);
    }
    const bot = deps.getBot();
    if (!bot?.entity) throw new Error('bot not ready on source server');
    await patchJob(config, job.id, { status: 'withdrawing' });

    for (const entry of job.manifest.items) {
      const result = await chestTake(
        bot,
        entry.item,
        entry.count,
        job.manifest.chest.x,
        job.manifest.chest.y,
        job.manifest.chest.z
      );
      moved[result.itemName] = (moved[result.itemName] ?? 0) + result.moved;
    }

    const fromProfile = profileFor(job.fromServer);
    const toProfile = profileFor(job.toServer);
    const routeShared = job.inventoryShared ||
      (fromProfile?.inventoryShared === true && toProfile?.inventoryShared === true);

    const afterWithdraw = nextStatusAfterWithdraw(routeShared);
    if (afterWithdraw === 'failed:needs_shared_inventory') {
      await patchJob(config, job.id, {
        status: 'failed',
        failure_reason: 'needs_shared_inventory',
        moved_json: moved
      });
      return;
    }

    await patchJob(config, job.id, { status: 'in_transit', moved_json: moved });
    return;
  }

  if (job.status === 'in_transit') {
    await deps.switchServer(job.toServer);
    const deposit = job.manifest.depositChest ?? job.manifest.chest;
    await patchJob(config, job.id, { status: 'depositing' });
    const bot = deps.getBot();
    if (!bot?.entity) throw new Error('bot not ready on destination server');
    const putResult = await chestPut(bot, deposit.x, deposit.y, deposit.z);
    for (const line of putResult.deposits) {
      moved[line.itemName] = (moved[line.itemName] ?? 0) + line.moved;
    }
    await patchJob(config, job.id, { status: 'done', moved_json: moved });
    return;
  }

  if (job.status === 'depositing') {
    const bot = deps.getBot();
    if (!bot?.entity) throw new Error('bot not ready for deposit');
    const deposit = job.manifest.depositChest ?? job.manifest.chest;
    const putResult = await chestPut(bot, deposit.x, deposit.y, deposit.z);
    for (const line of putResult.deposits) {
      moved[line.itemName] = (moved[line.itemName] ?? 0) + line.moved;
    }
    await patchJob(config, job.id, { status: 'done', moved_json: moved });
  }
}

export function startControlJobPoller(
  config: ControlClientConfig,
  deps: JobRunnerDeps,
  intervalMs = 15_000
): () => void {
  let stopped = false;
  let running = false;

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      const job = await fetchNextJob(config);
      if (job && job.status !== 'done' && job.status !== 'failed') {
        await runControlJobStep(config, job, deps);
      }
    } catch (error) {
      console.error('[control] Job poll or step failed:', error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
