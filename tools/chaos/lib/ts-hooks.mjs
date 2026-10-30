/**
 * A module hook for lib/shared.mjs (OP-132): the shared package's TypeScript names its imports
 * without an extension, as its bundlers allow; Node finds them here, as `<name>.ts` or
 * `<name>/index.ts`. Node strips the types itself.
 */
import { existsSync } from 'node:fs';

export async function resolve(specifier, context, next) {
  if (/^\.\.?\//.test(specifier) && context.parentURL?.endsWith('.ts') && !/\.[cm]?[jt]s$/.test(specifier)) {
    for (const tail of ['.ts', '/index.ts']) {
      const url = new URL(specifier + tail, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
