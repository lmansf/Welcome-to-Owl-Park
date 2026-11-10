/**
 * Feather Fall (OP-314): feathers in the owl's own colour drift down from the canopy; the owl flies
 * along the forest floor to catch them and dodges the pinecones that fall too. Every owl has the same
 * fall of feathers, so it is fair, and its own owl's catch is all that counts for it. On a phone a drag
 * left and right; on a computer the arrow keys. The server stamps every input, and works out each
 * owl's catches from where its inputs flew it.
 */
import { between, draw, pick, type Dice } from './rng';
import { inputsOf, miniPlaces, type MiniInput, type MiniPlayer, type MiniResult, type MinigameDef, type StampedInput } from './minigame';

export const FALL_FIELD = { w: 1000, h: 600 } as const;
/** Where the owls fly, and how far up the top of the field is above where things fall from. */
export const FALL_OWL_Y = 520;
const FALL_TOP = -20;
export const FALL_OWL_START = 500;
/** How fast an owl flies to where it was sent (field px/s). */
export const FALL_OWL_SPEED = 900;
/** How far either side of an owl's middle it catches a feather, and a pinecone hits it. */
export const FEATHER_REACH = 62;
export const CONE_REACH = 44;
/** A pinecone that hits takes this many feathers back (never below none). */
export const CONE_COST = 2;
const FEATHER_SPEED = 170;
const CONE_SPEED = 300;
export const FALL_MS = 40_000;
/** Inputs a seat may send: no faster than this, and no more than so many in one game. */
const MIN_GAP_MS = 200;
const MAX_INPUTS = 220;

export interface FallItem {
  /** When it starts falling (ms from the start), and from where across. */
  t: number;
  x: number;
  kind: 'feather' | 'cone';
  /** A feather sways as it falls: its sway's phase (radians). */
  ph: number;
}

export interface FeatherFallState {
  players: MiniPlayer[];
  items: FallItem[];
  inputs: StampedInput[];
}

const fallSpeed = (it: FallItem) => (it.kind === 'feather' ? FEATHER_SPEED : CONE_SPEED);

/** When a thing reaches the owls' line (ms from the start). */
export function crossesAt(it: FallItem): number {
  return it.t + ((FALL_OWL_Y - FALL_TOP) / fallSpeed(it)) * 1000;
}

/** Where a thing is at `t`: across and down the field. */
export function itemAt(it: FallItem, t: number): { x: number; y: number } {
  const s = Math.max(0, t - it.t) / 1000;
  const y = FALL_TOP + fallSpeed(it) * s;
  const x = it.kind === 'feather' ? it.x + 38 * Math.sin(it.ph + s * 2.4) : it.x;
  return { x, y };
}

/** Where a seat's owl is across the field at `t`, flown from its start to each place its inputs sent it. */
export function owlX(inputs: readonly StampedInput[], seat: number, t: number): number {
  let x = FALL_OWL_START;
  let target = FALL_OWL_START;
  let at = 0;
  for (const i of inputs) {
    if (i.seat !== seat || i.k !== 'x') continue;
    if (i.t > t) break;
    x = flyToward(x, target, i.t - at);
    target = i.v;
    at = i.t;
  }
  return flyToward(x, target, t - at);
}

function flyToward(x: number, target: number, ms: number): number {
  const step = (FALL_OWL_SPEED * Math.max(0, ms)) / 1000;
  return Math.abs(target - x) <= step ? target : x + Math.sign(target - x) * step;
}

/** A seat's catch up to `t`: feathers caught, pinecones that hit it, and its score. */
export function fallScore(s: FeatherFallState, seat: number, t: number): { feathers: number; cones: number; score: number } {
  let feathers = 0;
  let cones = 0;
  let score = 0;
  for (const it of s.items) {
    const at = crossesAt(it);
    if (at > t) continue;
    const dx = Math.abs(itemAt(it, at).x - owlX(s.inputs, seat, at));
    if (it.kind === 'feather' && dx <= FEATHER_REACH) {
      feathers++;
      score++;
    } else if (it.kind === 'cone' && dx <= CONE_REACH) {
      cones++;
      score = Math.max(0, score - CONE_COST);
    }
  }
  return { feathers, cones, score };
}

function makeItems(d: Dice): FallItem[] {
  const items: FallItem[] = [];
  const last = FALL_MS - 3_600;
  for (let t = 600; t < last; t += between(d, 480, 640)) items.push({ t, x: between(d, 70, 930), kind: 'feather', ph: Math.round(draw(d) * 628) / 100 });
  for (let t = 2_200; t < last; t += between(d, 1_400, 2_000)) items.push({ t, x: between(d, 80, 920), kind: 'cone', ph: 0 });
  return items.sort((a, b) => a.t - b.t);
}

/** A park owl's flying: it goes for most feathers, a little off, and misses some; it never minds the pinecones. */
function botInputs(d: Dice, seat: number, items: readonly FallItem[]): StampedInput[] {
  const out: StampedInput[] = [];
  // It sets off for a feather once the last one it went for has come down, never before.
  let free = 0;
  for (const it of items) {
    if (it.kind !== 'feather' || draw(d) > 0.8) continue;
    const at = crossesAt(it);
    const t = Math.max(free + 30, Math.round(at - 900 - pick(d, 300)));
    if (t >= at - 150) continue;
    out.push({ seat, k: 'x', v: Math.round(Math.max(0, Math.min(1000, itemAt(it, at).x + between(d, -40, 40)))), t });
    free = at;
  }
  return out;
}

export const FEATHER_FALL: MinigameDef<FeatherFallState> = {
  id: 'feather-fall',
  name: 'Feather Fall',
  kind: 'all',
  stream: 'inputs',
  ms: FALL_MS,
  how: { phone: 'Drag left and right to catch your feathers. Dodge the pinecones!', keys: 'Left and right arrows to catch your feathers. Dodge the pinecones!' },
  start(players, seed) {
    const d: Dice = { s: seed };
    const items = makeItems(d);
    const inputs = players.filter((p) => p.bot).flatMap((p) => botInputs(d, p.seat, items));
    return { players: [...players], items, inputs: inputs.sort((a, b) => a.t - b.t) };
  },
  input(s, seat, input: MiniInput, t) {
    if (input.k !== 'x' || t < 0 || t > FALL_MS) return false;
    const player = s.players.find((p) => p.seat === seat);
    if (!player || player.bot) return false;
    const mine = inputsOf(s.inputs, seat);
    if (mine.length >= MAX_INPUTS || (mine.length && t - mine.at(-1)!.t < MIN_GAP_MS)) return false;
    const stamped: StampedInput = { seat, k: 'x', v: Math.round(Math.max(0, Math.min(1000, input.v))), t };
    // Kept in time order: a bot's inputs are planned ahead, a page's come as they are made.
    let i = s.inputs.length;
    while (i > 0 && s.inputs[i - 1]!.t > t) i--;
    s.inputs.splice(i, 0, stamped);
    return true;
  },
  tick() {},
  due: () => null,
  over: (_s, t) => t >= FALL_MS,
  result(s) {
    const scores: Record<number, number> = {};
    for (const p of s.players) scores[p.seat] = fallScore(s, p.seat, FALL_MS).score;
    return { scores, places: miniPlaces(scores) } satisfies MiniResult;
  },
  view(s, _seat, t) {
    const scores: Record<number, number> = {};
    for (const p of s.players) scores[p.seat] = fallScore(s, p.seat, t).score;
    return { items: s.items, inputs: s.inputs, scores };
  },
};
