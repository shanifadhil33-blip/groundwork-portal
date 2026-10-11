import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient } from 'pg';
import { requiredEnv } from './env';
// Postgres date values are calendar dates, not midnight instants.
types.setTypeParser(1082, value => value);
const testing = process.env.NODE_ENV === 'test';
export const appPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL' : 'DATABASE_URL'), max: 10 });
// Owner access is reserved for auth, migrations/seed, signed Cobalt ingest, authorized simulator/sync operations, and cron.
export const ownerPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL_OWNER' : 'DATABASE_URL_OWNER'), max: 5 });
type Attribution = {kind:'agent'|'assistant'; tokenId?:string};
const attribution = new AsyncLocalStorage<Attribution>();
const active = new AsyncLocalStorage<{user:string;db:PoolClient}>();
export function asAgent<T>(context:Attribution,fn:()=>Promise<T>) { return attribution.run(context,fn); }
async function transaction<T>(pool: Pool, userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? '']);
    const actor=attribution.getStore();
    await client.query("SELECT set_config('app.actor_kind',$1,true),set_config('app.via_token',$2,true)",[actor?.kind??'user',actor?.tokenId??'']);
    const result = userId ? await active.run({user:userId,db:client},()=>fn(client)) : await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Invalid user identifier');
  const nested=active.getStore();
  if(nested?.user===userId)return fn(nested.db);
  return transaction(appPool, userId, fn);
}
export function withSystem<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> { return transaction(ownerPool, null, fn); }
export async function closePools() { await Promise.all([appPool.end(), ownerPool.end()]); }
