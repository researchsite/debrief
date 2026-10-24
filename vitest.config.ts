import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    fileParallelism: false,
    env: {
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: '6379',
      FALKORDB_GRAPH: 'debrief',
      BRIGHTDATA_MOCK: 'true',
    },
  },
});
