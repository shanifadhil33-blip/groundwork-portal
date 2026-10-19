// Adhil, Oct 19: simple lookups answer straight from the database with no AI call, well under a second, and stay role scoped.
import './fixtures';
import { afterAll,afterEach,beforeEach,expect,it,vi } from 'vitest';
import { closePools,withSystem } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { ids } from '../scripts/seed';
import { quickLookup } from '../lib/agent/data-answers';
import * as assistantRoute from '../app/api/workspaces/[ws]/assistant/route';
let user:string=ids.sam;const ai=vi.fn(async()=>{throw new Error('no AI call expected');});
beforeEach(()=>{user=ids.sam;setAuthResolverForTests(async()=>user);vi.stubEnv('GEMINI_API_KEY','fictional-key');vi.stubGlobal('fetch',ai);ai.mockClear();});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();setAuthResolverForTests();});
afterAll(closePools);
async function ask(content:string){const t=Date.now();const r=await assistantRoute.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({messages:[{role:'user',content}]})}),{params:Promise.resolve({ws:ids.ridgeline})});return {status:r.status,body:await r.json(),ms:Date.now()-t};}
const waiting=(assignee?:string)=>withSystem(async db=>(await db.query(`SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1 AND status='waiting_on_parts' AND archived_at IS NULL${assignee?' AND assignee_id=$2':''}`,assignee?[ids.ridgeline,assignee]:[ids.ridgeline])).rows[0].n as number);

it('matches only whole short lookups, including the suggested prompts',()=>{
 for(const q of ['Show jobs waiting on parts','show jobs waiting on parts?','Which jobs are waiting for parts','Which jobs are late?','late jobs','What is my next job?',"what's my next job",'Who is free tomorrow?','How are my requests going?','When is the technician coming?'])expect(quickLookup(q),q).not.toBeNull();
 for(const q of ['Show jobs waiting on parts at Marina tower and tell Sam','Why are jobs late this week and what should I do?','Give WO 12 to Ravi','Create a new job','I need a part','Job done, fixed it','late'])expect(quickLookup(q),q).toBeNull();
});
it('supervisor: jobs waiting on parts answers from the database with no AI call in under a second',async()=>{
 const r=await ask('Show jobs waiting on parts');expect(r.status).toBe(200);expect(r.body.quick).toBe(true);expect(ai).not.toHaveBeenCalled();expect(r.ms).toBeLessThan(1000);
 const n=await waiting();expect(r.body.reply).toMatch(n?new RegExp(`^${n} jobs? (?:is|are) waiting on parts\\.`):/^No jobs are waiting on parts\.$/);
});
it('technician sees only his own jobs waiting on parts, and his next job, with no AI call',async()=>{
 user=ids.ravi;const r=await ask('Show jobs waiting on parts');expect(r.body.quick).toBe(true);
 const mine=await waiting(ids.ravi),all=await waiting();expect(all).toBeGreaterThan(mine);
 expect(r.body.reply).toMatch(mine?new RegExp(`^${mine} jobs? (?:is|are) waiting on parts\\.`):/^No jobs are waiting on parts\.$/);
 const next=await ask('What is my next job?');expect(next.body.quick).toBe(true);expect(next.body.reply).toMatch(/^Your next job:|^You have no more/);
 const late=await ask('Which jobs are late?');expect(late.body.quick).toBe(true);
 expect(ai).not.toHaveBeenCalled();
});
it('who is free tomorrow answers for a supervisor; client questions answer only for clients',async()=>{
 const r=await ask('Who is free tomorrow?');expect(r.body.quick).toBe(true);expect(r.body.reply).toMatch(/tomorrow \(/);
 const staffAsk=await ask('How are my requests going?');expect(staffAsk.body.quick).toBeUndefined();
 user=ids.pranav;const c=await ask('How are my requests going?');expect(c.body.quick).toBe(true);expect(c.body.reply).toMatch(/open request/);
 const v=await ask('When is the technician coming?');expect(v.body.quick).toBe(true);
 const w=await ask('Show jobs waiting on parts');expect(w.body.quick).toBe(true);
});
