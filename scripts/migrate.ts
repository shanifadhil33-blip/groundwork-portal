import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { requiredEnv } from '../lib/env';
export const quoteIdentifier = (name: string) => '"' + name.replaceAll('"','""') + '"';
export async function migrate(client: PoolClient) {
  const role = quoteIdentifier(process.env.APP_DB_ROLE || 'portal_app');
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(78201349)");
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[process.env.APP_DB_ROLE || 'portal_app']);
    if (!exists.rowCount) await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
    const attributes = (await client.query('SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication FROM pg_roles WHERE rolname=$1',[process.env.APP_DB_ROLE || 'portal_app'])).rows[0];
    if (Object.values(attributes).some(Boolean)) throw new Error('App role must have no administrative or RLS bypass privileges');
    const memberships = await client.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[process.env.APP_DB_ROLE || 'portal_app']);
    if (memberships.rowCount) throw new Error('App role must not inherit or assume other database roles');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY; ALTER TABLE schema_migrations FORCE ROW LEVEL SECURITY');
    const owner = (await client.query('SELECT current_user AS name')).rows[0].name as string;
    await client.query('DROP POLICY IF EXISTS migration_owner ON schema_migrations');
    await client.query(`CREATE POLICY migration_owner ON schema_migrations TO ${quoteIdentifier(owner)} USING (true) WITH CHECK (true)`);
    for (const name of (await readdir(resolve('db/migrations'))).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
      await client.query(await readFile(resolve('db/migrations',name),'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
    }
    if (owner === (process.env.APP_DB_ROLE || 'portal_app')) throw new Error('App role must not be the migration owner');
    await client.query(`REVOKE CREATE ON SCHEMA public FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON workspaces,members,clients,sites,work_orders,comments,invites,imports,import_rows,supplier_orders,supplier_events TO ${role}`);
    await client.query(`GRANT SELECT ON cobalt_state,cobalt_orders,cobalt_events,supplier_sync_runs,audit_log,work_order_events,notifications TO ${role}`);
    await client.query(`GRANT UPDATE(read_at) ON notifications TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION app_user_id(),my_role(uuid),my_client(uuid),is_member(uuid),is_staff(uuid),my_job(uuid,uuid),my_job_client(uuid,uuid),my_job_site(uuid,uuid) TO ${role}`);
    await client.query(`GRANT SELECT,INSERT ON idempotency_keys TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION remove_member(uuid,uuid),visible_assignee(uuid,uuid),visible_user(uuid),create_workspace(text,text),accept_invite(text),inspect_invite(text),delete_workspace(uuid) TO ${role}`);
    await client.query(`REVOKE ALL ON FUNCTION delete_workspace_data(uuid),delete_demo_workspace(uuid),remove_member_real(uuid,uuid),create_workspace_real(text,text),accept_invite_real(text) FROM ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION require_real_user(),approve_import_batch(uuid,uuid,jsonb),store_import_drafts(uuid,uuid,jsonb) TO ${role}`);
    await client.query(`GRANT SELECT ON ui_translations TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON user_preferences TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,DELETE ON job_photos TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON push_subscriptions TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON company_documents TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON time_off TO ${role}`);
    await client.query(`GRANT SELECT(id,name,email,image),UPDATE(name) ON users TO ${role}`);
    await client.query(`GRANT SELECT,INSERT ON api_tokens TO ${role}`);
    await client.query(`GRANT UPDATE(revoked_at) ON api_tokens TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON assistant_actions TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION verify_api_token(text) TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON job_suggestions,shared_photos TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION my_staff_kind(uuid),my_client_kind(uuid) TO ${role}`);
    await client.query(`GRANT SELECT,INSERT ON conversations,messages TO ${role}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON message_reads,message_translations TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION can_message_person(uuid,uuid),conversation_reader(uuid,uuid),message_people(uuid) TO ${role}`);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}
export async function runOwner(fn: (client: PoolClient)=>Promise<void>) {
  const pool = new Pool({connectionString: requiredEnv('DATABASE_URL_OWNER')});
  const client = await pool.connect();
  try { await fn(client); } finally { client.release(); await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await runOwner(migrate); console.log('Migrations applied.');
}
