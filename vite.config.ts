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
      // Stub out three/webgpu - we only use WebGL renderer
      'three/webgpu': path.resolve(__dirname, 'src/stubs/three-webgpu.js'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress three/webgpu warnings
        if (warning.message?.includes('three/webgpu')) return;
        warn(warning);
      },
    },
  },
});
