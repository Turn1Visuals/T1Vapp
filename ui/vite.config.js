import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/auth': 'http://localhost:47200',
      '/f1': 'http://localhost:47200',
      '/tts': 'http://localhost:47200',
    },
    historyApiFallback: true,
  },
  build: { outDir: 'dist' },
});
