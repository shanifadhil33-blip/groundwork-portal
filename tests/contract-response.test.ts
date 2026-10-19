// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { ownerOverview } from '../lib/services/owner-overview';
import { dashboard } from '../lib/services/workspaces';
import { patchClient } from '../lib/services/clients';
import { responseWatch, type ResponseWatchItem } from '../lib/services/contract-response';
import { callTool } from '../lib/agent/tools';
import { inWorkspace } from '../lib/services/shared';
import { withSystem, closePools } from '../lib/db';
import { ids, siteId, orderId } from '../lib/fixture';
import { ContractTimes } from '../components/app/dashboard';
import { AppContext } from '../components/app/context';
const ws=ids.ridgeline,now=new Date('2027-02-05T21:30:00Z'); // Already Feb 6 in Dubai.
const jobIds=Array.from({length:8},(_,i)=>`61000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
let clients:any[]=[],audits:string[]=[],counter:number;
beforeAll(async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
 await withSystem(async db=>{
  counter=(await db.query('SELECT last_number FROM work_order_counters WHERE workspace_id=$1',[ws])).rows[0].last_number;
  clients=(await db.query('SELECT id,contract_response_hours,contract_ends_on FROM clients WHERE workspace_id=$1',[ws])).rows;
  audits=(await db.query('SELECT id FROM audit_log WHERE workspace_id=$1',[ws])).rows.map(r=>r.id);
  await db.query('UPDATE clients SET contract_response_hours=NULL WHERE workspace_id=$1',[ws]);
  await db.query("UPDATE clients SET contract_response_hours=4,contract_ends_on='2027-02-06' WHERE id=$1",[ids.harbor]);
  // Ended yesterday in the workspace, but still today in UTC.
  await db.query("UPDATE clients SET contract_response_hours=4,contract_ends_on='2027-02-05' WHERE id=$1",[ids.northgate]);
  const ages=[3.5,5,1,5,1,5,3,4];
  for(let i=0;i<jobIds.length;i++)await db.query(`INSERT INTO work_orders(id,workspace_id,client_id,site_id,title,status,created_by,created_at,scheduled_for,on_way_at,order_number)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[jobIds[i],ws,i===5?ids.northgate:ids.harbor,siteId(i===5?4:1),`Contract test ${i+1}`,i===3||i===4?'scheduled':'open',ids.imran,new Date(now.getTime()-ages[i]*3600000),i===4?new Date(now.getTime()+4*3600000):null,i===3?now:null,9001+i]);
 });
});
afterAll(async()=>{
 await withSystem(async db=>{
  await db.query('DELETE FROM notifications WHERE entity_id=ANY($1::uuid[])',[jobIds]);
  await db.query('DELETE FROM work_order_events WHERE work_order_id=ANY($1::uuid[])',[jobIds]);
  await db.query('DELETE FROM work_orders WHERE id=ANY($1::uuid[])',[jobIds]);
  await db.query('UPDATE work_order_counters SET last_number=$2 WHERE workspace_id=$1',[ws,counter]);
  for(const c of clients)await db.query('UPDATE clients SET contract_response_hours=$2,contract_ends_on=$3 WHERE id=$1',[c.id,c.contract_response_hours,c.contract_ends_on]);
  await db.query('DELETE FROM audit_log WHERE workspace_id=$1 AND NOT(id=ANY($2::uuid[]))',[ws,audits]);
 });
 await closePools();
});
it('Imran sets hours, invalid hours have the plain error, and blank clears',async()=>{
 expect(await patchClient(ids.imran,ws,ids.harbor,{contract_response_hours:4})).toMatchObject({contract_response_hours:4});
 for(const value of [0,169,1.5,'wrong']){
  try{await patchClient(ids.imran,ws,ids.harbor,{contract_response_hours:value});expect.fail('Expected validation');}
  catch(e:any){expect(e.issues?.[0]?.message).toBe('Enter hours from 1 to 168.');}
 }
 expect(await patchClient(ids.imran,ws,ids.harbor,{contract_response_hours:''})).toMatchObject({contract_response_hours:null});
 await patchClient(ids.imran,ws,ids.harbor,{contract_response_hours:4});
});
it('only the admin sets hours; staff, technicians and clients are refused',async()=>{
 for(const actor of [ids.sam,ids.ravi,ids.pranav,ids.faisal])await expect(patchClient(actor,ws,ids.harbor,{contract_response_hours:4})).rejects.toMatchObject({status:403});
 await expect(inWorkspace(ids.sam,ws,async c=>(await c.db.query('UPDATE clients SET contract_response_hours=4 WHERE id=$1',[ids.harbor])).rowCount)).resolves.toBe(0);
});
it('uses the creation clock, travel marker, booked start, and workspace contract end day',async()=>{
 const items=(await responseWatch(ids.imran,ws,now)).filter(j=>jobIds.includes(j.id));
 expect(items.map(j=>[j.id,j.state])).toEqual([[jobIds[1],'missed'],[jobIds[7],'close'],[jobIds[0],'close'],[jobIds[6],'close'],[jobIds[4],'close']]);
 expect(items.find(j=>j.id===jobIds[0])).toMatchObject({due_at:'2027-02-05T22:00:00.000Z',client_name:'Harbor & Pine Coworking',site_name:'Marina Exchange',why:'Most of the promised time has passed and nobody is on the way yet.'});
 expect(items.find(j=>j.id===jobIds[4])?.why).toBe('The booked visit is after the promised time.');
});
it('a job missed more than a week ago drops off',async()=>{
 await withSystem(db=>db.query("UPDATE work_orders SET created_at=$2::timestamptz-interval '9 days' WHERE id=$1",[jobIds[1],now.toISOString()]));
 try{expect((await responseWatch(ids.imran,ws,now)).some(j=>j.id===jobIds[1])).toBe(false);}
 finally{await withSystem(db=>db.query("UPDATE work_orders SET created_at=$2::timestamptz-interval '5 hours' WHERE id=$1",[jobIds[1],now.toISOString()]));}
});
it('null contract end stays active and completed or cancelled jobs are excluded',async()=>{
 await patchClient(ids.imran,ws,ids.harbor,{contract_ends_on:null});
 expect((await responseWatch(ids.imran,ws,now)).some(j=>j.id===jobIds[0])).toBe(true);
 for(const status of ['in_progress','done','cancelled']){
  await withSystem(db=>db.query('UPDATE work_orders SET status=$2 WHERE id=$1',[jobIds[0],status]));
  expect((await responseWatch(ids.imran,ws,now)).some(j=>j.id===jobIds[0])).toBe(false);
 }
 await withSystem(db=>db.query("UPDATE work_orders SET status='open' WHERE id=$1",[jobIds[0]]));
});
it('admin and staff read the same list and other roles are refused by service and tool',async()=>{
 const expected=await responseWatch(ids.imran,ws,now);
 expect(await responseWatch(ids.sam,ws,now)).toEqual(expected);
 for(const actor of [ids.imran,ids.sam,ids.nabil])expect((await callTool({user:actor,ws,scope:'read',kind:'assistant'},'contract_watch',{})).isError).toBeUndefined();
 for(const actor of [ids.ravi,ids.pranav,ids.faisal]){
  await expect(responseWatch(actor,ws,now)).rejects.toMatchObject({status:403});
  expect(await callTool({user:actor,ws,scope:'read',kind:'assistant'},'contract_watch',{})).toMatchObject({isError:true,structuredContent:{error:{code:'forbidden'}}});
 }
});
it('office dashboard and owner overview include the same watch, while client feeds do not',async()=>{
 const expected=await responseWatch(ids.imran,ws);
 expect((await dashboard(ids.imran,ws)).contract_watch).toEqual(expected);
 expect((await dashboard(ids.sam,ws)).contract_watch).toEqual(expected);
 expect((await ownerOverview(ids.imran,ws)).contract_watch).toEqual(expected);
 expect((await dashboard(ids.faisal,ws)).contract_watch).toEqual([]);
});
it('quick answers list the missed job first without AI',async()=>{
 // Fake Date alone leaves database I/O timers working.
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);vi.mocked(assistantTurn).mockClear();
 try{
  for(const content of ['any contract jobs about to miss?','contract response times']){
   const result:any=await assistant(ids.imran,ws,{messages:[{role:'user',content}]});
   expect(result.reply.indexOf('WO 9002')).toBeLessThan(result.reply.indexOf('WO 9001'));
   expect(result.reply).toContain('The promised time has passed and nobody is on the way yet.');
  }
  expect(assistantTurn).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('dashboard card shows why, job links, protected names, workspace time, and at most five items',async()=>{
 const items=await responseWatch(ids.imran,ws,now);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const member={role:'admin',workspace_id:ws};
 const render=async(list:ResponseWatchItem[],role='admin')=>act(async()=>root.render(React.createElement(AppContext.Provider,{value:{member:{...member,role},workspace:{timezone:'Asia/Dubai'}} as any},React.createElement(ContractTimes,{items:list}))));
 try{
  await render([...items,...items.map(j=>({...j,id:j.id+'copy'}))]);
  expect(host.textContent).toContain(items[0].why);expect(host.querySelectorAll('li')).toHaveLength(5);
  expect(host.querySelector('a')?.getAttribute('href')).toBe(`/work-orders/${items[0].id}`);
  expect(host.querySelector('a')?.style.minHeight).toBe('44px');
  expect(host.querySelector('strong[data-no-translate]')?.textContent).toBe(items[0].title);
  expect(host.querySelector('time')?.textContent).toContain('6'); // Feb 6 in Dubai, Feb 5 UTC.
  await render([]);expect(host.textContent).toBe('');
  await render(items,'technician');expect(host.textContent).toBe('');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('fixture has a close and missed open Harbor job at build time without changing its people',async()=>{
 const original=clients.find(c=>c.id===ids.harbor);expect(original.contract_response_hours).toBe(4);
 const jobs=await withSystem(async db=>(await db.query('SELECT id,created_at FROM work_orders WHERE id=ANY($1::uuid[])',[ [orderId(1),orderId(7)] ])).rows);
 const buildTime=new Date(new Date(jobs.find(j=>j.id===orderId(1)).created_at).getTime()+3.5*3600000);
 const list=await responseWatch(ids.imran,ws,buildTime);
 expect(list.find(j=>j.id===orderId(1))?.state).toBe('close');expect(list.find(j=>j.id===orderId(7))?.state).toBe('missed');
});
it('rollback removes the column and migration can be reapplied in one local transaction',async()=>{
 const rollback=readFileSync('db/rollbacks/rollback-0061_contract_response.sql','utf8'),migration=readFileSync('db/migrations/0061_contract_response.sql','utf8');
 await withSystem(async db=>{
  await db.query('SAVEPOINT response_rollback');
  try{
   await db.query(rollback);
   expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='contract_response_hours'")).rows).toEqual([]);
   await db.query(migration);
   expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clients' AND column_name='contract_response_hours'")).rowCount).toBe(1);
  }finally{await db.query('ROLLBACK TO SAVEPOINT response_rollback');}
 });
});
