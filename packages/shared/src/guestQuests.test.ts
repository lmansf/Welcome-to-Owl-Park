import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { CollectionBook, MemoryCollectionStore } from './book';
import { GUEST_QUESTS, guestBoard, guestQuest } from './guestQuests';
import { getQuest } from './questCatalog';
import { QuestBook, type QuestSpots } from './questbook';

const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const SPOTS: QuestSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));

function rig() {
  const store = new MemoryCollectionStore();
  const book = new CollectionBook(store);
  return { store, book, quests: new QuestBook(store, book, SPOTS) };
}

/** Bramble's welcome, every step, as a guest's room server counts it (guest: true). */
function walkWelcome(quests: QuestBook, cid: string): void {
  quests.event(cid, { kind: 'talk', npc: 'pip' }, MON, 'hub', true);
  quests.event(cid, { kind: 'visit', room: 'grove' }, MON, 'grove', true);
  quests.event(cid, { kind: 'interact', what: 'leaf-pile', id: 'grove-leaves-2', room: 'grove' }, MON, 'grove', true);
  quests.event(cid, { kind: 'talk', npc: 'nova' }, MON, 'market', true);
  quests.event(cid, { kind: 'emote', emote: 'hoot', room: 'hub', near: ['bramble'] }, MON, 'hub', true);
}

describe('a free guest’s quests (OP-428)', () => {
  it('are Bramble’s welcome and nothing else', () => {
    expect(GUEST_QUESTS).toEqual(['story-welcome']);
    expect(getQuest('story-welcome')!.giver).toBe('bramble');
    expect(guestQuest('story-welcome')).toBe(true);
    expect(guestQuest('story-hazel-acorns')).toBe(false);
    expect(guestQuest(undefined)).toBe(false);
  });

  it('the welcome walked and handed in as a guest: the Leaf Crown kept, and no feathers', () => {
    const { quests, book } = rig();
    expect(quests.accept('g1', 'story-welcome', MON, 'hub').ok).toBe(true);
    walkWelcome(quests, 'g1');
    const res = quests.handIn('g1', 'story-welcome', 'bramble', MON, () => 0.5, true);
    expect(res).toMatchObject({ ok: true, feathers: 0, total: 0, award: { variant: 'leaf-crown~0', dup: false, feathers: 0 } });
    expect(book.owned('g1', undefined, MON)).toContain('leaf-crown~0');
    expect(book.feathers('g1', MON)).toBe(0);
    expect(quests.board('g1', MON).storyDone).toContain('story-welcome');
  });

  it('a guest that already owns the crown keeps it, and is paid nothing for the duplicate', () => {
    const { quests, book } = rig();
    book.grant('g1', 'leaf-crown~0', 'quest', MON);
    quests.accept('g1', 'story-welcome', MON, 'hub');
    walkWelcome(quests, 'g1');
    expect(quests.handIn('g1', 'story-welcome', 'bramble', MON, () => 0.5, true)).toMatchObject({ ok: true, feathers: 0, award: { dup: true, feathers: 0 } });
    expect(book.feathers('g1', MON)).toBe(0);
  });

  it('a guest’s events move no other quest it holds, and a guest hands in no other quest', () => {
    const { quests, store } = rig();
    // A quest it took while it held a ticket: a guest's events leave it where it was.
    store.putQuest({ cid: 'g1', quest: 'story-welcome', period: '', step: 0, count: 0, seen: [], items: [], acceptedAt: MON, doneAt: MON });
    expect(quests.accept('g1', 'story-nova-window', MON, 'market').ok).toBe(true);
    const before = quests.board('g1', MON).active.find((q) => q.id === 'story-nova-window')!;
    quests.event('g1', { kind: 'interact', what: 'stall', id: 'market-stall-1', room: 'market' }, MON, 'market', true);
    const after = quests.board('g1', MON).active.find((q) => q.id === 'story-nova-window')!;
    expect(after).toEqual(before);
    // The same browse from a ticket holder moves it.
    expect(quests.event('g1', { kind: 'interact', what: 'stall', id: 'market-stall-1', room: 'market' }, MON, 'market').map((u) => u.quest)).toEqual(['story-nova-window']);
    expect(quests.handIn('g1', 'story-nova-window', 'nova', MON, () => 0.5, true)).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('the board a guest sees offers and shows only its quests', () => {
    const { quests } = rig();
    const full = quests.board('g1', MON);
    expect(Object.values(full.offers).flat().length).toBeGreaterThan(1);
    const seen = guestBoard(full);
    expect(seen.offers).toEqual({ bramble: full.offers['bramble']!.filter((o) => o.id === 'story-welcome').map((o) => ({ ...o, reward: { ...o.reward, feathers: 0 } })) });
    // What it pays a guest: the Leaf Crown, and no feathers.
    expect(seen.offers['bramble']![0]!.reward).toEqual({ feathers: 0, item: 'leaf-crown~0' });
    quests.accept('g1', 'story-welcome', MON, 'hub');
    const other = Object.values(full.offers).flat().find((o) => o.id !== 'story-welcome' && !getQuest(o.id)!.requires)!;
    expect(quests.accept('g1', other.id, MON, 'hub').ok).toBe(true);
    expect(quests.board('g1', MON).active.length).toBe(2);
    expect(guestBoard(quests.board('g1', MON)).active.map((q) => q.id)).toEqual(['story-welcome']);
    expect(guestBoard(full).feathers).toBe(full.feathers);
  });
});
