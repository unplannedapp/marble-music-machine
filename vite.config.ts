import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, host: true },
  // Song recordings are inlined as data URIs so the single-file bundle carries them.
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 8_000_000 },
  test: { environment: 'node' },
});
