import { describe, expect, it, vi } from 'vitest';
import { ART_TRIAL_HOSTS, ROOM_W, backgroundTiles, foregroundTiles } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { ART_TRIALS, artTrialRoom, artTrialWanted, trialFiles, trialKey } from './artTrial';
import { drawnRoom } from './kitView';
import { ART, useArtTrial } from './art';

// The drawing code is not run here: only which room is drawn.
vi.mock('phaser', () => ({ default: {} }));

describe('art trials (?art=)', () => {
  it('are off for every visitor, and on only for a trial that exists', () => {
    expect(artTrialWanted(null)).toBeNull();
    expect(artTrialWanted('nope')).toBeNull();
    expect(artTrialWanted('__proto__')).toBeNull();
    expect(artTrialWanted('partygrove')).toBe('partygrove');
  });

  it('draws the Party Grove in four layers per screen, and leaves its floor, perches and doorways as they are', () => {
    const hub = ROOMS.hub!;
    const room = artTrialRoom(hub, 'partygrove');
    expect(room.walkable).toBe(hub.walkable);
    expect(room.doors).toBe(hub.doors);
    expect(room.perches).toBe(hub.perches);
    const back = backgroundTiles(room);
    const rates = (keys: string) => back.filter((t) => t.key.includes(keys)).map((t) => t.rate);
    expect(rates('-back-')).toEqual([0.5, 0.5, 0.5]);
    expect(rates('-mid-')).toEqual([0.75, 0.75, 0.75]);
    expect(rates('-play-')).toEqual([1, 1, 1]);
    expect(foregroundTiles(room).map((t) => t.rate)).toEqual([1.2, 1.2, 1.2]);
    // Each screen's layers sit on that screen; the playable layer is drawn as painted, with no fades.
    for (const t of [...back, ...foregroundTiles(room)]) expect(t.x).toBe(Number(t.key.at(-1)) * ROOM_W);
    for (const t of back.filter((t) => t.key.includes('-play-'))) expect(t.fade).toBeUndefined();
    // The outer edges of the room never fade; the inner ones do, the middle screen's on both sides, drawn last.
    const backs = back.filter((t) => t.key.includes('-back-'));
    expect(backs.map((t) => t.key)).toEqual([
      trialKey('partygrove', 'back', 0),
      trialKey('partygrove', 'back', 2),
      trialKey('partygrove', 'back', 1),
    ]);
    expect(backs[0]!.fade).toEqual({ right: 220 });
    expect(backs[1]!.fade).toEqual({ left: 220 });
    expect(backs[2]!.fade).toEqual({ left: 220, right: 220 });
  });

  it('changes no other room, and nothing without the flag', () => {
    expect(artTrialRoom(ROOMS.hub!, null)).toBe(ROOMS.hub);
    expect(artTrialRoom(ROOMS.grove!, 'partygrove')).toBe(ROOMS.grove);
    expect(drawnRoom(ROOMS.hub!, { kit: false })).toBe(ROOMS.hub);
    expect(backgroundTiles(drawnRoom(ROOMS.hub!, { kit: true, art: 'partygrove' }))).toHaveLength(9);
  });

  it('loads every layer from the trial host the page policy opens, and only from there', () => {
    for (const name of Object.keys(ART_TRIALS)) {
      const files = trialFiles(name);
      expect(files.size).toBe(ART_TRIALS[name]!.screens.length * 4);
      for (const url of files.values()) expect(ART_TRIAL_HOSTS.some((h) => url.startsWith(`${h}/`))).toBe(true);
    }
  });

  it('registers a trial’s layers as room-sized art only on its page', () => {
    const key = trialKey('partygrove', 'mid', 1);
    useArtTrial('partygrove');
    expect(ART[key]).toEqual({ w: ROOM_W, h: 900, kind: 'room' });
    useArtTrial(null);
  });
});
