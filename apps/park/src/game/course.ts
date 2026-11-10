import type Phaser from 'phaser';
import {
  COURSE_REACH,
  LOST_FEATHERS,
  courseOfRoom,
  courseParts,
  distance,
  fellInPit,
  inThorns,
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
import { SPECTATOR_WORDS } from '../ui/spectator';

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
  /** Back to where a fall takes it: placed there, standing (up on a bench's ledge `top` high, else on the floor). */
  place(at: Vec2, top?: number): void;
  /** The feather balance changed. */
  feathers(total: number): void;
  /** Something was granted: the collection should be read again. */
  awarded(): void;
  /** The HUD's root, for the objective strip. */
  hudRoot(): HTMLElement | null;
}

/** How long before a piece the room said was out of reach is asked again (the room has the owl a moment behind). */
const FAR_RETRY_MS = 300;
/** How long before a refusal is asked again, or said again. */
const REFUSED_RETRY_MS = 4000;

const C = { sky: 0x1b2640, floor: 0x3f5b46, edge: 0x6f8f6a, pit: 0x080b14, door: 0xc9a46a, bench: 0x8a5a33, bell: 0xffd36a, bellDone: 0x6d6a5e, feather: 0xf6f1e3, shrine: 0xb8d8ff, gate: 0xd9673e, opener: 0xffd36a, crate: 0x7a5534, crateTop: 0xa8794a, thorn: 0x2c3b1f, thornShade: 0x101a10, mist: 0xd9dde3, mistLight: 0xf3f4f6, falls: 0x9fb4c8, fallsLight: 0xe6eef5, wire: 0x1a1d2b, spark: 0x7ff6ff, sparkHot: 0xff5fd2, breaker: 0x3a3f55, breakerFace: 0xd9673e, breakerOn: 0x5ee08a };

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
  /** The thorns the course draws in the air (a room seen from the side). */
  private thornArt: Phaser.GameObjects.Graphics | null = null;
  private readonly parts: ReturnType<typeof courseParts>;
  private closed = false;
  /** Falls and finishes this page has had answered, for the tests. */
  private falls = 0;
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
    if (fellInPit(this.room, me.pos, me.grounded, me.z) || inThorns(this.room, me.pos.x, me.z)) {
      this.ask('fall', now, () => link.fall(), (res) => {
        if (res.at) this.host.place(res.at, res.top ?? 0);
        this.falls += 1;
      });
      return;
    }
    const at = (p: CoursePiece) => distance(me.pos, p.at) <= COURSE_REACH && sameLevel(me.ground, p);
    const run = view.run;
    for (const b of c.benches ?? []) {
      if (!at(b) || !run || run.bench === b.id) continue;
      this.ask(keyOf('bench', b.id), now, () => link.reach('bench', b.id), (res) => res.first && this.host.hud.toast(COURSE_WORDS.bench, 1400));
    }
    for (const p of c.parts ?? []) {
      if (!at(p) || run?.parts.includes(p.id)) continue;
      if (!run) this.say(keyOf('idle', p.id), now, COURSE_WORDS.idle);
      else this.ask(keyOf('part', p.id), now, () => link.reach('part', p.id), (res) => res.first && this.host.hud.toast(COURSE_WORDS.partDone[this.def.objective], 1600));
    }
    for (const f of c.feathers ?? []) {
      if (!at(f) || view.feathers.includes(f.id)) continue;
      this.ask(keyOf('feather', f.id), now, () => link.reach('feather', f.id), (res) => res.first && this.host.hud.toast(`${COURSE_WORDS.featherFound} (${res.view.feathers.length}/${LOST_FEATHERS})`, 1600));
    }
    const cut = openerAt(this.room, me.pos, new Set(view.shortcuts));
    if (cut) this.ask(keyOf('shortcut', cut.id), now, () => link.open(cut.id), (res) => res.first && this.host.hud.toast(COURSE_WORDS.shortcut, 1600));
    const shrine = c.shrine;
    if (shrine && at(shrine)) {
      if (!run) this.say('shrine-idle', now, COURSE_WORDS.idle);
      else if (!this.parts.every((p) => run.parts.includes(p.id))) this.say('shrine-parts', now, COURSE_WORDS.partsFirst[this.def.objective]);
      else this.ask('finish', now, () => link.finish(), (res) => this.paid(res));
    }
  }

  /** What the page shows of the course, for the tests and the console. */
  debug(): { course: string; act: number; run: CourseView['run']; feathers: string[]; shortcuts: string[]; cleared: boolean; bestMs: number | null; falls: number; finishes: number } | null {
    const v = this.view;
    if (!v) return null;
    return { course: v.course, act: this.room.course?.act ?? 0, run: v.run, feathers: [...v.feathers], shortcuts: [...v.shortcuts], cleared: v.cleared, bestMs: v.bestMs, falls: this.falls, finishes: this.finishes };
  }

  destroy(): void {
    this.closed = true;
    this.strip?.destroy();
    this.thornArt?.destroy();
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

  /** A line said at most once every few seconds for `key`, while the owl stays at what it is about. */
  private say(key: string, now: number, words: string): void {
    if (now < (this.waitUntil.get(key) ?? 0)) return;
    this.waitUntil.set(key, now + REFUSED_RETRY_MS);
    this.host.hud.toast(words, 2200);
  }

  private take(res: CourseReply): void {
    if (!res.ok) return;
    this.view = res.view;
    this.showStrip();
    this.showPieces();
  }

  private paid(res: Extract<CourseReply, { ok: true }>): void {
    const paid = res.paid;
    if (!paid) return;
    this.finishes += 1;
    this.host.hud.toast(clearLine(paid, SPECTATOR_WORDS.keep), 4000);
    if (paid.gold) this.host.hud.toast(COURSE_WORDS.gold, 3500);
    if (paid.emote) this.host.hud.toast(COURSE_WORDS.emote, 3500);
    if (paid.mouse) this.host.hud.toast(COURSE_WORDS.mouse, 5000);
    if (!paid.practice) this.host.feathers(paid.total);
    if (paid.item || paid.gold || paid.emote || paid.mouse) this.host.awarded();
  }

  private showStrip(): void {
    const run = this.view?.run;
    const lost = this.view?.feathers.length ?? 0;
    this.strip?.show(this.def.objective, this.parts.map((p) => p.id), new Set(run?.parts ?? []), lost);
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
    // Thorns in the air of a course seen from the side (OP-226): the game draws them, a dark stem with barbs down its length.
    if (c.thorns?.length) {
      const g = add.graphics().setDepth(this.room.size.h + 40);
      for (const t of c.thorns) drawThorns(g, t, groundOf(this.room));
      this.thornArt = g;
    }
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
  }
}

/**
 * A hazard in the air over the ground line `ground`, as it looks: thorns hanging (or grown up), a stem
 * down the middle of their box, barbs either side, a darker shade behind; a bank of cloud mist (the
 * ink-wash course, OP-235), soft billows filling its box; the water of a falls, pale streaks down it;
 * or live wires (the neon realm's course), sagging cables with sparks along them.
 */
export function drawThorns(g: Phaser.GameObjects.Graphics, t: CourseThorns, ground: number): void {
  const y0 = Math.max(0, ground - t.z1);
  const y1 = ground - t.z0;
  const w = t.x1 - t.x0;
  const mid = t.x0 + w / 2;
  if (t.look === 'mist') {
    g.fillStyle(C.mist, 0.42).fillRect(t.x0, y0, w, y1 - y0);
    // Billows along its edges and through it, so it reads as cloud and not a wall; its foot shows how low it reaches.
    for (let y = y0 + 40, i = 0; y < y1; y += 70, i++) {
      for (let x = t.x0 + ((i % 2) * 40 + 30); x < t.x1; x += 80) g.fillStyle(C.mistLight, 0.5).fillCircle(x, y, 34);
    }
    for (let x = t.x0 + 20; x < t.x1; x += 60) g.fillStyle(C.mistLight, 0.7).fillCircle(x, y1 - 10, 28);
    return;
  }
  if (t.look === 'wires') {
    // Live wires (the neon realm's course): dark cables sagging across the box, sparks of cyan and pink along them.
    g.fillStyle(C.wire, 0.25).fillRect(t.x0, y0, w, y1 - y0);
    for (let y = y0 + 30, i = 0; y < y1; y += 60, i++) {
      g.lineStyle(4, C.wire, 0.9).beginPath().moveTo(t.x0, y);
      for (let x = t.x0; x <= t.x1; x += 40) g.lineTo(x, y + Math.sin((x - t.x0) / 70 + i) * 14);
      g.strokePath();
      for (let x = t.x0 + ((i * 37) % 90) + 20; x < t.x1; x += 90) g.fillStyle(i % 2 ? C.sparkHot : C.spark, 0.85).fillCircle(x, y + Math.sin((x - t.x0) / 70 + i) * 14, 5);
    }
    return;
  }
  if (t.look === 'falls') {
    g.fillStyle(C.falls, 0.35).fillRect(t.x0, y0, w, y1 - y0);
    for (let x = t.x0 + 12; x < t.x1; x += 24) g.lineStyle(3, C.fallsLight, 0.55).lineBetween(x, y0, x, y1);
    return;
  }
  g.fillStyle(C.thornShade, 0.55).fillRect(t.x0, y0, w, y1 - y0);
  g.lineStyle(Math.max(4, Math.min(10, w / 5)), C.thorn, 1).lineBetween(mid, y0, mid, y1);
  g.fillStyle(C.thorn, 1);
  for (let y = y0 + 14, side = 1; y < y1 - 6; y += 26, side = -side) {
    const x = mid + side * (w / 2);
    g.fillTriangle(mid, y - 6, mid, y + 6, x, y - 2);
  }
  // A tip where they end in the air, so a visitor sees how low they reach.
  if (t.z0 > 0) g.fillTriangle(mid - 6, y1 - 4, mid + 6, y1 - 4, mid, y1 + 12);
}

/** The course in a room that is one of its acts; null in any other room. */
export function courseFor(room: RoomDef, host: CourseHost): Course | null {
  const def = courseOfRoom(room, COURSES);
  return def ? new Course(room, def, host) : null;
}
