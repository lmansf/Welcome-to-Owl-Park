import { describe, expect, it } from 'vitest';
import { EMOTE_IDS, JUMP_EMOTE } from './collectibles';
import { CLOSE, EDGE_PROTOCOL_VERSION as V, parseClientFrame, parseServerFrame, type ServerFrame } from './edge';
import { isEmoteId, isParkMessage } from './validate';

const look = { body: '#111111', belly: '#222222', accent: '#333333' };

describe('protocol v9, the arcade', () => {
  it('is version 9, and a page speaking 8 is refused at its hello (so it reloads)', () => {
    expect(V).toBe(9);
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 8, look }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: 9, look }))).toEqual({ t: 'hello', v: 9, look });
    expect(new Set(Object.values(CLOSE)).size).toBe(Object.keys(CLOSE).length);
  });

  it('starts a run of a game it knows, and nothing else', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'run', g: 'flight', r: 1 }))).toEqual({ t: 'act', a: 'run', g: 'flight', r: 1 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'run', g: 'Moon Flap', r: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'run', r: 1 }))).toBeNull();
  });

  it('reads a run’s result: the game, a whole score, the run’s seed, and shots only when sent', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'score', g: 'crossing', s: 7, k: 99, r: 2 }))).toEqual({ t: 'act', a: 'score', g: 'crossing', s: 7, k: 99, r: 2 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'score', g: 'sling', s: 9, n: 4, k: 0, r: 3 }))).toEqual({ t: 'act', a: 'score', g: 'sling', s: 9, n: 4, k: 0, r: 3 });
    for (const bad of [{ s: -1 }, { s: 1.5 }, { s: '7' }, { s: 2e6 }, { k: undefined }, { k: -1 }, { n: 1.5 }, { g: 'golf' }])
      expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'score', g: 'crossing', s: 7, k: 1, r: 4, ...bad })), JSON.stringify(bad)).toBeNull();
  });

  it('passes the score wall on to the page', () => {
    const wall: ServerFrame = { t: 'wall', walls: [{ game: 'flight', top: [{ score: 12, look }] }], mine: { flight: 12 } };
    expect(parseServerFrame(JSON.stringify(wall))).toEqual(wall);
  });
});

describe('protocol v8, prewritten chat', () => {
  it('reads a phrase by its number only, and never words', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'say', n: 3 }))).toEqual({ t: 'say', n: 3 });
    expect(parseClientFrame(JSON.stringify({ t: 'say', n: 7, text: 'anything at all' }))).toEqual({ t: 'say', n: 7 });
    // A whole number in range reaches the room, which drops one its list does not have.
    expect(parseClientFrame(JSON.stringify({ t: 'say', n: 999 }))).toEqual({ t: 'say', n: 999 });
    for (const n of [undefined, 0, -1, 1.5, '3', 'Hi!', 1000, null]) expect(parseClientFrame(JSON.stringify({ t: 'say', n })), String(n)).toBeNull();
  });

  it('passes a phrase from the room on to the page', () => {
    const say: ServerFrame = { t: 'say', id: 'v_a', n: 12 };
    expect(parseServerFrame(JSON.stringify(say))).toEqual(say);
  });
});

describe('protocol v7, the nests', () => {
  it('has a close code of its own for a nest that turns an owl away', () => {
    expect(CLOSE.NEST_CLOSED).toBe(4011);
  });

  it('reads a street request with its request number only', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'street', r: 1 }))).toEqual({ t: 'street', r: 1 });
    expect(parseClientFrame(JSON.stringify({ t: 'street', r: 2, nestId: 'abcd1234', cid: 'c_abcdefgh' }))).toEqual({ t: 'street', r: 2 });
    for (const r of [undefined, -1, 1.5, '3', 2e9]) expect(parseClientFrame(JSON.stringify({ t: 'street', r })), String(r)).toBeNull();
  });

  it("reads an owner's change to its nest: a piece in a spot, taking one away, opening and closing", () => {
    expect(parseClientFrame(JSON.stringify({ t: 'nest', r: 2, spot: 'f1', item: 'rug' }))).toEqual({ t: 'nest', r: 2, spot: 'f1', item: 'rug' });
    expect(parseClientFrame(JSON.stringify({ t: 'nest', r: 3, spot: 'w2', item: null }))).toEqual({ t: 'nest', r: 3, spot: 'w2', item: null });
    expect(parseClientFrame(JSON.stringify({ t: 'nest', r: 4, open: false }))).toEqual({ t: 'nest', r: 4, open: false });
    expect(parseClientFrame(JSON.stringify({ t: 'nest', r: 5, open: true, extra: 'x' }))).toEqual({ t: 'nest', r: 5, open: true });
    // A well-formed spot or piece the rules do not know is passed on, for them to refuse with a reason.
    expect(parseClientFrame(JSON.stringify({ t: 'nest', r: 6, spot: 'f9', item: 'sofa' }))).toEqual({ t: 'nest', r: 6, spot: 'f9', item: 'sofa' });
  });

  it('rejects a malformed change to a nest', () => {
    for (const bad of [
      { t: 'nest', spot: 'f1', item: 'rug' }, // no request number
      { t: 'nest', r: -1, open: true },
      { t: 'nest', r: 1 },
      { t: 'nest', r: 1, spot: 'f1' },
      { t: 'nest', r: 1, spot: 'f1', item: 'rug', open: true },
      { t: 'nest', r: 1, spot: 'F1', item: 'rug' },
      { t: 'nest', r: 1, spot: 'f1', item: 'Rug' },
      { t: 'nest', r: 1, open: 'yes' },
      { t: 'nest', r: 1, layout: { f1: 'rug' } },
    ]) {
      expect(parseClientFrame(JSON.stringify(bad)), JSON.stringify(bad)).toBeNull();
    }
  });

  it('lets a page read the nest, street and closed frames', () => {
    const frames: ServerFrame[] = [
      { t: 'nest', nest: { nestId: 'abcd1234', open: true, layout: { f1: 'rug' }, look }, mine: true, owned: ['rug'], gift: { taken: false, next: 1 } },
      { t: 'nest', r: 3, ok: false, reason: 'not-owner' },
      { t: 'street', r: 1, own: { nestId: 'abcd1234', open: false }, doors: [{ nestId: 'zz99zz99', look }, null, null, null, null] },
      { t: 'closed', room: 'nest-abcd1234', why: 'closed' },
    ];
    for (const f of frames) expect(parseServerFrame(JSON.stringify(f))).toEqual(f);
  });
});

describe('parseClientFrame', () => {
  it('accepts well-formed frames and rounds coordinates', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look, spawn: 'from-grove', pos: { x: 10.4, y: 20.6 } }))).toEqual({ t: 'hello', v: V, look, spawn: 'from-grove', pos: { x: 10, y: 21 } });
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 1, y: 2 }, seq: 3 }))).toEqual({ t: 'move', to: { x: 1, y: 2 }, seq: 3 });
    expect(parseClientFrame(JSON.stringify({ t: 'look', look, extra: 1 }))).toEqual({ t: 'look', look });
    expect(parseClientFrame(JSON.stringify({ t: 'bye' }))).toEqual({ t: 'bye' });
  });

  it('accepts an emote from the catalogue and the hop every owl has, and nothing else', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'emote', e: 'hoot' }))).toEqual({ t: 'emote', e: 'hoot' });
    expect(parseClientFrame(JSON.stringify({ t: 'emote', e: JUMP_EMOTE }))).toEqual({ t: 'emote', e: JUMP_EMOTE });
    expect(parseClientFrame(JSON.stringify({ t: 'emote', e: 'fly' }))).toBeNull();
    // The hop is not a collectible: no catalogue emote, so a quest, the wheel or the shop never meet it.
    expect(EMOTE_IDS).not.toContain(JUMP_EMOTE);
    expect(isEmoteId(JUMP_EMOTE)).toBe(false);
    expect(isParkMessage({ t: 'emote', id: 'p1', e: JUMP_EMOTE })).toBe(true);
  });

  it('accepts positions anywhere in a room wider than one screen', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 4700, y: 1500 }, seq: 2 }))).toEqual({ t: 'move', to: { x: 4700, y: 1500 }, seq: 2 });
  });

  it('accepts activity frames, a note only with an emote', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'light', r: 4 }))).toEqual({ t: 'act', a: 'light', r: 4 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'cast', e: 'hoot', r: 5 }))).toEqual({ t: 'act', a: 'cast', r: 5 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', e: 'hoot', r: 6 }))).toEqual({ t: 'act', a: 'note', e: 'hoot', r: 6 });
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', r: 6 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'note', e: 'sing', r: 6 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'fly', r: 7 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'act', a: 'tasks' }))).toBeNull();
  });
  it('rejects anything malformed', () => {
    expect(parseClientFrame('not json')).toBeNull();
    expect(parseClientFrame('[]')).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V - 1, look }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look: { body: 'red' } }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'hello', v: V, look, spawn: 'Not A Spawn' }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: -5, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 5, y: 2 }, seq: 1.5 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: Infinity, y: 2 }, seq: 1 }))).toBeNull();
    expect(parseClientFrame(JSON.stringify({ t: 'move', to: { x: 6401, y: 2 }, seq: 1 }))).toBeNull(); // past the biggest room
    expect(parseClientFrame(JSON.stringify({ t: 'say', text: 'hi' }))).toBeNull();
    expect(parseClientFrame('x'.repeat(2000))).toBeNull();
  });
});
