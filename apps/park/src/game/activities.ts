import Phaser from 'phaser';
import {
  BITE_WINDOW_MS,
  BOBBER_AT,
  COPY_NOTE_MS,
  COPY_ROOM,
  COPY_SPOT,
  FISHING_REACH,
  FISHING_ROOM,
  FISHING_SPOT,
  LANTERNS,
  LANTERN_REACH_X,
  LANTERN_ROOM,
  QUIZ_BANK,
  QUIZ_ROOM,
  QUIZ_ZONES,
  TASKS_BONUS,
  TASK_FEATHERS,
  distance,
  distanceToRect,
  getFish,
  quizRound,
  quizRoundAt,
  quizZoneAt,
  underBeam,
  variantName,
  type QuizZone,
  type TaskView,
  type Vec2,
} from '@owl-park/shared';
import type { TaskState } from '../collect/tasks';
import type { ActRefusal, ActivityLink, CopyTune } from '../collect/service';
import { ANCHORS } from '../rooms';
import type { CopyView, QuizView } from '../ui/activities';
import type { Hud } from '../ui/hud';
import { FishingLine } from './Fishing';
import { LanternGlows } from './Lanterns';
import type { Owl } from './Owl';
import { QuizPlates } from './QuizStage';
import { symbolTexture } from './symbols';

/** What the activities need of the room scene. */
export interface ActivityHost {
  scene: Phaser.Scene;
  room: string;
  hud: Hud;
  me(): Owl;
  /** Another owl in the room, by its id on the room's connection. */
  peer(id: string): Owl | undefined;
  /** The visitor's feather balance changed. */
  feathers(total: number): void;
  tasks: TaskState;
  /** The robot owl's big reaction (the market's idol). */
  cheer(): void;
}

/** Something to do where the owl stands (the room scene shows a button, and E runs the first). */
export interface ActivityAction {
  id: string;
  label: string;
  run: () => void;
}

/** The stage quiz's card shows while the owl is in the bay before the stage. */
const QUIZ_BAY_X = Math.min(...Object.values(QUIZ_ZONES).map((r) => r.x)) - 250;
/** After the bite window, the line comes in by itself this much later. */
const GONE_AFTER_MS = 900;
/** Ask for today's tasks again this long after the room did not answer. */
const TASKS_RETRY_MS = 5_000;
/** Never wait longer than this for the park day to turn (timers past ~24 days overflow). */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
/** The robot owl's eyes (offsets from its anchor, on the painting's eyes), and a colour for each note it uses. */
const ROBOT_EYES: readonly Vec2[] = [
  { x: -38, y: -368 },
  { x: 18, y: -368 },
];
const NOTE_TINTS = [0x00e5ff, 0xff2aa1, 0xffd36a, 0x8fe3a8];

const feathersText = (n: number) => `+${n} feather${n === 1 ? '' : 's'}`;

/** The robot owl sings each note of its tune with its eyes, and a note drifts up beside its head. */
class RobotSong {
  private readonly eyes: Phaser.GameObjects.Image[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly at: Vec2,
  ) {
    this.eyes = ROBOT_EYES.map((o) => scene.add.image(at.x + o.x, at.y + o.y, 'fx-glow').setScale(0.22).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(at.y + 1));
  }

  note(tint: number): void {
    for (const eye of this.eyes) {
      this.scene.tweens.killTweensOf(eye);
      eye.setTint(tint).setAlpha(0.95);
      this.scene.tweens.add({ targets: eye, alpha: 0, duration: COPY_NOTE_MS * 0.8, ease: 'Quad.easeIn' });
    }
    const n = this.scene.add.image(this.at.x + 90, this.at.y - 380, symbolTexture(this.scene, 'note')).setTint(tint).setScale(0.9).setDepth(this.at.y + 2);
    this.scene.tweens.add({ targets: n, y: n.y - 70, x: n.x + 24, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => n.destroy() });
  }

  destroy(): void {
    for (const eye of this.eyes) {
      this.scene.tweens.killTweensOf(eye);
      eye.destroy();
    }
  }
}

/** The copy game under way, as this page knows it. */
interface CopyGame extends CopyTune {
  notes: string[];
  /** Notes copied of this tune. */
  got: number;
}

/**
 * The activities layer of a room scene (activities.ts in @owl-park/shared): the hub's lanterns and
 * stage quiz, fishing in the grove, the market robot owl's copy game, and today's tasks. The room
 * (the room server, or the local mode) decides; this draws, offers the actions, and talks.
 */
export class ActivityLayer {
  private link: ActivityLink | null = null;
  private readonly lanterns: LanternGlows | null;
  private readonly quiz: QuizPlates | null;
  private readonly fishing: FishingLine | null;
  private readonly robot: RobotSong | null;
  private copy: CopyGame | null = null;
  /** The note the robot is singing (index in the tune), so each one flashes once. */
  private sung = -1;
  /** A request to the room is under way: one at a time. */
  private busy = false;
  private dead = false;
  /** The last quiz round the room settled, and whether this owl stood on the right answer. */
  private quizResult: { n: number; won: boolean } | null = null;
  private tasksTimer: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly host: ActivityHost) {
    const { scene, room } = host;
    this.lanterns = room === LANTERN_ROOM ? new LanternGlows(scene) : null;
    this.quiz = room === QUIZ_ROOM ? new QuizPlates(scene) : null;
    this.fishing = room === FISHING_ROOM ? new FishingLine(scene) : null;
    const robot = ANCHORS[room]?.['robot'];
    this.robot = room === COPY_ROOM && robot ? new RobotSong(scene, robot) : null;
    host.hud.onCopy((note) => (note === null ? this.stopCopy() : void this.playNote(note)));
  }

  /** The room's activities are reachable (or null: offline). */
  attach(link: ActivityLink | null): void {
    this.link = link;
    if (link) void this.refreshTasks();
  }

  private now(): number {
    return Date.now();
  }

  // ---------- what the owl can do here ----------

  actions(pos: Vec2): ActivityAction[] {
    const now = this.now();
    const out: ActivityAction[] = [];
    if (this.lanterns && underBeam(pos) && !this.lanterns.glowing(now)) {
      const lit = new Set(this.lanterns.litAt(now));
      if (LANTERNS.some((l) => !lit.has(l.id) && Math.abs(l.pos.x - pos.x) <= LANTERN_REACH_X)) out.push({ id: 'act:light', label: 'Light a lantern', run: () => void this.light() });
    }
    if (this.fishing && distance(pos, FISHING_SPOT) <= FISHING_REACH) {
      const line = this.fishing.status(now);
      if (line === 'idle') out.push({ id: 'act:cast', label: 'Cast a line', run: () => void this.cast() });
      else out.push({ id: 'act:reel', label: line === 'bite' ? 'Reel in now!' : 'Reel in', run: () => void this.reel() });
    }
    if (this.robot && !this.copy && distanceToRect(pos, COPY_SPOT) === 0) out.push({ id: 'act:copy', label: "Copy the robot owl's tune", run: () => void this.startCopy() });
    return out;
  }

  /** One request at a time; nothing once the scene has moved on. */
  private async ask<T>(fn: (link: ActivityLink) => Promise<T>): Promise<T | null> {
    const link = this.link;
    if (!link || this.busy || this.dead) return null;
    this.busy = true;
    try {
      const res = await fn(link);
      return this.dead ? null : res;
    } finally {
      this.busy = false;
    }
  }

  private refused(reason: ActRefusal, lines: Partial<Record<ActRefusal, string>>): void {
    const line = lines[reason] ?? (reason === 'offline' || reason === 'unknown' ? 'The park did not catch that. Try again in a moment.' : null);
    if (line) this.host.hud.toast(line, 3000);
  }

  // ---------- the lanterns ----------

  private async light(): Promise<void> {
    const res = await this.ask((l) => l.light());
    if (!res || res.ok) return; // the beam's push lights it
    this.refused(res.reason, {
      far: 'Stand on the floor under the lantern beam to light one.',
      lit: 'The lanterns above you are lit. Find a dark one along the beam.',
      busy: 'Give your lantern a moment before lighting the next.',
      glowing: 'The whole beam is glowing! It goes dark again soon.',
    });
  }

  onLanterns(beam: { lit: Record<string, number>; glowUntil: number }, lit: { id: string; by: string | null } | null): void {
    if (!this.lanterns) return;
    const now = this.now();
    const wasGlowing = this.lanterns.glowing(now);
    this.lanterns.set(beam);
    if (!lit) return;
    this.lanterns.flash(lit.id);
    (lit.by === null ? this.host.me() : this.host.peer(lit.by))?.playEmote('flap');
    if (!wasGlowing && this.lanterns.glowing(now)) {
      this.lanterns.fill();
      this.host.hud.toast('The whole lantern beam is lit!', 3200, '#FFB347');
    }
  }

  // ---------- fishing ----------

  private async cast(): Promise<void> {
    const res = await this.ask((l) => l.cast());
    if (!res) return;
    if (!res.ok) return this.refused(res.reason, { far: 'Walk out to the end of the jetty to fish.' });
    const me = this.host.me();
    me.face(BOBBER_AT.x >= me.pos.x ? 1 : -1);
    this.fishing?.cast(res.biteAt, this.now());
  }

  private async reel(): Promise<void> {
    const res = await this.ask((l) => l.reel());
    if (!res || !this.fishing) return;
    const me = this.host.me();
    if (!res.ok) {
      this.fishing.end();
      return this.refused(res.reason, { far: 'You walked off the jetty and the fish got away.' });
    }
    if (res.outcome !== 'caught') {
      this.fishing.reel(me, null);
      this.host.hud.toast(res.outcome === 'early' ? 'Too soon! Wait for the bobber to dip.' : 'Too late: the fish got away.', 2600);
      return;
    }
    this.fishing.reel(me, res.fish);
    this.host.feathers(res.total);
    const fish = getFish(res.fish);
    const pays = fish?.feathers ?? 0;
    const caught = fish?.id === 'boot' ? 'You fished out an old boot!' : `You caught ${fish?.name ?? 'a fish'}!`;
    const tail = res.feathers > 0 ? ` ${feathersText(res.feathers)}` : pays > 0 ? ' (No more feathers from games today.)' : '';
    this.host.hud.toast(`${caught}${tail}`, 3400, '#FFD36A');
  }

  // ---------- the robot owl's copy game ----------

  private async startCopy(): Promise<void> {
    const res = await this.ask((l) => l.copy());
    if (!res) return;
    if (!res.ok) return this.refused(res.reason, { far: 'Stand in front of the robot owl to play.' });
    this.copy = { notes: res.notes, tune: res.tune, listenUntil: res.listenUntil, deadline: res.deadline, level: res.level, got: 0 };
    this.sung = -1;
  }

  private stopCopy(): void {
    this.copy = null;
    this.host.hud.setCopy(null);
  }

  private async playNote(e: string): Promise<void> {
    const game = this.copy;
    if (!game || this.now() < game.listenUntil || this.busy) return;
    this.host.me().playEmote(e);
    const res = await this.ask((l) => l.note(e));
    if (!res || this.copy !== game) return;
    if (!res.ok) {
      if (res.reason === 'idle') this.copy = null;
      else if (res.reason !== 'busy') this.refused(res.reason, {});
      return;
    }
    const tunes = (n: number) => `${n} tune${n === 1 ? '' : 's'}`;
    switch (res.step) {
      case 'early':
        return;
      case 'note':
        this.copy = { ...game, got: game.got + 1, deadline: res.deadline };
        return;
      case 'tune':
        this.copy = { ...game, tune: res.tune, listenUntil: res.listenUntil, deadline: res.deadline, level: res.level, got: 0 };
        this.sung = -1;
        this.host.feathers(res.total);
        this.host.hud.toast(`Tune copied!${res.feathers > 0 ? ` ${feathersText(res.feathers)}` : ''} Now a longer one...`, 2600, '#FFD36A');
        return;
      case 'won':
        this.copy = null;
        this.host.feathers(res.total);
        this.host.cheer();
        this.host.hud.toast(`You copied every tune the robot owl knows!${res.feathers > 0 ? ` ${feathersText(res.feathers)}` : ''}`, 4200, '#FFD36A');
        return;
      case 'wrong':
      case 'slow':
        this.copy = null;
        this.host.hud.toast(`${res.step === 'wrong' ? `Not quite: the robot owl played ${variantName(res.expected)}.` : 'Too slow!'} You copied ${tunes(res.level)}.`, 3600);
        return;
    }
  }

  // ---------- the stage quiz ----------

  onQuiz(n: number, _right: QuizZone, won: boolean, others: string[]): void {
    this.quizResult = { n, won };
    for (const id of others) this.host.peer(id)?.playEmote('flap');
    if (won) this.host.me().playEmote('flap');
  }

  onPaid(what: 'beam' | 'quiz', feathers: number, total: number): void {
    this.host.feathers(total);
    const more = feathers > 0 ? ` ${feathersText(feathers)}` : ' (No more feathers from games today.)';
    this.host.hud.toast(what === 'beam' ? `You helped light the whole beam!${more}` : `Right answer!${more}`, 3600, '#FFD36A');
  }

  private quizView(now: number, pos: Vec2): QuizView {
    const r = quizRoundAt(now);
    if (now >= r.endsAt) return { phase: 'wait', seconds: Math.ceil((quizRound(r.n + 1).startsAt - now) / 1000) };
    const q = QUIZ_BANK[r.question]!;
    const answers = { a: q.answers[r.order[0]]!, b: q.answers[r.order[1]]!, c: q.answers[r.order[2]]! };
    const mine = quizZoneAt(pos);
    if (now < r.revealAt) return { phase: 'open', question: q.text, answers, seconds: Math.ceil((r.revealAt - now) / 1000), mine };
    const settled = this.quizResult?.n === r.n ? this.quizResult : null;
    return { phase: 'reveal', question: q.text, answers, seconds: Math.ceil((r.endsAt - now) / 1000), mine, right: r.right, ...(settled ? { won: settled.won } : {}) };
  }

  // ---------- today's tasks ----------

  /** Ask for today's tasks; again when the park day turns, or soon if the room did not answer. */
  private async refreshTasks(): Promise<void> {
    const link = this.link;
    if (!link || this.dead) return;
    const view = await link.tasks();
    if (this.dead) return;
    this.tasksTimer?.remove();
    if (!view) {
      this.tasksTimer = this.host.scene.time.delayedCall(TASKS_RETRY_MS, () => void this.refreshTasks());
      return;
    }
    this.host.tasks.set(view);
    this.tasksTimer = this.host.scene.time.delayedCall(Math.min(MAX_TIMER_MS, Math.max(1000, view.endsAt - this.now() + 1500)), () => void this.refreshTasks());
  }

  /** Today's tasks moved: a task done pays and says so; a step along one shows only in Quests' Today tab (OP-083). */
  onTasks(view: TaskView, finished: string[], paid: number, total: number): void {
    this.host.tasks.set(view);
    if (paid) this.host.feathers(total);
    for (const text of finished) this.host.hud.toast(`Task done: ${text}! ${feathersText(TASK_FEATHERS)}`, 3600, '#FFD36A');
    if (paid > finished.length * TASK_FEATHERS) this.host.hud.toast(`All three of today's tasks done! ${feathersText(TASKS_BONUS)} more`, 4200, '#FFD36A');
  }

  // ---------- every frame ----------

  tick(): void {
    const now = this.now();
    const me = this.host.me();
    this.lanterns?.tick(now);
    if (this.quiz) {
      const park = this.link?.parkNow() ?? now;
      const view = this.quizView(park, me.pos);
      this.quiz.show(view.phase, view.phase === 'reveal' ? view.right : undefined);
      this.host.hud.setQuiz(me.pos.x >= QUIZ_BAY_X ? view : null);
    }
    if (this.fishing) {
      const line = this.fishing.status(now);
      if (line !== 'idle' && distance(me.pos, FISHING_SPOT) > FISHING_REACH + 40) this.fishing.end();
      else if (line === 'gone' && now > this.fishingGoneAt()) {
        this.fishing.end();
        this.host.hud.toast('The fish got away. Cast again!', 2600);
      }
      this.fishing.tick(now, me);
    }
    if (this.robot) this.tickCopy(now);
  }

  private fishingGoneAt(): number {
    return (this.fishing?.biteAtTime() ?? 0) + BITE_WINDOW_MS + GONE_AFTER_MS;
  }

  private tickCopy(now: number): void {
    const game = this.copy;
    if (game && now > game.deadline + 500) {
      // Nobody answered: the robot owl stops waiting.
      this.copy = null;
      this.host.hud.toast(`Too slow! You copied ${game.level} tune${game.level === 1 ? '' : 's'}.`, 3200);
    }
    if (!this.copy) return void this.host.hud.setCopy(null);
    const g = this.copy;
    const start = g.listenUntil - 400 - g.tune.length * COPY_NOTE_MS;
    const at = now - start;
    const i = Math.floor(at / COPY_NOTE_MS);
    const playing = now < g.listenUntil && at >= 0 && i < g.tune.length && at % COPY_NOTE_MS < COPY_NOTE_MS * 0.75 ? i : -1;
    if (playing >= 0 && playing !== this.sung) {
      this.sung = playing;
      this.robot?.note(NOTE_TINTS[Math.max(0, g.notes.indexOf(g.tune[playing]!)) % NOTE_TINTS.length]!);
    }
    const view: CopyView = { phase: now < g.listenUntil ? 'listen' : 'play', tune: g.tune, playing, got: g.got, level: g.level, seconds: Math.max(0, Math.ceil((g.deadline - now) / 1000)), notes: g.notes };
    this.host.hud.setCopy(view);
  }

  /** Read-only snapshot for tests. */
  debug(): {
    lanterns: string[];
    glowing: boolean;
    line: 'idle' | 'out' | 'bite' | 'gone';
    copy: { tune: string[]; got: number; level: number; listening: boolean } | null;
    quiz: { n: number; right: QuizZone; revealAt: number } | null;
  } {
    const now = this.now();
    const park = this.link?.parkNow() ?? now;
    const r = quizRoundAt(park);
    const next = park < r.revealAt ? r : quizRound(r.n + 1);
    return {
      lanterns: this.lanterns?.litAt(now) ?? [],
      glowing: this.lanterns?.glowing(now) ?? false,
      line: this.fishing?.status(now) ?? 'idle',
      copy: this.copy ? { tune: this.copy.tune, got: this.copy.got, level: this.copy.level, listening: now < this.copy.listenUntil } : null,
      // The next question to close, its right zone, and when it closes on this device's clock.
      quiz: this.quiz ? { n: next.n, right: next.right, revealAt: next.revealAt - (park - now) } : null,
    };
  }

  destroy(): void {
    this.dead = true;
    this.tasksTimer?.remove();
    this.lanterns?.destroy();
    this.quiz?.destroy();
    this.fishing?.destroy();
    this.robot?.destroy();
    this.host.hud.setQuiz(null);
    this.host.hud.setCopy(null);
  }
}
