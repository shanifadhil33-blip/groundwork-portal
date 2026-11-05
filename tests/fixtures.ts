import databaseSuites from './database-suites.json' with { type: 'json' };
import { beforeAll, expect } from 'vitest';
import { Pool } from 'pg';
import { requiredEnv } from '../lib/env';
import { seed } from '../scripts/seed';
// Each serial test file starts with identical fixtures, independently of file order.
beforeAll(async()=>{
 if (!databaseSuites.some(file => expect.getState().testPath?.endsWith('/'+file))) return;
 const pool=new Pool({connectionTimeoutMillis: 2000, query_timeout: 10000, statement_timeout: 10000, connectionString:requiredEnv('TEST_DATABASE_URL_OWNER')});
 let client;
 try {
  client=await pool.connect(); await seed(client); } finally { client?.release();await pool.end(); }
});
