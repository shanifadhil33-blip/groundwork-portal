import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { localDate, scheduledInstant } from './dates';
/**
 * DEMO20: Dune Harbour Technical Services, the championship demo company (story: championship/groundwork-demo-company-story.md).
 * A second demo company built in code, like Ridgeline. Every person is a demo user with an address that cannot receive mail;
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
 {key:'saeed',name:'Saeed',language:'ur',role:'admin'},
 {key:'nabil',name:'Nabil',language:'en-GB',role:'staff',office:true},
 {key:'joseph',name:'Joseph',language:'en-IN',role:'staff'},
 {key:'khalid',name:'Khalid',language:'ar-AE',role:'staff'},
];
export const DUNE_TECHS:Tech[]=[
 {key:'dipendra',name:'Dipendra',language:'ne',trades:['plumbing'],areas:['Al Qusais','Al Nahda (Dubai)'],off:[6]},
 {key:'rafiq',name:'Rafiq',language:'bn',trades:['electrical'],areas:['Al Majaz','Al Taawun'],off:[5]},
 {key:'zabihullah',name:'Zabihullah',language:'ps',trades:['ac'],areas:['Al Nahda (Sharjah)','Al Majaz'],off:[5]},
 {key:'bilal',name:'Bilal',language:'ur',trades:['plumbing'],areas:['Al Majaz','Al Nahda (Sharjah)'],off:[0]},
 {key:'ramon',name:'Ramon',language:'fil',trades:['ac'],areas:['Al Nahda (Dubai)','Al Qusais'],off:[5]},
 {key:'sanjay',name:'Sanjay',language:'hi',trades:['ac'],areas:['Al Barsha','Jumeirah Lake Towers'],off:[1]},
 {key:'anil',name:'Anil',language:'ml',trades:['electrical'],areas:['Al Majaz','Al Taawun'],off:[6]},
 {key:'murali',name:'Murali',language:'ta',trades:['general','plumbing'],areas:['Deira','Al Qusais'],off:[2]},
 {key:'rashid',name:'Rashid',language:'ar-AE',trades:['electrical'],areas:['Deira','Al Qusais'],off:[5]},
 {key:'ahmed',name:'Ahmed',language:'ar-AE',trades:['plumbing'],areas:['Business Bay','Downtown Dubai'],off:[0]},
 {key:'kamau',name:'Kamau',language:'sw-KE',trades:['plumbing'],areas:['Al Qusais','Deira'],off:[4]},
 {key:'mark',name:'Mark',language:'en-GB',trades:['ac','electrical'],areas:['Dubai Marina','Jumeirah Lake Towers'],off:[6]},
];
type Site={key:string;name:string;building:string;address:string;area:string;region:'Dubai'|'Sharjah';access:string};
type Client={key:string;name:string;phone:string;email:string;people:(Person&{kind:'manager'|'office'|'household'})[];sites:Site[];household?:boolean;notes?:string};
// Fictional: 555 numbers and .example mail domains.
export const DUNE_CLIENTS:Client[]=[
 {key:'clinic',name:'Qasr Lantern Clinic',phone:'+97145550311',email:'facilities@qasrlantern.example',notes:'Maintenance contract. Visits before 10 AM, the clinic opens at 10.',
  people:[{key:'arun',name:'Arun',language:'en-IN',kind:'manager'},{key:'kevin',name:'Kevin',language:'ta',kind:'office'}],
  sites:[{key:'clinic',name:'Qasr Lantern Clinic',building:'Lantern House, Ground floor',address:'Street 14',area:'Al Qusais',region:'Dubai',access:'Use the side door next to the pharmacy. Waiting rooms 1 and 2, treatment rooms and the server room are on the ground floor.'}]},
 {key:'saffron',name:'Saffron Court Residences',phone:'+97165550327',email:'manager@saffroncourt.example',
  people:[{key:'hassan',name:'Hassan',language:'ar-AE',kind:'manager'}],
  sites:[{key:'towerA',name:'Saffron Court, Tower A',building:'Tower A',address:'Al Khan Street',area:'Al Majaz',region:'Sharjah',access:'Pump room keys at the building office, Tower A ground floor.'},
   {key:'towerB',name:'Saffron Court, Tower B',building:'Tower B',address:'Al Khan Street',area:'Al Majaz',region:'Sharjah',access:'Roof AC plant through the service stairs. Ask security for the roof key.'}]},
 {key:'tawa',name:'Tawa House Restaurant',phone:'+97145550348',email:'owner@tawahouse.example',notes:'Halal kitchen. Kitchen work only between 3 PM and 6 PM.',
  people:[{key:'tariq',name:'Tariq',language:'ur',kind:'manager'}],
  sites:[{key:'tawa',name:'Tawa House, kitchen and dining hall',building:'Shop 3',address:'Al Nahda Road',area:'Al Nahda (Dubai)',region:'Dubai',access:'Deliveries door at the back lane.'}]},
 {key:'creekgate',name:'Creekgate Business Tower',phone:'+97145550362',email:'engineering@creekgate.example',
  people:[{key:'yousuf',name:'Yousuf',language:'ar-AE',kind:'manager'}],
  sites:[{key:'creekgate',name:'Creekgate Business Tower',building:'14 floors, riser rooms on each floor',address:'Baniyas Road',area:'Deira',region:'Dubai',access:'Contractor pass at the lobby desk with your Emirates ID.'}]},
 ...([['faisal','Faisal','ml','Al Nahda (Dubai)','Dubai'],['omar','Omar','ar-AE','Al Majaz','Sharjah'],['vikram','Vikram','hi','Al Qusais','Dubai'],['paolo','Paolo','fil','Jumeirah Lake Towers','Dubai'],
  ['usman','Usman','ur','Al Taawun','Sharjah'],['david','David','en-GB','Dubai Marina','Dubai'],['reza','Reza','fa-IR','Al Barsha','Dubai'],['farid','Farid','fa-AF','Al Qusais','Dubai'],['wei','Wei','zh-CN','Jumeirah Lake Towers','Dubai']] as const)
  .map(([key,name,language,area,region],i)=>({key,name:`${name} (home)`,phone:`+9715055504${String(10+i)}`,email:`${key}@home.example`,household:true,
   people:[{key,name,language,kind:'household' as const}],sites:[{key,name:`${name}'s flat`,building:`Flat ${101+i*7}`,address:'Residential building',area,region:region as 'Dubai'|'Sharjah',access:'Call him ten minutes before you arrive.'}]})),
];
/** People a visitor can sign in as (DEMO11 judge logins plus the Nepali and Tamil voices of the demo day). */
export const DUNE_PERSONAS=['imran','saeed','joseph','khalid','nabil','ramon','dipendra','murali','rashid','arun','kevin','hassan','faisal','vikram'] as const;
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
 await db.query("UPDATE members SET areas=$3 WHERE workspace_id=$1 AND user_id=$2",[ws,id.khalid,['Al Majaz','Al Nahda (Sharjah)','Al Taawun']]);
 for(const t of DUNE_TECHS)await db.query("INSERT INTO members(workspace_id,user_id,role,trades,areas,off_days) VALUES($1,$2,'technician',$3,$4,$5)",[ws,id[t.key],t.trades,t.areas,t.off]);
 const client:Record<string,string>={},site:Record<string,string>={};
 for(const c of DUNE_CLIENTS){
  client[c.key]=randomUUID();const first=c.people[0];
  await db.query('INSERT INTO clients(id,workspace_id,name,contact_name,phone,email,billing_building,billing_street,billing_area,billing_city,billing_region,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)',
   [client[c.key],ws,c.name,first.name,c.phone,c.email,c.sites[0].building,c.sites[0].address,c.sites[0].area,c.sites[0].region,c.notes??null]);
  for(const s of c.sites){site[s.key]=randomUUID();await db.query('INSERT INTO sites(id,workspace_id,client_id,name,address,building,area,region,access_notes,contact_name,contact_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[site[s.key],ws,client[c.key],s.name,s.address,s.building,s.area,s.region,s.access,first.name,c.phone]);}
  for(const p of c.people)await db.query("INSERT INTO members(workspace_id,user_id,role,client_id,client_kind) VALUES($1,$2,'client',$3,$4)",[ws,id[p.key],client[c.key],p.kind]);
 }
 await db.query("UPDATE clients SET contract_visits=12, contract_ends_on=(now()+interval '200 days')::date WHERE workspace_id=$1 AND id=$2",[ws,client.clinic]);
 const timezone=(await db.query('SELECT timezone FROM workspaces WHERE id=$1',[ws])).rows[0].timezone as string;
 const today=localDate(Date.now(),timezone);
 const at=(day:number,hour:number,minute=0)=>{const d=new Date(scheduledInstant(dayOffset(today,day),timezone,hour)!);d.setUTCMinutes(d.getUTCMinutes()+minute);return d;};
 // Sanjay is on approved leave all week; Kamau's sick day waits for Joseph, who must move his three jobs first.
 await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by,status,decided_by,decided_at) VALUES($1,$2,'leave',$3,$4,'Family visit',$5,'approved',$5,now()-interval '3 days')",[ws,id.sanjay,dayOffset(today,-1),dayOffset(today,4),id.joseph]);
 await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by,status) VALUES($1,$2,'sick',$3,$3,'Fever since last night.',$2,'pending')",[ws,id.kamau,today]);
 type Job={client:string;site:string;title:string;description:string;status:string;priority?:string;trade:string;tech?:string;visit?:Date|null;due?:number|null;by?:string;created:number;report?:[string,string,string];quote?:[number,string];paid?:string};
 const jobs:Job[]=[
  // Today: the late job and the visit it puts at risk.
  {client:'creekgate',site:'creekgate',title:'Floor 9 riser breaker keeps tripping',description:'Breaker in the floor 9 riser room trips two or three times a day. Planned for two hours.',status:'in_progress',priority:'high',trade:'electrical',tech:'rashid',visit:at(0,8,30),due:0,by:'nabil',created:-1},
  {client:'vikram',site:'vikram',title:'Bedroom socket not working',description:'The socket next to the bed stopped working. Nothing plugged in turns on.',status:'scheduled',trade:'electrical',tech:'rashid',visit:at(0,11,30),due:0,by:'vikram',created:-2},
  // Kamau's three booked jobs on his sick day.
  {client:'clinic',site:'clinic',title:'Washbasin draining slowly, treatment room 2',description:'Water stays in the basin for a few minutes.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,8),due:0,by:'arun',created:-3},
  {client:'creekgate',site:'creekgate',title:'Leak under pantry sink, floor 4',description:'Small leak under the pantry sink, a towel is on the floor.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,11),due:1,by:'nabil',created:-2},
  {client:'farid',site:'farid',title:'Kitchen tap dripping',description:'Voice note: the kitchen tap drips all night.',status:'scheduled',trade:'plumbing',tech:'kamau',visit:at(0,15),due:1,by:'farid',created:-2},
  // Dipendra closes this one with a voice note in Nepali on the demo day.
  {client:'saffron',site:'towerB',title:'Water leak in the Tower B pump room',description:'Water on the pump room floor near the second pump.',status:'in_progress',priority:'high',trade:'plumbing',tech:'dipendra',visit:at(0,10),due:0,by:'khalid',created:-1},
  // Ramon's price for a new fan motor waits for Imran.
  {client:'clinic',site:'clinic',title:'AC fan motor noisy, treatment room 1',description:'The indoor unit fan grinds when it starts.',status:'waiting_on_parts',trade:'ac',tech:'ramon',visit:at(-1,9),due:3,by:'arun',created:-4,report:['needs_part','The fan motor bearing is worn.','Checked the fan and the wiring. A new fan motor is needed.']},
  {client:'paolo',site:'paolo',title:'AC not cooling in the living room',description:'Voice note: the living room AC blows warm air in the afternoon.',status:'scheduled',trade:'ac',tech:'mark',visit:at(1,16),due:2,by:'paolo',created:-1,quote:[280,'SAMPLE price. Gas top up and cleaning the indoor unit.']},
  {client:'tawa',site:'tawa',title:'Kitchen exhaust fan stopped',description:'The exhaust fan over the grill stopped this morning.',status:'scheduled',priority:'urgent',trade:'electrical',tech:'anil',visit:at(0,15),due:0,by:'tariq',created:0},
  {client:'faisal',site:'faisal',title:'Bathroom water heater not heating',description:'Voice note in Malayalam: no hot water since yesterday.',status:'open',trade:'plumbing',due:2,by:'faisal',created:0},
  {client:'saffron',site:'towerA',title:'Corridor lights out, floor 6',description:'Four corridor lights are out on floor 6.',status:'open',trade:'electrical',due:3,by:'hassan',created:0},
  {client:'omar',site:'omar',title:'Split AC leaking water inside',description:'Water drips from the indoor unit onto the wall.',status:'scheduled',trade:'ac',tech:'zabihullah',visit:at(1,10),due:2,by:'omar',created:-1},
  {client:'usman',site:'usman',title:'Toilet flush not stopping',description:'The flush keeps running after use.',status:'scheduled',trade:'plumbing',tech:'bilal',visit:at(0,17),due:1,by:'usman',created:-1},
  {client:'david',site:'david',title:'Balcony light fitting loose',description:'The balcony light hangs from its wires.',status:'scheduled',trade:'electrical',tech:'mark',visit:at(2,9),due:4,by:'david',created:-1},
  // Clinic AC in waiting room 2: three leak reports in four months, one temporary fix (repeat fault for building memory).
  {client:'clinic',site:'clinic',title:'AC leaking water, waiting room 2',description:'Water drips from the AC onto the chairs.',status:'done',trade:'ac',tech:'ramon',visit:at(-118,9),due:-117,by:'kevin',created:-120,report:['temporary','The drain pipe was blocked.','Cleared the drain pipe for now. The tray is cracked and needs a new one.'],paid:'contract'},
  {client:'clinic',site:'clinic',title:'AC leaking again, waiting room 2',description:'Same AC in waiting room 2 is leaking again.',status:'done',trade:'ac',tech:'ramon',visit:at(-62,9),due:-61,by:'kevin',created:-64,report:['fixed','The drain tray was cracked.','Changed the drain tray and cleaned the drain pipe.'],paid:'contract'},
  {client:'clinic',site:'clinic',title:'AC dripping, waiting room 2',description:'Small drip from the same AC in waiting room 2.',status:'done',trade:'ac',tech:'zabihullah',visit:at(-9,9),due:-8,by:'kevin',created:-11,report:['fixed','The drain pipe was loose at the joint.','Fixed the joint and tested the drain with water.'],paid:'contract'},
  // Creekgate floor 9 riser: repeat breaker trips; Anil named a worn part in one report.
  {client:'creekgate',site:'creekgate',title:'Breaker tripping, floor 9 riser',description:'Main breaker for floor 9 trips in the afternoon.',status:'done',trade:'electrical',tech:'anil',visit:at(-75,10),due:-74,by:'yousuf',created:-77,report:['temporary','The breaker is old and hot when the load is high.','Tightened the cables and reset it. The 63 amp breaker is worn and should be changed.'],paid:'paid'},
  {client:'creekgate',site:'creekgate',title:'Floor 9 power off again',description:'Floor 9 lost power for ten minutes.',status:'done',trade:'electrical',tech:'rashid',visit:at(-30,10),due:-29,by:'yousuf',created:-31,report:['temporary','The same breaker tripped.','Reset the breaker and checked the load on each line.'],paid:'paid'},
  // More finished history so every technician has a record.
  {client:'saffron',site:'towerA',title:'Pump pressure low, Tower A',description:'Upper floors have low water pressure.',status:'done',trade:'plumbing',tech:'bilal',visit:at(-20,9),due:-19,by:'hassan',created:-22,report:['fixed','The pressure switch was set too low.','Set the pressure switch again and tested the top floor taps.'],paid:'paid'},
  {client:'tawa',site:'tawa',title:'Grease trap overflowing',description:'Bad smell and water from the grease trap.',status:'done',priority:'high',trade:'plumbing',tech:'murali',visit:at(-14,15),due:-14,by:'tariq',created:-15,report:['fixed','The grease trap was full.','Emptied and cleaned the grease trap and the pipe after it.'],paid:'paid'},
  {client:'saffron',site:'towerB',title:'Roof AC plant alarm',description:'The roof AC plant shows an alarm light.',status:'done',trade:'ac',tech:'zabihullah',visit:at(-12,10),due:-11,by:'hassan',created:-13,report:['fixed','The filter was blocked.','Cleaned the filters and reset the alarm.'],paid:'to_bill'},
  {client:'reza',site:'reza',title:'AC thermostat not responding',description:'The wall thermostat screen is blank.',status:'done',trade:'ac',tech:'sanjay',visit:at(-10,16),due:-9,by:'reza',created:-11,report:['fixed','The thermostat batteries were empty.','Changed the batteries and set the time again.'],paid:'paid'},
  {client:'wei',site:'wei',title:'Kitchen light flickering',description:'The kitchen ceiling light flickers.',status:'done',trade:'electrical',tech:'mark',visit:at(-7,17),due:-6,by:'wei',created:-8,report:['fixed','The starter was failing.','Changed the starter and the tube.'],paid:'paid'},
  {client:'creekgate',site:'creekgate',title:'Washroom tap broken, floor 2',description:'The tap handle came off in the men washroom.',status:'done',trade:'plumbing',tech:'ahmed',visit:at(-5,10),due:-5,by:'nabil',created:-6,report:['fixed','The tap cartridge was broken.','Changed the tap cartridge.'],paid:'to_bill'},
  {client:'saffron',site:'towerA',title:'Lobby socket burnt',description:'A socket in the lobby has a burn mark.',status:'done',trade:'electrical',tech:'rafiq',visit:at(-4,11),due:-4,by:'hassan',created:-5,report:['fixed','The socket was loose and burnt.','Changed the socket and tightened the cables.'],paid:'to_bill'},
  {client:'clinic',site:'clinic',title:'Server room AC check',description:'Monthly check of the server room AC under the contract.',status:'done',trade:'ac',tech:'ramon',visit:at(-3,8),due:-3,by:'joseph',created:-6,report:['fixed','No fault. Monthly check.','Cleaned the filters and checked the temperature.'],paid:'contract'},
  {client:'faisal',site:'faisal',title:'Washing machine tap leaking',description:'Voice note: the tap behind the washing machine leaks.',status:'done',trade:'plumbing',tech:'dipendra',visit:at(-6,17),due:-6,by:'faisal',created:-7,report:['fixed','The tap washer was worn.','Changed the washer.'],paid:'paid'},
 ];
 const ids:string[]=[];
 for(const j of jobs){
  const actor=id[j.by??'nabil'];await db.query("SELECT set_config('app.user_id',$1,true)",[actor]);
  const created=at(j.created,9);const wo=randomUUID();ids.push(wo);
  await db.query('INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,description,status,priority,assignee_id,scheduled_for,due_on,trade,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
   [wo,ws,client[j.client],site[j.site],j.title,j.description,j.status,j.priority??'normal',j.tech?id[j.tech]:null,j.visit??null,j.due===null||j.due===undefined?null:dayOffset(today,j.due),j.trade,actor,created,j.status==='done'&&j.visit?new Date(j.visit.getTime()+2*3600000):created]);
  if(j.report)await db.query('UPDATE work_orders SET report_outcome=$2,report_problem=$3,report_work=$4,report_by=assignee_id,report_at=updated_at WHERE id=$1',[wo,...j.report]);
  if(j.quote&&j.quote[0]>0)await db.query("UPDATE work_orders SET quote_amount=$2,quote_note=$3,quote_status='pending' WHERE id=$1",[wo,...j.quote]);
  if(j.paid)await db.query('UPDATE work_orders SET payment_status=$2 WHERE id=$1',[wo,j.paid]);
 }
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
 return {ids:id,client,site};
}
