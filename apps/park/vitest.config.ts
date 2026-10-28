import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { artFiles } from './artFilesPlugin';

export default defineConfig({
  plugins: [artFiles(resolve(__dirname, 'public/art'))],
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
