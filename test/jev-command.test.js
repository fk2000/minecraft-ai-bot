import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseJevCommand } from '../dist/bot/jev-command.js';

test('Jev judgment is explicitly triggered by the Jev: prefix', () => {
  assert.deepEqual(parseJevCommand('Jev: ここに来て'), {
    instruction: 'ここに来て'
  });
  assert.deepEqual(parseJevCommand('  jev :  explore nearby  '), {
    instruction: 'explore nearby'
  });
  assert.deepEqual(parseJevCommand('Jev:'), { instruction: '' });
  assert.equal(parseJevCommand('ここに来て'), null);
  assert.equal(parseJevCommand('Jevに聞きたい'), null);
});
