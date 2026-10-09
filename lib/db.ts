import { Pool, type PoolClient } from 'pg';
import { requiredEnv } from './env';
const testing = process.env.NODE_ENV === 'test';
export const appPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL' : 'DATABASE_URL'), max: 10 });
// Owner access is reserved for auth, migrations/seed, and future documented system jobs.
export const ownerPool = new Pool({ connectionString: requiredEnv(testing ? 'TEST_DATABASE_URL_OWNER' : 'DATABASE_URL_OWNER'), max: 5 });
async function transaction<T>(pool: Pool, userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error('Invalid user identifier');
  return transaction(appPool, userId, fn);
}
export function withSystem<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> { return transaction(ownerPool, null, fn); }
export async function closePools() { await Promise.all([appPool.end(), ownerPool.end()]); }
