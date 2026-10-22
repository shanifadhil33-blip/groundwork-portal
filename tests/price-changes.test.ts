import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { createWorkOrder, getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { reportPriceChange, reportClientRefused, getPriceChange, waitingPrices } from '../lib/services/price-changes';
import { sendQuote, decideQuote } from '../lib/services/quotes';
import { saveJobReport } from '../lib/services/job-report';
import { saveJobChecklist } from '../lib/services/job-checklists';
const ws=ids.ridgeline;
afterAll(closePools);
async function job(){const o=await createWorkOrder(ids.imran,ws,{title:'Check water heater',site_id:siteId(1),assignee_id:ids.ravi});await withSystem(db=>db.query("UPDATE work_orders SET status='scheduled' WHERE id=$1",[o.id]),ids.imran);return getWorkOrder(ids.imran,ws,o.id);}
it('assigned technician records exact words, not a price; retries once and blocks work for all roles until approval',async()=>{
 const j=await job(),words='The fan motor needs replacing. I told the client 900.';
 const saved=await reportPriceChange(ids.ravi,ws,j.id,{words},'finding');
 expect(await reportPriceChange(ids.ravi,ws,j.id,{words},'finding')).toEqual(saved);
 expect((await getWorkOrder(ids.ravi,ws,j.id)).quote_amount).toBeNull();
 expect((await getPriceChange(ids.pranav,ws,j.id))?.words).toBe(words);
 expect((await waitingPrices(ids.sam,ws)).some(r=>r.id===j.id)).toBe(true);
 for(const user of [ids.ravi,ids.imran,ids.sam,ids.nabil]){
  const current=await getWorkOrder(user,ws,j.id);
  await expect(patchWorkOrder(user,ws,j.id,{status:'in_progress',updated_at:new Date(current.updated_at).toISOString()})).rejects.toMatchObject({status:409,code:'price_hold'});
  await expect(saveJobReport(user,ws,j.id,{updated_at:new Date(current.updated_at).toISOString()})).rejects.toMatchObject({status:409,code:'price_hold'});
 }
 await expect(saveJobChecklist(ids.ravi,ws,j.id,{action:'add_material',name:'Motor',quantity:1})).rejects.toMatchObject({status:409});
 await sendQuote(ids.imran,ws,j.id,{amount:950,note:'New fan motor'},'price');
 await expect(decideQuote(ids.pranav,ws,j.id,{decision:'approved',amount:900})).rejects.toMatchObject({status:409});
 const answer={decision:'approved',amount:950};
 const first=await decideQuote(ids.pranav,ws,j.id,answer,'answer');expect(await decideQuote(ids.pranav,ws,j.id,answer,'answer')).toEqual(first);
 const current=await getWorkOrder(ids.ravi,ws,j.id);
 await expect(patchWorkOrder(ids.ravi,ws,j.id,{status:'in_progress',updated_at:new Date(current.updated_at).toISOString()})).resolves.toMatchObject({status:'in_progress'});
 expect((await getPriceChange(ids.imran,ws,j.id))?.state).toBe('approved');
});
it('only the owner or an admin with the existing money handover sets a price',async()=>{
 const j=await job();
 for(const user of [ids.sam,ids.nabil,ids.ravi,ids.pranav,ids.faisal,ids.summitAdmin])await expect(sendQuote(user,ws,j.id,{amount:12})).rejects.toMatchObject({status:expect.any(Number)});
 await withSystem(db=>db.query("UPDATE members SET role='admin' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 await expect(sendQuote(ids.sam,ws,j.id,{amount:12})).rejects.toMatchObject({status:403});
 await withSystem(db=>db.query("UPDATE workspaces SET owner_handover='{payments}' WHERE id=$1",[ws]));
 await expect(sendQuote(ids.sam,ws,j.id,{amount:12},'same')).resolves.toMatchObject({quote_status:'pending'});
 await withSystem(db=>db.query("UPDATE workspaces SET owner_handover='{}' WHERE id=$1",[ws]));
 await expect(sendQuote(ids.sam,ws,j.id,{amount:12},'same')).rejects.toMatchObject({status:403});
 await withSystem(db=>db.query("UPDATE members SET role='staff' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
});
it('other technicians and clients cannot report or answer for another client; client no holds until technician confirms refusal',async()=>{
 const j=await job();
 await withSystem(db=>db.query("UPDATE members SET role='technician' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 for(const user of [ids.sam,ids.nabil,ids.pranav,ids.summitAdmin])await expect(reportPriceChange(user,ws,j.id,{words:'New finding'})).rejects.toMatchObject({status:403});
 await withSystem(db=>db.query("UPDATE members SET role='staff' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 await reportPriceChange(ids.ravi,ws,j.id,{words:'The tank is leaking.'});
 await sendQuote(ids.imran,ws,j.id,{amount:750});
 for(const user of [ids.faisal,ids.nabil,ids.ravi,ids.summitAdmin])await expect(decideQuote(user,ws,j.id,{decision:'approved'})).rejects.toThrow();
 await decideQuote(ids.pranav,ws,j.id,{decision:'declined',amount:750});
 expect((await getPriceChange(ids.sam,ws,j.id))?.state).toBe('declined');
 expect((await getWorkOrder(ids.imran,ws,j.id)).status).toBe('scheduled');
 await expect(reportClientRefused(ids.sam,ws,j.id,{words:'No work wanted'})).rejects.toMatchObject({status:403});
 const refused=await reportClientRefused(ids.ravi,ws,j.id,{words:'The client does not want the work done.'},'refuse');
 expect(refused.state).toBe('refused');expect(refused.visit_charge).toBe(150);
 expect(await reportClientRefused(ids.ravi,ws,j.id,{words:'The client does not want the work done.'},'refuse')).toEqual(refused);
 const closed=await getWorkOrder(ids.pranav,ws,j.id);expect(closed.status).toBe('cancelled');expect(closed.comments.some((c:any)=>c.visibility==='client'&&c.body.includes('Client refused'))).toBe(true);
});
it('validates findings, amounts and idempotency content; closed jobs reject reports',async()=>{
 const j=await job();
 for(const body of [{words:''},{words:'x'.repeat(2001)},{words:'Finding',amount:500}])await expect(reportPriceChange(ids.ravi,ws,j.id,body)).rejects.toThrow();
 for(const amount of [-1,10000001,Infinity,1.001])await expect(sendQuote(ids.imran,ws,j.id,{amount})).rejects.toThrow();
 await reportPriceChange(ids.ravi,ws,j.id,{words:'Finding'},'one');
 await expect(reportPriceChange(ids.ravi,ws,j.id,{words:'Other'},'one')).rejects.toMatchObject({status:409});
 await withSystem(db=>db.query("UPDATE work_orders SET status='cancelled' WHERE id=$1",[j.id]),ids.imran);
 await expect(reportPriceChange(ids.ravi,ws,j.id,{words:'Finding'})).rejects.toMatchObject({status:409});
});
