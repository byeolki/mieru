import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
      {
        extends: './apps/web/vite.config.ts',
        test: {
          name: 'unit-web',
          root: './apps/web',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/server/**/*.int.test.ts'],
          environment: 'node',
          globalSetup: ['apps/server/test/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
