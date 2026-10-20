/** Queued Nov 23 archives. History stays. Delete is only when there is nothing to keep. */

export const ARCHIVE_REPLIES = {
  documentWait: 'This document is not expired yet.',
  documentArchived: 'Archived. The file stays on the record.',
  documentBack: 'Back in the list.',
  supplierDelete: 'Removed. It had no parts history.',
  supplierArchive: 'Archived. The parts history stays.',
  supplierRefuse: 'This order still has parts history, so it stays. Archive it instead.',
  contractClear: 'The contract fields are cleared. There were no covered jobs.',
  contractArchive: 'The contract is finished. Past jobs stay covered by contract.',
  contractOpen: 'This contract still covers jobs, so it cannot be removed. Finish it instead. Past jobs stay covered by contract.',
  contractClosed: 'This contract is finished. New jobs are not covered by it. Past jobs stay covered by contract.',
  notFound: 'That record was not found.',
  onlyOffice: 'Only the office can archive this.',
} as const;

export function supplierChoice(events: number, status: string): 'delete' | 'archive' {
  return events === 0 && status === 'ordered' ? 'delete' : 'archive';
}

export function documentChoice(daysLeft: number | null): 'archive' | 'keep' {
  return daysLeft != null && daysLeft < 0 ? 'archive' : 'keep';
}

/** finish: the contract is over. Otherwise this is a delete. Covered jobs are never deleted. */
export function contractChoice(coveredJobs: number, ended: boolean, finish: boolean): 'clear' | 'archive' | 'refuse' {
  if (!finish && coveredJobs > 0) return 'refuse';
  if (finish && (coveredJobs > 0 || ended)) return 'archive';
  return 'clear';
}
