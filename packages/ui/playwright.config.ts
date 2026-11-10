import { defineConfig } from '@playwright/test';

/** Component-style specs of the UI against the dev page (dev.html). Own port, own server, no game. */
const PORT = 5188;

export default defineConfig({
  testDir: './pw',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/dev.html`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
