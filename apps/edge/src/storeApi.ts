/**
 * The store's Admin API (GraphQL), reached through the app the owner sets up for the park (C35),
 * with secrets set by `wrangler secret put`: `SHOPIFY_SHOP` (the shop's myshopify domain) and the
 * app's sign-in. An app made in the Dev Dashboard (every new app since 2026) gives a client ID and
 * secret (`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`), which the park trades with the store for a
 * token that lasts a day; an app made in the store's admin before then has a fixed token
 * (`SHOPIFY_ADMIN_TOKEN`). The park sends a ticket order's claim link through the store's own
 * shipping email (a fulfillment whose tracking link is the claim link) and keeps a metaobject per
 * ticket up to date, so the owner sees the same numbers in the store. The park never reads the
 * metaobjects back.
 */
import type { TicketStatus } from './tickets';

export const ADMIN_API_VERSION = '2026-10';
/** The metaobject type that mirrors a ticket in the store. */
export const TICKET_TYPE = 'owl_park_ticket';

export interface StoreConfig {
  shop: string;
  /** The fixed token of an app made in the store's admin. */
  token?: string;
  /** Or a Dev Dashboard app's client credentials, traded for a token when one is needed. */
  client?: { id: string; secret: string };
  /** Browser tests only: a stand-in store on this machine, reached instead of the shop. */
  origin?: string;
}

type StoreKeys = { SHOPIFY_SHOP?: string; SHOPIFY_ADMIN_TOKEN?: string; SHOPIFY_CLIENT_ID?: string; SHOPIFY_CLIENT_SECRET?: string; SHOPIFY_TEST_ORIGIN?: string };

/** The store, once its domain and one way to sign in are set; a fixed token wins over client credentials. */
export function storeConfig(env: StoreKeys): StoreConfig | null {
  const shop = env.SHOPIFY_SHOP?.trim() ?? '';
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return null;
  // A stand-in store for the browser tests, and only ever one on this machine.
  const test = env.SHOPIFY_TEST_ORIGIN?.trim() ?? '';
  const origin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(test) ? { origin: test } : {};
  const token = env.SHOPIFY_ADMIN_TOKEN?.trim() ?? '';
  if (token) return { shop, token, ...origin };
  const id = env.SHOPIFY_CLIENT_ID?.trim() ?? '';
  const secret = env.SHOPIFY_CLIENT_SECRET?.trim() ?? '';
  return id && secret ? { shop, client: { id, secret }, ...origin } : null;
}

/** Where the store's Admin API answers. */
const base = (cfg: StoreConfig) => cfg.origin ?? `https://${cfg.shop}`;

export class StoreError extends Error {}

/** Tokens traded for client credentials, by shop and app, with the time to trade again. */
const traded = new Map<string, { token: string; until: number }>();
/** A traded token is replaced this long before it runs out (the store's last a day). */
const TRADE_EARLY_MS = 10 * 60 * 1000;

/** The token for the store's Admin API: the fixed one, or one traded for the app's credentials. */
async function accessToken(cfg: StoreConfig, fetchFn: typeof fetch, fresh = false): Promise<string> {
  if (cfg.token) return cfg.token;
  if (!cfg.client) throw new StoreError('the store has no app to sign in with');
  const key = `${cfg.shop} ${cfg.client.id}`;
  const held = traded.get(key);
  if (held && !fresh && held.until > Date.now()) return held.token;
  const res = await fetchFn(`${base(cfg)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.client.id, client_secret: cfg.client.secret, grant_type: 'client_credentials' }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
  if (!res.ok || typeof body.access_token !== 'string' || !body.access_token) {
    // The store's short reason (shop_not_permitted: the app and the store are in different organizations).
    const why = typeof body.error === 'string' && /^[a-z_]{1,64}$/.test(body.error) ? `: ${body.error}` : '';
    throw new StoreError(`store refused the app's sign-in (${res.status}${why})`);
  }
  const lifeMs = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in * 1000 : 60 * 60 * 1000;
  traded.set(key, { token: body.access_token, until: Date.now() + Math.max(lifeMs - TRADE_EARLY_MS, lifeMs / 2) });
  return body.access_token;
}

async function adminCall<T>(cfg: StoreConfig, query: string, variables: Record<string, unknown>, fetchFn: typeof fetch): Promise<{ data?: T | null; errors?: Array<{ message?: string }> }> {
  const call = async (token: string) =>
    fetchFn(`${base(cfg)}/admin/api/${ADMIN_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
  let res = await call(await accessToken(cfg, fetchFn));
  // A traded token the store stopped taking (a new client secret, or the app put in again): trade once more.
  if (res.status === 401 && cfg.client) res = await call(await accessToken(cfg, fetchFn, true));
  if (!res.ok) throw new StoreError(`store answered ${res.status}`);
  return (await res.json()) as { data?: T | null; errors?: Array<{ message?: string }> };
}

const messages = (errors: Array<{ message?: string }>) => errors.map((e) => e.message ?? 'error');

/** One Admin API call; user errors of a mutation come back as a StoreError. */
export async function adminQuery<T>(cfg: StoreConfig, query: string, variables: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<T> {
  const body = await adminCall<T>(cfg, query, variables, fetchFn);
  if (body.errors?.length) throw new StoreError(messages(body.errors).join('; '));
  if (!body.data) throw new StoreError('store sent no data');
  return body.data;
}

/**
 * One Admin API query that may ask for a field the store will not let the app read: that field
 * comes back null, with the store's reason in `refused`, and the rest of the answer stands.
 */
export async function adminQueryPartial<T>(cfg: StoreConfig, query: string, variables: Record<string, unknown>, fetchFn: typeof fetch = fetch): Promise<{ data: T; refused: string[] }> {
  const body = await adminCall<T>(cfg, query, variables, fetchFn);
  const refused = messages(body.errors ?? []);
  if (!body.data) throw new StoreError(refused.join('; ') || 'store sent no data');
  return { data: body.data, refused };
}

/**
 * The scopes the park's calls need: an order's lines and risk (and its ticket list, written to the
 * order), the ticket products, the fulfillment that sends the claim link, and the tickets' copies.
 */
export const NEEDED_SCOPES = ['read_orders', 'write_orders', 'read_products', 'read_merchant_managed_fulfillment_orders', 'write_merchant_managed_fulfillment_orders', 'write_metaobjects'] as const;

export const STORE_CHECK_QUERY = `query OwlParkStoreCheck {
  shop { name }
  currentAppInstallation { accessScopes { handle } }
}`;

/** One order's number: orders hold customer data, which an app reads only once the store lets it. */
export const ORDERS_CHECK_QUERY = `query OwlParkOrdersCheck {
  orders(first: 1) { nodes { id } }
}`;

/** The owner's check of the store setup (`/api/admin/store`): which secrets are set, never their values. */
export interface StoreCheck {
  /** SHOPIFY_SHOP, when it is a myshopify domain. */
  shop: string | null;
  /** How the park signs in to the store: a Dev Dashboard app, an admin-made app's fixed token, or not yet. */
  signIn: 'app' | 'token' | null;
  /** The webhook signatures the park can check: the store's own key, and the app's client secret. */
  webhooks: { storeKey: boolean; appSecret: boolean };
  /** The store's name, the needed scopes the app lacks, and whether it may read orders, once it answered. */
  store?: { name: string; missing: string[]; orders: boolean };
  error?: string;
}

type StoreEnv = StoreKeys & { SHOPIFY_WEBHOOK_SECRET?: string };

export async function storeCheck(env: StoreEnv, fetchFn: typeof fetch = fetch): Promise<StoreCheck> {
  const cfg = storeConfig(env);
  const given = env.SHOPIFY_SHOP?.trim() ?? '';
  const out: StoreCheck = {
    shop: storeConfig({ SHOPIFY_SHOP: given, SHOPIFY_ADMIN_TOKEN: 'x' })?.shop ?? null,
    signIn: cfg?.token ? 'token' : cfg ? 'app' : null,
    webhooks: { storeKey: !!env.SHOPIFY_WEBHOOK_SECRET?.trim(), appSecret: !!env.SHOPIFY_CLIENT_SECRET?.trim() },
  };
  if (!cfg) {
    out.error = given && !out.shop ? 'SHOPIFY_SHOP is not a myshopify domain (name.myshopify.com, nothing more)' : 'the store is not set up';
    return out;
  }
  try {
    const data = await adminQuery<{ shop: { name: string }; currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(cfg, STORE_CHECK_QUERY, {}, fetchFn);
    const have = new Set(data.currentAppInstallation.accessScopes.map((s) => s.handle));
    // A write scope brings its read scope with it.
    const missing = NEEDED_SCOPES.filter((s) => !have.has(s) && !(s.startsWith('read_') && have.has(`write_${s.slice(5)}`)));
    out.store = { name: data.shop.name, missing, orders: false };
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'the store did not answer';
    return out;
  }
  if (out.store.missing.includes('read_orders')) return out;
  try {
    await adminQuery(cfg, ORDERS_CHECK_QUERY, {}, fetchFn);
    out.store.orders = true;
  } catch (e) {
    // The store's own words: an app not yet allowed customer data is told so here.
    out.error = e instanceof Error ? e.message : 'the store did not answer';
  }
  return out;
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
