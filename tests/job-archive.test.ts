import { afterAll,expect,it } from 'vitest';
import { closePools,withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { archiveWorkOrders,listWorkOrders } from '../lib/services/work-orders';
afterAll(closePools);
const pick=(status:string)=>withSystem(async db=>(await db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND status=$2 ORDER BY order_number LIMIT 1',[ids.ridgeline,status])).rows[0].id as string);
it('archives a finished job, hides it from the list, shows it in Archived jobs and brings it back',async()=>{
 const done=await pick('done');
 expect((await archiveWorkOrders(ids.imran,ids.ridgeline,{ids:[done],archived:true})).updated).toBe(1);
 const main=await listWorkOrders(ids.imran,ids.ridgeline,new URLSearchParams('pageSize=100'));expect(main.data.some((o:{id:string})=>o.id===done)).toBe(false);
 const arch=await listWorkOrders(ids.imran,ids.ridgeline,new URLSearchParams('archived=true&pageSize=100'));expect(arch.data.some((o:{id:string})=>o.id===done)).toBe(true);
 await archiveWorkOrders(ids.imran,ids.ridgeline,{ids:[done],archived:false});
 const back=await listWorkOrders(ids.imran,ids.ridgeline,new URLSearchParams('archived=true&pageSize=100'));expect(back.data.some((o:{id:string})=>o.id===done)).toBe(false);
});
it('refuses open jobs and technicians',async()=>{
 const open=await pick('open'),done=await pick('done');
 await expect(archiveWorkOrders(ids.imran,ids.ridgeline,{ids:[open],archived:true})).rejects.toThrow(/still open/);
 await expect(archiveWorkOrders(ids.ravi,ids.ridgeline,{ids:[done],archived:true})).rejects.toThrow(/admin or supervisor/);
});
