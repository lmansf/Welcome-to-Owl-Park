/**
 * A keeper's token (OP-156). With `?keeper=1` the page asks for the keepers' key once a page load,
 * trades it at the room server for a token that lets this tab's owl into the tree (map 2) while it
 * is dark, and keeps the token for this tab only, never the key. Every hello carries the token; the
 * room reads it only at the door of a realm the keepers keep closed.
 */
const STORE = 'owl-park-keeper';

let asked: Promise<string | null> | null = null;

/** The token this tab was given, if any. */
export function storedKeeper(): string | null {
  try {
    return sessionStorage.getItem(STORE);
  } catch {
    return null;
  }
}

/** The token to show the room: asked for afresh once a page load with `ask` (`?keeper=1`), else the one this tab keeps. */
export function keeperToken(base: string, ask: boolean, prompt: (q: string) => string | null = (q) => globalThis.prompt?.(q) ?? null): Promise<string | null> {
  if (!ask) return Promise.resolve(storedKeeper());
  asked ??= askKeeper(base, prompt);
  return asked;
}

async function askKeeper(base: string, prompt: (q: string) => string | null): Promise<string | null> {
  const key = prompt('Keepers’ key for the tree');
  if (!key) return storedKeeper();
  const token = await fetch(`${base.replace(/\/$/, '')}/api/admin/keeper`, { method: 'POST', headers: { 'X-Admin-Key': key }, cache: 'no-store' })
    .then(async (r) => (r.ok ? ((await r.json()) as { token?: unknown }).token : null))
    .catch(() => null);
  if (typeof token !== 'string') return null;
  try {
    sessionStorage.setItem(STORE, token);
  } catch {
    /* no session storage: this page load keeps it */
  }
  return token;
}

/** Forget what was asked (tests). */
export function forgetKeeper(): void {
  asked = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    /* nothing kept */
  }
}
