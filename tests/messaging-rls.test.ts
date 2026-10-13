import { afterAll,expect,it } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
afterAll(closePools);
const allowed=(user:string,target:string)=>withUser(user,async db=>(await db.query('SELECT can_message_person($1,$2) AS allowed',[ids.ridgeline,target])).rows[0].allowed);
it('role reachability is symmetric and refuses unrelated clients and companies',async()=>{
 expect(await allowed(ids.ravi,ids.sam)).toBe(true);expect(await allowed(ids.sam,ids.ravi)).toBe(true);
 expect(await allowed(ids.pranav,ids.kevin)).toBe(true);expect(await allowed(ids.kevin,ids.pranav)).toBe(true);
 expect(await allowed(ids.pranav,ids.omar)).toBe(false);expect(await allowed(ids.omar,ids.pranav)).toBe(false);
 expect(await allowed(ids.ravi,ids.summitAdmin)).toBe(false);
});
it('only participants can read a thread and forge neither sender nor participants',async()=>{
 const participants=[ids.sam,ids.pranav].sort();
 const c=await withUser(ids.sam,async db=>(await db.query('INSERT INTO conversations(workspace_id,participants) VALUES($1,$2) RETURNING id',[ids.ridgeline,participants])).rows[0]);
 expect((await withUser(ids.imran,db=>db.query('SELECT id FROM conversations WHERE id=$1',[c.id]))).rowCount).toBe(0);
 await expect(withUser(ids.omar,db=>db.query('INSERT INTO conversations(workspace_id,participants) VALUES($1,$2)',[ids.ridgeline,[ids.pranav,ids.omar].sort()]))).rejects.toMatchObject({code:'42501'});
 await expect(withUser(ids.pranav,db=>db.query("INSERT INTO messages(workspace_id,conversation_id,sender_id,sender_name,body) VALUES($1,$2,$3,'Sam','Forged')",[ids.ridgeline,c.id,ids.sam]))).rejects.toMatchObject({code:'42501'});
});
