import type { QuestBoard, QuestReward } from './quests';

/**
 * The quests a free guest may do (OP-428). A guest (a spectator, OP-191: past the turnstiles without a
 * ticket that works, as Play free now makes it) walks and plays every game for nothing, and every quest
 * was a ticket holder's. Bramble's welcome is the exception: a guest may take it, move its steps and
 * hand it in, and keeps its Leaf Crown. It pays a guest the crown only, with no feathers (feathers buy
 * the shop's items, which stay a ticket holder's). Every other quest, NPC owl's offer and today's tasks
 * stay locked to a guest, and the room server holds that line (apps/edge/src/RoomObject.ts).
 *
 * TODO-DOCS (OP-428): docs/QUESTS.md and docs/ARCHITECTURE.md section 4 gain the guest's one quest.
 */
export const GUEST_QUESTS: readonly string[] = ['story-welcome'];

/** Whether a free guest may take, move and hand in this quest. */
export function guestQuest(id: unknown): boolean {
  return typeof id === 'string' && GUEST_QUESTS.includes(id);
}

/** A guest's quest pays no feathers: its reward as a guest sees it. */
const asGuest = <Q extends { id: string; reward: QuestReward }>(q: Q): Q => ({ ...q, reward: { ...q.reward, feathers: 0 } });

/** The board as a free guest sees it: only the guest's quests, active or on offer, with what they pay a guest; its done story and balance as they are. */
export function guestBoard(board: QuestBoard): QuestBoard {
  const offers: QuestBoard['offers'] = {};
  for (const [npc, list] of Object.entries(board.offers)) {
    const mine = list.filter((o) => guestQuest(o.id)).map(asGuest);
    if (mine.length) offers[npc] = mine;
  }
  return { ...board, active: board.active.filter((q) => guestQuest(q.id)).map(asGuest), offers };
}
