// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**'],
      thresholds: { lines: 90 },
    },
    server: {
      deps: {
        inline: ['next-auth', '@auth/core'],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // next-auth imports `next/server` (bare specifier) which fails ESM
      // resolution in vitest — alias to the stub
      'next/server': path.resolve(
        __dirname,
        './tests/__mocks__/next-server.ts'
      ),
    },
  },
});
