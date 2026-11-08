import { describe, expect, it } from 'vitest';
import { gidTail, lowRisk, ticketLines, verifyWebhook, webhookSignature, webhookSigned, type AdminOrder } from '../src/shopify';
import { DEFAULT_LENGTH_MS, HOUR_MS } from '../src/tickets';

describe('webhook signatures', () => {
  const secret = 'test-app-secret';
  const body = '{"id":820982911946154508,"admin_graphql_api_id":"gid://shopify/Order/820982911946154508"}';

  it('accept the store’s signature over the exact body and nothing else', async () => {
    const sig = await webhookSignature(secret, body);
    expect(await verifyWebhook(secret, body, sig)).toBe(true);
    expect(await verifyWebhook(secret, new TextEncoder().encode(body), sig)).toBe(true);
    expect(await verifyWebhook(secret, body + ' ', sig)).toBe(false);
    expect(await verifyWebhook('another-secret', body, sig)).toBe(false);
    expect(await verifyWebhook(secret, body, null)).toBe(false);
    expect(await verifyWebhook(undefined, body, sig)).toBe(false);
    expect(await verifyWebhook(secret, body, sig.slice(0, -2))).toBe(false);
  });

  it('accept either key the park holds: the store’s own, or the app’s client secret', async () => {
    const byApp = await webhookSignature('app-client-secret', body);
    expect(await webhookSigned(['store-key', 'app-client-secret'], body, byApp)).toBe(true);
    expect(await webhookSigned([undefined, 'app-client-secret'], body, byApp)).toBe(true);
    expect(await webhookSigned(['store-key', undefined], body, byApp)).toBe(false);
    expect(await webhookSigned([], body, byApp)).toBe(false);
  });
});

const line = (id: number, quantity: number, productType: string | null, kind?: string, hours?: string, start?: string, end?: string) => ({
  id: `gid://shopify/LineItem/${id}`,
  quantity,
  product: productType === null ? null : {
    productType,
    kind: kind === undefined ? null : { value: kind },
    hours: hours === undefined ? null : { value: hours },
    start: start === undefined ? null : { value: start },
    end: end === undefined ? null : { value: end },
  },
});

describe('an order’s ticket lines', () => {
  const order: AdminOrder = {
    id: 'gid://shopify/Order/1001',
    risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }] },
    lineItems: {
      nodes: [
        line(1, 2, 'Ticket', 'day'),
        line(2, 1, 'Ticket', 'night', '9'),
        line(3, 1, 'Pin', 'day'),
        line(4, 1, 'Ticket', 'annual'),
        line(5, 1, 'Ticket', 'mystery'),
        line(6, 1, null),
        line(7, 1, ' ticket ', 'EVENT'),
        line(8, 1, 'Pin', 'event', undefined, '2026-12-01T23:00:00Z', '2026-12-02T05:00:00Z'),
        line(9, 1, 'Pin'),
      ],
    },
  };

  it('keep the Ticket products with a known kind, and their lengths', () => {
    const open = { validFrom: null, validUntil: null };
    expect(ticketLines(order)).toEqual([
      { line: '1', quantity: 2, kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, ...open },
      { line: '2', quantity: 1, kind: 'night', lengthMs: 9 * HOUR_MS, ...open },
      { line: '4', quantity: 1, kind: 'annual', lengthMs: DEFAULT_LENGTH_MS.annual, ...open },
      { line: '7', quantity: 1, kind: 'event', lengthMs: null, ...open },
      // The opening-night entry that comes with the pin: any product, its window from the store.
      { line: '8', quantity: 1, kind: 'event', lengthMs: null, validFrom: Date.parse('2026-12-01T23:00:00Z'), validUntil: Date.parse('2026-12-02T05:00:00Z') },
    ]);
    expect(gidTail('gid://shopify/LineItem/42')).toBe('42');
  });

  it('issue at once only for orders the store rated low risk', () => {
    expect(lowRisk(order)).toBe(true);
    expect(lowRisk({ ...order, risk: { recommendation: 'ACCEPT', assessments: [{ riskLevel: 'LOW' }, { riskLevel: 'MEDIUM' }] } })).toBe(false);
    expect(lowRisk({ ...order, risk: { recommendation: 'INVESTIGATE', assessments: [{ riskLevel: 'LOW' }] } })).toBe(false);
    expect(lowRisk({ ...order, risk: { recommendation: 'ACCEPT', assessments: [] } })).toBe(false);
    expect(lowRisk({ ...order, risk: null })).toBe(false);
  });
});
