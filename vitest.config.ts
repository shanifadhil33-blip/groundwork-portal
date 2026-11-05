import { defineConfig } from 'vitest/config';
import { Pool } from 'pg';
import { config } from 'dotenv';
// Add real database suites to this inventory; pure and mocked tests stay offline.
import databaseSuites from './tests/database-suites.json' with { type: 'json' };

config({ path: '.env.local', quiet: true });
// Probe both roles before selecting integration suites. Never reset a database
// until setup.ts has checked that the test and development databases differ.
export default defineConfig(async () => {
 let databaseAvailable = !!(process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL_OWNER && process.env.DATABASE_URL_OWNER);
 if (databaseAvailable) {
  const pools = [process.env.TEST_DATABASE_URL, process.env.TEST_DATABASE_URL_OWNER].map(connectionString => new Pool({ connectionString, connectionTimeoutMillis: 2000, query_timeout: 2000 }));
  try { await Promise.all(pools.map(pool => pool.query('SELECT 1'))); }
  catch { databaseAvailable = false; }
  finally { await Promise.all(pools.map(pool => pool.end())); }
 }
 if (!databaseAvailable) console.warn(`No test database available. Skipping ${databaseSuites.length} database suites; running offline and mocked tests.`);
 return { test: {
  environment: 'node', server: { deps: { inline: ['next-auth'] } },
  pool: 'forks', maxWorkers: 1, fileParallelism: false,
  globalSetup: databaseAvailable ? ['./tests/setup.ts'] : [],
  setupFiles: ['./tests/offline.ts', ...(databaseAvailable ? ['./tests/fixtures.ts'] : [])],
  testTimeout: 10000, hookTimeout: 30000, teardownTimeout: 5000,
  exclude: ['**/node_modules/**', 'e2e/**', ...(!databaseAvailable ? databaseSuites : [])],
 } };
});
