import { withSystem } from '../db';
/**
 * Bug 106: the Agent's limits are kept in the database, so every server instance shares them.
 * Each company gets AGENT_DAILY_LIMIT questions that need the AI per day (default 300), and each person 10 a minute.
 * Demo sandboxes keep their own limits (demo-agent-limit.ts). Answers that need no AI are never counted.
 */
export const agentPerMinute = () => Math.max(1, Number(process.env.AGENT_PER_MINUTE) || 10);
export const agentDailyLimit = () => Math.max(1, Number(process.env.AGENT_DAILY_LIMIT) || 300);
export const AGENT_DAY_REST = "The Agent has reached today's limit. It will be back tomorrow.";
export async function agentQuota(user: string, ws: string): Promise<'ok' | 'minute' | 'day'> {
 return withSystem(async db => {
  const minute = (await db.query(`INSERT INTO agent_quota_minute(user_id, minute, calls) VALUES($1, date_trunc('minute', now()), 1)
   ON CONFLICT (user_id, minute) DO UPDATE SET calls = agent_quota_minute.calls + 1 WHERE agent_quota_minute.calls < $2 RETURNING calls`, [user, agentPerMinute()])).rowCount;
  if (!minute) return 'minute';
  if ((await db.query('SELECT is_demo FROM workspaces WHERE id=$1', [ws])).rows[0]?.is_demo !== false) return 'ok';
  // The company day follows the company's own time zone.
  const day = (await db.query(`INSERT INTO agent_quota_day(workspace_id, day, calls)
   SELECT id, (now() AT TIME ZONE timezone)::date, 1 FROM workspaces WHERE id=$1
   ON CONFLICT (workspace_id, day) DO UPDATE SET calls = agent_quota_day.calls + 1 WHERE agent_quota_day.calls < $2 RETURNING calls`, [ws, agentDailyLimit()])).rowCount;
  return day ? 'ok' : 'day';
 });
}
/** Old minute rows are removed by the cleanup cron. */
export async function pruneAgentQuota() {
 await withSystem(async db => {
  await db.query("DELETE FROM agent_quota_minute WHERE minute < now() - interval '1 hour'");
  await db.query("DELETE FROM agent_quota_day WHERE day < current_date - 40");
 });
}
