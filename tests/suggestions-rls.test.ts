import { afterAll, expect, it } from 'vitest';
import { closePools, withUser } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
afterAll(closePools);
const make=(user:string)=>withUser(user,async db=>(await db.query("INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,title) VALUES($1,'client',$2,'Pranav',$3,$4,'Leaking tap') RETURNING id",[ids.ridgeline,user,ids.harbor,siteId(1)])).rows[0].id);
it('clients read only their own suggestions and cannot decide',async()=>{
 const id=await make(ids.pranav);
 expect((await withUser(ids.omar,db=>db.query('SELECT id FROM job_suggestions WHERE id=$1',[id]))).rowCount).toBe(0);
 expect((await withUser(ids.pranav,db=>db.query("UPDATE job_suggestions SET status='declined',decline_reason='Wrong site',decided_by=$2,decided_at=now() WHERE id=$1 RETURNING id",[id,ids.pranav]))).rowCount).toBe(0);
 expect((await withUser(ids.sam,db=>db.query('SELECT id FROM job_suggestions WHERE id=$1',[id]))).rowCount).toBe(1);
 expect((await withUser(ids.ravi,db=>db.query("UPDATE job_suggestions SET title='Changed' WHERE id=$1 RETURNING id",[id]))).rowCount).toBe(0);
 expect((await withUser(ids.summitAdmin,db=>db.query('SELECT id FROM job_suggestions'))).rowCount).toBe(0);
});
it('client cannot spoof a sender or company',async()=>{
 await expect(make(ids.omar)).rejects.toMatchObject({code:'42501'});
 await expect(withUser(ids.pranav,db=>db.query("INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,title) VALUES($1,'client',$2,'Omar',$3,$4,'Wrong sender')",[ids.ridgeline,ids.omar,ids.harbor,siteId(1)]))).rejects.toMatchObject({code:'42501'});
});
