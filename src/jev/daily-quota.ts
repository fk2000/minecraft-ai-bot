import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface JevQuotaReservation {
  allowed: boolean;
  used: number;
  remaining: number;
  resetsAt: Date;
}

interface QuotaState {
  date: string;
  used: number;
}

function isQuotaState(value: unknown): value is QuotaState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(state.date) &&
    Number.isSafeInteger(state.used) &&
    (state.used as number) >= 0;
}

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getNextUtcMidnight(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export class JevDailyQuota {
  private pendingReservation: Promise<void> = Promise.resolve();

  constructor(private readonly statePath: string) {}

  reserve(limit: number, now = new Date()): Promise<JevQuotaReservation> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return Promise.reject(new RangeError('Jev daily limit must be a positive integer'));
    }

    const reservation = this.pendingReservation.then(
      () => this.reserveSerially(limit, now),
      () => this.reserveSerially(limit, now)
    );
    this.pendingReservation = reservation.then(() => undefined, () => undefined);
    return reservation;
  }

  private async reserveSerially(limit: number, now: Date): Promise<JevQuotaReservation> {
    const today = getDateKey(now);
    const resetsAt = getNextUtcMidnight(now);
    let used = 0;

    try {
      const serialized = await readFile(this.statePath, 'utf8');
      const parsed: unknown = JSON.parse(serialized);
      if (!isQuotaState(parsed)) throw new Error('Jev daily usage state has an invalid format');
      if (parsed.date === today) used = parsed.used;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }

    if (used >= limit) {
      return { allowed: false, used, remaining: 0, resetsAt };
    }

    const nextState: QuotaState = { date: today, used: used + 1 };
    await this.writeState(nextState);
    return {
      allowed: true,
      used: nextState.used,
      remaining: Math.max(0, limit - nextState.used),
      resetsAt
    };
  }

  private async writeState(state: QuotaState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${process.pid}.tmp`;

    try {
      await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
      await rename(temporaryPath, this.statePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    error.code === 'ENOENT';
}
