import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@engine/api': fileURLToPath(new URL('./engine/api/index.ts', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
