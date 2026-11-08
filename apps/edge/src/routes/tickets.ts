/** Tickets (C35): the wallet on this device, the emailed and shared links, and the gate. */
import { hashForLog } from '@owl-park/shared';
import { deviceClass } from '../collectLog';
import { openingOn, passLinkReady, storeCatalogue } from '../opening';
import { GUEST_PASS_TTL_S, mintPass, requireSecret } from '../pass';
import { KINDS, passCartLink, ticketCartLink } from '../shopify';
import { storeConfig } from '../storeApi';
import { CORS, json, passFrom, readJson } from './http';
import { deskOf, gateOf, logPurchase, mirrorLater, offerProtectByOrder } from './park';
import type { RouteCtx } from './router';

// ---- Tickets (C35): the wallet on this device, the emailed and shared links, and the gate ----
export async function tickets(c: RouteCtx): Promise<Response> {
  const { request, env, ctx, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const pass = await passFrom(request, env, log);
  if (!pass) return json({ error: 'bad-pass' }, 401);
  if (!pass.cid) return json({ error: 'no-collector' }, 401);
  // A ticket lives on one device: the collector this browser keeps.
  const device = pass.cid;
  const desk = deskOf(env);
  const reply = (r: { status: number; body: Record<string, unknown> }) => json(r.body, r.status);
  if (url.pathname === '/api/tickets' && request.method === 'GET') {
    const [r, catalogue] = await Promise.all([desk(`/tickets/wallet?device=${encodeURIComponent(device)}`), storeCatalogue(env)]);
    if (r.status !== 200) return reply(r);
    // Opening night (C42): a scanned Opening Night Ticket offers its pass only when the park can
    // make the link.
    const ready = passLinkReady(env, catalogue);
    const tickets = (r.body['tickets'] as Array<Record<string, unknown>>).map((t) => (t['freePass'] === 'ready' && !(ready.code && ready.pass) ? { ...t, freePass: undefined } : t));
    return json({ tickets, openingNight: openingOn(catalogue, Date.now()) });
  }
  const body = request.method === 'POST' ? await readJson(request) : null;
  if (!body) return json({ error: 'bad request' }, 400);
  if (url.pathname === '/api/tickets/claim' || url.pathname === '/api/tickets/take') {
    const { status, body: answer } = await desk(url.pathname.slice(4), { secret: body['secret'], device });
    // The claimed order stays with the Worker: its email protects this owl (OP-139). How many tickets moved is the log's.
    const { order, moved, claimed, inUse, ...rest } = answer;
    const share = url.pathname === '/api/tickets/take';
    const deviceClassNow = () => deviceClass(request.headers.get('User-Agent'), request.headers.get('Sec-CH-UA-Mobile'));
    if (status === 200) {
      log.info('worker.tickets', 'claim_moved', share ? 'A share link moved a ticket onto this device.' : 'A claim link moved its order’s tickets onto this device.', {
        via: share ? 'share' : 'claim',
        collector_hash: hashForLog(device),
        device_class: deviceClassNow(),
        ...(typeof order === 'string' ? { order_hash: hashForLog(order) } : {}),
        ...(share ? { tickets: 1 } : { tickets: claimed, from_other_device: moved, in_use: inUse }),
      });
    }
    if (status === 409) {
      // A link that tried to move a ticket already running on another owl (OP-174): the sign of a forwarded email.
      log.info('worker.tickets', 'claim_in_use', share ? 'A share link named a ticket already in use; it stayed where it was.' : 'A claim link found its order’s tickets already in use on another owl; nothing moved.', {
        via: share ? 'share' : 'claim',
        collector_hash: hashForLog(device),
        device_class: deviceClassNow(),
        ...(typeof order === 'string' ? { order_hash: hashForLog(order) } : {}),
        in_use: typeof inUse === 'number' ? inUse : 1,
      });
    }
    if (status === 200 && typeof order === 'string') ctx.waitUntil(offerProtectByOrder(env, log, url.origin, device, order));
    // A claim link put a store order's tickets on this owl (OP-192): the order is this owl's in the park's log.
    if (status === 200 && !share && typeof order === 'string' && /^\d{1,20}$/.test(order) && typeof claimed === 'number' && claimed > 0) {
      logPurchase(ctx, env, log, { event: 'claimed', order, cid: device, at: Date.now(), kinds: [], tickets: claimed, cents: null, via: 'claim' });
    }
    return json(rest, status);
  }
  if (url.pathname === '/api/tickets/share') return reply(await desk('/tickets/share', { id: body['id'], device }));
  if (url.pathname === '/api/tickets/checkout') {
    // The gate's checkout (OP-175, OP-180): a cart link with one Day Ticket and a one-time token for this owl, so the paid ticket lands here.
    // With `kind: 'annual'` (OP-198), the annual pass instead: the card before the store offers it beside the Day Ticket.
    const store = storeConfig(env);
    const catalogue = store ? await storeCatalogue(env) : null;
    const variant = body['kind'] === 'annual' ? catalogue?.passVariant : catalogue?.dayVariant;
    if (!store || !variant) return json({ error: 'not-set-up' }, 503);
    const r = await desk('/tickets/checkout', { device });
    if (r.status !== 200 || typeof r.body['token'] !== 'string') return reply(r);
    return json({ url: ticketCartLink(store.shop, variant, r.body['token']) });
  }
  if (url.pathname === '/api/tickets/pass') {
    // Opening night's pass (C42, half price): the cart link, for an Opening Night Ticket on this owl that went through
    // the gate tonight, or a Day or Night ticket on it (OP-180: offered right after a Day Ticket bought at the gate).
    const r = await desk('/tickets/pass-offer', { id: body['id'], device });
    if (r.status !== 200) return reply(r);
    if (r.body['ok'] !== true) return json(r.body, 409);
    const store = storeConfig(env);
    const code = env.OPENING_PASS_CODE?.trim();
    const catalogue = await storeCatalogue(env);
    const variant = catalogue?.passVariant;
    if (!store || !code || !variant) return json({ ok: false, reason: 'not-set-up' }, 503);
    // The half price runs all season after a Day or Night ticket (Logan, Nov 1); when it is on is the store's code's dates.
    return json({ ok: true, url: passCartLink(store.shop, variant, code, body['id'] as string) });
  }
  if (url.pathname === '/api/tickets/scan') {
    const r = await desk('/tickets/scan', body['id'] === undefined ? { device } : { device, id: body['id'] });
    if (r.status !== 200 || r.body['ok'] !== true) return reply(r);
    // The ticket's order stays with the Worker (OP-192): the page is never sent it.
    const { order: scanOrder, ...scanned } = r.body;
    // Through the gate: the same owl, now admitted by this ticket, until the ticket runs out.
    const tid = r.body['id'] as string;
    const nowS = Math.floor(Date.now() / 1000);
    const until = r.body['validUntil'];
    const exp = Math.min(nowS + GUEST_PASS_TTL_S, typeof until === 'number' ? Math.floor(until / 1000) : Infinity);
    // Issued now: the turnstiles admit it after any nightly restart that went before (OP-181).
    const admittedPass = await mintPass(requireSecret(env, url), { ...pass, iat: nowS, exp, adm: true, tid });
    if (r.body['started'] === true) {
      mirrorLater(ctx, env, log, url.origin, { id: tid });
      // Its first scan started its time on this owl (OP-192): the pass the owl holds, and until when. A ticket the keepers gave has no store order.
      const kind = KINDS.find((k) => k === r.body['kind']);
      const storeOrder = typeof scanOrder === 'string' && /^\d{1,20}$/.test(scanOrder) ? scanOrder : null;
      if (kind) logPurchase(ctx, env, log, { event: 'scanned', order: storeOrder, cid: device, at: Date.now(), kinds: [kind], tickets: 1, cents: null, until: typeof until === 'number' ? until : null, ref: tid });
    }
    return json({ ...scanned, pass: admittedPass, exp, gate: (await gateOf(env)).mode, adm: true });
  }
  return json({ error: 'not found' }, 404);
}
