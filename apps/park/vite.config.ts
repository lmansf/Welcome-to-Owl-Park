/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { build, defineConfig, type Connect, type Plugin } from 'vite';
import { earlyArtScript } from './src/game/artNames';

// The park's game engine (OP-129): Phaser built from its own source with only the parts the park
// uses (src/engine/phaser.cjs), a good third less script than Phaser's ready-made build, and what
// 'phaser' means to the dev server, the unit tests and the build alike. It is built once for each
// Phaser version and engine entry into node_modules/.cache, where later starts find it.
const ENGINE_ENTRY = resolve(import.meta.dirname, 'src/engine/phaser.cjs');
const ENGINE_CACHE = resolve(import.meta.dirname, 'node_modules/.cache/park-engine');
// Phaser's build switches (`typeof WEBGL_RENDERER` and the like in its source), set as its own
// ready-made build sets them, but with no sound.
const ENGINE_FLAGS: Record<string, boolean> = {
  CANVAS_RENDERER: true,
  WEBGL_RENDERER: true,
  WEBGL_DEBUG: false,
  EXPERIMENTAL: false,
  PLUGIN_3D: false,
  PLUGIN_CAMERA3D: false,
  PLUGIN_FBINSTANT: false,
  FEATURE_SOUND: false,
};
async function parkEngine(): Promise<string> {
  const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'node_modules/phaser/package.json'), 'utf8')) as { version: string };
  const key = createHash('sha1').update(version).update(JSON.stringify(ENGINE_FLAGS)).update(readFileSync(ENGINE_ENTRY)).digest('hex').slice(0, 10);
  const file = resolve(ENGINE_CACHE, `phaser-${key}.js`);
  if (existsSync(file)) return file;
  // Built in a folder of its own and moved into place: a dev server and a build starting together
  // (the browser tests start both) each build it, and neither reads the other's half-written file.
  const tmp = resolve(ENGINE_CACHE, `build-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const flags = new RegExp(`typeof (${Object.keys(ENGINE_FLAGS).join('|')})\\b`, 'g');
  await build({
    configFile: false,
    logLevel: 'warn',
    root: import.meta.dirname,
    plugins: [
      {
        name: 'phaser-flags',
        transform: (code, id) => (/[\\/]phaser[\\/]src[\\/]/.test(id) ? code.replace(flags, (_, flag: string) => String(ENGINE_FLAGS[flag])) : null),
      },
    ],
    build: { lib: { entry: ENGINE_ENTRY, formats: ['es'], fileName: () => 'phaser.js' }, outDir: tmp, minify: false, target: 'es2022', copyPublicDir: false, reportCompressedSize: false },
  });
  renameSync(resolve(tmp, 'phaser.js'), file);
  rmSync(tmp, { recursive: true, force: true });
  // Builds for another Phaser or entry are not asked for again.
  for (const f of readdirSync(ENGINE_CACHE)) if (f.startsWith('phaser-') && resolve(ENGINE_CACHE, f) !== file) rmSync(resolve(ENGINE_CACHE, f), { force: true });
  return file;
}

// Link previews need an absolute image URL on some sites: VITE_SITE_URL (the park's origin, set by
// the deploy workflows from a repository variable) fills __SITE_URL__ in index.html; without it the
// URLs stay relative to the page.
const siteUrl = (process.env['VITE_SITE_URL'] ?? '').trim().replace(/\/+$/, '');

// The art files the client ships (public/art), read when it is built, served or tested, each with a
// hash of its content, as the module `virtual:art-files`: the loader asks for each piece by the one
// name it has, never a guess that misses, and with the hash (?v=), so a changed picture is a new
// address and the art can be cached for a year (public/_headers; OP-129). Each file's size comes
// too (`sizes`), for the load screen's progress, and the page asks for the boot's art alongside
// the script (earlyArtScript). The dev server reloads the list when art comes, goes or changes.
// The art preview (tools/art/preview.mjs) builds its "new" copy against public/art with the finals
// laid over, named by PARK_ART_DIR, so the list has the finals' names too.
const ART_DIR = process.env['PARK_ART_DIR'] ? resolve(process.env['PARK_ART_DIR']) : resolve(import.meta.dirname, 'public/art');
const ART_FILES_ID = 'virtual:art-files';
function artFiles(): Plugin {
  const resolved = `\0${ART_FILES_ID}`;
  let base = '/';
  // The art folder, read once (each file's content hash and size) and again after art comes, goes or changes.
  let art: Array<{ f: string; hash: string; size: number }> | null = null;
  const read = () =>
    (art ??= readdirSync(ART_DIR)
      .sort()
      .map((f) => {
        const data = readFileSync(resolve(ART_DIR, f));
        return { f, hash: createHash('sha1').update(data).digest('hex').slice(0, 8), size: data.length };
      }));
  return {
    name: 'art-files',
    configResolved: (config) => {
      base = config.base;
    },
    resolveId: (id) => (id === ART_FILES_ID ? resolved : undefined),
    load(id) {
      if (id !== resolved) return undefined;
      const files = read();
      const hashes = Object.fromEntries(files.map(({ f, hash }) => [f, hash]));
      const sizes = Object.fromEntries(files.map(({ f, size }) => [f, size]));
      return `export default ${JSON.stringify(hashes)};\nexport const sizes = ${JSON.stringify(sizes)};`;
    },
    transformIndexHtml: () => [
      { tag: 'script', injectTo: 'head', children: earlyArtScript(`${base.replace(/\/?$/, '/')}art/`, new Map(read().map(({ f, hash }) => [f, hash]))) },
    ],
    configureServer(server) {
      server.middlewares.use(plainArtNames(server.config.base));
      server.watcher.add(ART_DIR);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(ART_DIR)) return;
        art = null;
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
export default defineConfig(async () => ({
  base: process.env['BASE_PATH'] ?? '/',
  plugins: [{ name: 'site-url', transformIndexHtml: (html: string) => html.replaceAll('__SITE_URL__', siteUrl) }, artFiles()],
  resolve: { alias: [{ find: /^phaser$/, replacement: await parkEngine() }] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
  // The unit tests read the same art list as the client.
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
}));
