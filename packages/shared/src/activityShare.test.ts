import { describe, expect, it } from 'vitest';
import { ACTIVITY_SHARE_WORDS, SHARE_ACTIVITIES, activityOfSharePath, activityParkPath, activityPlace, activitySharePath, shareActivity } from './activityShare';
import { NEW_MAP_LANDINGS, TRAVEL_LANDINGS, needsGate } from './travel';

describe('activity share links (OP-392)', () => {
  it('has one stable, address-safe id per place, each unique', () => {
    const ids = SHARE_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it('reads a share path back to its activity, and nothing else', () => {
    for (const a of SHARE_ACTIVITIES) {
      expect(activityOfSharePath(activitySharePath(a.id))).toBe(a);
      expect(activityOfSharePath(`${activitySharePath(a.id)}/`)).toBe(a);
    }
    expect(activityOfSharePath('/play/dragon')).toBeNull();
    expect(activityOfSharePath('/play/')).toBeNull();
    expect(activityOfSharePath('/owl/gentle')).toBeNull();
    expect(shareActivity(null)).toBeNull();
  });

  it('travels only to places the map has, every one of them inside the turnstiles', () => {
    for (const a of SHARE_ACTIVITIES) {
      const fresh = activityPlace(a, 3);
      const old = activityPlace(a, 1);
      expect(fresh ?? old, a.id).not.toBeNull();
      if (fresh) {
        expect(fresh in NEW_MAP_LANDINGS, a.id).toBe(true);
        expect(needsGate(fresh, 3), a.id).toBe(true);
      }
      if (old) {
        expect(old in TRAVEL_LANDINGS, a.id).toBe(true);
        expect(needsGate(old, 1), a.id).toBe(true);
      }
    }
  });

  it('opens the park at its front door, never in a room past the gate', () => {
    const a = shareActivity('arcade')!;
    expect(activityParkPath(a)).toBe('/?go=arcade');
    expect(activityParkPath(a, true)).toBe('/?go=arcade&golink=1');
    for (const x of SHARE_ACTIVITIES) expect(new URLSearchParams(activityParkPath(x, true).slice(2)).has('room')).toBe(false);
  });

  it('says the turnstiles come first, in plain words with no grown-up wording', () => {
    const a = shareActivity('party-grove')!;
    expect(ACTIVITY_SHARE_WORDS.gateFirst(a)).toBe('Walk through the turnstiles, then you fly on to the lanterns and the quiz in the Great Hollow.');
    for (const x of SHARE_ACTIVITIES) for (const s of [x.title, x.line, ACTIVITY_SHARE_WORDS.home(x), ACTIVITY_SHARE_WORDS.play(x)]) expect(s.toLowerCase()).not.toContain('grown');
  });
});
