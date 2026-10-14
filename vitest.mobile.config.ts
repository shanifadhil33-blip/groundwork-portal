import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',server:{deps:{inline:['next-auth']}},pool:'forks',maxWorkers:1,fileParallelism:false,include:['tests/mobile-api.test.ts','tests/phone-*.test.tsx','tests/no-ai-look.test.ts','tests/copy-dashes.test.ts','tests/messages-ui.test.tsx','tests/suggestions-ui.test.tsx']}});
