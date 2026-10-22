import { afterAll, beforeAll, expect, it } from 'vitest';
import { closePools, withSystem, withUser } from '../lib/db';
import { startDemo } from '../lib/services/demo';
import { getOnboarding, saveOnboarding, onboardingAcceptInvite, onboardingInvite } from '../lib/services/onboarding';
import { createWorkspace } from '../lib/services/workspaces';
import { ids } from '../lib/fixture';
let ws:string,user:string;
beforeAll(async()=>{ws=(await startDemo({persona:'imran'},'setup-rehearsal')).body.workspace_id;user=await withSystem(async db=>(await db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='imran'",[ws])).rows[0].id);});
afterAll(async()=>{await withSystem(db=>db.query('SELECT delete_demo_workspace($1)',[ws]));await closePools();});
it('keeps real onboarding, invitation and workspace creation guards for demo identities',async()=>{
 for(const action of [()=>getOnboarding(user),()=>saveOnboarding(user,{answers:{language:'ar-AE'},advance:true}),()=>createWorkspace(user,{name:'Sample repairs'}),()=>onboardingInvite(user,'practice'),()=>onboardingAcceptInvite(user,{token:'practice'})])await expect(action()).rejects.toMatchObject({code:'P0403'});
 expect((await withSystem(db=>db.query('SELECT * FROM onboarding_progress WHERE user_id=$1',[user]))).rows).toEqual([]);
 await expect(withUser(user,db=>db.query('SELECT require_real_user()'))).rejects.toMatchObject({code:'P0403'});
});
it('keeps real progress saving and Back values unchanged',async()=>{
 expect((await getOnboarding(ids.imran)).step).toBe('language');
 await saveOnboarding(ids.imran,{answers:{language:'en-IN'},advance:true});
 await saveOnboarding(ids.imran,{answers:{identity:'new'},advance:true});
 await saveOnboarding(ids.imran,{answers:{name:'Imran',phone:'+971501234567'},advance:true});
 const back=await saveOnboarding(ids.imran,{answers:{company_name:'Sample repairs'},back:true});
 expect(back.step).toBe('profile');expect(back.answers).toMatchObject({language:'en-IN',identity:'new',name:'Imran',company_name:'Sample repairs'});
});
