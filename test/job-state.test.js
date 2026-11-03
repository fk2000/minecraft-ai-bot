import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isTerminalJobStatus,
  nextStatusAfterWithdraw,
  resumeStatusOnPoll
} from '../dist/bot/job-state.js';

test('withdraw on non-shared route fails with dedicated reason path', () => {
  assert.equal(nextStatusAfterWithdraw(false), 'failed:needs_shared_inventory');
  assert.equal(nextStatusAfterWithdraw(true), 'in_transit');
});

test('poll resume keeps in_transit and promotes queued to withdrawing', () => {
  assert.equal(resumeStatusOnPoll('in_transit'), 'in_transit');
  assert.equal(resumeStatusOnPoll('queued'), 'withdrawing');
  assert.equal(isTerminalJobStatus('done'), true);
  assert.equal(isTerminalJobStatus('withdrawing'), false);
});
