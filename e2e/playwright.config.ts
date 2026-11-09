import { defineConfig } from '@playwright/test';

/** Dedicated port so e2e never collides with a developer's `pnpm dev` on 5173. */
const PORT = 5199;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @bayvox/game exec vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  // Doc 10 section 8.3. Both use the bundled chromium headless shell.
  projects: [
    {
      // Hardware GPU through ANGLE Metal. Default for local runs on macOS.
      name: 'gpu',
      use: {
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--use-angle=metal', '--enable-gpu'] },
      },
    },
    {
      // Default headless shell: SwiftShader software GL. Tiny viewport, minimal scenes. Runs on GPU-less CI.
      name: 'swgl',
      use: { viewport: { width: 320, height: 240 } },
    },
  ],
});
