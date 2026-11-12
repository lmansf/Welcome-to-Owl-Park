import { JUMP_RISE, WALK_SPEED } from '@owl-park/shared';

/**
 * The camera in a room seen from the side (OP-351): where it looks, worked out each frame from
 * where the owl is and what it is doing. Rules only, nothing of the browser or the game engine in it.
 *
 * What it changes from the camera a room seen from above has (the owl dead centre, eased by a fixed
 * share each frame), which these rooms had too until Nov 12:
 * - It looks ahead. A course is played by jumping at what is next, and with the owl dead centre the next
 *   ledge or pit is half a screen away at best. The view leads the owl the way it is going, up to
 *   `LEAD_SHARE` of the screen, more of it the faster the owl travels, and swings round unhurried when
 *   the owl turns.
 * - It does not bob. A hop on the spot rose and fell the whole view with it. The view holds the height
 *   the owl last stood at through a whole jump (`BAND_UP` is a jump's rise and a little), and climbs
 *   only with what goes higher: a flap on top of the jump, or rising air.
 * - It keeps up. The view is carried along with the owl before it eases to where it looks (OP-352), so
 *   what trails is only what is left over: a walking owl has its whole lead on the screen (an ease
 *   alone trails a walk by 40 px, more than half the lead in a view as narrow as 442 px), a falling owl
 *   stays `BAND_DOWN` under the height held and no more (what is below is what matters then), and an
 *   owl in rising air `LIFT_BAND` over it.
 * - It eases by the clock. A share of the way each frame is half the camera at half the frames, so on a
 *   slow phone the view trailed the owl. The same time gives the same ease at any frame rate.
 *
 * TODO-DOCS (OP-351): docs/ARCHITECTURE.md's client rules, the camera: in a room seen from the side
 * the view leads the owl's travel, holds its height through a jump, is carried with the owl and eases
 * by time (sideCamera.ts). On for every visitor since the owner's word of Nov 12 (it was behind a
 * `?cam=1` flag until then).
 */

/** What the camera follows and how it stands: the point looked at (room px), the lead it has now, and the height it holds (px above the ground line). */
export interface SideCam {
  x: number;
  y: number;
  lead: number;
  level: number;
}

/** The owl as the camera needs it. */
export interface CamOwl {
  /** Where its feet's spot on the ground line is (room px). */
  x: number;
  y: number;
  /** How high it is over that (px), and whether it stands on something. */
  z: number;
  grounded: boolean;
  /** How fast it travels along (px/s, to the right is positive; the scene's `speedAlong`), and up (px/s, a fall is negative). */
  vx: number;
  vz: number;
  /** Whether rising air has it: a gust's column, a wind. */
  lifted: boolean;
  /** The way it faces. */
  facing: 1 | -1;
}

/** The most of the screen's width the view leads by. */
export const LEAD_SHARE = 0.16;
/** The lead an owl standing still keeps, of the most: it looks the way it faces, a little. */
export const LEAD_AT_REST = 0.35;
/** The speed (px/s) at and over which the lead is at its most (an owl's walk), and under which the owl counts as still. */
export const LEAD_FULL_SPEED = WALK_SPEED;
export const LEAD_STILL_SPEED = 30;
/** How long the lead takes to come most of the way round (ms): unhurried, so a quick turn does not throw the view. */
export const LEAD_MS = 520;
/** How long the view takes to come most of the way to where it looks (ms), across and down, and up (slower: a climb is read, not chased). */
export const EASE_MS = 150;
export const LEVEL_MS = 240;
/**
 * How far over the height it holds an owl may be before the view climbs with it: a whole jump and a
 * little, or in rising air a little only (the air is taking it up, and what is above is where it is going).
 * And how far under before the view follows it down (px).
 */
export const BAND_UP = Math.ceil(JUMP_RISE) + 12;
export const LIFT_BAND = 40;
export const BAND_DOWN = 24;
/** The longest step the camera takes at once (ms): a frame that took longer (a page that stalled) is eased over the frames after it, not jumped. */
export const STEP_MOST_MS = 250;

/** The share of the way covered in `dtMs` by an ease that covers about two thirds of it in `ms` (1 for no time constant). */
export function eased(dtMs: number, ms: number): number {
  if (ms <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, dtMs) / ms);
}

/**
 * Carried, then eased: something `from` its mark by `off` is first taken along with what it follows
 * (`carried`, how far that went this step), and what is left of `off` is eased away. So what moves
 * steadily is followed with nothing trailing, at any frame rate, and only a start, a stop or a jump of
 * the mark is eased.
 */
function carriedTo(mark: number, was: number, carried: number, dtMs: number, ms: number): number {
  return mark + (was + carried - mark) * (1 - eased(dtMs, ms));
}

/** The lead the view is making for: the way the owl travels, more of it the faster; the way it faces, a little, when it is still. */
export function leadFor(owl: Pick<CamOwl, 'vx' | 'facing'>, viewW: number): number {
  const most = LEAD_SHARE * viewW;
  const speed = Math.abs(owl.vx);
  if (speed < LEAD_STILL_SPEED) return owl.facing * most * LEAD_AT_REST;
  const t = Math.min(1, speed / LEAD_FULL_SPEED);
  return Math.sign(owl.vx) * most * (LEAD_AT_REST + (1 - LEAD_AT_REST) * t);
}

/** The height the view is making for: where the owl stands; in the air, the height held unless the owl is out of its band. */
export function levelFor(level: number, owl: Pick<CamOwl, 'z' | 'grounded' | 'lifted'>): number {
  if (owl.grounded) return owl.z;
  const up = owl.lifted ? LIFT_BAND : BAND_UP;
  if (owl.z > level + up) return owl.z - up;
  if (owl.z < level - BAND_DOWN) return owl.z + BAND_DOWN;
  return level;
}

/**
 * The height held, `dtMs` on. Where the owl stands, it is eased to (up slower than down). Under its
 * band (a fall, a glide down) and in rising air the owl is taking the band's edge with it: the height
 * is carried by how far the owl went, never past the edge, so the view is with a fall from the frame
 * it leaves the band and not a moment behind it. A flap over a jump is short, and is eased up to.
 */
function levelStep(level: number, owl: CamOwl, dtMs: number): number {
  const to = levelFor(level, owl);
  if (to === level) return level;
  const went = (owl.vz * dtMs) / 1000;
  if (!owl.grounded && to < level) return Math.max(to, carriedTo(to, level, Math.min(0, went), dtMs, EASE_MS));
  if (!owl.grounded && owl.lifted) return Math.min(to, carriedTo(to, level, Math.max(0, went), dtMs, LEVEL_MS));
  return level + (to - level) * eased(dtMs, to < level ? EASE_MS : LEVEL_MS);
}

/** The camera as a room starts or the owl is put somewhere (a fall): on the owl, at its height, looking the way it faces. */
export function sideCamAt(owl: Pick<CamOwl, 'x' | 'y' | 'z' | 'facing'>, viewW: number): SideCam {
  const lead = leadFor({ vx: 0, facing: owl.facing }, viewW);
  return { x: owl.x + lead, y: owl.y - owl.z, lead, level: owl.z };
}

/**
 * The camera `dtMs` on: its lead and its height brought toward what the owl is doing, and the view
 * carried along with the owl (its travel this step, and the height's own change) and eased to the two.
 */
export function sideCamStep(cam: SideCam, owl: CamOwl, viewW: number, dtMs: number): SideCam {
  const lead = cam.lead + (leadFor(owl, viewW) - cam.lead) * eased(dtMs, LEAD_MS);
  const level = levelStep(cam.level, owl, dtMs);
  const x = carriedTo(owl.x + lead, cam.x, (owl.vx * dtMs) / 1000, dtMs, EASE_MS);
  const y = carriedTo(owl.y - level, cam.y, cam.level - level, dtMs, EASE_MS);
  return { x, y, lead, level };
}

/** How long the owl's speed is averaged over (ms): a frame's own step is too rough to steer a camera by. */
export const SPEED_MS = 120;

/** The owl's speed along (px/s) from the speed it had and how far it has come in `dtMs`: eased, so one long frame or one short one does not swing the lead. */
export function speedAlong(had: number, dx: number, dtMs: number): number {
  if (dtMs <= 0) return had;
  return had + ((dx / dtMs) * 1000 - had) * eased(dtMs, SPEED_MS);
}
