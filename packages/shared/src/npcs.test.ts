import { describe, expect, it } from 'vitest';
import { NEW_MAP_HOMES, NEW_MAP_PLACE_NAMES, NPCS, PLACE_NAMES, getNpc, npcIn, npcRoomOn, npcsIn, placeName, placeShown, placeWords } from './npcs';
import { QUESTS } from './questCatalog';
import { stepTexts } from './quests';

describe('one name per place (OP-346)', () => {
  it('names a place as the new map does, for an owl that walks it', () => {
    expect(placeShown('hub', 3)).toBe('the Party Grove');
    expect(placeShown('glass', 3)).toBe('the glass realm');
    expect(placeShown('m3-hall', 3)).toBe('the Great Hollow');
    // A place the new map names as today's park does keeps its name.
    expect(placeShown('grove', 3)).toBe(placeName('grove'));
    expect(placeShown('market', 3)).toBe(placeName('market'));
  });

  it('gives a room of the new map alone its new-map name whichever park the owl walks', () => {
    for (const map of [1, 2, 3]) expect(placeShown('m3-hall', map)).toBe('the Great Hollow');
  });

  it('leaves the names of today\'s park and of the tree as they are written', () => {
    for (const map of [1, 2]) {
      expect(placeShown('hub', map)).toBe('the great tree');
      expect(placeWords('Visit the great tree', map)).toBe('Visit the great tree');
    }
  });

  it('puts the new map\'s names into words written with the old ones: a step, an offer, a title', () => {
    expect(placeWords('Visit the great tree', 3)).toBe('Visit the Great Hollow');
    expect(placeWords('Keeper of the great tree', 3)).toBe('Keeper of the Great Hollow');
    expect(placeWords('Flap once in the great tree and once on the neon street, then come tell me.', 3)).toBe('Flap once in the Great Hollow and once on the neon street, then come tell me.');
    expect(placeWords('Talk to Elder Bramble at the glass street', 3)).toBe('Talk to Elder Bramble at the glass realm');
    expect(placeWords('Flop into 2 leaf piles at the great hollow', 3)).toBe('Flop into 2 leaf piles at the Great Hollow');
    // At the head of a sentence too.
    expect(placeWords('The great tree is quiet tonight.', 3)).toBe('The Great Hollow is quiet tonight.');
    expect(placeWords('Nothing to change here.', 3)).toBe('Nothing to change here.');
  });

  it('renames only places quest text has a name for, each to a name that differs', () => {
    for (const [room, name] of Object.entries(NEW_MAP_PLACE_NAMES)) {
      expect(PLACE_NAMES[room], room).toBeDefined();
      expect(name, room).not.toBe(PLACE_NAMES[room]);
    }
  });

  it('calls no player by a pet name: the park speaks to everyone the same', () => {
    for (const w of NPCS.flatMap((n) => n.greetings)) expect(w.toLowerCase(), w).not.toMatch(/little one|grown.?ups?|kiddo|sweetie/);
  });

  it('leaves no old name in any quest step, offer or thanks, or any owl\'s title, as the new map shows them', () => {
    const old = Object.keys(NEW_MAP_PLACE_NAMES).map((room) => PLACE_NAMES[room]!);
    const words = [...QUESTS.flatMap((q) => [...stepTexts(q), q.offer, q.thanks, q.title]), ...NPCS.flatMap((n) => [n.role, ...n.greetings])];
    for (const w of words)
      for (const name of old) {
        const shown = placeWords(w, 3);
        expect(shown, w).not.toContain(name);
        expect(shown, w).not.toContain(name.charAt(0).toUpperCase() + name.slice(1));
      }
  });
});

describe('the Party Grove’s owls moved into the Great Hollow on the new map (D5, Nov 19)', () => {
  const ids = (room: string, map?: number) => npcsIn(room, map).map((n) => n.id);

  it('stand in the hollow on the new map and no longer in the old grove there', () => {
    for (const id of ['bramble', 'pip']) {
      expect(ids('m3-hall', 3)).toContain(id);
      expect(ids('hub', 3)).not.toContain(id);
      expect(npcRoomOn(id, 3)).toBe('m3-hall');
    }
  });

  it('stay in today’s park’s plaza, and show in the hollow to an owl of any park', () => {
    for (const map of [1, 2]) {
      expect(ids('hub', map)).toEqual(expect.arrayContaining(['bramble', 'pip']));
      expect(ids('m3-hall', map)).toEqual(expect.arrayContaining(['bramble', 'pip']));
      expect(npcRoomOn('bramble', map)).toBe('hub');
    }
  });

  it('can be talked to in either room by the room server, which serves every park, each at its spot there', () => {
    expect(npcIn('bramble', 'hub')?.pos).toEqual(getNpc('bramble')?.pos);
    expect(npcIn('bramble', 'm3-hall')?.pos).toEqual(NEW_MAP_HOMES.bramble!.pos);
    expect(npcIn('bramble', 'market')).toBeUndefined();
  });

  it('leaves every other owl where it was', () => {
    for (const n of NPCS.filter((x) => !Object.hasOwn(NEW_MAP_HOMES, x.id)))
      for (const map of [undefined, 1, 2, 3]) {
        expect(npcsIn(n.room, map).find((x) => x.id === n.id), `${n.id} on ${map}`).toEqual(n);
        expect(npcRoomOn(n.id, map ?? 1)).toBe(n.room);
      }
  });
});
