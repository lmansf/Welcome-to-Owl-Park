import Phaser from 'phaser';
import {
  ARCADE_GAMES,
  ARCADE_ROOM,
  CABINETS,
  CABINET_OFF,
  GAMES,
  WALL_SIZE,
  cabinetOf,
  hexToInt,
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
import { FlapGame } from '../arcade/flap';
import { HopGame } from '../arcade/hop';
import { KnockGame } from '../arcade/knock';
import type { ActivityLink } from '../collect/service';
import type { ArcadeInput } from '../ui/arcadeScreen';
import type { Hud } from '../ui/hud';
import { ARCADE_INK, type ArcadeScene, type ArcadeSim } from './ArcadeScene';
import type { PreviewRect } from './BuilderScene';

/** A box on the arcade's painting, in room pixels. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Each cabinet on the arcade's painting (room pixels): its screen, its game's title sign on the blank
 * panel above it (the sign's art, and the box it is drawn in), and its neon colours.
 */
const CABINET_ART: Readonly<Record<string, { screen: Box; title: { key: string } & Box; ink: string; glow: string }>> = {
  'cabinet-crossing': { screen: { x: 594, y: 428, w: 116, h: 106 }, title: { key: 'arcade-title-hoot-hop', x: 618, y: 176, w: 364, h: 114 }, ink: '#FF8AD0', glow: '#FF2AA1' },
  'cabinet-flight': { screen: { x: 1798, y: 450, w: 128, h: 92 }, title: { key: 'arcade-title-moon-flap', x: 1813, y: 143, w: 251, h: 115 }, ink: '#8AF4FF', glow: '#00E5FF' },
  'cabinet-sling': { screen: { x: 3906, y: 410, w: 138, h: 116 }, title: { key: 'arcade-title-nest-knockdown', x: 3900, y: 146, w: 280, h: 110 }, ink: '#CDB0FF', glow: '#8A4DFF' },
};

/** The score wall: inside the frame of the board on the hall's middle wall (room pixels), one column per game. */
const BOARD: Box = { x: 2322, y: 182, w: 466, h: 206 };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** A run past the owl's best tells the room its score at most this often (OP-137). */
const RECORD_EVERY_MS = 1000;

/** How to play, under each game's field. Visitor-facing. */
const HINTS: Readonly<Record<ArcadeGame, string>> = {
  crossing: 'Tap to hop',
  flight: 'Tap to flap',
  sling: 'Pull back and let go',
};

/** How to play, on a card before a game's first run on this device (OP-137). Visitor-facing. */
const HOW_TO: Readonly<Record<ArcadeGame, readonly string[]>> = {
  crossing: ['Hop across the lanes to the far kerb, then back again.', 'Tap to hop. Mind the carts and the drones.'],
  flight: ['Fly through the gaps between the branches.', 'Tap to flap. A branch or the ground ends the run.'],
  sling: ['Knock the crates off their stands: ten stacks, three shots each.', 'Pull back and let go to launch.'],
};

/** What the arcade needs of the room it is in. */
export interface ArcadeHost {
  scene: Phaser.Scene;
  hud: Hud;
  /** The room's activities (null until connected). */
  acts(): ActivityLink | null;
  look(): OwlLook;
  /** The feather balance changed. */
  feathers(total: number): void;
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
 *
 * TODO-DOCS (OP-059): docs/ACTIVITIES.md (Neon Roost) has the arcade one screen wide, its cabinets
 * under the score board, and the games drawn in neon lines. Now: the hall is three screens (arcade,
 * arcade-mid, arcade-end) entered from the street at its west end, a bay per game with the game's
 * title sign over its cabinet, the score wall on the board in the middle; each game is drawn from its
 * painted field and pieces (arcade/paint.ts) once every piece has loaded, in neon lines until then.
 *
 * TODO-DOCS (OP-137): docs/ACTIVITIES.md (Neon Roost) and docs/ARCHITECTURE.md section 4: a run is
 * kept by its collector in the collections object (not on the socket), so it outlasts a dropped
 * connection; past the owl's best, the page sends `act` `record` (the score so far, at most once a
 * second) and the room keeps it as the owl's best and shows it on the wall, paying nothing, so a run
 * cut short keeps its best; the end pays as before, a new best and the day's best judged against the
 * standings as the run started. Moon Flap flaps with the pad's Interact on a touch screen, and each
 * game opens on a how-to card before its first run on a device.
 */
export class Arcade {
  private readonly walls = new Map<ArcadeGame, GameWall>();
  private mine: OwnBests = {};
  private readonly wallLayer: Phaser.GameObjects.Container;
  private readonly portraits: Phaser.GameObjects.Graphics;
  private run: Run | null = null;
  private frameRect: PreviewRect | null = null;
  private destroyed = false;

  constructor(private readonly host: ArcadeHost) {
    const { scene } = host;
    for (const cabinet of CABINETS) {
      const art = CABINET_ART[cabinet.spot];
      if (!art) continue;
      const face = cabinetFace(cabinet);
      const { title, screen } = art;
      if (!face.off) {
        // The game's painted sign, or until it ships, its name in neon on the panel.
        if (scene.textures.exists(title.key)) scene.add.image(title.x, title.y, title.key).setOrigin(0).setDisplaySize(title.w, title.h).setDepth(2);
        else
          scene.add
            .text(title.x + title.w / 2, title.y + title.h / 2, face.text, { fontFamily: FONT, fontSize: '40px', fontStyle: '800', color: art.glow, stroke: '#05060d', strokeThickness: 6, resolution: 2 })
            .setOrigin(0.5)
            .setShadow(0, 0, art.glow, 14, true, true)
            .setDepth(3);
        continue;
      }
      scene.add.graphics().fillStyle(0x05060d, 0.88).fillRoundedRect(screen.x, screen.y, screen.w, screen.h, 10).setDepth(2);
      scene.add
        .text(screen.x + screen.w / 2, screen.y + screen.h / 2, face.text, { fontFamily: FONT, fontSize: '16px', fontStyle: '700', color: art.ink, align: 'center', lineSpacing: 2, resolution: 2 })
        .setOrigin(0.5)
        .setShadow(0, 0, art.glow, 10, false, true)
        .setDepth(3);
    }
    this.wallLayer = scene.add.container(0, 0).setDepth(3);
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
    const col = BOARD.w / ARCADE_GAMES.length;
    const text = (x: number, y: number, s: string, size: number, color: string, alpha = 1) => {
      const t = scene.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, resolution: 2 }).setOrigin(0.5).setAlpha(alpha);
      this.wallLayer.add(t);
      return t;
    };
    ARCADE_GAMES.forEach((game, i) => {
      const cx = BOARD.x + col * i + col / 2;
      const art = CABINET_ART[cabinetOf(game).spot]!;
      // Each column's game in its cabinet's light ink, glowing in its neon (the neon itself is too dark to read on the board).
      text(cx, BOARD.y + 20, GAMES[game].name, 18, art.ink).setShadow(0, 0, art.glow, 8, false, true);
      text(cx, BOARD.y + 42, "Today's best", 12, '#F6F1E3', 0.75);
      const top = this.walls.get(game)?.top ?? [];
      for (let k = 0; k < WALL_SIZE; k++) {
        const y = BOARD.y + 68 + k * 26;
        const e = top[k];
        if (!e) {
          text(cx, y, '·', 16, '#F6F1E3', 0.3);
          continue;
        }
        drawPortrait(this.portraits, cx - 26, y, e.look, 10);
        this.wallLayer.add(scene.add.text(cx - 10, y, String(e.score), { fontFamily: FONT, fontSize: '18px', fontStyle: '800', color: '#F6F1E3', resolution: 2 }).setOrigin(0, 0.5));
      }
      const own = this.mine[game];
      if (own !== undefined) text(cx, BOARD.y + BOARD.h - 10, `Your best ${own}`, 12, art.ink);
    });
  }

  /** Play at a cabinet: the room starts a run, the HUD's arcade screen opens, and the game begins. */
  async play(game: ArcadeGame): Promise<void> {
    const acts = this.host.acts();
    if (!acts || this.destroyed) return;
    const reply = await acts.run(game);
    if (this.destroyed) return;
    if (!reply.ok) {
      const line = reply.reason === 'far' ? 'Stand at the cabinet to play.' : reply.reason === 'unknown' ? CABINET_OFF : 'The park did not catch that. Try again in a moment.';
      this.host.hud.toast(line);
      this.host.hud.closeArcade();
      return;
    }
    const sim: ArcadeSim = game === 'crossing' ? new HopGame(reply.seed) : game === 'flight' ? new FlapGame(reply.seed) : new KnockGame();
    this.run = { game, seed: reply.seed, sim, sent: false, recorded: 0, recordedAt: 0 };
    const top = this.walls.get(game)?.top[0]?.score ?? null;
    this.host.hud.openArcade(
      { game, name: GAMES[game].name, colour: ARCADE_INK[game].css, hint: HINTS[game], howTo: HOW_TO[game], top, best: this.mine[game] ?? null },
      {
        input: (i) => this.input(i),
        frame: (rect) => this.frame(rect),
        again: () => void this.play(game),
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
    if (i.kind === 'tap') {
      if (sim.game !== 'sling') sim.tap();
      return;
    }
    if (sim.game !== 'sling') return;
    if (i.kind === 'aim') sim.aimByPull(i.dx, i.dy);
    else if (i.kind === 'nudge') sim.nudge(i.angle, i.power);
    else sim.release();
  }

  /** Every frame of a run: the score on the screen, a new best kept as it comes, and once it is over, its result to the room. */
  private step(sim: ArcadeSim): void {
    const run = this.run;
    if (!run || run.sim !== sim) return;
    this.host.hud.arcadePlaying(sim.score, sim.game === 'sling' ? sim.banner : '');
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
    const capped = paid.added < runFeathers(game, paid.score);
    this.host.hud.arcadeResult({
      line,
      feathers: paid.added,
      newBest: paid.best,
      best: paid.mine[game] ?? null,
      ...(capped ? { note: 'No more feathers from games today.' } : {}),
    });
  }

  /** The run as tests see it (the game itself, to play it by its rules), and whether it is drawn from its paintings. */
  debug(): { game: ArcadeGame; seed: number; sim: ArcadeSim; sent: boolean; recorded: number; painted: boolean } | null {
    const view = this.host.scene.scene.get('arcade') as ArcadeScene | null;
    return this.run ? { ...this.run, painted: view?.isPainted() ?? false } : null;
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

/** The arcade, for its room only. */
export function arcadeFor(room: RoomDef, host: ArcadeHost): Arcade | null {
  return room.id === ARCADE_ROOM ? new Arcade(host) : null;
}
