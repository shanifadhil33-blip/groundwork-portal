import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', pool: 'forks', maxWorkers: 1, fileParallelism: false, globalSetup: ['./tests/setup.ts'], testTimeout: 10000 } });
