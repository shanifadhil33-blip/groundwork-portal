import { localDate, scheduledInstant } from './dates';
import type { PoolClient } from 'pg';
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

// Preserve the early lifecycle examples and Northgate pagination fixtures.
export function fixtureStatus(n:number) {
 if([13,37,43,12].includes(n))return 'in_progress';
 if([8,14,20,26,32,10,16,22,28,34,40,46,18,24,30,36,42,48,54].includes(n))return 'done';
 return ['open','scheduled','in_progress','waiting_on_parts','done','cancelled'][(n-1)%6];
}

const dayOffset=(day:string,offset:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+offset*86400000).toISOString().slice(0,10);
// Repeatable values for a given workspace day; independent of the seed's clock time.
export function fixtureDates(n:number,today:string,timezone:string) {
 const createdDay=dayOffset(today,-(8+(n*13)%74));
 const created=new Date(scheduledInstant(createdDay,timezone,[8,10,14,16,11,9,15][n%7])!);
 created.setUTCMinutes([5,20,35,45,10,25][n%6]);
 const due=n%11===0?null:dayOffset(today,(n*17)%47-25);
 const visit=fixtureStatus(n)==='open'?null:scheduledInstant(dayOffset(due??today,-(n%3)),timezone,[9,11,14,16][n%4]);
 return {created,due,visit,updated:new Date(created.getTime()+2*86400000+((n*23)%180)*60000)};
}
type FixtureIds=typeof ids;
export async function populateFixture(client:PoolClient,ids:FixtureIds,siteId:(n:number)=>string,orderId:(n:number)=>string,demo=false,supplierSandbox=false) {
 const prefix=demo?ids.ridgeline+':':''; // Supplier references and event IDs stay unique across sandboxes.
  for (const [id,name] of ([[ids.dana,'Dana'],[ids.sam,'Sam'],[ids.priya,'Priya'],[ids.omar,'Omar'],...(demo?[]:[[ids.summitAdmin,'Alex']])])) {
   await client.query('INSERT INTO users(id,name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,$3,$4,$5,$6)',[id,name,(demo||supplierSandbox)?`${name.toLowerCase()}.${ids.ridgeline}@demo.groundwork.invalid`:`${name.toLowerCase()}@${name==='Alex'?'summit':'ridgeline'}.demo`,(demo||supplierSandbox),(demo||supplierSandbox)?(name==='Alex'?ids.summit:ids.ridgeline):null,(demo||supplierSandbox)?(name==='Alex'?'dana':name.toLowerCase()):null]);
  }
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.dana]);
  if(!demo) await client.query("INSERT INTO workspaces(id,name,is_demo,demo_expires_at) VALUES($1,$2,$5,CASE WHEN $5 THEN now()+interval '24 hours' END),($3,$4,$5,CASE WHEN $5 THEN now()+interval '24 hours' END)",[ids.ridgeline,'Ridgeline Facility Services',ids.summit,'Summit Property Care',supplierSandbox]);
  for (const [id,ws,name] of [[ids.harbor,ids.ridgeline,'Harbor & Pine Coworking'],[ids.northgate,ids.ridgeline,'Northgate Self Storage'],[ids.larkspur,ids.ridgeline,'Larkspur Coworking Studio'],...(demo?[]:[[ids.summitClient,ids.summit,'Juniper Business Park']])]) await client.query('INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,$3)',[id,ws,name]);
  for (const [ws,user,role,company] of [[ids.ridgeline,ids.dana,'admin',null],[ids.ridgeline,ids.sam,'staff',null],[ids.ridgeline,ids.priya,'client',ids.harbor],[ids.ridgeline,ids.omar,'client',ids.northgate],...(demo?[]:[[ids.summit,ids.summitAdmin,'admin',null]])]) await client.query('INSERT INTO members(workspace_id,user_id,role,client_id) VALUES($1,$2,$3,$4)',[ws,user,role,company]);
  const names=['Marina Exchange','Pine Terrace','Harbor Annex','Northgate East','Northgate West','Larkspur Loft','Juniper Court'];
  for (let n=1;n<=(demo?6:7);n++) await client.query('INSERT INTO sites(id,workspace_id,client_id,name,address) VALUES($1,$2,$3,$4,$5)',[siteId(n),n===7?ids.summit:ids.ridgeline,n<=3?ids.harbor:n<=5?ids.northgate:n===6?ids.larkspur:ids.summitClient,names[n-1],`${n*12} Example Avenue, Suite ${n}`]);
  const tasks=['Replace lobby light fixture','Service rooftop ventilation','Repair entry door closer','Inspect emergency lighting','Seal loading bay threshold','Replace washroom tap','Adjust meeting room cooling','Repair stairwell handrail','Clear courtyard drainage','Test access control reader','Replace corridor ceiling tile','Service water pump'];
  const priorities=['low','normal','high','urgent'];
  const timezone=(await client.query('SELECT timezone FROM workspaces WHERE id=$1',[ids.ridgeline])).rows[0].timezone;
  const today=localDate(Date.now(),timezone);
  for(let n=1;n<=(demo?60:66);n++) {
   const summit=n>60; const site=summit?7:((n-1)%5)+1;
   const ws=summit?ids.summit:ids.ridgeline; const company=summit?ids.summitClient:site<=3?ids.harbor:ids.northgate; const actor=summit?ids.summitAdmin:n%3===0?ids.sam:ids.dana;
   await client.query("SELECT set_config('app.user_id',$1,true)",[actor]);
   const dates=fixtureDates(n,today,timezone), assigned=summit?ids.summitAdmin:[ids.sam,ids.dana,null,ids.sam,ids.sam,ids.dana,null][(n-1)%7];
   const title=tasks[(n-1)%tasks.length];
   await client.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,due_on,order_number,external_ref,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[orderId(n),ws,company,siteId(site),title,`Routine facilities request ${n}; coordinate access with the site manager.`,fixtureStatus(n),n===1?'low':priorities[(n*7+Math.floor(n/5))%4],assigned,dates.visit,dates.due,summit?n-60:n,n===1?'QA-1001':null,actor,dates.created,dates.updated]);
   const history: {kind:string;body:string;details:Record<string,unknown>}[]=[];
   const finalStatus=fixtureStatus(n);
   const stages=finalStatus==='open'?[]:finalStatus==='cancelled'?['scheduled','cancelled']:finalStatus==='scheduled'?['scheduled']:finalStatus==='in_progress'?['scheduled','in_progress']:finalStatus==='waiting_on_parts'?['scheduled','in_progress','waiting_on_parts']:['scheduled','in_progress','done'];
   for(const [index,to_status] of stages.entries())history.push({kind:'status_changed',body:'Status updated',details:{from_status:stages[index-1]??'open',to_status}});
   for(const [index,event] of history.entries())await client.query('INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[ws,company,orderId(n),actor,event.kind,event.body,JSON.stringify(event.details),new Date(dates.created.getTime()+(index+1)*7200000)]);
   if(n<=18) for(const [index,visibility] of ['client','internal'].entries()) await client.query('INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[ws,company,orderId(n),visibility==='client'?'We have received your request and confirmed access with the site manager.':'Check stock and technician availability before the next visit.',visibility,actor,new Date(dates.updated.getTime()-(2-index)*3600000)]);
   if(n<=4) await client.query('INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,$3)',[ws,orderId(n),`${prefix}COBALT-DEMO-${n}`]);
  }
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.dana]);
  // Simulated supplier, part of this portfolio demo: four matching source orders, with
  // one delivered event deliberately absent from the portal receipt ledger.
  await client.query('INSERT INTO cobalt_state(workspace_id,sequence) VALUES($1,6)',[ids.ridgeline]);
  for(let n=1;n<=4;n++) {
   const ref=`${prefix}COBALT-DEMO-${n}`;
   await client.query("INSERT INTO cobalt_orders(workspace_id,work_order_id,cobalt_ref,status) VALUES($1,$2,$3,$4)",[ids.ridgeline,orderId(n),ref,n===4?'delivered':'ordered']);
   await client.query("INSERT INTO cobalt_events(workspace_id,cobalt_ref,event_id,sequence,status) VALUES($1,$2,$3,$4,'ordered')",[ids.ridgeline,ref,`${prefix}demo-ordered-${n}`,n]);
   await client.query("INSERT INTO supplier_events(workspace_id,cobalt_ref,event_id,sequence,status,received_via) VALUES($1,$2,$3,$4,'ordered','webhook')",[ids.ridgeline,ref,`${prefix}demo-ordered-${n}`,n]);
   await client.query('UPDATE supplier_orders SET last_sequence=$3 WHERE workspace_id=$1 AND cobalt_ref=$2',[ids.ridgeline,ref,n]);
  }
  await client.query("INSERT INTO cobalt_events(workspace_id,cobalt_ref,event_id,sequence,status,dropped) VALUES($1,$2,$3,5,'shipped',false),($1,$2,$4,6,'delivered',true)",[ids.ridgeline,prefix+'COBALT-DEMO-4',prefix+'demo-shipped-4',prefix+'demo-delivered-4'].slice(0,4));
  await client.query("INSERT INTO supplier_events(workspace_id,cobalt_ref,event_id,sequence,status,received_via) VALUES($1,$2,$3,5,'shipped','webhook')",[ids.ridgeline,prefix+'COBALT-DEMO-4',prefix+'demo-shipped-4',prefix+'demo-delivered-4'].slice(0,3));
  await client.query("UPDATE supplier_orders SET local_status='shipped',last_sequence=5 WHERE workspace_id=$1 AND cobalt_ref=$2",[ids.ridgeline,prefix+'COBALT-DEMO-4',prefix+'demo-shipped-4',prefix+'demo-delivered-4'].slice(0,2));
  await client.query('INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,$3,$4)',[ids.priya,ids.ridgeline,'request_created',orderId(1)]);

 if(demo){
 const imp=(await client.query("INSERT INTO imports(workspace_id,filename,row_count,status,created_by) VALUES($1,'sample.csv',1,'queued',$2) RETURNING id",[ids.ridgeline,ids.sam])).rows[0].id;
 await client.query("INSERT INTO import_rows(workspace_id,import_id,row_number,data,queued) VALUES($1,$2,1,$3,true)",[ids.ridgeline,imp,JSON.stringify({title:'Inspect reception lighting',site:'Marina Exchange',client:'Harbor & Pine Coworking',site_id:siteId(1),client_id:ids.harbor,priority:'normal',description:'Sample request',due_on:dayOffset(today,8),scheduled_for:dayOffset(today,6),external_ref:''})]);
 for(const user of [ids.sam,ids.omar])await client.query("INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,'request_created',$3)",[user,ids.ridgeline,orderId(user===ids.sam?1:4)]);
 }
 // Creation events are inserted at record creation; updates/comments follow them.
 await client.query("UPDATE notifications n SET created_at=o.updated_at FROM work_orders o WHERE n.workspace_id=$1 AND n.entity_id=o.id",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=o.created_at FROM work_orders o WHERE a.workspace_id=$1 AND a.entity_id=o.id AND a.entity='work_orders' AND a.action='insert'",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=e.created_at FROM work_order_events e WHERE a.workspace_id=$1 AND a.entity_id=e.id AND a.entity='work_order_events'",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=c.created_at FROM comments c WHERE a.workspace_id=$1 AND a.entity_id=c.id AND a.entity='comments'",[ids.ridgeline]);
}
