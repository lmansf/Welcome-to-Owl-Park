import { describe, expect, it } from 'vitest';
import { KIT_ART, START_NOTICES } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { NOTICE_ART, fitScale, isNoticeBoard, noticeFace, noticeLines } from './noticeBoard';

describe("a realm start's notice board (OP-478)", () => {
  const glass = ROOMS['glass']!;
  const post = (glass.pieces ?? []).find((p) => p.id === 'quest-post')!;

  it("writes the glass realm's lines on its quest post, the kit's notice board standing in", () => {
    expect(post).toBeDefined();
    expect(isNoticeBoard(post.key)).toBe(true);
    expect(noticeLines('glass', post)).toEqual(START_NOTICES['glass']);
    expect(noticeLines('glass', post).length).toBeGreaterThan(0);
  });

  it('writes nothing on any other piece, or on a post painted with its own art', () => {
    for (const p of glass.pieces ?? []) if (p.id !== 'quest-post') expect(noticeLines('glass', p), p.id).toEqual([]);
    expect(noticeLines('glass', { id: 'quest-post', key: 'kit-glass-trading-nest' })).toEqual([]);
    expect(noticeLines('nowhere', post)).toEqual([]);
  });

  it("writes on the board's face, inside the board's art wherever and however big it is drawn", () => {
    const art = KIT_ART[NOTICE_ART]!;
    for (const k of [1, 0.5, 2]) {
      const at = { x: 360, y: 320 };
      const size = { w: art.w * k, h: art.h * k };
      const face = noticeFace(at, size);
      expect(face.x).toBeGreaterThan(at.x);
      expect(face.y).toBeGreaterThan(at.y);
      expect(face.x + face.w).toBeLessThan(at.x + size.w);
      expect(face.y + face.h).toBeLessThan(at.y + size.h);
      // The face is under the roof and over the posts' feet, in the middle of the board.
      expect(Math.abs(face.x + face.w / 2 - (at.x + size.w / 2))).toBeLessThanOrEqual(2 * k);
      expect(face.y - at.y).toBeGreaterThan(size.h * 0.4);
      expect(face.y + face.h - at.y).toBeLessThan(size.h * 0.75);
    }
  });

  it('shrinks the words to fit the face, never grows them', () => {
    expect(fitScale({ w: 50, h: 20 }, { w: 112, h: 56 })).toBe(1);
    expect(fitScale({ w: 224, h: 20 }, { w: 112, h: 56 })).toBe(0.5);
    expect(fitScale({ w: 100, h: 112 }, { w: 112, h: 56 })).toBe(0.5);
  });
});
