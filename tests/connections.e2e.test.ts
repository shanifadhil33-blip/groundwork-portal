import { afterAll,expect,it,vi } from 'vitest';
import { closePools,withUser,withSystem } from '../lib/db';
import { ids,siteId } from '../scripts/seed';
import { createSuggestion,decideSuggestion,listSuggestions } from '../lib/services/suggestions';
import { createWorkOrder,getWorkOrder,patchWorkOrder,createComment,listWorkOrders } from '../lib/services/work-orders';
import { listNotifications } from '../lib/services/notifications';
import { dashboard } from '../lib/services/workspaces';
import { needsAttention } from '../lib/services/attention';
import { scheduleBoard } from '../lib/services/schedule';
import { requestTimeOff,decideTimeOff,leaveRequests } from '../lib/services/time-off';
import { sendQuote,decideQuote } from '../lib/services/quotes';
import { saveJobReport,jobRecord } from '../lib/services/job-report';
import { fixHistory } from '../lib/services/fix-history';
import { intakeWhatsApp } from '../lib/services/whatsapp';
import { setMemberRoles } from '../lib/services/members';
import { setClientArchived,setSiteArchived } from '../lib/services/clients';
import { restoreJob } from '../lib/services/job-records';
import { callTool } from '../lib/agent/tools';
const ws=ids.ridgeline;
afterAll(closePools);
const notices=(user:string)=>listNotifications(user,ws,new URLSearchParams('pageSize=100'));
async function approved(user=ids.pranav,site=siteId(1)){const s=await createWorkOrder(user,ws,{title:'Connection tap',description:'Tap leaks',site_id:site,preferred_window:'Saturday after 4 PM'});const a=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});return getWorkOrder(user,ws,a.work_order_id);}
it('technician suggestion reaches supervisor list dashboard bell and Agent',async()=>{
 const job=await withUser(ids.ravi,async db=>(await db.query('SELECT id,site_id,client_id FROM work_orders WHERE assignee_id=$1 LIMIT 1',[ids.ravi])).rows[0]);
 const s=await createSuggestion(ids.ravi,ws,{title:'New valve',problem:'Valve worn',site_id:job.site_id,client_id:job.client_id,from_work_order_id:job.id});
 expect((await listSuggestions(ids.sam,ws)).data.some(r=>r.id===s.id)).toBe(true);
 expect((await dashboard(ids.sam,ws)).pending_suggestions).toBeGreaterThan(0);
 expect((await notices(ids.sam)).data.some(n=>n.entity_id===s.id&&n.link_target?.entity==='job_suggestions')).toBe(true);
 const result=await callTool({user:ids.sam,ws,kind:'assistant',scope:'read'},'list_suggestions',{});
 expect((result.structuredContent as any).result.data.some((r:any)=>r.id===s.id)).toBe(true);
});
it('household sees request received then the approved job and supervisor sees his preferred time',async()=>{
 const s=await createWorkOrder(ids.faisal,ws,{title:'Kitchen tap',site_id:siteId(4),preferred_window:'Saturday after 4 PM'});
 expect((await listSuggestions(ids.faisal,ws)).data.some(r=>r.id===s.id&&r.status==='pending')).toBe(true);
 const a=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});
 expect((await getWorkOrder(ids.faisal,ws,a.work_order_id)).preferred_window).toBe('Saturday after 4 PM');
 const board=await scheduleBoard(ids.sam,ws,new URLSearchParams('from=2026-10-15&days=7'));
 expect(board.unscheduled.find(j=>j.id===a.work_order_id)?.preferred_window).toBe('Saturday after 4 PM');
 expect((await notices(ids.faisal)).data.some(n=>n.entity_id===a.work_order_id&&n.kind==='suggestion_decided')).toBe(true);
 expect((await listSuggestions(ids.omar,ws)).data.some(r=>r.id===s.id)).toBe(false);
});
it('leave reaches approver then technician and the schedule',async()=>{
 const start='2027-01-20',r=await requestTimeOff(ids.ravi,ws,{starts_on:start});
 expect((await leaveRequests(ids.sam,ws)).requests.some(t=>t.id===r.id)).toBe(true);
 expect((await notices(ids.sam)).data.some(n=>n.kind==='leave_requested'&&n.entity_id===r.id)).toBe(true);
 await decideTimeOff(ids.sam,ws,r.id,{decision:'approved'});
 expect((await leaveRequests(ids.ravi,ws)).requests.find(t=>t.id===r.id)?.status).toBe('approved');
 expect((await notices(ids.ravi)).data.some(n=>n.kind==='leave_decided'&&n.entity_id===r.id)).toBe(true);
 expect((await scheduleBoard(ids.sam,ws,new URLSearchParams(`from=${start}`))).away.some(t=>t.user_id===ids.ravi)).toBe(true);
});
it('quote reaches the manager and the answer returns to admin and Agent attention',async()=>{
 const job=await approved();await sendQuote(ids.imran,ws,job.id,{amount:125,note:'New valve'});
 expect((await notices(ids.pranav)).data.some(n=>n.kind==='quote_sent'&&n.entity_id===job.id)).toBe(true);
 expect((await needsAttention(ids.pranav,ws)).pending_quotes.some(q=>q.id===job.id)).toBe(true);
 await decideQuote(ids.pranav,ws,job.id,{decision:'approved'});
 expect((await getWorkOrder(ids.imran,ws,job.id)).quote_status).toBe('approved');
 expect((await notices(ids.imran)).data.some(n=>n.kind==='quote_decided'&&n.entity_id===job.id)).toBe(true);
});
it('assignment status and visible replies reach their readers, internal notes stay private',async()=>{
 let job=await approved();job=await patchWorkOrder(ids.sam,ws,job.id,{assignee_id:ids.ravi,updated_at:job.updated_at.toISOString()});
 expect((await notices(ids.ravi)).data.some(n=>n.kind==='job_assigned'&&n.entity_id===job.id)).toBe(true);
 expect((await listWorkOrders(ids.ravi,ws,new URLSearchParams())).data.some(j=>j.id===job.id)).toBe(true);
 job=await patchWorkOrder(ids.sam,ws,job.id,{status:'scheduled',updated_at:job.updated_at.toISOString()});
 expect((await notices(ids.kevin)).data.some(n=>n.kind==='status_changed'&&n.entity_id===job.id)).toBe(true);
 await createComment(ids.ravi,ws,job.id,{body:'I will bring a valve',visibility:'client'});
 expect((await getWorkOrder(ids.pranav,ws,job.id)).comments.some((c:any)=>c.body==='I will bring a valve')).toBe(true);
 expect((await notices(ids.pranav)).data.some(n=>n.kind==='comment_added'&&n.entity_id===job.id)).toBe(true);
 await createComment(ids.pranav,ws,job.id,{body:'Please use reception',visibility:'client'});
 expect((await notices(ids.ravi)).data.some(n=>n.kind==='comment_added'&&n.entity_id===job.id)).toBe(true);
 await createComment(ids.sam,ws,job.id,{body:'Internal cost note',visibility:'internal'});
 expect((await getWorkOrder(ids.pranav,ws,job.id)).comments.some((c:any)=>c.body==='Internal cost note')).toBe(false);
});
it('closed outcome appears in fix history and counts',async()=>{
 let job=await approved();job=await patchWorkOrder(ids.sam,ws,job.id,{assignee_id:ids.ravi,updated_at:job.updated_at.toISOString()});
 const before=await jobRecord(ids.ravi,ws,ids.ravi);
 await saveJobReport(ids.ravi,ws,job.id,{problem:'Leaking tap',work:'Replaced washer',outcome:'fixed',updated_at:job.updated_at.toISOString()});
 expect((await fixHistory(ids.pranav,ws)).find(j=>j.order_number===job.order_number)).toMatchObject({fix:'Replaced washer',outcome:'fixed'});
 expect((await jobRecord(ids.ravi,ws,ids.ravi)).total).toBe(before.total+1);
 expect((await notices(ids.pranav)).data.some(n=>n.kind==='status_changed'&&n.entity_id===job.id)).toBe(true);
});
it('cancel restore archive and role changes reach lists permissions and Agent',async()=>{
 let job=await approved();job=await patchWorkOrder(ids.sam,ws,job.id,{status:'cancelled',updated_at:job.updated_at.toISOString()});
 expect((await listWorkOrders(ids.pranav,ws,new URLSearchParams('active=true'))).data.some(j=>j.id===job.id)).toBe(false);
 await restoreJob(ids.sam,ws,job.id,{});expect((await getWorkOrder(ids.pranav,ws,job.id)).status).toBe('open');
 await setSiteArchived(ids.imran,ws,siteId(1),true);
 await expect(createWorkOrder(ids.pranav,ws,{title:'Blocked',site_id:siteId(1)})).rejects.toMatchObject({status:422});
 await setSiteArchived(ids.imran,ws,siteId(1),false);
 await setClientArchived(ids.imran,ws,ids.harbor,true);
 await expect(createWorkOrder(ids.pranav,ws,{title:'Blocked',site_id:siteId(1)})).rejects.toMatchObject({status:422});
 await setClientArchived(ids.imran,ws,ids.harbor,false);
 await setMemberRoles(ids.imran,ws,ids.ravi,{roles:['staff','technician']});
 const identity=await callTool({user:ids.ravi,ws,kind:'assistant',scope:'read'},'whoami',{});expect((identity.structuredContent as any).result.role).toBe('staff');
 expect((await notices(ids.ravi)).data.some(n=>n.kind==='roles_changed')).toBe(true);
 await setMemberRoles(ids.imran,ws,ids.ravi,{roles:['technician']});
});
it('WhatsApp contact matching reaches suggestions without exposing a phone',async()=>{
 const phone=await withSystem(async db=>(await db.query('SELECT phone FROM clients WHERE id=$1',[ids.harbor])).rows[0].phone);
 const s=await intakeWhatsApp(ids.sam,ws,{from:phone,name:'Pranav',text:'Reception tap leaks',media:[]});
 expect(s.client_id).toBe(ids.harbor);expect(s.source).toBe('whatsapp');expect(s.sender_phone).toBeUndefined();
 expect((await listSuggestions(ids.sam,ws)).data.some(r=>r.id===s.id)).toBe(true);
 expect((await notices(ids.imran)).data.some(n=>n.kind==='suggestion_received'&&n.entity_id===s.id)).toBe(true);
});
it('feedback reaches the inbox payload without sending to the real service',async()=>{
 const {setAuthResolverForTests}=await import('../lib/auth');const {POST}=await import('../app/api/feedback/route');
 setAuthResolverForTests(async()=>ids.pranav);vi.stubEnv('FEEDBACK_SECRET','f'.repeat(40));
 const inbox=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',inbox);
 try{const response=await POST(new Request('http://local/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Please add a visit reminder',page:'/home',device:'Phone'})}));
 expect(response.status).toBe(201);const received=JSON.parse((inbox.mock.calls as any)[0][1].body);expect(received).toMatchObject({app:'Groundwork',message:'Please add a visit reminder',role:'Facility manager'});expect(received.sender).not.toContain(ids.pranav);
 }finally{setAuthResolverForTests();vi.unstubAllGlobals();vi.unstubAllEnvs();}
});
