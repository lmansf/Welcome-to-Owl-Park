/**
 * The Worker's front door (OP-140, OP-141, OP-144): what a request meets before its route, and what
 * every answer carries out.
 *
 * - Only https, off this machine: a page asked for over http is sent to https; the API and the room
 *   sockets over http are refused. Local development and the browser tests are http on localhost.
 * - A room socket opens only from the park's own pages. Each of the park's hostnames serves its own
 *   page and its own sockets, so the page's origin is the Worker's own; PARK_ORIGINS may list more (a
 *   copy of the client served elsewhere, docs/DEPLOY.md mode A), and on this machine any local page
 *   may. A browser always says which page a socket comes from: one that says nothing is refused. An
 *   API call from another site's page is refused too; one that names no page (the store's webhooks,
 *   the uptime check, a same-origin GET) is not.
 * - Every answer: nosniff, HSTS on https, and CORS for the park's own pages only, never `*`.
 * - The park's page runs only its own scripts, with a fresh nonce for its two inline ones on each
 *   load, and connects only to its own host (`parkPolicy`). A browser reports what the policy blocked
 *   to /api/csp-report, logged as csp_violation (a few lines a while, however many pages report).
 *
 * TODO-DOCS (OP-140, OP-141): docs/ARCHITECTURE.md: the front door, the page's policy with why each
 * source is in it, HSTS without includeSubDomains, PARK_ORIGINS; docs/PLAYBOOK.md: what a
 * csp_violation line means and what to do about one.
 */
import type { Logger } from '@owl-park/shared';

/** A host on this machine: local development and the browser tests. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Whether the page at `origin` may open the park's sockets and read its answers (this file's comment). */
export function originAllowed(origin: string, url: URL, listed: string | undefined): boolean {
  if (origin === url.origin) return true;
  if (listed?.split(',').some((o) => o.trim() === origin)) return true;
  return isLocalHost(url.hostname) && URL.canParse(origin) && isLocalHost(new URL(origin).hostname);
}

/**
 * A year, and only the hostname that answers: nothing else on the park's domain is the park's to
 * promise (so no includeSubDomains), and nothing is preloaded (a list that is slow to leave).
 */
export const HSTS = 'max-age=31536000';

/** Where a browser sends what the page's policy blocked. */
export const CSP_REPORT_PATH = '/api/csp-report';

/**
 * The park's page policy (OP-140). Scripts: the page's own, and its two inline ones by the nonce.
 * Styles: its own and inline ones (the load screen's leaves and the HUD set theirs inline). Images:
 * its own, and the data: and blob: ones it makes itself (a nest's picture, the menu's drawn edges, art
 * fetched whole). Connections: its API and its room sockets, on its own host. No plugins, no base, forms
 * only to itself, and no page may frame it.
 */
export function parkPolicy(url: URL, nonce: string): string {
  const sockets = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${sockets}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join('; ');
}

/** A fresh nonce: 128 random bits, in hex. */
export const newNonce = (): string => crypto.randomUUID().replace(/-/g, '');

/** The page with the nonce on each of its scripts. */
export function withNonce(html: string, nonce: string): string {
  return html.replace(/<script(?=[\s>])/gi, (tag) => `${tag} nonce="${nonce}"`);
}

/** The park's page as it goes out: its policy with a fresh nonce, and no page may frame it. */
export async function guardedPage(page: Response, url: URL): Promise<Response> {
  if (page.status !== 200 || !(page.headers.get('Content-Type') ?? '').includes('text/html')) return page;
  const nonce = newNonce();
  const headers = new Headers(page.headers);
  // The words change with every load: the asset's own length and tag no longer fit them.
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.set('Content-Security-Policy', parkPolicy(url, nonce));
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(withNonce(await page.text(), nonce), { status: page.status, statusText: page.statusText, headers });
}

/** Every answer as it leaves (an upgraded socket goes as it is): nosniff, HSTS on https, CORS for the park's own pages. */
export function finished(request: Request, url: URL, res: Response, listed: string | undefined): Response {
  if (res.status === 101 || res.webSocket) return res;
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  // Only over https (the static files' own rule, public/_headers, puts it on the page as it comes from them).
  if (url.protocol === 'https:' && !isLocalHost(url.hostname)) headers.set('Strict-Transport-Security', HSTS);
  else headers.delete('Strict-Transport-Security');
  headers.delete('Access-Control-Allow-Origin');
  const origin = request.headers.get('Origin');
  if (origin !== null && originAllowed(origin, url, listed)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.append('Vary', 'Origin');
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** A refusal at the door: words for a socket (whose page only sees that it failed), JSON for the API. */
function refusal(socket: boolean, status: number, error: string, extra: HeadersInit = {}): Response {
  return socket ? new Response(error, { status, headers: extra }) : Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

/** Too many calls: wait this many seconds. */
export function tooMany(socket: boolean, waitS: number): Response {
  return refusal(socket, 429, 'too-many', { 'Retry-After': String(waitS) });
}

/** How an origin is told in a line: none, or the origin itself, cut short. */
const originForLog = (origin: string | null) => (origin === null ? 'none' : origin.slice(0, 100));

/**
 * The door itself: http off this machine (a page goes to https, anything else is refused), and the page
 * a socket or an API call comes from. Null when the request may go on to its route.
 */
export function frontDoor(request: Request, url: URL, listed: string | undefined, log: Logger): Response | null {
  const socket = url.pathname.startsWith('/ws/');
  const api = url.pathname.startsWith('/api/');
  if (url.protocol === 'http:' && !isLocalHost(url.hostname)) {
    if (!api && !socket && (request.method === 'GET' || request.method === 'HEAD')) {
      const to = new URL(url);
      to.protocol = 'https:';
      return Response.redirect(to.toString(), 301);
    }
    log.info('worker.guard', 'request_refused', 'A call came over plain http and was refused.', { route: url.pathname, reason: 'http' });
    return refusal(socket, 403, 'https-only');
  }
  if (!socket && !api) return null;
  const origin = request.headers.get('Origin');
  if (socket && (origin === null || !originAllowed(origin, url, listed))) {
    log.info('room.join', 'room_join_refused', 'A room socket was refused: it did not come from the park’s own page.', { room: url.pathname.slice(4), reason: 'origin', origin: originForLog(origin) });
    return refusal(true, 403, 'origin');
  }
  if (api && origin !== null && !originAllowed(origin, url, listed)) {
    log.info('worker.guard', 'request_refused', 'A call from another site’s page was refused.', { route: url.pathname, reason: 'origin', origin: originForLog(origin) });
    return refusal(false, 403, 'origin');
  }
  return null;
}

// ---- What the page's policy blocked (the browser's reports) ----

/** A report is a few hundred bytes: anything past this is refused unread. */
export const REPORT_BODY_MAX = 8_192;
/** One line per kind of violation this often, with how many came since: a broken policy on a busy night is a few lines. */
export const REPORT_EVERY_MS = 10 * 60_000;
/** Kinds of violation kept count of at most; past it the counts start over. */
const REPORT_KINDS_MAX = 500;

export interface Violation {
  directive: string;
  /** What was blocked: inline, eval, data, blob, or an address without its query. */
  blocked: string;
  /** The page's path: never its query or its fragment, where a claim link keeps its secret. */
  page: string;
  /** The script that tried, without its query. */
  source?: string;
  line?: number;
}

/** An address as a line may carry it: its origin and path, cut short; a keyword (inline, eval, data) as it is. */
function placeOf(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (!URL.canParse(v)) return v.slice(0, 40);
  const u = new URL(v);
  return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname}`.slice(0, 200) : u.protocol.replace(':', '');
}

/** The parts of a browser's violation report worth a line (`report-uri`'s shape); null when it is not one. */
export function violationOf(body: Record<string, unknown> | null): Violation | null {
  const r = body?.['csp-report'];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const f = r as Record<string, unknown>;
  const directive = f['effective-directive'] ?? f['violated-directive'];
  const blocked = placeOf(f['blocked-uri']) ?? 'inline';
  const pageUrl = f['document-uri'];
  if (typeof directive !== 'string' || !directive || typeof pageUrl !== 'string' || !URL.canParse(pageUrl)) return null;
  const v: Violation = { directive: directive.slice(0, 60), blocked, page: new URL(pageUrl).pathname.slice(0, 100) };
  const source = placeOf(f['source-file']);
  if (source) v.source = source;
  const line = f['line-number'];
  if (typeof line === 'number' && Number.isInteger(line) && line >= 0) v.line = line;
  return v;
}

const violations = new Map<string, { at: number; count: number }>();

/** Logs a violation, or counts it toward the next line of its kind (one per REPORT_EVERY_MS). */
export function noteViolation(log: Logger, v: Violation, now: number): void {
  const kind = `${v.directive} ${v.blocked}`;
  if (!violations.has(kind) && violations.size >= REPORT_KINDS_MAX) violations.clear();
  const seen = violations.get(kind) ?? { at: Number.NEGATIVE_INFINITY, count: 0 };
  seen.count += 1;
  if (now - seen.at >= REPORT_EVERY_MS) {
    log.warn('worker.guard', 'csp_violation', 'The park’s page policy blocked something: if the park needs it, the policy is missing a source.', { ...v, count: seen.count });
    seen.at = now;
    seen.count = 0;
  }
  violations.set(kind, seen);
}

/** For tests: every kind of violation forgotten. */
export function forgetViolations(): void {
  violations.clear();
}
