import { describe, expect, it } from 'vitest';
import { runRoom, shardRooms } from '../sim/run';

describe('playtest rooms, shard 4', () => {
  for (const id of shardRooms(4)) {
    it(id, () => {
      const r = runRoom(id);
      expect(r.surfaces).toBeGreaterThan(0);
    });
  }
});
