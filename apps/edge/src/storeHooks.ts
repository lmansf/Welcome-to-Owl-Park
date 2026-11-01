/**
 * The store's webhooks (C35), once the Worker has checked their signature. A paid order makes its
 * tickets and sends the claim link through the store's own shipping email; an order the store did
 * not rate low risk waits until the owner's fraud check releases it (the order tag
 * `owl-park-release`) or a later rating comes back low; a refund switches off that many tickets of
 * a line and a cancellation all of them. The store may send any webhook more than once, and
 * retries one that failed: every step here is safe to repeat.
 *
 * Opening night (C42): a free order has nothing to rate, so its tickets go out at once (it is taken
 * from orders/create too, should the store not send orders/paid for it); a pass order from the
 * park's pass link (half price, OP-062: a paid order, rated like any other) keeps the link to the
 * Opening Night Ticket it names and what its passes sold for, and a pass bought with the night's
 * code but without the link is counted apart.
 */
import { hashForLog, type Logger } from '@owl-park/shared';
import { adminQuery, FULFILL_MUTATION, FULFILLMENT_ORDERS_QUERY, fulfillmentInput, StoreError, TICKET_UPSERT_MUTATION, ticketLinesOpen, ticketUpsert, type FulfillmentOrders, type StoreConfig, type TicketMirror } from './storeApi';
import { checkoutTokenOf, freeOrder, fromTicketOf, gidTail, lowRisk, ORDER_QUERY, paidFor, ticketLines, usedCode, type AdminOrder } from './shopify';

/** The order tag that releases a held order: the owner's fraud check passed it. */
export const RELEASE_TAG = 'owl-park-release';

/** The vote ledger's ticket desk as the Worker reaches it: a GET without a body, a POST with one. */
export type Desk = (path: string, body?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;

export interface HookDeps {
  store: StoreConfig;
  desk: Desk;
  /** The claim link for a secret, on the park's own address. */
  claimUrl: (secret: string) => string;
  fetchFn?: typeof fetch;
  /** Waits: before a paid order's second look at a rating still in progress, and between looks at an order another webhook is working on (tests skip it). */
  wait?: (ms: number) => Promise<void>;
  /** Opening night's discount code for the annual pass (C42), to count passes bought with it. */
  openingCode?: string;
  /** Where a step that fails without failing the webhook says so (OP-134). */
  log?: Logger;
}

export interface HookResult {
  status: number;
  body: Record<string, unknown>;
  /** An order whose tickets changed: the Worker refreshes the store's copy after answering. */
  mirror?: string;
  /** Tickets made for a paid order just now, and whether they wait for the owner's fraud check (OP-134's order_recorded). */
  recorded?: { tickets: number; held: boolean };
  /** The webhook came again for work an earlier delivery already did (OP-134's webhook_duplicate). */
  repeat?: true;
  /** The booth's checkout put the order's tickets on this owl just now (OP-175): the Worker protects it by the order's email, as a claim does. */
  placed?: { device: string; tickets: number };
}

/** The link the shipping email carries; the page reads the secret from the fragment. */
export function claimLink(origin: string, secret: string): string {
  return `${origin.replace(/\/$/, '')}/#claim=${secret}`;
}

/** The order's number from a webhook: an order's own payload, or a refund's `order_id`. */
export function orderIdOf(payload: Record<string, unknown>, topic: string): string | null {
  const raw = topic === 'refunds/create' ? payload['order_id'] : (payload['admin_graphql_api_id'] ?? payload['id']);
  const id = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? gidTail(raw) : '';
  return /^\d{1,20}$/.test(id) ? id : null;
}

const orderGid = (id: string) => `gid://shopify/Order/${id}`;

function tagsOf(payload: Record<string, unknown>): string[] {
  const t = payload['tags'];
  const list = Array.isArray(t) ? t : typeof t === 'string' ? t.split(',') : [];
  return list.map((x) => String(x).trim().toLowerCase());
}

/** The store's rating is still being worked out: no assessment yet, or one marked pending. */
function ratingPending(order: AdminOrder): boolean {
  const a = order.risk?.assessments ?? [];
  return a.length === 0 || a.some((x) => (x.riskLevel ?? '').toUpperCase() === 'PENDING');
}

type UserErrors = { userErrors?: Array<{ field?: string[] | null; message?: string }> };

/** A mutation; its user errors come back as a StoreError. */
async function mutate<T extends Record<string, UserErrors | null>>(deps: HookDeps, mutation: string, variables: Record<string, unknown>): Promise<T> {
  const data = await adminQuery<T>(deps.store, mutation, variables, deps.fetchFn);
  for (const v of Object.values(data)) {
    const errs = v?.userErrors ?? [];
    if (errs.length) throw new StoreError(errs.map((e) => e.message ?? 'error').join('; '));
  }
  return data;
}

async function deskOk(deps: HookDeps, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await deps.desk(path, body);
  if (r.status !== 200) throw new StoreError(`ticket desk ${path} answered ${r.status}`);
  return r.body;
}

async function loadOrder(deps: HookDeps, id: string): Promise<AdminOrder | null> {
  return (await adminQuery<{ order: AdminOrder | null }>(deps.store, ORDER_QUERY, { id: orderGid(id) }, deps.fetchFn)).order;
}

/**
 * Sends the order's claim link with a fulfillment of its ticket lines (the store emails it). When
 * the lines are already fulfilled, the link went out on an earlier try: it is only marked sent,
 * and the secret is left alone so the link in that email keeps working. Without a fresh secret in
 * hand (a retried webhook) a new one replaces the one that never went out.
 */
async function sendLink(deps: HookDeps, id: string, lines: string[], tickets: string[], claim: string | null): Promise<void> {
  const fo = await adminQuery<FulfillmentOrders>(deps.store, FULFILLMENT_ORDERS_QUERY, { id: orderGid(id) }, deps.fetchFn);
  if (!ticketLinesOpen(fo, lines)) {
    await deskOk(deps, '/tickets/sent', { order: id });
    return;
  }
  const secret = claim ?? ((await deskOk(deps, '/tickets/claim-again', { order: id }))['claim'] as string | null);
  if (!secret) throw new StoreError('no claim link for this order');
  await mutate(deps, FULFILL_MUTATION, { fulfillment: fulfillmentInput(fo, lines, tickets, deps.claimUrl(secret)) });
  await deskOk(deps, '/tickets/sent', { order: id });
}

/**
 * The booth's checkout (OP-175): a paid order that carries the owl's checkout token puts its
 * tickets on that owl at once. Never fails the webhook: a placement that does not happen leaves
 * the claim email, which goes out as always, to do it.
 */
async function place(deps: HookDeps, id: string, order: AdminOrder): Promise<HookResult['placed']> {
  const token = checkoutTokenOf(order);
  if (!token) return undefined;
  try {
    const r = await deps.desk('/tickets/place', { order: id, token });
    const n = Number(r.body['placed']);
    const device = r.body['device'];
    if (r.status === 200 && n > 0 && typeof device === 'string') return { device, tickets: n };
    if (r.status !== 200) deps.log?.warn('worker.tickets', 'write_failed', 'A paid order’s tickets were not put on the owl that checked out: its claim email still does it.', { order_hash: hashForLog(id), status: r.status });
  } catch (e) {
    deps.log?.warn('worker.tickets', 'write_failed', 'A paid order’s tickets were not put on the owl that checked out: its claim email still does it.', { order_hash: hashForLog(id), error: e });
  }
  return undefined;
}

/** Whether an order's tickets go out at once: the store rated it low risk, or it is free (C42: nothing to rate). */
const clears = (order: AdminOrder) => lowRisk(order) || freeOrder(order);

async function paid(deps: HookDeps, id: string, onlyFree = false): Promise<HookResult> {
  let order = await loadOrder(deps, id);
  if (!order || order.cancelledAt || (onlyFree && !freeOrder(order))) return { status: 200, body: { tickets: 0 } };
  const lines = ticketLines(order);
  if (!lines.length) return { status: 200, body: { tickets: 0 } };
  // The store rates an order a few seconds after it is placed: one more look before holding it.
  if (!clears(order) && ratingPending(order)) {
    await (deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(2000);
    order = (await loadOrder(deps, id)) ?? order;
  }
  const issued = await deskOk(deps, '/tickets/issue', { order: id, lines, held: !clears(order) });
  const tickets = issued['tickets'] as string[];
  // Made just now, or by an earlier delivery of this webhook: then a held order, or one whose link went out, has nothing left to do.
  const existed = issued['existed'] === true;
  const made = existed ? {} : { recorded: { tickets: tickets.length, held: issued['held'] === true } };
  const again = existed && (issued['held'] === true || issued['sent'] === true) ? { repeat: true as const } : {};
  // A pass from opening night's offer: linked to the ticket the park's link named, or counted without one, with what it sold for.
  const from = fromTicketOf(order);
  if (lines.some((l) => l.kind === 'annual') && (from || usedCode(order, deps.openingCode))) await deskOk(deps, '/tickets/link-pass', { order: id, from, cents: paidFor(order, lines, 'annual') });
  // Before the email goes out, so the owl that paid holds the tickets first; a held order's tickets wait on it, held (OP-175).
  const placed = await place(deps, id, order);
  const onOwl = placed ? { placed } : {};
  if (issued['held'] === true) return { status: 200, body: { tickets: tickets.length, held: true }, mirror: id, ...made, ...again, ...onOwl };
  if (issued['sent'] !== true) await sendLink(deps, id, lines.map((l) => l.line), tickets, (issued['claim'] as string | null) ?? null);
  return { status: 200, body: { tickets: tickets.length, sent: true }, mirror: id, ...made, ...again, ...onOwl };
}

/** A held order changed or got a new rating: release it if the owner tagged it or the store now rates it low. */
async function recheck(deps: HookDeps, id: string, payload: Record<string, unknown>): Promise<HookResult> {
  const known = await deps.desk(`/tickets/order?order=${id}`);
  // Not a ticket order (or one the book has not seen yet: its paid webhook makes the tickets).
  if (known.status === 404) return { status: 200, body: { tickets: 0 } };
  if (known.status !== 200) throw new StoreError(`ticket desk answered ${known.status}`);
  if (known.body['held'] !== true) return { status: 200, body: { held: false } };
  let release = tagsOf(payload).includes(RELEASE_TAG);
  if (!release) {
    const order = await loadOrder(deps, id);
    release = !!order && !order.cancelledAt && lowRisk(order);
  }
  if (!release) return { status: 200, body: { held: true } };
  const r = await deskOk(deps, '/tickets/release', { order: id });
  await sendLink(deps, id, known.body['lines'] as string[], r['tickets'] as string[], (r['claim'] as string | null) ?? null);
  return { status: 200, body: { released: true }, mirror: id };
}

async function refunded(deps: HookDeps, id: string, payload: Record<string, unknown>): Promise<HookResult> {
  const items = Array.isArray(payload['refund_line_items']) ? (payload['refund_line_items'] as Array<Record<string, unknown>>) : [];
  const which = items
    .map((li) => ({ line: String(li['line_item_id'] ?? ''), quantity: Number(li['quantity']) }))
    .filter((w) => /^\d{1,20}$/.test(w.line) && Number.isInteger(w.quantity) && w.quantity > 0);
  if (!which.length) return { status: 200, body: { revoked: 0 } };
  // The refund's own id, so the book switches tickets off once for it however often the store sends it (OP-145).
  const rawRefund = payload['id'];
  const refund = typeof rawRefund === 'number' ? String(rawRefund) : typeof rawRefund === 'string' ? gidTail(rawRefund) : '';
  const revoked = ((await deskOk(deps, '/tickets/revoke', { order: id, which, ...(/^\d{1,20}$/.test(refund) ? { refund } : {}) }))['revoked'] as string[]).length;
  return { status: 200, body: { revoked }, ...(revoked ? { mirror: id } : {}) };
}

async function cancelled(deps: HookDeps, id: string): Promise<HookResult> {
  const revoked = ((await deskOk(deps, '/tickets/revoke', { order: id, which: 'all' }))['revoked'] as string[]).length;
  return { status: 200, body: { revoked }, ...(revoked ? { mirror: id } : {}) };
}

/** How long a webhook waits for another one working on the same order: well inside the store's 5 seconds. */
const LEASE_WAIT_MS = 3_000;
const LEASE_POLL_MS = 250;

/**
 * One webhook at a time per order. The store sends a free order's orders/create and orders/paid
 * together (C42), and may send any webhook twice: without this the second could replace the claim
 * link the first is emailing. The second waits for the first and then finds its work done; one that
 * waits too long fails, and the store sends it again later.
 */
async function oneAtATime(deps: HookDeps, id: string, work: () => Promise<HookResult>): Promise<HookResult> {
  const pause = deps.wait ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let waited = 0; (await deskOk(deps, '/tickets/lease', { order: id }))['ok'] !== true; waited += LEASE_POLL_MS) {
    if (waited >= LEASE_WAIT_MS) throw new StoreError(`order ${id} is busy with another webhook`);
    await pause(LEASE_POLL_MS);
  }
  try {
    return await work();
  } finally {
    await deps.desk('/tickets/unlease', { order: id }).catch((e: unknown) => deps.log?.warn('worker.store', 'write_failed', 'An order’s webhook lease was not let go: it runs out on its own within 20 seconds.', { order_hash: hashForLog(id), error: e }));
  }
}

/**
 * One webhook. A store or desk failure throws, so the Worker answers with an error and the store
 * sends the webhook again later.
 */
export async function storeWebhook(topic: string, payload: Record<string, unknown>, deps: HookDeps): Promise<HookResult> {
  const id = orderIdOf(payload, topic);
  if (!id) return { status: 200, body: { ignored: 'no order' } };
  return oneAtATime(deps, id, () => orderWebhook(topic, id, payload, deps));
}

function orderWebhook(topic: string, id: string, payload: Record<string, unknown>, deps: HookDeps): Promise<HookResult> {
  switch (topic) {
    case 'orders/paid':
      return paid(deps, id);
    case 'orders/create':
      // Only a free order: should the store not send orders/paid for one, its tickets still go out.
      return paid(deps, id, true);
    case 'orders/updated':
    case 'orders/risk_assessment_changed':
      return recheck(deps, id, payload);
    case 'refunds/create':
      return refunded(deps, id, payload);
    case 'orders/cancelled':
      return cancelled(deps, id);
    default:
      return Promise.resolve({ status: 200, body: { ignored: topic } });
  }
}

export const ORDER_TICKETS_MUTATION = `mutation OwlParkOrderTickets($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id }
    userErrors { field message }
  }
}`;

/**
 * The store's copy of tickets (C35): one metaobject per ticket, and the order's `owl_park.tickets`
 * list pointing at them, so the owner and the buyer see the tickets on the order. Only orders the
 * store sold (numeric ids) are copied.
 */
export async function mirrorTickets(deps: HookDeps, tickets: TicketMirror[], linkOrder: boolean): Promise<void> {
  const fromStore = tickets.filter((t) => /^\d{1,20}$/.test(t.order));
  const ids: string[] = [];
  for (let i = 0; i < fromStore.length; i += 5) {
    const batch = await Promise.all(
      fromStore.slice(i, i + 5).map((t) => mutate<{ metaobjectUpsert: UserErrors & { metaobject: { id: string } | null } }>(deps, TICKET_UPSERT_MUTATION, ticketUpsert(t))),
    );
    for (const r of batch) if (r.metaobjectUpsert.metaobject) ids.push(r.metaobjectUpsert.metaobject.id);
  }
  const order = fromStore[0]?.order;
  if (!linkOrder || !order || !ids.length) return;
  await mutate(deps, ORDER_TICKETS_MUTATION, {
    metafields: [{ ownerId: orderGid(order), namespace: 'owl_park', key: 'tickets', type: 'list.metaobject_reference', value: JSON.stringify(ids) }],
  });
}
