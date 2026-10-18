import { defineConfig } from 'vite';

// Link previews need an absolute image URL on some sites: VITE_SITE_URL (the park's origin, set by
// the deploy workflows from a repository variable) fills __SITE_URL__ in index.html; without it the
// URLs stay relative to the page.
const siteUrl = (process.env['VITE_SITE_URL'] ?? '').trim().replace(/\/+$/, '');

// For GitHub Pages the site lives under /<repo>/; CI sets BASE_PATH accordingly.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [{ name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
