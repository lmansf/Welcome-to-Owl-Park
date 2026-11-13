import { describe, expect, it } from 'vitest';
import { router, type Route } from '../src/routes/router';
import { ROUTES } from '../src/routes/table';

// ---- OP-201: the Worker's route table ----

const paths = ROUTES.flatMap((r) => ('path' in r ? [r.path] : []));
const prefixes = ROUTES.flatMap((r) => ('prefix' in r ? [r.prefix] : []));

describe('the route table (OP-201)', () => {
  it('names each exact path once', () => {
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('matches at most one route for any path, so its order changes nothing', () => {
    // No exact path begins with a prefix, and no prefix begins another.
    expect(paths.filter((p) => prefixes.some((x) => p.startsWith(x)))).toEqual([]);
    expect(prefixes.filter((p) => prefixes.some((x) => x !== p && p.startsWith(x)))).toEqual([]);
  });

  it('finds an exact path, a path under a prefix, and nothing for a static asset', () => {
    const a = () => new Response('a');
    const b = () => new Response('b');
    const table: Route[] = [
      { path: '/api/tickets', handle: a },
      { prefix: '/api/tickets/', handle: b },
    ];
    const find = router(table);
    expect(find('/api/tickets')).toBe(a);
    expect(find('/api/tickets/claim')).toBe(b);
    expect(find('/api/ticketsx')).toBeNull();
    expect(find('/')).toBeNull();
    expect(find('/assets/index.js')).toBeNull();
  });

  it('refuses a table that names a path twice', () => {
    const a = () => new Response('a');
    expect(() => router([{ path: '/api/pass', handle: a }, { path: '/api/pass', handle: a }])).toThrow(/twice/);
  });

  it('routes every path the Worker answered before the table, and only those', () => {
    const find = router(ROUTES);
    const answered = ['/api/csp-report', '/api/pass', '/api/entry', '/api/travel', '/api/admin/ping', '/api/admin/keeper', '/api/admin/masks/l1', '/api/masks/l1', '/api/admin/grant', '/api/admin/climb', '/api/admin/collect-log', '/api/admin/store', '/api/admin/tickets', '/api/account/protect', '/api/feedback', '/api/admin/feedback', '/admin/feedback', '/api/admin/opening', '/admin/opening', '/api/admin/gate', '/admin/gate', '/api/admin/restart', '/api/line', '/api/notice', '/api/closed', '/api/admin/capacity', '/admin/capacity', '/api/store/webhook', '/api/tickets', '/api/tickets/claim', '/api/collection', '/api/shop', '/api/shop/buy', '/api/shop/gift', '/api/nest', '/api/nest/gift', '/api/vote', '/api/vote/tally', '/api/health', '/api/counts', '/ws/hub', '/google5a7a5bd196df69a0.html'];
    expect(answered.filter((p) => !find(p))).toEqual([]);
    // Pages and the built client are static assets: no route takes them.
    expect(['/', '/index.html', '/assets/app.js', '/api/nope', '/admin/nope'].filter((p) => find(p))).toEqual([]);
  });
});
