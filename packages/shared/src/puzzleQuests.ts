/**
 * Puzzle quests at the ledger (OP-255): one step of a puzzle quest's run, against the quest book that
 * holds the quest and the puzzle book that holds the run. The collections object and the local mode
 * both answer through this, so a lock opened in either counts the same way. Where the owl stands is
 * the caller's to give (the room object checks it against the room; the local mode against the page).
 */
import type { PuzzleBook, PuzzleSymbol, PuzzleView } from './puzzles';
import { getQuest, questPuzzle } from './questCatalog';
import { questPeriod, type QuestBook } from './questbook';
import type { QuestBoard, QuestUpdate } from './quests';
import type { Vec2 } from './protocol';

export type PuzzleStep = 'state' | 'start' | 'join' | 'leave' | 'look' | 'take' | 'open';

export interface PuzzleRequest {
  op: PuzzleStep;
  quest: string;
  lock?: string;
  n?: number;
  code?: PuzzleSymbol[];
  /** For a join: the collector of the owl standing next to this one. */
  other?: string;
  room: string;
  pos?: Vec2;
  ground?: number;
}

export interface PuzzleResult {
  ok: boolean;
  reason?: string;
  /** Tries left before the lock jams, after a wrong code. */
  left?: number;
  view?: PuzzleView;
  /** Members of the run whose progress moved (the room refreshes their pages). */
  credited?: string[];
  /** The collectors in the run after this step: never sent to a page, the room refreshes the others'. */
  members?: string[];
  /** This owl's quest moved: its updates and board. */
  updates?: QuestUpdate[];
  board?: QuestBoard;
}

/** Take a quest; a puzzle whose every lock this owl already opened this period is ready at once. */
export function acceptPuzzleAware(quests: QuestBook, puzzles: PuzzleBook, cid: string, quest: string, now: number, here: string) {
  const res = quests.accept(cid, quest, now, here);
  const q = getQuest(quest);
  const puzzle = q && questPuzzle(q);
  if (res.ok && q && puzzle && puzzles.view(cid, puzzle, questPeriod(q, now), now)?.complete) {
    quests.event(cid, { kind: 'puzzle', puzzle }, now, here);
    return { ok: true as const, board: quests.board(cid, now) };
  }
  return res;
}

/** One step of a puzzle quest's run. The owl must hold the quest; a join's other owl must hold it too. */
export function puzzleStep(quests: QuestBook, puzzles: PuzzleBook, cid: string, req: PuzzleRequest, now: number): PuzzleResult {
  const q = getQuest(req.quest);
  const puzzle = q && questPuzzle(q);
  if (!q || !puzzle) return { ok: false, reason: 'unknown' };
  if (!quests.holds(cid, q.id, now)) return { ok: false, reason: 'not-active' };
  const period = questPeriod(q, now);
  const pos = req.pos ?? { x: -1e6, y: -1e6 };
  const ground = req.ground ?? 0;
  let res;
  switch (req.op) {
    case 'state': {
      const view = puzzles.view(cid, puzzle, period, now);
      return view ? { ok: true, view } : { ok: false, reason: 'unknown' };
    }
    case 'start':
      res = puzzles.start(cid, puzzle, period, now);
      break;
    case 'join':
      if (!req.other || !quests.holds(req.other, q.id, now)) return { ok: false, reason: 'no-run' };
      res = puzzles.join(cid, req.other, puzzle, period, now);
      break;
    case 'leave':
      res = puzzles.leave(cid, puzzle, period, now);
      break;
    case 'look':
      res = puzzles.look(cid, puzzle, req.lock, req.n ?? -1, req.room, pos, ground, period, now);
      break;
    case 'take':
      res = puzzles.take(cid, puzzle, req.lock, req.room, pos, ground, period, now);
      break;
    case 'open':
      res = puzzles.open(cid, puzzle, req.lock, req.code, req.room, pos, ground, period, now);
      break;
    default:
      return { ok: false, reason: 'unknown' };
  }
  if (!res.ok) return { ok: false, reason: res.reason, ...('left' in res ? { left: res.left } : {}), ...(res.view ? { view: res.view } : {}) };
  // Every member whose own list became whole: its quest is ready to hand in (only if it carries it).
  let updates: QuestUpdate[] = [];
  for (const m of res.completed) {
    const u = quests.event(m, { kind: 'puzzle', puzzle }, now, req.room);
    if (m === cid) updates = u;
  }
  return { ok: true, view: res.view, credited: res.credited, members: puzzles.members(cid, puzzle, period), ...(updates.length ? { updates, board: quests.board(cid, now) } : {}) };
}

/** Which of these collectors are in a run of this puzzle quest, and how far it is (the room's join list). */
export function puzzleRunsOf(puzzles: PuzzleBook, cids: readonly string[], quest: string, now: number): Record<string, { members: number; opened: number }> {
  const q = getQuest(quest);
  const puzzle = q && questPuzzle(q);
  const out: Record<string, { members: number; opened: number }> = {};
  if (!q || !puzzle) return out;
  const period = questPeriod(q, now);
  for (const c of cids.slice(0, 40)) {
    const info = puzzles.runInfo(c, puzzle, period);
    if (info) out[c] = info;
  }
  return out;
}
