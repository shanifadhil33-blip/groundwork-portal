import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/batch-five-ui.test.ts','tests/ai-schema.test.ts'],globalSetup:[],setupFiles:[]}});
