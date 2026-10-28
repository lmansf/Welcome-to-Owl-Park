import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Link previews need an absolute image URL on some sites: VITE_SITE_URL (the park's origin, set by
// the deploy workflows from a repository variable) fills __SITE_URL__ in index.html; without it the
// URLs stay relative to the page.
const siteUrl = (process.env['VITE_SITE_URL'] ?? '').trim().replace(/\/+$/, '');

// The art files the client ships (public/art), read when it is built or served: the loader asks for
// each piece by the one name it has, never a guess that misses (OP-129). The dev server reloads the
// list when art is added or taken away.
const ART_DIR = resolve(__dirname, 'public/art');
const ART_FILES_ID = 'virtual:art-files';
function artFiles(): Plugin {
  const resolved = `\0${ART_FILES_ID}`;
  return {
    name: 'art-files',
    resolveId: (id) => (id === ART_FILES_ID ? resolved : undefined),
    load: (id) => (id === resolved ? `export default ${JSON.stringify(readdirSync(ART_DIR).sort())};` : undefined),
    configureServer(server) {
      server.watcher.add(ART_DIR);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(ART_DIR)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
    },
  };
}

// For GitHub Pages the site lives under /<repo>/; CI sets BASE_PATH accordingly.
export default defineConfig({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [{ name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl) }, artFiles()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
