import type { ParkTransport } from './transport';

export type VoteOutcome =
  | { kind: 'voted'; realm: string }
  | { kind: 'already'; votedFor: string | null }
  | { kind: 'tickets-required' }
  | { kind: 'unavailable' }
  | { kind: 'error' };

/**
 * The Realm Vote: one vote per ticket-holder per park day, cast at a realm's idol.
 * Only the room server can take votes (it knows who holds a ticket), so with the other
 * transports the answer is simply "unavailable".
 */
export async function castVote(transport: ParkTransport, realm: string): Promise<VoteOutcome> {
  if (!transport.vote) return { kind: 'unavailable' };
  try {
    const res = await transport.vote(realm);
    if (res.status === 403) return { kind: 'tickets-required' };
    if (res.status === 401) return { kind: 'error' };
    const body = (await res.json()) as { ok?: boolean; reason?: string; votedFor?: string; realm?: string };
    if (body.ok) return { kind: 'voted', realm: body.realm ?? realm };
    if (body.reason === 'already') return { kind: 'already', votedFor: body.votedFor ?? null };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}
