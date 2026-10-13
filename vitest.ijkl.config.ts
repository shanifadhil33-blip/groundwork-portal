import { defineConfig } from 'vitest/config';
// Temporary PostgreSQL through stdin checks service behavior. Use vitest.config.ts for RLS enforcement.
export default defineConfig({test:{environment:'node',server:{deps:{inline:['next-auth']}},pool:'forks',maxWorkers:1,fileParallelism:false,globalSetup:['./tests/support/single-postgres-setup.ts'],setupFiles:['./tests/support/single-postgres-mock.ts','./tests/fixtures.ts'],testTimeout:30000,include:['tests/ijkl-service.test.ts']}});
