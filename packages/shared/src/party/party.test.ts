import { describe, expect, it } from 'vitest';
import { OWL_FACTS, OWL_FACT_TWISTS, owlFactQuestion } from '../owlFacts';
import { BOARD, HOLLOW_FROM, HOLLOW_TO, MOONSTONE_COST, PERCH_SPACES, SPACE_KINDS, START_SPACE, hopsBetween, isFork, space } from './board';
import {
  GATHER_MS,
  PARK_OWL_LOOKS,
  PARTY_LONGEST_MS,
  PARTY_MINIGAMES,
  PARTY_ROUNDS,
  ROLL_WAIT_MS,
  newParty,
  partyArrive,
  partyDone,
  partyDue,
  partyEarners,
  partyInput,
  partyLeave,
  partyTick,
  partyView,
  placeOf,
  standingsOf,
  type PartyOwl,
  type PartySeat,
  type PartyState,
} from './game';
import { isPartyRoom, newPartyRoomId, nextRestartAt, RESTART_HOUR_UTC } from './ids';
import { MINIGAMES } from './minigames';
import { miniBerries, miniPlaces, miniWinners, teamPlaces, twoTeams } from './minigame';
import { between } from './rng';
import { FALL_MS, FEATHER_FALL, crossesAt, fallScore, itemAt, type FeatherFallState } from './featherFall';
import { HOOT_ECHO, type HootEchoState } from './hootEcho';

const look = PARK_OWL_LOOKS[0]!;
const ROOM = 'party-abcd1234';
const FAR = 10 ** 13;

function seats(humans: string[], bots = 0, spec: string[] = []): PartySeat[] {
  return [
    ...humans.map((owl) => ({ owl, bot: false, look, cid: `c-${owl}`, ...(spec.includes(owl) ? { spec: true } : {}) })),
    ...Array.from({ length: bots }, () => ({ owl: '', bot: true, look })),
  ];
}

/** A game of these seats with every visitor arrived, on owl 0's first roll at t=0. */
function started(humans = ['a', 'b'], bots = 0): PartyState {
  const s = newParty({ room: ROOM, seats: seats(humans, bots), seed: 7, now: 0, closesAt: FAR });
  for (const h of humans) partyArrive(s, h, 0);
  return s;
}

/** Sets the game's dice so its next roll comes up `n`. */
function rollNext(s: PartyState, n: number, skip = 0): void {
  let found = 0;
  for (let seed = 1; seed < 100_000; seed++) {
    if (between({ s: seed }, 1, 6) === n && found++ === skip) {
      s.dice = seed;
      return;
    }
  }
  throw new Error('no seed');
}

/** Puts owl `seat` on space `n`, with these berries, for its turn now. */
function standOn(s: PartyState, seat: number, n: number, berries = 0, trail?: number[]): PartyOwl {
  const o = s.owls[seat]!;
  o.at = n;
  o.trail = trail ?? [n];
  o.berries = berries;
  return o;
}

/** Keeps the Moon Perch out of the way of a test. */
const perchAway = (s: PartyState, from: number[]) => (s.perch = PERCH_SPACES.find((n) => !from.includes(n))!);

describe('the Old Stump board', () => {
  it('is a loop of 30 spaces with two forks and a hollow shortcut, every kind of space on it', () => {
    expect(BOARD).toHaveLength(30);
    for (const s of BOARD) for (const n of s.next) expect(BOARD[n]).toBeDefined();
    expect(BOARD.filter((s) => isFork(s.n)).map((s) => s.n)).toEqual([5, 19]);
    expect(space(HOLLOW_FROM)).toMatchObject({ kind: 'hollow', hollowTo: HOLLOW_TO });
    expect(new Set(BOARD.map((s) => s.kind))).toEqual(new Set(SPACE_KINDS));
    // Every space can be reached from the start, and the way comes back round to it.
    for (const s of BOARD) expect(hopsBetween(START_SPACE, s.n)).toBeLessThan(30);
    expect(hopsBetween(29, START_SPACE)).toBe(1);
    // The short way at each fork is shorter.
    expect(hopsBetween(5, 11)).toBe(3);
    expect(hopsBetween(19, 25)).toBe(3);
    expect(PERCH_SPACES.length).toBeGreaterThan(5);
    for (const n of PERCH_SPACES) expect(space(n).kind).toBe('berry');
  });
});

describe('seating and the start', () => {
  it('seats two to four owls, park owls in the empty seats, and never more than four', () => {
    const s = newParty({ room: ROOM, seats: seats(['a', 'b', 'c', 'd', 'e']), seed: 1, now: 0, closesAt: FAR });
    expect(s.owls.map((o) => o.owl)).toEqual(['a', 'b', 'c', 'd']);
    const t = newParty({ room: ROOM, seats: seats(['a'], 2), seed: 1, now: 0, closesAt: FAR });
    expect(t.owls.map((o) => [o.owl, o.bot])).toEqual([
      ['a', false],
      ['bot-1', true],
      ['bot-2', true],
    ]);
  });

  it('starts once every invited owl has arrived, or when the wait runs out with a park owl for each missing one', () => {
    const s = newParty({ room: ROOM, seats: seats(['a', 'b']), seed: 1, now: 0, closesAt: FAR });
    expect(s.phase).toBe('gather');
    expect(partyArrive(s, 'zed', 10)).toBe(false);
    partyArrive(s, 'a', 10);
    expect(s.phase).toBe('gather');
    partyTick(s, GATHER_MS);
    expect(s.phase).toBe('turn');
    expect(s.owls[1]!.away).toBe(true);
    expect(s.turn).toMatchObject({ seat: 0, step: 'roll' });

    const u = started();
    expect(u.phase).toBe('turn');
    expect(u.turn!.ends).toBe(ROLL_WAIT_MS);
  });

  it('orders the minigames so every picked one comes before any comes again, never the same twice running', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newParty({ room: ROOM, seats: seats(['a', 'b']), seed, now: 0, closesAt: FAR });
      const playable = PARTY_MINIGAMES.filter((id) => MINIGAMES[id]);
      expect(s.minis).toHaveLength(PARTY_ROUNDS);
      expect(new Set(s.minis.slice(0, playable.length))).toEqual(new Set(playable));
      for (let i = 1; i < s.minis.length; i++) expect(s.minis[i]).not.toBe(s.minis[i - 1]);
    }
  });
});

describe('the roll and moving', () => {
  it('rolls 1 to 6 on the server, only for the owl whose turn it is', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 60; seed++) {
      const s = started();
      s.dice = seed;
      perchAway(s, []);
      expect(partyInput(s, 'b', { k: 'roll', v: 0 }, 5)).toBe(false);
      expect(partyInput(s, 'a', { k: 'roll', v: 6 }, 5)).toBe(true);
      seen.add(s.turn!.roll);
      expect(partyInput(s, 'a', { k: 'roll', v: 0 }, 6)).toBe(false);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('hops the roll space by space, stopping at a fork to ask the way', () => {
    const s = started();
    perchAway(s, [5, 6, 8]);
    standOn(s, 0, 3);
    rollNext(s, 3);
    partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
    expect(s.turn).toMatchObject({ step: 'fork', path: [4, 5], left: 1 });
    expect(partyInput(s, 'a', { k: 'way', v: 2 }, 2)).toBe(false);
    partyInput(s, 'a', { k: 'way', v: 0 }, 2);
    expect(s.owls[0]!.at).toBe(6);
    expect(s.turn!.step).toBe('show');
  });

  it('takes the long way when an owl does not choose in time', () => {
    const s = started();
    perchAway(s, [5, 6, 8]);
    standOn(s, 0, 4, 6);
    rollNext(s, 2);
    partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
    expect(s.turn!.step).toBe('fork');
    partyTick(s, s.turn!.ends);
    expect(s.owls[0]!.at).toBe(8);
  });

  it('rolls for an owl that never rolls, when its wait runs out', () => {
    const s = started();
    partyTick(s, ROLL_WAIT_MS);
    expect(s.turn!.roll).toBeGreaterThan(0);
  });
});

describe('each kind of space', () => {
  const land = (from: number, roll: number, berries = 0, trail?: number[]) => {
    const s = started();
    perchAway(s, Array.from({ length: 30 }, (_, i) => i).filter((n) => n <= from + roll + 3 && n >= from));
    const o = standOn(s, 0, from, berries, trail);
    rollNext(s, roll);
    partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
    return { s, o };
  };

  it('berry: +3 Glowberries', () => {
    const { o, s } = land(0, 1);
    expect(o.at).toBe(1);
    expect(o.berries).toBe(3);
    expect(s.turn!.step).toBe('show');
  });

  it('bramble: -3 Glowberries, never below none', () => {
    expect(land(2, 1, 5).o.berries).toBe(2);
    expect(land(2, 1, 1).o.berries).toBe(0);
  });

  it('updraft: carried 3 spaces on, and counted for the bonus', () => {
    const { o, s } = land(6, 1);
    expect(o.at).toBe(13);
    expect(o.flown).toBe(3);
    expect(s.turn!.path).toEqual([7, 11, 12, 13]);
  });

  it('downdraft: sunk 2 spaces back along the way it came', () => {
    const { o } = land(11, 1, 0, [9, 10, 11]);
    expect(o.at).toBe(10);
  });

  it('Owl Fact: true or false, +5 for the right answer, its truth hidden until answered', () => {
    const { s, o } = land(1, 1);
    expect(s.turn!.step).toBe('fact');
    const q = s.turn!.question!;
    const v = partyView(s, 'a', 2);
    expect(v.turn!.question).toBe(q.text);
    expect(v.turn).not.toHaveProperty('truth');
    expect(JSON.stringify(v)).not.toContain('"truth"');
    partyInput(s, 'a', { k: 'fact', v: q.truth ? 1 : 0 }, 3);
    expect(o.berries).toBe(5);
    expect(o.facts).toBe(1);
    expect(partyView(s, 'b', 4).turn!.truth).toBe(q.truth);

    const wrong = land(1, 1);
    partyInput(wrong.s, 'a', { k: 'fact', v: wrong.s.turn!.question!.truth ? 0 : 1 }, 3);
    expect(wrong.o.berries).toBe(0);
    // An owl that lets the wait run out has not answered right.
    const sleepy = land(1, 1);
    partyTick(sleepy.s, sleepy.s.turn!.ends);
    expect(sleepy.o.facts).toBe(0);
  });

  it('knot-hole: a surprise, each of the three sometimes', () => {
    const seen = new Set<string>();
    for (let skip = 0; skip < 60; skip++) {
      const s = started();
      perchAway(s, [3, 4]);
      const perch = s.perch;
      const o = standOn(s, 0, 3, 1);
      const other = standOn(s, 1, 20, 4);
      rollNext(s, 1, skip);
      partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
      const note = s.turn!.notes.join();
      if (note.includes('swap')) {
        expect([o.at, other.at]).toEqual([20, 4]);
        seen.add('swap');
      } else if (note.includes('every owl')) {
        expect([o.berries, other.berries]).toEqual([3, 6]);
        seen.add('gift');
      } else {
        expect(s.perch).not.toBe(perch);
        seen.add('hop');
      }
    }
    expect(seen).toEqual(new Set(['swap', 'gift', 'hop']));
  });

  it('hollow: a shortcut through the trunk for 5, if the owl wants it and has them', () => {
    const take = land(12, 1, 7);
    expect(take.s.turn!.step).toBe('hollow');
    partyInput(take.s, 'a', { k: 'hollow', v: 1 }, 2);
    expect(take.o).toMatchObject({ at: HOLLOW_TO, berries: 2 });
    const pass = land(12, 1, 7);
    partyInput(pass.s, 'a', { k: 'hollow', v: 0 }, 2);
    expect(pass.o).toMatchObject({ at: HOLLOW_FROM, berries: 7 });
    const poor = land(12, 1, 4);
    expect(poor.s.turn!.step).toBe('show');
  });
});

describe('the Moon Perch', () => {
  it('trades 10 Glowberries for a Moonstone as an owl passes it, then hops to another branch', () => {
    const s = started();
    s.perch = 1;
    const o = standOn(s, 0, 0, MOONSTONE_COST + 2);
    rollNext(s, 2);
    partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
    expect(o.stones).toBe(1);
    expect(o.berries).toBe(2);
    expect(s.perch).not.toBe(1);
    expect(PERCH_SPACES).toContain(s.perch);
  });

  it('sells nothing to an owl short of 10', () => {
    const s = started();
    s.perch = 1;
    const o = standOn(s, 0, 0, MOONSTONE_COST - 1);
    rollNext(s, 1);
    partyInput(s, 'a', { k: 'roll', v: 0 }, 1);
    expect(o.stones).toBe(0);
    expect(s.perch).toBe(1);
    expect(o.berries).toBe(MOONSTONE_COST + 2); // landed on the berries there
  });
});

describe('rounds to a winner', () => {
  it('plays 8 rounds of turns and minigames to the bonuses and a winner, by itself if no one acts', () => {
    const s = started(['a', 'b'], 2);
    let now = 0;
    const phases = new Set<string>();
    let rounds = 0;
    for (let i = 0; i < 5_000 && !partyDone(s); i++) {
      now = partyDue(s, now)! + 1;
      const before = s.round;
      partyTick(s, now);
      phases.add(s.phase);
      if (s.round !== before) rounds++;
    }
    expect(s.phase).toBe('over');
    expect(rounds).toBe(PARTY_ROUNDS - 1);
    expect(now).toBeLessThan(PARTY_LONGEST_MS);
    expect([...phases]).toEqual(expect.arrayContaining(['turn', 'intro', 'mini', 'scores', 'bonus', 'over']));
    expect(s.bonuses!.map((b) => b.what)).toEqual(['wins', 'facts', 'flown']);
    expect(s.winners!.length).toBeGreaterThan(0);
    expect(placeOf(s, s.winners![0]!)).toBe(1);
    // The visitors who stayed earn; the park owls never do.
    expect(partyEarners(s).map((o) => o.owl)).toEqual(['a', 'b']);
  });

  it('pays each minigame in Glowberries by place: 10, 6, 3, 1; a team 8 and 2', () => {
    const r = { scores: { 0: 9, 1: 3, 2: 5, 3: 1 }, places: miniPlaces({ 0: 9, 1: 3, 2: 5, 3: 1 }) };
    expect(miniBerries('all', r)).toEqual({ 0: 10, 1: 3, 2: 6, 3: 1 });
    expect(miniWinners('all', r)).toEqual([0]);
    const tie = miniPlaces({ 0: 4, 1: 4, 2: 1 });
    expect(tie).toEqual({ 0: 1, 1: 1, 2: 3 });
    const teams = twoTeams([0, 1, 2, 3]);
    expect(teams).toEqual([
      [0, 2],
      [1, 3],
    ]);
    const won = { scores: {}, places: teamPlaces(teams, 1), teams, winningTeam: 1 };
    expect(miniBerries('team', won)).toEqual({ 0: 2, 1: 8, 2: 2, 3: 8 });
    expect(miniWinners('team', won)).toEqual([1, 3]);
    const draw = { scores: {}, places: teamPlaces(teams, null), teams, winningTeam: null };
    expect(miniWinners('team', draw)).toEqual([]);
  });

  it('breaks ties on Glowberries, then on minigame wins; owls level on all three both win', () => {
    const owl = (seat: number, stones: number, berries: number, wins: number) => ({ seat, stones, berries, wins }) as PartyOwl;
    expect(standingsOf([owl(0, 2, 5, 0), owl(1, 3, 0, 0)]).winners).toEqual([1]);
    expect(standingsOf([owl(0, 2, 5, 0), owl(1, 2, 8, 0)]).winners).toEqual([1]);
    expect(standingsOf([owl(0, 2, 5, 3), owl(1, 2, 5, 1), owl(2, 1, 50, 9)])).toEqual({ order: [0, 1, 2], winners: [0] });
    expect(standingsOf([owl(0, 2, 5, 1), owl(1, 2, 5, 1)]).winners).toEqual([0, 1]);
  });

  it('ends at the nightly restart, finished or not, and nobody earns from an unfinished game', () => {
    const s = newParty({ room: ROOM, seats: seats(['a', 'b']), seed: 3, now: 0, closesAt: 60_000 });
    partyArrive(s, 'a', 0);
    partyArrive(s, 'b', 0);
    expect(partyDue(s, 0)).toBeLessThanOrEqual(60_000);
    partyTick(s, 60_000);
    expect(s).toMatchObject({ phase: 'ended', ended: 'restart' });
    expect(partyEarners(s)).toEqual([]);
  });

  it('a park owl plays for an owl that leaves, and the game ends when only park owls are left', () => {
    const s = started(['a', 'b'], 1);
    partyLeave(s, 'a', 100);
    expect(s.owls[0]!.away).toBe(true);
    // Its turn goes on after a park owl's pause, not its whole wait.
    expect(s.turn!.ends).toBeLessThan(ROLL_WAIT_MS);
    expect(partyInput(s, 'a', { k: 'roll', v: 0 }, 200)).toBe(false);
    partyLeave(s, 'b', 300);
    expect(s).toMatchObject({ phase: 'ended', ended: 'empty' });
  });

  it('never pays a free guest or an owl that left', () => {
    const s = newParty({ room: ROOM, seats: seats(['a', 'b', 'c'], 0, ['b']), seed: 5, now: 0, closesAt: FAR });
    for (const h of ['a', 'b', 'c']) partyArrive(s, h, 0);
    partyLeave(s, 'c', 1);
    let now = 1;
    while (!partyDone(s)) partyTick(s, (now = partyDue(s, now)! + 1));
    expect(partyEarners(s).map((o) => o.owl)).toEqual(['a']);
    // What a page sees never carries a collection or a free-guest mark.
    const v = JSON.stringify(partyView(s, 'a', now));
    expect(v).not.toContain('c-a');
    expect(v).not.toContain('"spec"');
  });
});

describe('Owl Fact questions', () => {
  it('are each fact, true, or its twist, false, the same every time', () => {
    expect(OWL_FACT_TWISTS).toHaveLength(OWL_FACTS.length);
    let trues = 0;
    for (let k = 0; k < OWL_FACTS.length; k++) {
      const q = owlFactQuestion(3, k);
      expect(owlFactQuestion(3, k)).toEqual(q);
      const i = (3 + k) % OWL_FACTS.length;
      expect(q.text).toBe(q.truth ? OWL_FACTS[i] : OWL_FACT_TWISTS[i]);
      if (q.truth) trues++;
    }
    expect(trues).toBeGreaterThan(4);
    expect(trues).toBeLessThan(16);
  });
});

describe('the party rooms', () => {
  it('has its own room ids, made from the server random source', () => {
    const id = newPartyRoomId(() => 0.5);
    expect(isPartyRoom(id)).toBe(true);
    expect(id).toMatch(/^party-[a-z0-9]{8}$/);
    expect(isPartyRoom('party-ABC')).toBe(false);
    expect(isPartyRoom('hub')).toBe(false);
  });

  it('knows when the park next restarts for the night', () => {
    const before = Date.UTC(2026, 10, 8, RESTART_HOUR_UTC - 1);
    expect(nextRestartAt(before)).toBe(Date.UTC(2026, 10, 8, RESTART_HOUR_UTC));
    expect(nextRestartAt(Date.UTC(2026, 10, 8, RESTART_HOUR_UTC))).toBe(Date.UTC(2026, 10, 9, RESTART_HOUR_UTC));
  });
});

describe('Feather Fall', () => {
  const players = [
    { seat: 0, bot: false },
    { seat: 1, bot: false },
  ];

  it('scores the feathers each owl catches, less 2 for each pinecone that hits it', () => {
    const s: FeatherFallState = {
      players,
      items: [
        { t: 0, x: 500, kind: 'feather', ph: 0 },
        { t: 3_000, x: 900, kind: 'feather', ph: 0 },
        { t: 6_000, x: 100, kind: 'cone', ph: 0 },
      ],
      inputs: [],
    };
    // Seat 0 flies after the second feather, then under the pinecone; seat 1 stays put.
    const at2 = crossesAt(s.items[1]!);
    expect(FEATHER_FALL.input(s, 0, { k: 'x', v: itemAt(s.items[1]!, at2).x }, at2 - 1_000)).toBe(true);
    expect(FEATHER_FALL.input(s, 0, { k: 'x', v: 100 }, at2 + 100)).toBe(true);
    expect(fallScore(s, 0, FALL_MS)).toEqual({ feathers: 2, cones: 1, score: 0 });
    expect(fallScore(s, 1, FALL_MS)).toEqual({ feathers: 1, cones: 0, score: 1 });
    expect(FEATHER_FALL.result(s).places).toEqual({ 0: 2, 1: 1 });
  });

  it('takes only flying inputs from the seats playing, not too fast, and none for a park owl', () => {
    const s = FEATHER_FALL.start([...players, { seat: 2, bot: true }], 9, 1);
    expect(s.inputs.some((i) => i.seat === 2)).toBe(true);
    expect(FEATHER_FALL.input(s, 2, { k: 'x', v: 1 }, 100)).toBe(false);
    expect(FEATHER_FALL.input(s, 3, { k: 'x', v: 1 }, 100)).toBe(false);
    expect(FEATHER_FALL.input(s, 0, { k: 'tap', v: 1 }, 100)).toBe(false);
    expect(FEATHER_FALL.input(s, 0, { k: 'x', v: 5_000 }, 100)).toBe(true);
    expect(s.inputs.find((i) => i.seat === 0)!.v).toBe(1000);
    expect(FEATHER_FALL.input(s, 0, { k: 'x', v: 10 }, 120)).toBe(false);
    expect(FEATHER_FALL.input(s, 0, { k: 'x', v: 10 }, FALL_MS + 1)).toBe(false);
    // A park owl catches a fair few, but not every one.
    const bot = fallScore(s, 2, FALL_MS);
    const all = s.items.filter((i) => i.kind === 'feather').length;
    expect(bot.feathers).toBeGreaterThan(all / 3);
    expect(bot.feathers).toBeLessThan(all);
  });
});

describe('Hoot Echo', () => {
  const players = [
    { seat: 0, bot: false },
    { seat: 1, bot: false },
    { seat: 2, bot: false },
  ];
  const toAnswer = (s: HootEchoState) => {
    HOOT_ECHO.tick(s, s.ends);
    expect(s.phase).toBe('answer');
    return s.at;
  };

  it('shows the pattern while the elder hoots it, then hides it', () => {
    const s = HOOT_ECHO.start(players, 4, 1);
    expect((HOOT_ECHO.view(s, 0, 0) as { pattern?: number[] }).pattern).toEqual(s.pattern.slice(0, 3));
    toAnswer(s);
    expect(HOOT_ECHO.view(s, 0, s.at)).not.toHaveProperty('pattern');
    // No hoot is taken while the elder hoots.
    const t = HOOT_ECHO.start(players, 4, 1);
    expect(HOOT_ECHO.input(t, 0, { k: 'tap', v: t.pattern[0]! }, 10)).toBe(false);
  });

  it('sits out a wrong hoot, and the last owl hooting wins; owls that got further place higher', () => {
    const s = HOOT_ECHO.start(players, 4, 1);
    let t = toAnswer(s);
    const right = (seat: number, n: number) => {
      for (let i = 0; i < n; i++) expect(HOOT_ECHO.input(s, seat, { k: 'tap', v: s.pattern[i]! }, (t += 300))).toBe(true);
    };
    right(0, 3);
    right(1, 2);
    HOOT_ECHO.input(s, 1, { k: 'tap', v: (s.pattern[2]! + 1) % 4 }, (t += 300));
    expect(s.alive).toEqual([0, 2]);
    right(2, 3);
    // Both hooted the round back: the next round, one longer, starts at once.
    expect(s).toMatchObject({ round: 2, phase: 'show' });
    t = toAnswer(s);
    right(0, 4);
    HOOT_ECHO.input(s, 2, { k: 'tap', v: (s.pattern[0]! + 1) % 4 }, (t += 300));
    expect(HOOT_ECHO.over(s, t)).toBe(true);
    // Seat 2 hooted a whole round back before it slipped; seat 1 never did.
    expect(HOOT_ECHO.result(s).places).toEqual({ 0: 1, 1: 3, 2: 2 });
  });

  it('sits out an owl that does not hoot in time, and plays park owls by itself', () => {
    const s = HOOT_ECHO.start([{ seat: 0, bot: false }, { seat: 1, bot: true }, { seat: 2, bot: true }], 11, 1);
    for (let t = 0; t <= 60_000 && !HOOT_ECHO.over(s, t); t += 100) HOOT_ECHO.tick(s, t);
    expect(s.alive).not.toContain(0);
    expect(s.cleared[1] ?? 0).toBeGreaterThan(0);
    expect(HOOT_ECHO.result(s).places[0]).toBe(3);
  });
});
