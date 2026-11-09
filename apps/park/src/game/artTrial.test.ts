import { describe, expect, it, vi } from 'vitest';
import { ART_TRIALS } from '@owl-park/shared/headers';
import { ROOMS } from '../rooms';
import { ART_TRIAL_FILES, TRIAL_DEPTH, artTrialFor, trialFileAllowed } from './artTrial';
import { BOWL_DEPTH } from './bowlView';
import { EDGE_DEPTH } from './edgeView';

// The drawing code is not run here: only which painting a page asks for, and where it sits.
vi.mock('phaser', () => ({ default: {} }));

describe('art trials (?art=hollow)', () => {
  it('paints the Great Hollow only on a page that names the trial', () => {
    expect(artTrialFor('?room=m3-hall&art=hollow', 'm3-hall')?.room).toBe('m3-hall');
    for (const q of ['', '?room=m3-hall', '?art=old', '?art=partygrove', '?art=HOLLOW', '?art=__proto__', '?art=hollow2']) {
      expect(artTrialFor(q, 'm3-hall'), q).toBeNull();
    }
    // Another room is drawn as it is, the trial named or not.
    expect(artTrialFor('?art=hollow', 'hub')).toBeNull();
  });

  it('lists a trial for every name the page policy opens, each for a room that exists, from a host it opens', () => {
    expect(Object.keys(ART_TRIAL_FILES).sort()).toEqual([...ART_TRIALS].sort());
    for (const t of Object.values(ART_TRIAL_FILES)) {
      expect(ROOMS[t.room], t.room).toBeDefined();
      expect(trialFileAllowed(t.file), t.file).toBe(true);
    }
    expect(trialFileAllowed('https://elsewhere.example/hollow.webp')).toBe(false);
    expect(trialFileAllowed('https://d2ol7oe51mr4n9.cloudfront.net.evil.example/x.webp')).toBe(false);
  });

  it('lies over the room’s drawn floor and wall, and under its roots, floor edge, pieces and owls', () => {
    expect(TRIAL_DEPTH).toBeGreaterThan(BOWL_DEPTH.lines);
    expect(TRIAL_DEPTH).toBeLessThan(EDGE_DEPTH.litter);
  });
});
