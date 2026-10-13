import { defineConfig } from 'vitest/config';
// Pure and mocked tests only. Database suites use vitest.config.ts and its isolated fixture reset.
export default defineConfig({test:{environment:'node',pool:'forks',maxWorkers:1,fileParallelism:false,include:['tests/suggestions-unit.test.ts','tests/whatsapp-unit.test.ts','tests/messaging-unit.test.ts','tests/team-space-unit.test.ts','tests/personal-agent-unit.test.ts','tests/agent-voice-composer.test.tsx','tests/assistant-replies.test.ts','tests/copy-dashes.test.ts','tests/no-ai-look.test.ts']}});
