/**
 * Durable Object holding the Realm Vote and the ticket book (C35) in its SQLite storage, so a
 * ticket and its votes live together. One object for the park. The Worker verifies passes,
 * admission and the store's signatures before calling in; this object only applies the rules.
 */
import { DurableObject } from 'cloudflare:workers';
import { Ledger, parkDay, parkMonth, previousMonth, walletVoter } from './Ledger';
import { SqlTicketStore } from './sqlTicketStore';
import { SqlVoteStore } from './sqlVoteStore';
import { TicketBook } from './TicketBook';
import { ticketDesk } from './ticketDesk';
import type { Env } from './env';

/** Realms with an idol to vote at, in the park's fixed order (neutral ids, never public names). */
export const VOTABLE_REALMS = ['grove', 'market'];

export class VoteLedger extends DurableObject<Env> {
  private readonly ledger: Ledger;
  private readonly tickets: TicketBook;
  private readonly tz: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.tz = env.PARK_TZ || 'America/New_York';
    this.ledger = new Ledger(new SqlVoteStore(ctx.storage.sql), VOTABLE_REALMS);
    this.tickets = new TicketBook(new SqlTicketStore(ctx.storage.sql));
  }

  /** Internal API, called by the Worker with the visitor already authenticated and admitted. */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = new Date();
    const day = parkDay(now, this.tz);
    if (url.pathname.startsWith('/tickets/')) {
      // A ticket's votes, and whether today's is spent: by the wallet that holds it, or with the ticket itself.
      return ticketDesk(this.tickets, request, now.getTime(), (t) => ({
        cast: this.ledger.castBy(t.id),
        today: this.ledger.status(t.device ? walletVoter(t.device) : '', day, t.id).votedFor !== null,
      }));
    }
    if (url.pathname === '/vote' && request.method === 'POST') {
      const body = (await request.json()) as { visitor?: string; realm?: string; ticket?: string | null };
      if (typeof body.visitor !== 'string' || typeof body.realm !== 'string') return Response.json({ error: 'bad request' }, { status: 400 });
      const ticket = typeof body.ticket === 'string' && body.ticket ? body.ticket : null;
      const result = this.ledger.vote(body.visitor, body.realm, day, now.getTime(), ticket);
      return Response.json({ ...result, day });
    }
    if (url.pathname === '/status') {
      const visitor = url.searchParams.get('visitor') ?? '';
      return Response.json(this.ledger.status(visitor, day, url.searchParams.get('ticket')));
    }
    if (url.pathname === '/tally') {
      const month = url.searchParams.get('month') ?? parkMonth(now, this.tz);
      return Response.json(this.ledger.tally(month));
    }
    if (url.pathname === '/close' && request.method === 'POST') {
      const month = url.searchParams.get('month') ?? previousMonth(parkMonth(now, this.tz));
      return Response.json(this.ledger.close(month, now.getTime()));
    }
    return new Response('not found', { status: 404 });
  }
}
