import { defineConfig } from 'vitest/config';
// Needs the Functions, Database and Auth emulators: run with `npm run test:functions`.
export default defineConfig({ test: { include: ['tests/e2e/**/*.e2e.ts'], environment: 'node', testTimeout: 30000, fileParallelism: false } });
