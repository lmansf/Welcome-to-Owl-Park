import { describe, expect, it } from 'vitest';
import { BRANCH_LENGTH, CREEP_SPEED, GRACE_MS, HEAD_MS, HEAD_TURN, creepAt, watcherAt, type HeadTurnState } from './headTurn';
import { miniBerries, type MiniPlayer, type MinigameDef } from './minigame';
import { AIR_MS, UPDRAFT_COLUMNS, UPDRAFT_GOAL, UPDRAFT_MS, UPDRAFT_RACE, airAt, flightAt, type UpdraftState } from './updraftRace';

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
