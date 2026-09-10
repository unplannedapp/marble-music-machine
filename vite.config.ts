import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// A visible build stamp: commit count and short hash, so a phone can say which build it runs.
const git = (cmd: string): string => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '?';
  }
};
const build = `${git('git rev-list --count HEAD')}-${git('git rev-parse --short HEAD')}`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(build) },
  server: { port: 5173, host: true },
  // Song recordings are inlined as data URIs so the single-file bundle carries them.
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 8_000_000 },
  test: { environment: 'node' },
});
