/**
 * NPC owls: the park's residents. Each stands in one room, wears collectibles from the catalogue
 * (so they need no art of their own), offers quests and takes them back. Every string here is
 * shown to visitors: names and lines stay public-safe, and the names await the owner's approval
 * (proposal C31) before they ship.
 */
import type { OwlLook, Vec2 } from './protocol';

export interface NpcDef {
  id: string;
  /** Shown above the owl and in the dialogue. */
  name: string;
  /** A few words under the name in the dialogue. */
  role: string;
  room: string;
  /** Where its feet are, in room pixels. */
  pos: Vec2;
  /** Which way it looks while standing: 1 right, -1 left. */
  facing: 1 | -1;
  look: OwlLook;
  /** One of these greets the visitor when there is nothing else to say. */
  greetings: readonly string[];
  /** Emotes it plays now and then while idle. */
  idle: readonly string[];
  /** Talking to this owl can open the shop. */
  shop?: boolean;
}

/** How close (room pixels, feet to feet) an owl must stand to talk to an NPC. */
export const NPC_TALK_RADIUS = 120;
/** An emote counts as "for" an NPC within this distance. */
export const NPC_EMOTE_RADIUS = 220;

/** Public-safe names for the rooms, used in quest text (realm names stay internal). */
export const PLACE_NAMES: Readonly<Record<string, string>> = {
  hub: 'the great tree',
  grove: 'the treehouse clearing',
  market: 'the neon street',
};

export function placeName(room: string): string {
  return PLACE_NAMES[room] ?? 'the park';
}

export const NPCS: readonly NpcDef[] = [
  {
    id: 'bramble',
    name: 'Elder Bramble',
    role: 'Keeper of the great tree',
    room: 'hub',
    pos: { x: 2210, y: 700 },
    facing: 1,
    look: { body: '#5C4033', belly: '#E8D8B8', accent: '#C9A227', wear: { head: 'mortarboard~0', face: 'half-moon-specs~0', neck: 'moon-pendant~0' } },
    greetings: ['Welcome, little one. The tree has room for everyone.', 'Every leaf in this hollow has a story. Some are even true.', 'Mind the moonbeam. It likes to be looked at.'],
    idle: ['nod', 'hoot'],
  },
  {
    id: 'pip',
    name: 'Pip',
    role: 'Lantern keeper',
    room: 'hub',
    pos: { x: 2840, y: 760 },
    facing: -1,
    look: { body: '#D9C7A5', belly: '#F6F1E3', accent: '#E07A5F', wear: { head: 'bobble-hat~3', neck: 'knit-scarf~0', pet: 'firefly~0' } },
    greetings: ['Oh! Hello! Have you seen how the light dances in here?', 'I keep the lanterns. Well, I keep trying to.', 'The fireflies follow me. I think they like my hat.'],
    idle: ['hop', 'flap'],
  },
  {
    id: 'hazel',
    name: 'Hazel',
    role: 'Forager of the clearing',
    room: 'grove',
    pos: { x: 2120, y: 700 },
    facing: 1,
    look: { body: '#8B5A2B', belly: '#F2E1C1', accent: '#81B29A', wear: { head: 'leaf-crown~0', neck: 'bandana~3', pet: 'hedgehog~0' } },
    greetings: ['The leaves are falling just right today.', 'If you hear crunching, that is probably me.', 'Acorns, mushrooms, feathers: the clearing gives if you look.'],
    idle: ['tilt', 'hop'],
  },
  {
    id: 'juniper',
    name: 'Juniper',
    role: 'Treehouse builder',
    room: 'grove',
    pos: { x: 3050, y: 760 },
    facing: -1,
    look: { body: '#A67B5B', belly: '#E8D8B8', accent: '#C9A227', wear: { head: 'bucket-hat~0', face: 'round-glasses~0', pet: 'snail~0' } },
    greetings: ['Measure twice, hoot once.', 'That rope bridge? Mine. The wobble is a feature.', 'Every treehouse needs a good view and a better railing.'],
    idle: ['nod', 'stretch'],
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Keeper of the feather shop',
    room: 'market',
    pos: { x: 905, y: 730 },
    facing: -1,
    look: { body: '#2F3E5C', belly: '#BFC9D6', accent: '#FF2AA1', wear: { head: 'top-hat~0', neck: 'bow-tie~5', fx: 'neon-outline~4' } },
    greetings: ['Feathers in, treasures out. Have a look around.', 'New things every week, three every day, and a little gift for you each morning.', 'The rain keeps the neon shiny. Good for business.'],
    idle: ['bow', 'wave'],
    shop: true,
  },
  {
    id: 'flicker',
    name: 'Flicker',
    role: 'Tinkerer',
    room: 'market',
    pos: { x: 520, y: 800 },
    facing: 1,
    look: { body: '#6B6B6B', belly: '#BFC9D6', accent: '#00E5FF', wear: { head: 'propeller-cap~0', face: 'brass-goggles~0', pet: 'beetle~4' } },
    greetings: ['Do not touch the blinking one. Or do, it is fine, probably.', 'Gears, springs, a little neon: that is all anything is.', 'I dropped something again. I always drop something.'],
    idle: ['tilt', 'spin'],
  },
];

const BY_ID: Readonly<Record<string, NpcDef>> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export function getNpc(id: string): NpcDef | undefined {
  return Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export function npcsIn(room: string): NpcDef[] {
  return NPCS.filter((n) => n.room === room);
}
