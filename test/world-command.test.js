import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseDifficultyCommand,
  parseWeatherCommand
} from '../dist/bot/world-command.js';

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

test('weather commands accept only explicit allowlisted values', () => {
  assert.deepEqual(parseWeatherCommand('!weather clear'), { value: 'clear' });
  assert.deepEqual(parseWeatherCommand('!weather 雨'), { value: 'rain' });
  assert.deepEqual(parseWeatherCommand('!weather'), { value: null });
  assert.equal(parseWeatherCommand('weather clear'), null);
});
