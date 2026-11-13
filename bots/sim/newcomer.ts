/**
 * The newcomer bot (OP-360): the plays a visitor makes first, and what comes of them.
 *
 * The kid bot (kid.ts) answers "can a kid who flies make this hop": it takes off from about the best
 * spot, steers back over the ledge in the air and lets go of Jump over it. The first phone runs of the
 * ink course after the cleanup (the play log, Nov 12) fell eleven times on a screen the kid bot rates
 * 100%, at every crossing, because a newcomer does none of that. A newcomer holds the stick toward
 * where it is going and presses Jump where the ground ends.
 *
 * So this bot holds one way from start to end and presses Jump once, where it is told and for as
 * long as it is told (a tap, or held until it next stands, which is a glide on the way down), with at
 * most a flap or two after it at times it is told. It never steers back and never lets go early. A
 * screen laid for newcomers takes every such play across: none of them is a fall.
 */
import { FLIGHT_STEP_MS, GROUNDED, type RoomDef } from '@owl-park/shared';
import { botRoom, owlAt, stepOwl, type Press } from './owl';
import { surfaceAt, surfacesOf } from './surfaces';

const STEP = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);

/** One newcomer's play. */
export interface Play {
  /** Jump is pressed as the owl passes this x, walking east; null: it only walks. */
  jumpAt: number | null;
  /** How long Jump is held from the press (ms); Infinity: until the owl next stands (it glides on the way down). */
  holdMs: number;
  /** Flaps after the jump: each this long after it (ms). */
  flaps?: readonly number[];
  /** How long each flap's press is held (ms); Infinity: until the owl next stands. */
  flapHoldMs?: number;
}

/** How a play ended: where the owl first stood at or past the goal (a surface's id, surfaces.ts), or `fall`; and every surface it stood on, in order. */
export interface PlayEnd {
  where: string;
  x: number;
  path: string[];
}

/** How long Jump is held, from a tap to the whole flight: what a thumb does without thinking about it. */
export const HOLDS: readonly number[] = [70, 150, 250, 400, Number.POSITIVE_INFINITY];

/** The longest a play is run (ms): three screens walked twice over. */
const PLAY_MS = 40_000;

/**
 * A play in `room`: from standing at `from` (`z` up over the ground line), the stick held east, to the
 * first time the owl stands at or past `goal`. A fall into the room's water or thorns ends it. It starts
 * at park time `t0`: a room whose ledges keep time (neon signs) is met as the clock has it then.
 */
export function playEast(room: RoomDef, from: { x: number; z: number }, goal: number, play: Play, t0 = 100_000): PlayEnd {
  const br = botRoom(room);
  const surfaces = surfacesOf(br);
  const o = owlAt(from.x, from.z, t0);
  const flaps = play.flaps ?? [];
  const flapHold = play.flapHoldMs ?? 0;
  const path: string[] = [];
  let jumpedAt = -1;
  for (let i = 0; i < STEP(PLAY_MS); i++) {
    let pressed = false;
    let held = false;
    if (play.jumpAt !== null) {
      if (jumpedAt < 0 && o.x >= play.jumpAt) {
        jumpedAt = i;
        pressed = true;
      }
      if (jumpedAt >= 0) {
        const since = (i - jumpedAt) * FLIGHT_STEP_MS;
        // Held "until it next stands": for the flight the press began, not for ever after it.
        const flying = o.fl.air.s !== GROUNDED || i === jumpedAt;
        held = Number.isFinite(play.holdMs) ? since < play.holdMs : flying;
        for (const f of flaps) {
          if (i === jumpedAt + STEP(f)) pressed = true;
          if (since >= f && (Number.isFinite(flapHold) ? since - f < flapHold : flying)) held = true;
        }
      }
    }
    const press: Press = { way: 1, pressed, held };
    if (stepOwl(br, o, press) === 'fall') return { where: 'fall', x: Math.round(o.x), path };
    if (o.fl.air.s === GROUNDED) {
      const s = surfaceAt(surfaces, o.x, o.fl.air.z);
      if (s && path[path.length - 1] !== s.id) path.push(s.id);
      if (o.x >= goal) return { where: s?.id ?? 'air', x: Math.round(o.x), path };
    }
    if (o.x >= room.size.w - 20) return { where: 'end', x: Math.round(o.x), path };
  }
  return { where: 'timeout', x: Math.round(o.x), path };
}
