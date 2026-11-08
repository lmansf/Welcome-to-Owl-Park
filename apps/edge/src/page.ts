/**
 * The page itself is never cached, anywhere: every deploy gives the client's script bundle a new
 * name, so a page kept from an earlier deploy points at a bundle that no longer exists and the
 * park loads blank. The bundles keep their long cache (their names change with their content).
 * wrangler.jsonc routes the page through the Worker (`run_worker_first`) so this always applies.
 */
export function isPage(pathname: string): boolean {
  return pathname === '/' || pathname.endsWith('.html');
}

/** The same response, marked uncacheable for browsers and for Cloudflare's edge. */
export function uncachedPage(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('CDN-Cache-Control', 'no-store');
  return out;
}
