/**
 * Ticket links (C35). The store's shipping email carries `#claim=<secret>`: opening it puts the
 * order's tickets on this device. A holder can pass one ticket on with `#take=<secret>`. The
 * secret rides in the fragment, which never reaches a server log; the page reads it once and
 * takes it out of the address bar.
 */
export type TicketLink = { kind: 'claim' | 'take'; secret: string };

const SECRET = /^[A-Za-z0-9_-]{43}$/;

export function readTicketLink(hash: string): TicketLink | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  for (const kind of ['claim', 'take'] as const) {
    const secret = params.get(kind);
    if (secret && SECRET.test(secret)) return { kind, secret };
  }
  return null;
}

/** The page's address without its ticket fragment, for history.replaceState. */
export function withoutTicketLink(href: string): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  params.delete('claim');
  params.delete('take');
  const rest = params.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.toString();
}

/** A share link for one ticket, on this park's own address. */
export function shareLink(origin: string, secret: string): string {
  return `${origin.replace(/\/$/, '')}/#take=${secret}`;
}
