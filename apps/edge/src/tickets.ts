/**
 * Tickets (proposal C35): the store sells them and keeps the buyer; the park keeps each ticket
 * here, beside the votes. One ticket per unit bought, with a visual ID people can read out
 * (`OWL-7K3Q-PX9M`) and, separately, a claim secret that only the emailed link carries. Only the
 * order and line numbers are kept, never a name or an email.
 *
 * A ticket's time starts at its first scan at the gate, not at purchase, and lasts its kind's
 * length; an unused ticket expires a year after purchase. An event ticket (opening night with the
 * Drop-1 pin) has a fixed window instead. A ticket waits for the owner's fraud check when the store
 * did not rate its order low risk, and a refund or a cancellation revokes it. These are the pure
 * rules; the ledger that stores tickets uses them.
 */

export type TicketKind = 'day' | 'night' | 'annual' | 'event';

export type TicketStatus =
  /** Waiting for the owner's fraud check. */
  | 'held'
  /** Bought, not scanned yet (or an event ticket before its window). */
  | 'unused'
  /** Scanned, and its time is running (or an event ticket inside its window). */
  | 'active'
  /** Its time ran out after use. */
  | 'used'
  /** Never used before the year ran out, or an event ticket whose night passed unused. */
  | 'expired'
  /** Refunded or cancelled. */
  | 'revoked';

export interface Ticket {
  /** Visual ID, `OWL-XXXX-XXXX`. */
  id: string;
  kind: TicketKind;
  /** How long a scanned ticket lasts, in ms (open-dated kinds). */
  lengthMs: number | null;
  /** The store's order and line item ids, and which unit of the line this is (1-based). */
  order: string;
  line: string;
  unit: number;
  /** When it was made (the order was paid), ms. */
  created: number;
  /** Waiting for the owner's fraud check. */
  held: boolean;
  /** First scan at the gate, ms. */
  firstScan: number | null;
  /** Open-dated: first scan + length. Event: the end of its window. */
  validUntil: number | null;
  /** Event tickets only: the start of the window. */
  validFrom: number | null;
  /** Refunded or cancelled, ms. */
  revoked: number | null;
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/** Defaults approved in C35: a day ticket lasts 24 hours from its first scan, an annual pass 365 days. */
export const DEFAULT_LENGTH_MS: Readonly<Record<TicketKind, number | null>> = { day: DAY_MS, night: null, annual: 365 * DAY_MS, event: null };
/** An unused ticket expires a year after purchase (C35). */
export const UNUSED_LIFETIME_MS = 365 * DAY_MS;

/** Visual IDs use no 0, O, 1 or I, so they survive being read aloud or copied by hand. */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ID_RE = /^OWL-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

export function isTicketId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

/** `OWL-` and eight characters from eight random bytes (32 symbols: 5 bits of each byte). */
export function visualId(bytes: Uint8Array): string {
  if (bytes.length < 8) throw new Error('visualId needs 8 random bytes');
  let s = '';
  for (let i = 0; i < 8; i++) s += ID_ALPHABET[bytes[i]! & 31];
  return `OWL-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function statusOf(t: Ticket, now: number): TicketStatus {
  if (t.revoked !== null) return 'revoked';
  if (t.held) return 'held';
  if (t.kind === 'event') {
    if (t.validUntil !== null && now >= t.validUntil) return t.firstScan !== null ? 'used' : 'expired';
    if (t.validFrom !== null && now < t.validFrom) return 'unused';
    return t.firstScan !== null ? 'active' : 'unused';
  }
  if (t.firstScan === null) return now < t.created + UNUSED_LIFETIME_MS ? 'unused' : 'expired';
  return t.validUntil !== null && now < t.validUntil ? 'active' : 'used';
}

export type ScanResult =
  | { ok: true; ticket: Ticket; started: boolean }
  | { ok: false; reason: 'held' | 'used' | 'expired' | 'revoked' | 'not-yet' | 'no-length' };

/**
 * A scan at the gate. The first one starts an open-dated ticket's time; a later one inside its
 * time just lets it through again. An event ticket goes through only inside its window.
 */
export function scan(t: Ticket, now: number): ScanResult {
  const status = statusOf(t, now);
  if (status === 'active') return { ok: true, ticket: t, started: false };
  if (status !== 'unused') return { ok: false, reason: status };
  if (t.kind === 'event') {
    // An event ticket goes through only inside its window, and only once the window is set.
    if (t.validFrom === null || t.validUntil === null || now < t.validFrom) return { ok: false, reason: 'not-yet' };
    return { ok: true, ticket: { ...t, firstScan: now }, started: true };
  }
  if (t.lengthMs === null || t.lengthMs <= 0) return { ok: false, reason: 'no-length' };
  return { ok: true, ticket: { ...t, firstScan: now, validUntil: now + t.lengthMs }, started: true };
}

/** What a ticket still has: time left once it is running, or until an unused one expires. */
export function timeLeft(t: Ticket, now: number): { status: TicketStatus; msLeft: number | null } {
  const status = statusOf(t, now);
  if (status === 'active') return { status, msLeft: t.validUntil === null ? null : Math.max(0, t.validUntil - now) };
  if (status === 'unused') return { status, msLeft: t.kind === 'event' ? null : Math.max(0, t.created + UNUSED_LIFETIME_MS - now) };
  return { status, msLeft: 0 };
}
