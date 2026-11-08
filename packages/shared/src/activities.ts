/**
 * Things to do in the park (C30, approved 2026-10-19): the hub's lanterns, which a room lights
 * together; the quiz on the hub's stump stage, answered by standing in a zone; fishing from the
 * grove's jetty; the market robot owl's copy game; and three small tasks a day. Pure rules shared by
 * the room server, the local mode and the tests. Every number and every visitor-facing word here is
 * a default the owner may change; places and things are where the paintings have them.
 */
import { CABINETS } from './arcade';
import { pointInRect, type Rect } from './geometry';
import type { Vec2 } from './protocol';

// ---------- feathers ----------

/** Feathers from all the activities together, at most this many a park day per collector (the daily tasks pay on top). */
export const PLAY_FEATHERS_PER_DAY = 25;

// ---------- the lanterns ----------

export const LANTERN_ROOM = 'hub';

/** The paper lanterns hanging from the beam in the hub's west bay. */
export const LANTERNS: readonly { id: string; pos: Vec2 }[] = [
  { id: 'lantern-1', pos: { x: 752, y: 469 } },
  { id: 'lantern-2', pos: { x: 845, y: 483 } },
  { id: 'lantern-3', pos: { x: 938, y: 474 } },
  { id: 'lantern-4', pos: { x: 1002, y: 468 } },
  { id: 'lantern-5', pos: { x: 1079, y: 462 } },
  { id: 'lantern-6', pos: { x: 1172, y: 498 } },
  { id: 'lantern-7', pos: { x: 1242, y: 505 } },
];

/** The floor under the beam: an owl standing here can light a lantern. */
export const LANTERN_FLOOR: Rect = { x: 670, y: 690, w: 660, h: 150 };
/** The owl lights the dark lantern nearest above it, at most this far to either side. */
export const LANTERN_REACH_X = 90;
/** A lantern burns this long, unless the whole beam is lit: long enough for one owl alone, walking along the beam, if it keeps at it. */
export const LANTERN_BURN_MS = 25_000;
/** One owl lights one lantern this often, so a beam lit together goes quicker than one lit alone. */
export const LANTERN_EVERY_MS = 2_500;
/** Every lantern lit at once: the beam glows this long, then goes dark for the next round. */
export const LANTERN_GLOW_MS = 45_000;
/** Each owl that helped light a full beam earns this, plus one for every other owl that helped (up to four more). */
export const LANTERN_FEATHERS = 4;
export const LANTERN_HELP_BONUS_MAX = 4;

export interface LanternState {
  /** Lantern id -> when it goes out; absent while dark. */
  lit: Record<string, number>;
  /** While the whole beam glows: until when; 0 otherwise. */
  glowUntil: number;
  /** Owls that lit a lantern since the beam was last all dark: visitor id -> when they last lit one. */
  helpers: Record<string, number>;
}

export function darkLanterns(): LanternState {
  return { lit: {}, glowUntil: 0, helpers: {} };
}

/** The lanterns as they are at `now`: burnt-out ones dark, a finished glow over. */
export function lanternsAt(s: LanternState, now: number): LanternState {
  if (s.glowUntil) return now < s.glowUntil ? s : darkLanterns();
  const lit: Record<string, number> = {};
  for (const [id, until] of Object.entries(s.lit)) if (until > now) lit[id] = until;
  // Once every lantern is dark the round starts over: owls who lit a beam that went out count no more.
  return { lit, glowUntil: 0, helpers: Object.keys(lit).length ? s.helpers : {} };
}

export type LightResult =
  | {
      ok: true;
      id: string;
      state: LanternState;
      /** The beam is full: the owls that lit it (the lighter included); null until then. */
      full: string[] | null;
    }
  | { ok: false; reason: 'far' | 'lit' | 'busy' | 'glowing' };

/** Whether an owl at `pos` stands on the floor under the beam (`slack`: extra room for latency). */
export function underBeam(pos: Vec2, slack = 0): boolean {
  const f = LANTERN_FLOOR;
  return pos.x >= f.x - slack && pos.x <= f.x + f.w + slack && pos.y >= f.y - slack && pos.y <= f.y + f.h + slack;
}

/** An owl at `pos` lights the dark lantern nearest above it. */
export function lightLantern(prev: LanternState, by: string, pos: Vec2, now: number, slack = 0): LightResult {
  const s = lanternsAt(prev, now);
  if (s.glowUntil) return { ok: false, reason: 'glowing' };
  if (!underBeam(pos, slack)) return { ok: false, reason: 'far' };
  const last = s.helpers[by];
  if (last !== undefined && now - last < LANTERN_EVERY_MS) return { ok: false, reason: 'busy' };
  const reach = LANTERNS.filter((l) => Math.abs(l.pos.x - pos.x) <= LANTERN_REACH_X + slack);
  if (!reach.length) return { ok: false, reason: 'far' };
  const dark = reach.filter((l) => !(l.id in s.lit)).sort((a, b) => Math.abs(a.pos.x - pos.x) - Math.abs(b.pos.x - pos.x));
  const pick = dark[0];
  if (!pick) return { ok: false, reason: 'lit' };
  const lit = { ...s.lit, [pick.id]: now + LANTERN_BURN_MS };
  const helpers = { ...s.helpers, [by]: now };
  if (Object.keys(lit).length < LANTERNS.length) return { ok: true, id: pick.id, state: { lit, glowUntil: 0, helpers }, full: null };
  const glowUntil = now + LANTERN_GLOW_MS;
  const all: Record<string, number> = {};
  for (const l of LANTERNS) all[l.id] = glowUntil;
  return { ok: true, id: pick.id, state: { lit: all, glowUntil, helpers: {} }, full: Object.keys(helpers) };
}

/** What each owl that helped light a full beam earns, with `helpers` owls in all. */
export function lanternFeathers(helpers: number): number {
  return LANTERN_FEATHERS + Math.min(LANTERN_HELP_BONUS_MAX, Math.max(0, helpers - 1));
}

// ---------- the stage quiz ----------

export const QUIZ_ROOM = 'hub';
/** The stump stage in the hub's east bay, where the question hangs. */
export const QUIZ_STAGE: Vec2 = { x: 3900, y: 630 };
export type QuizZone = 'a' | 'b' | 'c';
export const QUIZ_ZONE_IDS: readonly QuizZone[] = ['a', 'b', 'c'];
/** The three answer zones on the floor in front of the stage, left to right. */
export const QUIZ_ZONES: Readonly<Record<QuizZone, Rect>> = {
  a: { x: 3560, y: 750, w: 200, h: 120 },
  b: { x: 3800, y: 750, w: 200, h: 120 },
  c: { x: 4040, y: 750, w: 200, h: 120 },
};
/** A question starts this often (on the park clock, the same for everyone)... */
export const QUIZ_EVERY_MS = 90_000;
/** ...and stays open this long: where an owl stands when it closes is its answer... */
export const QUIZ_OPEN_MS = 20_000;
/** ...then the right answer shows this long. */
export const QUIZ_SHOW_MS = 8_000;
/** Feathers for standing in the right zone. */
export const QUIZ_FEATHERS = 3;

export interface QuizQuestion {
  text: string;
  /** The right answer first; the zones get them in a different order every round. */
  answers: readonly [string, string, string];
}

/** Owl facts, for everyone (visitor-facing words). */
export const QUIZ_BANK: readonly QuizQuestion[] = [
  { text: 'How far round can a great horned owl turn its head?', answers: ['About three quarters of the way', 'All the way round, twice', 'Only a little, like us'] },
  { text: 'What is a group of owls called?', answers: ['A parliament', 'A pod', 'A gaggle'] },
  { text: 'Which owl has a heart-shaped face?', answers: ['The barn owl', 'The snowy owl', 'The great horned owl'] },
  { text: 'Where do burrowing owls nest?', answers: ['In holes in the ground', 'At the tops of tall pines', 'On floating reeds'] },
  { text: 'What is a baby owl called?', answers: ['An owlet', 'A cub', 'A cygnet'] },
  { text: 'What lets an owl fly almost without a sound?', answers: ['Soft, fringed feathers', 'Very short wings', 'Holding its breath'] },
  { text: 'Which owl is white and lives in the far north?', answers: ['The snowy owl', 'The screech owl', 'The burrowing owl'] },
  { text: 'Why do owls turn their heads so far?', answers: ["Their eyes can't move in their sockets", 'To keep their necks warm', 'To count the stars'] },
  { text: "The tufts on a great horned owl's head are...", answers: ['Feathers, not ears', 'Its ears', 'Little horns'] },
  { text: 'Which sense lets a barn owl catch mice in the dark?', answers: ['Its hearing', 'Its sense of smell', 'Its sense of taste'] },
  { text: 'How many toes does an owl have on each foot?', answers: ['Four', 'Three', 'Six'] },
  { text: 'When are most owls awake and hunting?', answers: ['At night', 'At noon', 'Only on rainy days'] },
  { text: "Owls cough up little pellets. What's inside?", answers: ["Bones and fur they can't digest", 'Seeds for planting', 'Spare feathers'] },
  { text: 'Which owl might live in an old woodpecker hole?', answers: ['The screech owl', 'The snowy owl', 'The burrowing owl'] },
  { text: 'What sound is a great horned owl known for?', answers: ['A deep hoo-hoo-hoooo', 'A loud quack', 'A whistle like a kettle'] },
  { text: 'What do owls earn in Owl Park for quests and leaf piles?', answers: ['Feathers', 'Gold coins', 'Acorn tokens'] },
];

/** Rounds walk through the bank this many questions at a time, so every question comes up before any repeats. */
export const QUIZ_STRIDE = 7;

const ORDERS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [1, 2, 0],
  [2, 0, 1],
  [1, 0, 2],
  [0, 2, 1],
  [2, 1, 0],
];

export interface QuizRound {
  /** Round number on the park clock. */
  n: number;
  startsAt: number;
  /** The question closes and the answer shows. */
  revealAt: number;
  /** The answer stops showing. */
  endsAt: number;
  /** Index into QUIZ_BANK. */
  question: number;
  /** For zones a, b and c: which of the question's answers stands there. */
  order: readonly [number, number, number];
  /** The zone of the right answer. */
  right: QuizZone;
}

export function quizRound(n: number): QuizRound {
  const startsAt = n * QUIZ_EVERY_MS;
  const order = ORDERS[(((n * 5 + 1) % ORDERS.length) + ORDERS.length) % ORDERS.length]!;
  const right = QUIZ_ZONE_IDS[order.indexOf(0)]!;
  const len = QUIZ_BANK.length;
  return { n, startsAt, revealAt: startsAt + QUIZ_OPEN_MS, endsAt: startsAt + QUIZ_OPEN_MS + QUIZ_SHOW_MS, question: (((n * QUIZ_STRIDE + 3) % len) + len) % len, order, right };
}

/** The round that started last at `now` (its question may be open, showing its answer, or done). */
export function quizRoundAt(now: number): QuizRound {
  return quizRound(Math.floor(now / QUIZ_EVERY_MS));
}

/** The answer zone an owl at `p` stands in, if any. */
export function quizZoneAt(p: Vec2): QuizZone | null {
  for (const z of QUIZ_ZONE_IDS) if (pointInRect(p, QUIZ_ZONES[z])) return z;
  return null;
}

// ---------- fishing ----------

export const FISHING_ROOM = 'grove';
/** The end of the jetty over the grove's pond: an owl standing here can cast. */
export const FISHING_SPOT: Vec2 = { x: 965, y: 630 };
export const FISHING_REACH = 80;
/** Where the bobber floats, out on the water past the jetty. */
export const BOBBER_AT: Vec2 = { x: 1085, y: 618 };
/** A fish bites after a random wait in this range... */
export const BITE_AFTER_MS: readonly [number, number] = [2_500, 8_000];
/** ...and stays on the hook this long. */
export const BITE_WINDOW_MS = 1_400;
/** One cast per owl this often. */
export const CAST_EVERY_MS = 1_500;

export interface FishDef {
  id: string;
  /** Visitor-facing: "You caught a silver minnow!" */
  name: string;
  /** Chance out of the table's total weight. */
  weight: number;
  feathers: number;
}

export const FISH: readonly FishDef[] = [
  { id: 'minnow', name: 'a silver minnow', weight: 40, feathers: 1 },
  { id: 'perch', name: 'a striped perch', weight: 28, feathers: 2 },
  { id: 'trout', name: 'a speckled trout', weight: 17, feathers: 3 },
  { id: 'catfish', name: 'a whiskery catfish', weight: 8, feathers: 4 },
  { id: 'boot', name: 'an old boot', weight: 5, feathers: 0 },
  { id: 'koi', name: 'a golden koi', weight: 2, feathers: 8 },
];

export function getFish(id: string): FishDef | undefined {
  return FISH.find((f) => f.id === id);
}

/** How long until a fish bites, from a uniform random source. */
export function biteDelay(rnd: () => number): number {
  const [lo, hi] = BITE_AFTER_MS;
  return Math.round(lo + rnd() * (hi - lo));
}

/** What bites, from a uniform random source. */
export function rollFish(rnd: () => number): FishDef {
  const total = FISH.reduce((s, f) => s + f.weight, 0);
  let x = rnd() * total;
  for (const f of FISH) {
    x -= f.weight;
    if (x < 0) return f;
  }
  return FISH[0]!;
}

export type ReelOutcome = 'early' | 'caught' | 'late';

/** Reeling in at `now` for a bite at `biteAt`; `slack` allows for the trip to the server. */
export function reelOutcome(biteAt: number, now: number, slack = 0): ReelOutcome {
  if (now < biteAt - Math.min(slack, 200)) return 'early';
  if (now > biteAt + BITE_WINDOW_MS + slack) return 'late';
  return 'caught';
}

// ---------- the robot owl's copy game ----------

export const COPY_ROOM = 'market';
/** In front of the giant robot owl, beside the voting spot: standing here offers the game. */
export const COPY_SPOT: Rect = { x: 1390, y: 700, w: 180, h: 110 };
/** The first tune has this many notes, and each copied tune one more, up to the longest. */
export const COPY_FIRST = 3;
export const COPY_LAST = 7;
/** The robot plays one note this often... */
export const COPY_NOTE_MS = 700;
/** ...and then waits this long for each note of the owl's answer. */
export const COPY_WAIT_MS = 6_000;
/** Feathers for each tune copied, and on top for the longest. */
export const COPY_FEATHERS = 1;
export const COPY_WIN_FEATHERS = 3;
/** A tune uses at most this many different emotes, from the ones the owl owns. */
export const COPY_EMOTES = 4;
/** Every owl owns these (the starter pack), so every owl can play. */
export const COPY_BASE_EMOTES: readonly string[] = ['hoot', 'flap'];

export interface CopyGame {
  /** The emotes the robot uses this game. */
  notes: string[];
  tune: string[];
  /** Notes of the tune copied so far. */
  got: number;
  /** Tunes copied so far this game. */
  level: number;
  /** The robot is still playing the tune until then. */
  listenUntil: number;
  /** The next note must come by then. */
  deadline: number;
}

/** The emotes a game uses: the starter pair first, then up to two more the owl owns. */
export function copyNotes(owned: readonly string[], rnd: () => number): string[] {
  const extra = owned.filter((e) => !COPY_BASE_EMOTES.includes(e)).sort();
  const picked: string[] = [];
  while (extra.length && picked.length < COPY_EMOTES - COPY_BASE_EMOTES.length) picked.push(extra.splice(Math.floor(rnd() * extra.length), 1)[0]!);
  return [...COPY_BASE_EMOTES, ...picked];
}

function tuneOf(notes: readonly string[], length: number, rnd: () => number): string[] {
  return Array.from({ length }, () => notes[Math.floor(rnd() * notes.length)]!);
}

function listenFor(tune: readonly string[], now: number): { listenUntil: number; deadline: number } {
  const listenUntil = now + tune.length * COPY_NOTE_MS + 400;
  return { listenUntil, deadline: listenUntil + COPY_WAIT_MS };
}

export function startCopy(owned: readonly string[], rnd: () => number, now: number): CopyGame {
  const notes = copyNotes(owned, rnd);
  const tune = tuneOf(notes, COPY_FIRST, rnd);
  return { notes, tune, got: 0, level: 0, ...listenFor(tune, now) };
}

export type CopyStep =
  /** Right note; the tune goes on. */
  | { kind: 'note'; game: CopyGame }
  /** The whole tune copied: feathers, and the next, longer tune. */
  | { kind: 'tune'; game: CopyGame; feathers: number }
  /** The longest tune copied: the game is won. */
  | { kind: 'won'; level: number; feathers: number }
  /** Wrong note or too slow: the game is over. */
  | { kind: 'wrong' | 'slow'; level: number; expected: string }
  /** The robot is still playing: the note is ignored. */
  | { kind: 'early'; game: CopyGame };

/** The owl plays emote `e` while the robot waits for the next note. */
export function copyNote(g: CopyGame, e: string, rnd: () => number, now: number): CopyStep {
  if (now < g.listenUntil) return { kind: 'early', game: g };
  const expected = g.tune[g.got]!;
  if (now > g.deadline) return { kind: 'slow', level: g.level, expected };
  if (e !== expected) return { kind: 'wrong', level: g.level, expected };
  const got = g.got + 1;
  if (got < g.tune.length) return { kind: 'note', game: { ...g, got, deadline: now + COPY_WAIT_MS } };
  const level = g.level + 1;
  if (g.tune.length >= COPY_LAST) return { kind: 'won', level, feathers: COPY_FEATHERS + COPY_WIN_FEATHERS };
  const tune = tuneOf(g.notes, g.tune.length + 1, rnd);
  return { kind: 'tune', game: { notes: g.notes, tune, got: 0, level, ...listenFor(tune, now) }, feathers: COPY_FEATHERS };
}

/** Whether the robot is still waiting for the owl at `now` (a game nobody answers ends by itself). */
export function copyAlive(g: CopyGame, now: number): boolean {
  return now <= g.deadline;
}

// ---------- three small tasks a day ----------

export type TaskKind = 'light' | 'beam' | 'fish' | 'quiz' | 'copy' | 'arcade' | 'flop' | 'browse';

export interface TaskDef {
  kind: TaskKind;
  count: number;
  /** Visitor-facing. */
  text: string;
}

/** A round of any game in the arcade (C40); it joins the tasks at a game once a cabinet plays. */
export const ARCADE_TASK: TaskDef = { kind: 'arcade', count: 1, text: 'Play a round in the arcade' };

/** The day's first task is at the lanterns, the second at a game, the third around the park; never the same kind twice. */
export const TASK_SLOTS: ReadonlyArray<readonly TaskDef[]> = [
  [
    { kind: 'light', count: 3, text: 'Light 3 lanterns on the beam' },
    { kind: 'light', count: 5, text: 'Light 5 lanterns on the beam' },
    { kind: 'beam', count: 1, text: 'Light the whole lantern beam' },
  ],
  [
    { kind: 'fish', count: 1, text: 'Catch a fish at the pond' },
    { kind: 'fish', count: 3, text: 'Catch 3 fish at the pond' },
    { kind: 'quiz', count: 1, text: 'Answer a stage quiz question right' },
    { kind: 'copy', count: 1, text: "Copy one of the robot owl's tunes" },
    ...(CABINETS.some((c) => c.live) ? [ARCADE_TASK] : []),
  ],
  [
    { kind: 'flop', count: 2, text: 'Flop into 2 leaf piles' },
    { kind: 'browse', count: 2, text: 'Browse 2 market stalls' },
    { kind: 'quiz', count: 1, text: 'Answer a stage quiz question right' },
    { kind: 'copy', count: 2, text: "Copy 2 of the robot owl's tunes" },
  ],
];

/** Feathers for each task done, and on top for all three. */
export const TASK_FEATHERS = 4;
export const TASKS_BONUS = 8;

/** A small stable hash of a string (FNV-1a), for picking the day's tasks. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** The park day's three tasks, the same for everyone. */
export function dailyTasks(day: string): TaskDef[] {
  const out: TaskDef[] = [];
  TASK_SLOTS.forEach((slot, i) => {
    const options = slot.filter((t) => !out.some((o) => o.kind === t.kind));
    out.push(options[hash(`${day}|${i}`) % options.length]!);
  });
  return out;
}

/** Something done in the park that may count toward the day's tasks. */
export interface PlayEvent {
  kind: TaskKind;
}

/** Progress after an event: the new counts, and which tasks it finished (indexes). */
export function taskProgress(tasks: readonly TaskDef[], counts: readonly number[], ev: PlayEvent): { counts: number[]; finished: number[] } {
  const next = tasks.map((_, i) => counts[i] ?? 0);
  const finished: number[] = [];
  tasks.forEach((t, i) => {
    if (t.kind !== ev.kind || next[i]! >= t.count) return;
    next[i] = next[i]! + 1;
    if (next[i] === t.count) finished.push(i);
  });
  return { counts: next, finished };
}

/** Today's tasks as a visitor sees them. */
export interface TaskView {
  day: string;
  /** When they change (the next park midnight), ms. */
  endsAt: number;
  tasks: Array<{ text: string; count: number; done: number }>;
  /** All three done and the bonus paid. */
  bonus: boolean;
}
