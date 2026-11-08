import type { Deps, IgEnv } from '../src/env';
import { GRAPH_VERSION } from '../src/graph';
import { route } from '../src/index';

export const TOKEN = 'IGAAfakeTokenForTests0123456789abcdef';
export const KEY = 'connector-key-for-tests-0123456789abcdef';
export const env: IgEnv = { IG_ACCESS_TOKEN: TOKEN, CONNECTOR_KEY: KEY, APPROVAL_KEY: 'approval-key-for-tests-0123456789' };

export interface Call {
  method: string;
  path: string;
  params: Record<string, string>;
  url: string;
  body: string;
}
export type Reply = { status?: number; body: unknown };

/** Stands in for graph.instagram.com: records every call and answers through the handler. */
export function fakeInstagram(handler: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.host !== 'graph.instagram.com') throw new Error(`unexpected host ${url.host}`);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : '';
    const params = Object.fromEntries(method === 'GET' ? url.searchParams : new URLSearchParams(body));
    const prefix = `/${GRAPH_VERSION}/`;
    if (!url.pathname.startsWith(prefix)) throw new Error(`unexpected path ${url.pathname}`);
    const call: Call = { method, path: url.pathname.slice(prefix.length), params, url: url.toString(), body };
    calls.push(call);
    const reply = handler(call);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

/** A clock the tools' sleep moves forward, so polling takes no real time. */
export function testDeps(fetchFn: typeof fetch, start = 1_800_000_000_000): Deps & { sleeps: number[] } {
  let t = start;
  const sleeps: number[] = [];
  return {
    fetch: fetchFn,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

export const noFetch = (() => {
  throw new Error('no fetch expected');
}) as unknown as typeof fetch;

export function post(body: unknown, deps: Deps, opts: { key?: string; e?: IgEnv; raw?: string } = {}): Promise<Response> {
  const req = new Request(`https://owl-park-ig-connector.example.workers.dev/mcp/${opts.key ?? KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: opts.raw ?? JSON.stringify(body),
  });
  return route(req, opts.e ?? env, deps);
}

let nextId = 1;
/** tools/call through the whole MCP path; returns the result and its text. */
export async function callTool(name: string, args: unknown, deps: Deps, e: IgEnv = env) {
  const res = await post({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, deps, { e });
  const raw = await res.text();
  const body = JSON.parse(raw) as { result: { isError: boolean; content: { type: string; text: string }[] } };
  return { raw, isError: body.result.isError, text: body.result.content.map((c) => c.text).join('\n') };
}

export async function prepare(deps: Deps, args: Record<string, unknown> = { video_url: 'https://media.example.com/reel.mp4', caption: 'A night in the park #owls' }) {
  const r = await callTool('prepare_reel', args, deps);
  const id = /approval_id \(valid until [^)]+\):\n(\S+)/.exec(r.text)?.[1];
  if (r.isError || !id) throw new Error(`prepare failed: ${r.text}`);
  return id;
}
