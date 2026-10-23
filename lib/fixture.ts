import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription } from './demo-job-copy';
import { populateQuoteFixture } from './fixture-quotes';
import { populateChecklistFixture } from './fixture-checklists';
import { populateCompanyJoiningFixture } from './fixture-company-joining';
import { populateIdentityFixture } from './fixture-identity';
import { localDate, scheduledInstant } from './dates';
import type { PoolClient } from 'pg';
import { populateNotificationFixture } from './fixture-notifications';
import { populateProofFixture } from './fixture-proof';
import { populateDecisionFixture } from './fixture-decisions';
import { populateFollowUpFixture } from './fixture-follow-ups';
import { populateCompanyMemoryFixture } from './fixture-company-memory';
export const ids = {
  imran: '10000000-0000-4000-8000-000000000001', sam: '10000000-0000-4000-8000-000000000002',
  pranav: '10000000-0000-4000-8000-000000000003', omar: '10000000-0000-4000-8000-000000000004',
  summitAdmin: '10000000-0000-4000-8000-000000000005', ravi: '10000000-0000-4000-8000-000000000006',
  nabil: '10000000-0000-4000-8000-000000000007', kevin: '10000000-0000-4000-8000-000000000008', faisal: '10000000-0000-4000-8000-000000000009',
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
  for (const [id,name] of ([[ids.imran,'Imran'],[ids.sam,'Sam'],[ids.pranav,'Pranav'],[ids.omar,'Omar'],[ids.ravi,'Ravi'],[ids.nabil,'Nabil'],[ids.kevin,'Kevin'],[ids.faisal,'Faisal'],...(demo?[]:[[ids.summitAdmin,'Alex']])])) {
   await client.query('INSERT INTO users(id,name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,$3,$4,$5,$6)',[id,name,(demo||supplierSandbox)?`${name.toLowerCase()}.${ids.ridgeline}@demo.groundwork.invalid`:`${name.toLowerCase()}@${name==='Alex'?'summit':'ridgeline'}.demo`,(demo||supplierSandbox),(demo||supplierSandbox)?(name==='Alex'?ids.summit:ids.ridgeline):null,(demo||supplierSandbox)?(name==='Alex'?'imran':name.toLowerCase()):null]);
  }
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  if(!demo) await client.query("INSERT INTO workspaces(id,name,is_demo,demo_expires_at,country,region,currency) VALUES($1,$2,$5,CASE WHEN $5 THEN now()+interval '24 hours' END,'AE','Dubai','AED'),($3,$4,$5,CASE WHEN $5 THEN now()+interval '24 hours' END,'AE','Abu Dhabi','AED')",[ids.ridgeline,'Ridgeline Facility Services',ids.summit,'Summit Property Care',supplierSandbox]);
  // Fictional UAE client records (the demo workspace is in the UAE): 555 numbers, .example mail domains.
  const clientRecords:[string,string,string,string,string,string,string,string,string,string,string|null][]=[
   [ids.harbor,ids.ridgeline,'Harbor & Pine Coworking','Pranav Menon','+971505550142','accounts@harborpine.example','Pine House, Office 1204','Al Marsa Street','Dubai Marina','Dubai','Monthly maintenance retainer. Put the PO number on every invoice.'],
   [ids.northgate,ids.ridgeline,'Northgate Self Storage','Omar Al Mansoori','+97145550198','facilities@northgate.example','Northgate Logistics Centre, Unit 7','Street 21','Al Quoz Industrial Area 3','Dubai','Warehouse work only between 7 am and 3 pm.'],
   [ids.larkspur,ids.ridgeline,'Larkspur Coworking Studio','Laith Haddad','+97165550172','hello@larkspur.example','Larkspur Studio, Floor 3','Al Khan Street','Al Majaz 3','Sharjah',null],
   ...(demo?[]:[[ids.summitClient,ids.summit,'Juniper Business Park','Rashid Al Nuaimi','+97125550145','estates@juniper.example','Juniper Tower, Floor 18','Hamdan Bin Mohammed Street','Al Danah','Abu Dhabi',null] as [string,string,string,string,string,string,string,string,string,string,string|null]])];
  for (const [id,ws,name,contact,phone,email,building,street,area,city,notes] of clientRecords) await client.query('INSERT INTO clients(id,workspace_id,name,contact_name,phone,email,billing_building,billing_street,billing_area,billing_city,billing_region,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,ws,name,contact,phone,email,building,street,area,city,city,notes]);
  // Insert final persona roles directly: setup must not emit an Imran "changed your roles" notice.
  // Nabil is office staff; Kevin is facility staff at Harbor & Pine; Faisal is a household at Northgate.
  for (const [ws,user,role,company] of [[ids.ridgeline,ids.imran,'admin',null],[ids.ridgeline,ids.sam,'staff',null],[ids.ridgeline,ids.ravi,'technician',null],[ids.ridgeline,ids.pranav,'client',ids.harbor],[ids.ridgeline,ids.nabil,'staff',null],[ids.ridgeline,ids.kevin,'client',ids.harbor],[ids.ridgeline,ids.faisal,'client',ids.northgate],[ids.ridgeline,ids.omar,'client',ids.northgate],...(demo?[]:[[ids.summit,ids.summitAdmin,'admin',null]])]) await client.query('INSERT INTO members(workspace_id,user_id,role,client_id,staff_kind,client_kind) VALUES($1,$2,$3,$4,$5,$6)',[ws,user,role,company,user===ids.nabil?'office':null,user===ids.kevin?'office':user===ids.faisal?'household':null]);
  await client.query('UPDATE members SET is_owner=(user_id=$2) WHERE workspace_id=$1',[ids.ridgeline,ids.imran]);
  // The demo company is based in Dubai: UAE emirates, +971 numbers and AED.
  if(demo) await client.query("UPDATE workspaces SET country='AE',region='Dubai',currency='AED' WHERE id=$1",[ids.ridgeline]);
  const names=['Marina Exchange','Pine Terrace','Harbor Annex','Northgate East','Northgate West','Larkspur Loft','Juniper Court'];
  const siteRecords=[
   ['Marina Exchange, Tower B','Al Marsa Street','Dubai Marina','Visitor parking at P2. Sign in at the ground floor security desk with your Emirates ID.','Karim Saleh','+971525550117'],
   ['Pine Terrace, Building 4','Cluster D Road','Jumeirah Lake Towers','Use the loading bay on the lake side. Keys are at reception until 6 pm.','Arif Rahman','+971555550163'],
   ['Harbor Annex, Unit G03','King Salman Bin Abdulaziz Al Saud Street','Dubai Media City','Service lift only for tools and ladders. Book it a day ahead with building management.','Joseph Mathew','+971505550189'],
   ['Warehouse 14','Street 21','Al Quoz Industrial Area 3','The gate code changes monthly. Call the site contact on arrival.','Yousef Qureshi','+971565550124'],
   ['Warehouse 9','Street 4A','Dubai Investments Park 1','Hard hats and safety shoes past the yellow line.','Faisal Al Zaabi','+971505550136'],
   ['Larkspur Loft, Floor 3','Al Khan Street','Al Majaz 3','Street parking only. Ring the studio bell; the door faces the corniche.','Laith Haddad','+97165550172'],
   ['Juniper Court, Block A','Hamdan Bin Mohammed Street','Al Danah','Report to the concierge. Contractor passes are issued at the desk.','Rashid Al Nuaimi','+97125550145'],
  ];
  for (let n=1;n<=(demo?6:7);n++){const [building,address,area,access,contact,phone]=siteRecords[n-1],region=n===6?'Sharjah':n===7?'Abu Dhabi':'Dubai';await client.query('INSERT INTO sites(id,workspace_id,client_id,name,address,building,area,region,access_notes,contact_name,contact_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[siteId(n),n===7?ids.summit:ids.ridgeline,n<=3?ids.harbor:n<=5?ids.northgate:n===6?ids.larkspur:ids.summitClient,names[n-1],address,building,area,region,access,contact,phone]);}
  const tasks=DEMO_JOB_TITLES;
  const priorities=['low','normal','high','urgent'];
  await client.query("UPDATE workspaces SET visit_charge=150,visit_charge_regions='{\"Sharjah\":200}',visit_charge_sample=true WHERE id=$1",[ids.ridgeline]);
  // Sample setup, not a user change: keep it out of History.
  await client.query("DELETE FROM audit_log WHERE workspace_id=$1 AND entity='workspaces'",[ids.ridgeline]);
  const timezone=(await client.query('SELECT timezone FROM workspaces WHERE id=$1',[ids.ridgeline])).rows[0].timezone;
  const today=localDate(Date.now(),timezone);
  for(let n=1;n<=(demo?60:66);n++) {
   const summit=n>60; const site=summit?7:((n-1)%5)+1;
   const ws=summit?ids.summit:ids.ridgeline; const company=summit?ids.summitClient:site<=3?ids.harbor:ids.northgate; const actor=summit?ids.summitAdmin:n%3===0?ids.sam:ids.imran;
   await client.query("SELECT set_config('app.user_id',$1,true)",[actor]);
   const dates=fixtureDates(n,today,timezone);
   // Existing Harbor jobs retain their people and titles; their response clock starts near build time.
   if(n===1||n===7){dates.created=new Date(Date.now()-(n===1?3.5:5)*3600000);dates.updated=new Date(dates.created.getTime()+2*3600000);}
   const assigned=summit?ids.summitAdmin:[ids.sam,ids.imran,null,ids.ravi,ids.sam,ids.ravi,null][(n-1)%7];
   const title=tasks[(n-1)%tasks.length];
   await client.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,due_on,order_number,external_ref,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',[orderId(n),ws,company,siteId(site),title,demoJobDescription(n),fixtureStatus(n),n===1?'low':priorities[(n*7+Math.floor(n/5))%4],assigned,dates.visit,dates.due,summit?n-60:n,n===1?'QA-1001':null,actor,dates.created,dates.updated]);
   const history: {kind:string;body:string;details:Record<string,unknown>}[]=[];
   const finalStatus=fixtureStatus(n);
   const stages=finalStatus==='open'?[]:finalStatus==='cancelled'?['scheduled','cancelled']:finalStatus==='scheduled'?['scheduled']:finalStatus==='in_progress'?['scheduled','in_progress']:finalStatus==='waiting_on_parts'?['scheduled','in_progress','waiting_on_parts']:['scheduled','in_progress','done'];
   for(const [index,to_status] of stages.entries())history.push({kind:'status_changed',body:'Status updated',details:{from_status:stages[index-1]??'open',to_status}});
   for(const [index,event] of history.entries())await client.query('INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[ws,company,orderId(n),actor,event.kind,event.body,JSON.stringify(event.details),new Date(dates.created.getTime()+(index+1)*7200000)]);
   if(n<=18) for(const [index,visibility] of ['client','internal'].entries()) await client.query('INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[ws,company,orderId(n),DEMO_JOB_COMMENTS[visibility as keyof typeof DEMO_JOB_COMMENTS],visibility,actor,new Date(dates.updated.getTime()-(2-index)*3600000)]);
   if(n<=4) await client.query('INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,$3)',[ws,orderId(n),`${prefix}COBALT-DEMO-${n}`]);
  }
  await client.query("UPDATE work_orders SET tenant_unit='1204',tenant_name='Hassan',tenant_phone='+971 50 000 1204' WHERE id=$1",[orderId(1)]);
  // Trades and areas so assigning by trade and area shows real matches in the demo.
  await client.query(`UPDATE work_orders SET trade=CASE WHEN title ~* '(leak|pipe|drain|water|toilet|tap)' THEN 'plumbing' WHEN title ~* '(\\mac\\M|air con|cool|hvac|chiller)' THEN 'ac' WHEN title ~* '(light|power|socket|electric|breaker)' THEN 'electrical' WHEN title ~* '(door|cabinet|wood)' THEN 'carpentry' WHEN title ~* 'paint' THEN 'painting' WHEN title ~* 'clean' THEN 'cleaning' ELSE (ARRAY['plumbing','ac','electrical','general'])[1+(order_number%4)] END WHERE workspace_id=$1`,[ids.ridgeline]);
  const areas=siteRecords.map(s=>s[2]);
  await client.query("UPDATE members SET trades='{plumbing,ac}', areas=$3 WHERE workspace_id=$1 AND user_id=$2",[ids.ridgeline,ids.ravi,areas.slice(0,3)]);
  await client.query("UPDATE members SET trades='{electrical,general}', areas=$3 WHERE workspace_id=$1 AND user_id=$2",[ids.ridgeline,ids.sam,areas.slice(2,6)]);
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
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
  await client.query('INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,$3,$4)',[ids.pranav,ids.ridgeline,'request_created',orderId(1)]);

 if(demo){
 const imp=(await client.query("INSERT INTO imports(workspace_id,filename,row_count,status,created_by) VALUES($1,'sample.csv',1,'queued',$2) RETURNING id",[ids.ridgeline,ids.sam])).rows[0].id;
 await client.query("INSERT INTO import_rows(workspace_id,import_id,row_number,data,queued) VALUES($1,$2,1,$3,true)",[ids.ridgeline,imp,JSON.stringify({title:'Inspect reception lighting',site:'Marina Exchange',client:'Harbor & Pine Coworking',site_id:siteId(1),client_id:ids.harbor,priority:'normal',description:'Two reception downlights flicker after switching on. Check the drivers and replace any failed units.',due_on:dayOffset(today,8),scheduled_for:dayOffset(today,6),external_ref:''})]);
 // Sample company documents, stamped SAMPLE in the name and on the page: two expiring soon, one valid, one expired. Tiny one page PDFs.
 const pdf=(t:string)=>{const body=`BT /F1 18 Tf 72 720 Td (${t}) Tj ET`;const objs=['<</Type/Catalog/Pages 2 0 R>>','<</Type/Pages/Kids[3 0 R]/Count 1>>','<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',`<</Length ${body.length}>>stream\n${body}\nendstream`,'<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];let out='%PDF-1.4\n';const at:number[]=[];objs.forEach((o,i)=>{at.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`;});const x=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${at.map(a=>String(a).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;return Buffer.from(out,'latin1');};
 for(const [type,title,issued,expires,who] of [['trade_licence','SAMPLE Trade licence',-345,20,ids.imran],['certificate','SAMPLE Civil Defence certificate',-358,6,ids.imran],['insurance','SAMPLE Public liability insurance',-120,245,ids.sam],['permit','SAMPLE Hot work permit, Marina Exchange',-60,-3,ids.sam]] as const)
  await client.query("INSERT INTO company_documents(workspace_id,doc_type,title,issued_on,expires_on,responsible_id,file_name,mime,bytes,added_by) VALUES($1,$2,$3,$4,$5,$6,$7,'application/pdf',$8,$9)",[ids.ridgeline,type,title,dayOffset(today,issued),dayOffset(today,demo && type==='certificate'?7:expires),who,title.replace(/[^\w]+/g,'-').toLowerCase()+'.pdf',pdf(`${title}. Sample document, not a real licence.`),ids.imran]);
 // Two more technicians (no sign in) so weekly days off and leave mean something in the demo.
 const extra:string[]=[];
 for(const [name,trades,off] of [['Bilal','{electrical,ac}',[0]],['Anil','{plumbing,general}',[6]]] as const){
  const id=(await client.query("INSERT INTO users(name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,true,$3,lower($1)) RETURNING id",[name,`${name.toLowerCase()}.${ids.ridgeline}@demo.groundwork.invalid`,ids.ridgeline])).rows[0].id;extra.push(id);
  await client.query("INSERT INTO members(workspace_id,user_id,role,trades,areas,off_days) VALUES($1,$2,'technician',$3,$4,$5)",[ids.ridgeline,id,trades,areas.slice(0,5),off]);
 }
 await client.query("UPDATE members SET off_days='{5}' WHERE workspace_id=$1 AND user_id=$2",[ids.ridgeline,ids.ravi]);
 await client.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by) VALUES($1,$2,'leave',$3,$4,'Family visit',$5),($1,$6,'sick',$7,$7,null,$5)",[ids.ridgeline,extra[1],dayOffset(today,0),dayOffset(today,3),ids.sam,extra[0],dayOffset(today,9)]);
 // Unassigned finished jobs go to the new technicians so everyone has a job count.
 await client.query("UPDATE work_orders SET assignee_id=CASE WHEN order_number%2=0 THEN $2::uuid ELSE $3::uuid END WHERE workspace_id=$1 AND status='done' AND assignee_id IS NULL",[ids.ridgeline,extra[0],extra[1]]);
 for(const user of [ids.sam,ids.omar])await client.query("INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,'request_created',$3)",[user,ids.ridgeline,orderId(user===ids.sam?1:4)]);
 }
 // Faisal (household) raised two Northgate requests himself. One Harbor job and one of Faisal's wait for a price answer; one booked visit waits for a confirmation.
 // AI13: each price note matches its own job title, so a price never reads as if it belongs to another job.
 await client.query("UPDATE work_orders SET created_by=$3 WHERE id IN (SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status NOT IN ('done','cancelled') ORDER BY order_number LIMIT 2)",[ids.ridgeline,ids.northgate,ids.faisal]);
 await client.query("UPDATE work_orders SET quote_amount=CASE WHEN client_id=$2 THEN 850 ELSE 320 END, quote_note=CASE WHEN title ~* 'light' THEN 'New LED light fitting and one hour of work.' WHEN title ~* 'pump' THEN 'New pump motor and two hours of work.' WHEN title ~* 'tap' THEN 'Replace the tap cartridge, parts and labour.' WHEN title ~* 'door' THEN 'New door closer, parts and labour.' WHEN title ~* '(cool|ventilation)' THEN 'Clean the unit and top up the gas.' ELSE 'Parts and labour for this repair.' END, quote_status='pending' WHERE id IN ((SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status NOT IN ('done','cancelled') ORDER BY order_number LIMIT 1),(SELECT id FROM work_orders WHERE workspace_id=$1 AND created_by=$3 ORDER BY order_number LIMIT 1))",[ids.ridgeline,ids.harbor,ids.faisal]);
 // HOME05 and HOME07: each client persona owns a scheduled visit with Ravi; Pranav and Kevin also a finished one (Faisal's household thread with Ravi stays tied to an open request).
 for(const [person,company,offset] of [[ids.pranav,ids.harbor,0],[ids.kevin,ids.harbor,1],[ids.faisal,ids.northgate,0]] as const){
  for(const state of person===ids.faisal?['scheduled']:['scheduled','done'])await client.query(`UPDATE work_orders SET created_by=$3,assignee_id=$4 WHERE id=(SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status=$5::work_order_status ORDER BY order_number OFFSET $6 LIMIT 1)`,[ids.ridgeline,company,person,ids.ravi,state,offset]);
 }
 // Job reports on finished work, in the technician's own words, plus one waiting for a part and one the supervisor must decide on.
 await client.query(`UPDATE work_orders SET report_outcome=CASE WHEN order_number%5=0 THEN 'temporary' ELSE 'fixed' END, report_by=assignee_id,
   -- LEARN10: the report is written at the end of the visit (45 to 120 minutes after it starts), so the company history has real visit times.
   report_at=CASE WHEN scheduled_for IS NOT NULL AND scheduled_for<now()-interval '3 hours' THEN scheduled_for+make_interval(mins=>45+(order_number%4)*25) ELSE updated_at END,
   report_problem=CASE WHEN title ~* 'light' THEN 'The light did not turn on.' WHEN title ~* '(tap|pump|drain)' THEN 'Water was leaking.' WHEN title ~* 'door' THEN 'The door did not close by itself.' WHEN title ~* '(cool|ventilation)' THEN 'The room was too warm.' ELSE 'It was broken.' END,
   report_work=CASE WHEN order_number%5=0 THEN 'Made it safe and working for now. A new unit is needed.' WHEN title ~* 'light' THEN 'Changed the driver and the bulb.' WHEN title ~* '(tap|pump|drain)' THEN 'Changed the seal and cleaned the pipe.' WHEN title ~* 'door' THEN 'Set the closer again and tightened the screws.' ELSE 'Fixed it and tested it.' END
   WHERE workspace_id=$1 AND status='done' AND assignee_id IS NOT NULL`,[ids.ridgeline]);
 await client.query(`UPDATE work_orders SET report_outcome='needs_part', report_by=assignee_id, report_at=updated_at, report_problem='The motor is burnt.', report_work='Checked the wiring. The motor must be changed.' WHERE workspace_id=$1 AND status='waiting_on_parts' AND assignee_id IS NOT NULL`,[ids.ridgeline]);
 await client.query(`UPDATE work_orders SET report_outcome='cant_fix', report_by=assignee_id, report_at=updated_at, report_problem='The wall behind it is wet.', report_work='Looked at it. This needs a mason first.' WHERE id=(SELECT id FROM work_orders WHERE workspace_id=$1 AND status='in_progress' AND assignee_id=$2 ORDER BY order_number LIMIT 1)`,[ids.ridgeline,ids.ravi]);
 // Harbor & Pine has a maintenance contract: two finished jobs are covered by it, one was paid, the rest are to bill.
 await client.query("UPDATE clients SET contract_visits=12, contract_response_hours=4, contract_ends_on=$3 WHERE workspace_id=$1 AND id=$2",[ids.ridgeline,ids.harbor,dayOffset(today,170)]);
 await client.query(`UPDATE work_orders SET payment_status=CASE WHEN r<=2 THEN 'contract' ELSE 'paid' END FROM (SELECT id, row_number() OVER (ORDER BY order_number) r FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND status='done') d WHERE work_orders.id=d.id AND d.r<=3`,[ids.ridgeline,ids.harbor]);
 // Recorded receipts and supplier costs support the overview with the same jobs and contract shown elsewhere.
 await client.query("UPDATE work_orders SET quote_amount=480,quote_status='approved',quote_note='Parts and labour for the completed repair.' WHERE workspace_id=$1 AND payment_status='paid' AND status='done'",[ids.ridgeline]);
 await client.query("INSERT INTO workspace_money(workspace_id,direction,amount,currency,note,created_by) VALUES($1,'in',7200,'AED','Harbor and Pine annual maintenance contract payment',$2)",[ids.ridgeline,ids.imran]);
 const supplierCosts=[145,90,220,360];
 for(const [index,amount] of supplierCosts.entries())await client.query("INSERT INTO workspace_money(workspace_id,direction,amount,currency,note,created_by) VALUES($1,'out',$2,'AED',$3,$4)",[ids.ridgeline,amount,`Cobalt parts for WO ${index+1}`,ids.imran]);
 // Decision log: two past agent actions with a why note; the second was undone by its owner.
 const past=(await client.query("SELECT id,order_number,title,assignee_id,priority FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') ORDER BY order_number LIMIT 2",[ids.ridgeline])).rows;
 if(past.length===2){
  await client.query(`INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before,consumed_at,outcome,expires_at) VALUES
   ($1,$2,'set_priority',$3,$4,'The client said water is reaching the corridor, so it should go first.',$5,now()-interval '3 hours','done',now()-interval '3 hours'),
   ($1,$2,'set_priority',$6,$7,'You asked me to move it down because the client is away this week.',$8,now()-interval '1 day','done',now()-interval '1 day')`,
   [ids.ridgeline,ids.imran,JSON.stringify({id:past[0].id,priority:'high'}),`Change priority for WO ${past[0].order_number} ${past[0].title}: ${past[0].priority} to high`,JSON.stringify({id:past[0].id,priority:past[0].priority,status:'open'}),
    JSON.stringify({id:past[1].id,priority:'low'}),`Change priority for WO ${past[1].order_number} ${past[1].title}: ${past[1].priority} to low`,JSON.stringify({id:past[1].id,priority:past[1].priority,status:'open'})]);
  await client.query("UPDATE assistant_actions SET undone_at=now()-interval '20 hours', undone_by=$2 WHERE workspace_id=$1 AND consumed_at < now()-interval '20 hours'",[ids.ridgeline,ids.imran]);
 }
 // Creation events are inserted at record creation; updates/comments follow them.
 await client.query("UPDATE notifications n SET created_at=o.updated_at FROM work_orders o WHERE n.workspace_id=$1 AND n.entity_id=o.id",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=o.created_at FROM work_orders o WHERE a.workspace_id=$1 AND a.entity_id=o.id AND a.entity='work_orders' AND a.action='insert'",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=e.created_at FROM work_order_events e WHERE a.workspace_id=$1 AND a.entity_id=e.id AND a.entity='work_order_events'",[ids.ridgeline]);
 await client.query("UPDATE audit_log a SET at=c.created_at FROM comments c WHERE a.workspace_id=$1 AND a.entity_id=c.id AND a.entity='comments'",[ids.ridgeline]);
 // Waiting items so the Suggested and Team space screens are never empty in the demo.
 if(demo){
  const job=(await client.query("SELECT id,client_id,site_id FROM work_orders WHERE workspace_id=$1 AND client_id IS NOT NULL AND site_id IS NOT NULL ORDER BY order_number LIMIT 1",[ids.ridgeline])).rows[0];
  if(job){
   await client.query("INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,from_work_order_id,title,problem,priority) VALUES($1,'technician',$2,'Ravi',$3,$4,$5,'Replace the second pump seal','The pump next to this one is also leaking a little. Better to change the seal before it gets worse.','normal')",[ids.ridgeline,ids.ravi,job.client_id,job.site_id,job.id]);
   await client.query("INSERT INTO job_suggestions(workspace_id,source,sender_name,sender_phone,client_id,site_id,title,problem,priority,preferred_window) VALUES($1,'whatsapp','Kevin','+971 50 555 0142',$2,$3,'Lobby lights flickering','Two lights in the lobby keep flickering since this morning.','high','Tomorrow morning')",[ids.ridgeline,job.client_id,job.site_id]);
  }
  const team=(await client.query("SELECT id FROM conversations WHERE workspace_id=$1 AND kind='team' LIMIT 1",[ids.ridgeline])).rows[0];
  if(team){
   await client.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
   await client.query("INSERT INTO messages(workspace_id,conversation_id,sender_id,sender_name,body,created_at) VALUES($1,$2,$3,'Imran','Good morning team. Northgate asked for an early visit today, please check your jobs.',now()-interval '2 hours')",[ids.ridgeline,team.id,ids.imran]);
   await client.query("SELECT set_config('app.user_id',$1,true)",[ids.sam]);
   await client.query("INSERT INTO messages(workspace_id,conversation_id,sender_id,sender_name,body,created_at) VALUES($1,$2,$3,'Sam','On my way. I have the spare filters in the van.',now()-interval '90 minutes')",[ids.ridgeline,team.id,ids.sam]);
   await client.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  }
 }
  // CLIENT05: equipment at two sites, one finished job linked to each so the unit history is not empty. People and job assignments stay as they are.
  await client.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  for(const [site,name,kind,location] of [[1,'Roof AC 1','ac','Roof'],[1,'Roof AC 2','ac','Roof'],[1,'Main panel','panel','Ground floor'],[4,'Water pump','pump','Plant room'],[4,'Office water heater','water_heater','Office kitchen']] as const){
   const asset=(await client.query('INSERT INTO assets(workspace_id,site_id,name,kind,location,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ids.ridgeline,siteId(site),name,kind,location,ids.imran])).rows[0];
   if(name==='Roof AC 1'||name==='Water pump')await client.query("UPDATE work_orders SET asset_id=$3 WHERE id=(SELECT id FROM work_orders WHERE workspace_id=$1 AND site_id=$2 AND status='done' ORDER BY order_number LIMIT 1)",[ids.ridgeline,siteId(site),asset.id]);
  }
  await client.query(`INSERT INTO agent_words(workspace_id,user_id,phrase,means_kind,means_id,means_text,created_by)
   SELECT $1::uuid,NULL::uuid,'the tower','site',id,name,$2::uuid FROM sites WHERE workspace_id=$1 AND name='Marina Exchange'
   UNION ALL SELECT $1::uuid,NULL::uuid,'big chiller','asset',id,name,$2::uuid FROM assets WHERE workspace_id=$1 AND name='Roof AC 1'`,[ids.ridgeline,ids.imran]);
  await client.query(`INSERT INTO agent_words(workspace_id,user_id,phrase,means_kind,means_id,means_text,created_by)
   SELECT $1,$2,'the annex','site',id,name,$2 FROM sites WHERE workspace_id=$1 AND name='Harbor Annex'`,[ids.ridgeline,ids.ravi]);

  if(demo) {
    await populateProofFixture(client,ids,siteId,orderId,today,timezone);
    await populateFollowUpFixture(client,ids,siteId,today,timezone);
    // Keep a working visit on the workspace day, including when the sample is reset on Friday.
    await client.query('UPDATE members SET off_days=array_remove(off_days,extract(dow FROM $3::date)::smallint) WHERE workspace_id=$1 AND user_id=$2',[ids.ridgeline,ids.ravi,today]);
    await client.query("UPDATE work_orders SET assignee_id=$2,scheduled_for=$3,due_on=$4 WHERE id=$1 AND status='scheduled'",[orderId(2),ids.ravi,scheduledInstant(today,timezone,14),today]);
    await populateDecisionFixture(client,ids,today);
    await populateCompanyMemoryFixture(client,ids);
    await populateNotificationFixture(client,ids);
    await populateIdentityFixture(client,ids);
    await populateCompanyJoiningFixture(client,ids);
    await populateChecklistFixture(client,ids.ridgeline,ids.imran);
    await populateQuoteFixture(client,ids);
    // A private household preview, not a second membership: demo identity rules allow one workspace only.
    await client.query("INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,'household','preview',$3)",[ids.ravi,`household_preview:${ids.ridgeline}`,JSON.stringify({workspace_id:ids.ridgeline,address:'Flat 12, Sample Court',simulated:true})]);
    await client.query("UPDATE users SET phone='+971000000000' WHERE id=$1",[ids.ravi]);
  }
}
