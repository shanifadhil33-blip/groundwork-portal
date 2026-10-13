import { defineConfig } from '@playwright/test';
// Live end to end checks of every connection, run against the deployed site with demo logins.
export default defineConfig({
  testDir: './specs', workers: 1, fullyParallel: false, retries: 1, timeout: 90_000,
  reporter: [['list'], ['./report.ts']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'https://groundwork-portal.vercel.app', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure' },
});
