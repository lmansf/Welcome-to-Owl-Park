/**
 * The verdict over every room the shards played: written to out/sim.json for the report, and failed on
 * any blocker the baseline doesn't know (a stuck spot, a doorway or piece no route reaches, a spawn on
 * nothing, a course hop under the kid bar).
 */
import { expect, it } from 'vitest';
import { verdict, writeVerdict } from '../sim/run';

it('no new blockers', () => {
  const v = verdict();
  writeVerdict(v);
  expect(v.missingRooms, 'every room was played').toEqual([]);
  expect(v.blockers.map((b) => b.what)).toEqual([]);
});
