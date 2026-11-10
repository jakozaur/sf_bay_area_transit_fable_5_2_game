import { defineConfig } from 'vite';

/** Dev page of the UI package (dev.html): every screen from fixtures, no game. Port 5187 so it never meets `pnpm dev`. */
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5187, strictPort: true, open: false },
});
