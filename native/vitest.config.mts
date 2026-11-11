import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  // Contract tests exercise the server handler alongside the native decoder.
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
});
