import { z } from 'zod';
import { allow,inWorkspace,row } from './shared';
import { overdueSql } from '../dates';
export async function ownerOverview(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 allow(c,['admin']);const workspace=await row(c,'workspaces',ws);
 const jobs=(await c.db.query(`SELECT count(*) FILTER(WHERE status='done')::int AS jobs_done,count(*) FILTER(WHERE ${overdueSql})::int AS late_jobs,
 count(*) FILTER(WHERE status='waiting_on_parts' OR report_outcome='cant_fix' OR quote_status='declined')::int AS customer_issues FROM work_orders WHERE workspace_id=$1`,[ws])).rows[0];
 const money=(await c.db.query("SELECT (coalesce(sum(amount) FILTER(WHERE direction='in'),0)+(SELECT coalesce(sum(quote_amount),0) FROM work_orders WHERE workspace_id=$1 AND payment_status='paid' AND quote_status='approved' AND status<>'cancelled'))::text AS money_in,coalesce(sum(amount) FILTER(WHERE direction='out'),0)::text AS money_out FROM workspace_money WHERE workspace_id=$1 AND currency=$2",[ws,workspace.currency])).rows[0];
 return {...jobs,...money,currency:workspace.currency};
});}
export async function addMoney(user:string,ws:string,body:unknown){const data=z.object({direction:z.enum(['in','out']),amount:z.number().finite().min(0).max(999999999999.99),note:z.string().trim().max(1000).default('')}).strict().parse(body);return inWorkspace(user,ws,async c=>{allow(c,['admin']);const w=await row(c,'workspaces',ws);return (await c.db.query('INSERT INTO workspace_money(workspace_id,direction,amount,currency,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[ws,data.direction,data.amount,w.currency,data.note,user])).rows[0];});}
