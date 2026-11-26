/**
 * Feather tag across the whole Great Hollow (OP-434; OP-403 and OP-426 before it), for every visitor: the
 * feather station and the bowling lane drawn as size boxes on the floor (each with its dimensions on it,
 * until their art is painted), and the game itself.
 *
 * Anyone in the hollow starts a game with the Feather tag button at the top of the screen, or at the
 * feather station. For the call's ten seconds the button says Join to everyone else in the hollow. Then
 * the owl that started it holds the feather, and the round runs for thirty seconds over the whole floor:
 * the owl holding it passes it by walking into another owl in the game (or tapping them, or the Pass the
 * feather button). A line at the top of the screen says what is happening, with the score, and the feather
 * is drawn over the head of whoever holds it. When the time is up the room server pays everyone in the game
 * by the round's tier, and the page says what each owl won.
 *
 * The room server keeps the game and checks every step (party/tag.ts); this layer only asks it, and reads
 * what it says on the room's clock with tagAt, so every page shows the same moment. Without the room
 * server (the local park, or a park that could not connect) the button says the park could not connect.
 *
 * Never a one-owl game (OP-426): if no one joins the call, Pip, the lantern keeper, plays, running round
 * the feather station where the clock has Pip (standInAt) on every page; Pip's own NPC owl is drawn
 * there while it plays, and goes home after.
 */
import Phaser from 'phaser';
import { laneArt, standIn } from './standIn';
import { workBoxesShown } from './workBoxes';
import {
  BOWLING_LANE,
  FURNITURE,
  TAG_BACK_MS,
  TAG_STANDIN,
  TAG_STATION,
  TAG_WORDS,
  atTagStation,
  isStandIn,
  newTag,
  realPlayers,
  standInAt,
  tagAt,
  tagPhase,
  tagScore,
  tagTouches,
  type ServerTag,
  type ServerTagPrize,
  type TagPhase,
  type TagRefusal,
  type TagState,
  type Vec2,
} from '@owl-park/shared';
import type { RoomConnection } from '../net/transport';
import { ROOM_DOWN, roomReachable } from './roomDown';
import { tagButtonTop } from './tagButton';

export interface TagLayerOpts {
  scene: Phaser.Scene;
  hudRoot: () => HTMLElement | null;
  toast(message: string, ms?: number): void;
  /** This page's own owl's id. */
  me(): string;
  /** Where an owl here stands now (this page's own owl included), as this page draws it. */
  posOf(id: string): Vec2 | null;
  /** Draw the park owl `id` standing in at `pos`, or back at its spot (null) (OP-426). */
  standIn?(id: string, pos: Vec2 | null): void;
  /** The owl's feathers after a prize, and whether it won an item for its collection or nest (OP-434). */
  prized?(total: number, item: boolean): void;
}

export interface TagAction {
  id: string;
  label: string;
  run: () => void;
}

/** What the browser tests read (RoomScene.debugState().tag). */
export interface TagDebug {
  /** Whether this page's owl stands at the feather station. */
  atStation: boolean;
  phase: TagPhase;
  /** This owl's id in the game, as the page reads it. */
  self: string;
  /** The last few games the room sent, in short, oldest first: for a test that misses to say what came. */
  heard: string[];
  players: string[];
  holder: string | null;
  round: number;
  left: string | null;
  /** The round's score so far, or at its end. */
  score: number;
  /** The line at the top of the screen, '' when none shows. */
  line: string;
  /** The Start or Join button's words, '' while it is hidden. */
  button: string;
  /** Passes this page asked the room for, and steps the room turned down. */
  passesAsked: number;
  refused: TagRefusal[];
  /** Whether the room server runs the game for this page. */
  server: boolean;
  /** Where Pip stands while standing in (OP-426), null otherwise. */
  standIn: Vec2 | null;
  /** What the last finished game earned this owl, as the room said (OP-434). */
  prize: ServerTagPrize | null;
}

/**
 * The game's line keeps the top's middle, under the bar; its button keeps the top-right corner, under
 * the owl count, out over the room's edge rather than its middle, where it stood over what the room has
 * there (OP-466, the Nov 25 cleanup walk: in the Great Hollow it floated over the telescope). While an
 * activity card shows in that corner (the stage quiz's), the button stands just under it (tagButtonTop).
 * The room's chips keep clear of it (RoomScene.hintsKeepOut, hud.controlBoxes).
 */
const CSS = `
#hud .tag-line{position:absolute;z-index:11;left:50%;transform:translateX(-50%);top:calc(max(12px,env(safe-area-inset-top)) + 64px);max-width:min(460px,calc(calc(100vw/var(--vz,1)) - 24px));padding:8px 14px;border-radius:999px;background:rgba(12,30,54,.92);border:1px solid rgba(255,211,106,.6);color:#F6F1E3;font-size:15px;line-height:1.3;text-align:center;pointer-events:none;box-shadow:0 6px 22px rgba(0,0,0,.4)}
#hud .tag-line.you{border-color:#ffd36a;background:rgba(84,58,8,.94)}
#hud .tag-btn{position:absolute;z-index:11;right:max(12px,env(safe-area-inset-right));top:calc(max(12px,env(safe-area-inset-top)) + 64px);min-height:44px;padding:8px 18px;border-radius:999px;background:rgba(12,30,54,.9);border:2px solid #ffd36a;color:#F6F1E3;font-size:15px;font-weight:700;pointer-events:auto;box-shadow:0 6px 22px rgba(0,0,0,.4)}
#hud .tag-btn.call{background:#C9A227;color:#0C1E36}
`;
let styled = false;

/** How often the layer looks where the owls stand (ms): often enough that a touch passes at once. */
const LOOK_EVERY_MS = 100;
/** How long the layer waits before asking the room the same thing again (ms). */
const ASK_AGAIN_MS = 1500;
/** How long a Start or Join pressed is asked again while the room has not taken it (ms). */
const JOIN_KEEP_MS = 6000;
const PASS_AGAIN_MS = 400;

/** What a prize says to the owl that won it. */
export function prizeWords(f: ServerTagPrize): string {
  const tier = f.tier === 'high' ? 'Top tier' : f.tier === 'middle' ? 'Middle tier' : 'Nice passing';
  const p = f.prize;
  switch (p.kind) {
    case 'item':
      return `${tier}! You won the ${p.name} for your collection`;
    case 'furniture': {
      const name = FURNITURE.find((x) => x.id === p.item)?.name ?? 'a new piece';
      return `${tier}! You won the ${name} for your nest`;
    }
    case 'feathers':
      if (p.feathers === 0) return `${tier}! You've earned all of today's game feathers already`;
      return `${tier}! ${p.jackpot ? 'Jackpot: ' : ''}+${p.feathers} feathers${f.capped ? ", today's game feathers all earned" : ''}`;
    case 'none':
      return `${tier}! Feathers are for ticket holders`;
  }
}

export class TagLayer {
  private readonly drawn: Phaser.GameObjects.GameObject[] = [];
  private readonly feather: Phaser.GameObjects.Graphics;
  private conn: RoomConnection | null = null;
  private game: TagState = newTag();
  private heard: string[] = [];
  private line: HTMLElement | null = null;
  private lineText = '';
  private lineYou = false;
  private btn: HTMLButtonElement | null = null;
  private btnText = '';
  private lookedAt = 0;
  /** When the button was last placed against the activity cards (the frame clock). */
  private placedAt = 0;
  private askedJoin = 0;
  /** Until when a Start or Join pressed is asked again, should it be lost on a line that dropped (OP-434). */
  private joinUntil = 0;
  private askedPass = 0;
  private passesAsked = 0;
  private readonly refused: TagRefusal[] = [];
  private pipShown = false;
  private toldPip = false;
  private prize: ServerTagPrize | null = null;

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

  /**
   * The feather station and the bowling lane. On a painter's or a keeper's tab, size boxes on the floor,
   * each with its dimensions on it (workBoxes.ts); for every other visitor the station's own art, the
   * game's name over it, and the lane's (laneArt): a soft worn strip shows wherever the art has not loaded.
   */
  private drawSpaces(): void {
    const s = this.o.scene;
    if (!workBoxesShown()) {
      const st = TAG_STATION;
      standIn(s, 'tag-feather-station', { x: st.x, y: st.y + 7 }, 184, st.y, this.drawn, { text: TAG_WORDS.ring, up: 145 });
      laneArt(s, this.drawn);
      return;
    }
    const label = (x: number, y: number, words: string, depth: number) =>
      s.add.text(x, y, words, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#ffd36a', align: 'center' }).setOrigin(0.5).setDepth(depth);
    // The station stands up from its foot: drawn at its foot's depth, so an owl in front of it is drawn over it.
    const st = TAG_STATION;
    const station = s.add.graphics();
    station.fillStyle(0xffd36a, 0.12).fillRect(st.x - st.w / 2, st.y - st.h, st.w, st.h);
    station.lineStyle(3, 0xffd36a, 0.9).strokeRect(st.x - st.w / 2, st.y - st.h, st.w, st.h);
    station.setDepth(st.y);
    const stationText = label(st.x, st.y - st.h / 2, `${TAG_WORDS.station}\n${st.w}×${st.h}`, st.y + 0.5);
    const lane = s.add.graphics();
    lane.fillStyle(0xffd36a, 0.08).fillRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.lineStyle(2, 0xffd36a, 0.9).strokeRect(BOWLING_LANE.x, BOWLING_LANE.y, BOWLING_LANE.w, BOWLING_LANE.h);
    lane.setDepth(BOWLING_LANE.y);
    const laneText = label(BOWLING_LANE.x + BOWLING_LANE.w / 2, BOWLING_LANE.y + BOWLING_LANE.h / 2, `${TAG_WORDS.lane} ${BOWLING_LANE.w}×${BOWLING_LANE.h}`, BOWLING_LANE.y + 0.5);
    this.drawn.push(station, stationText, lane, laneText);
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
    const t = f.tag;
    this.heard.push(`${tagPhase(t, this.now())} r${t.round} [${t.players.join(',')}] h=${t.holder ?? '-'} e=${t.ended ?? '-'}${f.refused ? ` x=${f.refused}` : ''}`);
    if (this.heard.length > 10) this.heard.shift();
    if (f.refused) {
      this.joinUntil = 0;
      this.refused.push(f.refused);
      if (f.refused === 'full') this.o.toast(TAG_WORDS.full, 3500);
      else if (f.refused === 'closed') this.o.toast(TAG_WORDS.closed, 3500);
    }
    this.lookedAt = 0;
  }

  /** What the finished game earned this owl (OP-434): said, and the feathers and collection brought up to date. */
  onPrize(f: ServerTagPrize): void {
    this.prize = f;
    this.o.toast(prizeWords(f), 5000);
    this.o.prized?.(f.total, f.prize.kind === 'item' || f.prize.kind === 'furniture');
  }

  /**
   * This owl's id in the game: the room server's id for it once it has said hello (the game's players
   * are the room's ids), the page's own before that.
   */
  private me(): string {
    return this.conn?.tag?.self() ?? this.o.me();
  }

  /** Where an owl in the game stands: this owl by either of its ids, Pip where the clock has Pip, another by the room's id for it. */
  private posOf(id: string): Vec2 | null {
    if (isStandIn(id)) {
      const g = tagAt(this.game, this.now());
      return g.players.includes(id) ? standInAt(g, this.now()) : null;
    }
    return this.o.posOf(id === this.me() ? this.o.me() : id);
  }

  private mine(g: TagState): boolean {
    return g.players.includes(this.me());
  }

  /** Called every frame: passes the feather on a touch, and shows it all. */
  update(time: number): void {
    const me = this.me();
    const pos = this.posOf(me);
    const now = this.now();
    const g = tagAt(this.game, now);
    // A Start or Join the room has not answered (its frame lost to a dropped line): asked again while it can still be.
    if (now < this.joinUntil) {
      const phase = tagPhase(g, now);
      if (this.mine(g) || (phase !== 'waiting' && phase !== 'call')) this.joinUntil = 0;
      else if (now - this.askedJoin >= ASK_AGAIN_MS) {
        this.askedJoin = now;
        this.conn?.tag?.send('join');
      }
    }
    if (pos && time - this.lookedAt >= LOOK_EVERY_MS) {
      this.lookedAt = time;
      const target = this.touching(g, me, pos, now);
      if (target && now - this.askedPass >= PASS_AGAIN_MS) this.pass(target);
    }
    this.show(g, me, now);
    if (this.btn && time - this.placedAt >= LOOK_EVERY_MS) {
      this.placedAt = time;
      this.placeButton();
    }
  }

  /** The button under an activity card showing in its corner, or at its own place (OP-466, tagButtonTop). */
  private placeButton(): void {
    const btn = this.btn;
    if (!btn) return;
    const cards = this.o.hudRoot()?.querySelector<HTMLElement>('.cards');
    const top = tagButtonTop(cards && cards.offsetParent ? { top: cards.offsetTop, height: cards.offsetHeight } : null);
    const want = top === null ? '' : `${top}px`;
    if (btn.style.top !== want) btn.style.top = want;
  }

  /** Start a game, or join the one calling (OP-434): from the button or the station. */
  join(): void {
    const link = this.conn?.tag;
    // With no room server to ask (the park could not connect, or the local park), every press says so
    // in the line Play and Talk use (OP-434, OP-407's pattern), never nothing.
    if (!link || !roomReachable(link)) {
      this.joinUntil = 0;
      this.o.toast(ROOM_DOWN, 3200);
      return;
    }
    const now = this.now();
    if (now - this.askedJoin < ASK_AGAIN_MS / 3) return;
    this.askedJoin = now;
    this.joinUntil = now + JOIN_KEEP_MS;
    link.send('join');
  }

  /** The owl the feather would pass to now: holding it in a live round, another owl in the game this owl's feet touch. */
  private touching(g: TagState, me: string, pos: Vec2, now: number): string | null {
    if (tagPhase(g, now) !== 'live' || g.holder !== me) return null;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of g.players) {
      if (id === me || (g.from === id && now - g.passedAt < TAG_BACK_MS)) continue;
      const p = this.posOf(id);
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
    const me = this.me();
    const pos = this.posOf(me);
    const now = this.now();
    const g = tagAt(this.game, now);
    if (!pos || id === me || g.holder !== me || tagPhase(g, now) !== 'live') return false;
    if (g.from === id && now - g.passedAt < TAG_BACK_MS) return false;
    const p = this.posOf(id);
    if (!p || !g.players.includes(id) || !tagTouches(pos, p)) return false;
    this.pass(id);
    return true;
  }

  /** What the button says now ('' for none): Start with no game on, Join during the call, to an owl not in it. */
  private buttonWords(g: TagState, now: number): string {
    if (this.mine(g)) return '';
    const phase = tagPhase(g, now);
    if (phase === 'waiting') return TAG_WORDS.start;
    if (phase === 'call') return `${TAG_WORDS.join} · ${Math.max(1, Math.ceil((g.callEndsAt - now) / 1000))}s`;
    return '';
  }

  /** What the owl can do where it stands: pass the feather, holding it and touching another owl; at the station, start or join. */
  actions(pos: Vec2): TagAction[] {
    const me = this.me();
    const now = this.now();
    const g = tagAt(this.game, now);
    const target = this.touching(g, me, pos, now);
    if (target) return [{ id: 'tag:pass', label: TAG_WORDS.pass, run: () => this.pass(target) }];
    if (!atTagStation(pos) || this.mine(g)) return [];
    const phase = tagPhase(g, now);
    if (phase === 'waiting') return [{ id: 'tag:start', label: TAG_WORDS.start, run: () => this.join() }];
    if (phase === 'call') return [{ id: 'tag:join', label: TAG_WORDS.join, run: () => this.join() }];
    return [];
  }

  /** What to say now, to this owl. */
  private words(g: TagState, me: string, now: number): string {
    const phase = tagPhase(g, now);
    // An owl not in the game hears only the call to join; the button under the line is how it joins.
    if (!this.mine(g)) return phase === 'call' ? TAG_WORDS.calling(Math.max(1, Math.ceil((g.callEndsAt - now) / 1000))) : '';
    const pip = g.players.includes(TAG_STANDIN);
    if (phase === 'call') return TAG_WORDS.joined(Math.max(1, Math.ceil((g.callEndsAt - now) / 1000)), realPlayers(g).length);
    if (phase === 'countdown') {
      const n = Math.max(1, Math.ceil((g.startsAt - now) / 1000));
      return g.holder === me ? `${TAG_WORDS.countdown(n)} ${TAG_WORDS.youStart}` : TAG_WORDS.countdown(n);
    }
    const score = `${TAG_WORDS.score(g.passes, g.holders.length)} = ${tagScore(g)}`;
    if (phase === 'live') {
      const left = Math.max(0, Math.ceil((g.endsAt - now) / 1000));
      const say = g.holder === me ? TAG_WORDS.youHave : pip && isStandIn(g.holder) ? TAG_WORDS.pipHas : TAG_WORDS.theyHave;
      return `${say} · ${left}s · ${score}`;
    }
    if (g.ended === 'left') return TAG_WORDS.holderLeft;
    return tagScore(g) > 0 ? `${TAG_WORDS.over(tagScore(g))} (${score})` : TAG_WORDS.noPoints;
  }

  /** Pip drawn where the clock has Pip while standing in, and sent home after (OP-426); told once a page. */
  private showPip(g: TagState, now: number): void {
    const playing = g.players.includes(TAG_STANDIN);
    if (playing) {
      this.o.standIn?.(TAG_STANDIN, standInAt(g, now));
      if (!this.pipShown && this.mine(g) && realPlayers(g).length === 1 && !this.toldPip) {
        this.toldPip = true;
        this.o.toast(TAG_WORDS.standIn, 3500);
      }
    } else if (this.pipShown) this.o.standIn?.(TAG_STANDIN, null);
    this.pipShown = playing;
  }

  private show(g: TagState, me: string, now: number): void {
    this.showPip(g, now);
    const phase = tagPhase(g, now);
    this.setLine(this.words(g, me, now), this.mine(g) && g.holder === me && (phase === 'countdown' || phase === 'live'));
    this.setButton(this.buttonWords(g, now), phase === 'call');
    // The feather over the head of whoever holds it, from the countdown on; over the one left holding it once the round is over.
    const who = phase === 'over' ? g.left : phase === 'countdown' || phase === 'live' ? g.holder : null;
    const at = who ? this.posOf(who) : null;
    if (at) {
      const bob = Math.sin(now / 180) * 4;
      this.feather.setPosition(at.x + 18, at.y - 96 + bob).setVisible(true);
      this.feather.setAlpha(phase === 'countdown' ? 0.55 + 0.45 * Math.abs(Math.sin(now / 150)) : 1);
    } else this.feather.setVisible(false);
  }

  private style(): void {
    if (styled) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }

  private setLine(text: string, you: boolean): void {
    if (text === this.lineText && you === this.lineYou) return;
    this.lineText = text;
    this.lineYou = you;
    if (!text) {
      this.line?.remove();
      this.line = null;
      return;
    }
    const root = this.o.hudRoot();
    if (!root) return;
    this.style();
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

  /** The Start or Join button at the top of the screen (OP-434's "from the menu"): anywhere in the hollow. */
  private setButton(text: string, calling: boolean): void {
    if (text === this.btnText) return;
    if (!text) {
      this.btnText = '';
      this.btn?.remove();
      this.btn = null;
      return;
    }
    const root = this.o.hudRoot();
    if (!root) return;
    this.btnText = text;
    this.style();
    if (!this.btn) {
      this.btn = document.createElement('button');
      this.btn.type = 'button';
      this.btn.className = 'tag-btn';
      this.btn.dataset['tag'] = 'join';
      this.btn.addEventListener('click', () => this.join());
      root.appendChild(this.btn);
    }
    this.btn.textContent = text;
    this.btn.classList.toggle('call', calling);
  }

  state(): TagDebug {
    const now = this.now();
    const g = tagAt(this.game, now);
    const pos = this.posOf(this.me());
    return {
      atStation: pos ? atTagStation(pos) : false,
      phase: tagPhase(g, now),
      self: this.me(),
      heard: [...this.heard],
      players: [...g.players],
      holder: g.holder,
      round: g.round,
      left: g.left,
      score: tagScore(g),
      line: this.lineText,
      button: this.btnText,
      passesAsked: this.passesAsked,
      refused: [...this.refused],
      server: !!this.conn?.tag,
      standIn: g.players.includes(TAG_STANDIN) ? standInAt(g, now) : null,
      prize: this.prize,
    };
  }

  /** The owl moves on: everything here goes with the room. Its page leaving the room takes it out of the game. */
  destroy(): void {
    if (this.pipShown) this.o.standIn?.(TAG_STANDIN, null);
    this.pipShown = false;
    for (const d of this.drawn) d.destroy();
    this.drawn.length = 0;
    this.feather.destroy();
    this.line?.remove();
    this.line = null;
    this.btn?.remove();
    this.btn = null;
  }
}
