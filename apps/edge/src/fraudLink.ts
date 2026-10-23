/**
 * The fraud link (C45): the Worker plays the fraud pipeline's checkout API. Before any ticket of a
 * paid order is released, it posts the order to the pipeline's scoring endpoint in the pipeline's
 * raw transaction shape and waits up to 2 seconds for a verdict: approve, review or decline, with a
 * score and reason codes. No email, name, address, IP or card digits leave the store: the guest,
 * the device and the card go as salted hashes. What the buyer got back is posted afterwards in the
 * shape of the pipeline's checkout responses. The contract is in docs/ARCHITECTURE.md.
 *
 * Settings, all Worker secrets: FRAUD_SCORE_URL (https), FRAUD_SCORE_KEY (sent as a bearer token)
 * and FRAUD_HASH_SALT. Without the URL the fraud link is off and the store's own rating decides,
 * as before C45.
 */
import { freeOrder, fromTicketOf, gidTail, type AdminOrder, type TicketLine } from './shopify';

/** How long the Worker waits for a verdict before it releases the order (fail open). */
export const SCORE_BUDGET_MS = 2_000;
/** A review left this long with no action is released (fail open). */
export const HOLD_MS = 24 * 60 * 60 * 1000;
/** The order tag of an order held for review, so the owner sees it in the store too. */
export const HELD_TAG = 'owl:held';

export interface FraudConfig {
  url: string;
  key: string;
  salt: string;
}

/** The fraud link once its endpoint, key and salt are set; null leaves it off. Only https, but for a stand-in on this machine. */
export function fraudConfig(env: { FRAUD_SCORE_URL?: string; FRAUD_SCORE_KEY?: string; FRAUD_HASH_SALT?: string }): FraudConfig | null {
  const url = env.FRAUD_SCORE_URL?.trim() ?? '';
  const key = env.FRAUD_SCORE_KEY?.trim() ?? '';
  const salt = env.FRAUD_HASH_SALT?.trim() ?? '';
  if (!url || !key || salt.length < 16) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  return u.protocol === 'https:' || local ? { url: u.toString(), key, salt } : null;
}

export type Decision = 'approve' | 'review' | 'decline';

/** The pipeline's answer. */
export interface Verdict {
  decision: Decision;
  score: number;
  reasonCodes: string[];
  modelVersion: string | null;
  decisionId: string | null;
}

const enc = new TextEncoder();

async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A salted hash of an identifier, never the identifier: the same input gives the same hash, so velocity can be counted. */
export async function saltedHash(salt: string, kind: string, value: string): Promise<string> {
  return sha256(`${salt}:${kind}:${value}`);
}

/** A salted hash in the shape of a uuid (the pipeline keeps guests as uuids). */
export async function saltedUuid(salt: string, kind: string, value: string): Promise<string> {
  const h = await saltedHash(salt, kind, value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const cents = (n: number) => Math.round(n * 100) / 100;

const money = (m: { shopMoney?: { amount?: string | null } | null } | null | undefined) => {
  const n = Number(m?.shopMoney?.amount);
  return Number.isFinite(n) ? cents(n) : 0;
};

/**
 * A line's amounts as the pipeline keeps them: its price before discounts, every discount the store
 * put on it (a code's among them; the store shares an order-wide discount out over the lines too),
 * and what it sold for.
 */
function lineAmounts(li: AdminOrder['lineItems']['nodes'][number]): { unit: number; discount: number; total: number } {
  const original = money(li.originalTotalSet);
  const discount = Math.min(original, cents((li.discountAllocations ?? []).reduce((n, a) => n + money(a.allocatedAmountSet), 0)));
  return { unit: cents(original / Math.max(1, li.quantity)), discount, total: cents(original - discount) };
}

/** What a line is to the pipeline: a ticket, a pass or merch. */
function productType(line: TicketLine | undefined): 'ticket' | 'pass' | 'merch' {
  return !line ? 'merch' : line.kind === 'annual' ? 'pass' : 'ticket';
}

/** The browser details the store passes on with the order webhook (never the IP address). */
export interface ClientDetails {
  user_agent?: unknown;
  accept_language?: unknown;
  browser_width?: unknown;
  browser_height?: unknown;
}

/** One scoring request: the order in the pipeline's raw transaction shape, with hashes in place of who and what. */
export interface ScoreRequest {
  kind: 'score';
  transaction: {
    transaction_id: string;
    request_id: string;
    source_system: 'shopify';
    channel: 'owl-park-web';
    order_number: string;
    event_ts: string;
    currency: 'USD';
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    promo_code: string | null;
    is_guest_checkout: boolean;
    guest_id: string | null;
    device_id: string | null;
    payment_token: string | null;
    payment_gateway: string | null;
    store_risk: string | null;
    cart: Array<{ line_number: number; product_handle: string | null; product_type: 'ticket' | 'pass' | 'merch'; qty: number; unit_price: number; line_discount: number; line_total: number; attributes: Record<string, string> }>;
  };
}

/** The card's BIN and last four from the store's masked number ("•••• •••• •••• 4242"). */
function cardOf(order: AdminOrder): { bin: string; last4: string } | null {
  for (const t of order.transactions ?? []) {
    const bin = t.paymentDetails?.bin?.replace(/\D/g, '') ?? '';
    const last4 = (t.paymentDetails?.number ?? '').replace(/\D/g, '').slice(-4);
    if (bin && last4.length === 4) return { bin, last4 };
  }
  return null;
}

/**
 * The scoring request for an order. `ids` are the Worker's own transaction and request ids;
 * `client` the browser details from the webhook (hashed into a device id).
 */
export async function scoreRequest(order: AdminOrder, lines: TicketLine[], client: ClientDetails | null, salt: string, ids: { transaction: string; request: string }, now: number): Promise<ScoreRequest> {
  const byLine = new Map(lines.map((l) => [l.line, l]));
  const from = fromTicketOf(order);
  const card = cardOf(order);
  const ua = typeof client?.user_agent === 'string' ? client.user_agent : '';
  const device = ua ? [ua, client?.accept_language, client?.browser_width, client?.browser_height].map((v) => (v === undefined || v === null ? '' : String(v))).join('|') : '';
  const gateway = (order.transactions ?? []).find((t) => t.gateway)?.gateway ?? null;
  const levels = (order.risk?.assessments ?? []).map((a) => (a.riskLevel ?? '').toUpperCase()).filter(Boolean);
  const amounts = order.lineItems.nodes.map(lineAmounts);
  const onLines = cents(amounts.reduce((n, a) => n + a.discount, 0));
  return {
    kind: 'score',
    transaction: {
      transaction_id: ids.transaction,
      request_id: ids.request,
      source_system: 'shopify',
      channel: 'owl-park-web',
      order_number: order.name?.trim() || gidTail(order.id),
      event_ts: order.processedAt ?? new Date(now).toISOString(),
      currency: 'USD',
      // As in the pipeline: the subtotal is the lines' total after their discounts, and the order's own
      // discount only what no line carries, so total = subtotal - discount + tax.
      subtotal: cents(amounts.reduce((n, a) => n + a.total, 0)),
      discount: cents(Math.max(0, money(order.totalDiscountsSet) - onLines)),
      tax: money(order.totalTaxSet),
      total: money(order.totalPriceSet),
      promo_code: order.discountCodes?.[0] ?? null,
      is_guest_checkout: order.customer?.state !== 'ENABLED',
      guest_id: order.customer ? await saltedUuid(salt, 'guest', gidTail(order.customer.id)) : null,
      device_id: device ? await saltedHash(salt, 'device', device) : null,
      payment_token: card ? await saltedHash(salt, 'card', `${card.bin}${card.last4}`) : null,
      payment_gateway: gateway,
      store_risk: levels.includes('HIGH') ? 'HIGH' : levels.includes('MEDIUM') ? 'MEDIUM' : levels.includes('PENDING') ? 'PENDING' : levels.length ? 'LOW' : freeOrder(order) ? 'NONE' : null,
      cart: order.lineItems.nodes.map((li, i) => {
        const line = byLine.get(gidTail(li.id));
        const type = productType(line);
        return {
          line_number: i + 1,
          product_handle: li.product?.handle ?? null,
          product_type: type,
          qty: li.quantity,
          unit_price: amounts[i]!.unit,
          line_discount: amounts[i]!.discount,
          line_total: amounts[i]!.total,
          attributes: type === 'pass' && from ? { from_ticket: from } : {},
        };
      }),
    },
  };
}

/** What came of a scoring call: the verdict, or none (no answer in time, or an answer that was not one). */
export interface Scored {
  verdict: Verdict | null;
  ms: number;
  /** No answer within the budget. */
  timedOut: boolean;
}

function verdictOf(v: unknown): Verdict | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const decision = o['decision'];
  const score = o['score'];
  if (decision !== 'approve' && decision !== 'review' && decision !== 'decline') return null;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const reasons = Array.isArray(o['reason_codes']) ? (o['reason_codes'] as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 20) : [];
  const str = (x: unknown) => (typeof x === 'string' && x.length <= 100 ? x : null);
  return { decision, score, reasonCodes: reasons.map((r) => r.slice(0, 60)), modelVersion: str(o['model_version']), decisionId: str(o['decision_id']) };
}

/** Post the order for scoring and wait up to the budget; a verdict that comes later changes nothing. */
export async function scoreOrder(cfg: FraudConfig, req: ScoreRequest, fetchFn: typeof fetch = fetch, budgetMs = SCORE_BUDGET_MS, clock: () => number = Date.now): Promise<Scored> {
  const t0 = clock();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), budgetMs);
  try {
    const res = await fetchFn(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify(req), signal: abort.signal });
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { verdict: verdictOf(body), ms: clock() - t0, timedOut: false };
  } catch {
    return { verdict: null, ms: clock() - t0, timedOut: abort.signal.aborted };
  } finally {
    clearTimeout(timer);
  }
}

/** What the buyer got, in the pipeline's words. */
export type Outcome = 'approved' | 'held' | 'refunded' | 'switched-off' | 'fail-open' | 'released' | 'released-after-24h';

const RESPONSE: Record<Outcome, { status: 'approved' | 'step_up' | 'declined'; message: 'ORDER_CONFIRMED' | 'VERIFY_IDENTITY' | 'PAYMENT_NOT_PROCESSED' }> = {
  approved: { status: 'approved', message: 'ORDER_CONFIRMED' },
  'fail-open': { status: 'approved', message: 'ORDER_CONFIRMED' },
  released: { status: 'approved', message: 'ORDER_CONFIRMED' },
  'released-after-24h': { status: 'approved', message: 'ORDER_CONFIRMED' },
  held: { status: 'step_up', message: 'VERIFY_IDENTITY' },
  refunded: { status: 'declined', message: 'PAYMENT_NOT_PROCESSED' },
  'switched-off': { status: 'declined', message: 'PAYMENT_NOT_PROCESSED' },
};

/** The checkout response posted back: what the buyer got, its latencies and any fallback. */
export interface ResponsePost {
  kind: 'response' | 'outcome';
  response: {
    transaction_id: string;
    request_id: string;
    request_received_at: string;
    response_sent_at: string;
    response_status: 'approved' | 'step_up' | 'declined';
    customer_message_code: 'ORDER_CONFIRMED' | 'VERIFY_IDENTITY' | 'PAYMENT_NOT_PROCESSED';
    total_latency_ms: number;
    fraud_scoring_ms: number | null;
    payment_auth_ms: null;
    fraud_timeout: boolean;
    fallback_used: boolean;
    fallback_policy: 'fail_open' | null;
    channel: 'owl-park-web';
    model_version: string | null;
    /** The park's own word for what happened (an outcome post: what became of a held order). */
    outcome: Outcome;
  };
}

export interface CheckFacts {
  transaction: string;
  request: string;
  receivedAt: number;
  scoringMs: number | null;
  timedOut: boolean;
  fallback: boolean;
  modelVersion: string | null;
}

export function responsePost(kind: ResponsePost['kind'], facts: CheckFacts, outcome: Outcome, sentAt: number): ResponsePost {
  const r = RESPONSE[outcome];
  const fallback = facts.fallback || outcome === 'released-after-24h';
  return {
    kind,
    response: {
      transaction_id: facts.transaction,
      request_id: facts.request,
      request_received_at: new Date(facts.receivedAt).toISOString(),
      response_sent_at: new Date(sentAt).toISOString(),
      response_status: r.status,
      customer_message_code: r.message,
      total_latency_ms: Math.max(0, sentAt - facts.receivedAt),
      fraud_scoring_ms: facts.scoringMs,
      payment_auth_ms: null,
      fraud_timeout: facts.timedOut,
      fallback_used: fallback,
      fallback_policy: fallback ? 'fail_open' : null,
      channel: 'owl-park-web',
      model_version: facts.modelVersion,
      outcome,
    },
  };
}

/** Post a checkout response back to the pipeline; a failure is logged, never in the buyer's way. */
export async function postResponse(cfg: FraudConfig, post: ResponsePost, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchFn(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify(post) });
    if (!res.ok) console.error('[owl-park] the fraud pipeline did not take a checkout response:', res.status);
  } catch (e) {
    console.error('[owl-park] the fraud pipeline did not take a checkout response:', e instanceof Error ? e.message : e);
  }
}
