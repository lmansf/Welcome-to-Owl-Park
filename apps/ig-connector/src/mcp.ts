/**
 * MCP over Streamable HTTP, stateless and by hand (no SDK): one POST carries a JSON-RPC 2.0 message or a
 * batch, and the answer is application/json. No sessions and no server-sent events: nothing here streams.
 */
import type { Deps, IgEnv } from './env';
import { callTool, hasTool, toolList } from './tools';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05', '2025-11-25'] as const;
export const LATEST_PROTOCOL = '2025-06-18';
export const SERVER_INFO = { name: 'owl-park-ig-connector', title: 'Owl Park Instagram', version: '0.1.0' };
export const BODY_MAX = 1_000_000;

const INSTRUCTIONS =
  'Publishes Instagram reels and reads Insights for one account. To post: prepare_reel first (posts nothing), show Logan the summary, ' +
  'and call publish_reel only after Logan explicitly says yes in chat to that exact reel. Every other tool only reads.';

type Id = string | number | null;
interface RpcError { code: number; message: string }
type RpcResponse = { jsonrpc: '2.0'; id: Id; result: unknown } | { jsonrpc: '2.0'; id: Id; error: RpcError };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const fail = (id: Id, code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const isId = (v: unknown): v is string | number => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

/** One message: a response for a request, or null for a notification (or a client's response). */
async function handleOne(msg: unknown, env: IgEnv, deps: Deps): Promise<RpcResponse | null> {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return fail(null, INVALID_REQUEST, 'Invalid Request');
  const m = msg as Record<string, unknown>;
  if (m.jsonrpc !== '2.0') return fail(isId(m.id) ? m.id : null, INVALID_REQUEST, 'Invalid Request');
  // A response the client sends to us (we never ask it anything): accepted and ignored.
  if (m.method === undefined && ('result' in m || 'error' in m)) return null;
  if (typeof m.method !== 'string') return fail(isId(m.id) ? m.id : null, INVALID_REQUEST, 'Invalid Request');
  if (!('id' in m)) return null; // notifications/initialized and every other notification: nothing to answer
  if (!isId(m.id)) return fail(null, INVALID_REQUEST, 'Invalid Request');
  const id = m.id;
  const params = (typeof m.params === 'object' && m.params !== null ? m.params : {}) as Record<string, unknown>;

  switch (m.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      const protocolVersion = (PROTOCOL_VERSIONS as readonly unknown[]).includes(asked) ? (asked as string) : LATEST_PROTOCOL;
      return { jsonrpc: '2.0', id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: toolList() } };
    case 'tools/call': {
      if (typeof params.name !== 'string') return fail(id, INVALID_PARAMS, 'tools/call needs params.name');
      if (!hasTool(params.name)) return fail(id, INVALID_PARAMS, `Unknown tool: ${params.name.slice(0, 64)}`);
      return { jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments, env, deps) };
    }
    default:
      return fail(id, METHOD_NOT_FOUND, 'Method not found');
  }
}

/** The body of a POST to the MCP path, already read as text. */
export async function handleRpc(text: string, env: IgEnv, deps: Deps): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResponse(fail(null, PARSE_ERROR, 'Parse error'), 400);
  }
  if (Array.isArray(body)) {
    if (body.length === 0) return jsonResponse(fail(null, INVALID_REQUEST, 'Invalid Request'), 400);
    const answers: RpcResponse[] = [];
    // One at a time: a batch never runs two publishes side by side.
    for (const msg of body) {
      const a = await handleOne(msg, env, deps);
      if (a) answers.push(a);
    }
    return answers.length ? jsonResponse(answers) : new Response(null, { status: 202 });
  }
  const answer = await handleOne(body, env, deps);
  return answer ? jsonResponse(answer) : new Response(null, { status: 202 });
}
