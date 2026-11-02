/** Busy nights (OP-075): a visitor's place in the line, and the busy ribbon's words; and whether the park is closed for setup (OP-233). */
import { type LineStatus, closedView, waitMinutes } from '@owl-park/shared';
import type { LineAnswer } from '../Overflow';
import { mintEntry, requireSecret, verifyEntry } from '../pass';
import { CORS, json, passFrom, readJson, whoOf } from './http';
import { overflow, overflowOf } from './park';
import type { RouteCtx } from './router';

// ---- Busy nights (OP-075): the line, the busy ribbon and copies of rooms, with no deploy ----
export async function line(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  // A visitor's place in the line: POST takes one (or goes straight in), GET ?n= asks where it stands.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  const secret = requireSecret(env, url);
  const who = whoOf(pass);
  const st = await overflowOf(env);
  const go = async () => json({ state: 'go', entry: await mintEntry(secret, who) } satisfies LineStatus);
  const answer = async (r: Response) => {
    if (!r.ok) return go(); // the line could not be asked: nobody is kept out for that
    const a = (await r.json()) as LineAnswer;
    if (a.state === 'go') return go();
    if (a.state === 'called') return json({ ...a, entry: await mintEntry(secret, who) } satisfies LineStatus);
    return json(a satisfies LineStatus);
  };
  const ask = (path: string, body: Record<string, unknown>) => overflow(env).fetch(`https://park${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, who }) });
  if (!st.active) return go();
  if (request.method === 'POST') {
    // In the park lately (this browser holds an entry): straight back in, no line.
    if (await verifyEntry(secret, (await readJson(request))?.['entry'], who)) return go();
    return answer(await ask('/line/join', {}));
  }
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  const n = Number(url.searchParams.get('n'));
  if (!Number.isInteger(n) || n < 1) return json({ error: 'bad request' }, 400);
  // Still waiting when the line was last read: its place is how far its number stands above the
  // line's front, so the many polls of a long line are answered here without asking the line.
  // A number called since, or taken since (above every number waiting then), is asked about.
  const place = n - st.front;
  if (place >= 1 && place <= st.waiting) return json({ state: 'waiting', n, place, waitMin: waitMinutes(place, st.rate) } satisfies LineStatus);
  return answer(await ask('/line/status', { n }));
}

export async function notice(c: RouteCtx): Promise<Response> {
  const { request, env } = c;
  // The busy ribbon's words now (null while it is off), for the home screen.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  return json({ words: (await overflowOf(env)).notice });
}

/**
 * How long a browser or a cache in between may keep the closed state (OP-233): a few seconds, so a
 * classroom's pages polling together cost the Worker little, and a reopening reaches the home screen
 * within the page's poll and this.
 */
export const CLOSED_CACHE = 'public, max-age=5';

/**
 * Whether the park is closed for setup (OP-205), for the home screen (OP-233): closed or not, the closed
 * card's words and the time the keepers expect to open, if they gave one. Anyone may ask: it says nothing
 * else of the keepers' settings, and needs no pass or token.
 * TODO-DOCS (OP-233): docs/ARCHITECTURE.md's route table and its `public` rate limit gain `/api/closed`.
 */
export async function closed(c: RouteCtx): Promise<Response> {
  const { request, env } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  return Response.json(closedView((await overflowOf(env)).setup, Date.now()), { headers: { ...CORS, 'Cache-Control': CLOSED_CACHE } });
}
