import { describe, expect, it } from 'vitest';
import { PUZZLE_SYMBOLS } from '../puzzles';
import { BALANCE_MS, BALANCE_TIMES, BRANCH_BALANCE, PICK_MS, REVEAL_MS, windOf, type BranchBalanceState } from './branchBalance';
import { BRANCH_LENGTH, CREEP_SPEED, GRACE_MS, HEAD_MS, HEAD_TURN, creepAt, watcherAt, type HeadTurnState } from './headTurn';
import { miniBerries, type MiniPlayer, type MinigameDef } from './minigame';
import { MINIGAMES } from './minigames';
import { PAIRS_HOLES, PAIRS_MS, PAIR_SHOW_MS, PEEK_MS, PERCH_PAIRS, type PerchPairsState } from './perchPairs';
import { AIR_MS, UPDRAFT_COLUMNS, UPDRAFT_GOAL, UPDRAFT_MS, UPDRAFT_RACE, airAt, flightAt, type UpdraftState } from './updraftRace';
import { PARTY_MINIGAMES } from './game';

const humans = (n: number): MiniPlayer[] => Array.from({ length: n }, (_, seat) => ({ seat, bot: false }));
const bots = (n: number): MiniPlayer[] => Array.from({ length: n }, (_, seat) => ({ seat, bot: true }));

/** Runs a minigame by itself, ticking it whenever it asks, to its end; the time it ended. */
function playOut<S>(def: MinigameDef<S>, s: S): number {
  let t = 0;
  for (let i = 0; i < 5_000; i++) {
    def.tick(s, Math.min(t, def.ms));
    if (def.over(s, t) || t >= def.ms) return t;
    const next = def.due(s, t);
    t = next === null ? def.ms : Math.max(t + 1, Math.min(next, def.ms));
  }
  throw new Error('never ended');
}

describe('the six minigames', () => {
  it('are all built, each with its own name, rules for a phone and a keyboard, and a way to follow it', () => {
    expect(Object.keys(MINIGAMES).sort()).toEqual([...PARTY_MINIGAMES].sort());
    for (const id of PARTY_MINIGAMES) {
      const def = MINIGAMES[id]!;
      expect(def.id).toBe(id);
      expect(def.how.phone.length).toBeGreaterThan(10);
      expect(def.how.keys.length).toBeGreaterThan(10);
      expect(['inputs', 'view']).toContain(def.stream);
      expect(def.ms).toBeLessThanOrEqual(60_000);
    }
  });

  it('play to an end with park owls alone, two to four of them, with a place for every seat', () => {
    for (const id of PARTY_MINIGAMES) {
      for (const n of [2, 3, 4]) {
        const def = MINIGAMES[id]!;
        const s = def.start(bots(n), 1234 + n, n);
        const end = playOut(def, s);
        expect(end, `${id} ${n}`).toBeLessThanOrEqual(def.ms);
        const r = def.result(s);
        expect(Object.keys(r.places).map(Number).sort(), `${id} ${n}`).toEqual(Array.from({ length: n }, (_, i) => i));
        for (const p of Object.values(r.places)) expect(p).toBeGreaterThanOrEqual(1);
        expect(Object.keys(miniBerries(def.kind, r))).toHaveLength(n);
      }
    }
  });

  it('turn away inputs from a seat not playing, a park owl, or of the wrong kind', () => {
    const wrong = { 'updraft-race': { k: 'tap', v: 1 }, 'head-turn': { k: 'dir', v: 1 }, 'perch-pairs': { k: 'hold', v: 1 }, 'branch-balance': { k: 'x', v: 1 } } as const;
    for (const [id, bad] of Object.entries(wrong)) {
      const def = MINIGAMES[id as keyof typeof wrong]!;
      const s = def.start([{ seat: 0, bot: false }, { seat: 1, bot: true }], 7, 1);
      expect(def.input(s, 0, bad, 2_000), id).toBe(false);
      expect(def.input(s, 3, { k: 'tap', v: 0 }, 2_000), id).toBe(false);
      expect(def.input(s, 1, { k: 'tap', v: 0 }, 2_000), id).toBe(false);
    }
  });
});

describe('Updraft Race', () => {
  const still = (): number[][] => Array.from({ length: UPDRAFT_MS / AIR_MS }, () => Array.from({ length: UPDRAFT_COLUMNS }, () => 0));

  it('climbs on a flap and sinks on a glide, and lets an owl flap only while it has breath', () => {
    const s: UpdraftState = { players: humans(2), air: still(), inputs: [] };
    expect(UPDRAFT_RACE.input(s, 0, { k: 'hold', v: 1 }, 0)).toBe(true);
    // 90 px/s for as long as its breath lasts (100 at 30 a second), then it only glides.
    const flown = flightAt(s, 0, 3_000);
    expect(flown.alt).toBeGreaterThan(250);
    expect(flown.breath).toBeLessThan(15);
    // Still holding, out of breath: it glides down until it has its breath back.
    const winded = flightAt(s, 0, 3_500);
    expect(winded.winded).toBe(true);
    expect(flightAt(s, 0, 4_500).alt).toBeLessThan(winded.alt);
    // The owl that never flapped stays on the ground.
    expect(flightAt(s, 1, 6_000).alt).toBe(0);
  });

  it('lifts an owl in warm air and pulls it down in cold, so steering into the updraft wins', () => {
    const air = still();
    for (const row of air) {
      row[0] = 2;
      row[5] = -1;
    }
    const s: UpdraftState = { players: humans(2), air, inputs: [] };
    // Seat 0 starts in column 1 and steers left into the updraft; seat 1 starts in column 4 and steers right into the cold.
    expect(UPDRAFT_RACE.input(s, 0, { k: 'dir', v: -1 }, 0)).toBe(true);
    expect(UPDRAFT_RACE.input(s, 1, { k: 'dir', v: 1 }, 0)).toBe(true);
    expect(flightAt(s, 0, 100).col).toBe(0);
    expect(flightAt(s, 1, 100).col).toBe(5);
    expect(airAt(air, 1_000, 0)).toBe(2);
    const winner = flightAt(s, 0, UPDRAFT_MS);
    expect(winner.doneAt).not.toBeNull();
    expect(winner.alt).toBe(UPDRAFT_GOAL);
    expect(flightAt(s, 1, UPDRAFT_MS).alt).toBe(0);
    expect(UPDRAFT_RACE.result(s).places).toEqual({ 0: 1, 1: 2 });
    // An owl at the top sends nothing more.
    expect(UPDRAFT_RACE.input(s, 0, { k: 'hold', v: 1 }, UPDRAFT_MS - 100)).toBe(false);
  });

  it('takes holds and single steps only, not too fast, and ends as soon as every owl is up', () => {
    const s = UPDRAFT_RACE.start(humans(2), 5, 1);
    expect(UPDRAFT_RACE.input(s, 0, { k: 'dir', v: 2 }, 100)).toBe(false);
    expect(UPDRAFT_RACE.input(s, 0, { k: 'hold', v: 2 }, 100)).toBe(false);
    expect(UPDRAFT_RACE.input(s, 0, { k: 'hold', v: 1 }, 100)).toBe(true);
    expect(UPDRAFT_RACE.input(s, 0, { k: 'dir', v: 1 }, 150)).toBe(false);
    expect(UPDRAFT_RACE.input(s, 0, { k: 'dir', v: 1 }, 250)).toBe(true);
    const b = UPDRAFT_RACE.start(bots(3), 11, 1);
    const end = playOut(UPDRAFT_RACE, b);
    // Park owls reach the top, and the race does not wait out its whole time once they all have.
    for (const seat of [0, 1, 2]) expect(flightAt(b, seat, end).doneAt).not.toBeNull();
    expect(end).toBeLessThan(UPDRAFT_MS);
  });
});

describe('Head-Turn Freeze', () => {
  const turns = [{ away: 1_000, rustle: 4_000, watch: 4_500, until: 6_000 }];

  it('creeps an owl while the watcher looks away, and sends one that keeps creeping back to the start', () => {
    const s: HeadTurnState = { players: humans(3), turns, inputs: [] };
    // Seat 0 creeps through the rustle and stops just in time; seat 1 keeps going and is caught; seat 2 holds from the start.
    expect(HEAD_TURN.input(s, 0, { k: 'hold', v: 1 }, 1_000)).toBe(true);
    expect(HEAD_TURN.input(s, 0, { k: 'hold', v: 0 }, 4_500 + GRACE_MS - 50)).toBe(true);
    expect(HEAD_TURN.input(s, 1, { k: 'hold', v: 1 }, 1_000)).toBe(true);
    expect(HEAD_TURN.input(s, 2, { k: 'hold', v: 1 }, 0)).toBe(true);
    expect(watcherAt(turns, 500).look).toBe('watch');
    expect(watcherAt(turns, 2_000).look).toBe('away');
    expect(watcherAt(turns, 4_200).look).toBe('rustle');
    expect(watcherAt(turns, 5_000)).toEqual({ look: 'watch', since: 4_500 });
    const kept = creepAt(s, 0, 5_500);
    expect(kept.pos).toBeGreaterThan(CREEP_SPEED * 3.5);
    expect(kept.caught).toBe(0);
    const caught = creepAt(s, 1, 5_500);
    expect(caught.pos).toBe(0);
    expect(caught.caught).toBe(1);
    expect(caught.frozen).toBe(true);
    // Before the watcher first looks away, nobody creeps.
    expect(creepAt(s, 2, 900).pos).toBe(0);
  });

  it('never sends the watcher’s next turn to a page, only how it looks now', () => {
    const s = HEAD_TURN.start(humans(2), 3, 1);
    const v = HEAD_TURN.view(s, 0, 2_000) as Record<string, unknown>;
    expect(Object.keys(v).sort()).toEqual(['grace', 'length', 'look', 'owls', 'since', 'speed', 't']);
    expect(JSON.stringify(v)).not.toContain('rustle":');
    expect(JSON.stringify(v)).not.toContain('until');
  });

  it('wins for the first owl to the watcher; park owls get there, now and then caught on the way', () => {
    const s = HEAD_TURN.start(bots(4), 21, 1);
    const end = playOut(HEAD_TURN, s);
    const r = HEAD_TURN.result(s);
    const first = Object.entries(r.places).find(([, p]) => p === 1)!;
    expect(creepAt(s, Number(first[0]), end).pos).toBe(BRANCH_LENGTH);
    // Over a few games park owls get caught now and then, never all the time.
    let caught = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = HEAD_TURN.start(bots(4), seed * 7_919, 1);
      const at = playOut(HEAD_TURN, g);
      for (const seat of [0, 1, 2, 3]) caught += creepAt(g, seat, at).caught;
    }
    expect(caught).toBeGreaterThan(0);
    expect(caught).toBeLessThan(20);
    expect(HEAD_TURN.input(s, 0, { k: 'hold', v: 1 }, 1_000)).toBe(false);
  });
});

describe('Perch Pairs', () => {
  /** A board laid out in pairs side by side: holes 0 and 1 a pair, 2 and 3, and so on. */
  function laidOut(players: MiniPlayer[]): PerchPairsState {
    const s = PERCH_PAIRS.start(players, 1, 1);
    s.holes = PUZZLE_SYMBOLS.flatMap((sym) => [sym, sym]);
    return s;
  }

  it('hides what each hole holds until it is peeked into, and plays two teams', () => {
    const s = PERCH_PAIRS.start(humans(4), 9, 1);
    expect(s.holes).toHaveLength(PAIRS_HOLES);
    for (const sym of PUZZLE_SYMBOLS) expect(s.holes.filter((h) => h === sym)).toHaveLength(2);
    expect(s.teams).toEqual([
      [0, 2],
      [1, 3],
    ]);
    const v = PERCH_PAIRS.view(s, 0, 0) as { holes: (string | null)[] };
    expect(v.holes.every((h) => h === null)).toBe(true);
  });

  it('keeps a pair found for its team and that owl goes again; a miss closes and the other team goes', () => {
    const s = laidOut(humans(2));
    const first = s.seat;
    const other = 1 - first;
    // Only the owl whose turn it is may peek.
    expect(PERCH_PAIRS.input(s, other, { k: 'tap', v: 0 }, 100)).toBe(false);
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 0 }, 100)).toBe(true);
    expect((PERCH_PAIRS.view(s, other, 100) as { holes: (string | null)[] }).holes[0]).toBe(s.holes[0]);
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 0 }, 200)).toBe(false);
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 1 }, 300)).toBe(true);
    expect(s.pairs[s.team]).toBe(1);
    expect(s.seat).toBe(first);
    // Now a miss: both stay open a moment, then close, and the turn passes.
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 2 }, 400)).toBe(true);
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 4 }, 500)).toBe(true);
    expect(s.closing).toBe(true);
    expect(PERCH_PAIRS.input(s, first, { k: 'tap', v: 6 }, 600)).toBe(false);
    PERCH_PAIRS.tick(s, 500 + PAIR_SHOW_MS);
    expect(s.seat).toBe(other);
    expect(s.open).toEqual([]);
    expect((PERCH_PAIRS.view(s, first, 2_000) as { holes: (string | null)[] }).holes.filter((h) => h !== null)).toHaveLength(2);
  });

  it('passes the turn when an owl does not peek in time, and a team with more pairs wins; level is a draw', () => {
    const s = laidOut(humans(2));
    const first = s.seat;
    PERCH_PAIRS.tick(s, PEEK_MS);
    expect(s.seat).toBe(1 - first);
    expect(PERCH_PAIRS.result(s).winningTeam).toBeNull();
    s.pairs[s.team === 0 ? 1 : 0] = 2;
    const r = PERCH_PAIRS.result(s);
    expect(r.winningTeam).toBe(s.team === 0 ? 1 : 0);
    expect(miniBerries('team', r)).toEqual(s.team === 0 ? { 0: 2, 1: 8 } : { 0: 8, 1: 2 });
  });

  it('lets park owls play by themselves: they remember most of what they see and find every pair', () => {
    const s = PERCH_PAIRS.start(bots(4), 33, 1);
    const end = playOut(PERCH_PAIRS, s);
    expect(end).toBeLessThan(PAIRS_MS);
    expect(s.found.every((f) => f !== null)).toBe(true);
    expect(s.pairs[0]! + s.pairs[1]!).toBe(PAIRS_HOLES / 2);
  });
});

describe('Branch Balance', () => {
  it('makes a different owl the wind each round of the party', () => {
    expect([1, 2, 3, 4, 5].map((r) => windOf([0, 1, 2], r))).toEqual([0, 1, 2, 0, 1]);
    const s = BRANCH_BALANCE.start(humans(4), 1, 3);
    expect(s.wind).toBe(2);
    expect(s.perchers).toEqual([0, 1, 3]);
    expect(BALANCE_MS).toBe(BALANCE_TIMES * (PICK_MS + REVEAL_MS));
  });

  it('blows off the perchers on the two blown branches; the rest hold on', () => {
    const s = BRANCH_BALANCE.start(humans(4), 2, 1);
    expect(s.wind).toBe(0);
    expect(BRANCH_BALANCE.input(s, 1, { k: 'tap', v: 0 }, 100)).toBe(true);
    expect(BRANCH_BALANCE.input(s, 2, { k: 'tap', v: 1 }, 100)).toBe(true);
    expect(BRANCH_BALANCE.input(s, 3, { k: 'tap', v: 3 }, 100)).toBe(true);
    // The wind picks three: the third takes the place of the first. A tap on a blown branch takes it back.
    for (const b of [2, 0, 1]) expect(BRANCH_BALANCE.input(s, 0, { k: 'tap', v: b }, 200)).toBe(true);
    expect(s.blow).toEqual([0, 1]);
    // While owls pick, each sees only its own choice.
    const percher = BRANCH_BALANCE.view(s, 1, 300) as Record<string, unknown>;
    expect(percher['pick']).toBe(0);
    expect(percher['picks']).toBeUndefined();
    expect(percher['blow']).toBeUndefined();
    expect((BRANCH_BALANCE.view(s, 0, 300) as Record<string, unknown>)['picks']).toBeUndefined();
    BRANCH_BALANCE.tick(s, PICK_MS);
    expect(s.phase).toBe('reveal');
    expect(s.blown).toBe(2);
    expect(s.held).toEqual({ 3: 1 });
    expect((BRANCH_BALANCE.view(s, 1, PICK_MS) as Record<string, unknown>)['picks']).toEqual({ 1: 0, 2: 1, 3: 3 });
    expect(BRANCH_BALANCE.input(s, 1, { k: 'tap', v: 2 }, PICK_MS + 10)).toBe(false);
    BRANCH_BALANCE.tick(s, PICK_MS + REVEAL_MS);
    expect(s.phase).toBe('pick');
    expect(s.time).toBe(1);
  });

  it('scores the wind and the perchers on one scale, out of 1000, and blows somewhere when the wind does not pick', () => {
    const s = BRANCH_BALANCE.start(humans(3), 4, 1);
    playOut(BRANCH_BALANCE, s);
    expect(s.past).toHaveLength(BALANCE_TIMES);
    for (const time of s.past) expect(new Set(time.blow).size).toBe(2);
    const r = BRANCH_BALANCE.result(s);
    const blownAll = s.past.reduce((n, time) => n + s.perchers.filter((p) => time.blow.includes(time.picks[p]!)).length, 0);
    expect(r.scores[s.wind]).toBe(Math.round((1000 * blownAll) / (2 * BALANCE_TIMES)));
    for (const p of s.perchers) expect(r.scores[p]).toBe(100 * (s.held[p] ?? 0));
  });

  it('plays park owls by themselves, the wind included', () => {
    const s: BranchBalanceState = BRANCH_BALANCE.start(bots(4), 8, 2);
    expect(s.wind).toBe(1);
    playOut(BRANCH_BALANCE, s);
    expect(s.phase).toBe('done');
    expect(s.past.every((time) => Object.keys(time.picks).length === 3)).toBe(true);
  });
});
