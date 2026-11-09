import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ROOMS } from '../rooms';
import { ART_TRIALS, TRIAL_DEPTH, artTrialFor } from './artTrial';
import { BOWL_DEPTH } from './bowlView';
import { EDGE_DEPTH } from './edgeView';

// The drawing code is not run here: only which painting a page asks for, and where it sits.
vi.mock('phaser', () => ({ default: {} }));

const ART = join(__dirname, '../../public/art');

describe('art trials (?art=hollow)', () => {
  it('paints the Great Hollow only on a page that names the trial', () => {
    expect(artTrialFor('?room=m3-hall&art=hollow', 'm3-hall')?.room).toBe('m3-hall');
    for (const q of ['', '?room=m3-hall', '?art=old', '?art=partygrove', '?art=HOLLOW', '?art=__proto__', '?art=hollow2']) {
      expect(artTrialFor(q, 'm3-hall'), q).toBeNull();
    }
    // Another room is drawn as it is, the trial named or not.
    expect(artTrialFor('?art=hollow', 'hub')).toBeNull();
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
});
