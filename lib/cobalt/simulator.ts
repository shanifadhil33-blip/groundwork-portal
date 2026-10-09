import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ApiError } from '../http';
export const supplierLabel='simulated supplier, part of this repo';
export const cobaltStatus=z.enum(['ordered','shipped','delivered','cancelled']);
export const eventSchema=z.object({workspace_id:z.uuid(),cobalt_ref:z.string().min(1).max(200),event_id:z.string().min(1).max(200),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),status:cobaltStatus,occurred_at:z.iso.datetime({offset:true})}).strict();
export type CobaltEvent=z.infer<typeof eventSchema>;
// Simulated supplier, part of this repo; callers never write portal projections here.
export async function appendEvent(db:PoolClient,ws:string,ref:string,status:string,drop=false):Promise<CobaltEvent> {
 await db.query('INSERT INTO cobalt_state(workspace_id) VALUES($1) ON CONFLICT DO NOTHING',[ws]);
 const sequence=Number((await db.query('UPDATE cobalt_state SET sequence=sequence+1 WHERE workspace_id=$1 RETURNING sequence',[ws])).rows[0].sequence);
 const event: CobaltEvent={workspace_id:ws,cobalt_ref:ref,event_id:randomUUID(),sequence,status:cobaltStatus.parse(status),occurred_at:new Date().toISOString()};
 await db.query('INSERT INTO cobalt_events(workspace_id,cobalt_ref,event_id,sequence,status,occurred_at,dropped) VALUES($1,$2,$3,$4,$5,$6,$7)',[ws,ref,event.event_id,sequence,status,event.occurred_at,drop]);
 return event;
}
export async function sourceSnapshot(db:PoolClient,ws:string,since=0) {
 const state=(await db.query('SELECT outage FROM cobalt_state WHERE workspace_id=$1',[ws])).rows[0];
 if(state?.outage)throw new ApiError(503,'cobalt_unavailable','Cobalt is unavailable right now. Try again.');
 const orders=(await db.query('SELECT cobalt_ref,work_order_id,status FROM cobalt_orders WHERE workspace_id=$1 ORDER BY cobalt_ref',[ws])).rows;
 const events=(await db.query('SELECT workspace_id,cobalt_ref,event_id,sequence,status,occurred_at FROM cobalt_events WHERE workspace_id=$1 AND sequence>$2 ORDER BY sequence',[ws,since])).rows.map(e=>({...e,sequence:Number(e.sequence),occurred_at:e.occurred_at.toISOString()}));
 return {supplier:supplierLabel,orders,events,cursor:events.length?events[events.length-1].sequence:since};
}
