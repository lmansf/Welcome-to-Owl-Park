import { tooMany } from '../guard';
import { Counter } from '../limits';
import { clientIp, json } from './http';
import { overflow } from './park';
import type { RouteCtx } from './router';

const perAddress = new Counter({ limit: 15, windowMs: 60_000 });
const perWorker = new Counter({ limit: 120, windowMs: 60_000 });

/** An anonymous count, with a fixed event kind. Error text, URLs and identifiers never go into storage. */
export async function clientError({ request, env, log }: RouteCtx): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const kind = request.headers.get('X-Park-Error');
  if ((kind !== 'error' && kind !== 'rejection') || Number(request.headers.get('Content-Length') ?? 0) > 0) return json({ error: 'bad request' }, 400);
  if (request.body) {
    const reader = request.body.getReader();
    const { done } = await reader.read();
    if (!done) {
      void reader.cancel();
      return json({ error: 'bad request' }, 400);
    }
  }
  const now = Date.now();
  const over = perAddress.take(clientIp(request, env), now) ?? perWorker.take('all', now);
  if (over) return tooMany(false, over.wait);
  try {
    const r = await overflow(env).fetch('https://park/client-error', { method: 'POST' });
    if (!r.ok) throw new Error(`counter returned ${r.status}`);
    return new Response(null, { status: 204 });
  } catch (e) {
    log.warn('worker', 'write_failed', 'A browser error report could not be counted.', { error: e });
    return json({ error: 'counter unavailable' }, 503);
  }
}
