import { describe, expect, it } from 'vitest';
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
