import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBotCommand } from '../dist/bot/command.js';

test('server commands parse list and use', () => {
  assert.deepEqual(parseBotCommand('!server list'), { type: 'server', action: 'list' });
  assert.deepEqual(parseBotCommand('!server use survival'), {
    type: 'server',
    action: 'use',
    name: 'survival'
  });
});

test('chest commands parse take and put coordinates', () => {
  assert.deepEqual(parseBotCommand('!chest take oak_planks 64 100 64 200'), {
    type: 'chest',
    action: 'take',
    item: 'oak_planks',
    count: 64,
    x: 100,
    y: 64,
    z: 200
  });
  assert.deepEqual(parseBotCommand('!chest put 10 70 -5'), {
    type: 'chest',
    action: 'put',
    x: 10,
    y: 70,
    z: -5
  });
});
