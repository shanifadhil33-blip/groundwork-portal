import { notificationTemplate, notificationTemplates } from '../lib/ui/notifications';
import { sendPush } from '../lib/services/push';
import { afterAll, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', () => ({ assistantTurn: vi.fn(() => { throw new Error('AI unavailable'); }) }));
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(async () => 0), pushJobChange: vi.fn(async () => 0) }));
import { assistantTurn } from '../lib/ai';
import { detectEmergency, isFalseAlarm, safetyLine, SAFETY } from '../lib/emergency';
import { assistant } from '../lib/services/assistant';
import { reportEmergency } from '../lib/services/emergencies';
import { createWorkOrder } from '../lib/services/work-orders';
import { createSuggestion, decideSuggestion } from '../lib/services/suggestions';
import { listNotifications } from '../lib/services/notifications';
import { closePools, withSystem } from '../lib/db';
import { ids, orderId, siteId } from '../lib/fixture';
afterAll(closePools);
const ws=ids.ridgeline;
const send=(user:string,content:string)=>assistant(user,ws,{messages:[{role:'user',content}]});
async function clear() { await withSystem(async db=>{await db.query('DELETE FROM idempotency_keys WHERE scope=$1',[`${ws}/emergencies`]);await db.query("DELETE FROM notifications WHERE kind IN ('emergency','emergency_review')");}); }
async function alerts() { return withSystem(async db=>(await db.query("SELECT * FROM notifications WHERE kind='emergency' ORDER BY user_id")).rows); }
for(const [kind,phrases] of Object.entries({
 gas:['I smell gas','smell gas','gas smell in the kitchen','smells like gas'],
 flood:['water pouring from the ceiling','ceiling is leaking a lot'],
 electric:['burning smell from the panel'],
 people:['stuck in the lift','trapped in the elevator','someone is hurt','he fell','injured','unconscious','مصاب','فاقد الوعي','عالق في المصعد','घायल','बेहोश','لفٹ میں پھنس','زخمی','بے ہوش','പരിക്കേറ്റു','ബോധരഹിതൻ','காயமடைந்தார்','மயக்கம்','nasugatan','walang malay','nakulong sa elevator'],
})) it.each(phrases)(`detects ${kind}: %s`,phrase=>expect(detectEmergency(phrase)).toBe(kind));
it.each(['fire alarm test','service the gas stove','smoke detector battery','lift service','gas meter reading','fire extinguisher service','gas stove service','spark plug replacement','flood light'])('routine phrase stays routine: %s',phrase=>expect(detectEmergency(phrase)).toBeNull());
it.each(['it was not gas','false alarm','sorry it was nothing'])('detects false alarm: %s',phrase=>{expect(isFalseAlarm(phrase)).toBe(true);expect(detectEmergency(phrase)).toBeNull();});
it('keeps emergency safety lines free of repair instructions',()=>{
 expect(SAFETY.people).toBe('Call 999 for police, 998 for an ambulance or 997 for civil defence now. Groundwork does not replace emergency services.');
 for(const k of ['gas','fire','electric'] as const)expect(SAFETY[k]).not.toMatch(/repair|replace|rewire|tighten/i);
});
for(const user of [ids.imran,ids.sam,ids.nabil,ids.ravi,ids.pranav,ids.faisal])it(`alerts without confirmation for ${user}`,async()=>{
 await clear();
 const result=await send(user,'someone is hurt');
 expect(result).toMatchObject({available:true,reply:expect.stringMatching(/^Call 999/)});
 expect(result).not.toHaveProperty('pending_action');
 const rows=await alerts();
 expect(rows.map(n=>n.user_id)).toEqual([ids.imran,ids.sam].sort());
 expect(sendPush).toHaveBeenLastCalledWith(expect.arrayContaining([ids.imran,ids.sam]),expect.objectContaining({title:'Emergency',urgent:true}));
 expect(rows.every(n=>n.workspace_id===ws&&n.work_order_title.includes('someone is hurt'))).toBe(true);
 expect(rows.every(n=>notificationTemplate(n).key===notificationTemplates.emergency&&notificationTemplate(n).values.words==='someone is hurt')).toBe(true);
 expect(assistantTurn).not.toHaveBeenCalled();
});
it('concurrent repeats and changed wording of the same kind alert once for ten minutes',async()=>{
 await clear();
 await Promise.all([send(ids.ravi,'I smell gas'),send(ids.ravi,'I smell gas')]);
 await send(ids.ravi,'gas smell in the kitchen');
 expect(await alerts()).toHaveLength(2);
 await send(ids.ravi,'water pouring from the ceiling');
 expect(await alerts()).toHaveLength(4);
 await withSystem(db=>db.query("UPDATE idempotency_keys SET created_at=now() - interval '11 minutes' WHERE scope=$1",[`${ws}/emergencies`]));
 await send(ids.ravi,'smells like gas');
 expect(await alerts()).toHaveLength(6);
});
it('includes the assignee and links to a visible job',async()=>{
 await clear();
 await send(ids.imran,'WO 4 I smell gas');
 expect((await alerts()).map(n=>n.user_id)).toEqual([ids.imran,ids.sam,ids.ravi].sort());
 expect((await alerts()).every(n=>n.entity_id===orderId(4))).toBe(true);
 const feed=await listNotifications(ids.ravi,ws,new URLSearchParams());
 expect(feed.data.find(n=>n.kind==='emergency')).toMatchObject({priority:'urgent',message:'Emergency reported by Imran: WO 4 I smell gas',message_template:{key:notificationTemplates.emergency,values:{name:'Imran',words:'WO 4 I smell gas'}},link_target:{entity:'work_orders',id:orderId(4)}});
});
for(const user of [ids.pranav,ids.faisal])for(const [words,trade] of [['I smell gas','general'],['fire','general'],['water pouring from the ceiling','plumbing'],['burning smell from the panel','electrical']])it(`creates an urgent request for ${user} ${trade} ${words}`,async()=>{
 await clear();
 const site=user===ids.faisal?siteId(4):siteId(1);
 const r=await reportEmergency(user,ws,words,{site_id:site});
 expect(r?.job).toMatchObject({priority:'urgent',trade,created_by:user,site_id:site,description:words});
 expect(r?.reply).toContain('Your urgent request was sent');
 expect(r).not.toHaveProperty('pending_action');
 expect((await alerts()).every(n=>n.entity_id===r?.job.id)).toBe(true);
});
it('chat creates a request immediately even when the client has several sites',async()=>{
 await clear();
 const r=await send(ids.faisal,'I smell gas');
 expect(r).toMatchObject({emergency:true,request:{priority:'urgent',sender_user_id:ids.faisal}});
});
for(const user of [ids.imran,ids.sam,ids.nabil,ids.ravi])it(`staff get a card after the alert for ${user}`,async()=>{
 await clear();
 const r=await send(user,'Marina Exchange I smell gas');
 expect(r).toHaveProperty('pending_action');
 expect(r).toHaveProperty('reply',expect.stringMatching(/^Safety first/));
 expect(await alerts()).toHaveLength(2);
});
it('the request form bypasses household visit questions and people create only alerts',async()=>{
 await clear();
 const r=await createWorkOrder(ids.faisal,ws,{title:'I smell gas',description:'gas smell in the kitchen',site_id:siteId(4)});
 expect(r).toMatchObject({emergency:true,job:{priority:'urgent',trade:'general'}});
 await clear();
 const before=await withSystem(db=>db.query('SELECT count(*) FROM work_orders'));
 const p=await createWorkOrder(ids.imran,ws,{title:'someone is hurt',site_id:siteId(1)});
 expect(p).toMatchObject({emergency:true,job:null,request:null});
 expect((await withSystem(db=>db.query('SELECT count(*) FROM work_orders'))).rows).toEqual(before.rows);
});
it('false alarms ask supervisors to decide and leave the job unchanged',async()=>{
 await clear();
 const r=await reportEmergency(ids.faisal,ws,'I smell gas',{site_id:siteId(4)});
 for(const words of ['it was not gas','false alarm','sorry it was nothing']){
  const answer=await send(ids.faisal,words);
  expect(answer).toMatchObject({reply:expect.stringContaining('let the supervisor decide')});
 }
 const state=await withSystem(async db=>({job:(await db.query('SELECT * FROM work_orders WHERE id=$1',[r?.job.id])).rows[0],reviews:(await db.query("SELECT * FROM notifications WHERE kind='emergency_review'")).rows}));
 expect(state.job.status).toBe('open');
 expect(state.reviews.map(n=>n.user_id).sort()).toEqual([ids.imran,ids.sam].sort());
 expect(state.reviews.every(n=>n.entity_id===r?.job.id&&n.work_order_title.includes('Should the emergency job be cancelled?'))).toBe(true);
});
it('sends the exact first 140 characters and changes no existing job or team records',async()=>{
 await clear();
 const snapshot=()=>withSystem(async db=>({jobs:(await db.query('SELECT * FROM work_orders ORDER BY id')).rows,members:(await db.query('SELECT * FROM members ORDER BY user_id')).rows}));
 const before=await snapshot();
 const words='someone is hurt '+ 'please help '.repeat(30);
 await send(ids.ravi,words);
 expect((await alerts()).every(n=>n.work_order_title===`Emergency reported by Ravi: ${words.slice(0,140)}`)).toBe(true);
 expect(await snapshot()).toEqual(before);
 expect(assistantTurn).not.toHaveBeenCalled();
});
it('suggestion form alerts before booking without household window',async()=>{
 await clear();
 const r=await createSuggestion(ids.faisal,ws,{title:'I smell gas',problem:'gas smell in the kitchen',site_id:siteId(4)});
 expect(r).toMatchObject({emergency:true,priority:'urgent'});
 expect(await alerts()).toHaveLength(2);
});

it('finds emergencies in several languages',()=>{
 expect(detectEmergency('There is smoke coming from the DB room')).toBe('fire');
 expect(detectEmergency('Gas leak in the kitchen')).toBe('gas');
 expect(detectEmergency('Water everywhere, pipe burst in the basement')).toBe('flood');
 expect(detectEmergency('Socket is sparking')).toBe('electric');
 expect(detectEmergency('رائحة غاز في المطبخ')).toBe('gas');
 expect(detectEmergency('मीटर से चिंगारी निकल रही है')).toBe('electric');
 expect(detectEmergency('ഫ്ലാറ്റിൽ പുക')).toBe('fire');
});
it('does not treat routine equipment as an emergency',()=>{
 for(const t of ['Quarterly fire alarm test','Service the fire extinguishers','Replace smoke detector battery','Fix the floodlight','Tap is dripping','Gas cylinder refill'])expect(detectEmergency(t)).toBeNull();
});
it('gives a safety line first',()=>{expect(safetyLine('smell of gas')).toMatch(/^Safety first/);expect(safetyLine('door handle loose')).toBeNull();});

for(const user of [ids.imran,ids.sam,ids.nabil,ids.ravi])it(`confirmed staff card saves the proposed request for ${user}`,async()=>{
 await clear();
 const pending=await send(user,'Marina Exchange water pouring from the ceiling');
 const id=(pending as any).pending_action.id;
 const confirmed=await assistant(user,ws,{messages:[],confirm_action_id:id});
 expect(confirmed).toMatchObject({available:true});
 expect((confirmed as any).result?.isError).not.toBe(true);
 const saved=await withSystem(async db=>(await db.query('SELECT consumed_at,outcome FROM assistant_actions WHERE id=$1',[id])).rows[0]);
 expect(saved.outcome).toBe('done');
 expect(saved.consumed_at).toBeTruthy();
 expect(await alerts()).toHaveLength(2);
 if(user!==ids.ravi){
  const job=(confirmed as any).result.structuredContent.result;
  expect((await alerts()).every(n=>n.entity_id===job.id&&n.entity==='work_orders')).toBe(true);
 }
});
it('a request without a known site keeps its emergency trade when the supervisor approves it',async()=>{
 await clear();
 const r=await send(ids.faisal,'water pouring from the ceiling') as any;
 const approved=await decideSuggestion(ids.sam,ws,r.request.id,{decision:'approved',overrides:{site_id:siteId(4)}});
 const job=await withSystem(async db=>(await db.query('SELECT trade,priority,description FROM work_orders WHERE id=$1',[approved.work_order_id])).rows[0]);
 expect(job).toEqual({trade:'plumbing',priority:'urgent',description:'water pouring from the ceiling'});
});
it('a different person reporting the same kind still sends an alert',async()=>{
 await clear();
 await send(ids.ravi,'someone is hurt');
 await send(ids.nabil,'someone is hurt');
 expect(await alerts()).toHaveLength(4);
});
it('ordinary messages do not write through emergency intake',async()=>{
 await clear();
 expect(await reportEmergency(ids.ravi,ws,'service the gas stove')).toBeNull();
 expect(await alerts()).toHaveLength(0);
});

it('a report that says nobody was hurt is not an emergency', () => {
 for (const t of ['Fixed the lift, nobody was injured', 'No one is hurt, just a small leak', 'Not injured, the door is fine']) expect(detectEmergency(t)).toBeNull();
});
