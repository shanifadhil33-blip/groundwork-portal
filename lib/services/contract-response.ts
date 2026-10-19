import { inWorkspace, allow } from './shared';
import { localDate } from '../dates';

export type ResponseWatchItem={id:string;order_number:number;title:string;client_name:string;site_name:string;due_at:string;state:'missed'|'close';why:string};
/** One clock for every comparison. A job missed more than a week ago drops off this list (it still shows under Late jobs), so old history never floods the warning. Rows are read under the caller's membership and RLS. */
export async function responseWatch(user:string,ws:string,now:Date=new Date()):Promise<ResponseWatchItem[]>{
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin','staff']);
  const timezone=(await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[ws])).rows[0].timezone;
  const jobs=(await c.db.query(`SELECT o.id,o.order_number,o.title,cl.name AS client_name,s.name AS site_name,
   o.created_at,o.scheduled_for,cl.contract_response_hours
   FROM work_orders o JOIN clients cl ON cl.workspace_id=o.workspace_id AND cl.id=o.client_id
   JOIN sites s ON s.workspace_id=o.workspace_id AND s.id=o.site_id
   WHERE o.workspace_id=$1 AND cl.contract_response_hours IS NOT NULL
   AND (cl.contract_ends_on IS NULL OR cl.contract_ends_on >= $2::date)
   AND o.on_way_at IS NULL AND o.status NOT IN ('in_progress','done','cancelled')
   AND o.created_at >= $3::timestamptz - make_interval(hours => cl.contract_response_hours + 168)`,[ws,localDate(now,timezone),now.toISOString()])).rows;
  const items:ResponseWatchItem[]=[];
  for(const j of jobs){
   const start=new Date(j.created_at).getTime(),window=j.contract_response_hours*3600000,due=start+window;
   const missed=now.getTime()>due,booked=j.scheduled_for&&new Date(j.scheduled_for).getTime()>due;
   if(!missed&&!booked&&now.getTime()<start+window*.75)continue;
   items.push({id:j.id,order_number:j.order_number,title:j.title,client_name:j.client_name,site_name:j.site_name,due_at:new Date(due).toISOString(),state:missed?'missed':'close',
    why:missed?'The promised time has passed and nobody is on the way yet.':booked?'The booked visit is after the promised time.':'Most of the promised time has passed and nobody is on the way yet.'});
  }
  return items.sort((a,b)=>(a.state===b.state?0:a.state==='missed'?-1:1)||a.due_at.localeCompare(b.due_at)||a.id.localeCompare(b.id));
 });
}
