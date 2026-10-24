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
 *
 * The fraud link (C45), once its endpoint is set: every paid ticket order is scored by the fraud
 * pipeline before any ticket goes out, once (a webhook sent again finds the first verdict). Approve
 * releases it; review holds it for the owner (tickets switched off, no link, the order tagged
 * owl:held) until a Release or a Refund on the owner's page, or 24 hours with no action (released,
 * fail open); decline refunds it through the store at once, or switches off a free order's tickets;
 * no answer within 2 seconds releases it (fail open). What the buyer got goes back to the pipeline.
 */
import { HELD_TAG, HOLD_MS, postResponse, responsePost, SCORE_BUDGET_MS, scoreOrder, scoreRequest, type ClientDetails, type FraudConfig, type Outcome, type ResponsePost } from './fraudLink';
import { adminQuery, adminQueryPartial, FULFILL_MUTATION, FULFILLMENT_ORDERS_QUERY, fulfillmentInput, StoreError, TICKET_UPSERT_MUTATION, ticketLinesOpen, ticketUpsert, type FulfillmentOrders, type StoreConfig, type TicketMirror } from './storeApi';
import { freeOrder, fromTicketOf, gidTail, lowRisk, ORDER_PAYER_QUERY, ORDER_QUERY, paidFor, ticketLines, usedCode, type AdminOrder, type TicketLine } from './shopify';
import type { OrderCheck } from './TicketBook';

/** The order tag that releases a held order: the owner's fraud check passed it. */
export const RELEASE_TAG = 'owl-park-release';

/** The vote ledger's ticket desk as the Worker reaches it: a GET without a body, a POST with one. */
export type Desk = (path: string, body?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;

export interface HookDeps {
  store: StoreConfig;
  desk: Desk;
  /** The claim link for a secret, on the park's own address. */
  claimUrl: (secret: string) => string;
  /** The park's own address the webhook came to (kept with a held order for its claim link later). */
  origin?: string;
  fetchFn?: typeof fetch;
  /** Waits: before a paid order's second look at a rating still in progress, and between looks at an order another webhook is working on (tests skip it). */
  wait?: (ms: number) => Promise<void>;
  /** Opening night's discount code for the annual pass (C42), to count passes bought with it. */
  openingCode?: string;
  /** The fraud link (C45); without it the store's own rating decides. */
  fraud?: FraudConfig;
  /** The fraud link's clock, ids and wait for a verdict (tests set them). */
  now?: () => number;
  uuid?: () => string;
  scoreBudgetMs?: number;
  /** Work that may finish after the answer to the store (the checkout response to the pipeline). */
  later?: (work: Promise<unknown>) => void;
}

export interface HookResult {
  status: number;
  body: Record<string, unknown>;
  /** An order whose tickets changed: the Worker refreshes the store's copy after answering. */
  mirror?: string;
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

/** Whether an order's tickets go out at once: the store rated it low risk, or it is free (C42: nothing to rate). */
const clears = (order: AdminOrder) => lowRisk(order) || freeOrder(order);

async function paid(deps: HookDeps, id: string, onlyFree = false, client: ClientDetails | null = null): Promise<HookResult> {
  let order = await loadOrder(deps, id);
  if (!order || order.cancelledAt || (onlyFree && !freeOrder(order))) return { status: 200, body: { tickets: 0 } };
  const lines = ticketLines(order);
  if (!lines.length) return { status: 200, body: { tickets: 0 } };
  // C45: the fraud pipeline decides, and the store's rating is one more thing it weighs.
  if (deps.fraud) return checked(deps, deps.fraud, id, order, lines, client);
  // The store rates an order a few seconds after it is placed: one more look before holding it.
  if (!clears(order) && ratingPending(order)) {
    await (deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(2000);
    order = (await loadOrder(deps, id)) ?? order;
  }
  return issue(deps, id, order, lines, !clears(order));
}

/** An order's tickets, held or not; the opening-night pass link; and the claim link unless held. */
async function issue(deps: HookDeps, id: string, order: AdminOrder, lines: TicketLine[], held: boolean): Promise<HookResult> {
  const issued = await deskOk(deps, '/tickets/issue', { order: id, lines, held });
  const tickets = issued['tickets'] as string[];
  // A pass from opening night's offer: linked to the ticket the park's link named, or counted without one, with what it sold for.
  const from = fromTicketOf(order);
  if (lines.some((l) => l.kind === 'annual') && (from || usedCode(order, deps.openingCode))) await deskOk(deps, '/tickets/link-pass', { order: id, from, cents: paidFor(order, lines, 'annual') });
  if (issued['held'] === true) return { status: 200, body: { tickets: tickets.length, held: true }, mirror: id };
  if (issued['sent'] !== true) await sendLink(deps, id, lines.map((l) => l.line), tickets, (issued['claim'] as string | null) ?? null);
  return { status: 200, body: { tickets: tickets.length, sent: true }, mirror: id };
}

// ---------- the fraud link (C45) ----------

const TAGS_ADD = `mutation OwlParkTagsAdd($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}`;

const TAGS_REMOVE = `mutation OwlParkTagsRemove($id: ID!, $tags: [String!]!) {
  tagsRemove(id: $id, tags: $tags) {
    node { id }
    userErrors { field message }
  }
}`;

/** The refund of a declined order (C8): the order cancelled as fraud, its payment refunded, the buyer told by the store's own email. */
export const REFUND_MUTATION = `mutation OwlParkRefund($orderId: ID!, $refundMethod: OrderCancelRefundMethodInput!) {
  orderCancel(orderId: $orderId, reason: FRAUD, refundMethod: $refundMethod, restock: true, notifyCustomer: true, staffNote: "Declined by the fraud check") {
    job { id }
    orderCancelUserErrors { field message code }
  }
}`;

async function refund(deps: HookDeps, id: string): Promise<void> {
  const data = await adminQuery<{ orderCancel: { orderCancelUserErrors?: Array<{ message?: string }> } | null }>(deps.store, REFUND_MUTATION, { orderId: orderGid(id), refundMethod: { originalPaymentMethodsRefund: true } }, deps.fetchFn);
  const errs = data.orderCancel?.orderCancelUserErrors ?? [];
  if (errs.length) throw new StoreError(errs.map((e) => e.message ?? 'error').join('; '));
}

type Payer = Pick<AdminOrder, 'customer' | 'transactions'>;

/** Who paid (ORDER_PAYER_QUERY): what the store will not let the app read is left out, and the order is scored without it. */
async function loadPayer(deps: HookDeps, id: string): Promise<Payer> {
  try {
    const { data, refused } = await adminQueryPartial<{ order: Payer | null }>(deps.store, ORDER_PAYER_QUERY, { id: orderGid(id) }, deps.fetchFn);
    if (refused.length) console.error('[owl-park] the fraud check scores an order without part of who paid:', refused.join('; '));
    return data.order ?? {};
  } catch (e) {
    console.error('[owl-park] the fraud check scores an order without who paid:', e instanceof Error ? e.message : e);
    return {};
  }
}

/** The order's fraud check as first decided; the first webhook for the order scores it. */
async function firstCheck(deps: HookDeps, cfg: FraudConfig, id: string, order: AdminOrder, lines: TicketLine[], client: ClientDetails | null): Promise<OrderCheck> {
  const known = await deps.desk(`/tickets/check?order=${id}`);
  if (known.status === 200) return known.body['check'] as OrderCheck;
  if (known.status !== 404) throw new StoreError(`ticket desk answered ${known.status}`);
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? (() => crypto.randomUUID());
  const receivedAt = now();
  const ids = { transaction: uuid(), request: uuid() };
  const payer = await loadPayer(deps, id);
  const scored = await scoreOrder(cfg, await scoreRequest({ ...order, ...payer }, lines, client, cfg.salt, ids, receivedAt), deps.fetchFn, deps.scoreBudgetMs ?? SCORE_BUDGET_MS, now);
  const v = scored.verdict;
  const decision = v?.decision ?? 'fail-open';
  const outcome: Outcome = decision === 'approve' ? 'approved' : decision === 'review' ? 'held' : decision === 'decline' ? (freeOrder(order) ? 'switched-off' : 'refunded') : 'fail-open';
  const draft: OrderCheck = {
    order: id,
    name: order.name?.trim() || id,
    transaction: ids.transaction,
    request: ids.request,
    decision,
    score: v?.score ?? null,
    reasons: v?.reasonCodes ?? [],
    modelVersion: v?.modelVersion ?? null,
    scoringMs: scored.ms,
    timedOut: scored.timedOut,
    fallback: !v,
    receivedAt,
    origin: deps.origin ?? '',
    outcome,
    holdUntil: outcome === 'held' ? receivedAt + HOLD_MS : null,
    settledAt: receivedAt,
    responded: false,
  };
  return (await deskOk(deps, '/tickets/check', { check: draft as unknown as Record<string, unknown> }))['check'] as OrderCheck;
}

/** Tell the pipeline what the buyer got (`response`, once) or what became of a held order (`outcome`). */
async function tell(deps: HookDeps, cfg: FraudConfig, kind: ResponsePost['kind'], check: OrderCheck, outcome: Outcome): Promise<void> {
  const post = responsePost(kind, check, outcome, (deps.now ?? Date.now)());
  // Marked before it goes, inside the order's lease: a webhook after this one never sends it again.
  if (kind === 'response') await deskOk(deps, '/tickets/settle', { order: check.order, outcome, responded: true });
  const work = postResponse(cfg, post, deps.fetchFn);
  if (deps.later) deps.later(work);
  else await work;
}

/** A paid ticket order through the fraud link: scored once, then released, held, refunded or switched off. */
async function checked(deps: HookDeps, cfg: FraudConfig, id: string, order: AdminOrder, lines: TicketLine[], client: ClientDetails | null): Promise<HookResult> {
  const check = await firstCheck(deps, cfg, id, order, lines, client);
  let result: HookResult;
  switch (check.outcome) {
    case 'held':
      result = await issue(deps, id, order, lines, true);
      await mutate(deps, TAGS_ADD, { id: orderGid(id), tags: [HELD_TAG] });
      break;
    case 'refunded':
      await refund(deps, id);
      result = { status: 200, body: { tickets: 0 } };
      break;
    case 'switched-off':
      result = { status: 200, body: { tickets: 0 } };
      break;
    default:
      // Approved, released, or no verdict in time (fail open).
      result = await issue(deps, id, order, lines, false);
  }
  if (!check.responded) await tell(deps, cfg, 'response', check, check.outcome);
  return { ...result, body: { ...result.body, check: check.outcome } };
}

/** An order held for review, as the book has it; or why it is not one. */
async function heldCheck(deps: HookDeps, id: string): Promise<OrderCheck | HookResult> {
  const known = await deps.desk(`/tickets/check?order=${id}`);
  if (known.status === 404) return { status: 404, body: { error: 'unknown order' } };
  if (known.status !== 200) throw new StoreError(`ticket desk answered ${known.status}`);
  const check = known.body['check'] as OrderCheck;
  return check.outcome === 'held' ? check : { status: 409, body: { error: 'not held', outcome: check.outcome } };
}

/**
 * A held order released: by the owner (the Release button, or the order tag), or after its 24 hours
 * with no action (fail open). Its tickets work and its claim link goes out. One webhook or keeper
 * at a time per order, as for the store's webhooks.
 */
export function releaseHeld(deps: HookDeps, id: string, outcome: 'released' | 'released-after-24h'): Promise<HookResult> {
  return oneAtATime(deps, id, () => releaseNow(deps, id, outcome));
}

async function releaseNow(deps: HookDeps, id: string, outcome: 'released' | 'released-after-24h'): Promise<HookResult> {
  const held = await heldCheck(deps, id);
  if ('status' in held) return held;
  const order = await loadOrder(deps, id);
  if (!order || order.cancelledAt) {
    // Cancelled in the store meanwhile: nothing to release.
    await deskOk(deps, '/tickets/settle', { order: id, outcome: 'refunded' });
    return { status: 409, body: { error: 'cancelled' } };
  }
  const r = await deskOk(deps, '/tickets/release', { order: id });
  const known = await deskOk(deps, `/tickets/order?order=${id}`);
  // The claim link points at the address the order's webhook came to.
  const linkDeps: HookDeps = held.origin ? { ...deps, claimUrl: (secret) => claimLink(held.origin, secret) } : deps;
  await sendLink(linkDeps, id, known['lines'] as string[], r['tickets'] as string[], (r['claim'] as string | null) ?? null);
  await mutate(deps, TAGS_REMOVE, { id: orderGid(id), tags: [HELD_TAG] });
  const settled = (await deskOk(deps, '/tickets/settle', { order: id, outcome }))['check'] as OrderCheck;
  if (deps.fraud) await tell(deps, deps.fraud, 'outcome', settled, outcome);
  return { status: 200, body: { released: true, outcome }, mirror: id };
}

/** The owner refunds a held order: refunded through the store (a free order's tickets just switched off). */
export function refundHeld(deps: HookDeps, id: string): Promise<HookResult> {
  return oneAtATime(deps, id, () => refundNow(deps, id));
}

async function refundNow(deps: HookDeps, id: string): Promise<HookResult> {
  const held = await heldCheck(deps, id);
  if ('status' in held) return held;
  const order = await loadOrder(deps, id);
  const free = !order || freeOrder(order);
  if (order && !order.cancelledAt && !free) await refund(deps, id);
  await deskOk(deps, '/tickets/revoke', { order: id, which: 'all' });
  const outcome: Outcome = free ? 'switched-off' : 'refunded';
  const settled = (await deskOk(deps, '/tickets/settle', { order: id, outcome }))['check'] as OrderCheck;
  if (deps.fraud) await tell(deps, deps.fraud, 'outcome', settled, outcome);
  return { status: 200, body: { refunded: !free, outcome }, mirror: id };
}

/** Held orders past their 24 hours with no action: each is released (fail open). Returns how many. */
export async function releaseDue(deps: HookDeps): Promise<number> {
  const due = (await deskOk(deps, '/tickets/due'))['orders'] as string[];
  let n = 0;
  for (const id of due) {
    try {
      if ((await releaseHeld(deps, id, 'released-after-24h')).status === 200) n++;
    } catch (e) {
      console.error('[owl-park] a held order could not be released:', id, e instanceof Error ? e.message : e);
    }
  }
  return n;
}

/** A held order changed or got a new rating: release it if the owner tagged it or the store now rates it low. */
async function recheck(deps: HookDeps, id: string, payload: Record<string, unknown>): Promise<HookResult> {
  const known = await deps.desk(`/tickets/order?order=${id}`);
  // Not a ticket order (or one the book has not seen yet: its paid webhook makes the tickets).
  if (known.status === 404) return { status: 200, body: { tickets: 0 } };
  if (known.status !== 200) throw new StoreError(`ticket desk answered ${known.status}`);
  if (known.body['held'] !== true) return { status: 200, body: { held: false } };
  let release = tagsOf(payload).includes(RELEASE_TAG);
  // With the fraud link (C45) a held order waits for the owner, not for the store's rating.
  if (!release && !deps.fraud) {
    const order = await loadOrder(deps, id);
    release = !!order && !order.cancelledAt && lowRisk(order);
  }
  if (!release) return { status: 200, body: { held: true } };
  // The owner's tag is their Release (this webhook holds the order's lease already).
  if ((await deps.desk(`/tickets/check?order=${id}`)).status === 200) return releaseNow(deps, id, 'released');
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
  const revoked = ((await deskOk(deps, '/tickets/revoke', { order: id, which }))['revoked'] as string[]).length;
  return { status: 200, body: { revoked }, ...(revoked ? { mirror: id } : {}) };
}

async function cancelled(deps: HookDeps, id: string): Promise<HookResult> {
  const revoked = ((await deskOk(deps, '/tickets/revoke', { order: id, which: 'all' }))['revoked'] as string[]).length;
  // A held order the owner cancelled in the store is settled, so it is not released after its 24 hours.
  if (deps.fraud) {
    const held = await heldCheck(deps, id);
    if (!('status' in held)) await deskOk(deps, '/tickets/settle', { order: id, outcome: 'refunded' });
  }
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
    await deps.desk('/tickets/unlease', { order: id }).catch(() => undefined);
  }
}

/** The browser details the store sends with an order (hashed into a device id by the fraud link). */
function clientOf(payload: Record<string, unknown>): ClientDetails | null {
  const c = payload['client_details'];
  return c && typeof c === 'object' && !Array.isArray(c) ? (c as ClientDetails) : null;
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
      return paid(deps, id, false, clientOf(payload));
    case 'orders/create':
      // Only a free order: should the store not send orders/paid for one, its tickets still go out.
      return paid(deps, id, true, clientOf(payload));
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
