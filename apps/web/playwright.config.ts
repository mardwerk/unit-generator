import { defineConfig } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 12_000 },
  use: { baseURL },
  webServer: {
    command: 'pnpm --dir ../.. build:packages && pnpm build && node tests/serve.mjs',
    env: { PLAYWRIGHT_PORT: port },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1_000 }
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
