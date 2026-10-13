import { defineConfig } from 'vitest/config';
// Pure logic and mocked services do not need the Postgres integration fixtures.
export default defineConfig({ test: { environment: 'node', include: ['tests/i18n*.test.ts', 'tests/languages.test.ts'] } });
