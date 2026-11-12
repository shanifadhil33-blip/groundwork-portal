import { afterAll,beforeEach,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools,ownerPool,withUser,withSystem } from '../lib/db';
import { ids,siteId,orderId,seed } from '../scripts/seed';
import { setAuthResolverForTests } from '../lib/auth';
import * as audit from '../lib/services/audit';
import * as notifications from '../lib/services/notifications';
import * as settings from '../lib/services/settings';
import * as orders from '../lib/services/work-orders';
import * as clients from '../lib/services/clients';
import * as invites from '../lib/services/invites';
import * as members from '../lib/services/members';
import * as imports from '../lib/services/imports';
import * as supplier from '../lib/services/supplier';
import * as preferencesRoute from '../app/api/me/preferences/route';
import * as settingsRoute from '../app/api/workspaces/[ws]/settings/route';
import * as auditRoute from '../app/api/workspaces/[ws]/audit/route';
import * as notificationReadRoute from '../app/api/workspaces/[ws]/notifications/read/route';
const ws=ids.ridgeline,q=(s='')=>new URLSearchParams(s);
let user:string|null=ids.imran;
beforeEach(async()=>{user=ids.imran;setAuthResolverForTests(async()=>user);const db=await ownerPool.connect();try{await seed(db);}finally{db.release();}});
afterAll(async()=>{setAuthResolverForTests();await closePools();});
async function call(handler:any,method='GET',body?:unknown){return handler(new Request('http://localhost/api',{method,...(body===undefined?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({ws})});}
it('audit admin sees all, staff only own, clients and other tenants get 404; RLS independently enforces it',async()=>{
 await orders.createComment(ids.sam,ws,orderId(1),{body:'Staff action',visibility:'internal'});
 const all=await audit.listAudit(ids.imran,ws,q('pageSize=100'));
 expect(all.total).toBe(await withSystem(async db=>(await db.query(`SELECT count(*)::int AS n FROM audit_log a WHERE workspace_id=$1 AND ${audit.auditFeedWhere}`,[ws])).rows[0].n));
 const staff=await audit.listAudit(ids.sam,ws,q());expect(staff.data.length).toBeGreaterThan(0);expect(staff.data.every(r=>r.actor?.id===ids.sam)).toBe(true);
 expect(await withUser(ids.sam,async db=>(await db.query('SELECT * FROM audit_log WHERE actor_id IS DISTINCT FROM $1',[ids.sam])).rows)).toEqual([]);
 expect(await withUser(ids.summitAdmin,async db=>(await db.query('SELECT * FROM audit_log WHERE workspace_id=$1',[ws])).rows)).toEqual([]);
 for(const identity of [ids.pranav,ids.summitAdmin]){user=identity;expect((await call(auditRoute.GET)).status).toBe(404);await expect(audit.getAudit(identity,ws,all.data[0].id)).rejects.toMatchObject({status:404});}
 await expect(audit.getAudit(ids.sam,ws,all.data.find(r=>r.actor?.id===ids.imran)!.id)).rejects.toMatchObject({status:404});
});
it('audit filters, newest/oldest, pages, scoped cursors and validation',async()=>{
 const created=await orders.createWorkOrder(ids.sam,ws,{title:'Filter target',site_id:siteId(1)});
 const filtered=await audit.listAudit(ids.imran,ws,q(`actor=${ids.sam}&action=insert&entity=work_orders&entity_id=${created.id}&from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z`));expect(filtered.total).toBe(1);
 const first=await audit.listAudit(ids.imran,ws,q('pageSize=2'));const second=await audit.listAudit(ids.imran,ws,q(`pageSize=2&cursor=${first.next_cursor}`));expect(second.data).toEqual((await audit.listAudit(ids.imran,ws,q('pageSize=2&page=2'))).data);expect(first.data.map(r=>r.id)).not.toContain(second.data[0].id);
 const oldest=await audit.listAudit(ids.imran,ws,q('sort=oldest&pageSize=100'));expect(oldest.data.map(r=>r.at)).toEqual(oldest.data.map(r=>r.at).sort());
 await expect(audit.listAudit(ids.sam,ws,q(`pageSize=2&cursor=${first.next_cursor}`))).rejects.toMatchObject({status:422});
 for(const query of ['page=0','unknown=true','from=bad','cursor=bad','result=success'])await expect(audit.listAudit(ids.imran,ws,q(query))).rejects.toThrow();
});
it('audit redacts nested secrets from list and detail and summarizes status changes',async()=>{
 const id=randomUUID();await withSystem(db=>db.query('INSERT INTO audit_log(id,workspace_id,actor_id,action,entity,entity_id,"before","after") VALUES($1,$2,NULL,$3,$4,$5,$6,$7)',[id,ws,'update','work_orders',orderId(1),{status:'open',token_hash:'hidden'},{status:'scheduled',nested:{secret:'hidden',api_key:'hidden',safe:true}}]));
 const detail=await audit.getAudit(ids.imran,ws,id);expect(detail.actor).toBeNull();expect(detail.summary).toMatch(/^Groundwork moved .+ from Open to Scheduled$/);expect(JSON.stringify(detail)).not.toContain('hidden');expect(detail.after).toEqual({status:'scheduled',nested:{safe:true}});
 const list=await audit.listAudit(ids.imran,ws,q(`entity_id=${orderId(1)}`));expect(JSON.stringify(list)).not.toContain('hidden');
});
it('app role cannot INSERT, UPDATE or DELETE audit rows',async()=>{
 for(const sql of ["UPDATE audit_log SET action='tampered'","DELETE FROM audit_log","INSERT INTO audit_log(workspace_id,action,entity,entity_id) VALUES($1,'insert','workspaces',$1)"])await expect(withUser(ids.imran,db=>db.query(sql,sql.includes('$1')?[ws]:[]))).rejects.toMatchObject({code:'42501'});
});
it('every previous business write path creates an attributed audit row',async()=>{
 async function check(fn:()=>Promise<any>,entity:string,action:string){const before=await withUser(ids.imran,async db=>(await db.query('SELECT id FROM audit_log')).rows.map(r=>r.id));await fn();const rows=await withUser(ids.imran,async db=>(await db.query('SELECT * FROM audit_log WHERE NOT(id=ANY($1::uuid[]))',[before])).rows);expect(rows).toContainEqual(expect.objectContaining({entity,action,actor_id:ids.imran}));}
 let order:any,client:any,site:any,invite:any;
 await check(async()=>{order=await orders.createWorkOrder(ids.imran,ws,{title:'Audit path',site_id:siteId(1)});},'work_orders','insert');
 await check(()=>orders.patchWorkOrder(ids.imran,ws,order.id,{status:'scheduled',updated_at:order.updated_at.toISOString()}),'work_orders','update');
 await check(()=>orders.createComment(ids.imran,ws,order.id,{body:'Audited',visibility:'client'}),'comments','insert');
 await check(async()=>{client=await clients.createClient(ids.imran,ws,{name:'Audit company'});},'clients','insert');
 await check(()=>clients.patchClient(ids.imran,ws,client.id,{name:'Audit rename'}),'clients','update');
 await check(async()=>{site=await clients.createSite(ids.imran,ws,client.id,{name:'Audit site',address:'Road'});},'sites','insert');
 await check(()=>clients.patchSite(ids.imran,ws,site.id,{name:'New site'}),'sites','update');
 await check(()=>clients.deleteSite(ids.imran,ws,site.id),'sites','delete');await check(()=>clients.deleteClient(ids.imran,ws,client.id),'clients','delete');
 await check(async()=>{invite=await invites.createInvite(ids.imran,ws,{email:'audit@example.test',role:'staff'});},'invites','insert');
 await check(()=>invites.revokeInvite(ids.imran,ws,invite.id),'invites','update');
 await check(()=>members.changeMember(ids.imran,ws,ids.sam,{role:'admin'}),'members','update');
 await check(()=>settings.patchSettings(ids.imran,ws,{timezone:'Europe/London'}),'workspaces','update');
 const imp=await imports.uploadImport(ids.imran,ws,new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"sample":true}'}));await imports.mapImport(ids.imran,ws,imp.id,{mapping:imp.mapping});await imports.queueImport(ids.imran,ws,imp.id);const rows=(await imports.importRows(ids.imran,ws,imp.id,q('status=valid'))).data;
 await check(()=>imports.approveRow(ids.imran,ws,rows[0].id,{}),'import_rows','update');await check(()=>imports.rejectRow(ids.imran,ws,rows[1].id,{reason:'Not needed'}),'import_rows','update');await check(()=>imports.undoRow(ids.imran,ws,rows[1].id),'import_rows','update');
 await expect(supplier.repair(ids.imran,ws,{})).rejects.toMatchObject({status:409,code:'supplier_not_connected'});
});
it('notifications list/count/read/unread/read-all are current-user only and idempotent',async()=>{
 const order=await orders.createWorkOrder(ids.imran,ws,{title:'Notify',site_id:siteId(1),assignee_id:ids.sam});await orders.patchWorkOrder(ids.imran,ws,order.id,{status:'scheduled',updated_at:order.updated_at.toISOString()});
 const list=await notifications.listNotifications(ids.sam,ws,q('unread=true&pageSize=1'));expect(list.total).toBeGreaterThan(0);expect(list.data[0].link_target).toEqual({entity:'work_orders',id:order.id});expect(list.unread_count).toBe((await notifications.unreadCount(ids.sam)).unread_count);
 const id=list.data[0].id;await notifications.markNotification(ids.sam,ws,id,true);const read=await notifications.markNotification(ids.sam,ws,id,true);expect(read.read_at).toBeTruthy();await notifications.markNotification(ids.sam,ws,id,false);
 expect((await notifications.readAll(ids.sam,ws)).changed).toBe(list.unread_count);expect((await notifications.readAll(ids.sam,ws)).changed).toBe(0);expect((await notifications.unreadCount(ids.sam)).unread_count).toBe(0);
 await expect(notifications.markNotification(ids.imran,ws,id,true)).rejects.toMatchObject({status:404});await expect(notifications.markNotification(ids.summitAdmin,ids.summit,id,true)).rejects.toMatchObject({status:404});
 expect(await withUser(ids.imran,async db=>(await db.query('SELECT id FROM notifications WHERE id=$1',[id])).rows)).toEqual([]);
});
it('notification links disappear when entity access is lost; pagination and counts span memberships',async()=>{
 await withSystem(async db=>{await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ids.summit,ids.sam]);await db.query("INSERT INTO notifications(user_id,workspace_id,kind,entity_id) VALUES($1,$2,'status_changed',$3),($1,$2,'status_changed',$3),($1,$4,'status_changed',$5)",[ids.sam,ws,orderId(1),ids.summit,orderId(61)]);});
 const count=await notifications.unreadCount(ids.sam);expect(count.workspaces).toHaveLength(2);
 const a=await notifications.listNotifications(ids.sam,ws,q('pageSize=1'));expect(a.total).toBeGreaterThan(1);expect((await notifications.listNotifications(ids.sam,ws,q(`pageSize=1&cursor=${a.next_cursor}`))).data[0].id).not.toBe(a.data[0].id);
 await withSystem(db=>db.query("UPDATE members SET role='client',client_id=$1 WHERE workspace_id=$2 AND user_id=$3",[ids.northgate,ws,ids.sam]));const hidden=await notifications.listNotifications(ids.sam,ws,q('pageSize=100'));expect(hidden.data.filter(r=>r.entity_id===orderId(1)).every(r=>r.link_target===null)).toBe(true);
});
it('preferences default system, persist dark, isolate users, validate unknown fields and timezone',async()=>{
 expect((await settings.getPreferences(ids.pranav)).theme).toBe('system');user=ids.pranav;expect((await call(preferencesRoute.PATCH,'PATCH',{theme:'dark',email_notifications:false,timezone:'Europe/London'})).status).toBe(200);expect((await settings.getPreferences(ids.pranav)).theme).toBe('dark');expect((await settings.getPreferences(ids.imran)).theme).toBe('system');
 for(const body of [{theme:'purple'},{unknown:true},{timezone:'Mars/City'},{}])expect((await call(preferencesRoute.PATCH,'PATCH',body)).status).toBe(422);
 expect(await withUser(ids.imran,async db=>(await db.query('SELECT * FROM user_preferences WHERE user_id=$1',[ids.pranav])).rows)).toEqual([]);user=null;expect((await call(preferencesRoute.GET)).status).toBe(401);
});
it('workspace settings admin update audited, all members read, staff/client 403, invalid name/timezone 422',async()=>{
 for(const identity of [ids.imran,ids.sam,ids.pranav])expect((await settings.getSettings(identity,ws)).timezone).toBe('Asia/Dubai');
 const result=await call(settingsRoute.PATCH,'PATCH',{name:'  Updated workspace  ',timezone:'America/New_York'});expect(result.status).toBe(200);expect((await result.json()).name).toBe('Updated workspace');expect((await audit.listAudit(ids.imran,ws,q('entity=workspaces&action=update'))).total).toBe(1);
 for(const identity of [ids.sam,ids.pranav]){user=identity;expect((await call(settingsRoute.PATCH,'PATCH',{name:'Denied'})).status).toBe(403);}
 user=ids.imran;for(const body of [{timezone:'Invalid/Zone'},{name:' '},{name:'x'.repeat(81)},{other:true}])expect((await call(settingsRoute.PATCH,'PATCH',body)).status).toBe(422);
});
it('profile only changes own name and rejects extra fields',async()=>{expect((await settings.patchProfile(ids.pranav,{name:' Pranav Updated '})).name).toBe('Pranav Updated');await expect(settings.patchProfile(ids.pranav,{name:'Name',email:'no'})).rejects.toThrow();});
it('notification read events stay in audit storage but do not appear in the feed',async()=>{
 const notification=await withUser(ids.pranav,async db=>(await db.query('SELECT id FROM notifications WHERE workspace_id=$1 LIMIT 1',[ws])).rows[0]);
 await notifications.markNotification(ids.pranav,ws,notification.id,true);
 expect(await withSystem(async db=>(await db.query("SELECT id FROM audit_log WHERE entity='notifications' AND action='update' AND entity_id=$1",[notification.id])).rows.length)).toBeGreaterThanOrEqual(1);
 expect((await audit.listAudit(ids.imran,ws,q(`entity=notifications&action=update&entity_id=${notification.id}`))).total).toBe(0);
});

it('batch notification read endpoint updates only caller ids in this workspace and validates the cap',async()=>{
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ids.summit,ids.imran]));
 const own=[randomUUID(),randomUUID()],foreign=randomUUID(),otherWorkspace=randomUUID(),untouched=randomUUID();
 await withSystem(db=>db.query("INSERT INTO notifications(id,user_id,workspace_id,kind,entity_id) VALUES($1,$6,$8,'status_changed',$10),($2,$6,$8,'status_changed',$10),($3,$7,$8,'status_changed',$10),($4,$6,$9,'status_changed',$11),($5,$6,$8,'status_changed',$10)",[...own,foreign,otherWorkspace,untouched,ids.imran,ids.sam,ws,ids.summit,orderId(1),orderId(61)]));
 const idsToRead=[...own,foreign,otherWorkspace,randomUUID(),own[0]];
 const response=await call(notificationReadRoute.POST,'POST',{ids:idsToRead});
 expect(response.status).toBe(200);expect(await response.json()).toEqual({changed:2});
 const rows=await withSystem(async db=>(await db.query('SELECT id,read_at FROM notifications WHERE id=ANY($1::uuid[])',[[...own,foreign,otherWorkspace,untouched]])).rows);
 for(const row of rows)expect(!!row.read_at).toBe(own.includes(row.id));
 expect(await (await call(notificationReadRoute.POST,'POST',{ids:idsToRead})).json()).toEqual({changed:0});
 for(const body of [{ids:[]},{ids:[untouched,...Array.from({length:100},()=>randomUUID())]},{ids:[untouched,'invalid']},{ids:[untouched],extra:true}])expect((await call(notificationReadRoute.POST,'POST',body)).status).toBe(422);
 expect(await withSystem(async db=>(await db.query('SELECT read_at FROM notifications WHERE id=$1',[untouched])).rows[0].read_at)).toBeNull();
 user=null;expect((await call(notificationReadRoute.POST,'POST',{ids:own})).status).toBe(401);
});
