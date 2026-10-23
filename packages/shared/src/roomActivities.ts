/**
 * The activities in one room (their rules are in activities.ts): the hub's lantern beam and stage
 * quiz, fishing from the grove's jetty, and the market robot owl's copy game. The room server
 * (RoomObject) routes `act` frames here, wakes the hub when a quiz question closes, and pays through
 * the ledger; the local mode runs the same class for the one owl on this device.
 */
import {
  CAST_EVERY_MS,
  COPY_ROOM,
  COPY_SPOT,
  FISHING_REACH,
  FISHING_ROOM,
  FISHING_SPOT,
  LANTERN_ROOM,
  QUIZ_ROOM,
  biteDelay,
  copyNote,
  darkLanterns,
  lanternsAt,
  lightLantern,
  quizRound,
  quizRoundAt,
  quizZoneAt,
  reelOutcome,
  rollFish,
  startCopy,
  type CopyGame,
  type CopyStep,
  type FishDef,
  type LanternState,
  type QuizRound,
  type QuizZone,
} from './activities';
import type { ServerLanterns } from './edge';
import { distance, distanceToRect } from './geometry';
import type { Vec2 } from './protocol';

/** What the activities need of a room: its id, who is in it and where each owl stands. */
export interface ActivityRoom {
  readonly id: string;
  ids(): string[];
  positionOf(id: string): Vec2 | null;
}

/** Extra reach allowed: a page draws its owl a little ahead of the room server's. */
export const ACT_SLACK = 40;
/** A reel may arrive this much after the bite closed (the trip to the server). */
export const REEL_SLACK_MS = 350;
/** One note of the copy game per visitor this often. */
export const NOTE_EVERY_MS = 250;

export type LightAnswer = { ok: true; id: string; full: string[] | null } | { ok: false; reason: 'far' | 'lit' | 'busy' | 'glowing' };
export type CastAnswer = { ok: true; biteAt: number } | { ok: false; reason: 'far' | 'busy' };
export type ReelAnswer = { ok: true; outcome: 'early' | 'late' } | { ok: true; outcome: 'caught'; fish: FishDef } | { ok: false; reason: 'far' | 'idle' };
export type CopyAnswer = { ok: true; game: CopyGame } | { ok: false; reason: 'far' };
export type NoteAnswer = CopyStep | { kind: 'idle' } | { kind: 'busy' };

export class Activities {
  private lanterns: LanternState = darkLanterns();
  /** Visitors with a line in the water: when the fish bites. */
  private readonly anglers = new Map<string, number>();
  private readonly castAt = new Map<string, number>();
  private readonly games = new Map<string, CopyGame>();
  private readonly noteAt = new Map<string, number>();
  /** The last quiz round whose answer was settled. */
  quizSettled = -1;

  constructor(
    private readonly room: ActivityRoom,
    private readonly now: () => number,
    private readonly rnd: () => number = Math.random,
  ) {}

  // ---------- the lantern beam ----------

  lanternState(): LanternState {
    this.lanterns = lanternsAt(this.lanterns, this.now());
    return this.lanterns;
  }

  /** Bring the beam back after the host was recycled (a burnt-out beam stays dark). */
  restoreLanterns(s: LanternState): void {
    this.lanterns = lanternsAt(s, this.now());
  }

  lanternFrame(lit?: { id: string; by: string }): ServerLanterns {
    const s = this.lanternState();
    return { t: 'lanterns', lit: s.lit, glowUntil: s.glowUntil, ...(lit ?? {}) };
  }

  light(id: string): LightAnswer {
    const pos = this.room.id === LANTERN_ROOM ? this.room.positionOf(id) : null;
    if (!pos) return { ok: false, reason: 'far' };
    const r = lightLantern(this.lanterns, id, pos, this.now(), ACT_SLACK);
    if (!r.ok) return r;
    this.lanterns = r.state;
    return { ok: true, id: r.id, full: r.full };
  }

  // ---------- fishing ----------

  private atJetty(id: string): boolean {
    const pos = this.room.id === FISHING_ROOM ? this.room.positionOf(id) : null;
    return !!pos && distance(pos, FISHING_SPOT) <= FISHING_REACH + ACT_SLACK;
  }

  cast(id: string): CastAnswer {
    if (!this.atJetty(id)) return { ok: false, reason: 'far' };
    const now = this.now();
    if (now - (this.castAt.get(id) ?? -Infinity) < CAST_EVERY_MS) return { ok: false, reason: 'busy' };
    const biteAt = now + biteDelay(this.rnd);
    this.castAt.set(id, now);
    this.anglers.set(id, biteAt);
    return { ok: true, biteAt };
  }

  reel(id: string): ReelAnswer {
    const biteAt = this.anglers.get(id);
    if (biteAt === undefined) return { ok: false, reason: 'idle' };
    this.anglers.delete(id);
    if (!this.atJetty(id)) return { ok: false, reason: 'far' };
    const outcome = reelOutcome(biteAt, this.now(), REEL_SLACK_MS);
    return outcome === 'caught' ? { ok: true, outcome, fish: rollFish(this.rnd) } : { ok: true, outcome };
  }

  // ---------- the robot owl's copy game ----------

  startCopy(id: string, owned: readonly string[]): CopyAnswer {
    const pos = this.room.id === COPY_ROOM ? this.room.positionOf(id) : null;
    if (!pos || distanceToRect(pos, COPY_SPOT) > ACT_SLACK) return { ok: false, reason: 'far' };
    const game = startCopy(owned, this.rnd, this.now());
    this.games.set(id, game);
    return { ok: true, game };
  }

  note(id: string, e: string): NoteAnswer {
    const game = this.games.get(id);
    if (!game) return { kind: 'idle' };
    const now = this.now();
    if (now - (this.noteAt.get(id) ?? -Infinity) < NOTE_EVERY_MS) return { kind: 'busy' };
    this.noteAt.set(id, now);
    const step = copyNote(game, e, this.rnd, now);
    if (step.kind === 'note' || step.kind === 'tune' || step.kind === 'early') this.games.set(id, step.game);
    else this.games.delete(id);
    return step;
  }

  // ---------- the stage quiz ----------

  /** The round to settle now: its question has closed, its answer still shows, and it is not settled yet. */
  quizDue(): QuizRound | null {
    if (this.room.id !== QUIZ_ROOM) return null;
    const now = this.now();
    const r = quizRoundAt(now);
    return now >= r.revealAt && now < r.endsAt && r.n > this.quizSettled ? r : null;
  }

  /** Settle a round: the owls standing in the right answer's zone right now. */
  settleQuiz(r: QuizRound): { right: QuizZone; winners: string[] } {
    this.quizSettled = Math.max(this.quizSettled, r.n);
    const winners = this.room.ids().filter((id) => {
      const pos = this.room.positionOf(id);
      return !!pos && quizZoneAt(pos) === r.right;
    });
    return { right: r.right, winners };
  }

  /** When the next question closes. */
  nextQuizClose(): number {
    const now = this.now();
    const r = quizRoundAt(now);
    return now < r.revealAt ? r.revealAt : quizRound(r.n + 1).revealAt;
  }

  /** A visitor left the room: their line and game go with them (lanterns they lit stay lit). */
  forget(id: string): void {
    this.anglers.delete(id);
    this.castAt.delete(id);
    this.games.delete(id);
    this.noteAt.delete(id);
  }
}
