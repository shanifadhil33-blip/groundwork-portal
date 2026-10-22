import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
/** Demo case 3: same visible client, technician statement, held price and quote visit request. */
export async function populateQuoteFixture(db:PoolClient,ids:typeof fixtureIds) {
 const ws=ids.ridgeline;
 const job=(await db.query("SELECT * FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status NOT IN ('done','cancelled') AND quote_status='pending' ORDER BY order_number LIMIT 1",[ws,ids.harbor])).rows[0];
 if(!job)throw new Error('Demo case three needs a client quote job.');
 await db.query("UPDATE work_orders SET title='Adjust meeting room cooling',trade='ac',assignee_id=$3,created_by=$4,quote_note='The fan motor needs replacing. Parts and labour.',quote_amount=850 WHERE workspace_id=$1 AND id=$2",[ws,job.id,ids.ravi,ids.pranav]);
 if(job.status==='open')await db.query("UPDATE work_orders SET status='scheduled' WHERE id=$1",[job.id]);
 await db.query("UPDATE work_orders SET status='in_progress' WHERE id=$1",[job.id]);
 const finding={words:'It is not just a filter. The fan motor needs replacing. This will cost more.',technician_name:'Ravi'};
 for(const state of ['waiting_price','pending'])await db.query("INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES($1,$2,$3,$4,'price_change',$5,$6,clock_timestamp())",[ws,job.client_id,job.id,state==='pending'?ids.imran:ids.ravi,state==='pending'?'Waiting for the client':'Price changed',JSON.stringify({...finding,state})]);
 await db.query("INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,title,problem,visit_charge_shown) VALUES($1,'client',$2,'Pranav Menon',$3,$4,'Quote visit','How much will it cost to fix my water heater?',150)",[ws,ids.pranav,job.client_id,job.site_id]);
}
