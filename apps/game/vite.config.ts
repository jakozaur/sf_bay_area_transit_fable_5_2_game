import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host path.
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2023', sourcemap: true },
  worker: { format: 'es' },
});
