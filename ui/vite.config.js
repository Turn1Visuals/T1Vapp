import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Port registry lives in the root .env — manage all ports there.
const ports = {};
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) ports[m[1]] = m[2];
}

const backend = `http://localhost:${ports.OVERLAY_PORT || 8987}`;

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: Number(ports.UI_DEV_PORT) || 8988,
    strictPort: true,
    proxy: {
      '/auth': backend,
      '/f1': backend,
      '/tts': backend,
      '/fonts': backend,
    },
    historyApiFallback: true,
  },
  build: { outDir: 'dist' },
});
