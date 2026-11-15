import { describe, expect, it } from 'vitest';
import { DEFAULT_ANCHORS } from '../collect/pixels';
import { HEAD_FRAMES, HEAD_KEYS, LOOK_AROUND, LOOK_MS, drawHeadShapes, headBox, headFaceKey, headKey, headPlaceholder, headPlaceholderFor, headPose, isHeadKey, lookStepAt } from './headTurn';

describe('the look around (OP-289)', () => {
  it('turns front, three-quarter, side, back and round by the other side to the front, in about 1.2 s', () => {
    expect(LOOK_AROUND.map((s) => `${s.frame}${s.side > 0 ? '' : "'"}`)).toEqual(['3q', 'side', 'back', "side'", "3q'", 'front']);
    expect(LOOK_MS).toBe(1200);
    // The back is held longest; it ends on the front.
    expect(Math.max(...LOOK_AROUND.map((s) => s.ms))).toBe(LOOK_AROUND.find((s) => s.frame === 'back')!.ms);
    expect(lookStepAt(0).frame).toBe('3q');
    expect(lookStepAt(500).frame).toBe('back');
    expect(lookStepAt(LOOK_MS + 100).frame).toBe('front');
  });

  it('squashes the in-between frames a little, hides glasses from behind and keeps the hat on', () => {
    expect(headPose('front')).toEqual({ squashY: 1, faceWear: { dx: 0, sx: 1, visible: true }, hat: { sx: 1 } });
    for (const f of ['3q', 'side'] as const) {
      expect(headPose(f).squashY).toBeLessThan(1);
      expect(headPose(f).squashY).toBeGreaterThan(0.9);
    }
    // Glasses slide toward the beak and narrow as the head turns.
    expect(headPose('side').faceWear.dx).toBeGreaterThan(headPose('3q').faceWear.dx);
    expect(headPose('side').faceWear.sx).toBeLessThan(headPose('3q').faceWear.sx);
    expect(headPose('back').faceWear.visible).toBe(false);
    expect(headPose('back').hat.sx).toBe(1);
  });

  it('draws each frame from two named swap slots, so an artist’s heads drop in by file', () => {
    expect(HEAD_FRAMES).toEqual(['front', '3q', 'side', 'back']);
    expect(headKey('3q')).toBe('owl-head-3q');
    expect(headFaceKey('back')).toBe('owl-head-back-face');
    expect([...HEAD_KEYS].sort()).toEqual(
      ['owl-head-front', 'owl-head-front-face', 'owl-head-3q', 'owl-head-3q-face', 'owl-head-side', 'owl-head-side-face', 'owl-head-back', 'owl-head-back-face'].sort(),
    );
    expect(isHeadKey('owl-head-side')).toBe(true);
    expect(isHeadKey('owl-face')).toBe(false);
  });

  it('stands in with plain heads: the front empty (the painted face shows), the others covering it', () => {
    expect(headPlaceholder('front')).toEqual({ base: [], face: [] });
    const box = headBox(DEFAULT_ANCHORS);
    // It covers the painted face: from above the brow to below the chin, wider than the eyes.
    expect(box.y - box.ry).toBeLessThan(DEFAULT_ANCHORS.brow);
    expect(box.y + box.ry).toBeGreaterThan(DEFAULT_ANCHORS.chin);
    expect(box.rx * 2).toBeGreaterThan(DEFAULT_ANCHORS.eyes.w);
    for (const f of ['3q', 'back'] as const) {
      const [head] = headPlaceholder(f).base;
      expect(head).toMatchObject({ kind: 'ellipse', x: box.x, y: box.y, w: box.rx * 2, h: box.ry * 2, colour: 0xffffff });
    }
    // The base is white, for the body colour; eyes and beak are on the detail layer, looking right.
    const eyes = (f: '3q' | 'side' | 'back') => headPlaceholder(f).face.filter((s) => s.kind === 'ellipse' && s.colour === 0xf6f1e3);
    expect(eyes('3q')).toHaveLength(2);
    expect(eyes('side')).toHaveLength(1);
    expect(eyes('back')).toHaveLength(0);
    for (const f of ['3q', 'side'] as const) {
      const beak = headPlaceholder(f).face.find((s) => s.kind === 'triangle')!;
      expect(beak.kind === 'triangle' && Math.min(beak.pts[0], beak.pts[2], beak.pts[4])).toBeGreaterThan(box.x);
    }
    expect(headPlaceholderFor('owl-head-side')).toEqual(headPlaceholder('side').base);
    expect(headPlaceholderFor('owl-head-side-face')).toEqual(headPlaceholder('side').face);
    expect(headPlaceholderFor('owl-face')).toBeNull();
  });

  it('draws the stand-ins with the graphics calls', () => {
    const calls: string[] = [];
    const g = {
      fillStyle: (c: number, a: number) => calls.push(`style ${c.toString(16)} ${a}`),
      fillEllipse: () => calls.push('ellipse'),
      fillTriangle: () => calls.push('triangle'),
    };
    drawHeadShapes(g, headPlaceholder('side').face);
    expect(calls).toEqual(['style f6f1e3 1', 'ellipse', 'style c1e36 1', 'ellipse', 'style c9a227 1', 'triangle']);
  });
});
