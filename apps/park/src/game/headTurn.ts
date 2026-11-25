/**
 * The look around (OP-289): the owl's head turns on its own layer through front, three-quarter, side
 * and back and round to the front again, while the body stays still. Logan, Nov 6: "an emote should
 * be a full head turn".
 *
 * The head is drawn by frame from named swap slots on the 200 x 240 owl canvas, so an artist's
 * finished heads drop in by file: `owl-head-<frame>`, a white layer drawn in the owl's body colour
 * like `owl-body`, and `owl-head-<frame>-face` over it in its own colours (eyes, beak, markings). Until
 * those files ship, plain stand-ins are drawn (art.ts ensurePlaceholder). The front frame's stand-in
 * is empty, so the owl's own painted face shows; a shipped front head is drawn over it.
 *
 * The frames are painted looking to the right of the canvas; a turn the other way mirrors them about
 * the middle of the head. No Phaser here, so the timeline and the stand-ins can be tested.
 */
import { DEFAULT_ANCHORS, type OwlAnchors } from '../collect/pixels';

export const HEAD_FRAMES = ['front', '3q', 'side', 'back'] as const;
export type HeadFrame = (typeof HEAD_FRAMES)[number];

/** The emote's id (shared FREE_EMOTES): every owl has it. */
export const LOOK_EMOTE = 'look';
/** What the wheel calls it. */
export const LOOK_NAME = 'Look around';

/** The base layer of a frame's head (drawn in the body colour). */
export function headKey(frame: HeadFrame): string {
  return `owl-head-${frame}`;
}

/** The detail layer of a frame's head (its own colours). */
export function headFaceKey(frame: HeadFrame): string {
  return `${headKey(frame)}-face`;
}

/** Every swap slot of the head, base and detail, for the art list. */
export const HEAD_KEYS: readonly string[] = HEAD_FRAMES.flatMap((f) => [headKey(f), headFaceKey(f)]);

export function isHeadKey(key: string): boolean {
  return HEAD_KEYS.includes(key);
}

/** One step of the look around: the frame drawn, which way it looks (1: the owl's forward side), and for how long. */
export interface LookStep {
  frame: HeadFrame;
  side: 1 | -1;
  ms: number;
}

/**
 * Front, three-quarter, side, back, then round by the other side to the front: a full look round,
 * about 1.2 s (the ticket's default). The back is held longest, the front is the settle at the end.
 */
export const LOOK_AROUND: readonly LookStep[] = [
  { frame: '3q', side: 1, ms: 140 },
  { frame: 'side', side: 1, ms: 160 },
  { frame: 'back', side: 1, ms: 400 },
  { frame: 'side', side: -1, ms: 160 },
  { frame: '3q', side: -1, ms: 140 },
  { frame: 'front', side: 1, ms: 200 },
];

export const LOOK_MS = LOOK_AROUND.reduce((t, s) => t + s.ms, 0);

/** The step of the look around `t` ms in (the last one past its end). */
export function lookStepAt(t: number): LookStep {
  let end = 0;
  for (const s of LOOK_AROUND) {
    end += s.ms;
    if (t < end) return s;
  }
  return LOOK_AROUND[LOOK_AROUND.length - 1]!;
}

/**
 * How the head layer is drawn on a frame, looking to the right: the in-between frames are squashed a
 * little (about the neck), glasses slide toward the beak and narrow, and are hidden from behind; a hat
 * narrows a touch as it turns and stays on from behind.
 */
export interface HeadPose {
  /** Vertical scale of the head about the neck. */
  squashY: number;
  /** Face wear: shift along the head (a share of its width), its width as a share of front-on, and whether it shows. */
  faceWear: { dx: number; sx: number; visible: boolean };
  /** Head wear: its width as a share of front-on. */
  hat: { sx: number };
}

export function headPose(frame: HeadFrame): HeadPose {
  switch (frame) {
    case 'front':
      return { squashY: 1, faceWear: { dx: 0, sx: 1, visible: true }, hat: { sx: 1 } };
    case '3q':
      return { squashY: 0.97, faceWear: { dx: 0.18, sx: 0.72, visible: true }, hat: { sx: 0.94 } };
    case 'side':
      return { squashY: 0.97, faceWear: { dx: 0.36, sx: 0.3, visible: true }, hat: { sx: 0.88 } };
    case 'back':
      return { squashY: 1, faceWear: { dx: 0, sx: 1, visible: false }, hat: { sx: 1 } };
  }
}

/** A shape of a stand-in head, in owl canvas pixels. */
export type HeadShape =
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number; colour: number; alpha: number }
  | { kind: 'triangle'; pts: [number, number, number, number, number, number]; colour: number; alpha: number };

const CREAM = 0xf6f1e3;
const NIGHT = 0x0c1e36;
const BEAK = 0xc9a227;

/**
 * The head's middle and size on the canvas from an owl's anchors: centred between crown and chin
 * over the eyes, wide enough to cover the painted face (the face disc runs wider than the eyes).
 */
export function headBox(a: OwlAnchors = DEFAULT_ANCHORS): { x: number; y: number; rx: number; ry: number } {
  const rx = Math.max(a.head.w, a.eyes.w * 1.25) / 2 + 4;
  const ry = (a.chin - a.head.y) / 2 + 8;
  return { x: a.eyes.x, y: (a.head.y + a.chin) / 2, rx, ry };
}

/**
 * The stand-in shapes of a frame's two layers (looking right), on the great horned owl's canvas: a
 * plain head in the body colour, and its eyes and beak, or from behind a few darker feathers. The
 * front's stand-in is empty: the owl's own painted face is its front.
 */
export function headPlaceholder(frame: HeadFrame, a: OwlAnchors = DEFAULT_ANCHORS): { base: HeadShape[]; face: HeadShape[] } {
  const h = headBox(a);
  const eye = (x: number, r: number): HeadShape[] => [
    { kind: 'ellipse', x, y: a.eyes.y, w: r * 2, h: r * 2, colour: CREAM, alpha: 1 },
    { kind: 'ellipse', x: x + r * 0.15, y: a.eyes.y + 1, w: r, h: r, colour: NIGHT, alpha: 1 },
  ];
  const head = (rx: number): HeadShape => ({ kind: 'ellipse', x: h.x, y: h.y, w: rx * 2, h: h.ry * 2, colour: 0xffffff, alpha: 1 });
  switch (frame) {
    case 'front':
      return { base: [], face: [] };
    case '3q': {
      const beakX = h.x + h.rx * 0.38;
      return {
        base: [head(h.rx)],
        face: [
          ...eye(h.x - h.rx * 0.18, 13),
          ...eye(h.x + h.rx * 0.42, 16),
          { kind: 'triangle', pts: [beakX - 8, a.chin - 18, beakX + 10, a.chin - 18, beakX + 4, a.chin - 2], colour: BEAK, alpha: 1 },
        ],
      };
    }
    case 'side': {
      const tip = h.x + h.rx * 0.98;
      return {
        base: [head(h.rx * 0.9)],
        face: [...eye(h.x + h.rx * 0.45, 14), { kind: 'triangle', pts: [tip - 14, a.chin - 26, tip - 14, a.chin - 8, tip + 8, a.chin - 14], colour: BEAK, alpha: 1 }],
      };
    }
    case 'back':
      return {
        base: [head(h.rx)],
        face: [-0.4, 0, 0.4].map((k): HeadShape => ({ kind: 'ellipse', x: h.x + h.rx * k, y: h.y + 6, w: 14, h: h.ry * 1.1, colour: NIGHT, alpha: 0.16 })),
      };
  }
}

/** The stand-in shapes for a head slot key, or null for a key that is not one. */
export function headPlaceholderFor(key: string): HeadShape[] | null {
  for (const f of HEAD_FRAMES) {
    if (key === headKey(f)) return headPlaceholder(f).base;
    if (key === headFaceKey(f)) return headPlaceholder(f).face;
  }
  return null;
}

/** Draw stand-in shapes on anything with Phaser's Graphics calls. */
export function drawHeadShapes(
  g: { fillStyle(c: number, a: number): unknown; fillEllipse(x: number, y: number, w: number, h: number): unknown; fillTriangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): unknown },
  shapes: readonly HeadShape[],
): void {
  for (const s of shapes) {
    g.fillStyle(s.colour, s.alpha);
    if (s.kind === 'ellipse') g.fillEllipse(s.x, s.y, s.w, s.h);
    else g.fillTriangle(...s.pts);
  }
}
