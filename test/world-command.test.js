import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDifficultyCommand } from '../dist/bot/world-command.js';

test('Japanese difficulty requests parse to allowlisted Minecraft values', () => {
  assert.deepEqual(parseDifficultyCommand('ノーマルにして'), { value: 'normal' });
  assert.deepEqual(parseDifficultyCommand('難易度をノーマルにして'), { value: 'normal' });
  assert.deepEqual(parseDifficultyCommand('ピースフルにして'), { value: 'peaceful' });
  assert.deepEqual(parseDifficultyCommand('難易度をピースフルにして'), { value: 'peaceful' });
});

test('difficulty commands support English values and reject unrelated messages', () => {
  assert.deepEqual(parseDifficultyCommand('!difficulty hard'), { value: 'hard' });
  assert.deepEqual(parseDifficultyCommand('!difficulty'), { value: null });
  assert.equal(parseDifficultyCommand('普通ってどういう意味？'), null);
});
