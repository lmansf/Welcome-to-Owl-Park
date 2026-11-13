/**
 * Google Search Console's HTML-file check (OP-393): Google fetches this one path and wants a plain 200
 * whose body is exactly the line below. The Worker answers it itself rather than leaving it to the
 * static files, whose HTML handling sends `/name.html` on to `/name` with a redirect.
 */
import type { Handler } from './router';

/** The file Google named for the park's domain, and the one line it must hold, byte for byte (no newline). */
export const GOOGLE_VERIFY_PATH = '/google5a7a5bd196df69a0.html';
export const GOOGLE_VERIFY_BODY = 'google-site-verification: google5a7a5bd196df69a0.html';

export const googleVerification: Handler = ({ request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  return new Response(request.method === 'HEAD' ? null : GOOGLE_VERIFY_BODY, { status: 200, headers });
};
