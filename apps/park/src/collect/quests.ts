import { getQuest, questPuzzle, type ActiveQuestView, type PuzzleView, type QuestBoard, type QuestOfferView } from '@owl-park/shared';
import type { PuzzleNeighbour } from './service';

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
  /** Puzzle quests' runs as the page last had them (OP-255), by quest. */
  readonly puzzles = new Map<string, PuzzleView>();
  /** Owls close by in a run of a puzzle quest, by quest (the journal's Join list). */
  readonly near = new Map<string, PuzzleNeighbour[]>();
  private readonly listeners = new Set<Listener>();

  set(board: QuestBoard | null): void {
    this.board = board;
    // A puzzle quest no longer carried takes its run off the page.
    const carried = new Set((board?.active ?? []).map((q) => q.id));
    for (const q of [...this.puzzles.keys()]) if (!carried.has(q)) this.puzzles.delete(q);
    for (const q of [...this.near.keys()]) if (!carried.has(q)) this.near.delete(q);
    this.changed();
  }

  /** A puzzle quest's run as it now stands. */
  setPuzzle(quest: string, view: PuzzleView | null): void {
    if (view) this.puzzles.set(quest, view);
    else this.puzzles.delete(quest);
    this.changed();
  }

  setNear(quest: string, near: PuzzleNeighbour[]): void {
    this.near.set(quest, near);
    this.changed();
  }

  /** Carried quests that are puzzles (OP-255). */
  get puzzleQuests(): ActiveQuestView[] {
    return this.active.filter((q) => {
      const def = getQuest(q.id);
      return !!def && !!questPuzzle(def);
    });
  }

  private changed(): void {
    for (const cb of this.listeners) cb(this.board);
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
