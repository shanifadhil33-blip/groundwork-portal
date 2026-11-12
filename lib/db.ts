import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, types, type PoolClient } from 'pg';
import { requiredEnv } from './env';
// Postgres date values are calendar dates, not midnight instants.
types.setTypeParser(1082, value => value);
const testing = process.env.NODE_ENV === 'test';
// Time limits (bug 92). A query stops at 8 s and an idle transaction at 10 s (set per transaction below,
// which works through Neon's pooler); the driver gives up at 10 s; the browser waits 20 s for a read.
export const STATEMENT_TIMEOUT_MS = 8_000, IDLE_TRANSACTION_MS = 10_000, SLOW_QUERY_MS = 500;
const poolSettings = { max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000, keepAlive: true, query_timeout: 10_000 };
// Runtime uses DATABASE_URL (Neon's pooled -pooler host); owner access stays separate.
export const appPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL' : 'DATABASE_URL'), ...poolSettings });
// Owner access is reserved for auth, migrations/seed, signed Cobalt ingest, authorized simulator/sync operations, and cron.
export const ownerPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL_OWNER' : 'DATABASE_URL_OWNER'), ...poolSettings });
type Attribution = {kind:'agent'|'assistant'; tokenId?:string};
const attribution = new AsyncLocalStorage<Attribution>();
const active = new AsyncLocalStorage<{user:string;db:PoolClient}>();
export function asAgent<T>(context:Attribution,fn:()=>Promise<T>) { return attribution.run(context,fn); }
const routeName = new AsyncLocalStorage<string>();
/** Names the API route for the slow query log. Ids are replaced so the same route groups together. */
export function inRoute<T>(path: string, fn: () => Promise<T>) { return routeName.run(path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id'), fn); }
/** Logs any query over 500 ms with the route that ran it. Only the first line of the SQL is logged, never the values. */
function timeQueries(client: PoolClient) {
  const original = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
  (client as unknown as { query: unknown }).query = async (...args: unknown[]) => {
    const started = performance.now();
    try { return await original(...args); }
    finally {
      const ms = performance.now() - started;
      if (ms > SLOW_QUERY_MS && !testing) {
        const sql = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
        console.warn(`[slow query] ${Math.round(ms)} ms ${routeName.getStore() ?? 'page'}: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
  };
  return () => { delete (client as unknown as { query?: unknown }).query; };
}
async function transaction<T>(pool: Pool, userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const untime = timeQueries(client);
  try {
    await client.query('BEGIN');
    const actor=attribution.getStore();
    // Owner work (migrations, seed, cron cleanup) can run longer, so only app requests get the limit.
    // JIT is off for app requests: compiling a plan costs far more than running these small queries.
    await client.query(`SELECT set_config('app.user_id',$1,true),set_config('app.actor_kind',$2,true),set_config('app.via_token',$3,true)${pool===appPool?`,set_config('statement_timeout','${STATEMENT_TIMEOUT_MS}',true),set_config('idle_in_transaction_session_timeout','${IDLE_TRANSACTION_MS}',true),set_config('jit','off',true)`:''}`,[userId??'',actor?.kind??'user',actor?.tokenId??'']);
    const result = userId && pool===appPool ? await active.run({user:userId,db:client},()=>fn(client)) : await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { untime(); client.release(); }
}
export function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Invalid user identifier');
  const nested=active.getStore();
  if(nested?.user===userId)return fn(nested.db);
  return transaction(appPool, userId, fn);
}
export function withSystem<T>(fn: (client: PoolClient) => Promise<T>, actorId: string | null = null): Promise<T> {
  // An attributed owner operation must never become a nested withUser context.
  return transaction(ownerPool, actorId, fn);
}
export async function closePools() { await Promise.all([appPool.end(), ownerPool.end()]); }
