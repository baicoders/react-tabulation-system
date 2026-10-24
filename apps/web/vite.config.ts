import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, /api and /uploads go to the API (API_PORT, default 3000). In production, nginx does the same job.
const apiTarget = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // File events do not cross a Windows bind mount into Docker, so the dev container polls instead.
    watch: process.env.USE_POLLING ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
    },
  },
});
