/**
 * The Instagram connector (OP-168): an MCP server claude.ai reaches as a custom connector, at
 * POST /mcp/<CONNECTOR_KEY>. The secret path segment is the only authentication (README.md); any other
 * path, or a wrong key, is a bare 404. Nothing here logs: no token or key can reach the Worker's logs.
 */
import { liveDeps, type Deps, type IgEnv } from './env';
import { BODY_MAX, handleRpc } from './mcp';

/** Shorter keys are treated as unset: every path is 404 until a real key is set. */
export const CONNECTOR_KEY_MIN = 24;

const notFound = (): Response => new Response(null, { status: 404 });

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Compares in constant time: both sides are hashed to 32 bytes first, so neither length nor content leaks. */
export async function sameKey(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function route(request: Request, env: IgEnv, deps: Deps): Promise<Response> {
  const match = /^\/mcp\/([^/]+)\/?$/.exec(new URL(request.url).pathname);
  const expected = env.CONNECTOR_KEY;
  if (!match || !expected || expected.length < CONNECTOR_KEY_MIN || !(await sameKey(match[1]!, expected))) return notFound();
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > BODY_MAX) return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > BODY_MAX) return new Response(null, { status: 413 });
  return handleRpc(text, env, deps);
}

export default {
  fetch(request: Request, env: IgEnv): Promise<Response> {
    return route(request, env, liveDeps);
  },
} satisfies ExportedHandler<IgEnv>;
