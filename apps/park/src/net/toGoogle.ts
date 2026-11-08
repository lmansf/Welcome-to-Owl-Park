/**
 * Sign in with Google (OP-313): the one place the page goes somewhere else itself. It goes only to
 * Google's own sign-in page (or, in the browser tests, its stand-in on this machine), and Google sends
 * it back to the park. Never to the store: the store is reached only through its card (OP-153).
 */
export function goToGoogle(address: unknown): boolean {
  let to: URL;
  try {
    to = new URL(String(address));
  } catch {
    return false;
  }
  const google = to.protocol === 'https:' && to.hostname === 'accounts.google.com' && to.pathname === '/o/oauth2/v2/auth';
  const standIn = to.protocol === 'http:' && to.hostname === 'localhost' && to.pathname === '/o/oauth2/v2/auth';
  if (!google && !standIn) return false;
  location.assign(to.toString());
  return true;
}
