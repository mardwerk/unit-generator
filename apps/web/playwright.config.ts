import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const port = process.env.PLAYWRIGHT_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 12_000 },
  use: { baseURL },
  webServer: {
    command: `pnpm --dir ../.. build:packages && pnpm build && HOST=127.0.0.1 PORT=${port} ORIGIN=${baseURL} UNIT_PROVIDER=fixture BODY_SIZE_LIMIT=4194304 node build/index.js`,
    env: {
      UNIT_COMMAND_EXECUTABLE: process.execPath,
      UNIT_COMMAND_ARGS: JSON.stringify([
        fileURLToPath(new URL('./tests/slow-model.mjs', import.meta.url))
      ])
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1_000 }
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
