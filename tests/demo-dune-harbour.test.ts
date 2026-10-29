import { dunePhotos } from '../lib/fixture-dune-photos';
import { sampleDocumentPdf } from '../lib/fixture-documents';
import { listDecisions, undoDecision } from '../lib/services/agent-log';
import { listDocuments, getDocumentFile } from '../lib/services/documents';
import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,expect,it } from 'vitest';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { getSessionUserId,setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ownerOverview } from '../lib/services/owner-overview';
import { DUNE_HARBOUR_NAME,DUNE_STAFF,DUNE_TECHS,DUNE_CLIENTS,DUNE_PERSONAS,populateDuneHarbour } from '../lib/fixture-dune-harbour';
import * as start from '../app/api/demo/start/route';
import * as switchRoute from '../app/api/demo/switch/route';
import * as reset from '../app/api/demo/reset/route';
import { overdueSql, scheduledInstant } from '../lib/dates';
import { isDemoFixtureCopy } from '../lib/demo-proof-copy';
import type { RouteContext } from '../lib/api';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
const prior=process.env.DEMO_DUNE_HARBOUR;
beforeEach(async()=>{setAuthResolverForTests();delete process.env.DEMO_DUNE_HARBOUR;const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterEach(()=>{if(prior===undefined)delete process.env.DEMO_DUNE_HARBOUR;else process.env.DEMO_DUNE_HARBOUR=prior;});
afterAll(async()=>{await closePools();});
async function call(handler:Handler,body?:unknown,cookie?:string){
 const req=new Request('http://localhost/api',{method:'POST',headers:cookie?{cookie}:{},body:JSON.stringify(body)});
 const r=await handler(req,{params:Promise.resolve({})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')??''};
}
const q=async(sql:string,args:unknown[],actor:string|null=null)=>withSystem(async db=>(await db.query(sql,args)).rows,actor);
it('is hidden from judges: without DEMO_DUNE_HARBOUR the demo refuses it and Ridgeline is unchanged',async()=>{
 expect((await call(start.POST,{persona:'kamau',company:'dune_harbour'})).status).toBe(404);
 expect((await call(start.POST,{persona:'imran',company:'dune_harbour'})).status).toBe(404);
 expect((await q('SELECT count(*)::int n FROM workspaces WHERE name=$1',[DUNE_HARBOUR_NAME]))[0].n).toBe(0);
 const r=await call(start.POST,{persona:'imran'});expect(r.status).toBe(201);
 expect((await q('SELECT name FROM workspaces WHERE id=$1',[r.body.workspace_id]))[0].name).toBe('Ridgeline Facility Services');
 // Ridgeline personas stay a fixed list: the cast of the other company can not sign in there.
 expect((await call(start.POST,{persona:'dipendra'})).status).toBe(422);
});
it('builds the trimmed Dune Harbour cast (13 people) in a demo sandbox with no real logins and no sign in codes',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const r=await call(start.POST,{persona:'joseph',company:'dune_harbour'});expect(r.status).toBe(201);
 const ws=r.body.workspace_id;expect(r.body.company).toBe('dune_harbour');
 const w=(await q('SELECT name,is_demo,currency,country,demo_expires_at FROM workspaces WHERE id=$1',[ws]))[0];
 expect(w).toMatchObject({name:DUNE_HARBOUR_NAME,is_demo:true,currency:'AED',country:'AE'});
 expect(new Date(w.demo_expires_at).getTime()-Date.now()).toBeLessThanOrEqual(6*3600000+60000);
 const members=await q("SELECT m.role,m.staff_kind,m.client_kind,m.is_owner,m.trades,m.off_days,u.name,u.email,u.is_demo,p.language FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN user_preferences p ON p.user_id=u.id WHERE m.workspace_id=$1",[ws]);
 expect(members).toHaveLength(13);
 expect(members.filter(m=>m.role==='technician')).toHaveLength(6);
 expect(members.filter(m=>m.role==='staff')).toHaveLength(2);
 expect(members.filter(m=>m.role==='admin')).toHaveLength(1);
 expect(members.filter(m=>m.client_kind==='household')).toHaveLength(2);
 expect(members.find(m=>m.name==='Imran')).toMatchObject({role:'admin',is_owner:true,language:'ar-AE'});
 expect(members.find(m=>m.name==='Nabil')).toMatchObject({role:'staff',staff_kind:'office'});
 expect(members.find(m=>m.name==='Dipendra')).toMatchObject({language:'ne',trades:['plumbing'],off_days:[6]});
 expect(members.find(m=>m.name==='Murali')).toMatchObject({language:'ta',off_days:[2]});
 expect(members.every(m=>m.is_demo&&m.email.endsWith('@demo.groundwork.invalid'))).toBe(true);
 const cast=[...DUNE_STAFF,...DUNE_TECHS,...DUNE_CLIENTS.flatMap(c=>c.people)].map(p=>p.name).sort();
 expect(members.map(m=>m.name).sort()).toEqual(cast);
 // No Google accounts, no sign in links or codes for fictional people.
 expect((await q('SELECT count(*)::int n FROM accounts a JOIN users u ON u.id=a."userId" WHERE u.demo_workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM login_links WHERE workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM invites WHERE workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM clients WHERE workspace_id=$1',[ws]))[0].n).toBe(4);
 expect((await q('SELECT count(*)::int n FROM sites WHERE workspace_id=$1',[ws]))[0].n).toBe(4);
 const jobs=await q('SELECT title,status,report_outcome,quote_status FROM work_orders WHERE workspace_id=$1',[ws]);
 expect(jobs).toHaveLength(52);
 expect(Object.fromEntries(['open','scheduled','in_progress','waiting_on_parts','done','cancelled'].map(status=>[status,jobs.filter(j=>j.status===status).length]))).toEqual({open:2,scheduled:6,in_progress:3,waiting_on_parts:1,done:34,cancelled:6});
 expect(Object.fromEntries(['fixed','temporary','needs_part','cant_fix'].map(outcome=>[outcome,jobs.filter(j=>j.report_outcome===outcome).length]))).toEqual({fixed:31,temporary:3,needs_part:2,cant_fix:1});
 expect(jobs.filter(j=>/waiting room 2/.test(j.title)&&j.status==='done')).toHaveLength(3);
 expect(jobs.find(j=>j.title==='Floor 9 riser breaker keeps tripping')?.status).toBe('in_progress');
 const off=await q("SELECT u.name,t.kind,t.status FROM time_off t JOIN users u ON u.id=t.user_id WHERE t.workspace_id=$1 ORDER BY u.name",[ws]);
 expect(off).toEqual([{name:'Kamau',kind:'sick',status:'pending'},{name:'Murali',kind:'leave',status:'approved'}]);
 // DEMO10 and DEMO11: every person in the trimmed cast is a judge login.
 expect([...DUNE_PERSONAS].sort()).toEqual([...DUNE_STAFF,...DUNE_TECHS,...DUNE_CLIENTS.flatMap(c=>c.people)].map(p=>p.key).sort());
 expect((await q("SELECT sender_name FROM job_suggestions WHERE workspace_id=$1 AND status='pending'",[ws])).map(s=>s.sender_name)).toEqual(['Kevin']);
 // Company overview shows recorded money, never AED 0.00: five paid repairs plus the clinic contract payment, three supplier costs.
 const imran=(await q("SELECT u.id FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND u.name='Imran'",[ws]))[0].id;
 expect(await ownerOverview(imran,ws)).toMatchObject({currency:'AED',money_in:'11150.00',money_out:'645.00'});
 for(const m of await q('SELECT note FROM workspace_money WHERE workspace_id=$1',[ws]))expect(m.note).not.toMatch(/[-\u2013\u2014]/);
 // Public copy: no dashes in names, titles or notes.
 for(const j of jobs)expect(j.title).not.toMatch(/[-\u2013\u2014]/);
});
it('seeds staged WebP pairs only in Dune Harbour on completed jobs by their assigned technicians',async()=>{
 const ridge=await call(start.POST,{persona:'imran'});expect(ridge.status).toBe(201);
 const staged=Object.values(dunePhotos).map(p=>p.bytes);
 expect(await q('SELECT id FROM job_photos WHERE bytes=ANY($1::bytea[])',[staged])).toEqual([]);
 process.env.DEMO_DUNE_HARBOUR='1';
 const dune=await call(start.POST,{persona:'imran',company:'dune_harbour'});expect(dune.status).toBe(201);
 const photos=await q(`SELECT p.*,w.title,w.status,w.assignee_id,w.client_id AS job_client,w.scheduled_for,w.report_at
  FROM job_photos p JOIN work_orders w ON w.id=p.work_order_id WHERE p.workspace_id=$1`,[dune.body.workspace_id]);
 expect(photos).toHaveLength(4);
 for(const [title,before,after] of [
  ['Clinic filter service',dunePhotos.acBefore,dunePhotos.acAfter],
  ['Creekgate washroom pipe repair',dunePhotos.leakBefore,dunePhotos.leakAfter],
 ] as const){
  const pair=photos.filter(p=>p.title===title);expect(pair).toHaveLength(2);
  expect(new Set(pair.map(p=>p.work_order_id)).size).toBe(1);
  for(const [kind,fixture] of [['before',before],['after',after]] as const){
   const photo=pair.find(p=>p.kind===kind)!;
   expect(photo).toMatchObject({mime:'image/webp',status:'done',width:480,height:360});
   expect(photo.bytes).toEqual(fixture.bytes);
   expect(photo.bytes.length).toBeGreaterThan(0);expect(photo.bytes.length).toBeLessThan(40*1024);
   expect(photo.bytes.subarray(0,4).toString()).toBe('RIFF');
   expect(photo.bytes.subarray(8,12).toString()).toBe('WEBP');
   expect(photo.taken_by).toBe(photo.assignee_id);expect(photo.client_id).toBe(photo.job_client);
   expect(photo.created_at).toEqual(kind==='before'?photo.scheduled_for:photo.report_at);
  }
 }
 expect((await q('SELECT DISTINCT workspace_id FROM job_photos WHERE bytes=ANY($1::bytea[])',[staged])).map(p=>p.workspace_id)).toEqual([dune.body.workspace_id]);
});
it('seeds six months relative to the reset day, linked fault histories, leave, ratings and draft bills',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const r=await call(start.POST,{persona:'imran',company:'dune_harbour'});expect(r.status).toBe(201);const ws=r.body.workspace_id;
 const owner=(await q("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='imran'",[ws]))[0].id;
 const history=await q(`SELECT w.*, ((CURRENT_TIMESTAMP AT TIME ZONE s.timezone)::date-(w.created_at AT TIME ZONE s.timezone)::date)::int AS age,
  (w.scheduled_for AT TIME ZONE s.timezone)::date AS visit_day, (w.report_at AT TIME ZONE s.timezone)::date AS report_day
  FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.workspace_id=$1 ORDER BY order_number`,[ws]);
 expect(Math.max(...history.map(j=>j.age))).toBe(180);
 expect(Math.min(...history.map(j=>j.age))).toBe(0);
 for(let band=0;band<6;band++){
  const jobs=history.filter(j=>j.age>band*30&&j.age<=(band+1)*30);
  expect(jobs.filter(j=>j.status==='done').length).toBeGreaterThanOrEqual(4);
  expect(jobs.some(j=>j.status==='cancelled')).toBe(true);
 }
 expect(history.map(j=>j.age)).toEqual(history.map(j=>j.age).sort((a,b)=>b-a));
 const events=await q("SELECT work_order_id,created_at,details FROM work_order_events WHERE workspace_id=$1 AND kind='status_changed' ORDER BY created_at",[ws]);
 for(const job of history.filter(j=>j.status==='done')){
  const steps=events.filter(e=>e.work_order_id===job.id);
  expect(steps.map(e=>e.details.to_status)).toEqual(['scheduled','in_progress','done']);
  expect(steps.at(-1)!.created_at.getTime()).toBe(job.report_at.getTime());
 }
 for(const j of history.filter(j=>j.report_outcome)){
  expect(j.report_problem).toBeTruthy();expect(j.report_work).toBeTruthy();expect(j.report_by).toBe(j.assignee_id);
  expect(j.report_at.getTime()).toBeGreaterThan(j.scheduled_for.getTime());
  expect(j.report_day).toBe(j.visit_day);
 }
 const leave=(await q(`SELECT t.*, ((CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date=t.starts_on) AS starts_today,
  (t.ends_on-t.starts_on)::int AS days FROM time_off t JOIN workspaces w ON w.id=t.workspace_id WHERE t.workspace_id=$1 AND t.kind='leave'`,[ws]))[0];
 expect(leave).toMatchObject({status:'approved',starts_today:true,days:3});
 expect(history.filter(j=>j.assignee_id===leave.user_id&&!['done','cancelled'].includes(j.status))).toEqual([]);
 const assets=await q(`SELECT a.name,a.site_id,count(o.id)::int AS jobs FROM assets a LEFT JOIN work_orders o ON o.workspace_id=a.workspace_id AND o.asset_id=a.id WHERE a.workspace_id=$1 GROUP BY a.id`,[ws]);
 expect(assets).toHaveLength(6);expect(new Set(assets.map(a=>a.site_id)).size).toBe(4);
 expect(assets.find(a=>a.name==='Waiting room 2 AC')?.jobs).toBe(3);
 expect(assets.find(a=>a.name==='Floor 9 riser panel')?.jobs).toBe(3);
 const repeat=history.filter(j=>j.title.includes('waiting room 2'));
 expect(new Set(repeat.map(j=>j.asset_id)).size).toBe(1);expect(repeat[0].asset_id).toBeTruthy();
 expect(repeat.map(j=>j.report_outcome)).toEqual(['temporary','fixed','fixed']);
 expect((await q(`SELECT title FROM work_orders WHERE workspace_id=$1 AND ${overdueSql}`,[ws])).map(j=>j.title)).toContain('Floor 9 riser breaker keeps tripping');
 const ratings=await q(`SELECT r.*,o.status,o.client_id AS job_client,o.created_by,o.signed_off_at,m.client_id AS actor_client,m.client_kind
  FROM job_ratings r JOIN work_orders o ON o.id=r.work_order_id JOIN members m ON m.workspace_id=r.workspace_id AND m.user_id=r.rated_by WHERE r.workspace_id=$1`,[ws],owner);
 expect(ratings.map(r=>r.stars).sort()).toEqual([2,4,5]);
 for(const rating of ratings){expect(rating.status).toBe('done');expect(rating.client_id).toBe(rating.job_client);expect(rating.actor_client).toBe(rating.client_id);expect(rating.created_at.getTime()).toBe(rating.signed_off_at.getTime());if(rating.client_kind==='household')expect(rating.rated_by).toBe(rating.created_by);}
 const drafts=await q(`SELECT d.*,o.report_work,o.report_outcome,o.signed_off_at FROM draft_invoices d JOIN work_orders o ON o.id=d.work_order_id WHERE d.workspace_id=$1`,[ws],owner);
 expect(drafts).toHaveLength(3);
 for(const draft of drafts){expect(draft.status).toBe('waiting');expect(draft.report_outcome).toBe('fixed');expect(draft.lines).toEqual([{label:'Work reported',detail:draft.report_work,amount:'150.00'}]);expect(draft.created_at.getTime()).toBe(draft.signed_off_at.getTime());}
 // All seeded prose follows LANG12, while names and addresses remain data.
 const prose=history.flatMap(j=>[j.title,j.description,j.report_problem,j.report_work,j.quote_note]).filter(Boolean);
 for(const table of ['time_off','workspace_money','job_ratings'])prose.push(...(await q(`SELECT note FROM ${table} WHERE workspace_id=$1`,[ws],owner)).map(r=>r.note).filter(Boolean));
 prose.push(...(await q('SELECT body FROM comments WHERE workspace_id=$1',[ws])).map(r=>r.body));
 for(const value of prose){expect(isDemoFixtureCopy(value),value).toBe(true);expect(value).not.toMatch(/[-\u2013\u2014]/);}
});
it('seeds SAMPLE PDFs and past Agent decisions through the existing document and decision readers',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const r=await call(start.POST,{persona:'imran',company:'dune_harbour'}),ws=r.body.workspace_id;
 const users=Object.fromEntries((await q('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1',[ws])).map(u=>[u.demo_persona,u.id]));
 const documents=await listDocuments(users.imran,ws);
 expect(documents).toHaveLength(4);
 expect(documents.filter(d=>d.days_left>0&&d.days_left<=30).map(d=>d.days_left).sort((a,b)=>a-b)).toEqual([7,20]);
 expect(documents.map(d=>d.days_left).sort((a,b)=>a-b)).toEqual([-3,7,20,245]);
 for(const doc of documents){
  expect(doc.title).toMatch(/^SAMPLE /);expect(isDemoFixtureCopy(doc.title)).toBe(true);
  expect(doc.title).not.toMatch(/[-\u2013\u2014]/);
  expect(['Imran','Nabil']).toContain(doc.responsible_name);
  expect(doc.issued_on<doc.expires_on).toBe(true);
  const file=await getDocumentFile(users.imran,ws,doc.id);
  expect(file.mime).toBe('application/pdf');
  const stored=(await q('SELECT bytes FROM company_documents WHERE workspace_id=$1 AND id=$2',[ws,doc.id]))[0].bytes;
  expect(stored.equals(sampleDocumentPdf(`${doc.title}. Sample document, not a real licence.`))).toBe(true);
  expect(stored.toString('latin1')).toMatch(/^%PDF-1.4/);
 }
 const actions=await q(`SELECT a.*,o.workspace_id AS job_workspace,o.priority AS job_priority,o.created_at AS job_created,o.status AS job_status
  FROM assistant_actions a JOIN work_orders o ON o.id=(a.args->>'id')::uuid WHERE a.workspace_id=$1`,[ws]);
 expect(actions).toHaveLength(4);
 expect(actions.filter(a=>a.undone_at)).toHaveLength(2);
 for(const action of actions){
  expect(action).toMatchObject({user_id:users.imran,tool:'set_priority',outcome:'done',job_workspace:ws});
  expect(action.before.id).toBe(action.args.id);expect(action.after.id).toBe(action.args.id);
  expect(action.after.priority).toBe(action.args.priority);
  expect(action.before.priority).not.toBe(action.after.priority);
  expect(action.job_priority).toBe(action.undone_at?action.before.priority:action.after.priority);
  expect(action.before.status).toBe(action.job_status);
  expect(action.created_at.getTime()).toBeGreaterThan(action.job_created.getTime());
  expect(action.created_at.getTime()).toBeLessThan(action.consumed_at.getTime());
  expect(action.consumed_at.getTime()).toBeLessThan(Date.now());
  expect(action.expires_at.getTime()).toBe(action.consumed_at.getTime());
  if(action.undone_at){expect(action.undone_by).toBe(users.imran);expect(action.undone_at.getTime()).toBeGreaterThan(action.consumed_at.getTime());expect(action.undone_at.getTime()).toBeLessThan(Date.now());}
  for(const value of [action.summary,action.why]){expect(value.length).toBeGreaterThan(10);expect(isDemoFixtureCopy(value),value).toBe(true);expect(value).not.toMatch(/[-\u2013\u2014]/);}
 }
 const log=await listDecisions(users.imran,ws);
 expect(log).toHaveLength(4);
 expect(log.filter(a=>a.can_undo)).toHaveLength(2);
 for(const entry of log){expect(entry.changes).toHaveLength(1);expect(entry.changes[0].field).toBe('priority');}
 expect(await listDecisions(users.nabil,ws)).toEqual([]);
 const undone=actions.find(a=>a.undone_at)!;
 await expect(undoDecision(users.imran,ws,undone.id)).rejects.toMatchObject({status:409,code:'undone'});
 const applied=actions.find(a=>!a.undone_at)!;
 await undoDecision(users.imran,ws,applied.id);
 expect((await q('SELECT priority FROM work_orders WHERE id=$1',[applied.args.id]))[0].priority).toBe(applied.before.priority);
});
it.each(['2032-03-01T21:30:00Z','2033-01-01T00:30:00Z'])('keeps dates relative when the database reset clock is %s',async resetAt=>{
 const ws=randomUUID();
 // Only the database reset clock changes. Real inserts still exercise constraints and triggers.
 const baseline=await withSystem(async db=>{
  const clocked=new Proxy(db,{get(target,key){
   if(key==='query')return async(sql:string,args?:unknown[])=>{
    const result=await target.query(sql,args);
    if(sql==='SELECT timezone, CURRENT_TIMESTAMP AS reset_at FROM workspaces WHERE id=$1')result.rows[0].reset_at=new Date(resetAt);
    return result;
   };
   return Reflect.get(target,key);
  }});
  await populateDuneHarbour(clocked,ws);
  return (await db.query("SELECT ($1::timestamptz AT TIME ZONE timezone)::date AS day FROM workspaces WHERE id=$2",[resetAt,ws])).rows[0].day;
 });
 const dates=(await q(`SELECT min((created_at AT TIME ZONE 'Asia/Dubai')::date)::text AS oldest,
  max((created_at AT TIME ZONE 'Asia/Dubai')::date)::text AS newest FROM work_orders WHERE workspace_id=$1`,[ws]))[0];
 const day=(offset:number)=>new Date(Date.parse(`${baseline}T12:00:00Z`)+offset*86400000).toISOString().slice(0,10);
 expect(dates).toEqual({oldest:day(-180),newest:baseline});
 expect((await q("SELECT due_on FROM work_orders WHERE workspace_id=$1 AND title='Floor 9 riser breaker keeps tripping'",[ws]))[0].due_on).toBe(day(-1));
 expect((await q("SELECT starts_on,ends_on FROM time_off WHERE workspace_id=$1 AND kind='leave'",[ws]))[0]).toEqual({starts_on:baseline,ends_on:day(3)});
 const documents=await q('SELECT issued_on,expires_on,doc_type FROM company_documents WHERE workspace_id=$1',[ws]);
 for(const [type,issued,expiry] of [['trade_licence',-345,20],['certificate',-358,7],['insurance',-120,245],['permit',-60,-3]] as const){
  expect(documents.find(d=>d.doc_type===type)).toMatchObject({issued_on:day(issued),expires_on:day(expiry)});
 }
 const decisions=await q('SELECT created_at,consumed_at,undone_at FROM assistant_actions WHERE workspace_id=$1 ORDER BY consumed_at',[ws]);
 expect(decisions.map(a=>a.consumed_at.toISOString())).toEqual([[-2,14],[-1,10],[-1,11],[-1,14]].map(([offset,hour])=>new Date(scheduledInstant(day(offset),'Asia/Dubai',hour)!).toISOString()));
 for(const decision of decisions){expect(decision.created_at.getTime()).toBe(decision.consumed_at.getTime()-60000);if(decision.undone_at)expect(decision.undone_at.getTime()).toBe(decision.consumed_at.getTime()+2*3600000);}
 const visits=await q(`SELECT u.name,m.off_days,extract(dow FROM o.scheduled_for AT TIME ZONE 'Asia/Dubai')::int AS weekday
  FROM work_orders o JOIN members m ON m.workspace_id=o.workspace_id AND m.user_id=o.assignee_id JOIN users u ON u.id=m.user_id
  WHERE o.workspace_id=$1 AND o.title IN ('Clinic filter service','Creekgate washroom pipe repair','Vikram kitchen light repair','Faisal cupboard hinge repair')`,[ws]);
 expect(visits).toHaveLength(24);
 for(const visit of visits)expect(visit.off_days,visit.name).not.toContain(visit.weekday);
});
it('switch stays inside Dune Harbour, reset rebuilds the same company, and the Ridgeline sandbox is never reused for it',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const ridge=await call(start.POST,{persona:'imran'});
 const sandbox=ridge.cookie.split(/,\s*(?=groundwork-sandbox=)/).find(c=>c.startsWith('groundwork-sandbox='))?.split(';')[0];
 const r=await call(start.POST,{persona:'imran',company:'dune_harbour'},sandbox);expect(r.status).toBe(201);
 expect(r.body.workspace_id).not.toBe(ridge.body.workspace_id);
 const s=await call(switchRoute.POST,{persona:'dipendra'},r.cookie);expect(s.status).toBe(200);expect(s.body.workspace_id).toBe(r.body.workspace_id);
 expect((await call(switchRoute.POST,{persona:'sam'},s.cookie)).status).toBe(422);
 const user=await getSessionUserId(new Request('http://localhost',{headers:{cookie:s.cookie}}));
 expect((await q('SELECT name FROM users WHERE id=$1',[user]))[0].name).toBe('Dipendra');
 const oldPhotos=await q('SELECT id FROM job_photos WHERE workspace_id=$1',[r.body.workspace_id]);expect(oldPhotos).toHaveLength(4);
 const again=await call(reset.POST,{confirm:true},s.cookie);expect(again.status).toBe(200);
 expect((await q('SELECT name FROM workspaces WHERE id=$1',[again.body.workspace_id]))[0].name).toBe(DUNE_HARBOUR_NAME);
 expect((await q('SELECT count(*)::int n FROM workspaces WHERE id=$1',[r.body.workspace_id]))[0].n).toBe(0);
 const owner=(await q("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='imran'",[again.body.workspace_id]))[0].id;
 for(const [table,count] of [['work_orders',52],['assets',6],['time_off',2],['job_ratings',3],['draft_invoices',3],['company_documents',4],['assistant_actions',4],['job_photos',4]] as const){
  expect((await q(`SELECT count(*)::int n FROM ${table} WHERE workspace_id=$1`,[again.body.workspace_id],owner))[0].n).toBe(count);
  expect((await q(`SELECT count(*)::int n FROM ${table} WHERE workspace_id=$1`,[r.body.workspace_id],owner))[0].n).toBe(0);
 }
 expect((await q('SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1',[ridge.body.workspace_id]))[0].n).toBe(68);
 expect((await q('SELECT count(*)::int n FROM assets WHERE workspace_id=$1',[ridge.body.workspace_id]))[0].n).toBe(5);
 expect(await q('SELECT id FROM job_photos WHERE id=ANY($1::uuid[])',[oldPhotos.map(p=>p.id)])).toEqual([]);
 // Without the switch on, a leftover Dune Harbour sandbox can not be reset into a new one.
 delete process.env.DEMO_DUNE_HARBOUR;
 expect((await call(reset.POST,{confirm:true},again.cookie)).status).toBe(404);
});
