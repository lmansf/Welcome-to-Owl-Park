import { getQuest, type ActiveQuestView, type QuestBoard, type QuestOfferView } from '@owl-park/shared';

type Listener = (board: QuestBoard | null) => void;

/** What an NPC owl's marker says: a quest to hand back, something to talk about, or something new. */
export type NpcMark = 'ready' | 'step' | 'offer' | null;

/**
 * The visitor's quest board as the page knows it: replaced by every answer and push from the
 * quest link. The room scene (NPC markers, quest items) and the HUD (tracker, journal,
 * dialogue) listen.
 */
export class QuestState {
  board: QuestBoard | null = null;
  private readonly listeners = new Set<Listener>();

  set(board: QuestBoard | null): void {
    this.board = board;
    for (const cb of this.listeners) cb(board);
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get active(): ActiveQuestView[] {
    return this.board?.active ?? [];
  }

  /** Quests this NPC is waiting to take back. */
  readyFor(npc: string): ActiveQuestView[] {
    return this.active.filter((q) => q.ready && q.giver === npc);
  }

  /** Quests this NPC gave that are still under way. */
  underwayFor(npc: string): ActiveQuestView[] {
    return this.active.filter((q) => !q.ready && q.giver === npc);
  }

  /** Quests this NPC offers now (an empty list when the visitor carries the most it can). */
  offersFrom(npc: string): QuestOfferView[] {
    return this.board?.offers[npc] ?? [];
  }

  /** Active quests whose current step is talking to this NPC. */
  askingFor(npc: string): ActiveQuestView[] {
    return this.active.filter((q) => {
      const goal = q.ready ? undefined : getQuest(q.id)?.steps[q.step]?.goal;
      return goal?.kind === 'talk' && goal.npc === npc;
    });
  }

  markFor(npc: string): NpcMark {
    if (this.readyFor(npc).length) return 'ready';
    if (this.askingFor(npc).length) return 'step';
    return this.offersFrom(npc).length ? 'offer' : null;
  }
}
