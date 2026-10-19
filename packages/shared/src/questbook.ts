/**
 * Each collector's quests: what the NPC owls offer today, accepting, advancing on events the
 * room server observes, gathering quest items, and handing in for feathers and a collectible.
 * Platform-free like the collection ledger it builds on, so the room server's Durable Object and
 * the local mode run the same rules.
 *
 * Rows are kept per (collector, quest, period): story quests have period '', daily ones the park
 * day and weekly ones the park week. A daily or weekly row from an earlier period has expired and
 * is forgotten the next time the collector's quests are read.
 */
import { variantsByRarity } from './collectibles';
import { distance } from './geometry';
import { PICKUP_RADIUS } from './collectibles';
import { INTERACTABLES, type QuestItemSpot } from './interactables';
import { NPCS } from './npcs';
import { nextParkDayAt, nextParkWeekAt, parkDay, parkWeek, rotationRandom } from './parktime';
import type { Vec2 } from './protocol';
import { DAILY_POOL, QUESTS, WEEKLY_POOL, getQuest } from './questCatalog';
import {
  DAILY_OFFER_DIFFICULTIES,
  MAX_ACTIVE_QUESTS,
  WEEKLY_OFFER_DIFFICULTIES,
  goalCount,
  goalMatches,
  goalText,
  pickRewardVariant,
  rewardOdds,
  stepTexts,
  type ActiveQuestView,
  type Difficulty,
  type QuestBoard,
  type QuestDef,
  type QuestEvent,
  type QuestOfferView,
  type QuestUpdate,
} from './quests';
import type { Award, CollectionBook, CollectionStore, QuestRow } from './book';

/** Hiding spots by room (room data's `spots`), where quest items appear. */
export type QuestSpots = Readonly<Record<string, readonly Vec2[]>>;

/** Quest items keep this far from NPC owls and interactables, so they never hide under one. */
const ITEM_CLEARANCE = 90;

export type AcceptResult = { ok: true; board: QuestBoard } | { ok: false; reason: 'unknown' | 'not-offered' | 'full' | 'active' | 'done'; board: QuestBoard };
export type AbandonResult = { ok: boolean; board: QuestBoard };
export type HandInResult =
  | { ok: true; quest: string; title: string; thanks: string; feathers: number; total: number; award: Award | null; board: QuestBoard }
  | { ok: false; reason: 'unknown' | 'not-active' | 'not-ready' | 'wrong-npc'; board: QuestBoard };
export type GatherResult = { ok: true; updates: QuestUpdate[]; board: QuestBoard } | { ok: false; reason: 'far' | 'gone' | 'not-current' };

function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * One quest of each listed difficulty from a pool for a period, from different givers, and from
 * different templates where the pool has enough of them (the weekly pool is all grand quests).
 */
function rotation(pool: readonly QuestDef[], seed: string, difficulties: readonly Difficulty[]): string[] {
  const out: string[] = [];
  const givers = new Set<string>();
  const kinds = new Set<string>();
  const kindOf = (q: QuestDef) => q.template ?? q.id;
  const varied = new Set(pool.map(kindOf)).size >= difficulties.length;
  const order = shuffled(pool, rotationRandom(seed));
  for (const d of difficulties) {
    const q = order.find((q) => q.difficulty === d && !givers.has(q.giver) && !(varied && kinds.has(kindOf(q))));
    if (!q) continue;
    givers.add(q.giver);
    kinds.add(kindOf(q));
    out.push(q.id);
  }
  return out;
}

/** Today's daily quests and this week's weekly quests: the same for every visitor. */
export function dailyQuestIds(day: string): string[] {
  return rotation(DAILY_POOL, `owl-park-quests|day|${day}`, DAILY_OFFER_DIFFICULTIES);
}
export function weeklyQuestIds(week: string): string[] {
  return rotation(WEEKLY_POOL, `owl-park-quests|week|${week}`, WEEKLY_OFFER_DIFFICULTIES);
}

export class QuestBook {
  constructor(
    private readonly store: CollectionStore,
    private readonly book: CollectionBook,
    private readonly spots: QuestSpots,
  ) {}

  private periodOf(q: QuestDef, now: number): string {
    return q.cadence === 'story' ? '' : q.cadence === 'daily' ? parkDay(now) : parkWeek(now);
  }

  /** The collector's rows, forgetting expired daily and weekly ones and quests no longer in the catalogue. */
  private rows(cid: string, now: number): QuestRow[] {
    const day = parkDay(now);
    const week = parkWeek(now);
    const keep: QuestRow[] = [];
    for (const r of this.store.quests(cid)) {
      const q = getQuest(r.quest);
      const current = q && (q.cadence === 'story' ? r.period === '' : q.cadence === 'daily' ? r.period === day : r.period === week);
      if (current) keep.push(r);
      else this.store.dropQuest(cid, r.quest, r.period);
    }
    return keep;
  }

  private offers(rows: QuestRow[], now: number): QuestDef[] {
    const has = (id: string, period: string) => rows.some((r) => r.quest === id && r.period === period);
    const storyDone = new Set(rows.filter((r) => r.period === '' && r.doneAt !== null).map((r) => r.quest));
    const out: QuestDef[] = [];
    for (const q of QUESTS) if (q.cadence === 'story' && !has(q.id, '') && (q.requires ?? []).every((id) => storyDone.has(id))) out.push(q);
    const day = parkDay(now);
    const week = parkWeek(now);
    for (const id of dailyQuestIds(day)) if (!has(id, day)) out.push(getQuest(id)!);
    for (const id of weeklyQuestIds(week)) if (!has(id, week)) out.push(getQuest(id)!);
    return out;
  }

  private view(q: QuestDef, r: QuestRow, now: number): ActiveQuestView {
    const steps = stepTexts(q);
    const ready = r.step >= q.steps.length;
    const goal = ready ? null : q.steps[r.step]!.goal;
    return {
      id: q.id,
      title: q.title,
      giver: q.giver,
      type: q.type,
      difficulty: q.difficulty,
      length: q.length,
      cadence: q.cadence,
      steps,
      step: r.step,
      current: goal ? { text: goalText(goal), count: r.count, need: goalCount(goal) } : null,
      ready,
      reward: q.reward,
      endsAt: q.cadence === 'daily' ? nextParkDayAt(now) : q.cadence === 'weekly' ? nextParkWeekAt(now) : 0,
      items: r.items.filter((i) => i.step === r.step && !i.taken).map(({ n, room, x, y, kind }) => ({ n, room, x, y, kind })),
    };
  }

  private offerView(q: QuestDef): QuestOfferView {
    return { id: q.id, title: q.title, giver: q.giver, type: q.type, difficulty: q.difficulty, length: q.length, cadence: q.cadence, steps: stepTexts(q), reward: q.reward, offer: q.offer };
  }

  board(cid: string, now: number): QuestBoard {
    this.book.ensure(cid, undefined, now);
    const rows = this.rows(cid, now);
    const offers: Record<string, QuestOfferView[]> = {};
    for (const q of this.offers(rows, now)) (offers[q.giver] ??= []).push(this.offerView(q));
    return {
      day: parkDay(now),
      week: parkWeek(now),
      nextDay: nextParkDayAt(now),
      nextWeek: nextParkWeekAt(now),
      active: rows.filter((r) => r.doneAt === null).map((r) => this.view(getQuest(r.quest)!, r, now)),
      offers,
      storyDone: rows.filter((r) => r.period === '' && r.doneAt !== null).map((r) => r.quest),
      feathers: this.book.feathers(cid, now),
    };
  }

  /** Spots for a quest's items: away from NPCs and interactables, a stable choice per collector and period. */
  private placeItems(cid: string, q: QuestDef, period: string): QuestItemSpot[] {
    const out: QuestItemSpot[] = [];
    let n = 0;
    q.steps.forEach((s, step) => {
      const g = s.goal;
      if (g.kind !== 'gather') return;
      const blockers = [...NPCS.filter((x) => x.room === g.room).map((x) => x.pos), ...INTERACTABLES.filter((x) => x.room === g.room).map((x) => x.pos)];
      const free = (this.spots[g.room] ?? []).filter((p) => blockers.every((b) => distance(p, b) >= ITEM_CLEARANCE));
      const pickFrom = free.length >= g.count ? free : [...(this.spots[g.room] ?? [])];
      const chosen = shuffled(pickFrom, rotationRandom(`owl-park-items|${cid}|${q.id}|${period}|${step}`)).slice(0, g.count);
      for (const p of chosen) out.push({ n: n++, step, room: g.room, x: p.x, y: p.y, kind: g.item, taken: false });
    });
    return out;
  }

  /**
   * Start an offered quest. `here` is the room the visitor stands in: a first step that asks to
   * visit it is already done.
   */
  accept(cid: string, questId: unknown, now: number, here?: string): AcceptResult {
    const q = getQuest(questId);
    if (!q) return { ok: false, reason: 'unknown', board: this.board(cid, now) };
    const rows = this.rows(cid, now);
    const period = this.periodOf(q, now);
    const mine = rows.find((r) => r.quest === q.id && r.period === period);
    if (mine) return { ok: false, reason: mine.doneAt === null ? 'active' : 'done', board: this.board(cid, now) };
    if (!this.offers(rows, now).some((o) => o.id === q.id)) return { ok: false, reason: 'not-offered', board: this.board(cid, now) };
    if (rows.filter((r) => r.doneAt === null).length >= MAX_ACTIVE_QUESTS) return { ok: false, reason: 'full', board: this.board(cid, now) };
    const row: QuestRow = { cid, quest: q.id, period, step: 0, count: 0, seen: [], items: this.placeItems(cid, q, period), acceptedAt: now, doneAt: null };
    if (here) this.skipVisits(q, row, here);
    this.store.putQuest(row);
    return { ok: true, board: this.board(cid, now) };
  }

  abandon(cid: string, questId: unknown, now: number): AbandonResult {
    const q = getQuest(questId);
    const row = q ? this.rows(cid, now).find((r) => r.quest === q.id && r.doneAt === null) : undefined;
    if (row) this.store.dropQuest(cid, row.quest, row.period);
    return { ok: !!row, board: this.board(cid, now) };
  }

  /** Complete visit steps for the room the visitor already stands in. */
  private skipVisits(q: QuestDef, row: QuestRow, here: string): void {
    while (row.step < q.steps.length) {
      const g = q.steps[row.step]!.goal;
      if (g.kind !== 'visit' || g.room !== here) return;
      row.step += 1;
      row.count = 0;
      row.seen = [];
    }
  }

  private advance(q: QuestDef, row: QuestRow, here: string | undefined): QuestUpdate {
    const goal = q.steps[row.step]!.goal;
    const need = goalCount(goal);
    const step = row.step;
    const count = row.count;
    if (row.count >= need) {
      row.step += 1;
      row.count = 0;
      row.seen = [];
      if (here) this.skipVisits(q, row, here);
    }
    return { quest: q.id, title: q.title, step, count: Math.min(count, need), need, ready: row.step >= q.steps.length };
  }

  /**
   * Something happened that quests may count: a talk, a visit, a use, an emote. Only the
   * current step of each active quest can move. `here` is the room the visitor stands in.
   */
  event(cid: string, ev: QuestEvent, now: number, here?: string): QuestUpdate[] {
    const updates: QuestUpdate[] = [];
    for (const row of this.rows(cid, now)) {
      if (row.doneAt !== null) continue;
      const q = getQuest(row.quest)!;
      if (row.step >= q.steps.length) continue;
      const goal = q.steps[row.step]!.goal;
      if (goal.kind === 'gather' || !goalMatches(goal, ev)) continue;
      if (goal.kind === 'interact' && goal.distinct && ev.kind === 'interact') {
        if (row.seen.includes(ev.id)) continue;
        row.seen.push(ev.id);
      }
      row.count += 1;
      updates.push(this.advance(q, row, here));
      this.store.putQuest(row);
    }
    return updates;
  }

  /** Pick up quest item `n` of an active quest, standing at `pos` in `room`. */
  gather(cid: string, questId: unknown, n: number, room: string, pos: Vec2, now: number): GatherResult {
    const q = getQuest(questId);
    const row = q ? this.rows(cid, now).find((r) => r.quest === q.id && r.doneAt === null) : undefined;
    if (!q || !row) return { ok: false, reason: 'gone' };
    const item = row.items.find((i) => i.n === n);
    if (!item || item.taken) return { ok: false, reason: 'gone' };
    if (item.step !== row.step) return { ok: false, reason: 'not-current' };
    if (item.room !== room || distance(pos, item) > PICKUP_RADIUS) return { ok: false, reason: 'far' };
    item.taken = true;
    row.count += 1;
    const update = this.advance(q, row, room);
    this.store.putQuest(row);
    return { ok: true, updates: [update], board: this.board(cid, now) };
  }

  /** Hand a finished quest back to its giver: feathers, plus a collectible (or its duplicate feathers). */
  handIn(cid: string, questId: unknown, npc: string, now: number, rnd: () => number): HandInResult {
    const q = getQuest(questId);
    if (!q) return { ok: false, reason: 'unknown', board: this.board(cid, now) };
    const row = this.rows(cid, now).find((r) => r.quest === q.id && r.doneAt === null);
    if (!row) return { ok: false, reason: 'not-active', board: this.board(cid, now) };
    if (q.giver !== npc) return { ok: false, reason: 'wrong-npc', board: this.board(cid, now) };
    if (row.step < q.steps.length) return { ok: false, reason: 'not-ready', board: this.board(cid, now) };
    let award: Award | null = null;
    const item = q.reward.item === 'pick' ? pickRewardVariant(rewardOdds(q), variantsByRarity(), new Set(this.store.owned(cid)), rnd) : q.reward.item;
    if (item) award = this.book.award(cid, item, 'quest', now);
    const total = this.book.addFeathers(cid, q.reward.feathers, now);
    row.doneAt = now;
    this.store.putQuest(row);
    return { ok: true, quest: q.id, title: q.title, thanks: q.thanks, feathers: q.reward.feathers + (award?.feathers ?? 0), total, award, board: this.board(cid, now) };
  }
}
