import type { ControlJobStatus } from './control-jobs.js';

export type JobFailureReason = 'needs_shared_inventory' | 'awaiting_admin' | 'bot_error';

export function nextStatusAfterWithdraw(inventoryShared: boolean): ControlJobStatus | 'failed:needs_shared_inventory' {
  if (!inventoryShared) return 'failed:needs_shared_inventory';
  return 'in_transit';
}

export function resumeStatusOnPoll(status: ControlJobStatus): ControlJobStatus {
  if (status === 'in_transit' || status === 'depositing') return status;
  if (status === 'queued') return 'withdrawing';
  return status;
}

export function isTerminalJobStatus(status: ControlJobStatus): boolean {
  return status === 'done' || status === 'failed';
}
