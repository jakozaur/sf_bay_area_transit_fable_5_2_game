import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Demo page of packages/render. World data comes from the app's public folder, read only. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../../apps/game/public', import.meta.url)),
  server: { port: 5312, strictPort: true },
});
