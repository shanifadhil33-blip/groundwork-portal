import './fixtures';
import { afterAll,expect,it } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { saveContactName } from '../lib/services/contact-names';
import { saveOnboarding } from '../lib/services/onboarding';
afterAll(closePools);
it('requires actual row security before privacy tests run',async()=>{const active=await withUser(ids.imran,async db=>(await db.query("SELECT row_security_active('contact_nicknames') AS active")).rows[0].active);expect(active).toBe(true);});
it('other users cannot read, insert or update personal saved names',async()=>{
 await saveContactName(ids.imran,ids.ridgeline,ids.pranav,{nickname:'Pranav at Harbor'});
 expect((await withUser(ids.sam,db=>db.query('SELECT * FROM contact_nicknames'))).rows).toEqual([]);
 await expect(withUser(ids.sam,db=>db.query("INSERT INTO contact_nicknames(owner_user_id,workspace_id,target_user_id,nickname) VALUES($1,$2,$3,'Forged')",[ids.imran,ids.ridgeline,ids.ravi]))).rejects.toMatchObject({code:'42501'});
 expect((await withUser(ids.sam,db=>db.query("UPDATE contact_nicknames SET nickname='Forged' RETURNING *"))).rows).toEqual([]);
});
it('setup answers are private even from company admins',async()=>{
 await saveOnboarding(ids.sam,{answers:{language:'en-IN',name:'Sam'},advance:false});
 expect((await withUser(ids.imran,db=>db.query('SELECT * FROM onboarding_progress'))).rows).toEqual([]);
 await expect(withUser(ids.imran,db=>db.query("INSERT INTO onboarding_progress(user_id) VALUES($1)",[ids.pranav]))).rejects.toMatchObject({code:'42501'});
});
