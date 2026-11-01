/**
 * The ticket book's internal routes, served by the vote ledger's Durable Object (tickets and votes
 * live together). The Worker calls them after it has checked the store's webhook signature or the
 * visitor's pass; `device` is the visitor's collector id. Nothing here is reachable from outside.
 */
import { KINDS, type TicketLine } from './shopify';
import type { TicketMirror } from './storeApi';
import { inUseElsewhere, type TicketBook, type TicketRecord, type WalletTicket } from './TicketBook';
import { isTicketId, statusOf, windowed, type TicketKind, type TicketStatus } from './tickets';

/**
 * What the votes say about a ticket: how many were cast with it, and whether today's is spent (by
 * the wallet that holds it, C42, or with the ticket itself).
 */
export type VotesOf = (t: { id: string; device: string | null }) => { cast: number; today: boolean };

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
    if (!KINDS.includes(kind as TicketKind)) return null;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    out.push({ line, quantity, kind: kind as TicketKind, lengthMs: num(l['lengthMs']), validFrom: num(l['validFrom']), validUntil: num(l['validUntil']) });
  }
  return out;
}

/**
 * The ticket the gate scans when the visitor does not name one: a running ticket first, then a
 * windowed ticket (an event, opening night) whose night has begun (it is gone after the night),
 * then the unused ticket that expires soonest. A windowed ticket for a later night comes after
 * those, so the gate can say it is not time yet, and a ticket still waiting on the store's check
 * last, so the gate can say that.
 */
export function pickForGate(wallet: WalletTicket[], now: number): WalletTicket | null {
  const unused = wallet.filter((t) => t.status === 'unused');
  return (
    wallet.find((t) => t.status === 'active') ??
    unused.find((t) => windowed(t.kind) && t.validFrom !== null && t.validFrom <= now) ??
    unused.filter((t) => !windowed(t.kind)).sort((a, b) => (a.msLeft ?? Infinity) - (b.msLeft ?? Infinity))[0] ??
    unused[0] ??
    wallet.find((t) => t.status === 'held') ??
    null
  );
}

/** Opening night's count as CSV (C42): order numbers and ticket IDs only, and what each pass sold for (OP-062). */
export function openingCsv(rows: ReturnType<TicketBook['opening']>['rows']): string {
  const iso = (ms: number | null) => (ms === null ? '' : new Date(ms).toISOString());
  const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));
  const lines = ['kind,ticket,order,status,first_scan,from_ticket,paid'];
  for (const r of rows) lines.push([r.kind, r.ticket, r.order, r.status, iso(r.firstScan), r.fromTicket ?? '', dollars(r.paid)].join(','));
  return `${lines.join('\n')}\n`;
}

export async function ticketDesk(book: TicketBook, request: Request, now: number, votesOf: VotesOf): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/tickets/, '');
  const wallet = (device: string): DeskTicket[] => book.wallet(device, now).map((t) => ({ ...t, voteToday: voteToday(t.status, votesOf({ id: t.id, device })) }));
  const mirror = (t: TicketRecord): TicketMirror => {
    const status = statusOf(t, now);
    const v = votesOf(t);
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
  if (request.method === 'GET' && path === '/opening') {
    // Opening night's count for the keepers (C42); `?csv` for the list of its tickets.
    const { counts, rows } = book.opening(now);
    return url.searchParams.has('csv') ? json({ csv: openingCsv(rows) }) : json({ counts });
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
      // Already in the book: an earlier delivery of the store's webhook made these tickets (OP-134 logs the repeat).
      const existed = book.orderOf(order) !== null;
      const r = await book.issue(order, l, body['held'], now);
      const o = book.orderOf(order)!.record;
      return json({ claim: r.claim, tickets: r.tickets.map((t) => t.id), held: o.held, sent: o.sent, existed });
    }
    case '/release': {
      if (!order) return bad();
      const r = await book.release(order);
      return json({ claim: r.claim, tickets: r.tickets.map((t) => t.id) });
    }
    case '/lease': {
      // One webhook at a time per order (see TicketBook.lease).
      if (!order) return bad();
      return json({ ok: book.lease(order, now) });
    }
    case '/unlease': {
      if (!order) return bad();
      book.unlease(order);
      return json({ ok: true });
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
      // Where the link's tickets were, for the Worker's log (OP-134): how many it moves from another device.
      const before = await book.claimable(secret);
      const r = await book.claim(secret, device);
      if (!r || !before) return json({ error: 'unknown link' }, 404);
      const movedIds = new Set(r.map((t) => t.id));
      const moved = before.filter((t) => movedIds.has(t.id) && t.device !== null && t.device !== device).length;
      // Running tickets stay with the owl they admitted (OP-174). A link that finds only those, and none
      // of its order on this owl, is a forwarded email: "already in use", and nothing changes hands.
      const inUse = inUseElsewhere(before, device);
      const order = before[0]?.order ?? null;
      if (r.length === 0 && inUse > 0 && !before.some((t) => t.device === device)) return json({ error: 'in use', order, inUse }, 409);
      // The order, for the Worker alone (OP-139: its email protects the owl that claimed it).
      return json({ tickets: wallet(device), order, moved, claimed: r.length, inUse });
    }
    case '/checkout': {
      // The booth's checkout (OP-175): a one-time token for this owl, to ride in the cart.
      if (!device) return bad();
      return json({ token: await book.newCheckout(device, now) });
    }
    case '/place': {
      // A paid order carried a checkout token: its never-scanned tickets go onto that owl (OP-175).
      const token = str(body['token'], 64);
      if (!order || !token) return bad();
      const r = await book.placeByCheckout(order, token, now);
      return 'refused' in r ? json({ placed: 0, refused: r.refused }) : json({ placed: r.tickets.length, device: r.device });
    }
    case '/take': {
      const secret = str(body['secret'], 64);
      if (!secret || !device) return bad();
      const r = await book.take(secret, device);
      if (r === 'in-use') return json({ error: 'in use' }, 409);
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
      if (!r.ok) {
        // This device's own ticket: its kind too, so the gate can say what kind of night it waits for. An id
        // that names no ticket is the asker's own words, never said back (OP-143).
        const kind = r.reason === 'unknown' || r.reason === 'elsewhere' ? undefined : book.get(id)?.kind;
        return json({ ok: false, reason: r.reason, ...(r.reason === 'unknown' ? {} : { id }), ...(kind ? { kind } : {}) });
      }
      return json({ ok: true, id, started: r.started, kind: r.ticket.kind, validUntil: r.ticket.validUntil });
    }
    case '/link-pass': {
      // A pass order from opening night's offer: the ticket its link named (or none) and what its passes sold for, kept once.
      const from = body['from'] === null || body['from'] === undefined ? null : str(body['from'], 20);
      const cents = body['cents'] === undefined || body['cents'] === null ? null : body['cents'];
      if (!order || (body['from'] !== null && body['from'] !== undefined && !from)) return bad();
      if (cents !== null && !(Number.isSafeInteger(cents) && (cents as number) >= 0)) return bad();
      const l = book.linkPass(order, from, now, cents as number | null);
      return l ? json({ linked: l.fromTicket !== null, from: l.fromTicket }) : json({ error: 'unknown order' }, 404);
    }
    case '/pass-offer': {
      // Whether an Opening Night Ticket on this device may claim its pass now.
      const id = str(body['id'], 20);
      if (!id || !device) return bad();
      return json(book.passOffer(id, device, now));
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
