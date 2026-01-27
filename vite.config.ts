import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      // Proxy API requests to Vercel dev server in local development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Resolve three.js WebGPU issue - use WebGL renderer only
      'three/webgpu': 'three',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Externalize problematic imports
      external: [],
    },
  },
  optimizeDeps: {
    include: ['globe.gl'],
    exclude: [],
  },
});
