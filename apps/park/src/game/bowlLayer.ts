/**
 * Pinecone bowling in the Great Hollow (OP-403, Dec 1 plan D5), on for every visitor since Nov 20: the six pins
 * and the pinecone drawn in code as size boxes would be, on the bowling lane that feather tag laid out
 * (party/tag.ts), and the game itself (party/bowling.ts).
 *
 * Playing it: walk to the head of the lane and press Bowl a pinecone. An arrow swings slowly up and down
 * the lane; press Roll it! when it points where you want. The pinecone rolls down, off the bumpers, and
 * the pins it hits fall. Three rolls make a game, the pins set up again before each one, and a line at the
 * top of the screen says how many fell. It is this owl's own game, on this page: nothing goes to the room.
 */
import Phaser from 'phaser';
import {
  BOWL_BALL_R,
  BOWL_PIN_R,
  BOWL_PINS,
  BOWL_SETTLE_MS,
  BOWL_SPEED,
  BOWL_SPOT,
  BOWL_START,
  BOWL_WORDS,
  BOWLING_LANE,
  TAG_WORDS,
  atBowlSpot,
  bowlAdd,
  bowlAim,
  bowlOver,
  bowlRoll,
  bowlScore,
  newBowl,
  type BowlGame,
  type BowlRoll,
  type Vec2,
} from '@owl-park/shared';
import { artOrShape, standIn } from './standIn';
import { workBoxesShown } from './workBoxes';

export interface BowlLayerOpts {
  scene: Phaser.Scene;
  hudRoot: () => HTMLElement | null;
  /** Where this page's own owl stands now. */
  myPos(): Vec2;
  /** Whether to draw the lane's own size box (feather tag draws it when it is on too). */
  drawLane: boolean;
}

export interface BowlAction {
  id: string;
  label: string;
  run: () => void;
}

export type BowlPhase = 'idle' | 'aiming' | 'rolling' | 'settling';

/** What the browser tests read (RoomScene.debugState().bowl). */
export interface BowlDebug {
  phase: BowlPhase;
  atSpot: boolean;
  /** The pins that fell on each roll of the game so far, and its score. */
  rolls: number[];
  score: number;
  /** The pins standing now, by index into BOWL_PINS. */
  standing: number[];
  /** The line at the top of the screen, '' when none shows. */
  line: string;
  /** Games played to the end on this page. */
  games: number;
}

const CSS = `
#hud .bowl-line{position:absolute;z-index:11;left:50%;transform:translateX(-50%);top:calc(max(12px,env(safe-area-inset-top)) + 64px);max-width:min(460px,calc(calc(100vw/var(--vz,1)) - 24px));padding:8px 14px;border-radius:999px;background:rgba(12,30,54,.92);border:1px solid rgba(255,211,106,.6);color:#F6F1E3;font-size:15px;line-height:1.3;text-align:center;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.4)}
`;
let styled = false;

/** How long the result of a whole game stays said once the owl has walked off (ms). */
const DONE_SHOWN_MS = 5000;

export class BowlLayer {
  private readonly drawn: Phaser.GameObjects.GameObject[] = [];
  private readonly pins: Phaser.GameObjects.Container[] = [];
  private readonly ball: Phaser.GameObjects.Container;
  private readonly arrow: Phaser.GameObjects.Graphics;
  private game: BowlGame = newBowl();
  private phase: BowlPhase = 'idle';
  private aimFrom = 0;
  private roll: BowlRoll | null = null;
  private rollFrom = 0;
  private settleUntil = 0;
  private standing = new Set<number>(BOWL_PINS.map((_, i) => i));
  private said = '';
  private saidUntil = 0;
  private line: HTMLElement | null = null;
  private lineText = '';
  private games = 0;

  constructor(private readonly o: BowlLayerOpts) {
    const s = o.scene;
    if (o.drawLane) this.drawLane();
    const spot = s.add.graphics();
    spot.lineStyle(2, 0xffd36a, 0.9).strokeCircle(BOWL_SPOT.x, BOWL_SPOT.y, 26);
    spot.setDepth(BOWL_SPOT.y - 26);
    this.drawn.push(spot);
    // The pins and the pinecone: their art (bowl-pin, bowl-pinecone) once it loads, the plain shapes until then
    // and on a painter's or a keeper's tab.
    const work = workBoxesShown();
    for (const p of BOWL_PINS) {
      const g = artOrShape(s, 'bowl-pin', BOWL_PIN_R * 2.6, BOWL_PIN_R * 2.6, (sh) => {
        sh.fillStyle(0xf6f1e3, 1).fillCircle(0, 0, BOWL_PIN_R);
        sh.lineStyle(2, 0xb07a1a, 1).strokeCircle(0, 0, BOWL_PIN_R);
        sh.fillStyle(0xc0392b, 1).fillRect(-BOWL_PIN_R, -2, BOWL_PIN_R * 2, 4);
      }, { keepShape: work });
      g.setPosition(p.x, p.y).setDepth(p.y);
      this.pins.push(g);
    }
    this.ball = artOrShape(s, 'bowl-pinecone', BOWL_BALL_R * 2.6, BOWL_BALL_R * 2.6, (sh) => {
      sh.fillStyle(0x8a5a2b, 1).fillEllipse(0, 0, BOWL_BALL_R * 2.2, BOWL_BALL_R * 2);
      sh.lineStyle(2, 0x4a2e12, 1).strokeEllipse(0, 0, BOWL_BALL_R * 2.2, BOWL_BALL_R * 2);
    }, { keepShape: work });
    this.ball.setPosition(BOWL_START.x, BOWL_START.y).setDepth(BOWL_START.y).setVisible(false);
    this.arrow = s.add.graphics().setDepth(BOWLING_LANE.y + BOWLING_LANE.h).setVisible(false);
  }

  /** The lane as a size box with its dimensions on it, when feather tag is not drawing it. */
  private drawLane(): void {
    const s = this.o.scene;
    // For every visitor but a painter or a keeper (workBoxes.ts), the lane's art, no outline or size.
    if (!workBoxesShown()) {
      drawLaneArt(s, this.drawn);
      return;
    }
    const lane = s.add.graphics();
    lane.fillStyle(0xffd36a, 0.08).fillRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.lineStyle(2, 0xffd36a, 0.9).strokeRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.setDepth(BOWLING_LANE.y);
    const text = s.add
      .text(BOWLING_LANE.x + BOWLING_LANE.w / 2, BOWLING_LANE.y + BOWLING_LANE.h / 2, `${TAG_WORDS.lane} ${BOWLING_LANE.w}×${BOWLING_LANE.h}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#ffd36a',
      })
      .setOrigin(0.5)
      .setDepth(BOWLING_LANE.y + 0.5);
    this.drawn.push(lane, text);
  }

  /** What the owl can do here: start a roll at the head of the lane, or let the pinecone go. */
  actions(pos: Vec2): BowlAction[] {
    if (this.phase === 'aiming') return [{ id: 'bowl:roll', label: BOWL_WORDS.roll, run: () => this.release(Date.now()) }];
    if (this.phase === 'idle' && atBowlSpot(pos)) return [{ id: 'bowl:start', label: BOWL_WORDS.bowl, run: () => this.start(Date.now()) }];
    return [];
  }

  private start(now: number): void {
    if (this.phase !== 'idle') return;
    if (bowlOver(this.game)) this.game = newBowl();
    this.standing = new Set(BOWL_PINS.map((_, i) => i));
    this.phase = 'aiming';
    this.aimFrom = now;
    this.said = '';
  }

  private release(now: number): void {
    if (this.phase !== 'aiming') return;
    this.roll = bowlRoll(bowlAim(now - this.aimFrom));
    this.rollFrom = now;
    this.phase = 'rolling';
  }

  /** Called every frame. */
  update(now: number): void {
    const pos = this.o.myPos();
    if (this.phase === 'aiming' && !atBowlSpot(pos)) this.phase = 'idle';
    if (this.phase === 'rolling' && this.roll) this.rollOn(now);
    if (this.phase === 'settling' && now >= this.settleUntil) this.settled(now);
    this.drawArrow(now);
    this.showPins();
    this.setLine(this.words(now, pos));
  }

  private rollOn(now: number): void {
    const roll = this.roll!;
    // The path's points are 4 room px apart: where the pinecone is at this moment of its roll.
    const i = Math.min(roll.path.length - 1, Math.floor(((now - this.rollFrom) / 1000) * BOWL_SPEED / 4));
    const at = roll.path[i]!;
    this.ball.setPosition(at.x, at.y).setDepth(at.y).setVisible(true);
    for (const pin of roll.down) {
      const p = BOWL_PINS[pin]!;
      if (at.x >= p.x - BOWL_BALL_R - BOWL_PIN_R) this.standing.delete(pin);
    }
    if (i === roll.path.length - 1) {
      for (const pin of roll.down) this.standing.delete(pin);
      this.game = bowlAdd(this.game, roll.down.length);
      this.said = BOWL_WORDS.rolled(roll.down.length);
      this.phase = 'settling';
      this.settleUntil = now + BOWL_SETTLE_MS;
    }
  }

  private settled(now: number): void {
    this.ball.setVisible(false);
    this.roll = null;
    this.standing = new Set(BOWL_PINS.map((_, i) => i));
    if (bowlOver(this.game)) {
      this.games += 1;
      this.phase = 'idle';
      this.said = BOWL_WORDS.done(bowlScore(this.game));
      this.saidUntil = now + DONE_SHOWN_MS;
      return;
    }
    // The next roll of the game: straight back to aiming, while the owl is still at the head of the lane.
    this.phase = atBowlSpot(this.o.myPos()) ? 'aiming' : 'idle';
    this.aimFrom = now;
    this.said = '';
  }

  private drawArrow(now: number): void {
    const g = this.arrow;
    if (this.phase !== 'aiming') {
      g.setVisible(false);
      return;
    }
    const a = bowlAim(now - this.aimFrom);
    const len = 150;
    const to = { x: BOWL_START.x + Math.cos(a) * len, y: BOWL_START.y + Math.sin(a) * len };
    g.clear();
    g.lineStyle(5, 0xffd36a, 1).lineBetween(BOWL_START.x, BOWL_START.y, to.x, to.y);
    const back = a + Math.PI;
    g.fillStyle(0xffd36a, 1).fillTriangle(
      to.x + Math.cos(a) * 12,
      to.y + Math.sin(a) * 12,
      to.x + Math.cos(back + 0.5) * 14,
      to.y + Math.sin(back + 0.5) * 14,
      to.x + Math.cos(back - 0.5) * 14,
      to.y + Math.sin(back - 0.5) * 14,
    );
    g.setVisible(true);
  }

  private showPins(): void {
    this.pins.forEach((g, i) => {
      const up = this.standing.has(i);
      g.setAlpha(up ? 1 : 0.25).setRotation(up ? 0 : 1.2);
    });
  }

  private words(now: number, pos: Vec2): string {
    const n = this.game.rolls.length;
    if (this.phase === 'aiming') return `${BOWL_WORDS.rollOf(n + 1)} · ${BOWL_WORDS.aiming}`;
    if (this.phase === 'rolling') return BOWL_WORDS.rollOf(n + 1);
    if (this.phase === 'settling') return this.said;
    if (this.said && (now < this.saidUntil || atBowlSpot(pos))) return this.said;
    return '';
  }

  private setLine(text: string): void {
    if (text === this.lineText) return;
    this.lineText = text;
    if (!text) {
      this.line?.remove();
      this.line = null;
      return;
    }
    const root = this.o.hudRoot();
    if (!root) return;
    if (!styled) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      styled = true;
    }
    if (!this.line) {
      this.line = document.createElement('div');
      this.line.className = 'bowl-line';
      this.line.setAttribute('role', 'status');
      this.line.setAttribute('aria-live', 'polite');
      root.appendChild(this.line);
    }
    this.line.textContent = text;
  }

  state(): BowlDebug {
    return {
      phase: this.phase,
      atSpot: atBowlSpot(this.o.myPos()),
      rolls: [...this.game.rolls],
      score: bowlScore(this.game),
      standing: [...this.standing].sort((a, b) => a - b),
      line: this.lineText,
      games: this.games,
    };
  }

  destroy(): void {
    for (const d of this.drawn) d.destroy();
    this.drawn.length = 0;
    for (const p of this.pins) p.destroy();
    this.pins.length = 0;
    this.ball.destroy();
    this.arrow.destroy();
    this.line?.remove();
    this.line = null;
  }
}

/** The bowling lane's art (bowl-lane) over a soft worn strip that shows until it loads: shared with feather tag, which draws the lane when it is on. */
export function drawLaneArt(s: Phaser.Scene, into: Phaser.GameObjects.GameObject[]): void {
  const worn = s.add.graphics();
  worn.fillStyle(0xffd36a, 0.07).fillRoundedRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h, BOWLING_LANE.h / 2);
  worn.setDepth(BOWLING_LANE.y);
  into.push(worn);
  standIn(s, 'bowl-lane', { x: BOWLING_LANE.x + BOWLING_LANE.w / 2, y: BOWLING_LANE.y + BOWLING_LANE.h }, BOWLING_LANE.w, BOWLING_LANE.y + 0.1, into);
}
