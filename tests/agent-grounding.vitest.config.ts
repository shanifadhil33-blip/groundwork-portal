import { defineConfig } from 'vitest/config';
// AGENT21 uses mocked AI and services. Run without the normal database reset,
// migration or seed hooks: npx vitest run --config tests/agent-grounding.vitest.config.ts
export default defineConfig({test:{
 environment:'node',server:{deps:{inline:['next-auth']}},pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:10000,
 include:[
  'tests/agent-reply-grounding.test.ts','tests/qa-assistant.test.ts',
  'tests/agent-job-labels.test.ts','tests/agent-reply-guards.test.ts','tests/agent-choices.test.ts',
  'tests/language-files.test.ts','tests/languages.test.ts','tests/i18n-word-hyphens.test.ts','tests/assistant-no-dash.test.ts',
 ],
}});
