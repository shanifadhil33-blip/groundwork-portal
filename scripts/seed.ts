import type { PoolClient } from 'pg';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runOwner } from './migrate';
export const ids = {
  dana: '10000000-0000-4000-8000-000000000001', sam: '10000000-0000-4000-8000-000000000002',
  priya: '10000000-0000-4000-8000-000000000003', omar: '10000000-0000-4000-8000-000000000004',
  summitAdmin: '10000000-0000-4000-8000-000000000005',
  ridgeline: '20000000-0000-4000-8000-000000000001', summit: '20000000-0000-4000-8000-000000000002',
  harbor: '30000000-0000-4000-8000-000000000001', northgate: '30000000-0000-4000-8000-000000000002',
  larkspur: '30000000-0000-4000-8000-000000000003', summitClient: '30000000-0000-4000-8000-000000000004',
};
export const siteId = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const orderId = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function seed(client: PoolClient) {
 await client.query('BEGIN');
 try {
  // Development fixture reset: deliberate owner-only TRUNCATE, including auth data.
  await client.query('TRUNCATE workspaces,clients,members,sites,work_orders,comments,invites,imports,import_rows,supplier_orders,supplier_events,audit_log,notifications,work_order_events,users,accounts,sessions,verification_token CASCADE');
  for (const [id,name] of [[ids.dana,'Dana'],[ids.sam,'Sam'],[ids.priya,'Priya'],[ids.omar,'Omar'],[ids.summitAdmin,'Alex']]) {
   await client.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,name,`${name.toLowerCase()}@${name==='Alex'?'summit':'ridgeline'}.example`]);
  }
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.dana]);
  await client.query('INSERT INTO workspaces(id,name,is_demo) VALUES($1,$2,true),($3,$4,true)',[ids.ridgeline,'Ridgeline Facility Services',ids.summit,'Summit Property Care']);
  for (const [id,ws,name] of [[ids.harbor,ids.ridgeline,'Harbor & Pine Coworking'],[ids.northgate,ids.ridgeline,'Northgate Self Storage'],[ids.larkspur,ids.ridgeline,'Larkspur Coworking Studio'],[ids.summitClient,ids.summit,'Juniper Business Park']]) await client.query('INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,$3)',[id,ws,name]);
  for (const [ws,user,role,company] of [[ids.ridgeline,ids.dana,'admin',null],[ids.ridgeline,ids.sam,'staff',null],[ids.ridgeline,ids.priya,'client',ids.harbor],[ids.ridgeline,ids.omar,'client',ids.northgate],[ids.summit,ids.summitAdmin,'admin',null]]) await client.query('INSERT INTO members(workspace_id,user_id,role,client_id) VALUES($1,$2,$3,$4)',[ws,user,role,company]);
  const names=['Marina Exchange','Pine Terrace','Harbor Annex','Northgate East','Northgate West','Larkspur Loft','Juniper Court'];
  for (let n=1;n<=7;n++) await client.query('INSERT INTO sites(id,workspace_id,client_id,name,address) VALUES($1,$2,$3,$4,$5)',[siteId(n),n===7?ids.summit:ids.ridgeline,n<=3?ids.harbor:n<=5?ids.northgate:n===6?ids.larkspur:ids.summitClient,names[n-1],`${n*12} Example Avenue, Suite ${n}`]);
  const tasks=['Replace lobby light fixture','Service rooftop ventilation','Repair entry door closer','Inspect emergency lighting','Seal loading bay threshold','Replace washroom tap','Adjust meeting room cooling','Repair stairwell handrail','Clear courtyard drainage','Test access control reader','Replace corridor ceiling tile','Service water pump'];
  const statuses=['open','scheduled','in_progress','waiting_on_parts','done','cancelled'];
  const priorities=['low','normal','high','urgent'];
  for(let n=1;n<=66;n++) {
   const summit=n>60; const site=summit?7:((n-1)%5)+1;
   const ws=summit?ids.summit:ids.ridgeline; const company=summit?ids.summitClient:site<=3?ids.harbor:ids.northgate; const actor=summit?ids.summitAdmin:n%3===0?ids.sam:ids.dana;
   await client.query("SELECT set_config('app.user_id',$1,true)",[actor]);
   await client.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)',[orderId(n),ws,company,siteId(site),`${tasks[(n-1)%tasks.length]} — ${names[site-1]} / ${n}`,`Routine facilities request ${n}; coordinate access with the site manager.`,statuses[(n-1)%6],priorities[Math.floor((n-1)/6)%4],summit?ids.summitAdmin:ids.sam,new Date(Date.UTC(2026,8,1+n)),actor,new Date(Date.UTC(2026,7,1+n))]);
   if(n<=18) for(const visibility of ['client','internal']) await client.query('INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id) VALUES($1,$2,$3,$4,$5,$6)',[ws,company,orderId(n),visibility==='client'?'We have received your request and are arranging access.':'Check stock and technician availability before scheduling.',visibility,actor]);
   if(n<=4) await client.query('INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,$3)',[ws,orderId(n),`COBALT-DEMO-${n}`]);
  }
  await client.query('INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,$3,$4)',[ids.priya,ids.ridgeline,'request_created',orderId(1)]);
  await client.query('COMMIT');
 } catch(error) { await client.query('ROLLBACK'); throw error; }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) { await runOwner(seed); console.log('Seed reset and inserted.'); }
