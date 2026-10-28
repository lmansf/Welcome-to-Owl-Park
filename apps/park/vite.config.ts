/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';

// Link previews need an absolute image URL on some sites: VITE_SITE_URL (the park's origin, set by
// the deploy workflows from a repository variable) fills __SITE_URL__ in index.html; without it the
// URLs stay relative to the page.
const siteUrl = (process.env['VITE_SITE_URL'] ?? '').trim().replace(/\/+$/, '');

// The art files the client ships (public/art), read when it is built, served or tested, each with a
// hash of its content, as the module `virtual:art-files`: the loader asks for each piece by the one
// name it has, never a guess that misses, and with the hash (?v=), so a changed picture is a new
// address and the art can be cached for a year (public/_headers; OP-129). Each file's size comes
// too (`sizes`), for the load screen's progress. The dev server reloads the list when art comes,
// goes or changes.
const ART_DIR = resolve(import.meta.dirname, 'public/art');
const ART_FILES_ID = 'virtual:art-files';
function artFiles(): Plugin {
  const resolved = `\0${ART_FILES_ID}`;
  return {
    name: 'art-files',
    resolveId: (id) => (id === ART_FILES_ID ? resolved : undefined),
    load(id) {
      if (id !== resolved) return undefined;
      const files = readdirSync(ART_DIR)
        .sort()
        .map((f) => ({ f, data: readFileSync(resolve(ART_DIR, f)) }));
      const hashes = Object.fromEntries(files.map(({ f, data }) => [f, createHash('sha1').update(data).digest('hex').slice(0, 8)]));
      const sizes = Object.fromEntries(files.map(({ f, data }) => [f, data.length]));
      return `export default ${JSON.stringify(hashes)};\nexport const sizes = ${JSON.stringify(sizes)};`;
    },
    configureServer(server) {
      server.middlewares.use(plainArtNames(server.config.base));
      server.watcher.add(ART_DIR);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(ART_DIR)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
      server.watcher.on('change', changed);
    },
    configurePreviewServer(server) {
      server.middlewares.use(plainArtNames(server.config.base));
    },
  };
}

/**
 * The client asks for each art file by its name percent-encoded (`owl-body%402x.png`), as Cloudflare's
 * asset server has it; Vite's own servers know a public file only by its plain name, and would answer
 * every 2x picture with the page instead. This hands them the plain name (the query as it was).
 */
function plainArtNames(base: string): Connect.NextHandleFunction {
  const art = `${base.replace(/\/?$/, '/')}art/`;
  return (req, _res, next) => {
    const url = req.url ?? '';
    const q = url.indexOf('?');
    const path = q < 0 ? url : url.slice(0, q);
    if (path.startsWith(art) && path.includes('%')) {
      try {
        req.url = decodeURIComponent(path) + (q < 0 ? '' : url.slice(q));
      } catch {
        /* not a name this park ships: asked for as it was */
      }
    }
    next();
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
  // The unit tests read the same art list as the client.
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
