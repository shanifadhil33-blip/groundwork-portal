import { ApiError, missing } from '../http';
import { isOffice } from '../roles';
import { inWorkspace, uuid } from './shared';
/**
 * LEARN10: learning from each company's own history, with "based on n jobs". Only real records: the time from the booked visit
 * to the technician's report on finished jobs of the same trade, and repeat faults of the same trade at the same site in the last
 * 6 months. Row level security keeps every number inside the company (LEARN13). No AI, no invented or simulated numbers.
 */
export const MIN_JOBS = 3;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export type CompanyHistory = { trade: string | null; based_on: number; typical_minutes: number | null; site_repeat: { count: number; temporary: number; since: string } | null };
export async function companyHistory(user: string, ws: string, id: string): Promise<CompanyHistory> {
 uuid.parse(id);
 return inWorkspace(user, ws, async c => {
  if (!isOffice(c.role)) throw new ApiError(403, 'forbidden', 'Company history is for the office.');
  const job = (await c.db.query('SELECT id,trade,site_id FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0]; if (!job) throw missing();
  const mins = (await c.db.query(`SELECT extract(epoch FROM report_at - scheduled_for)/60 AS m FROM work_orders
   WHERE workspace_id=$1 AND id<>$2 AND status='done' AND trade IS NOT DISTINCT FROM $3 AND report_at IS NOT NULL AND scheduled_for IS NOT NULL
   AND report_at>scheduled_for AND report_at - scheduled_for<interval '12 hours'`, [ws, id, job.trade])).rows.map(r => Number(r.m));
  const rep = (await c.db.query(`SELECT count(*)::int n, count(*) FILTER (WHERE report_outcome='temporary')::int t, min(coalesce(report_at,updated_at)) since FROM work_orders
   WHERE workspace_id=$1 AND id<>$2 AND site_id=$3 AND status='done' AND trade IS NOT DISTINCT FROM $4 AND coalesce(report_at,updated_at)>now()-interval '6 months'`, [ws, id, job.site_id, job.trade])).rows[0];
  return { trade: job.trade, based_on: mins.length, typical_minutes: mins.length >= MIN_JOBS ? Math.max(15, Math.round(median(mins) / 15) * 15) : null,
   site_repeat: rep.n >= 2 ? { count: rep.n, temporary: rep.t, since: new Date(rep.since).toISOString() } : null };
 });
}
