/** The rooms: the park's health, the owls in each room, and the sockets that walk into them. */
import { CLOSE, type Logger, hashForLog } from '@owl-park/shared';
import type { OverflowState } from '../Overflow';
import { copiesIn, pickCopy } from '../copies';
import type { Env } from '../env';
import { isFreeRoom, mayEnter, spectating, spectatorsOn } from '../gate';
import { health } from '../health';
import { countIn, countedOneMore } from '../overflowState';
import { isLocalHost } from '../guard';
import { type PassPayload, mintEntry, passRefusal, requireSecret, signingKeySet, verifyEntry, verifyPass } from '../pass';
import { ROOMS, isRoomId, roomCap } from '../rooms';
import { CORS, adminKeySet, clientIp, json, whoOf } from './http';
import { collections, gateOf, objectFor, objectName, overflowOf, readGate } from './park';
import type { RouteCtx } from './router';

/** How long a turned-away socket waits for the page's hello before it is closed anyway. */
export const TURN_AWAY_WAIT_MS = 5_000;

/**
 * A socket the line turns away (OP-075): opened, then closed with the line's code, so the page learns
 * why (a refused handshake says nothing). It is closed once the page has spoken (its hello), when the
 * page surely holds its end: closed before that, the connection is lost instead of closed, and the
 * runtime reports an uncaught error for every owl turned away.
 */
export function turnedAway(ctx: ExecutionContext, log: Logger, code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = [pair[0], pair[1]];
  server.accept();
  ctx.waitUntil(
    new Promise<void>((done) => {
      const timer = setTimeout(close, TURN_AWAY_WAIT_MS);
      function close() {
        clearTimeout(timer);
        try {
          server.close(code, reason);
        } catch (e) {
          // The page may have closed its end first; a socket still open that will not close is news.
          if (server.readyState === WebSocket.READY_STATE_OPEN) log.warn('room.queue', 'send_failed', 'A socket the line turned away could not be closed.', { code, error: e });
        }
        done();
      }
      server.addEventListener('message', close);
      server.addEventListener('close', close);
      server.addEventListener('error', close);
    }),
  );
  return new Response(null, { status: 101, webSocket: client });
}

/** Owls in one room object now (kept a moment): what routing to a room's copies weighs. */
export function countOf(env: Env, roomId: string, copy: number): Promise<number> {
  const name = objectName(env, roomId, copy);
  return countIn(name, async () => (await (await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch('https://park/counts')).json()) as Record<string, number>);
}

/**
 * The copy of a room a socket goes to (OP-075): with one object per room and copies open, the one
 * it was in while that copy still has a place (`sticky`), or the copy with the most free places.
 */
export async function copyFor(env: Env, roomId: string, copies: OverflowState['copies'], sticky: number | null): Promise<number> {
  if (env.ROOM_SHARDING !== 'room' || !Object.hasOwn(ROOMS, roomId)) return 1;
  const { open, draining } = copiesIn(copies, roomId);
  if (!open.length && !draining.length) return 1;
  const asked = [1, ...open, ...(sticky !== null && draining.includes(sticky) ? [sticky] : [])];
  const counts: Record<number, number> = {};
  await Promise.all(asked.map(async (n) => (counts[n] = await countOf(env, roomId, n))));
  return pickCopy(open, draining, counts, roomCap(env, roomId), sticky);
}

export async function healthRoute(c: RouteCtx): Promise<Response> {
  const { env, url, log } = c;
  // The park's health (OP-068): the rooms, the ticket book and the collections each answer in time.
  const h = await health({
    rooms: async () => {
      const r = await objectFor(env, 'hub').fetch('https://park/counts');
      if (!r.ok) throw new Error(`the rooms answered ${r.status}`);
    },
    tickets: () => readGate(env),
    collections: () => collections(env).ping(),
  });
  // Whether the signing key and the keepers' key are set (OP-209): yes or no, never what they are. Off
  // this machine the park is not ok without both, so the uptime check (any answer but 200) alerts.
  const configured = { signing: signingKeySet(env), admin: adminKeySet(env) };
  const unset = !isLocalHost(url.hostname) && !(configured.signing && configured.admin);
  const ok = h.ok && !unset;
  const fields = { ok, parts: h.parts, configured, duration_ms: h.ms };
  if (ok) log.info('worker.health', 'health_check', 'The park answered its health check.', fields);
  else if (!h.ok) log.error('worker.health', 'health_check', 'A part of the park did not answer its health check in time.', fields);
  else log.error('worker.health', 'health_check', 'Every part answered, but the signing key or the keepers’ key is not set (configured says which): the park is not ok until both are.', fields);
  return json({ ...h, ok, configured }, ok ? 200 : 503);
}

export async function counts(c: RouteCtx): Promise<Response> {
  const { env } = c;
  if (env.ROOM_SHARDING === 'room') {
    // Each room with its copies added in (OP-075).
    const { copies } = await overflowOf(env);
    const out: Record<string, number> = {};
    await Promise.all(
      Object.keys(ROOMS).map(async (id) => {
        const { open, draining } = copiesIn(copies, id);
        const each = await Promise.all(
          [1, ...open, ...draining].map(async (n) => {
            const r = await objectFor(env, id, n).fetch('https://park/counts');
            return ((await r.json()) as Record<string, number>)[id] ?? 0;
          }),
        );
        out[id] = each.reduce((a, b) => a + b, 0);
      }),
    );
    return Response.json(out, { headers: CORS });
  }
  const r = await objectFor(env, 'hub').fetch('https://park/counts');
  return new Response(r.body, { headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/**
 * When a room socket's ticket time runs out, in ms (OP-237), or null when nothing ends it: the gate
 * takes tickets, a ticket admitted the pass, and the room is past the turnstiles. A spectator, a free
 * room, or an open gate has no ticket time to keep.
 */
export function ticketUntil(mode: 'open' | 'ticket', pass: Pick<PassPayload, 'adm' | 'exp'>, roomId: string, spectator: boolean): number | null {
  if (mode !== 'ticket' || !pass.adm || spectator || isFreeRoom(roomId)) return null;
  return pass.exp * 1000;
}

export async function socket(c: RouteCtx): Promise<Response> {
  const { request, env, ctx, url, log } = c;
  const roomId = url.pathname.slice(4);
  // One of the park's rooms, or a nest (`nest-<id>`): whether that nest is there, and open, is the room object's to say.
  if (!isRoomId(roomId)) return new Response('unknown room', { status: 404 });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
  // No signing key off this machine (OP-209): the socket is refused (503) before any pass is read.
  const secret = requireSecret(env, url);
  const given = url.searchParams.get('pass');
  const pass = await verifyPass(secret, given);
  if (!pass) {
    log.info('room.join', 'room_join_refused', 'A room socket was refused: its pass was not taken.', { room: roomId, reason: 'pass', pass: await passRefusal(secret, given) });
    return new Response('bad pass', { status: 401 });
  }
  const seen = { room: roomId, session_id: hashForLog(pass.id), ...(pass.cid ? { collector_hash: hashForLog(pass.cid) } : {}) };
  // Past the turnstiles without a ticket that works: turned away, or with SPECTATORS on let in as a spectator (OP-191).
  const gate = await gateOf(env);
  if (!mayEnter(gate, pass, roomId) && !spectatorsOn(env)) {
    log.info('room.join', 'room_join_refused', 'A room socket was refused: the pass is not admitted past the front gate.', { ...seen, reason: 'gate' });
    return new Response('not admitted', { status: 403 });
  }
  const spectator = spectating(gate, pass, roomId);
  // The line (OP-075): while the park has one, only an owl that was inside lately, or came
  // through it, opens a room; a newcomer is sent to wait on the home screen.
  const busy = await overflowOf(env);
  const who = whoOf(pass);
  if (busy.active && !(await verifyEntry(secret, url.searchParams.get('entry'), who))) {
    log.info('room.join', 'room_join_refused', 'A room socket was sent to wait in the line.', { ...seen, reason: 'queue' });
    return turnedAway(ctx, log, CLOSE.QUEUED, 'line');
  }
  // Copies of the room (OP-075): to the one it was in, or the one with the most free places.
  const askedCopy = Number(url.searchParams.get('copy'));
  const copy = await copyFor(env, roomId, busy.copies, Number.isInteger(askedCopy) && askedCopy > 0 ? askedCopy : null);
  if (copy > 1 || busy.copies[roomId]) countedOneMore(objectName(env, roomId, copy));
  const headers = new Headers(request.headers);
  headers.set('X-Room', roomId);
  headers.set('X-Room-Copy', String(copy));
  // A fresh entry with every room, so an owl inside goes on from room to room while there is a line.
  headers.set('X-Entry', await mintEntry(secret, who));
  headers.set('X-Visitor-Id', pass.id);
  // Only the Worker says whether the owl is a visitor or a spectator (OP-191): whatever the page sent under the name goes.
  headers.delete('X-Visitor-Kind');
  headers.set('X-Visitor-Kind', spectator ? 'spectator' : 'visitor');
  // Only the pass says whose collection (and nest) this is, and on which device: whatever the page sent under these names goes.
  headers.delete('X-Collector-Id');
  headers.delete('X-Collector-Tz');
  headers.delete('X-Collector-Dev');
  if (pass.cid) headers.set('X-Collector-Id', pass.cid);
  if (pass.tz) headers.set('X-Collector-Tz', pass.tz);
  if (pass.dev) headers.set('X-Collector-Dev', pass.dev);
  // When the ticket that let this owl in runs out (OP-237): the room closes its socket then. Only the
  // pass says so, and only where the ticket is what opened the room; whatever the page sent goes.
  headers.delete('X-Ticket-Until');
  const until = ticketUntil(gate.mode, pass, roomId, spectator);
  if (until !== null) headers.set('X-Ticket-Until', String(until));
  headers.set('X-Visitor-Ip', clientIp(request, env));
  return objectFor(env, roomId, copy).fetch(new Request(request, { headers }));
}
