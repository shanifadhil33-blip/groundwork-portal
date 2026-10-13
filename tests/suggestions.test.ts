import { afterAll, expect, it } from 'vitest';
import { closePools } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { createSuggestion, decideSuggestion, listSuggestions } from '../lib/services/suggestions';
import { createWorkOrder, getWorkOrder } from '../lib/services/work-orders';
import { listNotifications } from '../lib/services/notifications';
afterAll(closePools);
it('a client request waits for approval then becomes his job with the preferred time',async()=>{
 const s=await createWorkOrder(ids.pranav,ids.ridgeline,{title:'Tap leaks',site_id:siteId(1),preferred_window:'Saturday after 4 PM'});
 expect(s.status).toBe('pending');expect(s.order_number).toBeUndefined();
 expect((await listSuggestions(ids.sam,ids.ridgeline)).data.some(r=>r.id===s.id)).toBe(true);
 const a=await decideSuggestion(ids.sam,ids.ridgeline,s.id,{decision:'approved',overrides:{title:'Repair leaking tap'}});
 const job=await getWorkOrder(ids.pranav,ids.ridgeline,a.work_order_id);
 expect(job.title).toBe('Repair leaking tap');expect(job.preferred_window).toBe('Saturday after 4 PM');
 expect((await listNotifications(ids.pranav,ids.ridgeline,new URLSearchParams())).data.some(n=>n.kind==='suggestion_decided')).toBe(true);
 await expect(decideSuggestion(ids.sam,ids.ridgeline,s.id,{decision:'approved'})).rejects.toMatchObject({status:409});
});
it('decline requires a reason and reaches only the sender',async()=>{
 const s=await createSuggestion(ids.pranav,ids.ridgeline,{title:'New tap',site_id:siteId(1)});
 await expect(decideSuggestion(ids.sam,ids.ridgeline,s.id,{decision:'declined',reason:' '})).rejects.toThrow();
 await expect(decideSuggestion(ids.ravi,ids.ridgeline,s.id,{decision:'approved'})).rejects.toMatchObject({status:403});
 await decideSuggestion(ids.sam,ids.ridgeline,s.id,{decision:'declined',reason:'Please tell us which tap'});
 expect((await listSuggestions(ids.pranav,ids.ridgeline)).data.find(r=>r.id===s.id)?.decline_reason).toBe('Please tell us which tap');
 expect((await listSuggestions(ids.omar,ids.ridgeline)).data.find(r=>r.id===s.id)).toBeUndefined();
});
