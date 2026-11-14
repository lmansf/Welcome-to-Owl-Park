import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOMS } from '../rooms';
import { ART_TRIALS, DEFAULT_ART_TRIALS, HOLLOW_LIGHT, TRIAL_DEPTH, artTrialFor, trialTint } from './artTrial';
import { BOWL_DEPTH } from './bowlView';
import { EDGE_DEPTH } from './edgeView';

// The drawing code is not run here: only which painting a page asks for, and where it sits.
vi.mock('phaser', () => ({ default: {} }));

const ART = join(__dirname, '../../public/art');

describe('art trials (?art=hollow)', () => {
  it('paints the Great Hollow on every page but ?art=old', () => {
    for (const q of ['', '?room=m3-hall', '?room=m3-hall&art=hollow', '?art=partygrove', '?art=HOLLOW', '?art=__proto__', '?art=hollow2']) {
      expect(artTrialFor(q, 'm3-hall')?.key, q).toBe('hollow-painted');
    }
    expect(artTrialFor('?art=old', 'm3-hall')).toBeNull();
    expect(artTrialFor('?room=m3-hall&art=old', 'm3-hall')).toBeNull();
    // Another room is drawn as it is, the trial named or not.
    for (const q of ['', '?art=hollow', '?art=old']) expect(artTrialFor(q, 'hub'), q).toBeNull();
  });

  it('keeps only trials that exist', () => {
    for (const t of DEFAULT_ART_TRIALS) expect(Object.hasOwn(ART_TRIALS, t), t).toBe(true);
  });

  it('paints rooms that exist, from a picture the build ships', () => {
    for (const t of Object.values(ART_TRIALS)) {
      expect(ROOMS[t.room], t.room).toBeDefined();
      expect(existsSync(join(ART, `${t.key}.webp`)), t.key).toBe(true);
    }
  });

  it('lies over the room’s drawn floor and wall, and under its roots, floor edge, pieces and owls', () => {
    expect(TRIAL_DEPTH).toBeGreaterThan(BOWL_DEPTH.lines);
    expect(TRIAL_DEPTH).toBeLessThan(EDGE_DEPTH.litter);
  });

  it('draws the Great Hollow’s painting in a gentler light than it was painted in, warm, and never by much (OP-370)', () => {
    const hollow = ART_TRIALS['hollow']!;
    expect(trialTint(hollow, '')).toBe(HOLLOW_LIGHT);
    const [r, g, b] = [(HOLLOW_LIGHT >> 16) & 255, (HOLLOW_LIGHT >> 8) & 255, HOLLOW_LIGHT & 255];
    // Darker than the picture as painted, by no more than a fifth in any colour: toned down, not repainted.
    for (const c of [r, g, b]) {
      expect(c).toBeLessThan(255);
      expect(c).toBeGreaterThanOrEqual(255 * 0.75);
    }
    // More taken from the blue than the red: the room stays the warm inside of a tree.
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
  });

  it('tries another light from the address, and only one that is a colour', () => {
    const hollow = ART_TRIALS['hollow']!;
    expect(trialTint(hollow, '?arttint=ffffff')).toBe(0xffffff);
    expect(trialTint(hollow, '?arttint=C0B0A0')).toBe(0xc0b0a0);
    expect(trialTint(hollow, '?arttint=red')).toBe(HOLLOW_LIGHT);
    expect(trialTint(hollow, '?arttint=12345')).toBe(HOLLOW_LIGHT);
    expect(trialTint({ room: 'x', key: 'y', beyond: '#000' }, '')).toBeUndefined();
  });
});
