/**
 * Quests: what they are made of, how a step reads, which events advance them and what they pay.
 * The catalogue lives in questCatalog.ts (hand-written story quests plus templates expanded in
 * bulk); the ledger that tracks each collector's progress is questbook.ts. Pure and
 * deterministic, so the room server, the local mode and the tests share every rule.
 *
 * Every string a quest carries is shown to visitors: public-safe words only, and places by
 * their public names (PLACE_NAMES), never realm names.
 */
import { RARITIES, parseVariant, type Rarity } from './collectibles';
import { KIND_RULES, QUEST_ITEMS, type InteractableKind, type QuestItemKind } from './interactables';
import { getNpc, placeName } from './npcs';

export type QuestType = 'talk' | 'visit' | 'interact' | 'emote' | 'gather' | 'mixed';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestLength = 'short' | 'medium' | 'long';
/** Story quests are done once; daily and weekly ones come back each park day or week. */
export type Cadence = 'story' | 'daily' | 'weekly';

export const QUEST_TYPES: readonly QuestType[] = ['talk', 'visit', 'interact', 'emote', 'gather', 'mixed'];
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const QUEST_LENGTHS: readonly QuestLength[] = ['short', 'medium', 'long'];
export const CADENCES: readonly Cadence[] = ['story', 'daily', 'weekly'];

export type Goal =
  | { kind: 'talk'; npc: string }
  | { kind: 'visit'; room: string }
  /** Use interactables of a kind; `distinct` counts different ones (three stalls, not one stall thrice). */
  | { kind: 'interact'; what: InteractableKind; count: number; room?: string; distinct?: boolean }
  /** Play an emote, optionally near an NPC or in a room. */
  | { kind: 'emote'; emote: string; npc?: string; room?: string }
  /** Pick up quest items that appear (for this collector only) at hiding spots in a room. */
  | { kind: 'gather'; item: QuestItemKind; count: number; room: string };

export interface QuestStep {
  goal: Goal;
}

export interface QuestReward {
  feathers: number;
  /** A collectible: a specific variant, or `pick` for one chosen by the quest's difficulty. */
  item: string | 'pick' | null;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: string;
  type: QuestType;
  difficulty: Difficulty;
  length: QuestLength;
  cadence: Cadence;
  /** The work; handing the quest back to the giver is the step after the last. */
  steps: readonly QuestStep[];
  reward: QuestReward;
  /** What the giver says when offering it, and when it comes back done. */
  offer: string;
  thanks: string;
  /** Story quests that must be handed in first. */
  requires?: readonly string[];
  /** Which template made it (bulk quests), for the Quest Log. */
  template?: string;
}

// ---------- events the server observes ----------

export type QuestEvent =
  | { kind: 'talk'; npc: string }
  | { kind: 'visit'; room: string }
  | { kind: 'interact'; what: InteractableKind; id: string; room: string }
  | { kind: 'emote'; emote: string; room: string; near: readonly string[] }
  | { kind: 'gather'; item: QuestItemKind; room: string };

/** Does an event count toward a goal? (Counting and distinctness are the ledger's job.) */
export function goalMatches(goal: Goal, ev: QuestEvent): boolean {
  switch (goal.kind) {
    case 'talk':
      return ev.kind === 'talk' && ev.npc === goal.npc;
    case 'visit':
      return ev.kind === 'visit' && ev.room === goal.room;
    case 'interact':
      return ev.kind === 'interact' && ev.what === goal.what && (goal.room === undefined || ev.room === goal.room);
    case 'emote':
      return ev.kind === 'emote' && ev.emote === goal.emote && (goal.room === undefined || ev.room === goal.room) && (goal.npc === undefined || ev.near.includes(goal.npc));
    case 'gather':
      return ev.kind === 'gather' && ev.item === goal.item && ev.room === goal.room;
  }
}

/** How many events a goal needs. */
export function goalCount(goal: Goal): number {
  return goal.kind === 'interact' || goal.kind === 'gather' ? goal.count : 1;
}

const npcName = (id: string) => getNpc(id)?.name ?? 'a friend';
const plural = (n: number, one: string, many: string) => (n === 1 ? `a ${one}` : `${n} ${many}`);
const emoteName = (e: string) => e.charAt(0).toUpperCase() + e.slice(1);

/** The words for a step, e.g. "Flop into 3 leaf piles in the treehouse clearing". */
export function goalText(goal: Goal): string {
  switch (goal.kind) {
    case 'talk':
      return `Talk to ${npcName(goal.npc)} at ${placeName(getNpc(goal.npc)?.room ?? '')}`;
    case 'visit':
      return `Visit ${placeName(goal.room)}`;
    case 'interact': {
      const r = KIND_RULES[goal.what];
      const what = goal.count === 1 ? `the ${r.noun}` : `${goal.count} ${goal.distinct ? 'different ' : ''}${r.plural}`;
      return `${r.verb} ${what}${goal.room ? ` at ${placeName(goal.room)}` : ''}`;
    }
    case 'emote':
      return `${emoteName(goal.emote)}${goal.npc ? ` for ${npcName(goal.npc)}` : ''}${goal.room && !goal.npc ? ` at ${placeName(goal.room)}` : ''}`;
    case 'gather': {
      const it = QUEST_ITEMS[goal.item];
      return `Find ${plural(goal.count, it.noun, it.plural)} at ${placeName(goal.room)}`;
    }
  }
}

// ---------- rewards (defaults the owner may change) ----------

/**
 * Feathers for a daily quest, by difficulty (canon C31: three daily quests, leaf piles and
 * duplicates make an active day of about 100 to 150 feathers).
 */
export const DAILY_QUEST_FEATHERS: Readonly<Record<Difficulty, number>> = { easy: 15, medium: 25, hard: 40 };
/** A weekly quest pays about seven times a daily one (canon C31), and always a rare-or-better collectible. */
export const WEEKLY_QUEST_FEATHERS = 150;
/** The rarity odds (percent) of a daily quest's picked collectible, by difficulty: harder leans rarer. */
export const REWARD_ODDS: Readonly<Record<Difficulty, Readonly<Record<Rarity, number>>>> = {
  easy: { common: 70, uncommon: 27, rare: 3, epic: 0 },
  medium: { common: 45, uncommon: 40, rare: 13, epic: 2 },
  hard: { common: 20, uncommon: 45, rare: 30, epic: 5 },
};
/** A weekly quest's collectible is always rare or better. */
export const WEEKLY_REWARD_ODDS: Readonly<Record<Rarity, number>> = { common: 0, uncommon: 0, rare: 80, epic: 20 };
/** Within a rarity, a variant the collector does not own yet is this many times as likely. */
export const REWARD_UNOWNED_BOOST = 4;
/** How many quests one collector can carry at once. */
export const MAX_ACTIVE_QUESTS = 4;
/** Each park day offers one daily quest of each difficulty; each week one medium and one hard weekly quest. */
export const DAILY_OFFER_DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
export const WEEKLY_OFFER_DIFFICULTIES: readonly Difficulty[] = ['medium', 'hard'];
export const DAILY_OFFERS = DAILY_OFFER_DIFFICULTIES.length;
export const WEEKLY_OFFERS = WEEKLY_OFFER_DIFFICULTIES.length;

/** Feathers for a daily or weekly quest (story quests carry their own). */
export function questFeathers(cadence: 'daily' | 'weekly', difficulty: Difficulty): number {
  return cadence === 'weekly' ? WEEKLY_QUEST_FEATHERS : DAILY_QUEST_FEATHERS[difficulty];
}

/** The rarity odds of a quest's picked collectible. */
export function rewardOdds(q: Pick<QuestDef, 'cadence' | 'difficulty'>): Readonly<Record<Rarity, number>> {
  return q.cadence === 'weekly' ? WEEKLY_REWARD_ODDS : REWARD_ODDS[q.difficulty];
}

function weighted<T>(items: readonly T[], weight: (t: T) => number, rnd: () => number): T | undefined {
  let total = 0;
  for (const it of items) total += weight(it);
  if (total <= 0) return undefined;
  let r = rnd() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/**
 * A collectible for a quest: a rarity by its odds (`rewardOdds`; only rarities that have variants),
 * then a variant of it with unowned ones REWARD_UNOWNED_BOOST times as likely.
 */
export function pickRewardVariant(odds: Readonly<Record<Rarity, number>>, pool: Readonly<Record<Rarity, readonly string[]>>, owned: ReadonlySet<string>, rnd: () => number): string | null {
  const rarity = weighted(
    RARITIES.filter((r) => pool[r].length > 0),
    (r) => odds[r],
    rnd,
  );
  if (!rarity) return null;
  return weighted(pool[rarity], (v) => (owned.has(v) ? 1 : REWARD_UNOWNED_BOOST), rnd) ?? null;
}

// ---------- what the client sees ----------

export interface StepView {
  text: string;
  /** Progress on this step (e.g. 2 of 3), or null for one-off steps. */
  count: number;
  need: number;
}

export interface ActiveQuestView {
  id: string;
  title: string;
  giver: string;
  type: QuestType;
  difficulty: Difficulty;
  length: QuestLength;
  cadence: Cadence;
  steps: string[];
  /** Index of the current step; equal to `steps.length` when it is ready to hand in. */
  step: number;
  current: StepView | null;
  ready: boolean;
  reward: QuestReward;
  /** When it expires (daily and weekly quests end with their day or week), ms; 0 for never. */
  endsAt: number;
  /** Quest items for the current step (only this collector sees them): on the floor, or up on a perch with its `top` (OP-084). */
  items: { n: number; room: string; x: number; y: number; top?: number; kind: QuestItemKind }[];
}

export interface QuestOfferView {
  id: string;
  title: string;
  giver: string;
  type: QuestType;
  difficulty: Difficulty;
  length: QuestLength;
  cadence: Cadence;
  steps: string[];
  reward: QuestReward;
  offer: string;
}

export interface QuestBoard {
  day: string;
  week: string;
  /** When the next park day and week begin, ms (server clock). */
  nextDay: number;
  nextWeek: number;
  active: ActiveQuestView[];
  /** What each NPC offers right now (quests this collector could accept). */
  offers: Record<string, QuestOfferView[]>;
  /** Story quests handed in, so the client can show "all done" lines. */
  storyDone: string[];
  feathers: number;
}

/** A change worth a toast: a step done, a quest ready to hand in. */
export interface QuestUpdate {
  quest: string;
  title: string;
  /** The step that progressed (index), its count and need after the event. */
  step: number;
  count: number;
  need: number;
  /** The whole quest is ready to hand in. */
  ready: boolean;
}

export function stepTexts(q: QuestDef): string[] {
  return q.steps.map((s) => goalText(s.goal));
}

/** Validate the variant of a fixed reward (catalogue tests use this). */
export function isRewardItem(item: QuestReward['item']): boolean {
  return item === null || item === 'pick' || parseVariant(item) !== null;
}
