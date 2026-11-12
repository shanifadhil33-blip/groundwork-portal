import { statusLabels } from './work-orders';
import { tradeLabels } from '../trades';
/** AGENT05 decision log: plain words for each outcome and for each field a confirmed change moved. */
export type DecisionChange = { field: string; from: string | null; to: string | null };
export type DecisionOutcome = 'done' | 'failed' | 'declined' | 'refused' | null;
export const DECISION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
  { key: 'declined', label: 'Said no' },
  { key: 'refused', label: 'Not allowed' },
  { key: 'undone', label: 'Undone' },
] as const;
export type DecisionFilter = typeof DECISION_FILTERS[number]['key'];
export function matchesFilter(d: { outcome: DecisionOutcome; undone_at: string | null }, f: DecisionFilter) {
  if (f === 'all') return true;
  if (f === 'undone') return !!d.undone_at;
  if (f === 'done') return d.outcome === 'done' && !d.undone_at;
  return d.outcome === f;
}
/** One short line under the item. Done needs none; the summary already says what happened. */
export function outcomeNote(d: { outcome: DecisionOutcome; reason?: string | null }) {
  if (d.outcome === 'declined') return 'You said no. Nothing was changed.';
  if (d.outcome === 'refused') return `Not allowed. ${d.reason ?? 'Nothing was changed.'}`.trim();
  if (d.outcome === 'failed') return 'This did not work. Nothing was changed.';
  return '';
}
const FIELD_LABELS: Record<string, string> = {
  status: 'Status', assignee: 'Assigned to', scheduled_for: 'Visit', due_on: 'Due', priority: 'Priority', trade: 'Type of work', payment_status: 'Payment',
  name: 'Name', address: 'Address', phone: 'Phone', email: 'Email', notes: 'Notes', country: 'Country', region: 'Region', contract_visits: 'Contract visits', contract_ends_on: 'Contract ends',
};
const PAYMENT: Record<string, string> = { to_bill: 'To bill', contract: 'Covered by contract', paid: 'Paid' };
const PRIORITY: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const DATE_FIELDS = ['scheduled_for', 'due_on', 'contract_ends_on'];
export function fieldLabel(field: string) { return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()); }
/** A stored value in plain words. Dates are left to the caller, which writes them in the person's language. */
export function valueLabel(field: string, value: string | null) {
  if (value === null) return 'Not set';
  if (field === 'status') return statusLabels[value] ?? value;
  if (field === 'trade') return (tradeLabels as Record<string, string>)[value] ?? value;
  if (field === 'payment_status') return PAYMENT[value] ?? value;
  if (field === 'priority') return PRIORITY[value] ?? value;
  return value;
}
