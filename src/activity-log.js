import { appendFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

export const DEFAULT_ACTIVITY_LOG_PATH = 'logs/bot-activity.jsonl';

let pendingWrites = Promise.resolve();

function getWeekStart(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function archiveCompletedWeeks(directory, prefix, currentDateKey) {
  const currentWeekStart = getWeekStart(currentDateKey);
  const datedFilePattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`);
  const entries = await readdir(directory, { withFileTypes: true });
  const weeks = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = datedFilePattern.exec(entry.name);
    if (!match) continue;

    const dateKey = match[1];
    const weekStart = getWeekStart(dateKey);
    if (weekStart >= currentWeekStart) continue;
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart).push({ dateKey, path: join(directory, entry.name) });
  }

  for (const [weekStart, files] of weeks) {
    files.sort((left, right) => left.dateKey.localeCompare(right.dateKey));
    const archivePath = join(directory, `${prefix}-week-${weekStart}.jsonl.gz`);
    const temporaryPath = `${archivePath}.${process.pid}.tmp`;
    const fileStream = Readable.from((async function * () {
      for (const file of files) {
        for await (const chunk of createReadStream(file.path)) yield chunk;
      }
    })());

    try {
      await pipeline(fileStream, createGzip(), createWriteStream(temporaryPath, { flags: 'wx' }));
      await rename(temporaryPath, archivePath);
      await Promise.all(files.map((file) => unlink(file.path)));
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

export function writeActivityLog(logPath, event, details = {}, timestamp = new Date()) {
  pendingWrites = pendingWrites.then(async () => {
    const absolutePath = resolve(logPath);
    const directory = dirname(absolutePath);
    const { name: prefix } = parse(absolutePath);
    const dateKey = timestamp.toISOString().slice(0, 10);
    const dailyPath = join(directory, `${prefix}-${dateKey}.jsonl`);
    await mkdir(directory, { recursive: true });
    const record = {
      timestamp: timestamp.toISOString(),
      event,
      ...details
    };
    await appendFile(dailyPath, `${JSON.stringify(record)}\n`, 'utf8');
    await archiveCompletedWeeks(directory, prefix, dateKey);
  }).catch((error) => {
    console.error('[activity-log] Failed to write activity:', error);
  });

  return pendingWrites;
}