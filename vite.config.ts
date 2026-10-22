/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel has an explicit rewrite; local Vite needs the directory slash
// before its SPA fallback can select the Classic HTML document.
const classicDirectoryRedirect: Connect.NextHandleFunction = (req, res, next) => {
  const url = req.url || '';
  if (/^\/classic(?:\?|$)/.test(url)) {
    res.writeHead(302, { Location: `/classic/${url.slice('/classic'.length)}` });
    res.end();
    return;
  }
  next();
};

export default defineConfig(({ mode }) => {
  const apiOrigin = loadEnv(mode, process.cwd(), 'CHRONOS_DEV_API_ORIGIN').CHRONOS_DEV_API_ORIGIN;
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: apiOrigin ? {
        '/api': {
          target: apiOrigin,
          changeOrigin: true,
        },
      } : undefined,
    },
    plugins: [react(), {
      name: 'chronos-classic-directory',
      configureServer(server) {
        server.middlewares.use(classicDirectoryRedirect);
      },
      configurePreviewServer(server) {
        server.middlewares.use(classicDirectoryRedirect);
      },
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          modern: path.resolve(__dirname, 'index.html'),
          classic: path.resolve(__dirname, 'classic/index.html'),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [],
      coverage: {
        provider: 'v8',
        include: ['lib/**/*.ts', 'utils.ts', 'services/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.d.ts', 'services/apiService.ts'],
        reporter: ['text', 'text-summary', 'json-summary'],
        reportsDirectory: './coverage',
      },
    },
  };
});
