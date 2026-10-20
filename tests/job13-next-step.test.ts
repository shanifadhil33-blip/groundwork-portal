import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ids, siteId } from '../scripts/seed';
import { closePools, withSystem, withUser } from '../lib/db';
import { saveJobReport, OUTCOMES } from '../lib/services/job-report';
import { jobNextStep, prepareJobNextStep, confirmJobNextStep, returnSlots } from '../lib/services/job-next-step';
import { uploadSharedPhoto } from '../lib/services/shared-photos';
import { decideSuggestion } from '../lib/services/suggestions';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { returnVisitLine, STATUS_LANGS } from '../lib/status-updates';
import { LANGUAGES } from '../lib/languages';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn(()=>{throw new Error('AI must not run');})}));
vi.mock('web-push',()=>({default:{setVapidDetails:vi.fn(),sendNotification:vi.fn()}}));
const ws=ids.ridgeline,made:string[]=[],photos:string[]=[],actions:string[]=[],people:string[]=[];
async function job(status='in_progress'){
 const o=await withSystem(async db=>(await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,trade,status,assignee_id,created_by,source) VALUES($1,$2,$3,'Repair tap','plumbing',$4,$5,$6,'client') RETURNING *`,[ws,ids.harbor,siteId(1),status,ids.ravi,ids.pranav])).rows[0]);made.push(o.id);return o;
}
async function get(id:string){return withSystem(async db=>(await db.query('SELECT * FROM work_orders WHERE id=$1',[id])).rows[0]);}
async function prepare(user:string,id:string,action:string,extra={}){const p=await prepareJobNextStep(user,ws,id,{action,...extra});actions.push(p.pending_action.id);return p.pending_action.id;}
async function count(id:string){return withSystem(async db=>(await db.query('SELECT count(*)::int n FROM work_orders WHERE follow_up_of=$1',[id])).rows[0].n);}
afterEach(async()=>{await withSystem(async db=>{
 for(const id of made.splice(0).reverse()){
  const drafts=(await db.query('SELECT id FROM job_suggestions WHERE report_follow_up_of=$1',[id])).rows;for(const d of drafts)await db.query('DELETE FROM notifications WHERE entity_id=$1',[d.id]);
  const children=(await db.query('SELECT id FROM work_orders WHERE follow_up_of=$1',[id])).rows.map(r=>r.id);
  for(const jid of [...children,id]){await db.query('DELETE FROM notifications WHERE entity_id=$1',[jid]);await db.query('DELETE FROM work_order_events WHERE work_order_id=$1',[jid]);await db.query('DELETE FROM job_visits WHERE work_order_id=$1',[jid]);await db.query('DELETE FROM job_photos WHERE work_order_id=$1',[jid]);await db.query('DELETE FROM work_orders WHERE id=$1',[jid]);await db.query('DELETE FROM audit_log WHERE entity_id=$1',[jid]);}
 }
 for(const id of actions.splice(0))await db.query('DELETE FROM assistant_actions WHERE id=$1',[id]);
 for(const id of photos.splice(0))await db.query('DELETE FROM shared_photos WHERE id=$1',[id]);
 for(const id of people.splice(0)){await db.query('DELETE FROM members WHERE user_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);}
 });vi.clearAllMocks();});
afterAll(closePools);
it.each(OUTCOMES)('%s gives its fixed next step without creating any job before Yes',async outcome=>{
 const o=await job();
 await saveJobReport(ids.ravi,ws,o.id,{outcome,problem:'Do not guess a motor',work:'Inspected',part:outcome==='needs_part'?'Washer':'',updated_at:new Date(o.updated_at).toISOString()});
 const state=await jobNextStep(ids.sam,ws,o.id);
 expect(state.label).toBe({fixed:'Ask the client to sign off',temporary:'Book a follow up visit',needs_part:'Prepare a follow up visit',cant_fix:'The supervisor will call the client.'}[outcome]);
 expect(await count(o.id)).toBe(0);
 if(outcome==='temporary'||outcome==='needs_part'){
  const draft=await withSystem(async db=>(await db.query('SELECT status FROM job_suggestions WHERE report_follow_up_of=$1',[o.id])).rows[0]);expect(draft.status).toBe('pending');
  const a=await prepare(ids.nabil,o.id,'follow_up');expect(await count(o.id)).toBe(0);
  const r=await confirmJobNextStep(ids.nabil,ws,a),follow=await get(r.id);
  expect(follow).toMatchObject({follow_up_of:o.id,client_id:o.client_id,site_id:o.site_id,trade:'plumbing',title:'Follow up: Repair tap',status:outcome==='needs_part'?'waiting_on_parts':'open',report_part:outcome==='needs_part'?'Washer':null});
  await expect(confirmJobNextStep(ids.nabil,ws,a)).rejects.toMatchObject({status:409});expect(await count(o.id)).toBe(1);
 }else if(outcome==='fixed'){
  // One done notice only: the status change sends it, the next step adds none.
  const rows=await withSystem(async db=>(await db.query("SELECT kind FROM notifications WHERE entity_id=$1 AND user_id=$2 AND kind IN ('job_next_step','status_changed')",[o.id,ids.pranav])).rows);
  expect(rows.filter(r=>r.kind==='job_next_step')).toHaveLength(0);expect(rows.some(r=>r.kind==='status_changed')).toBe(true);
 }else{
  const notices=await withSystem(async db=>(await db.query("SELECT user_id,job_step_body FROM notifications WHERE entity_id=$1 AND kind='job_next_step'",[o.id])).rows);
  expect(notices.some(n=>n.user_id===ids.pranav)).toBe(true);
  if(outcome==='cant_fix'){expect(notices.some(n=>n.user_id===ids.sam)).toBe(true);expect(notices.find(n=>n.user_id===ids.pranav).job_step_body).toContain('The supervisor will call you.');}
 }
});
it('the existing Suggested queue approves the same linked report draft',async()=>{
 const o=await job();await saveJobReport(ids.ravi,ws,o.id,{outcome:'needs_part',part:'Seal',updated_at:new Date(o.updated_at).toISOString()});
 const draft=await withSystem(async db=>(await db.query('SELECT id FROM job_suggestions WHERE report_follow_up_of=$1',[o.id])).rows[0]);
 const result=await decideSuggestion(ids.sam,ws,draft.id,{decision:'approved'});
 expect(await count(o.id)).toBe(1);expect((await get(result.work_order_id!))).toMatchObject({follow_up_of:o.id,status:'waiting_on_parts',report_part:'Seal',assignee_id:ids.ravi});
 expect((await jobNextStep(ids.nabil,ws,o.id)).can_follow).toBe(false);
 await expect(prepareJobNextStep(ids.nabil,ws,o.id,{action:'follow_up'})).rejects.toMatchObject({status:422});
});
it('does not guess a missing part from the report words',async()=>{
 const o=await job();await saveJobReport(ids.ravi,ws,o.id,{outcome:'needs_part',work:'Motor broken',updated_at:new Date(o.updated_at).toISOString()});
 expect((await get(o.id)).report_part).toBeNull();
});
it('Part arrived needs Yes, reuses free slots, checks a clash again, and tells the client once after booking',async()=>{
 const o=await job();await saveJobReport(ids.ravi,ws,o.id,{outcome:'needs_part',part:'Washer',updated_at:new Date(o.updated_at).toISOString()});
 const follow=await confirmJobNextStep(ids.sam,ws,await prepare(ids.sam,o.id,'follow_up'));
 const a=await prepare(ids.ravi,follow.id,'part_arrived');expect((await get(follow.id)).status).toBe('waiting_on_parts');
 await confirmJobNextStep(ids.ravi,ws,a);expect((await get(follow.id)).status).toBe('open');
 const free=await returnSlots(ids.ravi,ws,follow.id);expect(free.slots.length).toBeGreaterThan(0);expect(free.slots.length).toBeLessThanOrEqual(3);
 const booked=await prepare(ids.ravi,follow.id,'book',{scheduled_for:free.slots[0]});expect((await get(follow.id)).scheduled_for).toBeNull();
 const clash=await job('scheduled');await withSystem(db=>db.query('UPDATE work_orders SET scheduled_for=$2 WHERE id=$1',[clash.id,free.slots[0]]));
 await expect(confirmJobNextStep(ids.ravi,ws,booked)).rejects.toMatchObject({status:422});expect((await get(follow.id)).status).toBe('open');
 await withSystem(db=>db.query('UPDATE work_orders SET scheduled_for=NULL WHERE id=$1',[clash.id]));
 await confirmJobNextStep(ids.ravi,ws,booked);await expect(confirmJobNextStep(ids.ravi,ws,booked)).rejects.toMatchObject({status:409});
 const saved=await get(follow.id);expect(saved.status).toBe('scheduled');expect(new Date(saved.scheduled_for).toISOString()).toBe(free.slots[0]);
 const notices=await withSystem(async db=>(await db.query("SELECT job_step_body FROM notifications WHERE entity_id=$1 AND user_id=$2 AND kind='job_next_step'",[follow.id,ids.pranav])).rows);
 expect(notices).toHaveLength(1);expect(notices[0].job_step_body).toContain('The part has arrived. Your visit is booked for');
});
it.each(['scheduled','in_progress'])('no access logs time and photo, notifies client and supervisor, preserves %s until the client confirms rebooking',async status=>{
 const o=await job(status),bytes=Buffer.alloc(120);bytes[0]=255;bytes[1]=216;bytes[2]=255;
 const photo=await uploadSharedPhoto(ids.ravi,ws,{mime:'image/jpeg',data:bytes.toString('base64'),width:10,height:10});photos.push(photo.id);
 const before=Date.now(),a=await prepare(ids.ravi,o.id,'no_access',{photo_id:photo.id});
 expect((await jobNextStep(ids.pranav,ws,o.id)).visits).toHaveLength(0);
 await confirmJobNextStep(ids.ravi,ws,a);
 const state=await jobNextStep(ids.pranav,ws,o.id);expect(state.visits).toHaveLength(1);expect(state.visits[0].photo_id).toBe(photo.id);expect(new Date(state.visits[0].visited_at).getTime()).toBeGreaterThanOrEqual(before);expect((await get(o.id)).status).toBe(status);
 const notices=await withSystem(async db=>(await db.query("SELECT user_id,job_step_body FROM notifications WHERE entity_id=$1 AND kind='job_next_step'",[o.id])).rows);
 expect(notices.map(n=>n.user_id)).toEqual(expect.arrayContaining([ids.sam,ids.pranav]));expect(notices.find(n=>n.user_id===ids.pranav).job_step_body).toContain('but could not get in. Choose a new time.');
 const slots=await returnSlots(ids.pranav,ws,o.id),b=await prepare(ids.pranav,o.id,'book',{scheduled_for:slots.slots[0]});expect((await get(o.id)).status).toBe(status);
 await confirmJobNextStep(ids.pranav,ws,b);expect((await get(o.id)).status).toBe('scheduled');expect((await jobNextStep(ids.pranav,ws,o.id)).can_book).toBe(false);
 const audit=await withSystem(async db=>(await db.query("SELECT actor_id FROM audit_log WHERE entity='job_visits' AND after->>'work_order_id'=$1",[o.id])).rows);expect(audit.map(r=>r.actor_id)).toContain(ids.ravi);
 await withUser(ids.pranav,async db=>expect((await db.query('SELECT id FROM job_visits WHERE work_order_id=$1',[o.id])).rowCount).toBe(1));
});
it('allows Skip and rejects clients and other technicians on staff and visit actions',async()=>{
 const o=await job();const other=await withSystem(async db=>{const u=(await db.query("INSERT INTO users(name) VALUES('Other visit technician') RETURNING id")).rows[0].id;await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')",[ws,u]);return u;});people.push(other);
 for(const user of [ids.pranav,other])for(const action of ['follow_up','part_arrived','no_access'])await expect(prepareJobNextStep(user,ws,o.id,{action})).rejects.toMatchObject({status:403});
 await confirmJobNextStep(ids.ravi,ws,await prepare(ids.ravi,o.id,'no_access'));expect((await jobNextStep(ids.ravi,ws,o.id)).visits[0].photo_id).toBeNull();
});
it('matches technician English, Gulf Arabic and Hindi and staff part arrival without AI or changes',async()=>{
 const who=await withSystem(async db=>{
 const u=(await db.query("INSERT INTO users(name) VALUES('Visit test technician') RETURNING id")).rows[0].id;
 await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')",[ws,u]);return u;
 });
 try {
 const o=await job();await withSystem(db=>db.query('UPDATE work_orders SET assignee_id=$2 WHERE id=$1',[o.id,who]));
 for(const words of ["I can't get in",'no access','ما قدرت أدخل','ما أقدر أدخل','अंदर नहीं जा सकता']){
  const r=await assistant(who,ws,{messages:[{role:'user',content:words}]}) as any;expect(r.job_step).toEqual({id:o.id,mode:'no_access'});
 }
 const number=(await get(o.id)).order_number;
 expect((await assistant(ids.sam,ws,{messages:[{role:'user',content:`the part arrived for WO ${number}`}]}) as any).job_step.id).toBe(o.id);
 expect(assistantTurn).not.toHaveBeenCalled();expect((await jobNextStep(who,ws,o.id)).visits).toHaveLength(0);
 } finally {await withSystem(async db=>{await db.query('UPDATE work_orders SET assignee_id=NULL WHERE assignee_id=$1',[who]);await db.query('DELETE FROM members WHERE user_id=$1',[who]);await db.query('DELETE FROM users WHERE id=$1',[who]);});}
});
it('covers HOME06 languages with fixed translated notifications and has Gulf Arabic card copy',()=>{
 const ar=JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'));
 for(const key of ['Next step','Which part?','Part arrived','Could not get in','Rebook','Ask the client to sign off','Book a follow up visit','Prepare a follow up visit'])expect(ar[key]).toMatch(/\p{Script=Arabic}/u);
 for(const lang of LANGUAGES){if(lang.code.startsWith('en'))continue;for(const kind of ['cant_fix','no_access','part_booked'] as const){expect(returnVisitLine(lang.code,kind,'2032-01-12T06:00:00Z')).not.toBe(returnVisitLine('en',kind,'2032-01-12T06:00:00Z'));}}
 for(const lang of STATUS_LANGS)for(const kind of ['cant_fix','no_access','part_booked'] as const)expect(returnVisitLine(lang,kind)).not.toMatch(/[—–-]/);
});
