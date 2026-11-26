import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomFor } from '../rooms';
import { solidPerchMark } from './walkFloor';
import { workBoxesShown } from './workBoxes';

vi.mock('phaser', () => ({ default: {} }));
// The stand-ins' pictures load at once here: what matters is which piece is drawn, not the download.
vi.mock('./art', () => ({ artScale: () => 1, loadArtKey: async () => true }));

/** A scene that only records what is drawn on it: the words of each text and the key of each picture. */
function recordingScene() {
  const texts: string[] = [];
  const images: string[] = [];
  const any = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, p) => (p === 'scene' ? {} : p === 'width' || p === 'height' ? 100 : () => any()),
      },
    );
  const scene = {
    add: {
      graphics: () => any(),
      rectangle: () => any(),
      container: () => any(),
      text: (_x: number, _y: number, words: string) => {
        texts.push(words);
        return any();
      },
      image: (_x: number, _y: number, key: string) => {
        images.push(key);
        return any();
      },
    },
    registry: { get: () => undefined },
    textures: { exists: () => false },
    events: { on: () => undefined, off: () => undefined },
  };
  return { scene, texts, images };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const sized = (texts: string[]) => texts.filter((t) => /\d+×\d+/.test(t));

afterEach(() => vi.unstubAllGlobals());

describe('the work boxes (the Nov 25 QA walk: size boxes showed to every visitor)', () => {
  it('show only on a painter’s or a keeper’s tab', () => {
    expect(workBoxesShown('')).toBe(false);
    expect(workBoxesShown('?room=m3-hall')).toBe(false);
    expect(workBoxesShown('?sizes=1')).toBe(false);
    expect(workBoxesShown('?paint=1')).toBe(true);
    expect(workBoxesShown('?room=m3-hall&keeper=1')).toBe(true);
  });

  it('draw the feather station as the park’s signboard with the game’s name, and the lane with no size on it', async () => {
    vi.stubGlobal('location', { search: '?room=m3-hall' });
    const { TagLayer } = await import('./tagLayer');
    const { scene, texts, images } = recordingScene();
    new TagLayer({ scene: scene as never, hudRoot: () => null, toast: () => undefined, me: () => 'me', posOf: () => null });
    await settle();
    expect(sized(texts)).toEqual([]);
    expect(images).toEqual(['kit-clearing-sign-board']);
    expect(texts).toEqual(['Feather tag']);
  });

  it('draw the Old Stump as the park’s stump, its seats as nothing', async () => {
    vi.stubGlobal('location', { search: '' });
    const { PartyLayer } = await import('./partyLayer');
    const { STUMP_ROOM } = await import('@owl-park/shared');
    const { scene, texts, images } = recordingScene();
    new PartyLayer({ scene: scene as never, room: STUMP_ROOM, hudRoot: () => null, toast: () => undefined, walkTo: () => undefined, goTo: () => undefined, back: () => undefined });
    await settle();
    expect(sized(texts)).toEqual([]);
    expect(images).toEqual(['decor-stump-table']);
  });

  it('draw the bowling lane with no outline’s size on it', async () => {
    vi.stubGlobal('location', { search: '' });
    const { BowlLayer } = await import('./bowlLayer');
    const { scene, texts } = recordingScene();
    new BowlLayer({ scene: scene as never, hudRoot: () => null, myPos: () => ({ x: 0, y: 0 }), drawLane: true });
    expect(sized(texts)).toEqual([]);
  });

  it('keep every size box for a painter', async () => {
    vi.stubGlobal('location', { search: '?paint=1' });
    const { TagLayer } = await import('./tagLayer');
    const { scene, texts, images } = recordingScene();
    new TagLayer({ scene: scene as never, hudRoot: () => null, toast: () => undefined, me: () => 'me', posOf: () => null });
    await settle();
    expect(sized(texts).length).toBe(2);
    expect(images).toEqual([]);
  });

  it('shade the ink garden’s bench and the glass realm’s lanterns over the painting, outlining them only for a painter', () => {
    for (const [room, perch] of [
      ['ink', 'ink-bench'],
      ['glass', 'glass-lantern-west'],
      ['glass', 'glass-lantern-east'],
    ] as const) {
      const r = roomFor(room)!;
      expect(r.perches?.find((p) => p.id === perch)?.solid, `${room} ${perch}`).toBe(true);
      expect(solidPerchMark(r, perch, false), `${room} ${perch}`).toBe('footprint');
      expect(solidPerchMark(r, perch, true), `${room} ${perch}`).toBe('outline');
    }
  });
});
