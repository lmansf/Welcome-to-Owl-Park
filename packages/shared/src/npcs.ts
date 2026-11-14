/**
 * NPC owls: the park's residents. Each stands in one room, wears collectibles from the catalogue
 * (so they need no art of their own), offers quests and takes them back. Every string here is
 * shown to visitors: names and lines stay public-safe, and the names await the owner's approval
 * (proposal C31) before they ship.
 */
import type { OwlLook, Vec2 } from './protocol';
import { questOwlAt } from './hollowOval';
import { START_QUEST_OWL } from './realmStart';

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
  glass: 'the glass street',
  ink: 'the ink garden',
  grove: 'the treehouse clearing',
  market: 'the neon street',
  // The new map's stairs (map 3), top to bottom.
  'm3-stair-1': 'the high boardwalk',
  'm3-stair-2': 'the quiet landing',
  'm3-stair-3': 'the treetop diner',
  'm3-ground': 'the forest path',
  'm3-under': 'the root stair',
  // The inside of the trunk, its four Commons side by side.
  'm3-hall': 'the great hollow',
  // The parkour courses behind three of the Commons, by the names on their gates (OP-281).
  'canopy-1': 'Updraft Canopy',
  'circuit-1': 'Blackout Circuit',
  'brush-1': 'Brushstroke Bridges',
};

export function placeName(room: string): string {
  return PLACE_NAMES[room] ?? 'the park';
}

/**
 * The names the new map (3) gives places, where they are not the names quest text uses (OP-346). On
 * the new map the room `hub` is the Party Grove at the tree's foot, and a step read "Visit the great
 * tree" where the doorway's sign and the Menu's map both said the Party Grove. Quest text is worded
 * once for every owl with PLACE_NAMES, whichever park the owl walks, and the play log records those
 * words; a screen puts the walked park's own names in as it shows them (placeWords).
 */
export const NEW_MAP_PLACE_NAMES: Readonly<Record<string, string>> = {
  hub: 'the Party Grove',
  glass: 'the glass realm',
  'm3-hall': 'the Great Hollow',
};

/**
 * A place's name as an owl walking `map` is shown it: the new map's own where it has one. A room of the
 * new map alone (its id says so, `m3-`) has that name whichever park the owl walks: a course's way out
 * leads into the Great Hollow on any of them.
 */
export function placeShown(room: string, map: number): string {
  return (map === 3 || room.startsWith('m3-') ? NEW_MAP_PLACE_NAMES[room] : undefined) ?? placeName(room);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * `text` with each place named as the park the owl walks names it (`map`): quest steps and offers, an
 * owl's title, what a quest owl says. Today's park and the tree read as they are written.
 */
export function placeWords(text: string, map: number): string {
  if (map !== 3) return text;
  let out = text;
  for (const [room, name] of Object.entries(NEW_MAP_PLACE_NAMES)) {
    const old = PLACE_NAMES[room];
    if (!old || old === name) continue;
    out = out.split(old).join(name).split(capital(old)).join(capital(name));
  }
  return out;
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
    greetings: ['Welcome in. The tree has room for everyone.', 'Every leaf in this hollow has a story. Some are even true.', 'Mind the moonbeam. It likes to be looked at.'],
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
    // The grove's west end, a full screen from arrival: quests sit deep in a realm (OP-152).
    pos: { x: 800, y: 800 },
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
    // The grove's east end, on the front side of the fallen log (OP-152, OP-320).
    pos: { x: 4150, y: 845 },
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
    // East of the market's arrival, deeper in (OP-152).
    pos: { x: 2800, y: 820 },
    facing: -1,
    look: { body: '#6B6B6B', belly: '#BFC9D6', accent: '#00E5FF', wear: { head: 'propeller-cap~0', face: 'brass-goggles~0', pet: 'beetle~4' } },
    greetings: ['Do not touch the blinking one. Or do, it is fine, probably.', 'Gears, springs, a little neon: that is all anything is.', 'I dropped something again. I always drop something.'],
    idle: ['tilt', 'spin'],
  },
  {
    // The stained-glass realm's quest owl (OP-276), at the foot of the quest post on the realm's start,
    // in the realm's own circlet (the realm hat until its artist's is delivered). Its quests are its own:
    // the realm is gated, so no quest elsewhere in the park sends an owl here (questCatalog.ts, TOWN_NPCS).
    id: 'prism',
    name: 'Prism',
    role: 'Keeper of the glass street',
    room: 'glass',
    pos: { ...START_QUEST_OWL },
    facing: 1,
    look: { body: '#4B5D8A', belly: '#E6ECF7', accent: '#9FD0FF', wear: { head: 'glass-circlet~0', neck: 'moon-pendant~0' } },
    greetings: ['The light comes through every pane a different colour. I keep count.', 'The guardian listens when you stand in front of it.', 'The climb is just past the nest. Mind the wind.'],
    idle: ['tilt', 'nod'],
  },
  {
    // The ink garden's quest owl (OP-402), a snowy owl like the garden's idol, on the paving just in from
    // the tree's doorway, so an owl coming in from the Great Hollow meets it first. Like Prism its quests
    // are its own (questCatalog.ts, TOWN_NPCS).
    id: 'sumi',
    name: 'Sumi',
    role: 'Keeper of the ink garden',
    room: 'ink',
    pos: { x: 600, y: 790 },
    facing: 1,
    look: { body: '#D9D6CF', belly: '#F7F4EC', accent: '#2B2B30', wear: { head: 'bucket-hat~0', neck: 'knit-scarf~0', pet: 'snail~0' } },
    greetings: ['Every stone in this garden was painted with one brush. Walk softly.', 'The moon gate opens on Brushstroke Bridges. Take the steps up.', 'The bench by the wall is warm. Hop up and rest a while.'],
    idle: ['nod', 'tilt'],
  },
  // The Great Hollow's quest owls (OP-281, OP-258): one in each Commons round its rim, the ink Commons'
  // first, each beside its plaza (hollowOval.ts, questOwlAt). Like Prism they give only their own story
  // quests (questCatalog.ts): the hollow is not one of the town's rooms, so the daily pools are as before.
  {
    id: 'quill',
    name: 'Quill',
    role: 'Keeper of Brushstroke Bridges',
    room: 'm3-hall',
    pos: questOwlAt('ink'),
    facing: 1,
    look: { body: '#4A4A4F', belly: '#E8DCC0', accent: '#2B2B30', wear: { head: 'beret~0', face: 'round-glasses~0', pet: 'moth~0' } },
    greetings: ['Every bridge out there was painted in one stroke. Mind the wet ones.', 'Ink dries slowly in here. So do I.', 'The painted gate in this Commons opens on the bridges. Go on, have a look.'],
    idle: ['tilt', 'nod'],
  },
  {
    id: 'fern',
    name: 'Fern',
    role: 'Guide to the treehouse clearing',
    room: 'm3-hall',
    pos: questOwlAt('grove'),
    facing: -1,
    look: { body: '#7A5A36', belly: '#F2E1C1', accent: '#7FD46A', wear: { head: 'acorn-cap~0', neck: 'flower-lei~0', pet: 'ladybug~0' } },
    greetings: ['The air rises warm past the canopy. Spread your wings and let it lift you.', 'Hazel and Juniper are out in the clearing. Tell them Fern says hello.', 'Leaves blow in from the clearing all day. I do not mind.'],
    idle: ['hop', 'flap'],
  },
  {
    id: 'volt',
    name: 'Volt',
    role: 'Guide to the neon street',
    room: 'm3-hall',
    pos: questOwlAt('market'),
    facing: -1,
    look: { body: '#3A3550', belly: '#BFC9D6', accent: '#FF4FB8', wear: { head: 'beanie~0', face: 'aviator-goggles~0', pet: 'firefly~0' } },
    greetings: ['The lights on the circuit go out one by one. Find the switches and they come back.', 'Nova keeps the feather shop out on the street. Flicker keeps dropping things.', 'Mind the puddles out there. They glow.'],
    idle: ['spin', 'wave'],
  },
  {
    id: 'lumen',
    name: 'Lumen',
    role: 'Watcher of the glass door',
    room: 'm3-hall',
    pos: questOwlAt('glass'),
    facing: 1,
    look: { body: '#5B6E99', belly: '#E6ECF7', accent: '#9FD0FF', wear: { head: 'moon-circlet~0', neck: 'pearl-necklace~0', pet: 'dragonfly~0' } },
    greetings: ['Through that door the light comes in every colour at once.', 'Prism keeps count of the panes out there. I keep count of the owls.', 'Stand in the moonbeam a moment. It is warm.'],
    idle: ['nod', 'tilt'],
  },
];

const BY_ID: Readonly<Record<string, NpcDef>> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export function getNpc(id: string): NpcDef | undefined {
  return Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export function npcsIn(room: string): NpcDef[] {
  return NPCS.filter((n) => n.room === room);
}
