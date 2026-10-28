import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const ID = 'virtual:art-files';

/**
 * The art files the client ships (`dir`, public/art), read when it is built, served or tested, each
 * with a hash of its content, as the module `virtual:art-files`: the loader asks for each piece by the
 * one name it has, never a guess that misses, and with the hash (?v=), so a changed picture is a new
 * address and the art can be cached for a year (public/_headers; OP-129). The dev server reloads the
 * list when art comes, goes or changes.
 */
export function artFiles(dir: string): Plugin {
  const resolved = `\0${ID}`;
  return {
    name: 'art-files',
    resolveId: (id) => (id === ID ? resolved : undefined),
    load(id) {
      if (id !== resolved) return undefined;
      const files = readdirSync(dir)
        .sort()
        .map((f) => [f, createHash('sha1').update(readFileSync(resolve(dir, f))).digest('hex').slice(0, 8)]);
      return `export default ${JSON.stringify(Object.fromEntries(files))};`;
    },
    configureServer(server) {
      server.watcher.add(dir);
      const changed = (file: string) => {
        if (!resolve(file).startsWith(dir)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.on('add', changed);
      server.watcher.on('unlink', changed);
      server.watcher.on('change', changed);
    },
  };
}
