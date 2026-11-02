/** Accounts without passwords (OP-139, with ACCOUNTS on): protect an owl by email, restore it by a link. */
import { type Logger, hashForLog } from '@owl-park/shared';
import { accountRoute, accountsOn, emailKeys, mailSender } from '../accounts';
import { roomObjectNames } from '../copies';
import type { Env } from '../env';
import { requireSecret } from '../pass';
import { ROOMS } from '../rooms';
import { ACCOUNT_BODY_MAX, CORS, clientIp, json, passFrom, readJson } from './http';
import { collections, overflowOf } from './park';
import type { RouteCtx } from './router';

/**
 * An owl restored on another screen (OP-139): every room object hears it, and sends the moved card to
 * the owl's sockets from any other device at once (with one object per room, the nests' one too).
 */
export async function tellMoved(env: Env, log: Logger, cid: string, dev: string): Promise<void> {
  const copies = await overflowOf(env)
    .then((o) => o.copies)
    .catch((e: unknown) => {
      log.error('overflow', 'read_failed', 'The overflow object did not say which copies of rooms are open: only the rooms themselves are told the owl moved.', { error: e });
      return {};
    });
  const body = JSON.stringify({ cid, dev });
  await Promise.all(
    roomObjectNames(env.ROOM_SHARDING, Object.keys(ROOMS), copies).map((name) =>
      env.ROOMS.get(env.ROOMS.idFromName(name))
        .fetch('https://park/moved', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        .catch((e: unknown) => log.error('worker.accounts', 'write_failed', 'A room object was not told an owl moved to another screen: its page there learns at its next hello.', { object: name, collector_hash: hashForLog(cid), error: e })),
    ),
  );
}

// ---- Accounts without passwords (OP-139, with ACCOUNTS on): protect an owl by email, restore it by a link ----
export async function account(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!accountsOn(env) || request.method !== 'POST') return json({ error: 'not found' }, 404);
  if (Number(request.headers.get('Content-Length') ?? 0) > ACCOUNT_BODY_MAX) return json({ error: 'too large' }, 413);
  const body = await readJson(request);
  if (!body) return json({ error: 'bad request' }, 400);
  const r = await accountRoute(url.pathname.slice('/api/account/'.length), body, {
    rpc: collections(env),
    secret: requireSecret(env, url),
    keys: emailKeys(env),
    mail: mailSender(env),
    origin: url.origin,
    pass: await passFrom(request, env, log),
    collector: request.headers.get('X-Collector'),
    ip: clientIp(request, env),
    moved: (cid, dev) => tellMoved(env, log, cid, dev),
    now: Date.now(),
  });
  return r ? json(r.body, r.status) : json({ error: 'not found' }, 404);
}
