/**
 * The store's Admin API (GraphQL), reached with the custom app's token that the owner sets up
 * (C35): `SHOPIFY_SHOP` (the shop's myshopify domain), `SHOPIFY_ADMIN_TOKEN` and
 * `SHOPIFY_WEBHOOK_SECRET`, all set with `wrangler secret put`. The park sends a ticket order's claim
 * link through the store's own shipping email (a fulfillment whose tracking link is the claim
 * link) and keeps a metaobject per ticket up to date, so the owner sees the same numbers in the
 * store. The park never reads the metaobjects back.
 */
import type { TicketStatus } from './tickets';

export const ADMIN_API_VERSION = '2026-10';
/** The metaobject type that mirrors a ticket in the store. */
export const TICKET_TYPE = 'owl_park_ticket';

export interface StoreConfig {
  shop: string;
  token: string;
}

export function storeConfig(env: { SHOPIFY_SHOP?: string; SHOPIFY_ADMIN_TOKEN?: string }): StoreConfig | null {
  const shop = env.SHOPIFY_SHOP?.trim() ?? '';
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim() ?? '';
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) && token ? { shop, token } : null;
}

export class StoreError extends Error {}

/** One Admin API call; user errors of a mutation come back as a StoreError. */
export async function adminQuery<T>(cfg: StoreConfig, query: string, variables: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<T> {
  const res = await fetchFn(`https://${cfg.shop}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new StoreError(`store answered ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (body.errors?.length) throw new StoreError(body.errors.map((e) => e.message ?? 'error').join('; '));
  if (!body.data) throw new StoreError('store sent no data');
  return body.data;
}

export const FULFILLMENT_ORDERS_QUERY = `query OwlParkFulfillmentOrders($id: ID!) {
  order(id: $id) {
    fulfillmentOrders(first: 10) {
      nodes { id status lineItems(first: 50) { nodes { id remainingQuantity lineItem { id } } } }
    }
  }
}`;

export interface FulfillmentOrders {
  order: { fulfillmentOrders: { nodes: Array<{ id: string; status: string; lineItems: { nodes: Array<{ id: string; remainingQuantity: number; lineItem: { id: string } }> } }> } } | null;
}

export const FULFILL_MUTATION = `mutation OwlParkSendTickets($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status }
    userErrors { field message }
  }
}`;

/** What is left to fulfil of the order's ticket lines, grouped by fulfillment order. */
function openTicketItems(fo: FulfillmentOrders, ticketLineIds: string[]) {
  const want = new Set(ticketLineIds.map((l) => `gid://shopify/LineItem/${l}`));
  const groups = [];
  for (const o of fo.order?.fulfillmentOrders.nodes ?? []) {
    if (o.status !== 'OPEN' && o.status !== 'IN_PROGRESS') continue;
    const items = o.lineItems.nodes.filter((li) => want.has(li.lineItem.id) && li.remainingQuantity > 0).map((li) => ({ id: li.id, quantity: li.remainingQuantity }));
    if (items.length) groups.push({ fulfillmentOrderId: o.id, fulfillmentOrderLineItems: items });
  }
  return groups;
}

/** Whether any of the order's ticket lines still waits to be fulfilled (the claim link has not gone out). */
export function ticketLinesOpen(fo: FulfillmentOrders, ticketLineIds: string[]): boolean {
  return openTicketItems(fo, ticketLineIds).length > 0;
}

/**
 * The fulfillment that sends the claim link: only the order's ticket lines (merch ships on its own),
 * with the tickets' IDs as tracking numbers and the claim link as the tracking link, and the
 * store's shipping email switched on. Null when nothing of those lines is left to fulfil.
 */
export function fulfillmentInput(fo: FulfillmentOrders, ticketLineIds: string[], ticketIds: string[], claimUrl: string): Record<string, unknown> | null {
  const groups = openTicketItems(fo, ticketLineIds);
  if (!groups.length) return null;
  return {
    notifyCustomer: true,
    trackingInfo: { company: 'Owl Park', numbers: ticketIds, url: claimUrl },
    lineItemsByFulfillmentOrder: groups,
  };
}

export const TICKET_UPSERT_MUTATION = `mutation OwlParkTicket($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
    metaobject { id }
    userErrors { field message }
  }
}`;

export interface TicketMirror {
  id: string;
  kind: string;
  status: TicketStatus;
  order: string;
  firstScan: number | null;
  validUntil: number | null;
  votesCast: number;
  /** Whether today's vote is still free. */
  voteToday: 'ready' | 'used' | 'none';
}

const iso = (ms: number | null) => (ms === null ? '' : new Date(ms).toISOString());

/** The metaobject for one ticket (its handle is the ticket ID in lower case). */
export function ticketUpsert(t: TicketMirror): Record<string, unknown> {
  return {
    handle: { type: TICKET_TYPE, handle: t.id.toLowerCase() },
    metaobject: {
      fields: [
        { key: 'ticket_id', value: t.id },
        { key: 'kind', value: t.kind },
        { key: 'status', value: t.status },
        { key: 'order_id', value: t.order },
        { key: 'first_scan', value: iso(t.firstScan) },
        { key: 'valid_until', value: iso(t.validUntil) },
        { key: 'votes_cast', value: String(t.votesCast) },
        { key: 'todays_vote', value: t.voteToday },
      ],
    },
  };
}
