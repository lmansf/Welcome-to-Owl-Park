/**
 * Feather tag in the Party Grove (OP-403, Dec 1 plan D5), behind `?tag=1` (flags.ts): the grove's two
 * game spaces drawn as size boxes on the plaza's floor (the tag ring and the bowling lane, each with its
 * dimensions on it, until their art is painted), and the game itself.
 *
 * Playing it takes nothing to learn: walk into the ring and you are in; walk out and you are out. The
 * owl holding the feather passes it by walking into another owl in the ring (or tapping them, or the
 * Pass the feather button). A line at the top of the screen says what is happening, and the feather is
 * drawn over the head of whoever holds it.
 *
 * The room server keeps the game and checks every step (party/tag.ts); this layer only asks it, and reads
 * what it says on the room's clock with tagAt, so every page shows the same moment. Without the room
 * server (the local park) the ring says it needs the server.
 */
import Phaser from 'phaser';
import {
  BOWLING_LANE,
  TAG_BACK_MS,
  TAG_RING,
  TAG_WORDS,
  inTagRing,
  newTag,
  tagAt,
  tagPhase,
  tagTouches,
  type ServerTag,
  type TagPhase,
  type TagRefusal,
  type TagState,
  type Vec2,
} from '@owl-park/shared';
import type { RoomConnection } from '../net/transport';

export interface TagLayerOpts {
  scene: Phaser.Scene;
  hudRoot: () => HTMLElement | null;
  toast(message: string, ms?: number): void;
  /** This page's own owl's id. */
  me(): string;
  /** Where an owl here stands now (this page's own owl included), as this page draws it. */
  posOf(id: string): Vec2 | null;
}

export interface TagAction {
  id: string;
  label: string;
  run: () => void;
}

/** What the browser tests read (RoomScene.debugState().tag). */
export interface TagDebug {
  /** Whether this page's owl stands in the ring. */
  inRing: boolean;
  phase: TagPhase;
  players: string[];
  holder: string | null;
  round: number;
  left: string | null;
  /** The line at the top of the screen, '' when none shows. */
  line: string;
  /** Passes this page asked the room for, and steps the room turned down. */
  passesAsked: number;
  refused: TagRefusal[];
  /** Whether the room server runs the game for this page. */
  server: boolean;
}

const CSS = `
#hud .tag-line{position:absolute;z-index:11;left:50%;transform:translateX(-50%);top:calc(max(12px,env(safe-area-inset-top)) + 64px);max-width:min(460px,calc(100vw - 24px));padding:8px 14px;border-radius:999px;background:rgba(12,30,54,.92);border:1px solid rgba(255,211,106,.6);color:#F6F1E3;font-size:15px;line-height:1.3;text-align:center;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.4)}
#hud .tag-line.you{border-color:#ffd36a;background:rgba(84,58,8,.94)}
`;
let styled = false;

/** How often the layer looks where the owls stand (ms): often enough that a touch passes at once. */
const LOOK_EVERY_MS = 100;
/** How long the layer waits before asking the room the same thing again (ms). */
const ASK_AGAIN_MS = 1500;
const PASS_AGAIN_MS = 400;

export class TagLayer {
  private readonly drawn: Phaser.GameObjects.GameObject[] = [];
  private readonly feather: Phaser.GameObjects.Graphics;
  private conn: RoomConnection | null = null;
  private game: TagState = newTag();
  private line: HTMLElement | null = null;
  private lineText = '';
  private lookedAt = 0;
  private askedJoin = 0;
  private askedLeave = 0;
  private askedPass = 0;
  private passesAsked = 0;
  private readonly refused: TagRefusal[] = [];
  private toldFull = false;
  private toldNoServer = false;

  constructor(private readonly o: TagLayerOpts) {
    this.drawSpaces();
    this.feather = o.scene.add.graphics().setDepth(1_000_000).setVisible(false);
    this.drawFeather();
  }

  /** The room's connection, once the scene holds it: the game is asked for. */
  attach(conn: RoomConnection): void {
    this.conn = conn;
    conn.tag?.send('view');
  }

  private now(): number {
    return this.conn?.serverNow?.() ?? Date.now();
  }

  /** The two game spaces as size boxes on the plaza's floor, each with its dimensions on it. */
  private drawSpaces(): void {
    const s = this.o.scene;
    const label = (x: number, y: number, words: string, depth: number) =>
      s.add.text(x, y, words, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd36a', align: 'center' }).setOrigin(0.5).setDepth(depth);
    // Laid on the floor, under every owl: drawn at the depth of its back edge.
    const ring = s.add.graphics();
    ring.fillStyle(0xffd36a, 0.08).fillEllipse(TAG_RING.x, TAG_RING.y, TAG_RING.rx * 2, TAG_RING.ry * 2);
    ring.lineStyle(3, 0xffd36a, 0.9).strokeEllipse(TAG_RING.x, TAG_RING.y, TAG_RING.rx * 2, TAG_RING.ry * 2);
    ring.setDepth(TAG_RING.y - TAG_RING.ry);
    const ringText = label(TAG_RING.x, TAG_RING.y - TAG_RING.ry + 22, `${TAG_WORDS.ring}\n${TAG_RING.rx * 2}×${TAG_RING.ry * 2}`, TAG_RING.y - TAG_RING.ry + 0.5);
    const lane = s.add.graphics();
    lane.fillStyle(0xffd36a, 0.08).fillRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.lineStyle(2, 0xffd36a, 0.9).strokeRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.setDepth(BOWLING_LANE.y);
    const laneText = label(BOWLING_LANE.x + BOWLING_LANE.w / 2, BOWLING_LANE.y + BOWLING_LANE.h / 2, `${TAG_WORDS.lane} ${BOWLING_LANE.w}×${BOWLING_LANE.h}`, BOWLING_LANE.y + 0.5);
    this.drawn.push(ring, ringText, lane, laneText);
  }

  /** A feather drawn in code, as a size box would be: a quill and its vane, floating over the holder's head. */
  private drawFeather(): void {
    const g = this.feather;
    g.clear();
    g.fillStyle(0xfff3c4, 1).fillEllipse(0, -34, 22, 52);
    g.lineStyle(2, 0xb07a1a, 1).strokeEllipse(0, -34, 22, 52);
    g.lineBetween(0, -64, 0, -2);
    g.setRotation(0.35);
  }

  /** The room's word about the game: an answer or a push. */
  onTag(f: ServerTag): void {
    this.game = f.tag;
    if (f.refused) {
      this.refused.push(f.refused);
      if (f.refused === 'full' && !this.toldFull) {
        this.toldFull = true;
        this.o.toast(TAG_WORDS.full, 3500);
      }
    }
    this.lookedAt = 0;
  }

  private mine(g: TagState): boolean {
    return g.players.includes(this.o.me());
  }

  /** Called every frame: steps in and out of the game, passes the feather on a touch, and shows it all. */
  update(time: number): void {
    const me = this.o.me();
    const pos = this.o.posOf(me);
    const now = this.now();
    const g = tagAt(this.game, now);
    if (pos && time - this.lookedAt >= LOOK_EVERY_MS) {
      this.lookedAt = time;
      this.step(g, me, pos, now);
    }
    this.show(g, me, now, pos);
  }

  private step(g: TagState, me: string, pos: Vec2, now: number): void {
    const link = this.conn?.tag;
    const inRing = inTagRing(pos);
    if (!link) {
      if (inRing && this.conn && !this.toldNoServer) {
        this.toldNoServer = true;
        this.o.toast(TAG_WORDS.noServer, 4000);
      }
      return;
    }
    if (inRing && !this.mine(g) && now - this.askedJoin >= ASK_AGAIN_MS) {
      this.askedJoin = now;
      link.send('join');
    } else if (!inRing && this.mine(g) && now - this.askedLeave >= ASK_AGAIN_MS) {
      this.askedLeave = now;
      link.send('leave');
    }
    if (!inRing) this.toldFull = false;
    const target = this.touching(g, me, pos, now);
    if (target && now - this.askedPass >= PASS_AGAIN_MS) this.pass(target);
  }

  /** The owl the feather would pass to now: holding it in a live round, another owl in the game this owl's feet touch. */
  private touching(g: TagState, me: string, pos: Vec2, now: number): string | null {
    if (tagPhase(g, now) !== 'live' || g.holder !== me) return null;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of g.players) {
      if (id === me || (g.from === id && now - g.passedAt < TAG_BACK_MS)) continue;
      const p = this.o.posOf(id);
      if (!p || !tagTouches(pos, p)) continue;
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  private pass(to: string): void {
    this.askedPass = this.now();
    this.passesAsked += 1;
    this.conn?.tag?.send('pass', to);
  }

  /** A tap on another owl: the feather passes to it, if this owl holds it and they touch. */
  tap(id: string): boolean {
    const me = this.o.me();
    const pos = this.o.posOf(me);
    const now = this.now();
    const g = tagAt(this.game, now);
    if (!pos || id === me || g.holder !== me || tagPhase(g, now) !== 'live') return false;
    if (g.from === id && now - g.passedAt < TAG_BACK_MS) return false;
    const p = this.o.posOf(id);
    if (!p || !g.players.includes(id) || !tagTouches(pos, p)) return false;
    this.pass(id);
    return true;
  }

  /** What the owl can do: pass the feather, holding it and touching another owl. */
  actions(pos: Vec2): TagAction[] {
    const me = this.o.me();
    const now = this.now();
    const target = this.touching(tagAt(this.game, now), me, pos, now);
    return target ? [{ id: 'tag:pass', label: TAG_WORDS.pass, run: () => this.pass(target) }] : [];
  }

  /** What to say now, to this owl. */
  private words(g: TagState, me: string, now: number, inRing: boolean): string {
    const phase = tagPhase(g, now);
    if (!this.mine(g)) {
      // Watching from outside: only say what to do when standing at the ring's edge or a round is on.
      return inRing ? (this.conn?.tag ? '' : TAG_WORDS.noServer) : '';
    }
    if (phase === 'waiting') return TAG_WORDS.waiting;
    if (phase === 'countdown') {
      const n = Math.max(1, Math.ceil((g.startsAt - now) / 1000));
      return g.holder === me ? `${TAG_WORDS.countdown(n)}. You start with the feather!` : TAG_WORDS.countdown(n);
    }
    if (phase === 'live') {
      const left = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      return `${g.holder === me ? TAG_WORDS.youHave : TAG_WORDS.theyHave} · ${left}s`;
    }
    return g.left === me ? TAG_WORDS.youLeft : TAG_WORDS.theyLeft;
  }

  private show(g: TagState, me: string, now: number, pos: Vec2 | null): void {
    const inRing = pos ? inTagRing(pos) : false;
    const text = this.words(g, me, now, inRing);
    this.setLine(text, this.mine(g) && g.holder === me && tagPhase(g, now) !== 'waiting' && tagPhase(g, now) !== 'over');
    // The feather over the head of whoever holds it, from the countdown on; over the one left holding it once the round is over.
    const phase = tagPhase(g, now);
    const who = phase === 'over' ? g.left : phase === 'waiting' ? null : g.holder;
    const at = who ? this.o.posOf(who) : null;
    if (at) {
      const bob = Math.sin(now / 180) * 4;
      this.feather.setPosition(at.x + 18, at.y - 96 + bob).setVisible(true);
      this.feather.setAlpha(phase === 'countdown' ? 0.55 + 0.45 * Math.abs(Math.sin(now / 150)) : 1);
    } else this.feather.setVisible(false);
  }

  private setLine(text: string, you: boolean): void {
    if (text === this.lineText && (!!this.line?.classList.contains('you')) === you) return;
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
      this.line.className = 'tag-line';
      this.line.setAttribute('role', 'status');
      this.line.setAttribute('aria-live', 'polite');
      root.appendChild(this.line);
    }
    this.line.textContent = text;
    this.line.classList.toggle('you', you);
  }

  state(): TagDebug {
    const now = this.now();
    const g = tagAt(this.game, now);
    const pos = this.o.posOf(this.o.me());
    return {
      inRing: pos ? inTagRing(pos) : false,
      phase: tagPhase(g, now),
      players: [...g.players],
      holder: g.holder,
      round: g.round,
      left: g.left,
      line: this.lineText,
      passesAsked: this.passesAsked,
      refused: [...this.refused],
      server: !!this.conn?.tag,
    };
  }

  /** The owl moves on: everything here goes with the room. Its page leaving the room takes it out of the game. */
  destroy(): void {
    for (const d of this.drawn) d.destroy();
    this.drawn.length = 0;
    this.feather.destroy();
    this.line?.remove();
    this.line = null;
  }
}
