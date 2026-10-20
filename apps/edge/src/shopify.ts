/**
 * The store side of tickets (C35). Shopify signs every webhook with the app's secret; the park
 * checks the signature before reading a byte of the order. An order's ticket lines, their kinds and
 * lengths, and the store's fraud rating come from one Admin API query (ORDER_QUERY), so the
 * products can change in the store without a code change: a ticket product has the product type
 * `Ticket` (C23) and metafields in the `owl_park` namespace: `ticket_kind` (day, night, annual or
 * event) and `length_hours`. An event entry (opening night, which comes with the Drop-1 pin) can
 * ride on any product, with `ticket_kind` event and its window in `event_start` / `event_end`.
 */
import { DEFAULT_LENGTH_MS, HOUR_MS, type TicketKind } from './tickets';

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

/** One query for everything the ledger needs about an order. */
export const ORDER_QUERY = `query OwlParkOrder($id: ID!) {
  order(id: $id) {
    id
    cancelledAt
    risk { recommendation assessments { riskLevel } }
    lineItems(first: 50) {
      nodes {
        id
        quantity
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

/** The shape of ORDER_QUERY's answer (only what is read). */
export interface AdminOrder {
  id: string;
  cancelledAt?: string | null;
  risk?: { recommendation?: string | null; assessments?: Array<{ riskLevel?: string | null }> | null } | null;
  lineItems: {
    nodes: Array<{
      id: string;
      quantity: number;
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
  /** Event entries: the window, when the store has set it (ms). */
  validFrom: number | null;
  validUntil: number | null;
}

const KINDS: readonly TicketKind[] = ['day', 'night', 'annual', 'event'];

export function gidTail(gid: string): string {
  return gid.slice(gid.lastIndexOf('/') + 1);
}

function time(v: string | null | undefined): number | null {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
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
    const [from, until] = kind === 'event' ? [time(p.start?.value), time(p.end?.value)] : [null, null];
    const window = from !== null && until !== null && until > from;
    out.push({ line: gidTail(li.id), quantity: Math.min(li.quantity, 50), kind, lengthMs, validFrom: window ? from : null, validUntil: window ? until : null });
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
