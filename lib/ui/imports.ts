import { plural } from './polish';
import { RequestError } from './api';
export const importFields = ['title', 'description', 'client', 'site', 'priority', 'scheduled_for', 'external_ref'] as const;
export type ImportField = typeof importFields[number];
export const fieldLabels: Record<ImportField, string> = { title: 'Title', description: 'Description', client: 'Client', site: 'Site', priority: 'Priority', scheduled_for: 'Scheduled for', external_ref: 'External reference' };
export type Mapping = Partial<Record<ImportField, string>>;
export type Issue = { field: string; code: string; message: string };
export type ImportRow = { id: string; import_id: string; row_number: number; data: Record<ImportField, string>; status: 'valid' | 'warning' | 'error'; decision: string; errors: Issue[]; warnings: Issue[]; ai_summary: string | null; ai_priority: string | null; ai_is_suggestion: boolean; work_order_id: string | null };
export type ImportRecord = { id: string; filename: string; status: 'uploaded' | 'mapped' | 'queued' | 'completed'; row_count: number; created_at: string; headers: string[]; mapping: Mapping; counts: { valid: number; warning: number; error: number; pending: number; approved: number; rejected: number }; result_summary: string };
export const mappingOptions = (headers: string[]) => [{ value: '', label: "Don't import" }, ...headers.map(header => ({ value: header, label: header }))];
export const cleanMapping = (mapping: Mapping): Mapping => Object.fromEntries(importFields.filter(field => !!mapping[field]).map(field => [field, mapping[field]]));
export const sendLabel = (counts: { valid: number; warning: number }) => `Send ${plural(counts.valid + counts.warning,'valid row')} to queue`;
export const canUndo = (until: string, now = Date.now()) => Number.isFinite(Date.parse(until)) && Date.parse(until) > now;
export const bulkLimitCopy = (role: string, count: number) => role === 'staff' && count > 25 ? 'Staff can approve up to 25 rows at a time. Select 25 or fewer rows.' : null;
export function issueCopy(issue: Issue) {
  const copy: Record<string, string> = { required: 'Enter a title of 1 to 200 characters.', length: 'Use 20,000 characters or fewer.', unknown_site: 'Choose a known site and its matching client.', unknown_priority: 'Priority was not recognised. Normal will be used.', bad_date: 'Enter a valid date, such as 2026-10-10.', duplicate_open: 'A matching work order is already open.' };
  if (issue.code === 'duplicate_file') { const row = issue.message.match(/^Duplicate of row (\d+)$/)?.[1]; return row ? `Duplicate of row ${row}.` : 'This row is repeated in the file.'; }
  return copy[issue.code] ?? 'Check this field before approving.';
}
export function validationCopy(fields?: Record<string, string[]>) {
  const result: Partial<Record<ImportField, string>> = {};
  for (const field of importFields) if (fields?.[field] || fields?.[`edits.${field}`]) result[field] = field === 'title' ? 'Enter a unique title of 1 to 200 characters.' : field === 'site' || field === 'client' ? 'Choose a known site and matching client.' : field === 'scheduled_for' ? 'Enter a valid date or a timestamp with a timezone.' : field === 'description' ? 'Use 20,000 characters or fewer.' : 'Check this value and try again.';
  return result;
}
export function importError(error: unknown, action: 'upload' | 'mapping' | 'queue' | 'approve' | 'reject' | 'bulk' | 'undo') {
  if (error instanceof RequestError) {
    if (action === 'undo' && error.status === 409) return 'Undo has expired';
    if (action === 'bulk' && error.status === 403) return 'Staff can approve up to 25 rows at a time. Select 25 or fewer rows.';
    if (error.status === 422 && action === 'upload') {
      if (error.message.includes('empty')) return 'This file is empty. Choose a file with column headings and data rows.';
      if (error.message.includes('no data rows')) return 'This file has no data rows. Add rows beneath the column headings.';
      if (error.message.includes('could not be read')) return 'We couldn’t read this file. Save it as CSV or XLSX and choose it again.';
      if (error.message.includes('headers')) return 'Add a header row with a unique, non-empty name for each column.';
      if (error.message.includes('2 MB')) return 'This file is too large or has the wrong file type. Choose a CSV or XLSX file up to 2 MB.';
    }
    if (error.status === 422) return action === 'upload' ? 'Choose a CSV or XLSX file with unique column headings, no more than 2 MB and 500 rows.' : action === 'mapping' ? 'Choose a title column and check your mapping.' : action === 'reject' ? 'Enter a reason of 1 to 2,000 characters.' : 'Check the highlighted fields. Rows may also match an already open work order.';
    if (error.status === 409) return action === 'mapping' ? 'This import is already queued. Its mapping can no longer be changed.' : 'This row or import has changed. Refresh and try again.';
  }
  return 'We couldn’t complete that. Please try again.';
}
export function duplicateImport(error: unknown) {
  if (!(error instanceof RequestError) || error.status !== 409 || error.code !== 'already_imported') return null;
  const id = error.fields?.import_id?.[0], date = error.message.match(/on (\d{4}-\d{2}-\d{2})\./)?.[1];
  return id ? { id, message: date ? `You already imported this file on ${date}.` : 'You already imported this file.' } : null;
}
