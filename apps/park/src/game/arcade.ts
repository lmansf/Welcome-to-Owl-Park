import Phaser from 'phaser';
import {
  ARCADE_GAMES,
  ARCADE_ROOM,
  ROOM_W,
  TREE_ARCADE_ROOM,
  CABINETS,
  CABINET_OFF,
  GAMES,
  KNOCK_NEST_POINTS,
  KNOCK_SHOTS,
  WALL_SIZE,
  cabinetOf,
  hexToInt,
  isArcadeRoom,
  runFeathers,
  type ArcadeGame,
  type GameWall,
  type OwlLook,
  type OwnBests,
  type PortraitLook,
  type RoomDef,
  type RunResult,
} from '@owl-park/shared';
import { cabinetFace } from '../arcade/cabinets';
import { TREE_GROUND } from '../rooms';
import { FlapGame } from '../arcade/flap';
import { HopGame } from '../arcade/hop';
import { KnockGame, MAX_PULL, loadPhysics } from '../arcade/knock';
import type { ActivityLink } from '../collect/service';
import type { ArcadeInput } from '../ui/arcadeScreen';
import type { Hud } from '../ui/hud';
import { arcadeWouldEarn, endOfGameLine } from '../ui/spectator';
import { ARCADE_INK } from './arcadeInk';
import type { ArcadeScene, ArcadeSim } from './ArcadeScene';
import { sceneReady } from './lazyScenes';
import type { PreviewRect } from './BuilderScene';

/** A box on the arcade's painting, in room pixels. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A cabinet's look in the room: its screen, its game's title sign (the sign's art, and the box it is drawn in), and its neon colours. */
interface CabinetArt {
  screen: Box;
  title: { key: string } & Box;
  ink: string;
  glow: string;
}

/**
 * Each arcade's look (room pixels): its cabinets by spot, the score wall's board, whether the game
 * draws the cabinets themselves (the tree's cave paints only bare alcoves, OP-163), and the bays that
 * open later, each saying "Hatching Soon".
 */
interface ArcadeArt {
  cabinets: Readonly<Record<string, CabinetArt>>;
  board: Box;
  drawn: boolean;
  slots: readonly Box[];
}

/** The score wall's layout size: a board is drawn at this size and scaled to fit its frame. */
const BOARD_W = 466;
const BOARD_H = 206;

const INKS = {
  crossing: { ink: '#FF8AD0', glow: '#FF2AA1' },
  flight: { ink: '#8AF4FF', glow: '#00E5FF' },
  sling: { ink: '#CDB0FF', glow: '#8A4DFF' },
} as const;

/** The cave's cabinets stand in their alcoves on the floor, this wide and tall (room pixels). */
const CAVE_CABINET = { w: 116, h: 196 };
/** A cabinet in the cave: centred at `cx` in its alcove, its title sign over the alcove's arch (`archTop`). */
function caveCabinet(cx: number, archTop: number, key: string, size: { w: number; h: number }, ink: { ink: string; glow: string }): CabinetArt {
  const w = Math.min(size.w, 250);
  const h = Math.round((size.h * w) / size.w);
  const top = TREE_GROUND - 10 - CAVE_CABINET.h;
  return { screen: { x: cx - 44, y: top + 28, w: 88, h: 70 }, title: { key, x: Math.round(cx - w / 2), y: archTop - 14 - h, w, h }, ...ink };
}

const ARCADE_ART: Readonly<Record<string, ArcadeArt>> = {
  // Today's hall: the cabinets are painted, each sign on the blank panel over its cabinet.
  [ARCADE_ROOM]: {
    cabinets: {
      'cabinet-crossing': { screen: { x: 594, y: 428, w: 116, h: 106 }, title: { key: 'arcade-title-hoot-hop', x: 618, y: 176, w: 364, h: 114 }, ...INKS.crossing },
      'cabinet-flight': { screen: { x: 1798, y: 450, w: 128, h: 92 }, title: { key: 'arcade-title-moon-flap', x: 1813, y: 143, w: 251, h: 115 }, ...INKS.flight },
      'cabinet-sling': { screen: { x: 3906, y: 410, w: 138, h: 116 }, title: { key: 'arcade-title-talon-toss', x: 3900, y: 146, w: 280, h: 110 }, ...INKS.sling },
    },
    // Inside the frame of the board on the hall's middle wall.
    board: { x: 2322, y: 182, w: BOARD_W, h: BOARD_H },
    drawn: false,
    slots: [],
  },
  // Level 0's cave (OP-163): a cabinet in each screen's alcove, the board in the middle screen's chrome
  // panel, and the last screen's two small alcoves.
  [TREE_ARCADE_ROOM]: {
    cabinets: {
      'cabinet-crossing': caveCabinet(800, 520, 'arcade-title-hoot-hop', { w: 364, h: 114 }, INKS.crossing),
      'cabinet-flight': caveCabinet(ROOM_W + 1225, 490, 'arcade-title-moon-flap', { w: 251, h: 115 }, INKS.flight),
      'cabinet-sling': caveCabinet(2 * ROOM_W + 585, 475, 'arcade-title-talon-toss', { w: 280, h: 110 }, INKS.sling),
    },
    board: { x: ROOM_W + 644, y: 322, w: 318, h: Math.round((BOARD_H * 318) / BOARD_W) },
    drawn: true,
    slots: [
      { x: 2 * ROOM_W + 950, y: 600, w: 80, h: 115 },
      { x: 2 * ROOM_W + 1082, y: 600, w: 78, h: 115 },
    ],
  },
};

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** A run past the owl's best tells the room its score at most this often (OP-137). */
const RECORD_EVERY_MS = 1000;

const HOP_GOAL = 'Hop to the top of the street, level after level. Mind the carts, the drones and the bats, and cross the rivers on the logs.';
const KNOCK_GOAL = `Knock the crates and the nest to the ground: three targets, ${KNOCK_SHOTS} shots at each. A crate is worth a point, the nest ${KNOCK_NEST_POINTS}.`;

/** How to play, under each game's field, on a touch screen and on a keyboard. Visitor-facing. */
const HINTS: Readonly<Record<ArcadeGame, { touch: string; keys: string }>> = {
  crossing: { touch: 'Flick the stick to hop', keys: 'Arrow keys to hop' },
  flight: { touch: 'Tap to flap', keys: 'Space to flap' },
  sling: { touch: 'Pull the stick, let go', keys: 'Pull back and let go, or aim with the arrows and press Space' },
};

/**
 * What a game is for, in a visitor's terms: the first line of each how-to card. Visitor-facing. Each
 * game is played by one owl against the day's best on the wall; it used to say the game was played
 * "with whoever is in the park right now", which it is not (OP-345).
 */
export const ARCADE_JOB = "A quick game for one owl. Beat today's best and your score goes up on the wall.";

/** How to play, on a card before a game's first run on this device (OP-137). Visitor-facing. */
const HOW_TO: Readonly<Record<ArcadeGame, { touch: readonly string[]; keys: readonly string[] }>> = {
  crossing: {
    touch: [ARCADE_JOB, HOP_GOAL, 'Flick the stick to hop up, down, left or right, or swipe the screen. Three lives.'],
    keys: [ARCADE_JOB, HOP_GOAL, 'The arrow keys or WASD hop up, down, left or right. Three lives.'],
  },
  flight: {
    touch: [ARCADE_JOB, 'Fly through the gaps between the branches.', 'Tap to flap. A branch or the ground ends the run.'],
    keys: [ARCADE_JOB, 'Fly through the gaps between the branches.', 'Press Space to flap, or click. A branch or the ground ends the run.'],
  },
  sling: {
    touch: [ARCADE_JOB, KNOCK_GOAL, 'Pull the stick back to aim (the dots show where the owl will fly) and let go to launch. You can pull back on the screen too.'],
    keys: [ARCADE_JOB, KNOCK_GOAL, 'Pull back on the screen and let go. Or use the keys: Up and Down aim, Left and Right set how hard, and Space launches.'],
  },
};

/** Whether this device plays by touch (a phone or a tablet): its hints and how-to say so. */
const byTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

/** What the arcade needs of the room it is in. */
export interface ArcadeHost {
  scene: Phaser.Scene;
  hud: Hud;
  /** The room's activities (null until connected). */
  acts(): ActivityLink | null;
  look(): OwlLook;
  /** The feather balance changed. */
  feathers(total: number): void;
  /** A spectator's Get a Day Ticket (OP-191): the turnstiles' sale, with this line above the card before the store. */
  offerTicket(line: string): void;
}

/** A run under way at a cabinet: its game, its seed, and its result once the room took it. */
interface Run {
  game: ArcadeGame;
  seed: number;
  sim: ArcadeSim;
  /** Sent to the room (once). */
  sent: boolean;
  /** The best score this run told the room as it went, and when (OP-137). */
  recorded: number;
  recordedAt: number;
}

/** A shrunken owl's face in its own colours: the portraits on the score wall (no names anywhere). */
export function drawPortrait(g: Phaser.GameObjects.Graphics, x: number, y: number, look: PortraitLook, r = 9): void {
  const body = hexToInt(look.body);
  const belly = hexToInt(look.belly);
  const accent = hexToInt(look.accent);
  // Ear tufts for the owls that have them.
  if (!look.species || look.species === 'great-horned' || look.species === 'screech') {
    g.fillStyle(body, 1);
    g.fillTriangle(x - r * 0.9, y - r * 0.3, x - r * 0.35, y - r * 0.8, x - r * 0.95, y - r * 1.35);
    g.fillTriangle(x + r * 0.9, y - r * 0.3, x + r * 0.35, y - r * 0.8, x + r * 0.95, y - r * 1.35);
  }
  g.fillStyle(body, 1).fillCircle(x, y, r);
  g.fillStyle(belly, 1).fillEllipse(x, y + r * 0.15, r * 1.5, r * 1.3);
  g.fillStyle(0x0c1e36, 1).fillCircle(x - r * 0.36, y - r * 0.05, r * 0.24).fillCircle(x + r * 0.36, y - r * 0.05, r * 0.24);
  g.fillStyle(accent, 1).fillTriangle(x - r * 0.16, y + r * 0.22, x + r * 0.16, y + r * 0.22, x, y + r * 0.55);
}

/**
 * Neon Roost, the arcade (C40), in the room: each cabinet's title sign over its bay (or, switched off,
 * a dark screen reading "Hatching Soon" and no sign), the score wall on the board in the middle of the
 * hall, and a run of a game from Play at a cabinet to what it paid. The game itself is drawn by
 * ArcadeScene over the room, in the HUD's arcade screen; the room server (or the local mode) starts
 * each run and pays it.
 */
export class Arcade {
  private readonly walls = new Map<ArcadeGame, GameWall>();
  private mine: OwnBests = {};
  private readonly wallLayer: Phaser.GameObjects.Container;
  private readonly portraits: Phaser.GameObjects.Graphics;
  private run: Run | null = null;
  private frameRect: PreviewRect | null = null;
  private destroyed = false;

  constructor(
    private readonly host: ArcadeHost,
    private readonly art: ArcadeArt = ARCADE_ART[ARCADE_ROOM]!,
  ) {
    const { scene } = host;
    for (const cabinet of CABINETS) {
      const look = art.cabinets[cabinet.spot];
      if (!look) continue;
      const face = cabinetFace(cabinet);
      const { title, screen } = look;
      if (art.drawn) drawCabinet(scene, look, face.off);
      if (!face.off) {
        // The game's painted sign, or until it ships, its name in neon on the panel.
        if (scene.textures.exists(title.key)) scene.add.image(title.x, title.y, title.key).setOrigin(0).setDisplaySize(title.w, title.h).setDepth(2);
        else
          scene.add
            .text(title.x + title.w / 2, title.y + title.h / 2, face.text, { fontFamily: FONT, fontSize: '40px', fontStyle: '800', color: look.glow, stroke: '#05060d', strokeThickness: 6, resolution: 2 })
            .setOrigin(0.5)
            .setShadow(0, 0, look.glow, 14, true, true)
            .setDepth(3);
        continue;
      }
      scene.add.graphics().fillStyle(0x05060d, 0.88).fillRoundedRect(screen.x, screen.y, screen.w, screen.h, 10).setDepth(2);
      scene.add
        .text(screen.x + screen.w / 2, screen.y + screen.h / 2, face.text, { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: look.ink, align: 'center', lineSpacing: 2, resolution: 2 })
        .setOrigin(0.5)
        .setShadow(0, 0, look.glow, 10, false, true)
        .setDepth(3);
    }
    // The bays that open later, each dark and saying so.
    for (const slot of art.slots)
      scene.add
        .text(slot.x + slot.w / 2, slot.y + slot.h / 2, CABINET_OFF.replace(' ', '\n'), { fontFamily: FONT, fontSize: '15px', fontStyle: '700', color: '#F6F1E3', align: 'center', lineSpacing: 2, resolution: 2 })
        .setOrigin(0.5)
        .setAlpha(0.7)
        .setShadow(0, 0, '#00E5FF', 8, false, true)
        .setDepth(3);
    // The wall is laid out at its own size and scaled into the board's frame.
    this.wallLayer = scene.add.container(art.board.x, art.board.y).setScale(art.board.w / BOARD_W).setDepth(3);
    this.portraits = scene.add.graphics();
    this.wallLayer.add(this.portraits);
    for (const game of ARCADE_GAMES) this.walls.set(game, { game, top: [] });
    this.renderWall();
  }

  /** The wall as the room sent it: every column and the owl's own bests on arrival, or a column that changed. */
  onWall(walls: GameWall[], mine: OwnBests | null): void {
    for (const w of walls) this.walls.set(w.game, w);
    if (mine) this.mine = { ...mine };
    this.renderWall();
  }

  private renderWall(): void {
    if (this.destroyed) return;
    const { scene } = this.host;
    for (const child of [...this.wallLayer.list]) if (child !== this.portraits) child.destroy();
    this.portraits.clear();
    const col = BOARD_W / ARCADE_GAMES.length;
    const text = (x: number, y: number, s: string, size: number, color: string, alpha = 1) => {
      const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, resolution: 2 }).setOrigin(0.5).setAlpha(alpha);
      this.wallLayer.add(t);
      return t;
    };
    ARCADE_GAMES.forEach((game, i) => {
      const cx = col * i + col / 2;
      const art = this.art.cabinets[cabinetOf(game).spot]!;
      // Each column's game in its cabinet's light ink, glowing in its neon (the neon itself is too dark to read on the board).
      text(cx, 20, GAMES[game].name, 18, art.ink).setShadow(0, 0, art.glow, 8, false, true);
      text(cx, 42, "Today's best", 12, '#F6F1E3', 0.75);
      const top = this.walls.get(game)?.top ?? [];
      for (let k = 0; k < WALL_SIZE; k++) {
        const y = 68 + k * 26;
        const e = top[k];
        if (!e) {
          text(cx, y, '·', 16, '#F6F1E3', 0.3);
          continue;
        }
        drawPortrait(this.portraits, cx - 26, y, e.look, 10);
        this.wallLayer.add(scene.add.text(cx - 10, y, String(e.score), { fontFamily: FONT, fontSize: '18px', fontStyle: '800', color: '#F6F1E3', resolution: 2 }).setOrigin(0, 0.5));
      }
      const own = this.mine[game];
      if (own !== undefined) text(cx, BOARD_H - 10, `Your best ${own}`, 12, art.ink);
    });
  }

  /** Play at a cabinet: the room starts a run, the HUD's arcade screen opens, and the game begins. */
  async play(game: ArcadeGame): Promise<void> {
    const acts = this.host.acts();
    if (!acts || this.destroyed) return;
    const physics = game === 'sling' ? loadPhysics().catch(() => null) : null;
    // The games' scene, fetched alongside the room's answer the first time (OP-204).
    const scene = sceneReady(this.host.scene.scene, 'arcade').then(
      () => true,
      () => false,
    );
    const reply = await acts.run(game);
    if (this.destroyed) return;
    if (!reply.ok) {
      const line = reply.reason === 'far' ? 'Stand at the cabinet to play.' : reply.reason === 'unknown' ? CABINET_OFF : 'The park did not catch that. Try again in a moment.';
      this.host.hud.toast(line);
      this.host.hud.closeArcade();
      return;
    }
    const ready = await scene;
    if (this.destroyed) return;
    if (!ready) {
      this.host.hud.toast('The park did not catch that. Try again in a moment.');
      this.host.hud.closeArcade();
      return;
    }
    let sim: ArcadeSim;
    if (game === 'sling') {
      // Talon Toss's physics engine, fetched alongside the room's answer (only that game uses it).
      const M = await physics;
      if (this.destroyed) return;
      if (!M) {
        this.host.hud.toast('The park did not catch that. Try again in a moment.');
        this.host.hud.closeArcade();
        return;
      }
      sim = new KnockGame(M);
    } else sim = game === 'crossing' ? new HopGame(reply.seed) : new FlapGame(reply.seed);
    this.run = { game, seed: reply.seed, sim, sent: false, recorded: 0, recordedAt: 0 };
    const top = this.walls.get(game)?.top[0]?.score ?? null;
    this.host.hud.openArcade(
      { game, name: GAMES[game].name, colour: ARCADE_INK[game].css, hint: HINTS[game][byTouch() ? 'touch' : 'keys'], howTo: HOW_TO[game][byTouch() ? 'touch' : 'keys'], top, best: this.mine[game] ?? null },
      {
        input: (i) => this.input(i),
        frame: (rect) => this.frame(rect),
        again: () => void this.play(game),
        pause: (on) => (this.host.scene.scene.get('arcade') as ArcadeScene | null)?.setPaused(on),
      },
    );
    const view = this.view();
    view.play(sim, this.host.look(), (s) => this.step(s));
    if (this.frameRect) view.frame(this.frameRect);
  }

  /**
   * The game's scene, started over the room if it is not running. Its field covers the whole screen,
   * so the room stops drawing under it (it still runs: the owls, the doors, the wall): on a slow
   * device that halves what each frame paints.
   */
  private view(): ArcadeScene {
    const plugin = this.host.scene.scene;
    if (!plugin.isActive('arcade')) plugin.run('arcade');
    plugin.setVisible(false);
    return plugin.get('arcade') as ArcadeScene;
  }

  /** The game's scene stopped, and the room drawn again. */
  private stopView(): void {
    const plugin = this.host.scene.scene;
    if (plugin.isActive('arcade')) plugin.stop('arcade');
    plugin.setVisible(true);
  }

  private frame(rect: PreviewRect | null): void {
    this.frameRect = rect;
    if (!rect) {
      // The screen closed: the run is left where it was (the room forgets it with the next one).
      this.run = null;
      this.stopView();
      return;
    }
    (this.host.scene.scene.get('arcade') as ArcadeScene | null)?.frame(rect);
  }

  private input(i: ArcadeInput): void {
    const sim = this.run?.sim;
    if (!sim || sim.over) return;
    if (i.kind === 'hop') {
      if (sim.game === 'crossing') sim.hopTo(i.dir);
      return;
    }
    if (i.kind === 'tap') {
      if (sim.game !== 'sling') sim.tap();
      return;
    }
    if (sim.game !== 'sling') return;
    if (i.kind === 'aim') sim.aimByPull(i.dx, i.dy);
    else if (i.kind === 'pull') sim.aimByPull(i.x * MAX_PULL, i.y * MAX_PULL);
    else if (i.kind === 'nudge') sim.nudge(i.angle, i.power);
    else sim.release();
  }

  /** Every frame of a run: the score on the screen, a new best kept as it comes, and once it is over, its result to the room. */
  private step(sim: ArcadeSim): void {
    const run = this.run;
    if (!run || run.sim !== sim) return;
    this.host.hud.arcadePlaying(sim.score, sim.game === 'flight' ? '' : sim.banner);
    if (sim.over && !run.sent) {
      run.sent = true;
      void this.finish(run);
    } else if (!sim.over) this.keepBest(run);
  }

  /**
   * A run past the owl's best of the day tells the room its score as it goes (at most once a
   * RECORD_EVERY_MS), so the best is on the wall even if this page never sees the run end (OP-137).
   */
  private keepBest(run: Run): void {
    const score = run.sim.score;
    const now = Date.now();
    if (score <= (this.mine[run.game] ?? 0) || score <= run.recorded || now - run.recordedAt < RECORD_EVERY_MS) return;
    run.recorded = score;
    run.recordedAt = now;
    const result: RunResult = run.sim.game === 'sling' ? { game: run.game, score, shots: run.sim.shots } : { game: run.game, score };
    void this.host
      .acts()
      ?.record(result, run.seed)
      .then((reply) => {
        if (reply.ok && !this.destroyed) this.onWall([reply.wall], reply.mine);
      })
      .catch(() => undefined);
  }

  private async finish(run: Run): Promise<void> {
    const { sim, game } = run;
    const result: RunResult = sim.game === 'sling' ? { game, score: sim.score, shots: sim.shots } : { game, score: sim.score };
    const line = sim.overLine();
    const reply = await this.host.acts()?.score(result, run.seed);
    if (this.destroyed || this.run !== run) return;
    if (!reply?.ok) {
      this.host.hud.arcadeResult({ line, feathers: null, newBest: false, best: this.mine[game] ?? null, note: 'The park did not catch that run.' });
      return;
    }
    const paid = reply.paid;
    this.host.feathers(paid.total);
    this.onWall([paid.wall], paid.mine);
    if (paid.practice) {
      // A spectator's run (OP-191): it paid nothing; what it would have with a Day Ticket, and the offer before Play again.
      const offer = endOfGameLine(arcadeWouldEarn(game, paid.score));
      this.host.hud.arcadeResult({ line, feathers: null, newBest: false, best: paid.mine[game] ?? null, offer: { line: offer, get: () => this.host.offerTicket(offer) } });
      return;
    }
    const capped = paid.added < runFeathers(game, paid.score);
    this.host.hud.arcadeResult({
      line,
      feathers: paid.added,
      newBest: paid.best,
      best: paid.mine[game] ?? null,
      ...(capped ? { note: 'No more feathers from games today.' } : {}),
    });
  }

  /** The run as tests see it (the game itself, to play it by its rules), whether it is drawn from its paintings, and Moon Flap's owl as drawn. */
  debug(): { game: ArcadeGame; seed: number; sim: ArcadeSim; sent: boolean; recorded: number; painted: boolean; flight: ReturnType<ArcadeScene['flightDrawn']> } | null {
    const view = this.host.scene.scene.get('arcade') as ArcadeScene | null;
    return this.run ? { ...this.run, painted: view?.isPainted() ?? false, flight: view?.flightDrawn() ?? null } : null;
  }

  /** The wall as it stands, for tests. */
  wall(): { walls: GameWall[]; mine: OwnBests } {
    return { walls: ARCADE_GAMES.map((g) => this.walls.get(g)!), mine: { ...this.mine } };
  }

  destroy(): void {
    this.destroyed = true;
    this.run = null;
    this.stopView();
  }
}

/**
 * A cabinet the game draws in its alcove (the tree's cave, OP-163): a dark body edged in its game's neon,
 * a marquee strip, the screen's frame, and the stick and buttons on its panel. A cabinet switched off
 * keeps its body and a dim edge.
 */
function drawCabinet(scene: Phaser.Scene, look: CabinetArt, off: boolean): void {
  const glow = hexToInt(look.glow);
  const { w, h } = CAVE_CABINET;
  const cx = look.screen.x + look.screen.w / 2;
  const x = cx - w / 2;
  const y = TREE_GROUND - 10 - h;
  const g = scene.add.graphics().setDepth(2);
  g.fillStyle(0x0b0d1c, 1).fillRoundedRect(x, y, w, h, { tl: 18, tr: 18, bl: 4, br: 4 });
  g.lineStyle(3, glow, off ? 0.35 : 0.95).strokeRoundedRect(x, y, w, h, { tl: 18, tr: 18, bl: 4, br: 4 });
  g.fillStyle(glow, off ? 0.15 : 0.55).fillRect(x + 12, y + 10, w - 24, 10);
  g.lineStyle(2, 0xc7ceda, 0.8).strokeRoundedRect(look.screen.x - 4, look.screen.y - 4, look.screen.w + 8, look.screen.h + 8, 8);
  if (!off) g.fillStyle(glow, 0.22).fillRoundedRect(look.screen.x, look.screen.y, look.screen.w, look.screen.h, 6);
  const panel = look.screen.y + look.screen.h + 18;
  g.fillStyle(0x161a30, 1).fillRect(x + 8, panel, w - 16, 26);
  g.fillStyle(0xc7ceda, 1).fillRect(cx - 30, panel - 6, 4, 14);
  g.fillStyle(glow, 1).fillCircle(cx - 28, panel - 8, 6);
  g.fillCircle(cx + 14, panel + 13, 5).fillCircle(cx + 30, panel + 13, 5);
}

/** The arcade, for its rooms only: today's hall and the tree's cave. */
export function arcadeFor(room: RoomDef, host: ArcadeHost): Arcade | null {
  const art = isArcadeRoom(room.id) ? ARCADE_ART[room.id] : undefined;
  return art ? new Arcade(host, art) : null;
}
