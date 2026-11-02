/**
 * The owner's contacts (OP-192), the Worker's half: for every paid ticket order, the buyer's email and
 * the store's customer id, sent once to the `owl-park-log` function (apps/park-log), which keeps them
 * in the owner's `contacts` schema, apart from the park's anonymous `game` tables. The same order's
 * row, sent again (a webhook delivered twice), lands once.
 *
 * The park keeps none of it: the store says whose order it was as the paid webhook is answered, and
 * the row goes straight out, never into an outbox or a log line. The contact names the order by its
 * salted key (`orderKey`, the one the purchase rows carry), so the owner's own query joins a buyer to
 * the owl that claimed the order's tickets; an owl that never bought or claimed a ticket has no contact.
 * A row that does not go (the log down, the store not telling) is said in the Worker's log, without
 * the address, and the next delivery of the order's webhook sends it again.
 */
import { normalEmail } from '@owl-park/shared';
import { orderEmail } from './accounts';
import { orderKey, type LogConfig } from './collectLog';
import { adminQuery, type StoreConfig } from './storeApi';

/** A paid order's email and its customer's id: nothing else about the buyer is read. */
export const ORDER_CONTACT_QUERY = `query OwlParkOrderContact($id: ID!) {
  order(id: $id) {
    email
    customer { id }
  }
}`;

export interface OrderContact {
  email: string | null;
  /** The store's customer id (its digits), or null for a guest checkout or a store that will not say. */
  customer: string | null;
}

/**
 * Whose order it was, by the store's word. Should the store refuse the customer (an app allowed the
 * order's email but not its customer), the email alone is read the way OP-186 reads it.
 */
export async function orderContact(cfg: StoreConfig, order: string, fetchFn: typeof fetch = fetch): Promise<OrderContact> {
  try {
    const r = await adminQuery<{ order: { email?: string | null; customer?: { id?: string | null } | null } | null }>(cfg, ORDER_CONTACT_QUERY, { id: `gid://shopify/Order/${order}` }, fetchFn);
    const id = r.order?.customer?.id ?? '';
    const customer = id.slice(id.lastIndexOf('/') + 1);
    return { email: normalEmail(r.order?.email), customer: /^\d{1,20}$/.test(customer) ? customer : null };
  } catch (e) {
    const email = await orderEmail(cfg, order, fetchFn);
    if (email === null) throw e;
    return { email, customer: null };
  }
}

/** A contact as the log takes it (`kind: "contact"`): the one row the function keeps that names a person, and only in the contacts schema. */
export interface ContactRow {
  /** The store's order number, so the owner can find the order in the store. */
  shopify_order_id: string;
  /** The order's salted key: the purchase rows' `order_key`. */
  order_key: string;
  email: string;
  shopify_customer_id: string | null;
  ordered_at: string;
}

export async function contactRow(salt: string, order: string, contact: OrderContact & { email: string }, at: number): Promise<ContactRow> {
  return {
    shopify_order_id: order,
    order_key: await orderKey(salt, order),
    email: contact.email,
    shopify_customer_id: contact.customer,
    ordered_at: new Date(at).toISOString(),
  };
}

/** How long the send may take: the Worker has answered the store already. */
export const CONTACT_SEND_MS = 3000;

/**
 * Reads a paid order's buyer from the store and sends it to the owner's contacts. Throws when it did
 * not go (the caller logs it); a store order without an email (none on it, or the store will not say)
 * sends nothing and answers false.
 */
export async function sendContact(log: LogConfig, store: StoreConfig, order: string, at: number, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!/^\d{1,20}$/.test(order)) return false;
  const contact = await orderContact(store, order, fetchFn);
  if (!contact.email) return false;
  const row = await contactRow(log.salt, order, { ...contact, email: contact.email }, at);
  const res = await fetchFn(log.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${log.key}` },
    body: JSON.stringify({ kind: 'contact', rows: [row] }),
    signal: AbortSignal.timeout(CONTACT_SEND_MS),
  });
  if (!res.ok) throw new Error(`the park log answered ${res.status}`);
  return true;
}
