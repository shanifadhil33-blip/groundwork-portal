import { defineConfig } from 'vitest/config';

// Localization unit/render tests need no database fixture, migration or network.
// The default suite's global setup recreates the test schema, so keep it separate.
export default defineConfig({ test: {
  environment: 'node', pool: 'forks', maxWorkers: 1, fileParallelism: false, testTimeout: 10000,
  include: [
    'tests/i18n*.test.ts', 'tests/language-files.test.ts', 'tests/rehearsal-language-files.test.ts',
    'tests/screens-i18n.test.tsx', 'tests/server-language*.test.ts*', 'tests/demo-job-i18n.test.ts',
    'tests/trade-words.test.ts', 'tests/quotes-i18n.test.ts', 'tests/languages.test.ts', 'tests/language-options.test.ts',
    'tests/agent-choices.test.ts', 'tests/notification-templates.test.tsx', 'tests/not-found-body.test.tsx',
    'tests/data-protection-ui.test.tsx', 'tests/stitch-assistant.test.tsx',
  ],
} });
