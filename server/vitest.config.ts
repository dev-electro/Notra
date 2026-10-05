import { defineConfig } from 'vitest/config';

// Each test boots an in-process Postgres (pglite) and applies the real migrations: allow a generous timeout.
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000, include: ['test/**/*.test.ts'] } });
