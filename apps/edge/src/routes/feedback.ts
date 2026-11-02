/** Feedback: visitors send it with their pass; the keepers read it with the admin key. */
import { parseFeedback } from '@owl-park/shared';
import { FEEDBACK_STATUSES, type FeedbackStatus } from '../feedbackBox';
import { CORS, FEEDBACK_BODY_MAX, isAdmin, json, passFrom, readJson, visitOf } from './http';
import { collections } from './park';
import type { RouteCtx } from './router';

// ---- Feedback: visitors send it with their pass; the keepers read it with the admin key ----
export async function feedback(c: RouteCtx): Promise<Response> {
  const { request, env, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  // A few lines of words: refuse anything far larger before reading it.
  if (Number(request.headers.get('Content-Length') ?? 0) > FEEDBACK_BODY_MAX) return json({ error: 'too large' }, 413);
  const draft = parseFeedback(await readJson(request));
  if (!draft) return json({ error: 'bad request' }, 400);
  const ua = request.headers.get('User-Agent')?.slice(0, 300) || null;
  const r = await collections(env).addFeedback(pass.cid, draft, ua, visitOf(pass, request));
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
