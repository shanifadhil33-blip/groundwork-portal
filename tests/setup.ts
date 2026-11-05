import { Pool } from 'pg';
import { requiredEnv } from '../lib/env';
import { migrate, quoteIdentifier } from '../scripts/migrate';
import { seed } from '../scripts/seed';
export default async function setup() {
 const testUrl = new URL(requiredEnv('TEST_DATABASE_URL_OWNER'));
 const devUrl = new URL(requiredEnv('DATABASE_URL_OWNER'));
 if(testUrl.hostname===devUrl.hostname && testUrl.port===devUrl.port && testUrl.pathname===devUrl.pathname) throw new Error('TEST database must be separate from development');
 const pool=new Pool({connectionTimeoutMillis: 2000, query_timeout: 10000, statement_timeout: 10000, connectionString:testUrl.toString()});
 let client;
 try {
  client=await pool.connect();
  const db=await client.query('SELECT current_database() AS name, current_user AS owner');
  await client.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION ${quoteIdentifier(db.rows[0].owner)}`);
  await migrate(client);
  await seed(client);
 } finally { client?.release(); await pool.end(); }
}
