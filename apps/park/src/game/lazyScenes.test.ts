import { afterEach, describe, expect, it, vi } from 'vitest';

// The scenes themselves need the engine: here each is a stand-in class, fetched as the page fetches it.
const fetches = { arcade: 0, climb: 0, fail: 0 };
vi.mock('./ArcadeScene', () => {
  fetches.arcade += 1;
  if (fetches.fail > 0) {
    fetches.fail -= 1;
    throw new Error('offline');
  }
  return { ArcadeScene: class ArcadeStandIn {} };
});
vi.mock('./ClimbScene', () => {
  fetches.climb += 1;
  return { ClimbScene: class ClimbStandIn {} };
});

const { sceneReady } = await import('./lazyScenes');

/** A game's scene list: add puts a scene in at once, or (mid-frame) at the next frame. */
function scenesOf(midFrame = false) {
  const keys = new Map<string, unknown>();
  const added: string[] = [];
  return {
    added,
    plugin: {
      get: (key: string) => keys.get(key) ?? null,
      add: (key: string, scene: unknown) => {
        added.push(key);
        if (midFrame) requestAnimationFrame(() => keys.set(key, scene));
        else keys.set(key, scene);
        return midFrame ? null : scene;
      },
    } as unknown as Phaser.Scenes.ScenePlugin,
  };
}

vi.stubGlobal('requestAnimationFrame', (f: () => void) => setTimeout(f, 0));

afterEach(() => {
  fetches.fail = 0;
});

describe('the scenes fetched on first play (OP-204)', () => {
  it('adds the scene once, however often it is asked for', async () => {
    const s = scenesOf();
    await sceneReady(s.plugin, 'climb');
    await sceneReady(s.plugin, 'climb');
    expect(s.added).toEqual(['climb']);
    expect(s.plugin.get('climb')).not.toBeNull();
  });

  it('waits for a scene added mid-frame to be taken at the next frame', async () => {
    const s = scenesOf(true);
    await sceneReady(s.plugin, 'climb');
    expect(s.plugin.get('climb')).not.toBeNull();
  });

  it('fails when the fetch fails, and fetches again the next time', async () => {
    fetches.fail = 1;
    const s = scenesOf();
    await expect(sceneReady(s.plugin, 'arcade')).rejects.toThrow();
    await sceneReady(s.plugin, 'arcade');
    expect(s.added).toEqual(['arcade']);
  });
});
