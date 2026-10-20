/**
 * The ticket book's internal routes, served by the vote ledger's Durable Object (tickets and votes
 * live together). The Worker calls them after it has checked the store's webhook signature or the
 * visitor's pass; `device` is the visitor's collector id. Nothing here is reachable from outside.
 */
import type { TicketLine } from './shopify';
import type { TicketMirror } from './storeApi';
import type { TicketBook, TicketRecord, WalletTicket } from './TicketBook';
import { isTicketId, statusOf, type TicketStatus } from './tickets';

/** What the votes say about a ticket: how many it has cast, and whether today's is spent. */
export type VotesOf = (ticketId: string) => { cast: number; today: boolean };

/** Today's vote: free, spent, or none (the ticket is not running, so it cannot vote now). */
export type VoteToday = TicketMirror['voteToday'];

/** A wallet entry with its vote, as the page shows it. */
export type DeskTicket = WalletTicket & { voteToday: VoteToday };

function voteToday(status: TicketStatus, v: { today: boolean }): VoteToday {
  return status !== 'active' ? 'none' : v.today ? 'used' : 'ready';
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const bad = () => json({ error: 'bad request' }, 400);
const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function lines(v: unknown): TicketLine[] | null {
  if (!Array.isArray(v) || v.length > 50) return null;
  const out: TicketLine[] = [];
  for (const l of v as Array<Record<string, unknown>>) {
    const line = str(l?.['line'], 40);
    const quantity = Number(l?.['quantity']);
    const kind = l?.['kind'];
    if (!line || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
    if (kind !== 'day' && kind !== 'night' && kind !== 'annual' && kind !== 'event') return null;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    out.push({ line, quantity, kind, lengthMs: num(l['lengthMs']), validFrom: num(l['validFrom']), validUntil: num(l['validUntil']) });
  }
  return out;
}

/**
 * The ticket the gate scans when the visitor does not name one: a running ticket first, then an
 * event ticket whose night has begun (it is gone after the night), then the unused ticket that
 * expires soonest. An event ticket for a later night comes after those, so the gate can say it is
 * not time yet, and a ticket still waiting on the store's check last, so the gate can say that.
 */
export function pickForGate(wallet: WalletTicket[], now: number): WalletTicket | null {
  const unused = wallet.filter((t) => t.status === 'unused');
  return (
    wallet.find((t) => t.status === 'active') ??
    unused.find((t) => t.kind === 'event' && t.validFrom !== null && t.validFrom <= now) ??
    unused.filter((t) => t.kind !== 'event').sort((a, b) => (a.msLeft ?? Infinity) - (b.msLeft ?? Infinity))[0] ??
    unused[0] ??
    wallet.find((t) => t.status === 'held') ??
    null
  );
}

export async function ticketDesk(book: TicketBook, request: Request, now: number, votesOf: VotesOf): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/tickets/, '');
  const wallet = (device: string): DeskTicket[] => book.wallet(device, now).map((t) => ({ ...t, voteToday: voteToday(t.status, votesOf(t.id)) }));
  const mirror = (t: TicketRecord): TicketMirror => {
    const status = statusOf(t, now);
    const v = votesOf(t.id);
    return { id: t.id, kind: t.kind, status, order: t.order, firstScan: t.firstScan, validUntil: t.validUntil, votesCast: v.cast, voteToday: voteToday(status, v) };
  };
  if (request.method === 'GET' && path === '/wallet') {
    const device = str(url.searchParams.get('device'), 40);
    return device ? json({ tickets: wallet(device) }) : bad();
  }
  if (request.method === 'GET' && path === '/order') {
    const order = str(url.searchParams.get('order'), 40);
    if (!order) return bad();
    const o = book.orderOf(order);
    if (!o) return json({ error: 'unknown order' }, 404);
    return json({ order, held: o.record.held, sent: o.record.sent, tickets: o.tickets.map((t) => t.id), lines: [...new Set(o.tickets.map((t) => t.line))] });
  }
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad();
  }
  const device = str(body['device'], 40);
  const order = str(body['order'], 40);
  switch (path) {
    case '/issue': {
      const l = lines(body['lines']);
      if (!order || !l || typeof body['held'] !== 'boolean') return bad();
      const r = await book.issue(order, l, body['held'], now);
      const o = book.orderOf(order)!.record;
      return json({ claim: r.claim, tickets: r.tickets.map((t) => t.id), held: o.held, sent: o.sent });
    }
    case '/release': {
      if (!order) return bad();
      const r = await book.release(order);
      return json({ claim: r.claim, tickets: r.tickets.map((t) => t.id) });
    }
    case '/claim-again': {
      if (!order) return bad();
      return json({ claim: await book.newClaim(order) });
    }
    case '/sent': {
      if (!order) return bad();
      book.markSent(order);
      return json({ ok: true });
    }
    case '/revoke': {
      const which = body['which'];
      if (!order) return bad();
      let w: 'all' | Array<{ line: string; quantity: number }>;
      if (which === 'all') w = 'all';
      else if (Array.isArray(which) && which.every((x) => str((x as Record<string, unknown>)?.['line'], 40) && Number.isInteger((x as Record<string, unknown>)['quantity']))) w = which as Array<{ line: string; quantity: number }>;
      else return bad();
      return json({ revoked: book.revoke(order, w, now).map((t) => t.id) });
    }
    case '/claim': {
      const secret = str(body['secret'], 64);
      if (!secret || !device) return bad();
      const r = await book.claim(secret, device);
      return r ? json({ tickets: wallet(device) }) : json({ error: 'unknown link' }, 404);
    }
    case '/take': {
      const secret = str(body['secret'], 64);
      if (!secret || !device) return bad();
      const r = await book.take(secret, device);
      return r ? json({ tickets: wallet(device) }) : json({ error: 'unknown link' }, 404);
    }
    case '/share': {
      const id = str(body['id'], 20);
      if (!id || !device) return bad();
      const secret = await book.share(id, device, now);
      return secret ? json({ secret }) : json({ error: 'not yours' }, 403);
    }
    case '/scan': {
      const named = body['id'] === undefined ? null : str(body['id'], 20);
      // A ticket named badly is refused, never swapped for another one in the wallet.
      if (!device || (body['id'] !== undefined && !named)) return bad();
      const id = named ?? pickForGate(book.wallet(device, now), now)?.id ?? null;
      if (!id) return json({ ok: false, reason: 'none' });
      const r = book.scan(id, device, now);
      if (!r.ok) return json({ ok: false, reason: r.reason, id });
      return json({ ok: true, id, started: r.started, kind: r.ticket.kind, validUntil: r.ticket.validUntil });
    }
    case '/mirror': {
      // The store's copy of one ticket, or of every ticket of an order.
      const id = body['id'];
      if (order) return json({ tickets: (book.orderOf(order)?.tickets ?? []).map(mirror) });
      if (!isTicketId(id)) return bad();
      const t = book.get(id);
      return t ? json({ tickets: [mirror(t)] }) : json({ error: 'unknown ticket' }, 404);
    }
    default:
      return json({ error: 'not found' }, 404);
  }
}
