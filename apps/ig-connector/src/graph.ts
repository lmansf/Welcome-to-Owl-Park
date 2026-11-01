import { ToolError, redact } from './errors';

/** The Instagram Graph API version every call uses: change it here only. */
export const GRAPH_VERSION = 'v23.0';
export const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 20_000;

export type Json = Record<string, unknown>;
type Params = Record<string, string | number | boolean | undefined>;

/**
 * Instagram API with Instagram Login (graph.instagram.com). The token travels in the query of a GET and
 * in the form body of a POST; no error message that leaves here carries it.
 */
export class Graph {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch,
  ) {}

  get(path: string, params: Params = {}): Promise<Json> {
    const url = new URL(`${GRAPH_BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    url.searchParams.set('access_token', this.token);
    return this.send(url.toString(), { method: 'GET' });
  }

  post(path: string, params: Params = {}): Promise<Json> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
    body.set('access_token', this.token);
    return this.send(`${GRAPH_BASE}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  private async send(url: string, init: RequestInit): Promise<Json> {
    let res: Response;
    try {
      res = await this.fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // The thrown error may quote the URL, token and all: none of it goes back.
      throw new ToolError('Could not reach Instagram (network error or timeout). Nothing new was confirmed; try again.');
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ToolError(`Instagram answered HTTP ${res.status} with no readable body.`);
    }
    const err = (body as { error?: { message?: unknown; code?: unknown; error_subtype?: unknown; error_user_msg?: unknown } } | null)?.error;
    if (!res.ok || err) {
      const parts = [typeof err?.message === 'string' ? err.message : `HTTP ${res.status}`];
      if (typeof err?.error_user_msg === 'string') parts.push(err.error_user_msg);
      if (err?.code !== undefined) parts.push(`code ${String(err.code)}${err.error_subtype !== undefined ? `/${String(err.error_subtype)}` : ''}`);
      throw new ToolError(redact(`Instagram refused: ${parts.join(' · ')}`, [this.token]));
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new ToolError('Instagram answered with an unexpected body.');
    return body as Json;
  }
}
