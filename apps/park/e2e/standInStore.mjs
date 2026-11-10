/**
 * A stand-in for the store's Admin API in the browser tests (the room server reaches it through
 * SHOPIFY_TEST_ORIGIN, never a real store). It answers the park's queries from orders the tests
 * put in it, keeps the claim link each fulfillment would have emailed, and lists the ticket
 * products on sale: an annual pass, and an Opening Night Ticket whose night is on. It stands in for
 * the park's mail sender too (MAIL_TEST_ORIGIN, OP-139): it keeps each mail instead of sending it.
 * And for Google's sign-in page and token endpoint (GOOGLE_TEST_ORIGIN, OP-313): the sign-in page
 * sends the browser straight back with a code for the email a test set, or with the player's no.
 *
 * Tests use:
 *   POST /test/orders  {id, order}  an order, as the Admin API would answer for it
 *   GET  /test/sent?order=<id>      the claim link the store would have emailed, and how many times
 *   POST /test/night   {on}         the Opening Night Ticket on sale, its night on (off at first)
 *   GET  /test/mail?to=<email>      the last mail the park sent to that address, or null
 *   POST /test/fault   {mode, op?, order?, times?, ms?}  the store's next answers to the park fail
 *                      (the chaos harness, OP-132): 'error' answers HTTP 500, 'hang' gives the answer
 *                      `ms` late (what it did is done at once, as a slow network would have it); `op`
 *                      and `order` narrow it to one query about one order, op 'log' to the log below.
 *                      {clear: true} ends them.
 *   POST /log                       the collection log (PARK_LOG_URL, OP-107) as the log function takes it
 *   GET  /test/log                  what it took: rows by kind, each event once, sends refused
 *   POST /test/google  {email?, deny?}  who the next Google sign-ins are (deny: the player says no)
 *   GET  /o/oauth2/v2/auth             Google's sign-in page: back to redirect_uri with a code and the state
 *   POST /token                        Google's token endpoint: the code, this client and the PKCE verifier
 *                                      checked, an ID token for that email (unsigned: the park relies on TLS)
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8790);
const HOUR = 3_600_000;
const orders = new Map();
const sent = new Map();
/** The last mail to each address, as the park sent it to the mail sender's API. */
const mails = new Map();
const fulfilled = new Set();
/** How many times each order's claim link was emailed. */
const emailed = new Map();
/** Faults on cue, each for one answer, taken in turn by the first answer they match. */
let faults = [];
/** What the collection log took: batches, sends refused, rows by kind (each event once), events sent twice. */
const logged = { batches: 0, refused: 0, rows: {}, ids: new Set(), twice: 0 };
let night = false;
/** Google's sign-in (OP-313): who the next sign-ins are, and the codes given, each good once. */
let googleNext = { email: null, deny: false };
const googleCodes = new Map();
const b64url = (buf) => Buffer.from(buf).toString('base64url');

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
    case 'OwlParkOrderEmail':
      return { order: orders.has(id) ? { email: orders.get(id).email ?? null } : null };
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
      emailed.set(order, (emailed.get(order) ?? 0) + 1);
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

async function text(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

async function body(req) {
  const raw = await text(req);
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
      const at = faults.findIndex((f) => (!f.op || f.op === op) && (!f.order || f.order === tail(variables?.id)));
      const fault = at >= 0 ? faults.splice(at, 1)[0] : null;
      if (fault?.mode === 'error') return send(res, 500, { errors: [{ message: 'stand-in store fault' }] });
      const data = answer(op, variables ?? {});
      if (fault?.mode === 'hang') await new Promise((r) => setTimeout(r, fault.ms ?? 10_000));
      return send(res, 200, { data });
    }
    if (req.method === 'POST' && url.pathname === '/test/orders') {
      const { id, order } = await body(req);
      orders.set(String(id), order);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/test/sent') {
      const order = url.searchParams.get('order') ?? '';
      return send(res, 200, { link: sent.get(order) ?? null, times: emailed.get(order) ?? 0 });
    }
    if (req.method === 'POST' && url.pathname === '/test/fault') {
      const f = await body(req);
      if (f.clear) faults = [];
      else for (let i = 0; i < (f.times ?? 1); i++) faults.push({ mode: f.mode, op: f.op, order: f.order === undefined ? undefined : String(f.order), ms: f.ms });
      return send(res, 200, { faults: faults.length });
    }
    if (req.method === 'POST' && url.pathname === '/test/night') {
      night = (await body(req)).on === true;
      return send(res, 200, { night });
    }
    if (req.method === 'POST' && url.pathname === '/emails') {
      const mail = await body(req);
      for (const to of mail.to ?? []) mails.set(String(to), mail);
      return send(res, 200, { id: `mail-${mails.size}` });
    }
    if (req.method === 'GET' && url.pathname === '/test/mail') return send(res, 200, { mail: mails.get(url.searchParams.get('to') ?? '') ?? null });
    if (req.method === 'POST' && url.pathname === '/log') {
      const at = faults.findIndex((f) => f.op === 'log');
      const fault = at >= 0 ? faults.splice(at, 1)[0] : null;
      if (fault?.mode === 'error') {
        logged.refused += 1;
        return send(res, 500, { error: 'stand-in log fault' });
      }
      const { kind, rows = [] } = await body(req);
      if (fault?.mode === 'hang') await new Promise((r) => setTimeout(r, fault.ms ?? 10_000));
      logged.batches += 1;
      for (const row of rows) {
        if (logged.ids.has(row.event_id)) logged.twice += 1;
        else {
          logged.ids.add(row.event_id);
          logged.rows[kind] = (logged.rows[kind] ?? 0) + 1;
        }
      }
      return send(res, 200, { ok: true, rows: rows.length });
    }
    if (req.method === 'GET' && url.pathname === '/test/log') return send(res, 200, { batches: logged.batches, refused: logged.refused, rows: logged.rows, ids: logged.ids.size, twice: logged.twice });
    if (req.method === 'POST' && url.pathname === '/test/google') {
      googleNext = { email: null, deny: false, ...(await body(req)) };
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/o/oauth2/v2/auth') {
      const p = url.searchParams;
      const to = new URL(p.get('redirect_uri') ?? '');
      to.searchParams.set('state', p.get('state') ?? '');
      if (googleNext.deny || !googleNext.email || p.get('code_challenge_method') !== 'S256' || p.get('scope') !== 'openid email') to.searchParams.set('error', 'access_denied');
      else {
        const code = `4/${randomBytes(12).toString('hex')}`;
        googleCodes.set(code, { email: googleNext.email, client: p.get('client_id'), redirect: p.get('redirect_uri'), challenge: p.get('code_challenge'), nonce: p.get('nonce') });
        to.searchParams.set('code', code);
      }
      res.writeHead(302, { Location: to.toString() });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      const form = new URLSearchParams(await text(req));
      const given = googleCodes.get(form.get('code') ?? '');
      googleCodes.delete(form.get('code') ?? '');
      const challenge = b64url(createHash('sha256').update(form.get('code_verifier') ?? '').digest());
      if (!given || given.client !== form.get('client_id') || given.redirect !== form.get('redirect_uri') || given.challenge !== challenge || !form.get('client_secret')) return send(res, 400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      const claims = { iss: 'https://accounts.google.com', aud: given.client, azp: given.client, sub: '1', email: given.email, email_verified: true, iat: now, exp: now + 3600, nonce: given.nonce };
      return send(res, 200, { access_token: 'stand-in', token_type: 'Bearer', id_token: `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify(claims))}.c2ln` });
    }
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
}).listen(port, () => console.log(`stand-in store on :${port}`));
