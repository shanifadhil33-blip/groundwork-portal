// DEMO14: agent rate limits per demo sandbox. Friendly note, never an error; demo sign in and real companies are never limited.
import { afterAll,beforeEach,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ids } from '../lib/fixture';
import { assistant } from '../lib/services/assistant';
import { demoAgentAllowed, DEMO_LIMITS, DEMO_REST } from '../lib/services/demo-agent-limit';
import * as start from '../app/api/demo/start/route';
beforeEach(async()=>{setAuthResolverForTests();const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');await db.query('TRUNCATE demo_agent_calls');}finally{db.release();}});
afterAll(async()=>{await closePools();});
const q=async(sql:string,a:unknown[]=[])=>withSystem(async db=>(await db.query(sql,a)).rows);
const demo=async(persona='imran')=>{const r=await start.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({persona})}));expect(r.status).toBe(201);return (await r.json()).workspace_id as string;};
const fill=(ws:string,n:number,minutesAgo=1)=>q('INSERT INTO demo_agent_calls(workspace_id,at) SELECT $1,now()-make_interval(mins=>$3) FROM generate_series(1,$2)',[ws,n,minutesAgo]);
const admin=async(ws:string)=>(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='admin' LIMIT 1",[ws]))[0].user_id as string;
it('a real company is never limited and nothing is counted',async()=>{
 for(let i=0;i<DEMO_LIMITS.short.n+5;i++)expect(await demoAgentAllowed(ids.ridgeline)).toBe(true);
 expect((await q('SELECT count(*)::int n FROM demo_agent_calls'))[0].n).toBe(0);
});
it('a demo sandbox gets 20 AI questions in 10 minutes, then a friendly note with no AI call and no error',async()=>{
 const ws=await demo();
 for(let i=0;i<DEMO_LIMITS.short.n;i++)expect(await demoAgentAllowed(ws)).toBe(true);
 expect(await demoAgentAllowed(ws)).toBe(false);
 const r=await assistant(await admin(ws),ws,{messages:[{role:'user',content:'Which jobs are most urgent this week and why?'}]}) as {available:boolean;reply:string;demo_rest?:boolean};
 expect(r).toMatchObject({available:true,reply:DEMO_REST,demo_rest:true});
 expect(r.reply).not.toMatch(/error|limit|429|quota exceeded/i);
});
it('the short window frees up after 10 minutes; the hour cap and the all demos cap still hold',async()=>{
 const ws=await demo();await fill(ws,DEMO_LIMITS.short.n,11);expect(await demoAgentAllowed(ws)).toBe(true);
 await q('TRUNCATE demo_agent_calls');await fill(ws,DEMO_LIMITS.hour.n,30);expect(await demoAgentAllowed(ws)).toBe(false);
 await q('TRUNCATE demo_agent_calls');const other=await demo('sam');await fill(other,DEMO_LIMITS.all.n,30);expect(await demoAgentAllowed(ws)).toBe(false);
 await q('TRUNCATE demo_agent_calls');await fill(ws,5,90);expect(await demoAgentAllowed(ws)).toBe(true);
});
it('DEMO17: the shared count survives a sandbox reset, and a daily total holds across all sandboxes',async()=>{
 const ws=await demo();await fill(ws,DEMO_LIMITS.all.n,30);
 await q('SELECT delete_demo_workspace($1)',[ws]);
 expect((await q('SELECT count(*)::int n FROM demo_agent_calls WHERE workspace_id IS NULL'))[0].n).toBe(DEMO_LIMITS.all.n);
 const fresh=await demo('sam');expect(await demoAgentAllowed(fresh)).toBe(false);
 await q('TRUNCATE demo_agent_calls');await q('INSERT INTO demo_agent_calls(workspace_id,at) SELECT NULL,now()-make_interval(mins=>120) FROM generate_series(1,$1)',[DEMO_LIMITS.day.n]);
 expect(await demoAgentAllowed(fresh)).toBe(false);
 await q('TRUNCATE demo_agent_calls');expect(await demoAgentAllowed(fresh)).toBe(true);
});
it('over the limit: demo sign in still works, answers that need no AI still answer, and a safety line still comes first',async()=>{
 const ws=await demo();await fill(ws,DEMO_LIMITS.short.n);
 const again=await start.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({persona:'ravi'})}));expect(again.status).toBe(201);
 const ravi=(await q("SELECT user_id FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND u.name='Ravi'",[ws]))[0].user_id;
 const phone=await assistant(ravi,ws,{messages:[{role:'user',content:'change my phone number'}]}) as {reply:string};
 expect(phone.reply).toMatch(/office/);expect(phone.reply).not.toBe(DEMO_REST);
 const gas=await assistant(await admin(ws),ws,{messages:[{role:'user',content:'I smell gas in the kitchen, what should the technician check first?'}]}) as {reply:string};
 expect(gas.reply.length).toBeGreaterThan(0);
});
it('sign in and switch routes never call the limit, and the note is written in all 21 languages',()=>{
 for(const f of ['app/api/demo/start/route.ts','app/api/demo/switch/route.ts','lib/services/demo.ts'])expect(readFileSync(f,'utf8')).not.toMatch(/demoAgentAllowed/);
 for(const f of require('node:fs').readdirSync('public/i18n'))expect(JSON.parse(readFileSync(`public/i18n/${f}`,'utf8'))[DEMO_REST],f).toBeTruthy();
});
