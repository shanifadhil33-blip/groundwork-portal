import { defineConfig } from 'vitest/config';
// Pure unit checks never connect to, reset, seed or migrate a database.
export default defineConfig({test:{environment:'node',include:['tests/i18n*.test.ts','tests/languages.test.ts','tests/agent-preferences.test.ts','tests/no-ai-look.test.ts','tests/copy-dashes.test.ts','tests/stitch-assistant.test.tsx','tests/assistant-no-dash.test.ts','tests/agent-voice*.test.ts*'],pool:'forks',maxWorkers:1,fileParallelism:false,testTimeout:10000}});
