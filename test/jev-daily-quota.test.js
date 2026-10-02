import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { JevDailyQuota } from '../dist/jev/daily-quota.js';

test('Jev daily quota enforces the limit across concurrent and restarted instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-daily-quota-'));
  const statePath = join(directory, 'usage.json');
  const today = new Date('2026-10-03T08:00:00.000Z');

  try {
    const quota = new JevDailyQuota(statePath);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => quota.reserve(3, today))
    );

    assert.equal(results.filter((result) => result.allowed).length, 3);
    assert.equal(results.filter((result) => !result.allowed).length, 1);
    assert.equal(results[2].remaining, 0);
    assert.equal(results[3].resetsAt.toISOString(), '2026-10-04T00:00:00.000Z');

    const restartedQuota = new JevDailyQuota(statePath);
    assert.equal((await restartedQuota.reserve(3, today)).allowed, false);
    assert.deepEqual(JSON.parse(await readFile(statePath, 'utf8')), {
      date: '2026-10-03',
      used: 3
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Jev daily quota resets on the next UTC date', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-daily-quota-'));
  const quota = new JevDailyQuota(join(directory, 'usage.json'));

  try {
    await quota.reserve(1, new Date('2026-10-03T23:59:00.000Z'));
    const nextDay = await quota.reserve(1, new Date('2026-10-04T00:01:00.000Z'));
    assert.equal(nextDay.allowed, true);
    assert.equal(nextDay.used, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Jev daily quota fails closed when the persisted state is invalid', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'jev-daily-quota-'));
  const statePath = join(directory, 'usage.json');
  const quota = new JevDailyQuota(statePath);

  try {
    await quota.reserve(1, new Date('2026-10-03T12:00:00.000Z'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(statePath, '{}', 'utf8');
    await assert.rejects(
      quota.reserve(1, new Date('2026-10-03T13:00:00.000Z')),
      /invalid format/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
