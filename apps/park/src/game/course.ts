import type Phaser from 'phaser';
import {
  COURSE_REACH,
  LOST_FEATHERS,
  courseOfRoom,
  courseParts,
  distance,
  doorWaitsOn,
  fellInPit,
  leadsOpen,
  thornsBetween,
  openerAt,
  sameLevel,
  shutShortcuts,
  type CourseDef,
  type CourseArtPiece,
  type CoursePiece,
  type CourseThorns,
  KIT_ART,
  type CourseView,
  type PieceKind,
  type Polygon,
  type RoomDef,
  type Vec2,
} from '@owl-park/shared';
import type { CourseLink, CourseReply } from '../collect/service';
import { COURSES, ROOMS, groundOf } from '../rooms';
import { COURSE_WORDS, clearLine } from '../ui/courseWords';
import type { Hud } from '../ui/hud';
import { createObjectiveStrip, type ObjectiveStrip } from '../ui/objectiveStrip';
import { glintAt } from './featherTrailView';

/** How far over a lead's spot its glint stands (room px): over the breaker's own box, not on it. */
const LEAD_LIFT = 90;
import { SPECTATOR_WORDS } from '../ui/spectator';
import type { CueName } from './sfxCues';

/**
 * A parkour course in one of its acts (OP-224, course.ts in @owl-park/shared), on the page: its
 * pieces drawn (in plain shapes for a `drawn` room), the objective strip, and each piece asked of the
 * room as the owl reaches it. The room decides: the page only asks, and shows what the room answers.
 * Its own module, so the room scene only builds it, steps it each frame and asks it for the floor
 * its shut shortcuts keep the owl off.
 */
export interface CourseHost {
  scene: Phaser.Scene;
  hud: Hud;
  /** The course's link (null until connected). */
  link(): CourseLink | null;
  /** Where the own owl stands, whether it is on something (not in the air), the top it stands on (0: the floor) and its height now. */
  me(): { pos: Vec2; grounded: boolean; ground: number; z: number };
  /** The spawn the owl came in at. */
  spawn(): string | undefined;
  /**
   * It fell: back to where the fall takes it, placed there standing (up on a ledge `top` high, else on
   * the floor), and shown to the player (the room blinks, the camera is on the owl, a line says where it is).
   */
  fell(at: Vec2, top?: number): void;
  /** The feather balance changed. */
  feathers(total: number): void;
  /** Something was granted: the collection should be read again. */
  awarded(): void;
  /** The HUD's root, for the objective strip. */
  hudRoot(): HTMLElement | null;
  /** Whether calm motion is on (a setting): nothing the course draws flickers then. */
  calm?(): boolean;
  /** A moment of the course is heard (OP-350, sfxCues.ts): nothing where the park's sounds are not on. */
  sound?(cue: CueName): void;
}

/** How long before a piece the room said was out of reach is asked again (the room has the owl a moment behind). */
const FAR_RETRY_MS = 300;
/**
 * How long ago and how far off the owl's last place may be for the way from it to count as a move
 * (OP-353): a frame at seven a second, and the furthest a dash goes in that. Longer or further and the
 * page stalled or the owl was put somewhere, and only where it is now is looked at. Within it the
 * straight way between two frames is at most 7 px under the arc a jump really took, so an owl that
 * cleared a hazard is not read as through it.
 */
const MOVE_LOOK_MS = 150;
const MOVE_LOOK_PX = 140;
/** How long before a refusal is asked again, or said again. */
const REFUSED_RETRY_MS = 4000;

const C = { sky: 0x1b2640, floor: 0x3f5b46, edge: 0x6f8f6a, pit: 0x080b14, door: 0xc9a46a, bench: 0x8a5a33, bell: 0xffd36a, bellDone: 0x6d6a5e, feather: 0xf6f1e3, shrine: 0xb8d8ff, gate: 0xd9673e, opener: 0xffd36a, crate: 0x7a5534, crateTop: 0xa8794a, thorn: 0x5a3626, thornLight: 0x8a6442, thornTip: 0xf0e2b8, thornEdge: 0x1c100b, mist: 0xd9dde3, mistLight: 0xf3f4f6, falls: 0x9fb4c8, fallsLight: 0xe6eef5, wire: 0x1a1d2b, spark: 0x7ff6ff, sparkHot: 0xff5fd2, breaker: 0x3a3f55, breakerFace: 0xd9673e, breakerOn: 0x5ee08a };

/** A room drawn in plain shapes (`drawn`, the test course): the sky, the floor, the pits and the doorways. */
export function drawPlaceholderRoom(scene: Phaser.Scene, room: RoomDef): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(-1);
  g.fillStyle(C.sky, 1).fillRect(0, 0, room.size.w, room.size.h);
  const poly = (p: Polygon, color: number, alpha = 1) => {
    g.fillStyle(color, alpha).fillPoints(p.map((v) => ({ x: v.x, y: v.y })), true);
  };
  for (const p of room.walkable) {
    poly(p, C.floor);
    g.lineStyle(3, C.edge, 1).strokePoints(p.map((v) => ({ x: v.x, y: v.y })), true);
  }
  for (const pit of room.course?.pits ?? []) poly(pit, C.pit);
  for (const d of room.doors) g.fillStyle(C.door, 0.55).fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
  // A perch (a crate to jump up on): its face from the floor to its top, and its top, drawn by its place so owls pass in front and behind.
  for (const perch of room.perches ?? []) {
    const xs = perch.area.map((v) => v.x);
    const ys = perch.area.map((v) => v.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y1 = Math.max(...ys);
    const p = scene.add.graphics().setDepth(y1);
    p.fillStyle(C.crate, 1).fillRect(x0, y1 - perch.top, x1 - x0, perch.top);
    p.fillStyle(C.crateTop, 1).fillPoints(perch.area.map((v) => ({ x: v.x, y: v.y - perch.top })), true);
  }
  return g;
}

/** A piece's key: the room asks once for each, until it answers. */
const keyOf = (kind: string, id: string) => `${kind}:${id}`;

export class Course {
  private view: CourseView | null = null;
  private readonly asking = new Set<string>();
  private readonly waitUntil = new Map<string, number>();
  private readonly strip: ObjectiveStrip | null;
  private readonly marks = new Map<string, Phaser.GameObjects.GameObject>();
  private readonly gates = new Map<string, Phaser.GameObjects.GameObject>();
  /** The glints over the room's leads (OP-378), by lead id: shown until the run has the lead's part. */
  private readonly leads = new Map<string, Phaser.GameObjects.Container>();
  /** The hazards the course draws in the air (a room seen from the side), and the live wires' sparks over them. */
  private thornArt: Phaser.GameObjects.Graphics[] = [];
  private readonly parts: ReturnType<typeof courseParts>;
  private closed = false;
  /** When the run under way started, by this page's clock (the strip's clock, OP-344); null with no run. */
  private runStartedAt: number | null = null;
  /** Falls and finishes this page has had answered, for the tests. */
  private falls = 0;
  /** Where the owl was a frame ago, and when: its move since is looked along for thorns (OP-353). Null as a room starts and where a fall puts the owl. */
  private wasAt: { x: number; z: number; at: number } | null = null;
  private finishes = 0;

  constructor(
    private readonly room: RoomDef,
    private readonly def: CourseDef,
    private readonly host: CourseHost,
  ) {
    this.parts = courseParts(def, (id) => ROOMS[id]);
    const root = host.hudRoot();
    this.strip = root ? createObjectiveStrip(root) : null;
    this.drawPieces();
    this.showStrip();
  }

  /** The course's link is up: what the room has for this owl, and a run started at the trail gate's way in. */
  async connected(): Promise<void> {
    const link = this.host.link();
    if (!link) return;
    const res = await link.state();
    if (this.closed) return;
    this.take(res);
    const first = this.room.id === this.def.acts[0];
    if (first && (this.host.spawn() === this.def.gate.spawn || !this.view?.run)) this.take(await link.start());
  }

  /**
   * Why the doorway into `toRoom` does not take the owl yet, or null when it does (OP-343). The way
   * into the room where the course only ends (the canopy's hut: the finish, and no way back) waits for
   * a run's every part, and says how many are done: an owl a bell short stays where it can go and ring it.
   * An owl with no run goes through as ever: it has nothing to lose there.
   */
  holds(toRoom: string): string | null {
    const waits = doorWaitsOn(this.def, toRoom, (id) => ROOMS[id], this.view?.run?.parts ?? null);
    return waits ? COURSE_WORDS.doorWaits[this.def.objective](waits.done, waits.of) : null;
  }

  /** The floor the owl cannot cross for now: the gates of the shortcuts it has not opened. */
  shut(): Polygon[] {
    return shutShortcuts(this.room, new Set(this.view?.shortcuts ?? []));
  }

  /** Each frame: a fall into a pit, and every piece the owl stands at, asked of the room once. */
  tick(now: number): void {
    const view = this.view;
    const link = this.host.link();
    if (!view || !link || this.closed) return;
    const me = this.host.me();
    const c = this.room.course;
    if (!c) return;
    // Down on the floor over a pit: a fall. Up on a ledge over a drop (a course seen from the side) is not
    // one, nor is the step off a ledge's end: the owl is still at the ledge's height then, and drops.
    // Thorns are looked for along the way the owl came since the last frame, not only where it is: a
    // dash is longer in a slow device's frame than the thinnest of them are thick.
    const here = { x: me.pos.x, z: me.z, at: now };
    const was = this.wasAt;
    this.wasAt = here;
    const came = was && now - was.at <= MOVE_LOOK_MS && Math.abs(here.x - was.x) <= MOVE_LOOK_PX ? was : here;
    if (fellInPit(this.room, me.pos, me.grounded, me.z) || thornsBetween(this.room, came, here)) {
      this.ask('fall', now, () => link.fall(), (res) => {
        if (res.at) {
          // Put somewhere else: the way from here to there is no move of the owl's.
          this.wasAt = null;
          this.host.fell(res.at, res.top ?? 0);
          this.host.hud.toast(COURSE_WORDS.fell, 1500);
          this.host.sound?.('fall');
        }
        this.falls += 1;
      });
      return;
    }
    const at = (p: CoursePiece) => distance(me.pos, p.at) <= COURSE_REACH && sameLevel(me.ground, p);
    const run = view.run;
    for (const b of c.benches ?? []) {
      if (!at(b) || !run || run.bench === b.id) continue;
      this.ask(keyOf('bench', b.id), now, () => link.reach('bench', b.id), (res) => res.first && this.told(COURSE_WORDS.bench, 1400, 'bench'));
    }
    for (const p of c.parts ?? []) {
      if (!at(p) || run?.parts.includes(p.id)) continue;
      if (!run) this.say(keyOf('idle', p.id), now, COURSE_WORDS.idle);
      else this.ask(keyOf('part', p.id), now, () => link.reach('part', p.id), (res) => res.first && this.told(COURSE_WORDS.partDone[this.def.objective], 1600, 'part'));
    }
    for (const f of c.feathers ?? []) {
      if (!at(f) || view.feathers.includes(f.id)) continue;
      this.ask(keyOf('feather', f.id), now, () => link.reach('feather', f.id), (res) => res.first && this.told(`${COURSE_WORDS.featherFound} (${res.view.feathers.length}/${LOST_FEATHERS})`, 1600, 'feather'));
    }
    const cut = openerAt(this.room, me.pos, new Set(view.shortcuts));
    if (cut) this.ask(keyOf('shortcut', cut.id), now, () => link.open(cut.id), (res) => res.first && this.told(COURSE_WORDS.shortcut, 1600, 'open'));
    const shrine = c.shrine;
    if (shrine && at(shrine)) {
      if (!run) this.say('shrine-idle', now, COURSE_WORDS.idle);
      else if (!this.parts.every((p) => run.parts.includes(p.id))) this.say('shrine-parts', now, COURSE_WORDS.partsFirst[this.def.objective]);
      else this.ask('finish', now, () => link.finish(), (res) => this.paid(res));
    }
  }

  /** What the page shows of the course, for the tests and the console. */
  debug(): { course: string; act: number; run: CourseView['run']; feathers: string[]; shortcuts: string[]; cleared: boolean; bestMs: number | null; falls: number; finishes: number; leads: string[] } | null {
    const v = this.view;
    if (!v) return null;
    const leads = [...this.leads].filter(([, g]) => g.visible).map(([id]) => id);
    return { course: v.course, act: this.room.course?.act ?? 0, run: v.run, feathers: [...v.feathers], shortcuts: [...v.shortcuts], cleared: v.cleared, bestMs: v.bestMs, falls: this.falls, finishes: this.finishes, leads };
  }

  destroy(): void {
    this.closed = true;
    this.strip?.destroy();
    for (const g of this.thornArt) g.destroy();
    this.host.link()?.close();
  }

  // ---------- inside ----------

  /** Ask the room once for `key`: again a moment later if it had the owl out of reach, much later after a refusal. */
  private ask(key: string, now: number, call: () => Promise<CourseReply>, ok: (res: Extract<CourseReply, { ok: true }>) => void): void {
    if (this.asking.has(key) || now < (this.waitUntil.get(key) ?? 0)) return;
    this.asking.add(key);
    void call().then((res) => {
      this.asking.delete(key);
      if (this.closed) return;
      if (!res.ok) {
        this.waitUntil.set(key, Date.now() + (res.reason === 'far' ? FAR_RETRY_MS : REFUSED_RETRY_MS));
        if (res.reason === 'idle' || res.reason === 'forgotten') this.say(`said:${key}`, Date.now(), COURSE_WORDS.idle);
        return;
      }
      this.take(res);
      ok(res);
    });
  }

  /** A moment of the run, said and heard (OP-350). */
  private told(words: string, ms: number, cue: CueName): void {
    this.host.hud.toast(words, ms);
    this.host.sound?.(cue);
  }

  /** A line said at most once every few seconds for `key`, while the owl stays at what it is about. */
  private say(key: string, now: number, words: string): void {
    if (now < (this.waitUntil.get(key) ?? 0)) return;
    this.waitUntil.set(key, now + REFUSED_RETRY_MS);
    this.host.hud.toast(words, 2200);
  }

  private take(res: CourseReply): void {
    if (!res.ok) return;
    this.view = res.view;
    // When the run started, by this page's clock: the room says how long it has been under way.
    this.runStartedAt = res.view.run ? Date.now() - res.view.run.ms : null;
    this.showStrip();
    this.showPieces();
  }

  private paid(res: Extract<CourseReply, { ok: true }>): void {
    const paid = res.paid;
    if (!paid) return;
    this.finishes += 1;
    this.host.hud.toast(clearLine(paid, SPECTATOR_WORDS.keep), 4000);
    this.host.sound?.('clear');
    if (paid.gold) this.host.hud.toast(COURSE_WORDS.gold, 3500);
    if (paid.emote) this.host.hud.toast(COURSE_WORDS.emote, 3500);
    if (paid.mouse) this.host.hud.toast(COURSE_WORDS.mouse, 5000);
    if (!paid.practice) this.host.feathers(paid.total);
    if (paid.item || paid.gold || paid.emote || paid.mouse) this.host.awarded();
  }

  private showStrip(): void {
    const run = this.view?.run;
    const lost = this.view?.feathers.length ?? 0;
    this.strip?.show(this.def.objective, this.parts.map((p) => p.id), new Set(run?.parts ?? []), lost, run && this.runStartedAt !== null ? { startedAt: this.runStartedAt, goldMs: this.def.gold.ms } : null);
  }

  /** Each piece of this act, in plain shapes until a realm's course has art of its own: drawn by its place, so owls pass in front and behind. */
  private drawPieces(): void {
    const c = this.room.course;
    if (!c) return;
    const add = this.host.scene.add;
    const mark = (kind: PieceKind | 'shrine', p: CoursePiece, obj: Phaser.GameObjects.GameObject & { setDepth(d: number): unknown }) => {
      obj.setDepth(p.at.y - (p.top ?? 0) - 1);
      this.marks.set(keyOf(kind, p.id), obj);
    };
    const art = this.def.art;
    // From the kit where the course names art for the kind and the build has it: its foot at the piece's height (and `lift` over it).
    const kitImage = (a: CourseArtPiece | undefined, p: CoursePiece): Phaser.GameObjects.Image | null => {
      if (!a || !this.host.scene.textures.exists(a.key)) return null;
      const spec = KIT_ART[a.key];
      const w = spec?.w ?? 100;
      const h = spec?.h ?? 100;
      const scale = a.scale ?? 1;
      return add
        .image(p.at.x, p.at.y - (p.top ?? 0) - (a.lift ?? 0), a.key)
        .setOrigin(0.5, (spec?.foot ?? h) / h)
        .setDisplaySize(w * scale, h * scale);
    };
    for (const b of c.benches ?? []) mark('bench', b, kitImage(art?.bench, b) ?? add.rectangle(b.at.x, b.at.y - 10 - (b.top ?? 0), 70, 20, C.bench));
    // A part with no art of its course's own: a bell in plain shapes, or for breakers a breaker box, its switch's light off (an orange face) until thrown.
    const plainPart = (p: CoursePiece) =>
      this.def.objective === 'breakers'
        ? add.rectangle(p.at.x, p.at.y - 34 - (p.top ?? 0), 40, 56, C.breakerFace).setStrokeStyle(6, C.breaker)
        : add.ellipse(p.at.x, p.at.y - 34 - (p.top ?? 0), 32, 32, C.bell).setStrokeStyle(3, 0x0c1e36);
    for (const p of c.parts ?? []) mark('part', p, kitImage(art?.part, p) ?? plainPart(p));
    for (const f of c.feathers ?? []) mark('feather', f, kitImage(art?.feather, f) ?? add.ellipse(f.at.x, f.at.y - 18 - (f.top ?? 0), 12, 26, C.feather));
    if (c.shrine) mark('shrine', c.shrine, kitImage(art?.shrine, c.shrine) ?? add.rectangle(c.shrine.at.x, c.shrine.at.y - 50, 54, 100, C.shrine).setStrokeStyle(3, 0x0c1e36));
    // The hazards in the air of a course seen from the side (OP-226): the game draws each as the thing it is.
    if (c.thorns?.length) {
      const g = add.graphics().setDepth(this.room.size.h + 40);
      // Live wires' bolts and sparks on their own layer, flickering (still with calm motion on): what says the wires are live.
      const sparks = add.graphics().setDepth(this.room.size.h + 40);
      for (const t of c.thorns) drawThorns(g, t, groundOf(this.room), sparks);
      this.thornArt = [g, sparks];
      if (c.thorns.some((t) => t.look === 'wires') && !this.host.calm?.()) {
        this.host.scene.tweens.add({ targets: sparks, alpha: { from: 1, to: 0.35 }, duration: 140, yoyo: true, repeat: -1, repeatDelay: 220 });
      }
    }
    // Where to go first (OP-378): the feather trail's glint over the first landing and breaker, high over the piece's own art.
    for (const l of c.leads ?? []) this.leads.set(l.id, glintAt(this.host.scene, l.at.x, l.at.y - (l.top ?? 0) - LEAD_LIFT, this.host.calm?.() ?? false));
    for (const s of c.shortcuts ?? []) {
      const xs = s.gate.map((v) => v.x);
      const ys = s.gate.map((v) => v.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const gate = add.rectangle(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, C.gate).setOrigin(0, 0).setDepth(Math.max(...ys));
      this.gates.set(s.id, gate);
      add.rectangle(s.opener.x, s.opener.y, s.opener.w, s.opener.h, C.opener, 0.18).setOrigin(0, 0).setDepth(-0.5);
    }
  }

  /** The pieces as the room has them for this owl: a rung bell greys, a found feather goes, an open shortcut's gate goes. */
  private showPieces(): void {
    const v = this.view;
    if (!v) return;
    for (const p of this.room.course?.parts ?? []) {
      const m = this.marks.get(keyOf('part', p.id));
      const rung = v.run?.parts.includes(p.id) ?? false;
      // A rung part from the kit greys (its tint); one in plain shapes takes the rung colour.
      if (!m) continue;
      if ('setFillStyle' in m) {
        const [done, waiting] = this.def.objective === 'breakers' ? [C.breakerOn, C.breakerFace] : [C.bellDone, C.bell];
        (m as Phaser.GameObjects.Shape).setFillStyle(rung ? done : waiting);
      }
      else if (rung) (m as Phaser.GameObjects.Image).setTint(C.bellDone);
      else (m as Phaser.GameObjects.Image).clearTint();
    }
    for (const f of this.room.course?.feathers ?? []) {
      const m = this.marks.get(keyOf('feather', f.id)) as Phaser.GameObjects.Image | Phaser.GameObjects.Ellipse | undefined;
      m?.setVisible(!v.feathers.includes(f.id));
    }
    for (const [id, gate] of this.gates) (gate as Phaser.GameObjects.Rectangle).setVisible(!v.shortcuts.includes(id));
    const open = new Set(leadsOpen(this.room, v.run?.parts ?? null).map((l) => l.id));
    for (const [id, g] of this.leads) g.setVisible(open.has(id));
  }
}

/**
 * A hazard in the air over the ground line `ground`, as it looks, in plain shapes until a realm has art
 * for it (the realm kit's hazard slot). Each is drawn as the thing it is, never as a box of colour
 * (OP-343: a see-through box read as a test overlay): thorns, a vine hanging (or grown up) with a thorn
 * every few px either side and a tip where it ends; a bank of cloud mist (the ink-wash course, OP-235),
 * billows packed edge to edge; the water of a falls, streaks down it under a soft sheet; or live wires
 * (the neon realm's course), sagging cables with a bolt jumping along each. `sparks`, when given, takes
 * the wires' bolts and sparks apart from the cables, so the caller can make them flicker.
 */
export function drawThorns(g: Phaser.GameObjects.Graphics, t: CourseThorns, ground: number, sparks: Phaser.GameObjects.Graphics = g): void {
  const y0 = Math.max(0, ground - t.z1);
  const y1 = ground - t.z0;
  const w = t.x1 - t.x0;
  const mid = t.x0 + w / 2;
  if (t.look === 'mist') {
    // Billows packed over the whole box in one flat tone (so no circle shows through another), paler ones inside: a bank of cloud with a soft, scalloped rim.
    const r = Math.min(46, w / 3);
    const inX = (x: number) => Math.max(t.x0 + r * 0.5, Math.min(t.x1 - r * 0.5, x));
    for (let y = y0 + r * 0.6, i = 0; y < y1 + r * 0.2; y += r * 0.9, i++) {
      for (let x = t.x0 + r * 0.5 + (i % 2) * r * 0.6; x < t.x1 + r * 0.2; x += r * 1.1) g.fillStyle(C.mist, 0.94).fillCircle(inX(x), Math.min(y1 - r * 0.5, y), r);
    }
    for (let y = y0 + r * 1.2, i = 0; y < y1 - r * 0.8; y += r * 1.5, i++) {
      for (let x = t.x0 + r * 1.2 + (i % 2) * r * 0.8, k = i; x < t.x1 - r * 1.1; x += r * 1.7, k++) g.fillStyle(C.mistLight, 0.5).fillEllipse(x + ((k * 37) % 20) - 10, y, r * (1.3 + (k % 3) * 0.3), r * 0.7);
    }
    return;
  }
  if (t.look === 'wires') {
    // Live wires (the neon realm's course): dark cables sagging across, and along each a bolt in bright zigzags with a spark at every turn.
    const sag = (x: number, i: number) => Math.sin((x - t.x0) / 70 + i) * 14;
    for (let y = y0 + 30, i = 0; y < y1; y += 60, i++) {
      g.lineStyle(5, C.wire, 0.95).beginPath().moveTo(t.x0, y + sag(t.x0, i));
      for (let x = t.x0; x <= t.x1; x += 40) g.lineTo(x, y + sag(x, i));
      g.strokePath();
      for (let x = t.x0 + ((i * 53) % 150) + 30; x < t.x1 - 70; x += 210) {
        const pts = [0, 14, 28, 44, 60].map((dx, k) => ({ x: x + dx, y: y + sag(x + dx, i) + (k % 2 ? -11 : 9) }));
        sparks.lineStyle(4, i % 2 ? C.sparkHot : C.spark, 1).strokePoints(pts);
        sparks.lineStyle(2, 0xffffff, 0.9).strokePoints(pts);
        for (const p of [pts[0]!, pts[pts.length - 1]!]) {
          sparks.fillStyle(0xffffff, 0.95).fillCircle(p.x, p.y, 4);
          sparks.lineStyle(2, i % 2 ? C.sparkHot : C.spark, 0.9).lineBetween(p.x - 9, p.y, p.x + 9, p.y).lineBetween(p.x, p.y - 9, p.x, p.y + 9);
        }
      }
    }
    return;
  }
  if (t.look === 'falls') {
    // Falling water: a soft sheet, paler down its middle, and streaks of different lengths down it.
    for (const [inset, alpha] of [[0, 0.16], [w * 0.12, 0.16], [w * 0.28, 0.14]] as const) g.fillStyle(C.falls, alpha).fillRect(t.x0 + inset, y0, w - 2 * inset, y1 - y0);
    for (let x = t.x0 + 10, i = 0; x < t.x1 - 4; x += 18, i++) {
      for (let y = y0 + ((i * 47) % 90); y < y1; y += 150 + ((i * 31) % 60)) g.lineStyle(3, C.fallsLight, 0.6).lineBetween(x, y, x, Math.min(y1, y + 90 + ((i * 17) % 50)));
    }
    return;
  }
  // Thorns: a vine winding down the middle of its box, dark-edged so it stands out from bark and leaves, thorns either side of it, and a tip where it ends in the air.
  const sway = Math.min(10, w / 5);
  const at = (y: number) => mid + Math.sin((y - y0) / 38) * sway;
  const pts: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y += 12) pts.push({ x: at(y), y });
  pts.push({ x: at(y1), y: y1 });
  const thick = Math.max(9, Math.min(16, w / 3));
  const reach = Math.max(14, w / 2);
  const thorn = (y: number, side: number, grow: number, color: number) => {
    const x = at(y);
    g.fillStyle(color, 1).fillTriangle(x, y - 7 - grow, x, y + 7 + grow, x + side * (reach + grow * 1.5), y - 3);
  };
  for (let y = y0 + 12, side = 1; y < y1 - 8; y += 22, side = -side) thorn(y, side, 3, C.thornEdge);
  g.lineStyle(thick + 6, C.thornEdge, 1).strokePoints(pts);
  for (let y = y0 + 12, side = 1; y < y1 - 8; y += 22, side = -side) thorn(y, side, 0, C.thornTip);
  g.lineStyle(thick, C.thorn, 1).strokePoints(pts);
  g.lineStyle(3, C.thornLight, 0.9).strokePoints(pts.map((p) => ({ x: p.x - thick / 5, y: p.y })));
  // A tip where they end in the air, so a visitor sees how low they reach.
  if (t.z0 > 0) {
    g.fillStyle(C.thornEdge, 1).fillTriangle(at(y1) - 11, y1 - 6, at(y1) + 11, y1 - 6, at(y1), y1 + 20);
    g.fillStyle(C.thornTip, 1).fillTriangle(at(y1) - 7, y1 - 4, at(y1) + 7, y1 - 4, at(y1), y1 + 14);
  }
}

/** The course in a room that is one of its acts; null in any other room. */
export function courseFor(room: RoomDef, host: CourseHost): Course | null {
  const def = courseOfRoom(room, COURSES);
  return def ? new Course(room, def, host) : null;
}
