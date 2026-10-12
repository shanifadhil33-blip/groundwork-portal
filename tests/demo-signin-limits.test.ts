import './fixtures';
import { afterAll,expect,it } from 'vitest';
import { closePools,withSystem } from '../lib/db';
import { startDemo,sandboxToken,cleanupDemo,DEMO_NEW_PER_IP_HOUR } from '../lib/services/demo';
afterAll(async()=>{await cleanupDemo();await closePools();});
it('reuses the visitor sandbox: 30 sign ins across every person never get blocked or build new sandboxes',async()=>{
 const first=await startDemo({persona:'imran'},'judge-ip');const ws=first.body.workspace_id;const token=sandboxToken(ws);
 const people=['imran','sam','ravi','pranav','omar'] as const;
 for(let i=0;i<30;i++){const r=await startDemo({persona:people[i%5]},'judge-ip',token);expect(r.body.workspace_id).toBe(ws);expect(r.body.persona).toBe(people[i%5]);}
 const made=await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM demo_creation_attempts WHERE created_at>now()-interval \'1 minute\'')).rows[0].n);
 expect(made).toBeLessThan(DEMO_NEW_PER_IP_HOUR);
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[ws]));
},120000);
it('ignores a forged sandbox pointer and builds a fresh sandbox',async()=>{
 const r=await startDemo({persona:'sam'},'other-ip','00000000-0000-0000-0000-000000000000.forged');expect(r.body.workspace_id).not.toBe('00000000-0000-0000-0000-000000000000');
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[r.body.workspace_id]));
},60000);
it('allows generous new sandboxes per network before refusing abuse',()=>{expect(DEMO_NEW_PER_IP_HOUR).toBeGreaterThanOrEqual(30);});
