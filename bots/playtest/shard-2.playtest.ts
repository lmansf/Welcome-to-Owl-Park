import { describe, expect, it } from 'vitest';
import { runRoom, shardRooms } from '../sim/run';

describe('playtest rooms, shard 2', () => {
  for (const id of shardRooms(2)) {
    it(id, () => {
      const r = runRoom(id);
      expect(r.surfaces).toBeGreaterThan(0);
    });
  }
});
