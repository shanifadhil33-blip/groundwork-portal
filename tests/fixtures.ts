import { beforeAll } from 'vitest';
import { Pool } from 'pg';
import { requiredEnv } from '../lib/env';
import { seed } from '../scripts/seed';
// Each serial test file starts with identical fixtures, independently of file order.
beforeAll(async()=>{
 const pool=new Pool({connectionString:requiredEnv('TEST_DATABASE_URL_OWNER')});
 const client=await pool.connect();
 try { await seed(client); } finally { client.release();await pool.end(); }
});
