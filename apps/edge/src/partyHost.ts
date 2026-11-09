/**
 * The party game's host on the room server (OP-314): the Old Stump's four seats in the Party Grove, and
 * every game in its own room (`party-<id>`, at most four owls) in the same object as the Party Grove.
 *
 * The seats live on the sockets' attachments (`stump`), so they outlast the object's sleep and free
 * themselves when a socket goes. A game is plain data (party/game.ts) kept in storage under its room,
 * so a woken object picks it up where it was; the object's alarm moves it on (`due`, `tick`). Every roll,
 * result and payment is decided here; a page only asks, and is sent the game as its seat may see it.
 *
 * Feathers are paid once a game, when it is over, through the collections object, to the visitors who
 * stayed to the end: never to a spectator (a free guest, OP-191), a park owl, or an owl that left.
 */
import {
  CLOSE,
  PARK_OWL_LOOKS,
  PARTY_LONGEST_MS,
  PARTY_MIN_OWLS,
  PARTY_SEATS,
  STUMP_AT,
  STUMP_REACH,
  STUMP_ROOM,
  distance,
  isPartyRoom,
  newParty,
  newPartyRoomId,
  nextRestartAt,
  partyArrive,
  partyDone,
  partyDue,
  partyEarners,
  partyInput,
  partyLeave,
  partyLook,
  partyTick,
  partyView,
  placeOf,
  seedFrom,
  type ClientParty,
  type Logger,
  type PartySeat,
  type PartyState,
  type ServerFrame,
  type StumpRefusal,
  type StumpView,
} from '@owl-park/shared';
import type { Room } from './Room';

/** A socket's place at the stump, on its attachment: a seat (0 to 3) and when it sat, or null while it only watches the seats. */
export interface StumpMark {
  seat: number | null;
  at: number;
}

/** What the host needs of a socket's attachment (RoomObject's Attachment has all of it). */
export interface PartyAtt {
  room: string;
  id: string;
  sid: string;
  cid?: string;
  spec?: true;
  stump?: StumpMark;
  state: unknown;
}

/** What the host needs of the room object. */
export interface PartyDeps {
  storage: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void>; delete(key: string): Promise<boolean> };
  /** The open sockets with this tag (`room:<id>`). */
  sockets(tag: string): WebSocket[];
  /** How many owls a room has in it now. */
  owlsIn(room: string): number;
  send(ws: WebSocket, frame: ServerFrame): void;
  close(ws: WebSocket, code: number, reason: string): void;
  log: Logger;
  logOf(att: PartyAtt): Logger;
  /** When the nightly restart closes every socket here, once the Worker said so; null otherwise. */
  closingAt(): number | null;
  /** A uniform draw from the platform's cryptographic source. */
  random(): number;
  /** The collections object pays a finished game's feathers. */
  pay(cid: string, place: number): Promise<{ added: number; total: number; games: number }>;
  /** Wake the object no later than this (the game's next step). */
  wake(at: number): void;
  waitUntil(p: Promise<unknown>): void;
}

/** Storage: the rooms with a game, and each game under its room. */
export const PARTIES_KEY = 'parties';
const gameKey = (room: string) => `party:${room}`;
/** Mid-minigame a game is written down at most this often; every other step at once. */
const SAVE_EVERY_MS = 2_000;
/** How much slack the room allows past STUMP_REACH: the page's owl may be a step from where the room has it. */
const REACH_SLACK = 40;
/** The most games one object holds at once (four owls each): far past a busy night's Party Grove. */
const MAX_GAMES = 60;

const att = (ws: WebSocket) => ws.deserializeAttachment() as PartyAtt | null;
/** The seat an owl sits in, for its own copy of the seats. */
function youIn(stump: StumpView, owl: string): { you?: number } {
  const i = stump.seats.findIndex((s) => s?.owl === owl);
  return i >= 0 ? { you: i } : {};
}
/** A park owl's look for a seat: the few real owls' colours, in turn. */
const PARK_LOOK = (i: number) => PARK_OWL_LOOKS[i % PARK_OWL_LOOKS.length]!;

/** A game's steps a page must hear about: a change in any of these sends everyone the view. */
function markOf(s: PartyState): string {
  const t = s.turn;
  return [s.phase, s.round, t?.seat ?? '', t?.step ?? '', t?.path.length ?? '', s.owls.map((o) => `${o.away ? 1 : 0}${o.here ? 1 : 0}`).join(''), s.mini?.result ? 1 : 0].join('|');
}

export class PartyHost {
  private readonly games = new Map<string, PartyState>();
  private readonly savedAt = new Map<string, number>();
  private readonly marks = new Map<string, string>();

  constructor(private readonly d: PartyDeps) {}

  /** The games kept in storage, after a wake: each goes on where it was. */
  async load(): Promise<void> {
    const rooms = await this.d.storage.get(PARTIES_KEY);
    if (!Array.isArray(rooms)) return;
    for (const room of rooms) {
      if (!isPartyRoom(room)) continue;
      const s = (await this.d.storage.get(gameKey(room))) as PartyState | undefined;
      if (s && s.v === 1 && s.room === room) {
        this.games.set(room, s);
        this.marks.set(room, markOf(s));
      }
    }
  }

  /** The game in a room, if there is one. */
  game(room: string): PartyState | undefined {
    return this.games.get(room);
  }

  /** When the next game here needs moving on by itself, or letting go; null with no game. */
  due(now: number): number | null {
    let next: number | null = null;
    for (const s of this.games.values()) {
      const at = partyDone(s) ? s.ends : partyDue(s, now);
      if (at !== null) next = next === null ? at : Math.min(next, at);
    }
    return next;
  }

  // ---------- the stump ----------

  /** No new game now: the park closes for the night before one could finish. */
  closing(now: number): boolean {
    return this.d.closingAt() !== null || now + PARTY_LONGEST_MS > nextRestartAt(now);
  }

  /** The seated sockets, by seat (but the socket of session `except`, which is leaving). */
  private seated(except?: string): Map<number, { ws: WebSocket; a: PartyAtt & { stump: StumpMark & { seat: number } } }> {
    const out = new Map<number, { ws: WebSocket; a: PartyAtt & { stump: StumpMark & { seat: number } } }>();
    for (const ws of this.d.sockets(`room:${STUMP_ROOM}`)) {
      const a = att(ws);
      const seat = a?.stump?.seat;
      if (!a?.state || a.sid === except || seat === null || seat === undefined || seat < 0 || seat >= PARTY_SEATS) continue;
      const held = out.get(seat);
      // Two sockets on one seat (an owl back on a new socket): the first to sit keeps it.
      if (!held || held.a.stump.at > a.stump!.at) out.set(seat, { ws, a: a as PartyAtt & { stump: StumpMark & { seat: number } } });
    }
    return out;
  }

  stumpView(room: Room, now: number, except?: string): StumpView {
    const seated = this.seated(except);
    const seats: StumpView['seats'] = [];
    let starter: number | null = null;
    let first = Infinity;
    for (let i = 0; i < PARTY_SEATS; i++) {
      const s = seated.get(i);
      const look = s ? room.lookOf(s.a.id) : null;
      seats.push(s && look ? { owl: s.a.id, look: partyLook(look) } : null);
      if (s && s.a.stump.at < first) {
        first = s.a.stump.at;
        starter = i;
      }
    }
    return { seats, starter, closing: this.closing(now) };
  }

  /** Everyone watching the seats is sent them as they now stand. */
  private pushStump(room: Room, now: number, except?: string): void {
    const stump = this.stumpView(room, now, except);
    for (const ws of this.d.sockets(`room:${STUMP_ROOM}`)) {
      const a = att(ws);
      if (a?.stump && a.sid !== except) this.d.send(ws, { t: 'stump', ok: true, stump, ...youIn(stump, a.id) });
    }
  }

  private mark(ws: WebSocket, a: PartyAtt, stump: StumpMark): void {
    ws.serializeAttachment({ ...a, stump });
  }

  private near(room: Room, owl: string): boolean {
    const pos = room.positionOf(owl);
    return pos !== null && distance(pos, STUMP_AT) <= STUMP_REACH + REACH_SLACK;
  }

  /** A party frame: at the stump, or in a game's room. */
  frame(ws: WebSocket, a: PartyAtt, room: Room, f: ClientParty, now: number): void {
    if (isPartyRoom(a.room)) return this.inGame(ws, a, f, now);
    const answer = (ok: boolean, reason?: StumpRefusal, go?: string) => {
      const stump = this.stumpView(room, now);
      this.d.send(ws, { t: 'stump', r: f.r, ok, ...(reason ? { reason } : {}), stump, ...youIn(stump, a.id), ...(go ? { go } : {}) });
    };
    if (a.room !== STUMP_ROOM || f.op === 'in' || f.op === 'view') return answer(false, 'unknown');
    const mine = a.stump?.seat ?? null;
    switch (f.op) {
      case 'stump':
        if (!a.stump) this.mark(ws, a, { seat: null, at: now });
        return answer(true);
      case 'sit': {
        if (mine !== null) return answer(true);
        if (!this.near(room, a.id)) return answer(false, 'far');
        if (this.closing(now)) return answer(false, 'closing');
        const taken = this.seated();
        const free = [...Array(PARTY_SEATS).keys()].find((i) => !taken.has(i));
        if (free === undefined) {
          // TODO-DOCS (OP-314): docs/LOGGING.md: party_refused (room.play, info): reason full | closing | few; a fifth owl at the Old Stump, or a start that could not be.
          this.d.logOf(a).info('room.play', 'party_refused', 'An owl was turned away from the Old Stump: every seat is taken.', { reason: 'full' });
          return answer(false, 'full');
        }
        this.mark(ws, a, { seat: free, at: now });
        answer(true);
        return this.pushStump(room, now);
      }
      case 'stand':
        this.mark(ws, a, { seat: null, at: now });
        answer(true);
        return this.pushStump(room, now);
      case 'start':
        return this.start(ws, a, room, f, now, answer);
    }
  }

  private start(ws: WebSocket, a: PartyAtt, room: Room, f: ClientParty, now: number, answer: (ok: boolean, reason?: StumpRefusal, go?: string) => void): void {
    const seated = this.seated();
    const mine = [...seated.entries()].find(([, s]) => s.ws === ws)?.[0];
    if (mine === undefined) return answer(false, 'not-seated');
    // An owl that walked away from the stump has stood up.
    for (const [seat, s] of seated) {
      if (this.near(room, s.a.id)) continue;
      this.mark(s.ws, s.a, { seat: null, at: now });
      seated.delete(seat);
    }
    const order = [...seated.entries()].sort((x, y) => x[1].a.stump.at - y[1].a.stump.at);
    if (!seated.has(mine) || order[0]?.[0] !== mine) {
      this.pushStump(room, now);
      return answer(false, seated.has(mine) ? 'not-starter' : 'not-seated');
    }
    if (this.closing(now)) return answer(false, 'closing');
    if (seated.size < PARTY_MIN_OWLS || this.games.size >= MAX_GAMES) {
      this.d.logOf(a).info('room.play', 'party_refused', 'A game at the Old Stump could not start: too few owls sat down.', { reason: 'few', owls: seated.size });
      return answer(false, 'few');
    }
    const seats: PartySeat[] = [];
    for (const [, s] of [...seated.entries()].sort((x, y) => x[0] - y[0])) {
      const look = room.lookOf(s.a.id);
      if (!look) continue;
      seats.push({ owl: s.a.id, bot: false, look: partyLook(look), ...(s.a.cid ? { cid: s.a.cid } : {}), ...(s.a.spec ? { spec: true } : {}) });
    }
    const humans = seats.length;
    if (f.bots) for (let i = seats.length; i < PARTY_SEATS; i++) seats.push({ owl: '', bot: true, look: PARK_LOOK(i) });
    let id = newPartyRoomId(() => this.d.random());
    while (this.games.has(id)) id = newPartyRoomId(() => this.d.random());
    const s = newParty({ room: id, seats, seed: seedFrom(() => this.d.random()), now, closesAt: nextRestartAt(now) });
    this.games.set(id, s);
    this.marks.set(id, markOf(s));
    this.save(s, now, true);
    // TODO-DOCS (OP-314): docs/LOGGING.md: party_started (room.play, info): owls, bots; a game began at the Old Stump, in its own room.
    this.d.logOf(a).info('room.play', 'party_started', 'A party game started at the Old Stump.', { owls: humans, bots: seats.length - humans });
    for (const [, st] of seated) {
      this.mark(st.ws, st.a, { seat: null, at: now });
      if (st.ws === ws) answer(true, undefined, id);
      else this.d.send(st.ws, { t: 'stump', ok: true, stump: this.stumpView(room, now), go: id });
    }
    this.pushStump(room, now);
    this.d.wake(partyDue(s, now) ?? now);
  }

  // ---------- a game's room ----------

  /** Whether an owl may come into a game's room: one the game invited, while the game goes on. */
  admits(a: Pick<PartyAtt, 'room' | 'id'>): boolean {
    const s = this.games.get(a.room);
    return !!s && !partyDone(s) && s.owls.some((o) => !o.bot && o.owl === a.id);
  }

  /** An invited owl came into its game's room. */
  arrived(a: PartyAtt, now: number): void {
    const s = this.games.get(a.room);
    if (!s) return;
    partyArrive(s, a.id, now);
    this.after(s, now, null, true);
  }

  /** An owl's socket left a room: a game's seat goes to a park owl; a stump seat is let go. */
  left(a: PartyAtt, room: Room | undefined, now: number): void {
    if (a.room === STUMP_ROOM && a.stump?.seat !== null && a.stump?.seat !== undefined && room) return this.pushStump(room, now, a.sid);
    const s = this.games.get(a.room);
    if (!s) return;
    partyLeave(s, a.id, now);
    this.after(s, now, null, true);
  }

  private inGame(ws: WebSocket, a: PartyAtt, f: ClientParty, now: number): void {
    const s = this.games.get(a.room);
    if (!s) return;
    if (f.op === 'view') return this.d.send(ws, { t: 'party', view: partyView(s, a.id, now) });
    if (f.op !== 'in' || f.k === undefined || f.v === undefined) return;
    const seat = s.owls.find((o) => o.owl === a.id)?.seat;
    const at = s.mini ? now - s.mini.at : 0;
    if (!partyInput(s, a.id, { k: f.k, v: f.v }, now) || seat === undefined) return this.after(s, now, null);
    this.after(s, now, s.phase === 'mini' && s.mini ? { seat, k: f.k, v: f.v, t: at, from: a.id } : null);
  }

  /** The game moved on: the pages hear what they must, it is written down, paid and let go as due. */
  private after(s: PartyState, now: number, ev: { seat: number; k: NonNullable<ClientParty['k']>; v: number; t: number; from: string } | null, force = false): void {
    const mark = markOf(s);
    const moved = mark !== this.marks.get(s.room);
    this.marks.set(s.room, mark);
    const stream = s.phase === 'mini' ? partyView(s, null, now).mini?.stream : undefined;
    const sockets = this.d.sockets(`room:${s.room}`);
    if (moved || force || stream === 'view') {
      for (const ws of sockets) {
        const a = att(ws);
        if (a?.state) this.d.send(ws, { t: 'party', view: partyView(s, a.id, now) });
      }
    } else if (ev) {
      const frame: ServerFrame = { t: 'party', ev: { seat: ev.seat, k: ev.k, v: ev.v, t: ev.t } };
      for (const ws of sockets) if (att(ws)?.id !== ev.from) this.d.send(ws, frame);
    }
    if (s.phase === 'over' && !s.paid) this.pay(s, now);
    if (moved && partyDone(s) && !s.paid) this.ended(s);
    if (partyDone(s) && (now >= s.ends || this.d.owlsIn(s.room) === 0)) return this.letGo(s);
    this.save(s, now, moved);
    const due = partyDue(s, now);
    this.d.wake(due ?? s.ends);
  }

  /** The game ended before its end (the night's restart, or everyone left): told once, nobody paid. */
  private ended(s: PartyState): void {
    if (s.phase !== 'ended') return;
    // TODO-DOCS (OP-314): docs/LOGGING.md: party_ended (room.play, info): why finished | restart | empty, round, owls; a game's end, once.
    this.d.log.info('room.play', 'party_ended', 'A party game ended before its last round.', { room: s.room, why: s.ended ?? 'empty', round: s.round, owls: s.owls.filter((o) => !o.bot).length });
  }

  /** The game is over: the visitors who stayed are paid by place, once. */
  private pay(s: PartyState, now: number): void {
    s.paid = true;
    this.save(s, now, true);
    this.d.log.info('room.play', 'party_ended', 'A party game finished.', { room: s.room, why: 'finished', round: s.round, owls: s.owls.filter((o) => !o.bot).length });
    const earners = new Set(partyEarners(s).map((o) => o.seat));
    for (const o of s.owls) {
      if (o.bot) continue;
      const sockets = this.d.sockets(`room:${s.room}`).filter((ws) => att(ws)?.id === o.owl);
      if (!earners.has(o.seat)) {
        // A free guest plays for fun (OP-191): told so, paid nothing.
        if (o.spec) for (const ws of sockets) this.d.send(ws, { t: 'party', paid: { feathers: 0, practice: true } });
        continue;
      }
      const place = placeOf(s, o.seat);
      const cid = o.cid!;
      this.d.waitUntil(
        this.d
          .pay(cid, place)
          .then((res) => {
            // TODO-DOCS (OP-314): docs/LOGGING.md: party_paid (room.play, info): place, feathers, games; a finished game's feathers to one visitor.
            this.d.log.info('room.play', 'party_paid', 'A visitor was paid for a party game.', { room: s.room, place, feathers: res.added, games: res.games });
            for (const ws of sockets) this.d.send(ws, { t: 'party', paid: { feathers: res.added, total: res.total, games: res.games } });
          })
          .catch((e: unknown) => this.d.log.error('room.play', 'write_failed', 'A party game’s feathers did not reach the collections object: that visitor is not paid for it.', { room: s.room, place, error: e })),
      );
    }
  }

  /** The game's room is let go: anyone still in it is sent back to the Party Grove. */
  private letGo(s: PartyState): void {
    // Gone first, so the sockets closing below find no game to leave.
    this.games.delete(s.room);
    this.marks.delete(s.room);
    this.savedAt.delete(s.room);
    for (const ws of this.d.sockets(`room:${s.room}`)) {
      this.d.send(ws, { t: 'closed', room: s.room, why: 'party' });
      this.d.close(ws, CLOSE.PARTY_CLOSED, 'game over');
    }
    this.d.waitUntil(Promise.all([this.d.storage.delete(gameKey(s.room)), this.d.storage.put(PARTIES_KEY, [...this.games.keys()])]));
  }

  private save(s: PartyState, now: number, force: boolean): void {
    if (!force && now - (this.savedAt.get(s.room) ?? 0) < SAVE_EVERY_MS) return;
    this.savedAt.set(s.room, now);
    const writes: Promise<unknown>[] = [this.d.storage.put(gameKey(s.room), s)];
    if (force) writes.push(this.d.storage.put(PARTIES_KEY, [...this.games.keys()]));
    this.d.waitUntil(Promise.all(writes).catch((e: unknown) => this.d.log.error('room.play', 'write_failed', 'A party game was not written down: a wake from sleep would lose its last moves.', { room: s.room, error: e })));
  }

  /** The alarm: every game moves on to now. */
  tick(now: number): void {
    for (const s of [...this.games.values()]) {
      partyTick(s, now);
      this.after(s, now, null);
    }
  }
}
