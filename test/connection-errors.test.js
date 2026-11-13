import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  canStartReconnect,
  createConnectionErrorRouter,
  handleUncaughtException,
  installUncaughtExceptionGuard,
  isRecoverableNetworkError
} from '../dist/bot/connection-errors.js';

function createFakeBot() {
  const bot = new EventEmitter();
  const client = new EventEmitter();
  // Same order as mineflayer: the protocol client forwards `error` onto the bot.
  client.on('error', (error) => {
    bot.emit('error', error);
  });
  bot._client = client;
  return bot;
}

function networkError(message, code, errno) {
  const error = new Error(message);
  error.code = code;
  if (errno !== undefined) error.errno = errno;
  return error;
}

function idleGate(overrides = {}) {
  return {
    shuttingDown: false,
    suppressAutoReconnect: false,
    reconnectPending: false,
    connecting: false,
    hasActiveBot: false,
    reconnecting: false,
    ...overrides
  };
}

test('network timeouts and socket resets are recoverable; other errors are not', () => {
  assert.equal(isRecoverableNetworkError(networkError('read ECONNRESET', 'ECONNRESET', -104)), true);
  assert.equal(isRecoverableNetworkError(networkError('connect ETIMEDOUT', 'ETIMEDOUT', -110)), true);
  assert.equal(isRecoverableNetworkError(new Error('client timed out after 30000 milliseconds')), true);
  assert.equal(isRecoverableNetworkError(new Error('planner failed')), false);
  assert.equal(isRecoverableNetworkError('not an error'), false);
});

test('a second reconnect is not started while one is already in progress or a bot is live', () => {
  assert.equal(canStartReconnect(idleGate()), true);
  assert.equal(canStartReconnect(idleGate({ reconnectPending: true })), false);
  assert.equal(canStartReconnect(idleGate({ reconnecting: true })), false);
  assert.equal(canStartReconnect(idleGate({ connecting: true })), false);
  assert.equal(canStartReconnect(idleGate({ hasActiveBot: true })), false);
  assert.equal(canStartReconnect(idleGate({ shuttingDown: true })), false);
  assert.equal(canStartReconnect(idleGate({ suppressAutoReconnect: true })), false);
});

test('an error on the new bot after reconnect schedules one reconnect', () => {
  let current;
  let reconnects = 0;
  const gate = idleGate();
  const router = createConnectionErrorRouter({
    isCurrent: (bot) => bot === current,
    canStartReconnect: () => canStartReconnect(gate),
    onCurrentError: () => {
      current = undefined;
      gate.hasActiveBot = false;
      gate.reconnectPending = true;
      gate.reconnecting = true;
      reconnects += 1;
    },
    onStaleError: () => {},
    onStaleReconnect: () => {
      reconnects += 1;
    }
  });

  const first = createFakeBot();
  current = first;
  gate.hasActiveBot = true;
  router.attach(first);
  first._client.emit('error', new Error('client timed out after 30000 milliseconds'));
  assert.equal(reconnects, 1);

  gate.reconnectPending = false;
  gate.reconnecting = false;
  const second = createFakeBot();
  current = second;
  gate.hasActiveBot = true;
  router.attach(second);

  const reset = networkError('read ECONNRESET', 'ECONNRESET', -104);
  assert.doesNotThrow(() => {
    second._client.emit('error', reset);
  });
  assert.equal(reconnects, 2);
  assert.equal(current, undefined);
  assert.equal(gate.reconnectPending, true);

  const again = networkError('connect ETIMEDOUT', 'ETIMEDOUT', -110);
  second.emit('error', again);
  second._client.emit('error', again);
  assert.equal(reconnects, 2);
});

test('an error on a stale client after it was replaced does not start another reconnect loop', () => {
  let current;
  let reconnects = 0;
  const staleErrors = [];
  const gate = idleGate();
  const router = createConnectionErrorRouter({
    isCurrent: (bot) => bot === current,
    canStartReconnect: () => canStartReconnect(gate),
    onCurrentError: () => {
      current = undefined;
      gate.hasActiveBot = false;
      gate.reconnectPending = true;
      gate.reconnecting = true;
      reconnects += 1;
    },
    onStaleError: (_bot, error) => {
      staleErrors.push(error);
    },
    onStaleReconnect: () => {
      gate.reconnectPending = true;
      gate.reconnecting = true;
      reconnects += 1;
    }
  });

  const oldBot = createFakeBot();
  current = oldBot;
  gate.hasActiveBot = true;
  router.attach(oldBot);
  oldBot.emit('error', new Error('client timed out after 30000 milliseconds'));
  assert.equal(reconnects, 1);

  gate.reconnectPending = false;
  gate.reconnecting = false;
  const newBot = createFakeBot();
  current = newBot;
  gate.hasActiveBot = true;
  router.attach(newBot);

  const staleReset = networkError('read ECONNRESET', 'ECONNRESET', -104);
  assert.doesNotThrow(() => {
    oldBot._client.emit('error', staleReset);
    oldBot.emit('error', staleReset);
  });
  assert.equal(staleErrors.length, 1);
  assert.equal(staleErrors[0].code, 'ECONNRESET');
  assert.equal(reconnects, 1);
  assert.equal(current, newBot);
  assert.equal(newBot.listenerCount('error'), 1);
  assert.equal(oldBot.listenerCount('error'), 1);

  const lateTimeout = new Error('client timed out after 30000 milliseconds');
  oldBot._client.emit('error', lateTimeout);
  assert.equal(staleErrors.length, 2);
  assert.equal(reconnects, 1);
  assert.equal(current, newBot);
});

test('a stale client error starts one reconnect only when no session is active', () => {
  let current;
  let reconnects = 0;
  const gate = idleGate();
  const router = createConnectionErrorRouter({
    isCurrent: (bot) => bot === current,
    canStartReconnect: () => canStartReconnect(gate),
    onCurrentError: () => {
      throw new Error('discarded bot was still current');
    },
    onStaleError: () => {},
    onStaleReconnect: () => {
      gate.reconnectPending = true;
      gate.reconnecting = true;
      reconnects += 1;
    }
  });

  const discarded = createFakeBot();
  router.attach(discarded);
  discarded._client.emit('error', networkError('read ECONNRESET', 'ECONNRESET', -104));
  discarded.emit('error', networkError('connect ETIMEDOUT', 'ETIMEDOUT', -110));
  assert.equal(reconnects, 1);
  assert.equal(gate.reconnectPending, true);
});

test('uncaughtException is logged, network errors stay recoverable, and other errors exit', () => {
  const calls = [];
  const reset = networkError('read ECONNRESET', 'ECONNRESET', -104);
  handleUncaughtException(reset, {
    log(error) { calls.push(['log', error]); },
    recover(error) { calls.push(['recover', error]); },
    exit(code) { calls.push(['exit', code]); }
  });
  assert.deepEqual(calls, [['log', reset], ['recover', reset]]);

  const bug = new Error('planner failed');
  handleUncaughtException(bug, {
    log(error) { calls.push(['log', error]); },
    recover() { throw new Error('non-network error was swallowed'); },
    exit(code) { calls.push(['exit', code]); }
  });
  assert.deepEqual(calls.slice(2), [['log', bug], ['exit', 1]]);

  const before = process.listenerCount('uncaughtException');
  const remove = installUncaughtExceptionGuard({
    log() {},
    recover() {},
    exit() { throw new Error('guard should not exit during install'); }
  });
  assert.equal(process.listenerCount('uncaughtException'), before + 1);
  remove();
  assert.equal(process.listenerCount('uncaughtException'), before);
});
