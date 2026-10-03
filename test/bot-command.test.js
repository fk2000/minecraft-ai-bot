import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBotCommand } from '../dist/bot/command.js';

test('bot commands are parsed into direct command routes', () => {
  assert.deepEqual(parseBotCommand('!help'), { type: 'help' });
  assert.deepEqual(parseBotCommand(' !PING '), { type: 'ping' });
  assert.deepEqual(parseBotCommand('!come'), { type: 'come' });
  assert.deepEqual(parseBotCommand('!stop'), { type: 'stop' });
  assert.deepEqual(parseBotCommand('!build'), { type: 'build' });
  assert.deepEqual(parseBotCommand('!goals'), { type: 'goals' });
  assert.deepEqual(parseBotCommand('!goal 探索'), { type: 'goal', choice: 'explore' });
  assert.deepEqual(parseBotCommand('!goal unsupported'), { type: 'goal', choice: null });
  assert.deepEqual(parseBotCommand('!hold iron sword'), { type: 'hold', query: 'iron sword' });
  assert.deepEqual(parseBotCommand('!weather thunder'), { type: 'weather', value: 'thunder' });
  assert.deepEqual(parseBotCommand('!difficulty peaceful'), { type: 'difficulty', value: 'peaceful' });
});

test('unknown bang commands stay on the command route', () => {
  assert.deepEqual(parseBotCommand('!not-a-command'), {
    type: 'unsupported',
    name: 'not-a-command'
  });
  assert.equal(parseBotCommand('hello bot'), null);
});
