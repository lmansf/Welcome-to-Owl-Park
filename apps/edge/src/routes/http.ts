/** What every route shares about a request: the API's headers, its JSON answers, the body it sent, the keepers' key and the pass it carries. */
import { type Logger, hashForLog } from '@owl-park/shared';
import { type Visit, deviceClass } from '../collectLog';
import type { Env } from '../env';
import { sameKey } from '../guard';
import { type PassPayload, passRefusal, signingSecret, verifyKeeper, verifyPass } from '../pass';

// Which pages may read an answer is the front door's to say, as each answer leaves (guard.ts `finished`): the park's own only.
export const CORS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, X-Collector, X-Keeper-Token',
  'Cache-Control': 'no-store',
};

/** Who an entry or a place in the line belongs to: the browser's collector, or the pass's visitor. */
export const whoOf = (pass: PassPayload) => pass.cid ?? pass.id;

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/** A feedback request body is a few lines of words: anything past this is refused unread. */
export const FEEDBACK_BODY_MAX = 16_384;
/** An account request is an email or a link's token: anything past this is refused unread. */
export const ACCOUNT_BODY_MAX = 2_048;
/**
 * A ledge draft (OP-156) is a few dozen items in practice; four full lists of 200, every front at its
 * 64 points, come to well under this, and the overflow object keeps it in one row.
 */
export const MASKS_BODY_MAX = 1_048_576;

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = (await request.json()) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Whether the request carries the keepers' key: logged either way with its route and, refused, why (never the key). */
export function isAdmin(request: Request, env: Env, log: Logger): boolean {
  const key = env.ADMIN_KEY;
  const given = request.headers.get('X-Admin-Key') ?? '';
  const route = new URL(request.url).pathname;
  const reason = !key || key.length < 16 ? 'no-key-set' : !given ? 'no-key-given' : !sameKey(given, key) ? 'wrong-key' : null;
  if (reason) log.warn('worker.admin', 'admin_denied', 'A keepers’ route was asked without the keepers’ key.', { route, reason });
  else log.info('worker.admin', 'admin_ok', 'A keepers’ route was asked with the keepers’ key.', { route });
  return reason === null;
}

/**
 * Who asks a keepers' route that a keeper's token also opens (OP-156, the ledge painter): the token
 * `?keeper=1` gave this tab (X-Keeper-Token), or else the keepers' key. Logged as isAdmin logs the
 * key, never the token; a token given that is not good is refused for what it is, unless the key
 * comes with it.
 */
export async function keeperOf(request: Request, env: Env, log: Logger): Promise<'keeper' | 'key' | null> {
  const token = request.headers.get('X-Keeper-Token');
  const route = new URL(request.url).pathname;
  if (token !== null && (await verifyKeeper(signingSecret(env), token))) {
    log.info('worker.admin', 'admin_ok', 'A keepers’ route was asked with a keeper’s token.', { route, by: 'keeper' });
    return 'keeper';
  }
  if (token !== null && !request.headers.has('X-Admin-Key')) {
    log.warn('worker.admin', 'admin_denied', 'A keepers’ route was asked with a keeper’s token that is not good: run out, or not the park’s.', { route, reason: 'bad-keeper-token' });
    return null;
  }
  return isAdmin(request, env, log) ? 'key' : null;
}

/** A request's pass token: the Authorization header (Bearer), or the query string. */
export function tokenOf(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : new URL(request.url).searchParams.get('pass');
}

/** Each request's pass, checked once: the rate limits count by it before its route asks for it. */
const checked = new WeakMap<Request, PassPayload | null>();

export async function passOf(request: Request, env: Env): Promise<PassPayload | null> {
  if (checked.has(request)) return checked.get(request) ?? null;
  const pass = await verifyPass(signingSecret(env), tokenOf(request));
  checked.set(request, pass);
  return pass;
}

/** The pass from the Authorization header (Bearer) or the query string; a refused one is logged with why. */
export async function passFrom(request: Request, env: Env, log: Logger) {
  const url = new URL(request.url);
  const token = tokenOf(request);
  const secret = signingSecret(env);
  const pass = await passOf(request, env);
  if (pass) log.debug('worker.pass', 'pass_verified', 'A pass was taken.', { route: url.pathname, session_id: hashForLog(pass.id), adm: pass.adm });
  else log.info('worker.pass', 'pass_rejected', 'A pass was refused.', { route: url.pathname, reason: await passRefusal(secret, token) });
  return pass;
}

/** The client's address. Local load tests set TRUST_FORWARDED_FOR so each bot can claim its own; never in production. */
export function clientIp(request: Request, env: Env): string {
  const forwarded = env.TRUST_FORWARDED_FOR === 'true' ? request.headers.get('X-Forwarded-For') : null;
  return forwarded ?? request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

/** The visit a call comes in, for the collection log (OP-107): its pass's id (one per page load) and the device's class. */
export function visitOf(pass: PassPayload, request: Request): Visit {
  return { pass: pass.id, device: deviceClass(request.headers.get('User-Agent'), request.headers.get('Sec-CH-UA-Mobile')) };
}
