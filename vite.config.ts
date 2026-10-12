import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/cull-game/' : '/',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  build: { target: 'es2022' },
});
