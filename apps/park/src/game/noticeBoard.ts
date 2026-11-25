/**
 * The lines pinned on a realm start's notice board (OP-478, START_NOTICES in realmStart.ts): its quest
 * post stands in with the kit's plain notice board until the realm's own post is painted, and the board
 * stood blank. The words are written on the board's wooden face, in the room, so they scale with it and
 * stand behind an owl in front of the post. A realm's own post, once painted, has its words painted on
 * and gets none here.
 */
import type Phaser from 'phaser';
import { KIT_ART, START_NOTICES, type RoomPiece } from '@owl-park/shared';

/** The art the notes are written on: the kit's notice board. */
export const NOTICE_ART = 'kit-notice-board';
/** Its blank wooden face, in the art's own frame (240 x 300, measured from the art). */
const FACE = { x: 64, y: 150, w: 112, h: 56 } as const;
/** The ink the notes are written in: a dark brown on the pale wood. */
const INK = '#3a2614';
/** The notes' size on the board, before they are scaled down to fit its face (room px). */
const FONT_PX = 12;

/** A box in room pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether a piece's art is the kit's notice board: the board itself, or a realm's slot it stands in for. */
export function isNoticeBoard(key: string): boolean {
  return key === NOTICE_ART || KIT_ART[key]?.standIn === NOTICE_ART;
}

/** The lines a room's piece carries: a realm start's quest post, while the kit's notice board stands in for it. */
export function noticeLines(roomId: string, p: Pick<RoomPiece, 'id' | 'key'>): readonly string[] {
  if (p.id !== 'quest-post' || !isNoticeBoard(p.key)) return [];
  return START_NOTICES[roomId] ?? [];
}

/** The board's face in room pixels, for its art drawn with its frame's top left corner at `at`, `size` big. */
export function noticeFace(at: { x: number; y: number }, size: { w: number; h: number }): Box {
  const art = KIT_ART[NOTICE_ART]!;
  const kx = size.w / art.w;
  const ky = size.h / art.h;
  return { x: at.x + FACE.x * kx, y: at.y + FACE.y * ky, w: FACE.w * kx, h: FACE.h * ky };
}

/** The scale that keeps `words` of this size inside `box`, never bigger than as written. */
export function fitScale(words: { w: number; h: number }, box: { w: number; h: number }): number {
  return Math.min(1, box.w / Math.max(1, words.w), box.h / Math.max(1, words.h));
}

/** Writes a piece's notes on its board, if it has any: the text, or null. */
export function writeNotices(scene: Phaser.Scene, roomId: string, p: RoomPiece, img: Phaser.GameObjects.Image): Phaser.GameObjects.Text | null {
  const lines = noticeLines(roomId, p);
  if (!lines.length) return null;
  const face = noticeFace(img.getTopLeft(), { w: img.displayWidth, h: img.displayHeight });
  // Written at twice the size and scaled down, so the words stay sharp when the camera zooms in.
  const text = scene.add
    .text(face.x + face.w / 2, face.y + face.h / 2, lines.join('\n'), {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: `${FONT_PX * 2}px`,
      fontStyle: 'bold',
      color: INK,
      align: 'center',
      lineSpacing: 2,
      resolution: 2,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(p.y + 0.5)
    .setName(`${p.id}-notes`);
  const k = fitScale({ w: text.width / 2, h: text.height / 2 }, face);
  text.setScale(k / 2);
  // The words go as the board goes: see-through while an owl is behind it, away with it when a painting already shows it.
  const follow = () => text.setAlpha(img.alpha).setVisible(img.visible);
  scene.events.on('postupdate', follow);
  img.once('destroy', () => {
    scene.events.off('postupdate', follow);
    text.destroy();
  });
  return text;
}
