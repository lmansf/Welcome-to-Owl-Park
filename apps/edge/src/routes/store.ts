/** The store's webhooks (C35): checked against the store's signature before anything is read. */
import { type Logger, hashForLog } from '@owl-park/shared';
import { sendContact } from '../buyerLog';
import { logConfig } from '../collectLog';
import type { Env } from '../env';
import { webhookSigned } from '../shopify';
import { storeConfig } from '../storeApi';
import { orderIdOf, storeWebhook } from '../storeHooks';
import { json } from './http';
import { logPurchase, mirrorLater, offerProtectByOrder, storeDeps } from './park';
import type { RouteCtx } from './router';

/**
 * A paid order's buyer, for the owner's contacts (OP-192): read from the store and sent on after the
 * answer, kept by nobody here. A row that does not go is said without the address; the order's next
 * webhook sends it again.
 */
export function logContact(ctx: ExecutionContext, env: Env, log: Logger, order: string): void {
  const config = logConfig(env);
  const store = storeConfig(env);
  if (!config || !store) return;
  ctx.waitUntil(
    sendContact(config, store, order, Date.now()).catch((e: unknown) =>
      log.warn('worker.store', 'write_failed', 'A paid order’s buyer did not reach the owner’s contacts: the order’s next webhook sends it again.', { order_hash: hashForLog(order), error: e }),
    ),
  );
}

// ---- The store's webhooks (C35): checked against the store's signature before anything is read ----
export async function storeWebhookRoute(c: RouteCtx): Promise<Response> {
  const { request, env, ctx, url, log } = c;
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const topic = request.headers.get('X-Shopify-Topic') ?? '';
  const rejected = (reason: string, status: number, error: string) => {
    log.warn('worker.store', 'webhook_rejected', 'A store webhook was turned away.', { topic, reason });
    return json({ error }, status);
  };
  const raw = await request.arrayBuffer();
  const signed = await webhookSigned([env.SHOPIFY_WEBHOOK_SECRET, env.SHOPIFY_CLIENT_SECRET], raw, request.headers.get('X-Shopify-Hmac-Sha256'));
  if (!signed) return rejected('signature', 401, 'bad signature');
  const deps = storeDeps(env, url.origin);
  if (!deps) return rejected('not-set-up', 503, 'store not set up');
  const shop = request.headers.get('X-Shopify-Shop-Domain');
  if (shop && shop !== deps.store.shop) return rejected('other-store', 401, 'not this store');
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return rejected('bad-body', 400, 'bad request');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return rejected('bad-body', 400, 'bad request');
  const order = orderIdOf(payload as Record<string, unknown>, topic);
  const about = { topic, ...(order ? { order_hash: hashForLog(order) } : {}) };
  const t0 = Date.now();
  try {
    const r = await storeWebhook(topic, payload as Record<string, unknown>, { ...deps, log });
    log.info('worker.store', 'webhook_received', 'A store webhook was taken.', { ...about, status: r.status, duration_ms: Date.now() - t0 });
    if (r.repeat) log.info('worker.store', 'webhook_duplicate', 'A store webhook came again for work an earlier delivery already did.', about);
    if (r.recorded) log.info('worker.store', 'order_recorded', 'A paid order’s tickets were made.', { ...about, tickets: r.recorded.tickets, held: r.recorded.held });
    if (r.placed && order) {
      // The gate's checkout (OP-175, OP-180): the tickets are on the owl that paid, and its buyer is offered a link to protect it, as a claim's is (OP-186).
      // TODO-DOCS (OP-175): docs/LOGGING.md: claim_moved's via takes checkout (no device_class: the store's webhook carries none).
      log.info('worker.tickets', 'claim_moved', 'A paid order’s tickets went onto the owl that checked out at the gate.', { via: 'checkout', collector_hash: hashForLog(r.placed.device), order_hash: hashForLog(order), tickets: r.placed.tickets });
      ctx.waitUntil(offerProtectByOrder(env, log, url.origin, r.placed.device, order));
    }
    if (r.mirror) mirrorLater(ctx, env, log, url.origin, { order: r.mirror });
    // The park's log of tickets and the owner's contacts (OP-192): each lands once however often the webhook comes.
    if (order && r.sold) {
      logPurchase(ctx, env, log, { event: 'paid', order, cid: null, at: Date.now(), kinds: r.sold.kinds, tickets: r.sold.kinds.length, cents: r.sold.cents, upsell: r.sold.upsell, held: r.sold.held });
      logContact(ctx, env, log, order);
    }
    if (order && r.placed) logPurchase(ctx, env, log, { event: 'claimed', order, cid: r.placed.device, at: Date.now(), kinds: [], tickets: r.placed.tickets, cents: null, via: 'checkout' });
    if (order && r.revoked) logPurchase(ctx, env, log, { event: r.revoked.event, order, cid: null, at: Date.now(), kinds: [], tickets: r.revoked.tickets, cents: r.revoked.cents, ref: r.revoked.refund });
    return json(r.body, r.status);
  } catch (e) {
    log.error('worker.store', 'webhook_failed', 'A store webhook failed: the store sends it again later, and every step is safe to repeat.', { ...about, duration_ms: Date.now() - t0, error: e });
    return json({ error: 'try again' }, 500);
  }
}
