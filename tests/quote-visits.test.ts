import { afterAll, expect, it, vi } from 'vitest';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
vi.mock('../lib/services/push',()=>({sendPush:vi.fn(async()=>0),pushJobChange:vi.fn(async()=>undefined)}));
import { closePools, withSystem } from '../lib/db';
import { ids,siteId } from '../scripts/seed';
import { prepareQuoteVisit, quoteVisitFromWords } from '../lib/services/quote-visits';
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { callTool } from '../lib/agent/tools';
const ws=ids.ridgeline;
afterAll(closePools);
it.each([ids.faisal,ids.pranav,ids.kevin])('offers a quote visit to each client kind and waits for Yes: %s',async user=>{
 const words='How much will it cost to fix my water heater?';
 const offered:any=await assistant(user,ws,{messages:[{role:'user',content:words}]});
 expect(offered.choices).toContain('Quote visit');
 const choices:any=await quoteVisitFromWords(user,ws,[{role:'user',content:words},{role:'assistant',content:offered.reply},{role:'user',content:'Quote visit'}]);
 expect(choices.reply).toBe('Which site is this for?');expect(choices.choices.length).toBeGreaterThan(0);
 const card:any=await assistant(user,ws,{messages:[{role:'user',content:choices.choices[0]}]});
 expect(card.pending_action.quote_visit).toBe(true);
 expect(card.pending_action.fields.visit_charge).toMatchObject({amount:150,currency:'AED'});
 const before=await withSystem(async db=>(await db.query("SELECT count(*)::int AS n FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND title='Quote visit'",[ws,user])).rows[0].n);
 await withSystem(db=>db.query('UPDATE workspaces SET visit_charge=999 WHERE id=$1',[ws]));
 await assistant(user,ws,{messages:[],confirm_action_id:card.pending_action.id});
 const saved=await withSystem(async db=>(await db.query("SELECT problem,visit_charge_shown FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND title='Quote visit' ORDER BY created_at DESC",[ws,user])).rows);
 expect(saved).toHaveLength(before+1);expect(saved[0]).toMatchObject({problem:words,visit_charge_shown:'150.00'});
 await expect(assistant(user,ws,{messages:[],confirm_action_id:card.pending_action.id})).rejects.toMatchObject({status:409});
 await withSystem(db=>db.query('UPDATE workspaces SET visit_charge=150 WHERE id=$1',[ws]));
});
it('region aware charge, zero and no charge stay on the confirmed card without guesses',async()=>{
 await withSystem(db=>db.query("UPDATE sites SET region='Sharjah' WHERE id=$1",[siteId(1)]));
 const body={site_id:siteId(1),words:'Water heater quote'};
 expect((await prepareQuoteVisit(ids.pranav,ws,body)).pending_action.fields.visit_charge.amount).toBe(200);
 await withSystem(db=>db.query("UPDATE workspaces SET visit_charge_regions='{\"Sharjah\":0}' WHERE id=$1",[ws]));
 expect((await prepareQuoteVisit(ids.pranav,ws,body)).pending_action.fields.visit_charge.amount).toBe(0);
 await withSystem(db=>db.query("UPDATE workspaces SET visit_charge=NULL,visit_charge_regions='{}' WHERE id=$1",[ws]));
 const r:any=await prepareQuoteVisit(ids.pranav,ws,body);expect(r.pending_action.fields.visit_charge.amount).toBeNull();
 expect(r.pending_action.why).toBe('Nothing is sent until you tap Yes.');
 await assistant(ids.pranav,ws,{messages:[],confirm_action_id:r.pending_action.id});
 const saved=await withSystem(async db=>(await db.query("SELECT visit_charge_shown FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND title='Quote visit' ORDER BY created_at DESC LIMIT 1",[ws,ids.pranav])).rows[0]);
 expect(saved.visit_charge_shown).toBeNull();
});
it('rejects foreign sites, non clients and invented charge inputs',async()=>{
 const data={site_id:siteId(1),words:'Check heater'};
 for(const user of [ids.faisal,ids.summitAdmin,ids.ravi,ids.nabil])await expect(prepareQuoteVisit(user,ws,data)).rejects.toThrow();
 await expect(prepareQuoteVisit(ids.pranav,ws,{...data,visit_charge:{amount:1,currency:'AED'}})).rejects.toThrow();
 expect((await callTool({user:ids.pranav,ws,scope:'write',kind:'assistant'},'request_quote_visit',data)).isError).toBeUndefined();
});

it('demo case three has a held new price and a quote visit request from the same client',async()=>{
 const {populateQuoteFixture}=await import('../lib/fixture-quotes');
 await withSystem(db=>populateQuoteFixture(db,ids),ids.imran);
 const {waitingPrices}=await import('../lib/services/price-changes');
 const pending=await waitingPrices(ids.pranav,ws);
 const changed=pending.find(r=>r.price_change?.state==='pending');
 expect(changed).toBeTruthy();expect(changed?.quote_amount).toBe('850.00');expect(changed?.price_change.words).toContain('fan motor');expect(changed?.status).toBe('in_progress');
 const requests=await withSystem(async db=>(await db.query("SELECT problem,visit_charge_shown FROM job_suggestions WHERE workspace_id=$1 AND title='Quote visit' AND sender_user_id=$2",[ws,ids.pranav])).rows);
 expect(requests.some(r=>r.problem==='How much will it cost to fix my water heater?'&&r.visit_charge_shown==='150.00')).toBe(true);
});

it('agent confirmation preserves the technician words instead of a model paraphrase',async()=>{
 const {createWorkOrder,getWorkOrder}=await import('../lib/services/work-orders');
 const j=await createWorkOrder(ids.imran,ws,{title:'Check cooling',site_id:siteId(1),assignee_id:ids.ravi});
 const words=`WO ${j.order_number}. It is not just a filter, the fan motor needs replacing. I told him 900.`;
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{id:'finding',name:'report_price_change',args:{id:j.id,words:'The motor broke'}}]} as any);
 const card:any=await assistant(ids.ravi,ws,{messages:[{role:'user',content:words}]});
 expect(card.pending_action.tool).toBe('report_price_change');expect(card.pending_action.args.words).toBe(words);
 expect((await getWorkOrder(ids.ravi,ws,j.id)).price_change).toBeNull();
 await assistant(ids.ravi,ws,{messages:[],confirm_action_id:card.pending_action.id});
 const saved=await getWorkOrder(ids.ravi,ws,j.id);expect(saved.price_change.words).toBe(words);expect(saved.quote_amount).toBeNull();
});

it.each(['என் வாட்டர் ஹீட்டரை சரி செய்ய எவ்வளவு செலவாகும்?','Magkano ang pagayos ng water heater?','كم سعر تصليح السخان؟','വാട്ടർ ഹീറ്റർ ശരിയാക്കാൻ എത്ര ചാർജ് വരും?'])('household repair price question offers a quote visit without model pricing: %s',async words=>{
 const r:any=await assistant(ids.faisal,ws,{messages:[{role:'user',content:words}]});
 expect(r.choices).toContain('Quote visit');expect(r.reply).toContain('The office will confirm the price.');
});
