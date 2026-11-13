/**
 * Routes bot and protocol-client `error` events into a single reconnect loop.
 * Listeners are never removed: a discarded socket can still emit ECONNRESET, and
 * Node exits if an EventEmitter has no `error` listener.
 */

const RECOVERABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE'
]);

export interface ReconnectGate {
  shuttingDown: boolean;
  suppressAutoReconnect: boolean;
  reconnectPending: boolean;
  connecting: boolean;
  hasActiveBot: boolean;
  reconnecting: boolean;
}

export function canStartReconnect(gate: ReconnectGate): boolean {
  return !gate.shuttingDown &&
    !gate.suppressAutoReconnect &&
    !gate.reconnectPending &&
    !gate.connecting &&
    !gate.hasActiveBot &&
    !gate.reconnecting;
}

export function isRecoverableNetworkError(error: unknown): boolean {
  if (typeof error === 'string') return isRecoverableNetworkMessage(error);
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; errno?: unknown; message?: unknown };
  if (typeof record.code === 'string' && RECOVERABLE_NETWORK_CODES.has(record.code)) return true;
  // Linux errno values for ECONNRESET, ETIMEDOUT, and ECONNREFUSED.
  if (record.errno === -104 || record.errno === -110 || record.errno === -111) return true;
  return typeof record.message === 'string' && isRecoverableNetworkMessage(record.message);
}

function isRecoverableNetworkMessage(message: string): boolean {
  return /client timed out after \d+ milliseconds|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|socket hang up/i.test(message);
}

export interface ConnectionErrorRouterOptions<T extends object> {
  isCurrent(bot: T): boolean;
  canStartReconnect(): boolean;
  onCurrentError(bot: T, error: Error): void;
  onStaleError(bot: T, error: Error): void;
  onStaleReconnect(bot: T, error: Error): void;
}

export interface ConnectionErrorRouter<T extends object> {
  attach(bot: T): void;
}

const seenErrors = new WeakSet<object>();

export function createConnectionErrorRouter<T extends object>(
  options: ConnectionErrorRouterOptions<T>
): ConnectionErrorRouter<T> {
  const attached = new WeakSet<object>();

  function route(bot: T, error: unknown): void {
    if (typeof error === 'object' && error !== null) {
      if (seenErrors.has(error)) return;
      seenErrors.add(error);
    }
    const normalized = error instanceof Error ? error : new Error(String(error));

    try {
      if (options.isCurrent(bot)) {
        options.onCurrentError(bot, normalized);
        return;
      }
      options.onStaleError(bot, normalized);
      if (options.canStartReconnect()) options.onStaleReconnect(bot, normalized);
    } catch (handlerError) {
      console.error('[minecraft] connection error handler failed:', handlerError);
    }
  }

  return {
    attach(bot: T): void {
      if (attached.has(bot)) return;
      attached.add(bot);
      const listener = (error: Error): void => route(bot, error);
      const source = bot as {
        on?: (event: 'error', listener: (error: Error) => void) => void;
        _client?: { on?: (event: 'error', listener: (error: Error) => void) => void };
      };
      if (typeof source.on !== 'function') {
        throw new Error('bot cannot listen for error events');
      }
      source.on('error', listener);
      const client = source._client;
      if (client && client !== (bot as object) && typeof client.on === 'function') {
        client.on('error', listener);
      }
    }
  };
}

export interface UncaughtExceptionHooks {
  log(error: unknown): void;
  recover(error: unknown): void;
  exit(code: number): void;
}

export function handleUncaughtException(error: unknown, hooks: UncaughtExceptionHooks): void {
  try {
    hooks.log(error);
  } catch (logError) {
    console.error('[process] failed to log uncaughtException:', logError);
  }
  if (!isRecoverableNetworkError(error)) {
    hooks.exit(1);
    return;
  }
  try {
    hooks.recover(error);
  } catch (recoverError) {
    console.error('[process] failed to recover from a network error:', recoverError);
    hooks.exit(1);
  }
}

export function installUncaughtExceptionGuard(hooks: UncaughtExceptionHooks): () => void {
  const listener = (error: unknown): void => {
    handleUncaughtException(error, hooks);
  };
  process.on('uncaughtException', listener);
  return () => {
    process.removeListener('uncaughtException', listener);
  };
}
