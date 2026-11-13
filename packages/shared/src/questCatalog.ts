/**
 * The quest catalogue: hand-written story quests plus templates expanded in bulk over the NPC
 * owls, the rooms and the three difficulties. Ids are stable (template, giver, difficulty), so
 * progress survives a redeploy and the Quest Log sheet can track each quest by id. Template quests
 * of every difficulty make the daily pool; the grand quests (medium and hard) the weekly pool.
 *
 * To add quests in bulk, add a template below (or more givers to one); to add a one-off, add a
 * story quest. The catalogue tests check every reference (NPCs, rooms, items, emotes, rewards).
 */
import { hashSeed, rotationRandom } from './parktime';
import { questFeathers, type Cadence, type Difficulty, type Goal, type QuestDef, type QuestLength, type QuestStep, type QuestType } from './quests';
import type { QuestItemKind } from './interactables';
import { NPCS, getNpc } from './npcs';
import { getPuzzle } from './puzzles';

const ROOMS = ['hub', 'grove', 'market'] as const;
type RoomId = (typeof ROOMS)[number];
const ITEM_OF: Record<RoomId, QuestItemKind> = { hub: 'moonstone', grove: 'acorn', market: 'gear' };
const DIFFS: readonly Difficulty[] = ['easy', 'medium', 'hard'];

const talk = (npc: string): QuestStep => ({ goal: { kind: 'talk', npc } });
const visit = (room: string): QuestStep => ({ goal: { kind: 'visit', room } });
const flop = (count: number, room?: string): QuestStep => ({ goal: room ? { kind: 'interact', what: 'leaf-pile', count, room } : { kind: 'interact', what: 'leaf-pile', count } });
const browse = (count: number): QuestStep => ({ goal: { kind: 'interact', what: 'stall', count, room: 'market', distinct: count > 1 } });
const bask = (): QuestStep => ({ goal: { kind: 'interact', what: 'moonbeam', count: 1, room: 'hub' } });
const emote = (e: string, opts: { npc?: string; room?: string } = {}): QuestStep => ({ goal: { kind: 'emote', emote: e, ...opts } as Goal });
const gather = (room: RoomId, count: number): QuestStep => ({ goal: { kind: 'gather', item: ITEM_OF[room], count, room } });

/** One of `list`, chosen by a hash of `key` (stable across builds). */
function pick<T>(key: string, list: readonly T[]): T {
  return list[hashSeed(key) % list.length]!;
}

function lengthOf(steps: number): QuestLength {
  return steps <= 1 ? 'short' : steps <= 3 ? 'medium' : 'long';
}

/**
 * The owls of the open town (the great tree, the clearing and the neon street), who give and take the
 * templates' quests. A realm's own quest owl (OP-276) gives only its own story quests: a realm may be
 * gated, and no quest should send an owl to a door it cannot open.
 */
export const TOWN_NPCS = NPCS.filter((n) => (ROOMS as readonly string[]).includes(n.room));
const roomOf = (npc: string) => getNpc(npc)!.room as RoomId;
const others = (npc: string) => TOWN_NPCS.filter((n) => n.id !== npc);
const othersIn = (npc: string, room: string) => others(npc).filter((n) => n.room === room);
const othersElsewhere = (npc: string) => others(npc).filter((n) => n.room !== roomOf(npc));

// ---------- story quests (hand-written, once each) ----------

export const STORY_QUESTS: readonly QuestDef[] = [
  {
    id: 'story-welcome',
    title: 'Welcome to Owl Park',
    giver: 'bramble',
    type: 'mixed',
    difficulty: 'easy',
    length: 'long',
    cadence: 'story',
    steps: [talk('pip'), visit('grove'), flop(1), talk('nova'), emote('hoot', { npc: 'bramble' })],
    reward: { feathers: 50, item: 'leaf-crown~0' },
    offer: 'New feathers! Let me show you around. Say hello to Pip, then see the clearing outside and the neon street, and come back and hoot for me.',
    thanks: 'There. Now you know your way around, and everyone knows you. This crown of leaves is yours.',
  },
  {
    id: 'story-hazel-acorns',
    title: 'The acorn stash',
    giver: 'hazel',
    type: 'gather',
    difficulty: 'easy',
    length: 'short',
    cadence: 'story',
    steps: [gather('grove', 3)],
    reward: { feathers: 40, item: 'acorn-cap~0' },
    offer: 'I buried acorns all over the clearing and forgot where. Three would do. They glint a little in the grass.',
    thanks: 'My acorns! Here, I made a cap from the best one. It suits you.',
    requires: ['story-welcome'],
  },
  {
    id: 'story-flicker-gears',
    title: 'Spare parts',
    giver: 'flicker',
    type: 'mixed',
    difficulty: 'medium',
    length: 'medium',
    cadence: 'story',
    steps: [gather('market', 3), emote('hoot', { npc: 'flicker' })],
    reward: { feathers: 60, item: 'brass-goggles~0' },
    offer: 'Three gears rolled off my bench and into the street. Find them, then give me a hoot so I know you are back.',
    thanks: 'Ah, they still spin! Take these goggles. They make everything look like it needs fixing.',
    requires: ['story-welcome'],
  },
  {
    id: 'story-pip-lanterns',
    title: 'The lantern round',
    giver: 'pip',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [bask(), visit('grove'), visit('market')],
    reward: { feathers: 50, item: 'fireflies~0' },
    offer: 'Every night I check the light. Bask in the moonbeam, then look in on the clearing and the neon street for me?',
    thanks: 'All bright, all well. The fireflies liked you, so they are coming with you now.',
    requires: ['story-welcome'],
  },
  {
    id: 'story-nova-window',
    title: 'Window shopping',
    giver: 'nova',
    type: 'interact',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [browse(3), talk('flicker')],
    reward: { feathers: 40, item: 'bow-tie~0' },
    offer: 'Before you spend a single feather, see what the street has. Browse three stalls, then tell Flicker I sent you.',
    thanks: 'A careful shopper. My favourite kind. A bow tie, on the house.',
    requires: ['story-welcome'],
  },
  {
    id: 'story-juniper-survey',
    title: 'Survey of the treetops',
    giver: 'juniper',
    type: 'mixed',
    difficulty: 'medium',
    length: 'long',
    cadence: 'story',
    steps: [visit('hub'), emote('flap', { room: 'hub' }), visit('market'), emote('flap', { room: 'market' })],
    reward: { feathers: 70, item: 'bucket-hat~0' },
    offer: 'I need to know how far a good flap carries. Flap once in the great tree and once on the neon street, then come tell me.',
    thanks: 'Just as I thought: excellent acoustics. Have my spare hat, it has seen a lot of treetops.',
    requires: ['story-welcome'],
  },
  {
    // The new map's way down the tree (map 3): two piles in the Great Hollow and one at the foot of the arcade's stair, so the way down has errands of its own.
    id: 'story-pip-stair-leaves',
    title: 'Leaves on the stair',
    giver: 'pip',
    type: 'interact',
    difficulty: 'easy',
    length: 'long',
    cadence: 'story',
    // Four steps as before, so a quest under way keeps its place: the Commons' pile is now in the hollow.
    steps: [flop(1, 'm3-hall'), flop(1, 'm3-hall'), flop(1, 'arcade'), emote('hoot', { npc: 'pip' })],
    reward: { feathers: 50, item: null },
    offer: 'The leaves come down the tree faster than I can sweep. Flop into two piles in the great hollow and one in the arcade below it, then come back and hoot for me.',
    thanks: 'The hollow is clear and the lanterns shine again. Here, for your trouble.',
    requires: ['story-welcome'],
  },
  {
    // The stained-glass realm's start (OP-276): a job from the quest owl at the post, the leaves by the
    // trading nest, and a hoot for the guardian on the vote spot, so the start has something to do.
    id: 'story-prism-panes',
    title: 'Leaves on the glass',
    giver: 'prism',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [flop(1, 'glass'), emote('hoot', { npc: 'prism' })],
    reward: { feathers: 40, item: null },
    offer: 'The wind off the climb keeps blowing leaves against the trading nest. Flop into the pile for me, then come back and give me a hoot.',
    thanks: 'The panes are clear again and the light is back. Here, for your trouble.',
  },
  // The Great Hollow's Commons (OP-281, OP-258): each Commons' quest owl asks for a leaf pile or the
  // moonbeam on the hollow's floor and a look through its Commons' door, then a hoot back, so every
  // Commons has something to do and points the way on. The ink Commons' first: before these, all it had
  // was its leaf piles.
  {
    id: 'story-quill-bridges',
    title: 'Fresh ink',
    giver: 'quill',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [flop(1, 'm3-hall'), visit('brush-1'), emote('hoot', { npc: 'quill' })],
    reward: { feathers: 40, item: null },
    offer: 'Leaves keep landing on my wet paint. Flop into a pile here in the hollow, then go through the painted gate and see Brushstroke Bridges. Come back and give me a hoot.',
    thanks: 'You found the bridges! The ink held, and so did you. Here, for your trouble.',
  },
  {
    id: 'story-fern-canopy',
    title: 'Up with the warm air',
    giver: 'fern',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [flop(1, 'm3-hall'), visit('canopy-1'), emote('hoot', { npc: 'fern' })],
    reward: { feathers: 40, item: null },
    offer: 'The leaves from the clearing end up in here. Flop into one pile in the hollow, then step through the course gate to Updraft Canopy. Come back and hoot for me.',
    thanks: 'The canopy is something, is it not? Here, for your trouble.',
  },
  {
    id: 'story-volt-circuit',
    title: 'Lights on',
    giver: 'volt',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    steps: [{ goal: { kind: 'interact', what: 'moonbeam', count: 1, room: 'm3-hall' } }, visit('circuit-1'), emote('hoot', { npc: 'volt' })],
    reward: { feathers: 40, item: null },
    offer: 'Before you go out where it is dark, soak up some light. Bask in a moonbeam here in the hollow, then go through the course gate to Blackout Circuit. Come back and hoot for me.',
    thanks: 'You went into the dark and came back shining. Here, for your trouble.',
  },
  {
    id: 'story-lumen-glass',
    title: 'Every colour at once',
    giver: 'lumen',
    type: 'mixed',
    difficulty: 'easy',
    length: 'medium',
    cadence: 'story',
    // The glass realm has a quest owl of its own at its start and may be gated (realmStart.test.ts), so
    // Lumen's errand stays in the hollow, by the realm's door.
    steps: [flop(1, 'm3-hall'), { goal: { kind: 'interact', what: 'moonbeam', count: 1, room: 'm3-hall' } }, emote('hoot', { npc: 'lumen' })],
    reward: { feathers: 40, item: null },
    offer: 'Leaves blow up against the glass door all day. Flop into one pile in the hollow, then bask in a moonbeam to see the colours, and come back and hoot for me.',
    thanks: 'Now you have the light in your feathers. The glass door in this Commons opens whenever you like.',
  },
];

// ---------- templates (expanded in bulk) ----------

interface Built {
  title: string;
  type: QuestType;
  steps: QuestStep[];
  offer: string;
  thanks: string;
}

interface Template {
  id: string;
  givers: readonly string[];
  build(giver: string, d: Difficulty, key: string): Built | null;
}

const GRAND_TITLES = ['The grand tour', 'A very long night', 'All around the park', 'The full flight', 'Round the whole park', 'One big adventure'];
/** The monthly tours (OP-254): one title per giver, like the grand quests. */
const ODYSSEY_TITLES = ['The long moon', 'A month of wonders', 'Every corner of the park', 'The great migration', 'Moon to moon', 'The whole wide park'];

const THANKS = ['Wonderful. You have earned this.', 'Just what I needed. Here, for your trouble.', 'You are quicker than you look. Take this.', 'Thank you, friend. A little something for you.'];

const TEMPLATES: readonly Template[] = [
  {
    id: 'leaves',
    givers: ['hazel', 'juniper', 'pip', 'bramble'],
    build: (giver, d, key) => {
      const n = { easy: 2, medium: 4, hard: 8 }[d];
      return {
        title: pick(key, ['Leaf day', 'Into the leaves', 'Crunch time', 'Pile on']),
        type: 'interact',
        steps: [flop(n)],
        offer: pick(key + 'o', [`The leaf piles look far too tidy. Flop into ${n} of them for me?`, `Nothing beats a good flop. ${n} leaf piles, any you like.`, `I dare you: ${n} leaf piles, belly first.`]),
        thanks: pick(key + 't', ['Ha! You have leaves in your feathers. Perfect.', ...THANKS]),
      };
    },
  },
  {
    id: 'errand',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      const near = othersIn(giver, roomOf(giver));
      const far = othersElsewhere(giver);
      const farRooms = [...new Set(far.map((n) => n.room))];
      let to: string[];
      if (d === 'easy') to = near.length ? [near[0]!.id] : [pick(key, far).id];
      else if (d === 'medium') to = [pick(key, far).id, pick(key + 'b', near.length ? near : far).id];
      else to = [...farRooms.map((r) => pick(key + r, far.filter((n) => n.room === r)).id), ...(near.length ? [near[0]!.id] : [])];
      to = [...new Set(to)];
      const steps = to.map(talk);
      if (d === 'hard') steps.push(emote('hoot', { npc: giver }));
      const first = getNpc(to[0]!)!.name;
      const more = to.length === 2 ? ' and one more friend' : to.length > 2 ? ' and a few others' : '';
      return {
        title: pick(key, ['A word to pass on', 'Carry the news', 'Owl post', 'Say hello for me']),
        type: d === 'hard' ? 'mixed' : 'talk',
        steps,
        offer: pick(key + 'o', [`Would you say hello to ${first}${more} for me?`, `I have news for ${first}${more}. Would you carry it?`]),
        thanks: pick(key + 't', THANKS),
      };
    },
  },
  {
    id: 'tour',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      const away = ROOMS.filter((r) => r !== roomOf(giver));
      let steps: QuestStep[];
      if (d === 'easy') steps = [visit(pick(key, away))];
      else if (d === 'medium') steps = away.map(visit);
      else steps = [...away.map(visit), bask(), talk(pick(key + 'n', othersElsewhere(giver)).id)];
      return {
        title: pick(key, ['Stretch your wings', 'A little wander', 'See the sights', 'Out and about']),
        type: d === 'hard' ? 'mixed' : 'visit',
        steps,
        offer: pick(key + 'o', ['You have been standing still too long. Go and see a bit of the park.', 'There is a lot more park than this. Go have a look and come back.']),
        thanks: pick(key + 't', THANKS),
      };
    },
  },
  {
    id: 'show',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      let steps: QuestStep[];
      if (d === 'easy') steps = [emote(pick(key, ['hoot', 'flap']), { npc: giver })];
      else if (d === 'medium') steps = ROOMS.filter((r) => r !== roomOf(giver)).map((r) => emote(pick(key + r, ['hoot', 'flap']), { room: r }));
      else steps = [...ROOMS.map((r) => emote('hoot', { npc: pick(key + r, TOWN_NPCS.filter((n) => n.room === r && n.id !== giver)).id })), emote('flap', { npc: giver })];
      // Titles and offers follow the emotes the steps ask for.
      const emotes = steps.map((s) => (s.goal.kind === 'emote' ? s.goal.emote : ''));
      const hoots = emotes.every((e) => e === 'hoot');
      const flaps = emotes.every((e) => e === 'flap');
      return {
        title: pick(key, hoots ? ['Big hoot energy', 'Make some noise', 'Show and tell'] : flaps ? ['Flap about', 'Wings out', 'Show and tell'] : ['Show and tell', 'Make some noise', 'Hoots and flaps']),
        type: 'emote',
        steps,
        offer: hoots
          ? pick(key + 'o', ['Let me hear it! Every owl needs a proper hoot.', 'The park is too quiet. Go and hoot about it.'])
          : flaps
            ? pick(key + 'o', ['Let me see those wings! A good flap, please.', 'Wings out! Show the park a proper flap.'])
            : pick(key + 'o', ['The park is too quiet. Go make some cheerful noise.', 'A hoot here, a flap there: go and liven the place up.']),
        thanks: pick(key + 't', ['Now that is a hoot. Well done.', ...THANKS]),
      };
    },
  },
  {
    id: 'gather',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      const home = roomOf(giver);
      const away = pick(key, ROOMS.filter((r) => r !== home));
      const steps = d === 'easy' ? [gather(home, 2)] : d === 'medium' ? [gather(home, 4)] : [gather(home, 3), gather(away, 3)];
      const item = ITEM_OF[home];
      return {
        title: pick(key, ['Lost and found', 'Finders keepers', 'Pocketful', 'Little treasures']),
        type: 'gather',
        steps,
        offer: pick(key + 'o', [`I keep finding ${item}s and then losing them again. Help me gather a few?`, `There are ${item}s glinting about. Only you will see them. Bring me some?`]),
        thanks: pick(key + 't', THANKS),
      };
    },
  },
  {
    id: 'browse',
    givers: ['nova', 'flicker'],
    build: (giver, d, key) => {
      const steps = d === 'easy' ? [browse(1)] : d === 'medium' ? [browse(3)] : [browse(3), bask(), talk('pip')];
      return {
        title: pick(key, ['Window shopper', 'What is new', 'Stall to stall']),
        type: d === 'hard' ? 'mixed' : 'interact',
        steps,
        offer: pick(key + 'o', ['Go see what the stalls have tonight. Tell me what catches your eye.', 'A good shopper looks before buying. Browse a little for me?']),
        thanks: pick(key + 't', THANKS),
      };
    },
  },
  {
    id: 'bask',
    givers: ['bramble', 'pip'],
    build: (giver, d, key) => {
      const steps = d === 'easy' ? [bask()] : d === 'medium' ? [bask(), emote('hoot', { npc: giver === 'bramble' ? 'pip' : 'bramble' })] : [bask(), flop(3, 'grove'), emote('hoot', { npc: 'hazel' }), visit('market')];
      return {
        title: pick(key, ['Moonbathing', 'A little light', 'Silver hour']),
        type: d === 'easy' ? 'interact' : 'mixed',
        steps,
        offer: pick(key + 'o', ['The moonbeam is at its best right now. Go and stand in it a moment.', 'You look tired. Bask in the moonbeam, it helps.']),
        thanks: pick(key + 't', THANKS),
      };
    },
  },
  {
    id: 'grand',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      if (d === 'easy') return null;
      const rnd = rotationRandom(key);
      const pool: Array<() => QuestStep> = [
        () => talk(pick(key + 'talk', othersElsewhere(giver)).id),
        () => visit(pick(key + 'visit', ROOMS.filter((r) => r !== roomOf(giver)))),
        () => flop(2),
        () => browse(2),
        () => bask(),
        () => emote('hoot', { npc: pick(key + 'emote', others(giver)).id }),
        () => emote('flap', { room: pick(key + 'flap', ROOMS) }),
        () => gather(pick(key + 'gather', ROOMS), 2),
      ];
      const n = d === 'medium' ? 4 : 6;
      // A seeded Fisher-Yates shuffle: the same order in every engine (the server and each browser
      // must agree on step indexes; a random sort comparator would not).
      const order = pool.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const steps = order.slice(0, n).map((i) => pool[i]!());
      return {
        // One title per giver: the week's two grand quests come from different givers, so they never share one.
        title: GRAND_TITLES[TOWN_NPCS.findIndex((n) => n.id === giver) % GRAND_TITLES.length]!,
        type: 'mixed',
        steps,
        offer: pick(key + 'o', ['I have a long list and a good feeling about you. It will take a while.', 'This one is a proper adventure. Are you up for it?']),
        thanks: pick(key + 't', ['You did it all? Every bit? Remarkable. This is yours.', ...THANKS]),
      };
    },
  },
  {
    // The monthly tour (OP-254): seven steps across every room, hard only, one title per giver.
    id: 'odyssey',
    givers: TOWN_NPCS.map((n) => n.id),
    build: (giver, d, key) => {
      if (d !== 'hard') return null;
      const rnd = rotationRandom(key);
      const pool: Array<() => QuestStep> = [
        () => talk(pick(key + 'talk', othersElsewhere(giver)).id),
        () => visit(pick(key + 'visit', ROOMS.filter((r) => r !== roomOf(giver)))),
        () => flop(4),
        () => browse(3),
        () => bask(),
        () => emote('hoot', { npc: pick(key + 'emote', others(giver)).id }),
        () => emote('flap', { room: pick(key + 'flap', ROOMS) }),
        () => gather(pick(key + 'gather', ROOMS), 3),
      ];
      const order = pool.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      return {
        title: ODYSSEY_TITLES[TOWN_NPCS.findIndex((n) => n.id === giver) % ODYSSEY_TITLES.length]!,
        type: 'mixed',
        steps: order.slice(0, 7).map((i) => pool[i]!()),
        offer: pick(key + 'o', ['This one takes a whole month of wandering, if you like. Every corner of the park.', 'A long road, all around the park. Take your time: you have the whole month.']),
        thanks: pick(key + 't', ['All of it, in one month? You are a true explorer. This is yours.', ...THANKS]),
      };
    },
  },
];

function expand(): QuestDef[] {
  const out: QuestDef[] = [];
  for (const t of TEMPLATES) {
    for (const giver of t.givers) {
      for (const d of DIFFS) {
        const id = `${t.id}-${giver}-${d}`;
        const b = t.build(giver, d, id);
        if (!b || !b.steps.length) continue;
        const cadence: Exclude<Cadence, 'story'> = t.id === 'grand' ? 'weekly' : t.id === 'odyssey' ? 'monthly' : 'daily';
        out.push({
          id,
          title: b.title,
          giver,
          type: b.type,
          difficulty: d,
          length: lengthOf(b.steps.length),
          cadence,
          steps: b.steps,
          reward: { feathers: questFeathers(cadence, d), item: 'pick' },
          offer: b.offer,
          thanks: b.thanks,
          template: t.id,
        });
      }
    }
  }
  return out;
}

/**
 * Puzzle quests (OP-255, puzzles.ts): an escape room of locks and keys, one step ("open every lock"),
 * played alone or in a run with anyone. The weekly one comes back every week, the monthly one every month.
 */
export const PUZZLE_QUESTS: readonly QuestDef[] = [
  {
    id: 'puzzle-moon-gate',
    title: 'The moonlit gate',
    giver: 'pip',
    type: 'puzzle',
    difficulty: 'hard',
    length: 'short',
    cadence: 'weekly',
    steps: [{ goal: { kind: 'puzzle', puzzle: 'moon-gate' } }],
    reward: { feathers: questFeathers('weekly', 'hard'), item: 'pick' },
    offer: 'There is a gate in the roots that only opens by moonlight. Three locks, and the clues are scattered all over the park. Bring friends if you like!',
    thanks: 'You opened the moon gate! I knew the clues would not stay hidden from you.',
  },
  {
    id: 'puzzle-lockbox',
    title: "The tinker's lockbox",
    giver: 'flicker',
    type: 'puzzle',
    difficulty: 'hard',
    length: 'short',
    cadence: 'monthly',
    steps: [{ goal: { kind: 'puzzle', puzzle: 'lockbox' } }],
    reward: { feathers: questFeathers('monthly', 'hard'), item: 'pick' },
    offer: 'I built a lockbox with four locks and hid the clues all over the park. Then I forgot them. Work it out alone or with a crew. Every box is different!',
    thanks: 'Open! Every last lock. You and your crew are cleverer than my box.',
  },
];

export const QUESTS: readonly QuestDef[] = [...STORY_QUESTS, ...expand(), ...PUZZLE_QUESTS];

const BY_ID: Readonly<Record<string, QuestDef>> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function getQuest(id: unknown): QuestDef | undefined {
  return typeof id === 'string' && Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export const DAILY_POOL: readonly QuestDef[] = QUESTS.filter((q) => q.cadence === 'daily');
export const WEEKLY_POOL: readonly QuestDef[] = QUESTS.filter((q) => q.cadence === 'weekly' && q.template === 'grand');
/** The weekly puzzle quests: one is offered each week beside the two grand quests. */
export const WEEKLY_PUZZLE_POOL: readonly QuestDef[] = PUZZLE_QUESTS.filter((q) => q.cadence === 'weekly');
/** The monthly tours (OP-254). */
export const MONTHLY_POOL: readonly QuestDef[] = QUESTS.filter((q) => q.cadence === 'monthly' && q.template === 'odyssey');
/** The monthly puzzle quests: one is offered each month beside one tour. */
export const MONTHLY_PUZZLE_POOL: readonly QuestDef[] = PUZZLE_QUESTS.filter((q) => q.cadence === 'monthly');

/** The puzzle a quest plays, if it is a puzzle quest. */
export function questPuzzle(q: QuestDef): string | null {
  const g = q.steps[0]?.goal;
  return q.type === 'puzzle' && g?.kind === 'puzzle' && getPuzzle(g.puzzle) ? g.puzzle : null;
}
