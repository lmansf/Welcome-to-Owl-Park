/**
 * Account links (OP-139). The park's mail carries `#protect=<token>` (open it to protect an owl with
 * that email) or `#restore=<token>` (open it on the screen the owl should come to). The token rides in
 * the fragment, which never reaches a server log; the page reads it once and takes it out of the
 * address bar, as it does a ticket link.
 */
export type AccountLinkKind = 'protect' | 'restore';
export type AccountLinkToken = { kind: AccountLinkKind; token: string };

/** A signed token: its body and signature, base64url, a dot between. */
const TOKEN = /^[A-Za-z0-9_-]{16,400}\.[A-Za-z0-9_-]{43}$/;

export function readAccountLink(hash: string): AccountLinkToken | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  for (const kind of ['protect', 'restore'] as const) {
    const token = params.get(kind);
    if (token && TOKEN.test(token)) return { kind, token };
  }
  return null;
}

/** The page's address without its account link, for history.replaceState. */
export function withoutAccountLink(href: string): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  params.delete('protect');
  params.delete('restore');
  const rest = params.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.toString();
}
