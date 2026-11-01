/**
 * The store side of tickets (C35). Shopify signs every webhook with the app's secret; the park
 * checks the signature before reading a byte of the order. An order's ticket lines, their kinds and
 * lengths, and the store's fraud rating come from one Admin API query (ORDER_QUERY), so the
 * products can change in the store without a code change: a ticket product has the product type
 * `Ticket` (C23) and metafields in the `owl_park` namespace: `ticket_kind` (day, night, annual,
 * opening-night or event) and `length_hours`. The Opening Night Ticket (C42) has its window in
 * `event_start` and, optionally, `event_end` (24 hours after the start without it), so a moved date
 * is a store edit. An event entry can ride on any product, with `ticket_kind` event and its window
 * in `event_start` / `event_end`.
 */
import { DEFAULT_LENGTH_MS, HOUR_MS, OPENING_NIGHT_MS, isTicketId, type TicketKind } from './tickets';

const enc = new TextEncoder();

function b64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Constant-time comparison of two strings of the same length. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Shopify's webhook signature: base64 of HMAC-SHA256 over the raw request body with the app's secret. */
export async function webhookSignature(secret: string, rawBody: ArrayBuffer | Uint8Array | string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = typeof rawBody === 'string' ? enc.encode(rawBody) : rawBody;
  return b64(await crypto.subtle.sign('HMAC', key, body));
}

export async function verifyWebhook(secret: string | undefined, rawBody: ArrayBuffer | Uint8Array | string, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  return same(await webhookSignature(secret, rawBody), header.trim());
}

/**
 * Whether a webhook is signed with one of the keys the park holds: the store's own key (webhooks
 * made in the store's admin) or the app's client secret (webhooks the app subscribes).
 */
export async function webhookSigned(keys: Array<string | undefined>, rawBody: ArrayBuffer | Uint8Array | string, header: string | null): Promise<boolean> {
  for (const key of keys) if (await verifyWebhook(key, rawBody, header)) return true;
  return false;
}

/** One query for everything the ledger needs about an order. */
export const ORDER_QUERY = `query OwlParkOrder($id: ID!) {
  order(id: $id) {
    id
    cancelledAt
    totalPriceSet { shopMoney { amount } }
    discountCodes
    customAttributes { key value }
    risk { recommendation assessments { riskLevel } }
    lineItems(first: 50) {
      nodes {
        id
        quantity
        originalTotalSet { shopMoney { amount } }
        discountAllocations { allocatedAmountSet { shopMoney { amount } } }
        product {
          productType
          kind: metafield(namespace: "owl_park", key: "ticket_kind") { value }
          hours: metafield(namespace: "owl_park", key: "length_hours") { value }
          start: metafield(namespace: "owl_park", key: "event_start") { value }
          end: metafield(namespace: "owl_park", key: "event_end") { value }
        }
      }
    }
  }
}`;

type Money = { shopMoney?: { amount?: string | null } | null } | null;

/** The shape of ORDER_QUERY's answer (only what is read). */
export interface AdminOrder {
  id: string;
  cancelledAt?: string | null;
  /** What the buyer paid, in the shop's currency: "0.0" for an order a discount made free. */
  totalPriceSet?: { shopMoney?: { amount?: string | null } | null } | null;
  /** The discount codes the buyer used. */
  discountCodes?: string[] | null;
  /** The cart's attributes (C42: `from_ticket`, set by the park's link to opening night's pass). */
  customAttributes?: Array<{ key: string; value?: string | null }> | null;
  risk?: { recommendation?: string | null; assessments?: Array<{ riskLevel?: string | null }> | null } | null;
  lineItems: {
    nodes: Array<{
      id: string;
      quantity: number;
      /** The line's price before any discount, and each discount the store put on it (a code's among them). */
      originalTotalSet?: Money;
      discountAllocations?: Array<{ allocatedAmountSet?: Money }> | null;
      product?: {
        productType?: string | null;
        kind?: { value?: string | null } | null;
        hours?: { value?: string | null } | null;
        start?: { value?: string | null } | null;
        end?: { value?: string | null } | null;
      } | null;
    }>;
  };
}

export interface TicketLine {
  /** The line item's id (its last path part: `gid://shopify/LineItem/123` -> `123`). */
  line: string;
  quantity: number;
  kind: TicketKind;
  /** How long a scanned ticket lasts; null where the store gives no hours and the kind has no default. */
  lengthMs: number | null;
  /** Windowed tickets (an event, opening night): the window, when the store has set it (ms). */
  validFrom: number | null;
  validUntil: number | null;
}

export const KINDS: readonly TicketKind[] = ['day', 'night', 'annual', 'event', 'opening-night'];

export function gidTail(gid: string): string {
  return gid.slice(gid.lastIndexOf('/') + 1);
}

/**
 * A date and time from a metafield, in ms. The store keeps a `date_time` without a time zone and
 * means GMT by it; one with an offset (`-05:00`) or `Z` is read as written.
 */
export function storeTime(v: string | null | undefined): number | null {
  const s = (v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) return null;
  const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}

/** A windowed kind's window from its product: the start, and the end or opening night's 24 hours. */
function windowOf(kind: TicketKind, start: string | null | undefined, end: string | null | undefined): [number, number] | null {
  const from = storeTime(start);
  const until = storeTime(end) ?? (kind === 'opening-night' && from !== null ? from + OPENING_NIGHT_MS : null);
  return from !== null && until !== null && until > from ? [from, until] : null;
}

/**
 * The order's ticket lines: a known `ticket_kind` on a `Ticket` product, or an event entry on any
 * product; everything else is merch.
 */
export function ticketLines(order: AdminOrder): TicketLine[] {
  const out: TicketLine[] = [];
  for (const li of order.lineItems.nodes) {
    const p = li.product;
    if (!p || !(li.quantity > 0)) continue;
    const kind = (p.kind?.value ?? '').trim().toLowerCase() as TicketKind;
    if (!KINDS.includes(kind)) continue;
    if (kind !== 'event' && (p.productType ?? '').trim().toLowerCase() !== 'ticket') continue;
    const hours = Number(p.hours?.value);
    const lengthMs = Number.isFinite(hours) && hours > 0 && hours <= 24 * 366 ? Math.round(hours * HOUR_MS) : DEFAULT_LENGTH_MS[kind];
    const window = kind === 'event' || kind === 'opening-night' ? windowOf(kind, p.start?.value, p.end?.value) : null;
    out.push({ line: gidTail(li.id), quantity: Math.min(li.quantity, 50), kind, lengthMs, validFrom: window?.[0] ?? null, validUntil: window?.[1] ?? null });
  }
  return out;
}

/**
 * Whether the store rated the order low risk, so its tickets are issued at once (C35); any other
 * order waits for the owner's fraud check. No rating yet counts as not low.
 */
export function lowRisk(order: AdminOrder): boolean {
  const r = order.risk;
  if (!r) return false;
  if ((r.recommendation ?? '').toUpperCase() !== 'ACCEPT') return false;
  const levels = (r.assessments ?? []).map((a) => (a.riskLevel ?? '').toUpperCase());
  return levels.length > 0 && levels.every((l) => l === 'LOW' || l === 'NONE');
}

/** A free order: a discount took its total to nothing (opening night's ticket, C42). */
export function freeOrder(order: AdminOrder): boolean {
  const amount = order.totalPriceSet?.shopMoney?.amount;
  return typeof amount === 'string' && amount.trim() !== '' && Number(amount) === 0;
}

/** The ticket a pass order came from: the `from_ticket` cart attribute the park's link sets (C42). */
export function fromTicketOf(order: AdminOrder): string | null {
  const v = (order.customAttributes ?? []).find((a) => a.key === 'from_ticket')?.value?.trim().toUpperCase() ?? '';
  return isTicketId(v) ? v : null;
}

/** The cart attribute the booth's checkout link sets (OP-175): a one-time token naming the owl the tickets go to. */
export const CHECKOUT_ATTRIBUTE = 'owl_checkout';

/** The booth's checkout token on an order (OP-175), when it is one the park could have made. */
export function checkoutTokenOf(order: AdminOrder): string | null {
  const v = (order.customAttributes ?? []).find((a) => a.key === CHECKOUT_ATTRIBUTE)?.value?.trim() ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
}

/** Whether the buyer used this discount code (the store's codes ignore case). */
export function usedCode(order: AdminOrder, code: string | undefined): boolean {
  const want = code?.trim().toLowerCase();
  return !!want && (order.discountCodes ?? []).some((c) => c.trim().toLowerCase() === want);
}

/** An amount in the shop's currency, in cents (0 where the store gives none). */
function cents(m: Money | undefined): number {
  const n = Number(m?.shopMoney?.amount ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * What the buyer paid for the order's lines of one kind, in cents before tax: each line's price less
 * every discount on it. Opening night's pass (OP-062): the annual pass at half price with the code.
 */
export function paidFor(order: AdminOrder, lines: readonly TicketLine[], kind: TicketKind): number {
  const want = new Set(lines.filter((l) => l.kind === kind).map((l) => l.line));
  let sum = 0;
  for (const li of order.lineItems.nodes) {
    if (!want.has(gidTail(li.id))) continue;
    const off = (li.discountAllocations ?? []).reduce((n, d) => n + cents(d.allocatedAmountSet), 0);
    sum += Math.max(0, cents(li.originalTotalSet) - off);
  }
  return sum;
}

/**
 * The ticket products on sale: the annual pass (the opening-night link puts its first variant in
 * the cart), the Day Ticket (the booth's checkout link, OP-175) and the Opening Night Ticket's
 * window (the booth says passes are half price inside it).
 */
export const CATALOGUE_QUERY = `query OwlParkCatalogue {
  products(first: 20, query: "product_type:Ticket AND status:active") {
    nodes {
      kind: metafield(namespace: "owl_park", key: "ticket_kind") { value }
      start: metafield(namespace: "owl_park", key: "event_start") { value }
      end: metafield(namespace: "owl_park", key: "event_end") { value }
      variants(first: 1) { nodes { id } }
    }
  }
}`;

export interface AdminCatalogue {
  products: {
    nodes: Array<{
      kind?: { value?: string | null } | null;
      start?: { value?: string | null } | null;
      end?: { value?: string | null } | null;
      variants?: { nodes: Array<{ id: string }> } | null;
    }>;
  };
}

export interface Catalogue {
  /** The annual pass's variant (the number at the end of its id), for the cart link. */
  passVariant: string | null;
  /** The Day Ticket's variant, for the booth's checkout link (OP-175). */
  dayVariant: string | null;
  /** Opening night's window (ms), from the Opening Night Ticket on sale. */
  opening: { from: number; until: number } | null;
}

export function catalogueOf(data: AdminCatalogue): Catalogue {
  let passVariant: string | null = null;
  let dayVariant: string | null = null;
  let opening: Catalogue['opening'] = null;
  for (const p of data.products.nodes) {
    const kind = (p.kind?.value ?? '').trim().toLowerCase();
    const v = gidTail(p.variants?.nodes[0]?.id ?? '');
    const variant = /^\d{1,20}$/.test(v) ? v : null;
    if (kind === 'annual' && passVariant === null) passVariant = variant;
    if (kind === 'day' && dayVariant === null) dayVariant = variant;
    if (kind === 'opening-night' && opening === null) {
      const w = windowOf('opening-night', p.start?.value, p.end?.value);
      if (w) opening = { from: w[0], until: w[1] };
    }
  }
  return { passVariant, dayVariant, opening };
}

/**
 * The cart link for opening night's pass (C42): the annual pass in the cart, the code that takes
 * half off it (OP-062), and the ticket it comes from as the cart attribute `from_ticket`.
 */
export function passCartLink(shop: string, variant: string, code: string, ticketId: string): string {
  const q = new URLSearchParams({ discount: code, 'attributes[from_ticket]': ticketId });
  return `https://${shop}/cart/${variant}:1?${q.toString()}`;
}

/**
 * The booth's checkout link (OP-175): one Day Ticket in the cart, and the owl's one-time checkout
 * token as a cart attribute, so the paid order's tickets land on that owl. The legacy /cart/ link
 * keeps cart attributes (the newer /buy/ links drop them). The owl itself is never in the link.
 */
export function ticketCartLink(shop: string, variant: string, token: string): string {
  const q = new URLSearchParams({ [`attributes[${CHECKOUT_ATTRIBUTE}]`]: token });
  return `https://${shop}/cart/${variant}:1?${q.toString()}`;
}
