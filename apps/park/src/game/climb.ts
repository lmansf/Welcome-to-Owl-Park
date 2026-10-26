import type Phaser from 'phaser';
import {
  BAND_COUNT,
  CLIMB_SLACK_MS,
  LAYOUTS,
  NIGHTS,
  NO_INPUT,
  OWL_W,
  PLAY_FEATHERS_PER_DAY,
  leastClimbMs,
  moveBetween,
  pilotFor,
  pilotInput,
  platforms,
  roadPlatforms,
  waitToLaunch,
  type ClimbInput,
  type ClimbState,
  type Layout,
  type Ledge,
  type Night,
  type OwlLook,
  type Pilot,
  type RoomDef,
} from '@owl-park/shared';
import type { ActivityLink, ClimbReply } from '../collect/service';
import type { Hud } from '../ui/hud';
import type { PreviewRect } from './BuilderScene';
import type { ClimbScene } from './ClimbScene';

/** The realm whose portal opens the climb. */
export const CLIMB_ROOM = 'glass';
/** The approved phrase for a portal the keepers have not switched on. */
export const PORTAL_OFF = 'Pardon Our Feathers';

/** What the climb needs of the room it is in. */
export interface ClimbHost {
  scene: Phaser.Scene;
  hud: Hud;
  /** The room's activities (null until connected). */
  acts(): ActivityLink | null;
  look(): OwlLook;
  /** The realms switch's `portal`, as the room last heard it. */
  portalLive(): boolean;
  /** Calm motion is on (a setting). */
  calm(): boolean;
  /** The feather balance changed. */
  feathers(total: number): void;
  /** A collectible was granted: the collection should be read again. */
  awarded(variant: string): void;
}

/** A run under way: its key, its night, and what the room has banked and paid so far. */
interface Run {
  seed: number;
  startedAt: number;
  night: Night;
  layout: Layout;
  banked: number;
  /** The highest band sent to the room (answered or not). */
  sent: number;
  /** A band the room never answered, sent again with the next one or on reconnect. */
  unanswered: number | null;
  /** A band the room refused as too fast, tried once more when its floor has passed. */
  retry: ReturnType<typeof setTimeout> | null;
  added: number;
  ref: string | null;
  over: boolean;
  /** The hints given, so each verb is taught once. */
  taught: Set<string>;
  /** The scripted climber at the controls (the browser tests), or null for the visitor's own. */
  auto: Autopilot | null;
  hintTimer: ReturnType<typeof setTimeout> | null;
}

const COARSE = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/** An obstacle's hint stays this long. */
const HINT_MS = 5000;
/** The autopilot rests this long on each balcony, as a visitor on the stairs would: the brisk feather is the high road's. */
const AUTO_REST_MS = 1500;

/**
 * The scripted climber at the controls, for the browser tests (window.owlPark.climbAuto): it takes
 * the stairs with the shared pilot, waiting out the lanterns and the gusts as the floor test does.
 */
class Autopilot {
  private pilot: Pilot | null = null;
  private restUntil = 0;
  constructor(private readonly layout: Layout, private readonly night: Night) {}
  input(s: ClimbState): ClimbInput {
    const all = platforms(this.layout);
    if (this.pilot) {
      const to = this.pilot.move.to;
      const onTarget = s.grounded && Math.abs(s.y - to.y) < 0.5 && s.x - OWL_W / 2 < to.x + to.w && s.x + OWL_W / 2 > to.x;
      const lost = s.stunMs > 0 || (s.grounded && this.pilot.phase > 0 && Math.abs(s.y - to.y) >= 0.5);
      if (onTarget || lost) {
        this.pilot = null;
        if (onTarget && to.w >= this.layout.start.w) this.restUntil = s.t + AUTO_REST_MS;
      } else return pilotInput(s, this.pilot);
    }
    if (!s.grounded || s.t < this.restUntil) return NO_INPUT;
    const standing = all.find((p) => Math.abs(p.y - s.y) < 0.5 && s.x - OWL_W / 2 < p.x + p.w && s.x + OWL_W / 2 > p.x);
    const road = roadPlatforms(this.layout, 'stairs');
    const next = road.find((p) => p.y > s.y + 0.5);
    if (!standing || !next) return NO_INPUT;
    const move = moveBetween(standing, next);
    this.pilot = pilotFor(standing, move, waitToLaunch(s, standing, move, this.layout, this.night, all) ?? 0);
    return pilotInput(s, this.pilot);
  }
}

/**
 * The stained-glass climb in its room (designs/the-stained-glass-climb.md): Climb at the portal
 * asks the room for a run (or the open one), the HUD's climb screen opens on its card, and the
 * climb scene plays the shared simulation over the room. Each band line the owl reaches goes to
 * the room as an `ascent`, which checks it against its floor and pays it; the clouds grant the
 * realm's item once. Stop and Escape close the screen and send nothing: the run waits in the
 * room for an hour.
 *
 * TODO-DOCS: docs/ACTIVITIES.md has no climb yet; designs/the-stained-glass-climb.md is the design
 * until the doc agent writes the activity up (the realm, the portal, the bands' pay and the item).
 */
export class Climb {
  private run: Run | null = null;
  private frameRect: PreviewRect | null = null;
  private destroyed = false;

  constructor(private readonly host: ClimbHost) {}

  /** Climb, at the portal: the room starts or returns the run, and the screen opens on its card. */
  async play(): Promise<void> {
    const acts = this.host.acts();
    if (!acts || this.destroyed) return;
    if (!this.host.portalLive()) {
      this.host.hud.toast(PORTAL_OFF);
      return;
    }
    const reply = await acts.climb();
    if (this.destroyed) return;
    if (!reply.ok) {
      const line = reply.reason === 'far' ? 'Stand at the portal to climb.' : reply.reason === 'closed' ? PORTAL_OFF : 'The park did not catch that. Try again in a moment.';
      this.host.hud.toast(line);
      return;
    }
    this.open(reply);
  }

  private open(reply: Extract<ClimbReply, { ok: true }>): void {
    const night = NIGHTS[reply.night] ?? NIGHTS[reply.tier]!;
    const layout = LAYOUTS[night.layout]!;
    this.run?.retry && clearTimeout(this.run.retry);
    this.run = { seed: reply.seed, startedAt: reply.startedAt, night, layout, banked: reply.banked, sent: reply.banked, unanswered: null, retry: null, added: 0, ref: null, over: false, taught: new Set(), auto: null, hintTimer: null };
    this.host.hud.openClimb(
      { tier: reply.tier, night: reply.night, banked: reply.banked, remainingCap: reply.remainingCap, cap: PLAY_FEATHERS_PER_DAY, bestBandToday: reply.bestBandToday, resumed: reply.resumed, previousForgotten: reply.previousForgotten },
      { frame: (rect) => this.frame(rect), start: () => this.start() },
    );
  }

  /** Start pressed on the card: the scene plays from the banked band. */
  private start(): void {
    const run = this.run;
    if (!run || this.destroyed) return;
    const view = this.view();
    view.play({
      layout: run.layout,
      night: run.night,
      banked: run.banked,
      look: this.host.look(),
      input: () => {
        const auto = this.run?.auto;
        const s = auto ? (this.host.scene.scene.get('climb') as ClimbScene | null)?.snapshot() : null;
        return auto && s ? auto.input(s) : this.host.hud.climbInput();
      },
      onStep: (s) => this.step(s),
      calm: this.host.calm(),
    });
    if (this.frameRect) view.frame(this.frameRect);
    this.teach('run', COARSE() ? 'Push the stick to run, tap Jump to jump' : 'Arrows run, Space jumps');
  }

  private teach(key: string, line: string, forMs = 0): void {
    const run = this.run;
    if (!run || run.taught.has(key)) return;
    run.taught.add(key);
    this.host.hud.climbHint(line);
    if (run.hintTimer) clearTimeout(run.hintTimer);
    run.hintTimer = forMs
      ? setTimeout(() => {
          run.hintTimer = null;
          if (this.run === run) this.host.hud.climbHint('');
        }, forMs)
      : null;
  }

  /** The scripted climber takes or leaves the controls (the browser tests). */
  autopilot(on: boolean): boolean {
    const run = this.run;
    if (!run) return false;
    run.auto = on ? new Autopilot(run.layout, run.night) : null;
    return true;
  }

  /** The climb's scene, started over the room if it is not running; the room stops drawing under it. */
  private view(): ClimbScene {
    const plugin = this.host.scene.scene;
    if (!plugin.isActive('climb')) plugin.run('climb');
    plugin.setVisible(false);
    return plugin.get('climb') as ClimbScene;
  }

  private stopView(): void {
    const plugin = this.host.scene.scene;
    if (plugin.isActive('climb')) plugin.stop('climb');
    plugin.setVisible(true);
  }

  private frame(rect: PreviewRect | null): void {
    this.frameRect = rect;
    if (!rect) {
      // The screen closed (Stop, Escape, the card's Close): the run waits in the room; nothing is sent.
      if (this.run?.retry) clearTimeout(this.run.retry);
      if (this.run?.hintTimer) clearTimeout(this.run.hintTimer);
      this.run = null;
      this.stopView();
      return;
    }
    (this.host.scene.scene.get('climb') as ClimbScene | null)?.frame(rect);
  }

  /** Every frame of the climb: the hints as the owl learns, and each new band line to the room. */
  private step(s: ClimbState): void {
    const run = this.run;
    if (!run || run.over) return;
    if (s.jumpsUsed >= 1 && run.taught.has('run') && !run.taught.has('double')) {
      this.host.hud.climbHint('');
      if (s.band >= 2) this.teach('double', 'Jump again in the air');
    }
    if (s.jumpsUsed === 2 && run.taught.has('double') && !run.taught.has('glide')) {
      this.host.hud.climbHint('');
      if (s.band >= 4) this.teach('glide', 'Hold Jump after the double jump to glide');
    }
    if (s.gliding && run.taught.has('glide')) this.host.hud.climbHint('');
    // The obstacles, each explained once as it first matters: the lanterns from band 3, the gusts from band 4, frail glass when stood on, a knock when it lands.
    if (s.band >= 2 && run.taught.has('double')) this.teach('lantern', 'Lanterns swing across the gaps: jump as one passes', HINT_MS);
    if (s.band >= 3 && run.taught.has('lantern')) this.teach('gust', 'The wind gusts here: jump in a lull, or lean into it', HINT_MS);
    if (s.grounded && s.stoodMs > 0 && run.layout.ledges.some((l) => l.frail && Math.abs(l.y - s.y) < 0.5 && s.x - OWL_W / 2 < l.x + l.w && s.x + OWL_W / 2 > l.x)) this.teach('frail', 'Frail glass: jump again before it gives', HINT_MS);
    if (s.stunMs > 0) this.teach('knock', 'Knocked down! Let the lantern swing past next time', HINT_MS);
    if (s.band > run.sent) void this.ascend(s.band);
  }

  /** A band line reached: to the room, with any band it never answered. */
  private async ascend(band: number): Promise<void> {
    const run = this.run;
    const acts = this.host.acts();
    if (!run || !acts || run.over) return;
    run.sent = Math.max(run.sent, band);
    const reply = await acts.ascent(run.seed, band);
    if (this.destroyed || this.run !== run) return;
    if (!reply.ok) {
      if (reply.reason === 'offline') {
        run.unanswered = Math.max(run.unanswered ?? 0, band);
        return;
      }
      if (reply.reason === 'too-fast') {
        // The room's clock says the band came too soon: ask once more when its floor has passed.
        if (run.retry) return;
        const wait = Math.max(1000, leastClimbMs(run.night, band) + CLIMB_SLACK_MS - (Date.now() - run.startedAt) + 500);
        run.retry = setTimeout(() => {
          run.retry = null;
          if (this.run === run && band > run.banked) {
            run.sent = run.banked;
            void this.ascend(band);
          }
        }, wait);
        return;
      }
      run.over = true;
      this.host.hud.climbResult({
        line: reply.reason === 'forgotten' ? 'This climb was left too long and is forgotten.' : 'The park lost track of this climb.',
        feathers: run.added > 0 ? run.added : null,
        note: reply.reason === 'forgotten' ? 'Climb again from the portal for a fresh one.' : 'Try again from the portal.',
      });
      return;
    }
    run.unanswered = null;
    run.ref = reply.ref;
    run.added += reply.added;
    run.banked = Math.max(run.banked, reply.banked);
    this.host.feathers(reply.feathers);
    this.host.hud.climbHeader(run.banked, Math.max(0, PLAY_FEATHERS_PER_DAY - reply.total));
    if (reply.item) this.host.awarded(reply.item.variant);
    if (run.banked >= BAND_COUNT) {
      run.over = true;
      this.host.hud.climbResult({
        line: reply.brisk > 0 ? 'You reached the clouds, briskly!' : 'You reached the clouds!',
        feathers: run.added,
        ...(reply.item ? { item: 'The Glass Circlet is yours.' } : reply.why === 'item-already-given' ? { item: 'The Glass Circlet is already yours.' } : {}),
        ref: reply.ref,
        ...(reply.why === 'capped' ? { note: 'No more feathers from games today.' } : reply.why === 'paid-today' ? { note: 'These storeys were paid today already.' } : {}),
      });
      return;
    }
    this.host.hud.climbBand({ band: reply.banked, added: reply.added, ...(reply.brisk > 0 ? { brisk: true } : {}), ...(reply.why ? { why: reply.why } : {}) });
  }

  /** Back online after a drop while the screen is up: the run from the room, and any band it never answered. */
  async reconnected(): Promise<void> {
    const run = this.run;
    const acts = this.host.acts();
    if (!run || !acts || run.over || this.destroyed) return;
    const reply = await acts.climb();
    if (this.destroyed || this.run !== run || !reply.ok) return;
    if (reply.seed !== run.seed) {
      run.over = true;
      this.host.hud.climbResult({ line: 'This climb was left too long and is forgotten.', feathers: run.added > 0 ? run.added : null, note: 'Climb again from the portal for a fresh one.' });
      return;
    }
    run.banked = Math.max(run.banked, reply.banked);
    this.host.hud.climbHeader(run.banked, reply.remainingCap);
    const again = run.unanswered;
    if (again !== null && again > run.banked) {
      run.sent = run.banked;
      void this.ascend(again);
    }
  }

  /** The run as tests see it: its seed, what is banked, the owl on the field, and whether the tower is painted. */
  debug(): { seed: number; night: string; layout: Layout; banked: number; sent: number; over: boolean; ref: string | null; state: ClimbState | null; painted: boolean } | null {
    const view = this.host.scene.scene.get('climb') as ClimbScene | null;
    const run = this.run;
    return run ? { seed: run.seed, night: run.night.key, layout: run.layout, banked: run.banked, sent: run.sent, over: run.over, ref: run.ref, state: view?.snapshot() ?? null, painted: view?.isPainted() ?? false } : null;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.run?.retry) clearTimeout(this.run.retry);
    if (this.run?.hintTimer) clearTimeout(this.run.hintTimer);
    this.run = null;
    this.stopView();
  }
}

/** The climb, for its realm only. */
export function climbFor(room: RoomDef, host: ClimbHost): Climb | null {
  return room.id === CLIMB_ROOM ? new Climb(host) : null;
}

export type { ClimbInput };
