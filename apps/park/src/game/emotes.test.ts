import { describe, expect, it, vi } from 'vitest';
import { playEmote } from './emotes';

// The emotes only drive what the host hands them; no Phaser runs here.
vi.mock('phaser', () => ({ default: {} }));
vi.mock('./symbols', () => ({ symbolTexture: () => 'symbol' }));

/** An owl as the emotes see it, its pose a plain record of what was set, and the tweens they started. */
function fakeOwl() {
  const started: Array<{ onComplete?: () => void }> = [];
  const killed: unknown[] = [];
  const scene = { tweens: { add: (t: { onComplete?: () => void }) => started.push(t), killTweensOf: (t: unknown) => killed.push(t) } };
  const pose = {
    scene: scene as unknown,
    set: [] as string[],
    setPosition(this: { set: string[] }) {
      this.set.push('position');
      return this;
    },
    setRotation(this: { set: string[] }) {
      return this;
    },
    setScale(this: { set: string[] }) {
      return this;
    },
    setAlpha(this: { set: string[] }) {
      return this;
    },
  };
  const host = { scene, x: 0, y: 0, depth: 0, pose, facing: () => 1, forward: () => 1, anchor: () => ({ x: 0, y: 0 }), closeEyes: () => {} };
  return { host: host as never, pose, started, killed };
}

describe('emotes (OP-126)', () => {
  it('puts the pose back when an emote ends', () => {
    const owl = fakeOwl();
    expect(playEmote(owl.host, 'hop')).toBe(true);
    owl.pose.set.length = 0;
    owl.started[0]!.onComplete!();
    expect(owl.pose.set).toEqual(['position']);
    expect(owl.killed).toContain(owl.pose);
  });

  it('does nothing when an emote ends after its owl is gone (the room torn down while the page waits)', () => {
    const owl = fakeOwl();
    playEmote(owl.host, 'bow');
    // A destroyed game object has no scene.
    owl.pose.scene = undefined;
    owl.pose.set.length = 0;
    expect(() => owl.started[0]!.onComplete!()).not.toThrow();
    expect(owl.pose.set).toEqual([]);
  });
});
