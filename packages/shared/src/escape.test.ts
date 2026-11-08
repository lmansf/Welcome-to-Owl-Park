import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from './book';
import {
  ESCAPE_BACK_SPAWN,
  ESCAPE_DOOR,
  ESCAPE_FEATHERS,
  ESCAPE_HINT_AFTER_MS,
  ESCAPE_ITEM,
  ESCAPE_LOCKS,
  ESCAPE_MAX_OWLS,
  ESCAPE_PERCH_TOP,
  ESCAPE_PLACES,
  ESCAPE_ROOM,
  ESCAPE_SHELVES,
  ESCAPE_VINE_WINDOW_MS,
  cleanEscape,
  escapeHint,
  escapeJoin,
  escapeLayout,
  escapeLeave,
  escapeLook,
  escapeOpen,
  escapeStart,
  escapeTake,
  escapeTug,
  escapeView,
  isEscapeRoom,
  newEscape,
  payEscape,
  randomEscapeRoom,
  type EscapeStanding,
  type EscapeState,
} from './escape';
import { isVariantId, variantsByRarity } from './collectibles';
import { ROOMS, roomFor } from '../rooms';
import { interactablesIn } from './interactables';
import { npcsIn } from './npcs';
import { isWalkable } from './geometry';
import { PLAZA_CLUSTERS } from './plazaFloor';
import { nextParkDayAt } from './parktime';

const T0 = Date.UTC(2026, 10, 8, 18);
const ROOM = 'escape-abcd1234';
const member = (owl: string, spec = false) => ({ owl, cid: spec ? null : `c_${owl}`, spec });
const at = (p: { x: number; y: number }, ground = 0) => ({ pos: { x: p.x, y: p.y }, ground });
const stand = (entries: Record<string, ReturnType<typeof at>>): EscapeStanding => new Map(Object.entries(entries));
const STUMP = { x: 640, y: 1020 };

/** Two owls in, started at T0. */
function running(seed = 'seed-one'): EscapeState {
  const s = newEscape(ROOM, seed, T0 - 5000);
  escapeJoin(s, member('a'));
  escapeJoin(s, member('b'));
  expect(escapeStart(s, 'a', 2, T0)).toEqual({ ok: true, moved: true });
  return s;
}

/** Walk a running group through the chest and the dial. */
function pastDial(s: EscapeState, now = T0 + 1000): void {
  const lay = escapeLayout(s.seed);
  for (const [n, c] of lay.chest.carvings.entries()) expect(escapeLook(s, 'a', 'chest', n, stand({ a: at(c) }), now).ok).toBe(true);
  const chest = ESCAPE_LOCKS[0]!.post;
  expect(escapeOpen(s, 'a', 'chest', lay.chest.code, stand({ a: at(chest) }), now)).toMatchObject({ ok: true, opened: 'chest' });
  expect(escapeLook(s, 'a', 'dial', 0, stand({ a: at(ESCAPE_PLACES.moon), b: at(STUMP, ESCAPE_PERCH_TOP) }), now).ok).toBe(true);
  expect(escapeOpen(s, 'a', 'dial', lay.dial.code, stand({ a: at(ESCAPE_LOCKS[1]!.post) }), now)).toMatchObject({ ok: true, opened: 'dial' });
}

describe('the sealed hollow: its room', () => {
  it('names one private room per group, a top-down room of plain size boxes', () => {
    const id = randomEscapeRoom(Math.random);
    expect(isEscapeRoom(id)).toBe(true);
    expect(isEscapeRoom('escape')).toBe(false);
    expect(isEscapeRoom('escape-ABCD1234')).toBe(false);
    expect(roomFor(id)).toMatchObject({ id, view: 'top', drawn: true });
    expect(ESCAPE_ROOM.doors[0]!.to).toEqual({ room: 'grove', spawn: 'from-escape' });
    expect(roomFor('grove')!.spawns['from-escape']).toBeDefined();
  });

  it('stands its doorway on the grove’s floor, clear of everything else there', () => {
    const grove = ROOMS[ESCAPE_DOOR.room]!;
    const { rect, at, spawn } = ESCAPE_DOOR;
    for (const p of [at, spawn, { x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }]) expect(isWalkable(p, grove.walkable)).toBe(true);
    const others = [
      ...interactablesIn(grove.id).map((i) => i.pos),
      ...npcsIn(grove.id).map((n) => n.pos),
      ...PLAZA_CLUSTERS.filter((c) => c.room === grove.id).flatMap((c) => [...c.things, ...(c.perches ?? [])]),
      ...grove.doors.map((d) => ({ x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 })),
      ...Object.entries(grove.spawns).filter(([k]) => k !== ESCAPE_BACK_SPAWN).map(([, p]) => p),
    ];
    for (const o of others) expect(Math.hypot(o.x - at.x, o.y - at.y), JSON.stringify(o)).toBeGreaterThan(250);
  });

  it('gives a room-only collectible no prize ever draws', () => {
    expect(isVariantId(ESCAPE_ITEM)).toBe(true);
    const by = variantsByRarity();
    expect([...by.common, ...by.uncommon, ...by.rare, ...by.epic]).not.toContain(ESCAPE_ITEM);
  });
});

describe('the sealed hollow: the group', () => {
  it('lets a group of 2 enter and start, but never one owl alone', () => {
    const s = newEscape(ROOM, 'seed', T0);
    expect(escapeJoin(s, member('a'))).toEqual({ ok: true, moved: true });
    expect(escapeStart(s, 'a', 1, T0)).toEqual({ ok: false, reason: 'few' });
    expect(escapeJoin(s, member('b'))).toEqual({ ok: true, moved: true });
    // Two in the group, but only one in the room now: still too few.
    expect(escapeStart(s, 'a', 1, T0)).toEqual({ ok: false, reason: 'few' });
    expect(escapeStart(s, 'z', 2, T0)).toEqual({ ok: false, reason: 'not-member' });
    expect(escapeStart(s, 'b', 2, T0 + 10)).toEqual({ ok: true, moved: true });
    expect(s).toMatchObject({ phase: 'running', startedAt: T0 + 10 });
    expect(escapeStart(s, 'a', 2, T0 + 20)).toEqual({ ok: false, reason: 'started' });
  });

  it('refuses a 5th owl, and anyone new once started', () => {
    const s = newEscape(ROOM, 'seed', T0);
    for (const o of ['a', 'b', 'c', 'd']) expect(escapeJoin(s, member(o)).ok).toBe(true);
    expect(s.members).toHaveLength(ESCAPE_MAX_OWLS);
    expect(escapeJoin(s, member('e'))).toEqual({ ok: false, reason: 'full' });
    // A lobby leaver frees the seat.
    expect(escapeLeave(s, 'd')).toBe(true);
    expect(escapeJoin(s, member('e')).ok).toBe(true);
    escapeStart(s, 'a', 4, T0);
    expect(escapeLeave(s, 'e')).toBe(false); // keeps its place once started
    expect(escapeJoin(s, member('e'))).toEqual({ ok: true, moved: false }); // and may come back
    expect(escapeJoin(s, member('f'))).toEqual({ ok: false, reason: 'started' });
  });

  it('refuses every step before the start', () => {
    const s = newEscape(ROOM, 'seed', T0);
    escapeJoin(s, member('a'));
    expect(escapeLook(s, 'a', 'chest', 0, stand({}), T0)).toEqual({ ok: false, reason: 'not-started' });
    expect(escapeTug(s, 'z', 'west', stand({}), T0)).toEqual({ ok: false, reason: 'not-member' });
  });
});

describe('the sealed hollow: the seed', () => {
  it('randomizes the answers between runs, the same seed always alike', () => {
    expect(escapeLayout('one')).toEqual(escapeLayout('one'));
    const layouts = Array.from({ length: 12 }, (_, i) => JSON.stringify(escapeLayout(`run-${i}`)));
    expect(new Set(layouts).size).toBeGreaterThan(10);
    const chests = new Set(Array.from({ length: 12 }, (_, i) => escapeLayout(`run-${i}`).chest.code.join(',')));
    expect(chests.size).toBeGreaterThan(6);
    const shelves = new Set(Array.from({ length: 30 }, (_, i) => escapeLayout(`run-${i}`).shelf));
    expect(shelves.size).toBe(ESCAPE_SHELVES.length);
    for (let i = 0; i < 12; i++) {
      const lay = escapeLayout(`run-${i}`);
      expect(lay.chest.code).toHaveLength(3);
      expect(new Set(lay.chest.carvings.map((c) => `${c.x},${c.y}`)).size).toBe(3);
    }
  });

  it('never shows a page a symbol before the group reads it', () => {
    const s = running();
    const v = escapeView(s, 'a', stand({}), T0);
    expect(v.locks[0]!.clues.map((c) => c.symbol)).toEqual([null, null, null]);
    expect(JSON.stringify(v)).not.toContain(s.seed);
  });
});

describe('the sealed hollow: the locks', () => {
  it('reads the chest carvings only up close, and jams after five wrong codes', () => {
    const s = running();
    const lay = escapeLayout(s.seed);
    expect(escapeLook(s, 'a', 'chest', 0, stand({ a: at(ESCAPE_PLACES.spawn) }), T0)).toEqual({ ok: false, reason: 'far' });
    expect(escapeLook(s, 'a', 'chest', 0, stand({ a: at(lay.chest.carvings[0]!) }), T0)).toEqual({ ok: true, moved: true });
    expect(escapeView(s, 'b', stand({}), T0).locks[0]!.clues[0]!.symbol).toBe(lay.chest.code[0]);
    const post = stand({ a: at(ESCAPE_LOCKS[0]!.post) });
    const wrong = lay.chest.code.map((c) => (c === 'moon' ? 'star' : 'moon'));
    for (let i = 1; i < 5; i++) expect(escapeOpen(s, 'a', 'chest', wrong, post, T0)).toEqual({ ok: false, reason: 'wrong', left: 5 - i });
    expect(escapeOpen(s, 'a', 'chest', wrong, post, T0)).toEqual({ ok: false, reason: 'wrong', left: 0 });
    expect(escapeOpen(s, 'a', 'chest', lay.chest.code, post, T0 + 1000)).toEqual({ ok: false, reason: 'jammed' });
    expect(escapeOpen(s, 'a', 'chest', lay.chest.code, post, T0 + 21_000)).toMatchObject({ ok: true, opened: 'chest' });
  });

  it('makes the moon carving readable only while another owl holds the stump', () => {
    const s = running();
    const lay = escapeLayout(s.seed);
    for (const [n, c] of lay.chest.carvings.entries()) escapeLook(s, 'a', 'chest', n, stand({ a: at(c) }), T0);
    escapeOpen(s, 'a', 'chest', lay.chest.code, stand({ a: at(ESCAPE_LOCKS[0]!.post) }), T0);
    const moon = at(ESCAPE_PLACES.moon);
    // Nobody on the stump: dark.
    expect(escapeLook(s, 'a', 'dial', 0, stand({ a: moon, b: at(ESCAPE_PLACES.spawn) }), T0)).toEqual({ ok: false, reason: 'dark' });
    // Standing by the stump on the floor is not perching on it.
    expect(escapeLook(s, 'a', 'dial', 0, stand({ a: moon, b: at(STUMP, 0) }), T0)).toEqual({ ok: false, reason: 'dark' });
    expect(escapeView(s, 'a', stand({ b: at(STUMP, 0) }), T0).lit).toBe(false);
    // Perched on it: lit, and the carving reads.
    const held = stand({ a: moon, b: at(STUMP, ESCAPE_PERCH_TOP) });
    expect(escapeView(s, 'a', held, T0).lit).toBe(true);
    expect(escapeView(s, 'a', held, T0).locks[1]!.clues.every((c) => c.symbol === null)).toBe(true);
    expect(escapeLook(s, 'a', 'dial', 0, held, T0)).toEqual({ ok: true, moved: true });
    expect(escapeView(s, 'a', held, T0).locks[1]!.clues.map((c) => c.symbol)).toEqual(lay.dial.code);
    // The reader can never hold the stump for itself: an owl on the stump is far from the carving.
    const t = running('seed-two');
    const lay2 = escapeLayout(t.seed);
    for (const [n, c] of lay2.chest.carvings.entries()) escapeLook(t, 'a', 'chest', n, stand({ a: at(c) }), T0);
    escapeOpen(t, 'a', 'chest', lay2.chest.code, stand({ a: at(ESCAPE_LOCKS[0]!.post) }), T0);
    expect(escapeLook(t, 'a', 'dial', 0, stand({ a: at(STUMP, ESCAPE_PERCH_TOP) }), T0)).toEqual({ ok: false, reason: 'far' });
  });

  it('opens the root door when both vines are tugged within the window, not on one alone', () => {
    const s = running();
    pastDial(s);
    const [west, east] = ESCAPE_PLACES.vines;
    const both = stand({ a: at(west), b: at(east) });
    expect(escapeTug(s, 'a', 'west', both, T0 + 10_000)).toEqual({ ok: true, moved: true });
    // Alone, again and again: nothing.
    expect(escapeTug(s, 'a', 'west', both, T0 + 10_500)).toEqual({ ok: true, moved: true });
    expect(s.opened).not.toContain('roots');
    // Too late for the other vine.
    expect(escapeTug(s, 'b', 'east', both, T0 + 10_500 + ESCAPE_VINE_WINDOW_MS + 1)).toEqual({ ok: true, moved: true });
    expect(s.opened).not.toContain('roots');
    // Within the window: open.
    expect(escapeTug(s, 'a', 'west', both, T0 + 12_000)).toEqual({ ok: true, moved: true, opened: 'roots' });
    expect(s.opened).toContain('roots');
  });

  it('never opens the root door for one owl tugging both vines', () => {
    const s = running();
    pastDial(s);
    const [west, east] = ESCAPE_PLACES.vines;
    escapeTug(s, 'a', 'west', stand({ a: at(west) }), T0 + 10_000);
    expect(escapeTug(s, 'a', 'east', stand({ a: at(east) }), T0 + 10_100)).toEqual({ ok: true, moved: true });
    expect(s.opened).not.toContain('roots');
    expect(escapeTug(s, 'b', 'west', stand({ b: at(ESCAPE_PLACES.spawn) }), T0 + 10_200)).toEqual({ ok: false, reason: 'far' });
  });

  it('opens the way out only with the key from its shelf, and the group escapes', () => {
    const s = running();
    pastDial(s);
    const [west, east] = ESCAPE_PLACES.vines;
    escapeTug(s, 'a', 'west', stand({ a: at(west) }), T0 + 10_000);
    escapeTug(s, 'b', 'east', stand({ b: at(east) }), T0 + 10_500);
    const door = stand({ a: at(ESCAPE_LOCKS[3]!.post) });
    expect(escapeOpen(s, 'a', 'way-out', undefined, door, T0 + 11_000)).toEqual({ ok: false, reason: 'no-key' });
    const shelf = escapeView(s, 'a', stand({}), T0).key!;
    expect(escapeTake(s, 'b', stand({ b: at(shelf, 0) }), T0 + 12_000)).toEqual({ ok: false, reason: 'far' }); // under it, not up on it
    expect(escapeTake(s, 'b', stand({ b: at(shelf, ESCAPE_PERCH_TOP) }), T0 + 12_000)).toEqual({ ok: true, moved: true });
    expect(escapeView(s, 'a', stand({}), T0).key).toBeNull();
    expect(escapeOpen(s, 'a', 'way-out', undefined, door, T0 + 13_000)).toEqual({ ok: true, moved: true, opened: 'way-out', escaped: true });
    expect(s).toMatchObject({ phase: 'escaped', endedAt: T0 + 13_000 });
    expect(escapeTug(s, 'a', 'west', stand({}), T0 + 14_000)).toEqual({ ok: false, reason: 'over' });
  });
});

describe('the sealed hollow: the hint owl', () => {
  it('offers a hint after a stuck minute, for the lock the group is on', () => {
    const s = running();
    const by = stand({ a: at(ESCAPE_PLACES.hintOwl) });
    expect(escapeView(s, 'a', by, T0).hint).toBe(false);
    expect(escapeHint(s, 'a', by, T0 + ESCAPE_HINT_AFTER_MS - 1)).toEqual({ ok: false, reason: 'not-yet' });
    expect(escapeView(s, 'a', by, T0 + ESCAPE_HINT_AFTER_MS).hint).toBe(true);
    expect(escapeHint(s, 'a', stand({ a: at(ESCAPE_PLACES.moon) }), T0 + ESCAPE_HINT_AFTER_MS)).toEqual({ ok: false, reason: 'far' });
    expect(escapeHint(s, 'a', by, T0 + ESCAPE_HINT_AFTER_MS)).toEqual({ ok: true, moved: true, hint: ESCAPE_LOCKS[0]!.hint });
    // The next one waits another minute.
    expect(escapeHint(s, 'a', by, T0 + ESCAPE_HINT_AFTER_MS + 1000)).toEqual({ ok: false, reason: 'not-yet' });
    expect(s.hints).toBe(1);
  });

  it('waits again whenever the group makes progress', () => {
    const s = running();
    const lay = escapeLayout(s.seed);
    escapeLook(s, 'a', 'chest', 0, stand({ a: at(lay.chest.carvings[0]!) }), T0 + 50_000);
    expect(escapeHint(s, 'a', stand({ a: at(ESCAPE_PLACES.hintOwl) }), T0 + ESCAPE_HINT_AFTER_MS)).toEqual({ ok: false, reason: 'not-yet' });
    pastDial(s, T0 + 70_000);
    expect(escapeHint(s, 'a', stand({ a: at(ESCAPE_PLACES.hintOwl) }), T0 + 70_000 + ESCAPE_HINT_AFTER_MS)).toMatchObject({ ok: true, hint: ESCAPE_LOCKS[2]!.hint });
  });

  it('writes no hint or note a ten year old would stumble on', () => {
    for (const l of ESCAPE_LOCKS) {
      expect(`${l.hint} ${l.note}`).not.toMatch(/grown|adult/i);
      expect(l.hint.length).toBeLessThan(220);
    }
  });
});

describe('the sealed hollow: the pay', () => {
  it('pays feathers once a park day and the collectible once ever', () => {
    const book = new CollectionBook(new MemoryCollectionStore());
    const first = payEscape(book, 'c_a', T0);
    expect(first).toEqual({ feathers: ESCAPE_FEATHERS, total: ESCAPE_FEATHERS, item: ESCAPE_ITEM });
    expect(book.owned('c_a', undefined, T0)).toContain(ESCAPE_ITEM);
    const again = payEscape(book, 'c_a', T0 + 60_000);
    expect(again).toEqual({ feathers: 0, total: ESCAPE_FEATHERS, why: 'paid-today' });
    const tomorrow = payEscape(book, 'c_a', nextParkDayAt(T0) + 1000);
    expect(tomorrow.feathers).toBe(ESCAPE_FEATHERS);
    expect(tomorrow.item).toBeUndefined();
    // Another owl is paid on its own.
    expect(payEscape(book, 'c_b', T0).feathers).toBe(ESCAPE_FEATHERS);
  });

  it('marks a spectator’s view as practice', () => {
    const s = newEscape(ROOM, 'seed', T0);
    escapeJoin(s, member('a'));
    escapeJoin(s, member('g', true));
    expect(escapeView(s, 'g', stand({}), T0)).toMatchObject({ member: true, practice: true });
    expect(escapeView(s, 'a', stand({}), T0)).toMatchObject({ member: true, practice: false });
    expect(escapeView(s, 'x', stand({}), T0)).toMatchObject({ member: false, practice: false });
  });
});

describe('the sealed hollow: storage', () => {
  it('keeps a run through storage, and drops what is not one', () => {
    const s = running();
    pastDial(s);
    expect(cleanEscape(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(cleanEscape(null)).toBeNull();
    expect(cleanEscape({ ...s, room: 'grove' })).toBeNull();
    expect(cleanEscape({ ...s, phase: 'won' })).toBeNull();
    expect(cleanEscape({ ...s, opened: ['chest', 'nope'] })!.opened).toEqual(['chest']);
  });
});
