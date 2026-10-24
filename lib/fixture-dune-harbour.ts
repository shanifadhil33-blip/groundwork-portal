import { sampleDocumentPdf } from './fixture-documents';
import { populateChecklistFixture } from './fixture-checklists';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { localDate, scheduledInstant } from './dates';
import { draftLines } from './job-close';
/**
 * DEMO20: Dune Harbour Technical Services, the championship demo company (story: championship/groundwork-demo-company-story.md).
 * A second demo company built in code, like Ridgeline. DEMO10 trimmed the cast to 13 people (3 office, 6 technicians, 4 client logins). Every person is a demo user with an address that cannot receive mail;
 * nobody gets a sign in code or link. Hidden from judges: the demo entry builds it only when DEMO_DUNE_HARBOUR=1 is set.
 * Male names only. Amounts are SAMPLE placeholders until the real price list exists.
 */
export const DUNE_HARBOUR_NAME='Dune Harbour Technical Services';
type Person={key:string;name:string;language:string};
type Staff=Person&{role:'admin'|'staff';owner?:boolean;office?:boolean};
type Tech=Person&{trades:string[];areas:string[];off:number[]};
// 0 is Sunday, as in members.off_days.
export const DUNE_STAFF:Staff[]=[
 {key:'imran',name:'Imran',language:'ar-AE',role:'admin',owner:true},
 {key:'nabil',name:'Nabil',language:'en-GB',role:'staff',office:true},
 {key:'joseph',name:'Joseph',language:'en-IN',role:'staff'},
];
export const DUNE_TECHS:Tech[]=[
 {key:'dipendra',name:'Dipendra',language:'ne',trades:['plumbing'],areas:['Al Qusais','Al Nahda (Dubai)'],off:[6]},
 {key:'ramon',name:'Ramon',language:'fil',trades:['ac'],areas:['Al Nahda (Dubai)','Al Qusais'],off:[5]},
 {key:'anil',name:'Anil',language:'ml',trades:['electrical'],areas:['Al Majaz','Al Taawun'],off:[6]},
 {key:'murali',name:'Murali',language:'ta',trades:['general','plumbing'],areas:['Deira','Al Qusais'],off:[2]},
 {key:'rashid',name:'Rashid',language:'ar-AE',trades:['electrical'],areas:['Deira','Al Qusais'],off:[5]},
 {key:'kamau',name:'Kamau',language:'sw-KE',trades:['plumbing'],areas:['Al Qusais','Deira'],off:[4]},
];
type Site={key:string;name:string;building:string;address:string;area:string;region:'Dubai'|'Sharjah';access:string};
type Client={key:string;name:string;phone:string;email:string;contact?:string;people:(Person&{kind:'manager'|'office'|'household'})[];sites:Site[];household?:boolean;notes?:string};
// Fictional: 555 numbers and .example mail domains.
export const DUNE_CLIENTS:Client[]=[
 {key:'clinic',name:'Qasr Lantern Clinic',phone:'+97145550311',email:'facilities@qasrlantern.example',notes:'Maintenance contract. Visits before 10 AM, the clinic opens at 10.',
  people:[{key:'arun',name:'Arun',language:'en-IN',kind:'manager'},{key:'kevin',name:'Kevin',language:'ta',kind:'office'}],
  sites:[{key:'clinic',name:'Qasr Lantern Clinic',building:'Lantern House, Ground floor',address:'Street 14',area:'Al Qusais',region:'Dubai',access:'Use the side door next to the pharmacy. Waiting rooms 1 and 2, treatment rooms and the server room are on the ground floor.'}]},
 {key:'creekgate',name:'Creekgate Business Tower',phone:'+97145550362',email:'engineering@creekgate.example',contact:'Yousuf',
  people:[],
  sites:[{key:'creekgate',name:'Creekgate Business Tower',building:'14 floors, riser rooms on each floor',address:'Baniyas Road',area:'Deira',region:'Dubai',access:'Contractor pass at the lobby desk with your Emirates ID.'}]},
 ...([['faisal','Faisal','ml','Al Nahda (Dubai)','Dubai'],['vikram','Vikram','hi','Al Qusais','Dubai']] as const)
  .map(([key,name,language,area,region],i)=>({key,name:`${name} (home)`,phone:`+9715055504${String(10+i)}`,email:`${key}@home.example`,household:true,
   people:[{key,name,language,kind:'household' as const}],sites:[{key,name:`${name}'s flat`,building:`Flat ${101+i*7}`,address:'Residential building',area,region:region as 'Dubai'|'Sharjah',access:'Call him ten minutes before you arrive.'}]})),
];
/** DEMO10: the cast is trimmed to 13 people, and every one of them is a judge login (DEMO11). */
export const DUNE_PERSONAS=['imran','nabil','joseph','dipendra','ramon','rashid','kamau','anil','murali','arun','kevin','faisal','vikram'] as const;
export type DunePersona=typeof DUNE_PERSONAS[number];
const dayOffset=(day:string,offset:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+offset*86400000).toISOString().slice(0,10);
export async function populateDuneHarbour(db:PoolClient,ws:string,expires:'6 hours'|'24 hours'='6 hours'){
 const id:Record<string,string>={};
 const email=(key:string)=>`${key}.${ws}@demo.groundwork.invalid`;
 const everyone:Person[]=[...DUNE_STAFF,...DUNE_TECHS,...DUNE_CLIENTS.flatMap(c=>c.people)];
 for(const p of everyone){
  id[p.key]=randomUUID();
  await db.query('INSERT INTO users(id,name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,$3,true,$4,$5)',[id[p.key],p.name,email(p.key),ws,p.key]);
  await db.query('INSERT INTO user_preferences(user_id,language) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language',[id[p.key],p.language]);
 }
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 await db.query(`INSERT INTO workspaces(id,name,is_demo,demo_expires_at,country,region,currency) VALUES($1,$2,true,now()+$3::interval,'AE','Dubai','AED')`,[ws,DUNE_HARBOUR_NAME,expires]);
 for(const s of DUNE_STAFF)await db.query('INSERT INTO members(workspace_id,user_id,role,staff_kind,is_owner) VALUES($1,$2,$3,$4,$5)',[ws,id[s.key],s.role,s.office?'office':null,!!s.owner]);
 await db.query("UPDATE members SET areas=$3 WHERE workspace_id=$1 AND user_id=$2",[ws,id.joseph,['Al Qusais','Al Nahda (Dubai)','Deira','Business Bay','Downtown Dubai','Al Barsha','Jumeirah Lake Towers','Dubai Marina']]);
 for(const t of DUNE_TECHS)await db.query("INSERT INTO members(workspace_id,user_id,role,trades,areas,off_days) VALUES($1,$2,'technician',$3,$4,$5)",[ws,id[t.key],t.trades,t.areas,t.off]);
 const client:Record<string,string>={},site:Record<string,string>={};
 for(const c of DUNE_CLIENTS){
  client[c.key]=randomUUID();const first={name:c.people[0]?.name??c.contact??c.name};
  await db.query('INSERT INTO clients(id,workspace_id,name,contact_name,phone,email,billing_building,billing_street,billing_area,billing_city,billing_region,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)',
   [client[c.key],ws,c.name,first.name,c.phone,c.email,c.sites[0].building,c.sites[0].address,c.sites[0].area,c.sites[0].region,c.notes??null]);
  for(const s of c.sites){site[s.key]=randomUUID();await db.query('INSERT INTO sites(id,workspace_id,client_id,name,address,building,area,region,access_notes,contact_name,contact_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[site[s.key],ws,client[c.key],s.name,s.address,s.building,s.area,s.region,s.access,first.name,c.phone]);}
  for(const p of c.people)await db.query("INSERT INTO members(workspace_id,user_id,role,client_id,client_kind) VALUES($1,$2,'client',$3,$4)",[ws,id[p.key],client[c.key],p.kind]);
 }
 await db.query("UPDATE clients SET contract_visits=12, contract_ends_on=(now()+interval '200 days')::date WHERE workspace_id=$1 AND id=$2",[ws,client.clinic]);
 // Anchor all dates to the same database instant used to create/reset this sandbox.
 const clock=(await db.query('SELECT timezone, CURRENT_TIMESTAMP AS reset_at FROM workspaces WHERE id=$1',[ws])).rows[0];
 const timezone=clock.timezone as string;
 const today=localDate(clock.reset_at,timezone);
 const at=(day:number,hour:number,minute=0)=>{const d=new Date(scheduledInstant(dayOffset(today,day),timezone,hour)!);d.setUTCMinutes(d.getUTCMinutes()+minute);return d;};
 // Reuse Ridgeline's SAMPLE PDF path: two near expiry, one valid and one expired.
 for(const [type,title,issued,expiry,who] of [
  ['trade_licence','SAMPLE Trade licence',-345,20,'imran'],
  ['certificate','SAMPLE Civil Defence certificate',-358,7,'imran'],
  ['insurance','SAMPLE Public liability insurance',-120,245,'nabil'],
  ['permit','SAMPLE Hot work permit, Creekgate',-60,-3,'nabil'],
 ] as const)await db.query("INSERT INTO company_documents(workspace_id,doc_type,title,issued_on,expires_on,responsible_id,file_name,mime,bytes,added_by) VALUES($1,$2,$3,$4,$5,$6,$7,'application/pdf',$8,$9)",
  [ws,type,title,dayOffset(today,issued),dayOffset(today,expiry),id[who],title.replace(/[^\w]+/g,'_').toLowerCase()+'.pdf',sampleDocumentPdf(`${title}. Sample document, not a real licence.`),id.imran]);
 // Kamau's sick day waits for Joseph, who must move his three jobs first.
 await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by,status) VALUES($1,$2,'sick',$3,$3,'Fever since last night.',$2,'pending')",[ws,id.kamau,today]);
 // Murali has no active bookings. Keep leave valid on any reset day, not only the story Tuesday.
 await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by,status) VALUES($1,$2,'leave',$3,$4,'Family visit',$5,'approved')",[ws,id.murali,today,dayOffset(today,3),id.imran]);
 type Job={client:string;site:string;title:string;description:string;status:string;priority?:string;trade:string;tech?:string;visit?:Date|null;due?:number|null;by?:string;created:number;report?:[string,string,string];quote?:[number,string];paid?:string};
 const jobs:Job[]=[
  // Today: the late job and the visit it puts at risk.
  {client:'creekgate',site:'creekgate',title:'Floor 9 riser breaker keeps tripping',description:'Breaker in the floor 9 riser room trips two or three times a day. Planned for two hours. Still open from yesterday because the replacement breaker has not arrived.',status:'in_progress',priority:'high',trade:'electrical',tech:'rashid',visit:at(-1,8,30),due:-1,by:'nabil',created:-2,report:['needs_part','The breaker is worn and trips under load.','Made the circuit safe. Waiting for the replacement breaker.']},
  {client:'vikram',site:'vikram',title:'Bedroom socket not working',description:'The socket next to the bed stopped working. Nothing plugged in turns on.',status:'scheduled',trade:'electrical',tech:'rashid',visit:at(0,11,30),due:0,by:'vikram',created:-2},
  // Kamau's three booked jobs on his sick day.
  {client:'clinic',site:'clinic',title:'Washbasin draining slowly, treatment room 2',description:'Water stays in the basin for a few minutes.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,8),due:0,by:'arun',created:-3},
  {client:'creekgate',site:'creekgate',title:'Leak under pantry sink, floor 4',description:'Small leak under the pantry sink, a towel is on the floor.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,11),due:1,by:'nabil',created:-2},
  {client:'faisal',site:'faisal',title:'Kitchen tap dripping',description:'Voice note: the kitchen tap drips all night.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,15),due:1,by:'faisal',created:-2},
  // Dipendra closes this one with a voice note in Nepali on the demo day.
  {client:'creekgate',site:'creekgate',title:'Water leak in the basement pump room',description:'Water on the pump room floor near the second pump.',status:'in_progress',priority:'high',trade:'plumbing',tech:'dipendra',visit:at(0,10),due:0,by:'nabil',created:-1},
  // Ramon's price for a new fan motor waits for Imran.
  {client:'clinic',site:'clinic',title:'AC fan motor noisy, treatment room 1',description:'The indoor unit fan grinds when it starts.',status:'waiting_on_parts',trade:'ac',tech:'ramon',visit:at(-1,9),due:3,by:'arun',created:-4,report:['needs_part','The fan motor bearing is worn.','Checked the fan and the wiring. A new fan motor is needed.']},
  {client:'vikram',site:'vikram',title:'AC not cooling in the bedroom',description:'Voice note: the bedroom AC blows warm air in the afternoon.',status:'scheduled',trade:'ac',tech:'ramon',visit:at(1,16),due:2,by:'vikram',created:-1,quote:[280,'SAMPLE price. Gas top up and cleaning the indoor unit.']},
  {client:'creekgate',site:'creekgate',title:'Pantry exhaust fan stopped, floor 4',description:'The pantry exhaust fan on floor 4 stopped this morning.',status:'scheduled',priority:'high',trade:'electrical',tech:'anil',visit:at(0,15),due:0,by:'nabil',created:0},
  {client:'faisal',site:'faisal',title:'Bathroom water heater not heating',description:'Voice note in Malayalam: no hot water since yesterday.',status:'open',trade:'plumbing',due:2,by:'faisal',created:0},
  {client:'creekgate',site:'creekgate',title:'Corridor lights out, floor 6',description:'Four corridor lights are out on floor 6.',status:'open',trade:'electrical',due:3,by:'nabil',created:0},
  // Clinic AC in waiting room 2: three leak reports in four months, one temporary fix (repeat fault for building memory).
  {client:'clinic',site:'clinic',title:'AC leaking water, waiting room 2',description:'Water drips from the AC onto the chairs.',status:'done',trade:'ac',tech:'ramon',visit:at(-118,9),due:-117,by:'kevin',created:-120,report:['temporary','The drain pipe was blocked.','Cleared the drain pipe for now. The tray is cracked and needs a new one.'],paid:'contract'},
  {client:'clinic',site:'clinic',title:'AC leaking again, waiting room 2',description:'Same AC in waiting room 2 is leaking again.',status:'done',trade:'ac',tech:'ramon',visit:at(-62,9),due:-61,by:'kevin',created:-64,report:['fixed','The drain tray was cracked.','Changed the drain tray and cleaned the drain pipe.'],paid:'contract'},
  {client:'clinic',site:'clinic',title:'AC dripping, waiting room 2',description:'Small drip from the same AC in waiting room 2.',status:'done',trade:'ac',tech:'ramon',visit:at(-9,9),due:-8,by:'kevin',created:-11,report:['fixed','The drain pipe was loose at the joint.','Fixed the joint and tested the drain with water.'],paid:'contract'},
  // Creekgate floor 9 riser: repeat breaker trips; Anil named a worn part in one report.
  {client:'creekgate',site:'creekgate',title:'Breaker tripping, floor 9 riser',description:'Main breaker for floor 9 trips in the afternoon.',status:'done',trade:'electrical',tech:'anil',visit:at(-75,10),due:-74,by:'nabil',created:-77,report:['temporary','The breaker is old and hot when the load is high.','Tightened the cables and reset it. The 63 amp breaker is worn and should be changed.'],paid:'paid'},
  {client:'creekgate',site:'creekgate',title:'Floor 9 power off again',description:'Floor 9 lost power for ten minutes.',status:'done',trade:'electrical',tech:'rashid',visit:at(-30,10),due:-29,by:'nabil',created:-31,report:['temporary','The same breaker tripped.','Reset the breaker and checked the load on each line.'],paid:'paid'},
  // More finished history so every technician has a record.
  {client:'creekgate',site:'creekgate',title:'Pantry drain blocked, floor 4',description:'Bad smell and water coming back up the pantry drain.',status:'done',priority:'high',trade:'plumbing',tech:'murali',visit:at(-14,15),due:-14,by:'nabil',created:-15,report:['fixed','The drain pipe was full of grease.','Cleaned the drain pipe and the trap under the sink.'],paid:'paid'},
  {client:'creekgate',site:'creekgate',title:'Washroom tap broken, floor 2',description:'The tap handle came off in the men washroom.',status:'done',trade:'plumbing',tech:'murali',visit:at(-5,10),due:-5,by:'nabil',created:-6,report:['fixed','The tap cartridge was broken.','Changed the tap cartridge.'],paid:'to_bill'},
  {client:'creekgate',site:'creekgate',title:'Lobby socket burnt',description:'A socket in the lobby has a burn mark.',status:'done',trade:'electrical',tech:'anil',visit:at(-4,11),due:-4,by:'nabil',created:-5,report:['fixed','The socket was loose and burnt.','Changed the socket and tightened the cables.'],paid:'to_bill'},
  {client:'clinic',site:'clinic',title:'Server room AC check',description:'Monthly check of the server room AC under the contract.',status:'done',trade:'ac',tech:'ramon',visit:at(-3,8),due:-3,by:'joseph',created:-6,report:['fixed','No fault. Monthly check.','Cleaned the filters and checked the temperature.'],paid:'contract'},
  {client:'faisal',site:'faisal',title:'Washing machine tap leaking',description:'Voice note: the tap behind the washing machine leaks.',status:'done',trade:'plumbing',tech:'dipendra',visit:at(-6,17),due:-6,by:'faisal',created:-7,report:['fixed','The tap washer was worn.','Changed the washer.'],paid:'paid'},
 ];
 // DEMO10: four finished visits and one cancelled request in each 30 day history band.
 // Every trade and technician has history. Keep report reasons short and factual.
 const history=[
  {client:'clinic',site:'clinic',title:'Clinic filter service',description:'Routine cleaning before the clinic opens.',trade:'ac',tech:'ramon',by:'arun',report:['fixed','Dust had blocked the filters.','Cleaned the filters and tested the cooling.']},
  {client:'creekgate',site:'creekgate',title:'Creekgate washroom pipe repair',description:'Water under the washroom basin.',trade:'plumbing',tech:'kamau',by:'nabil',report:['fixed','The waste pipe joint was loose.','Refitted the joint and tested it with water.']},
  {client:'vikram',site:'vikram',title:'Vikram kitchen light repair',description:'The kitchen light flickers when switched on.',trade:'electrical',tech:'rashid',by:'vikram',report:['fixed','The light driver had failed.','Changed the driver and tested the light.']},
  {client:'faisal',site:'faisal',title:'Faisal cupboard hinge repair',description:'The cupboard door does not close.',trade:'general',tech:'murali',by:'faisal',report:['fixed','The hinge screws were loose.','Tightened the hinges and checked the door.']},
 ] satisfies Omit<Job,'status'|'created'>[];
 for(let month=0;month<6;month++){
  const start=-180+month*30;
  for(const [index,template] of history.entries()){
   const tech=template.trade==='plumbing'&&month%2===0?'dipendra':template.trade==='electrical'&&month%2===0?'anil':template.tech;
   let visit=start+2+index*5;
   // Respect the cast's weekly off days for generated historical visits.
   if(DUNE_TECHS.find(t=>t.key===tech)!.off.includes(new Date(`${dayOffset(today,visit)}T12:00:00Z`).getUTCDay()))visit--;
   jobs.push({...template,tech,status:'done',created:start+index*5,visit:at(visit,9),due:visit,paid:template.client==='clinic'?'contract':'to_bill'});
  }
  jobs.push({client:'vikram',site:'vikram',title:'Spare room socket inspection',description:'Cancelled because Vikram confirmed the socket was working after the appliance was unplugged.',trade:'electrical',status:'cancelled',by:'vikram',created:start+22,due:start+24});
 }
 jobs.push({client:'faisal',site:'faisal',title:'Damp wall behind the basin',description:'The wall is wet behind the basin.',trade:'plumbing',tech:'dipendra',status:'in_progress',created:-8,visit:at(-7,11),due:1,by:'faisal',report:['cant_fix','Water is coming through the wall from outside the flat.','Isolated the basin supply. A building mason must repair the wall first.']});
 // Oldest first, so job numbers follow the order the work came in.
 jobs.sort((a,b)=>a.created-b.created);
 const ids:string[]=[];
 for(const j of jobs){
  const actor=id[j.by??'nabil'];await db.query("SELECT set_config('app.user_id',$1,true)",[actor]);
  const created=at(j.created,9);const wo=randomUUID();ids.push(wo);
  await db.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,due_on,trade,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
   [wo,ws,client[j.client],site[j.site],j.title,j.description,j.status,j.priority??'normal',j.tech?id[j.tech]:null,j.visit??null,j.due===null||j.due===undefined?null:dayOffset(today,j.due),j.trade,actor,created,j.report&&j.visit?new Date(j.visit.getTime()+2*3600000):created]);
  if(j.report)await db.query('UPDATE work_orders SET report_outcome=$2,report_problem=$3,report_work=$4,report_by=assignee_id,report_at=updated_at WHERE id=$1',[wo,...j.report]);
  if(j.quote&&j.quote[0]>0)await db.query("UPDATE work_orders SET quote_amount=$2,quote_note=$3,quote_status='pending' WHERE id=$1",[wo,...j.quote]);
  if(j.paid)await db.query('UPDATE work_orders SET payment_status=$2 WHERE id=$1',[wo,j.paid]);
 }
 // Keep historical status changes on their visit/report dates, like Ridgeline's proof history.
 // The insertion trigger already records creation, assignment, schedule and due dates.
 for(const [index,j] of jobs.entries()){
  if(j.status==='done'){
   await db.query(`INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at)
    VALUES($1,$2,$3,$4,'status_changed','Status updated','{"from_status":"open","to_status":"scheduled"}',$6),
     ($1,$2,$3,$5,'status_changed','Status updated','{"from_status":"scheduled","to_status":"in_progress"}',$7),
     ($1,$2,$3,$5,'status_changed','Status updated','{"from_status":"in_progress","to_status":"done"}',$8)`,
    [ws,client[j.client],ids[index],id.joseph,id[j.tech!],new Date(at(j.created,9).getTime()+30*60000),j.visit,new Date(j.visit!.getTime()+2*3600000)]);
  }else if(j.status==='cancelled')await db.query(`INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at)
   VALUES($1,$2,$3,$4,'status_changed','Status updated','{"from_status":"open","to_status":"cancelled"}',$5)`,[ws,client[j.client],ids[index],id[j.by!],at(j.created,10)]);
 }
 // Past SAMPLE Agent decisions use Ridgeline's consumed action path, without executing tools.
 // Current priorities agree with the last applied change or the restored before snapshot.
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 for(const [title,priority,beforePriority,summary,why,day,hour,undone] of [
  ['AC fan motor noisy, treatment room 1','normal','low','Keep the clinic fan motor repair at normal priority.','The fan is noisy but the clinic can use the other treatment room.',-2,14,false],
  ['Water leak in the basement pump room','high','normal','Raise the basement pump leak to high priority.','Water near the pump needs prompt attention.',-1,14,false],
  ['Leak under pantry sink, floor 4','high','normal','Raise the pantry sink leak to high priority.','The leak could spread across the pantry floor.',-1,10,true],
  ['Bedroom socket not working','low','normal','Lower the bedroom socket repair to low priority.','Vikram said he could use another socket for now.',-1,11,true],
 ] as const){
  const index=jobs.findIndex(j=>j.title===title),wo=ids[index],job=jobs[index];
  const consumed=at(day,hour);
  await db.query(`INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before,after,created_at,consumed_at,outcome,expires_at,undone_at,undone_by)
   VALUES($1,$2,'set_priority',$3,$4,$5,$6,$7,$8,$9,'done',$9,$10,$11)`,
   [ws,id.imran,JSON.stringify({id:wo,priority}),summary,why,
    JSON.stringify({id:wo,priority:beforePriority,status:job.status}),JSON.stringify({id:wo,priority,status:job.status}),
    new Date(consumed.getTime()-60000),consumed,undone?at(day,hour+2):null,undone?id.imran:null]);
 }
 // CLIENT05: assets use the same register and job links as Ridgeline, including repeated faults.
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 for(const [where,name,kind,location,match] of [
  ['clinic','Waiting room 2 AC','ac','Waiting room 2',(j:Job)=>j.site==='clinic'&&j.title.includes('waiting room 2')],
  ['clinic','Server room AC','ac','Server room',(j:Job)=>j.title==='Server room AC check'||j.title==='Clinic filter service'],
  ['creekgate','Floor 9 riser panel','panel','Floor 9 riser room',(j:Job)=>j.site==='creekgate'&&(/breaker|power off/i.test(j.title))],
  ['creekgate','Basement water pump','pump','Basement pump room',(j:Job)=>j.title==='Water leak in the basement pump room'],
  ['faisal','Bathroom water heater','water_heater','Bathroom',(j:Job)=>j.title==='Bathroom water heater not heating'],
  ['vikram','Bedroom AC','ac','Bedroom',(j:Job)=>j.title==='AC not cooling in the bedroom'],
 ] as const){
  const asset=(await db.query('INSERT INTO assets(workspace_id,site_id,name,kind,location,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[ws,site[where],name,kind,location,id.imran])).rows[0].id;
  for(const [index,j] of jobs.entries())if(match(j))await db.query('UPDATE work_orders SET asset_id=$2 WHERE id=$1',[ids[index],asset]);
 }
 // CMP09 and JOB15: insert sandbox rows directly, as Ridgeline does for ratings.
 // Do not call services here: fixture creation must never send messages or push notifications.
 for(const [title,person,stars,note] of [
  ['AC leaking again, waiting room 2','arun',2,'Please check this repair again.'],
  ['AC dripping, waiting room 2','kevin',4,'The room is dry again. Thank you.'],
  ['Washing machine tap leaking','faisal',5,'Thank you for fixing the tap.'],
 ] as const){
  const index=jobs.findIndex(j=>j.title===title),job=jobs[index],wo=ids[index];
  const signed= new Date(job.visit!.getTime()+3*3600000);
  await db.query('UPDATE work_orders SET signed_off_at=$2,signed_off_by=$3 WHERE id=$1',[wo,signed,id[person]]);
  await db.query('INSERT INTO draft_invoices(workspace_id,work_order_id,lines,created_at) VALUES($1,$2,$3::jsonb,$4)',[ws,wo,JSON.stringify(draftLines({report_work:job.report![2]})),signed]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[id[person]]);
  await db.query('INSERT INTO job_ratings(workspace_id,client_id,work_order_id,rated_by,stars,note,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[ws,client[job.client],wo,id[person],stars,note,signed]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 }
 // Company overview reads recorded money only: paid repair prices, the clinic contract payment and supplier costs (sample amounts).
 for(const [title,amount,note] of [
  ['AC leaking water, waiting room 2',220,'Sample price: drain pipe cleared and refitted.'],
  ['AC leaking again, waiting room 2',380,'Sample price: new drain tray and fitting.'],
  ['Pantry drain blocked, floor 4',650,'Sample price: pantry drain and trap cleaned.'],
  ['Lobby socket burnt',180,'Sample price: new socket and fitting.'],
  ['Washing machine tap leaking',120,'Sample price: new tap washer and fitting.'],
 ] as const){const wo=ids[jobs.findIndex(j=>j.title===title)];await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);await db.query("UPDATE work_orders SET quote_amount=$2,quote_note=$3,quote_status='approved',payment_status='paid' WHERE id=$1",[wo,amount,note]);}
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 await db.query("INSERT INTO workspace_money(workspace_id,direction,amount,currency,note,created_by) VALUES($1,'in',9600,'AED','Qasr Lantern Clinic maintenance contract payment (sample)',$2)",[ws,id.imran]);
 for(const [amount,note] of [[240,'AC drain tray for the clinic (sample)'],[310,'Breaker for the Creekgate floor 9 riser (sample)'],[95,'Drain cleaning supplies for Creekgate (sample)']] as const)await db.query("INSERT INTO workspace_money(workspace_id,direction,amount,currency,note,created_by) VALUES($1,'out',$2,'AED',$3,$4)",[ws,amount,note,id.imran]);
 // Ramon's fan motor price is waiting for the owner to send it to the clinic.
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.ramon]);
 const fan=ids[jobs.findIndex(j=>j.title.startsWith('AC fan motor'))];
 await db.query("INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id) VALUES($1,$2,$3,'Fan motor price from the supplier is ready. SAMPLE price AED 450.00 with fitting. Imran please send it to the clinic.','internal',$4)",[ws,client.clinic,fan,id.ramon]);
 // Kevin's Tamil request about the noisy AC in waiting room 2 waits in Suggested.
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.kevin]);
 await db.query("INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,title,problem,priority,preferred_window) VALUES($1,'client',$2,'Kevin',$3,$4,'AC noisy in waiting room 2','The AC in waiting room 2 is making a loud noise. Please send someone.','normal','Before 10 AM')",[ws,id.kevin,client.clinic,site.clinic]);
 await db.query("SELECT set_config('app.user_id',$1,true)",[id.imran]);
 // Storage: like Ridgeline, drop the seed noise in the audit log (bell and timeline rows).
 await db.query("DELETE FROM audit_log WHERE workspace_id=$1 AND entity IN ('notifications','work_order_events')",[ws]);
 await populateChecklistFixture(db,ws,id.imran);
 return {ids:id,client,site};
}
