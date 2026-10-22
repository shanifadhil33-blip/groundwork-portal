import { defineConfig } from 'vitest/config';
// Mocked services and AI only. No database reset, migration, seed or live AI calls.
export default defineConfig({ test: {
  environment: 'node', server: { deps: { inline: ['next-auth'] } }, pool: 'forks', maxWorkers: 1, fileParallelism: false,
  include: ['tests/agent-off-days.test.ts', 'tests/language-files.test.ts', 'tests/languages.test.ts', 'tests/i18n-word-hyphens.test.ts', 'tests/rehearsal-language-files.test.ts'],
} });
