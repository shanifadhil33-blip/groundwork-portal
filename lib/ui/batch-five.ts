export function auditBadge(item: { actor_kind?: string; via_token_name?: string | null }) {
  return item.actor_kind === 'agent' ? `via AI agent: ${item.via_token_name || 'Unnamed key'}` : item.actor_kind === 'assistant' ? 'via assistant' : null;
}
export const expiryOptions = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }, { value: '', label: 'No expiry' }];
export function tokenExpiry(value: string) { return value ? { expires_in_days: Number(value) } : {}; }
export function mcpSnippet() { return JSON.stringify({ mcpServers: { groundwork: { url: 'https://groundwork-portal.vercel.app/api/mcp', headers: { Authorization: 'Bearer <your key>' } } } }, null, 2); }
export function tokenStatus(item: { revoked_at: string | null; expires_at: string | null }, now = Date.now()) { return item.revoked_at ? 'Revoked' : item.expires_at && Date.parse(item.expires_at) <= now ? 'Expired' : 'Active'; }

export function supplierNextStatuses(status?: string): string[] { return status === 'ordered' ? ['shipped', 'cancelled'] : status === 'shipped' ? ['delivered', 'cancelled'] : []; }
