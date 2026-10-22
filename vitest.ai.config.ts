import { defineConfig } from 'vitest/config';
// Provider and language checks need neither a database reset nor migrations.
export default defineConfig({ test: {
 environment: 'node', server: { deps: { inline: ['next-auth'] } },
 pool: 'forks', maxWorkers: 1, fileParallelism: false,
 include: ['tests/ai-providers.test.ts','tests/ai-schema.test.ts','tests/ai-spread.test.ts','tests/assistant-fallback-language.test.ts','tests/ai-thinking.test.ts','tests/assistant-provider-failure.test.ts','tests/ai-health-script.test.ts','tests/demo-agent-limit-unit.test.ts','tests/language-files.test.ts','tests/i18n-word-hyphens.test.ts','tests/rehearsal-language-files.test.ts'],
} });
