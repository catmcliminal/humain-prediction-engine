import { defineConfig } from 'vitest/config';
// Security-rules tests need the Realtime Database emulator: run with `npm run test:rules`.
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts', 'tests/functions/**/*.test.ts'], environment: 'node', testTimeout: 20000, fileParallelism: false },
});
