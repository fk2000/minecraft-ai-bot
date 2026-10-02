import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canSleepInMinecraftContext,
  chooseMineflayerAutonomyChoice,
  formatPlayerJoinGreeting,
  shouldRoutePlayerChoice
} from '../dist/bot/behavior.js';

test('player join greetings welcome each player except the bot itself', () => {
  assert.equal(
    formatPlayerJoinGreeting('fujiwarakaz', 'JevAIBot'),
    'こんにちは、fujiwarakazさん！ログインありがとう！'
  );
  assert.equal(formatPlayerJoinGreeting('JevAIBot', 'JevAIBot'), undefined);
  assert.equal(formatPlayerJoinGreeting('   ', 'JevAIBot'), undefined);
});

test('the bot routes clear Jev-approved action requests without requiring a name mention', () => {
  assert.equal(shouldRoutePlayerChoice('explore', false), true);
  assert.equal(shouldRoutePlayerChoice('conversation', false), false);
  assert.equal(shouldRoutePlayerChoice('conversation', true), true);
});

test('automatic sleeping is limited to nighttime or thunderstorms in the overworld', () => {
  assert.equal(canSleepInMinecraftContext({
    dimension: 'minecraft:overworld',
    timeOfDay: 13000,
    isRaining: false,
    thunderState: 0
  }), true);
  assert.equal(canSleepInMinecraftContext({
    dimension: 'overworld',
    timeOfDay: 6000,
    isRaining: true,
    thunderState: 1
  }), true);
  assert.equal(canSleepInMinecraftContext({
    dimension: 'minecraft:the_nether',
    timeOfDay: 13000,
    isRaining: false,
    thunderState: 0
  }), false);
  assert.equal(canSleepInMinecraftContext({
    dimension: 'minecraft:overworld',
    timeOfDay: 6000,
    isRaining: false,
    thunderState: 0
  }), false);
});

test('autonomous action is selected locally without Jev and avoids recent choices', () => {
  assert.equal(
    chooseMineflayerAutonomyChoice(['explore', 'observe', 'rest'], []),
    'explore'
  );
  assert.equal(
    chooseMineflayerAutonomyChoice(['explore', 'observe', 'rest'], ['explore']),
    'observe'
  );
  assert.equal(chooseMineflayerAutonomyChoice([], []), undefined);
});
