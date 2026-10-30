import { describe, expect, it } from 'vitest';
import { isFriendCode, normalEmail } from './accounts';
import { EMOTE_IDS, isTimeZone, isVariantId } from './collectibles';
import { EDGE_PROTOCOL_VERSION, parseClientFrame } from './edge';
import { parseFeedback } from './feedback';
import { isNestRoom } from './homes';
import { isLook } from './validate';

/**
 * What a visitor sends, at its worst (OP-143): the audit's strings (2.8) against every value a page's
 * frame carries to the room server, and the shared checks the Worker uses. Each is refused, or, where
 * a visitor's own words are the point (a feedback note), kept as plain words. apps/edge/test/hostile.test.ts
 * holds the Worker's routes to the same strings.
 */
const HOSTILE: readonly unknown[] = ["' OR '1'='1", '{"$ne": null}', { $ne: null }, '<img src=x onerror=alert(1)>', '../../../etc/passwd', '%00', '\u0000', 'x'.repeat(10_000)];

const LOOK = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };
/** One well-formed frame of each kind a page sends, and the values in it a hostile page could change. */
const FRAMES: Array<{ frame: Record<string, unknown>; fields: string[] }> = [
  { frame: { t: 'hello', v: EDGE_PROTOCOL_VERSION, look: LOOK, spawn: 'from-hub', pos: { x: 10, y: 10 }, via: 'travel' }, fields: ['v', 'look', 'look.body', 'look.belly', 'look.accent', 'look.species', 'look.pledge', 'look.wear', 'look.wear.head', 'spawn', 'pos', 'pos.x', 'via'] },
  { frame: { t: 'move', to: { x: 10, y: 10 }, seq: 1 }, fields: ['to', 'to.y', 'seq'] },
  { frame: { t: 'look', look: LOOK }, fields: ['look', 'look.belly', 'look.species', 'look.wear.pet'] },
  { frame: { t: 'rest', asleep: true }, fields: ['asleep'] },
  { frame: { t: 'emote', e: EMOTE_IDS[0] }, fields: ['e'] },
  { frame: { t: 'say', n: 1 }, fields: ['n'] },
  { frame: { t: 'quests', r: 1 }, fields: ['r'] },
  { frame: { t: 'talk', npc: 'hub-elder', r: 1 }, fields: ['npc', 'r'] },
  { frame: { t: 'accept', quest: 'leaf-hunt', r: 1 }, fields: ['quest', 'r'] },
  { frame: { t: 'abandon', quest: 'leaf-hunt', r: 1 }, fields: ['quest'] },
  { frame: { t: 'handin', quest: 'leaf-hunt', r: 1 }, fields: ['quest'] },
  { frame: { t: 'use', target: 'hub-leaves', r: 1 }, fields: ['target', 'r'] },
  { frame: { t: 'gather', quest: 'leaf-hunt', n: 0, r: 1 }, fields: ['quest', 'n', 'r'] },
  { frame: { t: 'act', a: 'light', r: 1 }, fields: ['a', 'r'] },
  { frame: { t: 'act', a: 'note', e: EMOTE_IDS[0], r: 1 }, fields: ['e'] },
  { frame: { t: 'act', a: 'run', g: 'flight', r: 1 }, fields: ['g'] },
  { frame: { t: 'act', a: 'score', g: 'flight', s: 3, n: 2, k: 1, r: 1 }, fields: ['g', 's', 'n', 'k'] },
  { frame: { t: 'act', a: 'record', g: 'sling', s: 3, k: 1, r: 1 }, fields: ['g', 's', 'k'] },
  { frame: { t: 'act', a: 'ascent', k: 1, band: 1, r: 1 }, fields: ['k', 'band'] },
  { frame: { t: 'street', r: 1 }, fields: ['r'] },
  { frame: { t: 'nest', spot: 'f1', item: 'reading-chair', r: 1 }, fields: ['spot', 'item', 'r'] },
  { frame: { t: 'nest', open: true, r: 1 }, fields: ['open'] },
];

/** The frame with the value at a dotted path set (the objects on the way made as needed). */
function withValue(frame: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const out = structuredClone(frame);
  const keys = path.split('.');
  let at = out;
  for (const k of keys.slice(0, -1)) {
    if (typeof at[k] !== 'object' || at[k] === null) at[k] = {};
    at = at[k] as Record<string, unknown>;
  }
  at[keys.at(-1)!] = value;
  return out;
}

describe('hostile values in a page’s frames (OP-143)', () => {
  it('every frame a page sends is refused whole when any value in it is one of the audit’s strings', () => {
    for (const { frame, fields } of FRAMES) {
      expect(parseClientFrame(JSON.stringify(frame)), JSON.stringify(frame)).not.toBeNull();
      for (const field of fields) for (const v of HOSTILE) expect(parseClientFrame(JSON.stringify(withValue(frame, field, v))), `${String(frame['t'])}.${field}`).toBeNull();
    }
  });

  it('refuses a frame past its size, a frame that is not an object, and leaves no object the worse for a __proto__ in one', () => {
    expect(parseClientFrame(JSON.stringify({ t: 'say', n: 1, pad: 'x'.repeat(10_000) }))).toBeNull();
    for (const text of ['null', '"hello"', '[]', '42', "' OR '1'='1", '<img src=x onerror=alert(1)>', '\u0000']) expect(parseClientFrame(text)).toBeNull();
    const frame = parseClientFrame(`{"t":"hello","v":${EDGE_PROTOCOL_VERSION},"look":${JSON.stringify(LOOK)},"__proto__":{"polluted":true}}`);
    expect(frame).not.toBeNull();
    expect(Object.keys(frame!)).toEqual(['t', 'v', 'look']);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('hostile values in the shared checks the Worker uses (OP-143)', () => {
  it('an owl’s look, an email, a friend code, a time zone, a collectible and a nest are each refused', () => {
    for (const v of HOSTILE) {
      expect(isLook(v)).toBe(false);
      expect(isLook({ ...LOOK, body: v })).toBe(false);
      expect(normalEmail(v)).toBeNull();
      expect(isFriendCode(v)).toBe(false);
      expect(isTimeZone(v)).toBe(false);
      expect(isVariantId(v)).toBe(false);
      expect(isNestRoom(v)).toBe(false);
    }
  });

  it('a feedback note keeps a visitor’s words as plain words, a NUL dropped, and refuses words far too long or no words at all', () => {
    for (const v of HOSTILE) {
      const draft = parseFeedback({ kind: 'bug', text: v, room: v, screen: v });
      if (typeof v !== 'string' || v.length > 1000 || v.replace(/\u0000/g, '').length < 3) expect(draft).toBeNull();
      else expect(draft).toEqual({ kind: 'bug', text: v, room: null, screen: null });
      expect(parseFeedback({ kind: v, text: 'a fine note' })).toBeNull();
    }
    expect(parseFeedback({ kind: 'idea', text: 'more\u0000 lanterns' })?.text).toBe('more lanterns');
  });
});
