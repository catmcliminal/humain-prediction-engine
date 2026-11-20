import { defineConfig } from 'vitest/config';

// Everything is served under /predictionengine2027/ (humain.au proxies that path to this site).
// The build output is nested in dist/predictionengine2027 so the Netlify site serves the same path,
// which is what the humain.au proxy rewrites to.
export default defineConfig({
  base: '/predictionengine2027/',
  build: { outDir: 'dist/predictionengine2027', emptyOutDir: true, target: 'es2020' },
  test: { include: ["tests/*.test.ts"], environment: 'node' },
});
