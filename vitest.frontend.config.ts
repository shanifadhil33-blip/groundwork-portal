import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/auth-route.test.ts','tests/request-errors.test.ts','tests/auth-safety.test.ts','tests/error-pages.test.tsx','tests/batch-five-ui.test.ts','tests/ai-schema.test.ts','tests/polish-ui.test.ts','tests/assistant-markdown.test.tsx'],globalSetup:[],setupFiles:[]}});
