import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['e2e/**', 'node_modules/**'],
    env: {
      FALKORDB_HOST: 'localhost',
      FALKORDB_PORT: '6379',
      FALKORDB_GRAPH: 'debrief',
      BRIGHTDATA_MOCK: 'true',
    },
  },
});
