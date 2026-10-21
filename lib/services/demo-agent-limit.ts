import { withSystem } from '../db';
/**
 * DEMO14: in demo sandboxes, agent questions that need the AI are limited so judges' load cannot spend the free quota.
 * Per sandbox: 20 in 10 minutes and 60 in an hour. All sandboxes together: 400 in an hour and 1000 in a day (DEMO17: counted calls outlive sandbox resets, so a new sandbox cannot restart the shared count). Real companies are never limited,
 * answers that need no AI (quick job steps, planned replies, confirmations) are never limited, and demo sign in is never touched.
 * Over the limit the agent answers with a friendly note, never an error.
 */
export const DEMO_LIMITS = { short: { n: 20, minutes: 10 }, hour: { n: 60, minutes: 60 }, all: { n: 400, minutes: 60 }, day: { n: 1000, minutes: 1440 } };
export const DEMO_REST = 'Lots of questions in this demo just now, so I am taking a short break to save the free AI. Please ask again in a few minutes. Everything else in Groundwork works as usual.';
export async function demoAgentAllowed(ws: string): Promise<boolean> {
 return withSystem(async db => {
  const demo = (await db.query('SELECT is_demo FROM workspaces WHERE id=$1', [ws])).rows[0]?.is_demo === true;
  if (!demo) return true;
  await db.query('SELECT pg_advisory_xact_lock(78201351)');
  const r = (await db.query(`SELECT count(*) FILTER (WHERE workspace_id=$1 AND at>now()-make_interval(mins=>$2))::int AS short,
    count(*) FILTER (WHERE workspace_id=$1 AND at>now()-make_interval(mins=>$3))::int AS hour,
    count(*) FILTER (WHERE at>now()-make_interval(mins=>$4))::int AS all_demos,
    count(*)::int AS day FROM demo_agent_calls WHERE at>now()-make_interval(mins=>$5)`,
   [ws, DEMO_LIMITS.short.minutes, DEMO_LIMITS.hour.minutes, DEMO_LIMITS.all.minutes, DEMO_LIMITS.day.minutes])).rows[0];
  if (r.short >= DEMO_LIMITS.short.n || r.hour >= DEMO_LIMITS.hour.n || r.all_demos >= DEMO_LIMITS.all.n || r.day >= DEMO_LIMITS.day.n) return false;
  await db.query('INSERT INTO demo_agent_calls(workspace_id) VALUES($1)', [ws]);
  await db.query("DELETE FROM demo_agent_calls WHERE at<now()-interval '25 hours'");
  return true;
 });
}
