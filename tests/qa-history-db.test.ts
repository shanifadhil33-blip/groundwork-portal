import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asAgent, closePools, ownerPool, withSystem, withUser } from '../lib/db';
import { ids, seed, siteId } from '../scripts/seed';
import * as orders from '../lib/services/work-orders';
import * as audit from '../lib/services/audit';
import * as notifications from '../lib/services/notifications';
import * as invites from '../lib/services/invites';
import * as supplier from '../lib/services/supplier';
import { signedRequest } from '../lib/cobalt/signature';
import { createToken } from '../lib/services/tokens';
const ws=ids.ridgeline,q=(text='')=>new URLSearchParams(text);
beforeEach(async()=>{const db=await ownerPool.connect();try{await seed(db);}finally{db.release();}});
afterAll(closePools);
it('staff API comments default internal and client users cannot create internal notes',async()=>{
 const order=await orders.createWorkOrder(ids.pranav,ws,{title:'Privacy target',site_id:siteId(1)});
 const note=await asAgent({kind:'assistant'},()=>orders.createComment(ids.sam,ws,order.id,{body:'Technician confirmed'}));expect(note.visibility).toBe('internal');
 expect((await orders.getWorkOrder(ids.pranav,ws,order.id)).comments).toEqual([]);
 expect((await notifications.listNotifications(ids.pranav,ws,q('pageSize=100'))).data.filter(n=>n.entity_id===order.id)).toEqual([]);
 const entry=(await audit.listAudit(ids.imran,ws,q(`entity=comments&entity_id=${note.id}`))).data[0];expect(entry.summary).toBe('Sam created an internal note on Privacy target');expect(entry.actor_kind).toBe('assistant');
 const reply=await orders.createComment(ids.pranav,ws,order.id,{body:'Thanks'});expect(reply.visibility).toBe('client');
 await expect(orders.createComment(ids.pranav,ws,order.id,{body:'Hidden',visibility:'internal'})).rejects.toMatchObject({status:422});
});
it('status notifications exclude the actor, describe from/to, and retain the event title after a rename',async()=>{
 let order=await orders.createWorkOrder(ids.imran,ws,{title:'Original title',site_id:siteId(1),assignee_id:ids.sam});
 order=await orders.patchWorkOrder(ids.imran,ws,order.id,{status:'scheduled',updated_at:order.updated_at.toISOString()});
 const sams=(await notifications.listNotifications(ids.sam,ws,q('pageSize=100'))).data.filter(n=>n.entity_id===order.id);expect(sams).toHaveLength(1);expect(sams[0].message).toBe('Imran moved Original title from Open to Scheduled.');
 expect((await notifications.listNotifications(ids.imran,ws,q('pageSize=100'))).data.filter(n=>n.entity_id===order.id)).toEqual([]);
 order=await orders.patchWorkOrder(ids.sam,ws,order.id,{status:'in_progress',updated_at:order.updated_at.toISOString()});
 const danaBefore=await notifications.unreadCount(ids.imran);order=await orders.patchWorkOrder(ids.imran,ws,order.id,{title:'Renamed title',updated_at:order.updated_at.toISOString()});
 const danas=(await notifications.listNotifications(ids.imran,ws,q('pageSize=100'))).data.filter(n=>n.entity_id===order.id);expect(danas).toHaveLength(1);expect(danas[0].message).toBe('Sam moved Original title from Scheduled to In Progress.');
 await notifications.markNotification(ids.imran,ws,danas[0].id,true);expect((await notifications.unreadCount(ids.imran)).unread_count).toBe(danaBefore.unread_count-1);
 await notifications.markNotification(ids.imran,ws,danas[0].id,false);expect((await notifications.unreadCount(ids.imran)).unread_count).toBe(danaBefore.unread_count);
 const old=(await audit.listAudit(ids.imran,ws,q(`entity=work_orders&action=insert&entity_id=${order.id}`))).data[0];expect(old.summary).toBe('Imran created Original title');expect(old.link_target).toEqual({entity:'work_orders',id:order.id});
 const detail=await orders.getWorkOrder(ids.imran,ws,order.id);expect(detail.timeline.filter((e:{kind:string})=>e.kind==='status_changed').every((e:{work_order_title:string})=>e.work_order_title==='Original title')).toBe(true);
 expect((await audit.listAudit(ids.imran,ws,q('entity=notifications'))).total).toBe(0);
});
it('comment history and agent attribution stay attached to the original title',async()=>{
 const order=await orders.createWorkOrder(ids.imran,ws,{title:'Old name',site_id:siteId(1)}),key=await createToken(ids.sam,ws,{name:'QA read key',scope:'write'});
 const comment=await asAgent({kind:'agent',tokenId:key.id},()=>orders.createComment(ids.sam,ws,order.id,{body:'Private note'}));
 await orders.patchWorkOrder(ids.imran,ws,order.id,{title:'New name',updated_at:order.updated_at.toISOString()});
 const entry=await audit.getAudit(ids.imran,ws,(await audit.listAudit(ids.imran,ws,q(`entity=comments&entity_id=${comment.id}`))).data[0].id);expect(entry.summary).toBe('Sam created an internal note on Old name');expect(entry.via_token_name).toBe('QA read key');
 const stored=(await orders.getWorkOrder(ids.imran,ws,order.id)).comments[0];expect(stored).toMatchObject({work_order_title:'Old name',actor_kind:'agent',via_token_name:'QA read key'});
 expect((await audit.listAudit(ids.imran,ws,q(`entity=api_tokens&action=insert&entity_id=${key.id}`))).data[0].summary).toBe("Sam created agent key 'QA read key'");
});
it('validates invitations without accepting, and hides bogus, wrong-account, revoked and expired tokens',async()=>{
 const invitee=randomUUID();await withSystem(db=>db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[invitee,'Invitee','qa-invite@example.test']));
 const invite=await invites.createInvite(ids.imran,ws,{email:'qa-invite@example.test',role:'staff'});
 expect(await invites.inspectInvite(invitee,invite.token)).toEqual({status:'pending'});expect(await withUser(invitee,async db=>(await db.query('SELECT * FROM members WHERE user_id=$1',[invitee])).rows)).toEqual([]);
 await expect(invites.inspectInvite(invitee,'bogus')).rejects.toThrow();await expect(invites.inspectInvite(ids.sam,invite.token)).rejects.toMatchObject({status:404});
 await invites.revokeInvite(ids.imran,ws,invite.id);await expect(invites.inspectInvite(invitee,invite.token)).rejects.toMatchObject({status:409});
 const expired=await invites.createInvite(ids.imran,ws,{email:'qa-invite@example.test',role:'staff'});await withSystem(db=>db.query("UPDATE invites SET expires_at=now()-interval '1 day' WHERE id=$1",[expired.id]));await expect(invites.inspectInvite(invitee,expired.token)).rejects.toMatchObject({code:'invite_expired'});
});
it('real accounts cannot operate the simulator, including signed webhook delivery',async()=>{
 vi.stubEnv('COBALT_WEBHOOK_SECRET','qa-signing-secret');try{
 await expect(supplier.check(ids.imran,ws)).rejects.toMatchObject({code:'supplier_not_connected'});await expect(supplier.repair(ids.imran,ws,{})).rejects.toMatchObject({code:'supplier_not_connected'});await expect(supplier.placeOrder(ids.imran,ws,{work_order_id:'50000000-0000-4000-8000-000000000003'})).rejects.toMatchObject({code:'supplier_not_connected'});await expect(supplier.setOutage(ids.imran,ws,{outage:true})).rejects.toMatchObject({code:'supplier_not_connected'});
 await expect(supplier.ingestWebhook(signedRequest({workspace_id:ws,cobalt_ref:'COBALT-DEMO-4',event_id:randomUUID(),sequence:7,status:'delivered',occurred_at:new Date().toISOString()}))).rejects.toMatchObject({status:404});
 }finally{vi.unstubAllEnvs();}
});
