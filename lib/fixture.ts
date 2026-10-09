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

type FixtureIds=typeof ids;
export async function populateFixture(client:PoolClient,ids:FixtureIds,siteId:(n:number)=>string,orderId:(n:number)=>string,demo=false) {
 const prefix=demo?ids.ridgeline+':':'';
  for (const [id,name] of ([[ids.dana,'Dana'],[ids.sam,'Sam'],[ids.priya,'Priya'],[ids.omar,'Omar'],...(demo?[]:[[ids.summitAdmin,'Alex']])])) {
   await client.query('INSERT INTO users(id,name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,$3,$4,$5,$6)',[id,name,demo?`${name.toLowerCase()}.${ids.ridgeline}@demo.groundwork.invalid`:`${name.toLowerCase()}@${name==='Alex'?'summit':'ridgeline'}.example`,demo,demo?ids.ridgeline:null,demo?name.toLowerCase():null]);
  }
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.dana]);
  if(!demo) await client.query('INSERT INTO workspaces(id,name,is_demo) VALUES($1,$2,false),($3,$4,false)',[ids.ridgeline,'Ridgeline Facility Services',ids.summit,'Summit Property Care']);
  for (const [id,ws,name] of [[ids.harbor,ids.ridgeline,'Harbor & Pine Coworking'],[ids.northgate,ids.ridgeline,'Northgate Self Storage'],[ids.larkspur,ids.ridgeline,'Larkspur Coworking Studio'],...(demo?[]:[[ids.summitClient,ids.summit,'Juniper Business Park']])]) await client.query('INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,$3)',[id,ws,name]);
  for (const [ws,user,role,company] of [[ids.ridgeline,ids.dana,'admin',null],[ids.ridgeline,ids.sam,'staff',null],[ids.ridgeline,ids.priya,'client',ids.harbor],[ids.ridgeline,ids.omar,'client',ids.northgate],...(demo?[]:[[ids.summit,ids.summitAdmin,'admin',null]])]) await client.query('INSERT INTO members(workspace_id,user_id,role,client_id) VALUES($1,$2,$3,$4)',[ws,user,role,company]);
  const names=['Marina Exchange','Pine Terrace','Harbor Annex','Northgate East','Northgate West','Larkspur Loft','Juniper Court'];
  for (let n=1;n<=(demo?6:7);n++) await client.query('INSERT INTO sites(id,workspace_id,client_id,name,address) VALUES($1,$2,$3,$4,$5)',[siteId(n),n===7?ids.summit:ids.ridgeline,n<=3?ids.harbor:n<=5?ids.northgate:n===6?ids.larkspur:ids.summitClient,names[n-1],`${n*12} Example Avenue, Suite ${n}`]);
  const tasks=['Replace lobby light fixture','Service rooftop ventilation','Repair entry door closer','Inspect emergency lighting','Seal loading bay threshold','Replace washroom tap','Adjust meeting room cooling','Repair stairwell handrail','Clear courtyard drainage','Test access control reader','Replace corridor ceiling tile','Service water pump'];
  const statuses=['open','scheduled','in_progress','waiting_on_parts','done','cancelled'];
  const priorities=['low','normal','high','urgent'];
  for(let n=1;n<=(demo?60:66);n++) {
   const summit=n>60; const site=summit?7:((n-1)%5)+1;
   const ws=summit?ids.summit:ids.ridgeline; const company=summit?ids.summitClient:site<=3?ids.harbor:ids.northgate; const actor=summit?ids.summitAdmin:n%3===0?ids.sam:ids.dana;
   await client.query("SELECT set_config('app.user_id',$1,true)",[actor]);
   await client.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)',[orderId(n),ws,company,siteId(site),`${tasks[(n-1)%tasks.length]} — ${names[site-1]} / ${n}`,`Routine facilities request ${n}; coordinate access with the site manager.`,statuses[(n-1)%6],priorities[Math.floor((n-1)/6)%4],summit?ids.summitAdmin:ids.sam,new Date(Date.now()+(n-30)*86400000),actor,new Date(Date.now()-(70-n)*86400000)]);
   if(n<=18) for(const visibility of ['client','internal']) await client.query('INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id) VALUES($1,$2,$3,$4,$5,$6)',[ws,company,orderId(n),visibility==='client'?'We have received your request and are arranging access.':'Check stock and technician availability before scheduling.',visibility,actor]);
   if(n<=4) await client.query('INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,$3)',[ws,orderId(n),`${prefix}COBALT-DEMO-${n}`]);
  }
  // Simulated supplier, part of this repo: four matching source orders, with
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
 await client.query("INSERT INTO import_rows(workspace_id,import_id,row_number,data,queued) VALUES($1,$2,1,$3,true)",[ids.ridgeline,imp,JSON.stringify({title:'Inspect reception lighting',site_id:siteId(1),client_id:ids.harbor,priority:'normal',description:'Sample request',scheduled_for:null})]);
 for(const user of [ids.sam,ids.omar])await client.query("INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,'request_created',$3)",[user,ids.ridgeline,orderId(user===ids.sam?1:4)]);
 }
}
