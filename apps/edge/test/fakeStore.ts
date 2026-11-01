/**
 * The store as the tests meet it (C35): one order of tickets (line 11, two day tickets) and a mug
 * (line 12), answering the Admin API's queries and mutations as the store does. Shared by the
 * webhook tests and the Worker's log tests (OP-134).
 */
import type { AdminOrder } from '../src/shopify';

export function seq(): (n: number) => Uint8Array {
  let x = 23;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'PENDING';

/** A store with one order of tickets (line 11, two day tickets) and a mug (line 12). */
export class FakeStore {
  risk: Risk[] = ['LOW'];
  ticketsLeft = 2;
  failFulfil = 0;
  /** How long the store takes to make a fulfillment (and send its email). */
  fulfilDelayMs = 0;
  readonly calls: Array<{ op: string; variables: Record<string, unknown> }> = [];
  readonly sent: Array<Record<string, unknown>> = [];
  /** The cart's attributes on the order (OP-175: the booth's checkout token). */
  attributes: Array<{ key: string; value: string }> = [];

  order(): AdminOrder {
    const risk = this.risk.length > 1 ? this.risk.shift()! : this.risk[0]!;
    return {
      id: 'gid://shopify/Order/1001',
      cancelledAt: null,
      customAttributes: this.attributes,
      risk: { recommendation: risk === 'LOW' ? 'ACCEPT' : risk === 'PENDING' ? 'NONE' : 'INVESTIGATE', assessments: [{ riskLevel: risk }] },
      lineItems: {
        nodes: [
          { id: 'gid://shopify/LineItem/11', quantity: 2, product: { productType: 'Ticket', kind: { value: 'day' }, hours: null, start: null, end: null } },
          { id: 'gid://shopify/LineItem/12', quantity: 1, product: { productType: 'Mug', kind: null, hours: null, start: null, end: null } },
        ],
      },
    };
  }

  readonly fetch = (async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body)) as { query: string; variables: Record<string, unknown> };
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)![1]!;
    this.calls.push({ op, variables });
    const data = (d: unknown) => Response.json({ data: d });
    switch (op) {
      case 'OwlParkOrder':
        return data({ order: variables['id'] === 'gid://shopify/Order/1001' ? this.order() : null });
      case 'OwlParkFulfillmentOrders':
        return data({
          order: {
            fulfillmentOrders: {
              nodes: [
                {
                  id: 'gid://shopify/FulfillmentOrder/7',
                  status: this.ticketsLeft ? 'OPEN' : 'CLOSED',
                  lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/71', remainingQuantity: this.ticketsLeft, lineItem: { id: 'gid://shopify/LineItem/11' } }] },
                },
                { id: 'gid://shopify/FulfillmentOrder/8', status: 'OPEN', lineItems: { nodes: [{ id: 'gid://shopify/FulfillmentOrderLineItem/81', remainingQuantity: 1, lineItem: { id: 'gid://shopify/LineItem/12' } }] } },
              ],
            },
          },
        });
      case 'OwlParkSendTickets':
        if (this.failFulfil > 0) {
          this.failFulfil--;
          return new Response('busy', { status: 503 });
        }
        if (this.fulfilDelayMs) await new Promise((r) => setTimeout(r, this.fulfilDelayMs));
        // As the store does: the ticket line can be fulfilled once.
        if (!this.ticketsLeft) return data({ fulfillmentCreate: { fulfillment: null, userErrors: [{ field: ['fulfillment'], message: 'Fulfillment order has no remaining quantity' }] } });
        this.sent.push(variables['fulfillment'] as Record<string, unknown>);
        this.ticketsLeft = 0;
        return data({ fulfillmentCreate: { fulfillment: { id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS' }, userErrors: [] } });
      case 'OwlParkCatalogue':
        // The Day Ticket on sale (OP-175's checkout link puts its variant in the cart).
        return data({ products: { nodes: [{ kind: { value: 'day' }, start: null, end: null, variants: { nodes: [{ id: 'gid://shopify/ProductVariant/100' }] } }] } });
      case 'OwlParkTicket': {
        const handle = (variables['handle'] as { handle: string }).handle;
        return data({ metaobjectUpsert: { metaobject: { id: `gid://shopify/Metaobject/${handle}` }, userErrors: [] } });
      }
      case 'OwlParkOrderTickets':
        return data({ metafieldsSet: { metafields: [{ id: 'gid://shopify/Metafield/1' }], userErrors: [] } });
      default:
        return data(null);
    }
  }) as typeof fetch;

  ops(): string[] {
    return this.calls.map((c) => c.op);
  }
}
