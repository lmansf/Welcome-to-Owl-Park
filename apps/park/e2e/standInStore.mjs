/**
 * A stand-in for the store's Admin API in the browser tests (the room server reaches it through
 * SHOPIFY_TEST_ORIGIN, never a real store). It answers the park's queries from orders the tests
 * put in it, keeps the claim link each fulfillment would have emailed, and lists the ticket
 * products on sale: an annual pass, and an Opening Night Ticket whose night is on.
 *
 * Tests use:
 *   POST /test/orders  {id, order}  an order, as the Admin API would answer for it
 *   GET  /test/sent?order=<id>      the claim link the store would have emailed
 *   POST /test/night   {on}         the Opening Night Ticket on sale, its night on (off at first)
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8790);
const HOUR = 3_600_000;
const orders = new Map();
const sent = new Map();
const fulfilled = new Set();
let night = false;

const PRODUCTS = [
  { kind: { value: 'day' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/41001' }] } },
  { kind: { value: 'annual' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/41002' }] } },
];
/** The Opening Night Ticket, its night begun an hour ago (it lasts its 24 hours). */
const nightTicket = () => ({ kind: { value: 'opening-night' }, start: { value: new Date(Date.now() - HOUR).toISOString() }, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/41003' }] } });

const tail = (gid) => String(gid ?? '').slice(String(gid ?? '').lastIndexOf('/') + 1);

function answer(op, variables) {
  const id = tail(variables.id);
  switch (op) {
    case 'OwlParkOrder':
      return { order: orders.get(id) ?? null };
    case 'OwlParkFulfillmentOrders': {
      const order = orders.get(id);
      if (!order) return { order: null };
      const done = fulfilled.has(id);
      const nodes = order.lineItems.nodes.map((li) => ({ id: `${li.id}0`, remainingQuantity: done ? 0 : li.quantity, lineItem: { id: li.id } }));
      return { order: { fulfillmentOrders: { nodes: [{ id: `gid://shopify/FulfillmentOrder/${id}`, status: done ? 'CLOSED' : 'OPEN', lineItems: { nodes } }] } } };
    }
    case 'OwlParkSendTickets': {
      const f = variables.fulfillment;
      const order = tail(f.lineItemsByFulfillmentOrder[0].fulfillmentOrderId);
      fulfilled.add(order);
      sent.set(order, f.trackingInfo.url);
      return { fulfillmentCreate: { fulfillment: { id: `gid://shopify/Fulfillment/${order}`, status: 'SUCCESS' }, userErrors: [] } };
    }
    case 'OwlParkCatalogue':
      return { products: { nodes: night ? [...PRODUCTS, nightTicket()] : PRODUCTS } };
    case 'OwlParkTicket':
      return { metaobjectUpsert: { metaobject: { id: `gid://shopify/Metaobject/${variables.handle.handle}` }, userErrors: [] } };
    case 'OwlParkOrderTickets':
      return { metafieldsSet: { metafields: [{ id: 'gid://shopify/Metafield/1' }], userErrors: [] } };
    case 'OwlParkStoreCheck':
      return { shop: { name: 'Owl Park test store' }, currentAppInstallation: { accessScopes: [] } };
    default:
      return null;
  }
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const send = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    if (req.method === 'POST' && url.pathname.endsWith('/graphql.json')) {
      const { query, variables } = await body(req);
      const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? '';
      return send(res, 200, { data: answer(op, variables ?? {}) });
    }
    if (req.method === 'POST' && url.pathname === '/test/orders') {
      const { id, order } = await body(req);
      orders.set(String(id), order);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/test/sent') return send(res, 200, { link: sent.get(url.searchParams.get('order') ?? '') ?? null });
    if (req.method === 'POST' && url.pathname === '/test/night') {
      night = (await body(req)).on === true;
      return send(res, 200, { night });
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(port, () => console.log(`stand-in store on :${port}`));
