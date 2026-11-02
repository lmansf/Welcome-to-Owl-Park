/**
 * The Worker's route table (OP-201): each path the Worker answers, and the handler that answers it.
 * A route is a path asked exactly, or a prefix every path under it begins with. No exact path begins
 * with a prefix and no prefix begins another (`routeTable.test.ts`), so at most one route matches a
 * path and the table's order changes nothing. A path no route matches is a static asset.
 */
import type { Logger } from '@owl-park/shared';
import type { Env } from '../env';

/** What a handler is given: the request, the deployment, the request's context, its URL and its logger. */
export interface RouteCtx {
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
  log: Logger;
}

export type Handler = (c: RouteCtx) => Response | Promise<Response>;

/** One route: `path` matches that path alone, `prefix` every path that begins with it. */
export type Route = { path: string; handle: Handler } | { prefix: string; handle: Handler };

/** The table as the Worker looks paths up in it: exact paths first, then the prefixes. */
export function router(routes: readonly Route[]): (path: string) => Handler | null {
  const exact = new Map<string, Handler>();
  const prefixes: Array<{ prefix: string; handle: Handler }> = [];
  for (const r of routes) {
    if ('path' in r) {
      if (exact.has(r.path)) throw new Error(`the route table names ${r.path} twice`);
      exact.set(r.path, r.handle);
    } else prefixes.push(r);
  }
  return (path) => exact.get(path) ?? prefixes.find((r) => path.startsWith(r.prefix))?.handle ?? null;
}
