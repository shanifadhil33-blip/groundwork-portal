import { afterAll, describe, expect, it } from 'vitest';
import { appPool, ownerPool, withUser, closePools } from '../lib/db';
import { ids, orderId, siteId } from '../scripts/seed';
afterAll(closePools);
const rows = (user: string, sql: string, values: unknown[] = []) => withUser(user, async c => (await c.query(sql,values)).rows);
describe('Postgres tenant isolation',()=>{
 it('Pranav sees only Harbor & Pine orders and zero Northgate rows',async()=>{
  const orders=await rows(ids.pranav,'SELECT client_id FROM work_orders');
  expect(orders).toHaveLength(36);
  expect(orders.every(o=>o.client_id===ids.harbor)).toBe(true);
  expect(await rows(ids.pranav,'SELECT id FROM work_orders WHERE client_id=$1',[ids.northgate])).toHaveLength(0);
 });
 it('clients never see internal comments',async()=>{
  expect(await rows(ids.pranav,"SELECT id FROM comments WHERE visibility='internal'")).toHaveLength(0);
  expect((await rows(ids.pranav,"SELECT id FROM comments WHERE visibility='client'")).length).toBeGreaterThan(0);
 });
 it('Omar cannot insert an order for Harbor & Pine',async()=>{
  await expect(withUser(ids.omar,c=>c.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,source,created_by) VALUES($1,$2,$3,'Wrong tenant','client',$4)",[ids.ridgeline,ids.harbor,siteId(1),ids.omar]))).rejects.toMatchObject({code:'42501'});
 });
 it('composite site FK rejects a mismatched client even for staff',async()=>{
  await expect(withUser(ids.sam,c=>c.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,created_by) VALUES($1,$2,$3,'Wrong site',$4)",[ids.ridgeline,ids.northgate,siteId(1),ids.sam]))).rejects.toMatchObject({code:'23503'});
 });
 it('Sam sees no Summit rows, while Summit really has orders',async()=>{
  expect(await rows(ids.sam,'SELECT id FROM work_orders WHERE workspace_id=$1',[ids.summit])).toHaveLength(0);
  expect(await rows(ids.sam,'SELECT id FROM workspaces WHERE id=$1',[ids.summit])).toHaveLength(0);
  expect(await rows(ids.summitAdmin,'SELECT id FROM work_orders')).toHaveLength(6);
 });
 it.each(['UPDATE audit_log SET action=\'tampered\'','DELETE FROM audit_log','INSERT INTO audit_log(workspace_id,action,entity,entity_id) VALUES(gen_random_uuid(),\'fake\',\'work_orders\',gen_random_uuid())','TRUNCATE audit_log'])('app role cannot mutate audit: %s',async sql=>{
  await expect(withUser(ids.imran,c=>c.query(sql))).rejects.toMatchObject({code:'42501'});
 });
 it('queries without user context return zero rows, including after pool reuse',async()=>{
  await rows(ids.pranav,'SELECT id FROM work_orders');
  expect((await appPool.query('SELECT id FROM work_orders')).rows).toHaveLength(0);
  expect((await appPool.query('SELECT id FROM members')).rows).toHaveLength(0);
 });
 it('app role is neither owner nor a role that bypasses RLS',async()=>{
  const role=await appPool.query('SELECT current_user AS name,rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user');
  expect(role.rows[0]).toMatchObject({name:process.env.APP_DB_ROLE||'portal_app',rolsuper:false,rolbypassrls:false});
  const owned=await appPool.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)");
  expect(owned.rows).toHaveLength(0);
  expect((await appPool.query("SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create")).rows[0].can_create).toBe(false);
  expect((await appPool.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows).toHaveLength(0);
  const security=await appPool.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' AND (NOT relrowsecurity OR NOT relforcerowsecurity)");
  expect(security.rows).toHaveLength(0);
 });
 it('client may create own request and visible comment but cannot update orders',async()=>{
  const created=await withUser(ids.pranav,async c=>{
   const result=await c.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,source,created_by) VALUES($1,$2,$3,'Replace reception bulb','client',$4) RETURNING id",[ids.ridgeline,ids.harbor,siteId(1),ids.pranav]);
   await c.query("INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id) VALUES($1,$2,$3,'Reception opens at nine','client',$4)",[ids.ridgeline,ids.harbor,result.rows[0].id,ids.pranav]);
   return result.rows[0].id;
  });
  expect(await rows(ids.pranav,"UPDATE work_orders SET status='done' WHERE id=$1 RETURNING id",[created])).toHaveLength(0);
  await expect(withUser(ids.pranav,c=>c.query("INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id) VALUES($1,$2,$3,'Secret','internal',$4)",[ids.ridgeline,ids.harbor,created,ids.pranav]))).rejects.toMatchObject({code:'42501'});
 });
 it('staff cannot manage clients or supplier state; admins can',async()=>{
  await expect(withUser(ids.sam,c=>c.query('INSERT INTO clients(workspace_id,name) VALUES($1,$2)',[ids.ridgeline,'Unauthorized']))).rejects.toMatchObject({code:'42501'});
  expect(await rows(ids.sam,"UPDATE supplier_orders SET local_status='delivered' RETURNING id")).toHaveLength(0);
  expect(await rows(ids.imran,'SELECT id FROM clients')).toHaveLength(3);
 });
 it('audit records before/after and actor; staff see only own actions',async()=>{
  await rows(ids.sam,"UPDATE work_orders SET priority='urgent' WHERE id=$1 RETURNING id",[orderId(1)]);
  const audit=await rows(ids.sam,"SELECT * FROM audit_log WHERE entity_id=$1 AND action='update'",[orderId(1)]);
  expect(audit).toHaveLength(1);
  expect(audit[0].actor_id).toBe(ids.sam);
  expect(audit[0].before.priority).toBe('low');
  expect(audit[0].after.priority).toBe('urgent');
  expect((await rows(ids.sam,'SELECT actor_id FROM audit_log')).every(a=>a.actor_id===ids.sam)).toBe(true);
  expect(await rows(ids.pranav,'SELECT id FROM audit_log')).toHaveLength(0);
 });
 it('notifications belong only to their recipient',async()=>{
  expect(await rows(ids.pranav,'SELECT id FROM notifications')).toHaveLength(1);
  expect(await rows(ids.imran,'SELECT id FROM notifications')).toHaveLength(0);
  expect(await rows(ids.pranav,'UPDATE notifications SET read_at=now() RETURNING id')).toHaveLength(1);
  await expect(withUser(ids.pranav,c=>c.query('UPDATE notifications SET user_id=$1',[ids.omar]))).rejects.toMatchObject({code:'42501'});
 });
 it('auth tables are owner-only',async()=>{
  await expect(appPool.query('SELECT * FROM accounts')).rejects.toMatchObject({code:'42501'});
  expect((await ownerPool.query('SELECT id FROM users')).rowCount).toBe(6);
 });
});
