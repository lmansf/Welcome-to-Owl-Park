import { describe, expect, it } from 'vitest';
import { LATEST_PROTOCOL, SERVER_INFO } from '../src/mcp';
import { route, sameKey } from '../src/index';
import { KEY, callTool, env, noFetch, post, testDeps } from './helpers';

const deps = testDeps(noFetch);
const rpc = async (msg: unknown) => {
  const res = await post(msg, deps);
  // JSON-RPC answers, checked field by field below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = res.status === 202 ? null : await res.json();
  return { status: res.status, type: res.headers.get('content-type'), body };
};

describe('MCP over Streamable HTTP', () => {
  it('answers initialize, echoing a supported protocol version', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(r.status).toBe(200);
    expect(r.type).toBe('application/json');
    expect(r.body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    const older = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect(older.body.result.protocolVersion).toBe('2025-03-26');
    const unknown = await rpc({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(unknown.body.result.protocolVersion).toBe(LATEST_PROTOCOL);
  });

  it('accepts notifications with 202 and no body', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, deps);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    expect((await post({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }, deps)).status).toBe(202);
  });

  it('answers ping, and -32601 for an unknown method', async () => {
    expect((await rpc({ jsonrpc: '2.0', id: 'p', method: 'ping' })).body).toEqual({ jsonrpc: '2.0', id: 'p', result: {} });
    expect((await rpc({ jsonrpc: '2.0', id: 9, method: 'resources/list' })).body.error.code).toBe(-32601);
  });

  it('lists the five tools with JSON Schemas, and publish_reel says it needs the explicit yes', async () => {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = r.body.result.tools as { name: string; description: string; inputSchema: { type: string; properties: object } }[];
    expect(tools.map((t) => t.name)).toEqual(['prepare_reel', 'publish_reel', 'list_recent_media', 'get_media_insights', 'get_account_insights']);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.inputSchema.properties).toBeTypeOf('object');
      expect(t.description.length).toBeGreaterThan(40);
    }
    const publish = tools.find((t) => t.name === 'publish_reel')!;
    expect(publish.description).toMatch(/ONLY after Logan has explicitly said yes, in this chat/);
    expect(tools.find((t) => t.name === 'prepare_reel')!.description).toMatch(/Posts nothing/);
  });

  it('reports tool failures as isError results, and an unknown tool as invalid params', async () => {
    const r = await callTool('list_recent_media', { limit: 500 }, deps);
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/limit must be a whole number from 1 to 50/);
    expect((await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'delete_everything' } })).body.error.code).toBe(-32602);
  });

  it('handles parse errors, invalid requests and batches', async () => {
    const bad = await post(null, deps, { raw: '{not json' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: number } }).error.code).toBe(-32700);
    expect((await rpc({ id: 1, method: 'ping' })).body.error.code).toBe(-32600);
    expect((await post([], deps)).status).toBe(400);
    const batch = await rpc([
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'nope' },
    ]);
    expect(batch.body).toEqual([
      { jsonrpc: '2.0', id: 1, result: {} },
      { jsonrpc: '2.0', id: 2, error: { code: -32601, message: 'Method not found' } },
    ]);
    expect((await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }], deps)).status).toBe(202);
  });
});

describe('the secret path', () => {
  const at = (path: string, init: RequestInit = { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' }, e = env) =>
    route(new Request(`https://x.example.workers.dev${path}`, init), e, deps);

  it('is 404 with no detail for a wrong, missing or partial key and for any other path', async () => {
    for (const path of ['/mcp/wrong-key-0123456789abcdefghijkl', '/mcp/', '/mcp', `/mcp/${KEY.slice(0, -1)}`, `/mcp/${KEY}x`, '/', `/other/${KEY}`, `/mcp/${KEY}/more`]) {
      const res = await at(path);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).toBe('');
    }
  });

  it('is 404 everywhere while the key is unset or too short', async () => {
    expect((await at('/mcp/undefined', undefined, { ...env, CONNECTOR_KEY: undefined } as never)).status).toBe(404);
    expect((await at('/mcp/short', undefined, { ...env, CONNECTOR_KEY: 'short' })).status).toBe(404);
  });

  it('answers GET on the MCP path with 405', async () => {
    const res = await at(`/mcp/${KEY}`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect((await at(`/mcp/${KEY}`)).status).toBe(200);
  });

  it('compares keys by value', async () => {
    expect(await sameKey(KEY, KEY)).toBe(true);
    expect(await sameKey(KEY, `${KEY} `)).toBe(false);
    expect(await sameKey('', KEY)).toBe(false);
  });
});
