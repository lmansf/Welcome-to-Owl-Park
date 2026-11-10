/**
 * Account links (OP-139). The park's mail carries `#protect=<token>` (open it to protect an owl with
 * that email) or `#restore=<token>` (open it on the screen the owl should come to). The token rides in
 * the fragment, which never reaches a server log; the page reads it once and takes it out of the
 * address bar, as it does a ticket link.
 *
 * Sign in with Google (OP-313) comes back to the page the same way, with the link its email would have
 * been mailed, or `#offer=<token>` (the email protects no owl yet: the page offers to protect this
 * screen's owl with it), or `#google=stopped|failed`, with `-protect` or `-restore` when the park knows
 * what it was for, when the sign-in went no further.
 */
export type AccountLinkKind = 'protect' | 'restore' | 'offer';
export type AccountLinkToken = { kind: AccountLinkKind; token: string };
/** How a Google sign-in that went no further ended, and what it was for when the park knows. */
export type GoogleNote = { ended: 'stopped' | 'failed'; for: 'protect' | 'restore' | null };

/** A signed token: its body and signature, base64url, a dot between. */
const TOKEN = /^[A-Za-z0-9_-]{16,400}\.[A-Za-z0-9_-]{43}$/;
const KINDS = ['protect', 'restore', 'offer'] as const;
const NOTE = /^(stopped|failed)(?:-(protect|restore))?$/;

export function readAccountLink(hash: string): AccountLinkToken | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  for (const kind of KINDS) {
    const token = params.get(kind);
    if (token && TOKEN.test(token)) return { kind, token };
  }
  return null;
}

/** A Google sign-in that went no further (OP-313), as the park sent the page back; null for none. */
export function readGoogleNote(hash: string): GoogleNote | null {
  const m = NOTE.exec(new URLSearchParams(hash.replace(/^#/, '')).get('google') ?? '');
  return m ? { ended: m[1] as GoogleNote['ended'], for: (m[2] as GoogleNote['for'] | undefined) ?? null } : null;
}

/** The page's address without its account link (or a Google sign-in's note), for history.replaceState. */
export function withoutAccountLink(href: string): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const kind of [...KINDS, 'google']) params.delete(kind);
  const rest = params.toString();
  url.hash = rest ? `#${rest}` : '';
  return url.toString();
}
