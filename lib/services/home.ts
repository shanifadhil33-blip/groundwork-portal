import { inWorkspace, type Context } from './shared';
import { overdueSql, todaySql } from '../dates';

/** One row on Home that asks this person to decide something. Counts are always shown with their words. */
export type NeedsYouRow = { kind: string; count: number; href: string };

/**
 * Everything the office Home shows, in one request: today's numbers, the Needs you rows (urgent first)
 * and, for the owner and admin, this month's money. The counts come from the same rules as Jobs and
 * Schedule (overdueSql, todaySql), so the numbers match on every screen.
 */
export async function homeSummary(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    const office = c.role === 'admin' || c.role === 'staff';
    const jobs = (await c.db.query(
      `SELECT count(*) FILTER (WHERE ${todaySql})::int AS today,
              count(*) FILTER (WHERE ${overdueSql})::int AS late,
              count(*) FILTER (WHERE assignee_id IS NULL AND status IN ('open','scheduled') AND archived_at IS NULL)::int AS without_technician,
              count(*) FILTER (WHERE ${todaySql} AND assignee_id = $2)::int AS mine_today
         FROM work_orders WHERE workspace_id = $1 AND archived_at IS NULL`, [ws, user])).rows[0];
    const needs: NeedsYouRow[] = [];
    if (office) {
      const q = (await c.db.query(
        `SELECT (SELECT count(*)::int FROM job_suggestions WHERE workspace_id=$1 AND status='pending')
              + (SELECT count(*)::int FROM import_rows WHERE workspace_id=$1 AND queued AND decision='pending') AS to_approve,
                (SELECT count(*)::int FROM agent_questions WHERE workspace_id=$1 AND status='open') AS questions,
                (SELECT count(*)::int FROM time_off WHERE workspace_id=$1 AND status='pending') AS time_off,
                (SELECT count(*)::int FROM lesson_proposals WHERE workspace_id=$1 AND status='waiting') AS lessons,
                (SELECT count(*)::int FROM company_documents WHERE workspace_id=$1 AND archived_at IS NULL AND expires_on IS NOT NULL
                   AND expires_on <= (CURRENT_TIMESTAMP AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date + 30) AS documents`, [ws])).rows[0];
      const add = (kind: string, count: number, href: string) => { if (count > 0) needs.push({ kind, count, href }); };
      add('to_approve', q.to_approve, '/work-orders?tab=approve');
      add('without_technician', jobs.without_technician, '/work-orders?assignee_id=unassigned&active=true');
      add('questions', q.questions, '/messages');
      add('time_off', q.time_off, '/team');
      if (c.role === 'admin') add('documents', q.documents, '/settings?group=company');
      if (c.role === 'admin') add('lessons', q.lessons, '/settings?group=agent');
    }
    if (jobs.mine_today > 0) needs.push({ kind: 'mine_today', count: jobs.mine_today, href: `/work-orders?assignee_id=${user}&today=true` });
    const money = c.role === 'admin' ? await monthMoney(c) : null;
    // Setup for a real new company, worked out from its data, so every phone shows the same progress.
    let setup: { clients: boolean; team: boolean; jobs: boolean } | null = null;
    if (c.role === 'admin') {
      const row = (await c.db.query(
        `SELECT w.is_demo,
                EXISTS (SELECT 1 FROM clients WHERE workspace_id=$1) AS clients,
                EXISTS (SELECT 1 FROM members WHERE workspace_id=$1 AND user_id<>$2 AND role<>'client' AND archived_at IS NULL)
                  OR EXISTS (SELECT 1 FROM invites WHERE workspace_id=$1) AS team,
                EXISTS (SELECT 1 FROM work_orders WHERE workspace_id=$1) AS jobs
           FROM workspaces w WHERE w.id=$1`, [ws, user])).rows[0];
      if (row && !row.is_demo && !(row.clients && row.team && row.jobs)) setup = { clients: row.clients, team: row.team, jobs: row.jobs };
    }
    return { today: jobs.today, late: jobs.late, without_technician: jobs.without_technician, needs, money, setup };
  });
}

async function monthMoney(c: Context) {
  const row = (await c.db.query(
    `WITH w AS (SELECT currency, timezone FROM workspaces WHERE id=$1),
          start AS (SELECT date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE w.timezone) AT TIME ZONE w.timezone AS at FROM w)
     SELECT (SELECT currency FROM w) AS currency,
            ((SELECT coalesce(sum(amount),0) FROM workspace_money WHERE workspace_id=$1 AND direction='in' AND currency=(SELECT currency FROM w) AND created_at >= (SELECT at FROM start))
             + (SELECT coalesce(sum(quote_amount),0) FROM work_orders WHERE workspace_id=$1 AND payment_status='paid' AND quote_status='approved' AND status<>'cancelled' AND updated_at >= (SELECT at FROM start)))::text AS money_in,
            (SELECT coalesce(sum(amount),0) FROM workspace_money WHERE workspace_id=$1 AND direction='out' AND currency=(SELECT currency FROM w) AND created_at >= (SELECT at FROM start))::text AS money_out`, [c.ws])).rows[0];
  return { currency: row.currency as string, in: Number(row.money_in), out: Number(row.money_out) };
}
