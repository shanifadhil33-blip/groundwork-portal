import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', server: { deps: { inline: ['next-auth'] } }, pool: 'forks', maxWorkers: 1, fileParallelism: false, globalSetup: ['./tests/setup.ts'], setupFiles: ['./tests/fixtures.ts'], testTimeout: 10000 } });
