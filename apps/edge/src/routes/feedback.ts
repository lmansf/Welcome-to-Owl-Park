/** Feedback: visitors send it with their pass (and climb the thanks ladder, OP-272); the keepers read it with the admin key. */
import { hashForLog, parseFeedback } from '@owl-park/shared';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '../feedbackBox';
import { admitted } from '../gate';
import { Counter, limitsOn } from '../limits';
import { CORS, FEEDBACK_BODY_MAX, clientIp, isAdmin, json, passFrom, readJson, visitOf } from './http';
import { collections, gateOf } from './park';
import type { RouteCtx } from './router';

/**
 * Notes from one address an hour (OP-236), on top of each owl's own limits (feedbackBox.ts): a script
 * that mints fresh owls cannot fill the park's daily share alone. A household or a classroom shares an
 * address, so it is set well past what a few owls send. Counted in this copy of the Worker's memory,
 * like every other rate limit here (limits.ts).
 */
export const FEEDBACK_PER_ADDRESS = { limit: 20, windowMs: 60 * 60_000 } as const;
let byAddress = new Counter(FEEDBACK_PER_ADDRESS);

/** For tests: every address's count forgotten. */
export function forgetFeedbackAddresses(): void {
  byAddress = new Counter(FEEDBACK_PER_ADDRESS);
}

// ---- Feedback: visitors send it with their pass; the keepers read it with the admin key ----
export async function feedback(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  const { url } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const reward = url.pathname === '/api/feedback/reward' && request.method === 'GET';
  const close = url.pathname === '/api/feedback/close' && request.method === 'POST';
  if (!reward && !close && !(url.pathname === '/api/feedback' && request.method === 'POST')) return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  // The thanks ladder (OP-272): only an owl past the turnstiles climbs it, since guests keep nothing they win.
  const earns = admitted(await gateOf(env), pass);
  if (reward) return json({ earns, ...(await collections(env).feedbackRewards(pass.cid)) });
  if (close) return json({ earns, ...(await collections(env).closeFeedbackCard(pass.cid)) });
  // A few lines of words: refuse anything far larger before reading it.
  if (Number(request.headers.get('Content-Length') ?? 0) > FEEDBACK_BODY_MAX) return json({ error: 'too large' }, 413);
  // The words come back with any email, phone number, link, handle or street address taken out (OP-236).
  const draft = parseFeedback(await readJson(request));
  if (!draft) return json({ error: 'bad request' }, 400);
  if (limitsOn(env)) {
    const over = byAddress.take(clientIp(request, env), Date.now());
    if (over) {
      // TODO-DOCS (OP-236): docs/LOGGING.md: rate_limited gains the limit feedback-address (notes from one address an hour, FEEDBACK_PER_ADDRESS), with collector_hash.
      if (over.first) log.warn('worker.guard', 'rate_limited', 'Feedback came too often from one address: refused until the hour is out.', { route: '/api/feedback', limit: 'feedback-address', retry_after_s: over.wait, collector_hash: hashForLog(pass.cid) });
      return json({ ok: false, reason: 'full' }, 429);
    }
  }
  const ua = request.headers.get('User-Agent')?.slice(0, 300) || null;
  const r = await collections(env).addFeedback(pass.cid, draft, ua, visitOf(pass, request), earns);
  return json(r, r.ok ? 200 : 429);
}

export async function adminFeedback(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!isAdmin(request, env, log)) return json({ error: 'forbidden' }, 403);
  const isStatus = (v: unknown): v is FeedbackStatus => typeof v === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(v);
  if (request.method === 'GET') {
    const status = url.searchParams.get('status') ?? 'open';
    const limit = Number(url.searchParams.get('limit') ?? 100);
    if (status !== 'all' && !isStatus(status)) return json({ error: 'bad request' }, 400);
    return json({ feedback: await collections(env).feedback(status, Number.isFinite(limit) ? limit : 100) });
  }
  if (request.method === 'POST') {
    const body = await readJson(request);
    const id = body?.['id'];
    const status = body?.['status'];
    if (typeof id !== 'number' || !Number.isInteger(id) || !isStatus(status)) return json({ error: 'bad request' }, 400);
    return (await collections(env).setFeedbackStatus(id, status)) ? json({ ok: true }) : json({ error: 'not found' }, 404);
  }
  return json({ error: 'not found' }, 404);
}
