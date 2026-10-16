import { defineConfig } from 'vite';

// For GitHub Pages the site lives under /<repo>/; CI sets BASE_PATH accordingly.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
