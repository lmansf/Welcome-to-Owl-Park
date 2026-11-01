import Phaser from 'phaser';
import { ROOM_W, checkMasks, emptyMasks, ledgesOf, type MaskDraft, type Perch, type RoomDef, type Vec2 } from '@owl-park/shared';
import { draftJson, loadMasks, saveMasks } from '../net/masks';
import { PaintEditor, dragged, drawnMark, find, hitTest, readout, trialPerches, type Hit, type MarkKind, type Tool } from '../paint/editor';
import { notYetLedges, playfieldAt, suggestLedges, type AlphaPicture, type Suggestion } from '../paint/suggest';
import { TREE_GROUND } from '../rooms';
import { mountPaintPanel, type PaintPanel, type PaintState } from '../ui/paintPanel';

/**
 * The ledge painter (OP-156, part 2; `?paint=1` with a keeper's token, over a room of the tree): the
 * room's ledges, or the draft a keeper saved, drawn over the running room, to be fitted to the art.
 * Green lines with a handle at each end and the height as a label are ledges, red uprights walls,
 * orange lines hazards, and translucent blue polygons fronts (regions to be drawn in front of the
 * owls); dashed lines are what Suggest reads off the screen's playfield. The owl walks and jumps
 * throughout, and with Try (on at the start) it stands on the draft's ledges in this page, so a
 * ledge is tested as soon as it is drawn; the room server keeps to the room's own, so others see
 * this owl as the room has it, and a stance only the draft allows is logged as position_rejected.
 *
 * A press (mouse or touch alike: Phaser's pointers) on an end, a line or a front's point picks it and
 * drags it; with the ledge, wall or hazard tool a drag over empty ground draws one; with the front
 * tool each tap is a point, closed by a tap on the first or by Enter. A tap the painter does not
 * take (the select tool on empty ground) walks the owl as ever. Delete (or the Delete key) removes the
 * picked item, Undo (or Ctrl+Z) takes back a change, Escape lets a front being drawn and the
 * suggestions go. Save sends the draft to the room server with the tab's keeper's token
 * (net/masks.ts); `pnpm masks:pull <room>` prints it as room data. All of it is room pixels: the
 * camera turns them into the screen's.
 *
 * TODO-DOCS (OP-156): docs/PLAYBOOK.md: how a keeper paints a level's ledges: open the park with
 * ?keeper=1&paint=1&room=l1 (the keepers' key once; the tab keeps a 12-hour token), what each colour
 * is, the tools, Suggest (the screen in view; a tap takes a suggestion), dragging ends and lines,
 * fronts point by point, Undo and Delete (and their keys), Try (the owl stands on the draft in this
 * page only, and position_rejected lines for it are expected), Save, and `pnpm masks:pull <room>`
 * to turn the saved draft into room data in a pull request.
 */

const COLOURS: Record<MarkKind, number> = { ledge: 0x5be37d, wall: 0xff4d4d, hazard: 0xff9f1c, front: 0x3d8bff };
const PICKED = 0xffd36a;
const SUGGESTED = 0xf6f1e3;
/** How far from an end or a line a press still takes it (CSS px): a finger is bigger than a mouse. */
const REACH_MOUSE_PX = 10;
const REACH_TOUCH_PX = 18;
/** A tap on a suggestion moves less than this (CSS px); more is a drag, and takes nothing. */
const TAP_PX = 12;
/** A ledge's height label on screen (CSS px), drawn bigger and scaled down so it stays sharp. */
const LABEL_CSS_PX = 12;
const LABEL_DRAWN_PX = 32;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** What the painter needs of the room scene. */
export interface PainterHost {
  scene: Phaser.Scene;
  /** The room as the park has it: its own ledges, its size and its floor. */
  room: RoomDef;
  /** The room server ('' for the page's own). */
  base: string;
  /** This tab's keeper's token. */
  token: string;
  pixelRatio: number;
  /** Where the panel goes: the HUD. */
  hud: HTMLElement;
  /** The owl stands on these perches in this page (Try), or on the room's own again (null). */
  tryPerches(perches: Perch[] | null): void;
}

/** A press the painter took, until it ends. */
type Press =
  | { kind: 'drag'; pointer: number; hit: Hit; from: Vec2; before: MaskDraft }
  | { kind: 'draw'; pointer: number; tool: 'ledge' | 'wall' | 'hazard'; from: Vec2; to: Vec2 }
  | { kind: 'suggestion'; pointer: number; index: number; down: Vec2 };

/** The painter as the browser tests see it (RoomScene's debugState). */
export interface PaintDebug {
  tool: Tool;
  state: PaintState;
  status: string;
  readout: string;
  /** The room's own ledges, and what the last frame drew of the draft. */
  own: string[];
  drawn: { ledges: string[]; walls: string[]; hazards: string[]; fronts: string[] };
  /** Height labels shown, one a ledge. */
  labels: number;
  selected: ({ kind: MarkKind } & Record<string, unknown>) | null;
  suggestions: Suggestion[];
  /** Points of the front being drawn. */
  pending: number;
  trying: boolean;
  unsaved: boolean;
  draft: MaskDraft;
}

export class LedgePainter {
  private editor: PaintEditor;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private readonly panel: PaintPanel;
  private suggestions: Suggestion[] = [];
  private press: Press | null = null;
  /** When the last press the painter took went down (Phaser's downTime): the room does not walk the owl for it. */
  private tookAt = Number.NaN;
  private trying = true;
  private loading = true;
  private saving = false;
  /** When the draft shown was saved (ms), if it ever was. */
  private savedAt: number | null = null;
  /** Why the saved draft could not be read, until a save replaces it. */
  private loadFailed: string | null = null;
  /** Why the last save failed, until the draft changes or is saved again. */
  private saveError: string | null = null;
  /** A word from Suggest for the readout, until something else is said there. */
  private note: string | null = null;
  private drawn: PaintDebug['drawn'] = { ledges: [], walls: [], hazards: [], fronts: [] };
  private gone = false;

  constructor(private readonly host: PainterHost) {
    const { scene, room } = host;
    // The room's own ledges until the saved draft is read (presses wait for it: the owl walks meanwhile).
    this.editor = new PaintEditor({ ...emptyMasks(), ledges: ledgesOf(room) }, false);
    this.g = scene.add.graphics().setDepth(room.size.h + 400);
    this.panel = mountPaintPanel(host.hud, room.id, {
      tool: (t) => this.setTool(t),
      suggest: () => this.suggest(),
      undo: () => this.undo(),
      remove: () => this.remove(),
      save: () => void this.save(),
      tryDraft: (on) => {
        this.trying = on;
        this.applyTry();
        this.refresh();
      },
    });
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    window.addEventListener('keydown', this.onKey);
    this.refresh();
    void this.load();
  }

  /** Whether the painter took the press `p` ended: the room then does not walk the owl to it. */
  took(p: Phaser.Input.Pointer): boolean {
    return p.downTime === this.tookAt;
  }

  // ---------- the draft on the room server ----------

  private async load(): Promise<void> {
    const read = await loadMasks(this.host.base, this.host.room);
    if (this.gone) return;
    if (read.kind === 'saved') {
      const { ledges, walls, hazards, fronts } = read.masks;
      this.editor = new PaintEditor({ ledges, walls, hazards, fronts }, true);
      this.savedAt = read.masks.savedAt;
    } else if (read.kind === 'failed') {
      this.loadFailed = `The saved draft could not be read (${read.why}): Save would replace it.`;
    }
    this.loading = false;
    this.applyTry();
    this.refresh();
  }

  private async save(): Promise<void> {
    if (this.loading || this.saving) return;
    const draft = this.editor.draft;
    const check = checkMasks(draft, this.host.room.size);
    if (!check.ok) {
      this.saveError = `Not saved: ${check.reason}${check.list ? ` in ${check.list}` : ''}${check.index !== undefined ? ` (item ${check.index + 1})` : ''}`;
      this.refresh();
      return;
    }
    if (this.loadFailed && globalThis.confirm?.('The saved draft could not be read. Save this one over it?') !== true) return;
    this.saving = true;
    this.saveError = null;
    this.refresh();
    const r = await saveMasks(this.host.base, this.host.room.id, this.host.token, draftJson(draft));
    this.saving = false;
    if (this.gone) return;
    if (r.ok) {
      this.editor.markSaved(draft);
      this.savedAt = r.savedAt;
      this.loadFailed = null;
    } else this.saveError = `Not saved: ${r.why}`;
    this.refresh();
  }

  // ---------- the panel's buttons and the keys ----------

  private setTool(t: Tool): void {
    this.editor.setTool(t);
    this.note = null;
    this.refresh();
  }

  private undo(): void {
    if (this.loading || !this.editor.undo()) return;
    this.changed();
  }

  private remove(): void {
    if (this.loading || !this.editor.remove()) return;
    this.changed();
  }

  /**
   * Suggest: ledges read off the playfield of the screen in view (its keyed art's tops, paint/suggest.ts),
   * those the draft has already left out; a tap on one takes it.
   */
  private suggest(): void {
    if (this.loading) return;
    const cam = this.host.scene.cameras.main;
    const tile = playfieldAt(this.host.room, cam.worldView.centerX);
    const pic = tile ? this.pictureOf(tile.key) : null;
    if (!tile || !pic) {
      this.suggestions = [];
      this.note = 'This screen’s art could not be read for suggestions.';
    } else {
      this.suggestions = notYetLedges(suggestLedges(pic, { x: tile.x, y: tile.y, scale: ROOM_W / pic.width, ground: TREE_GROUND }), this.editor.draft.ledges);
      this.note = this.suggestions.length ? `${this.suggestions.length} suggested here (dashed): tap one to take it.` : 'Nothing new to suggest on this screen.';
    }
    this.editor.selected = null;
    this.refresh();
  }

  /** A texture's picture as alpha values (a canvas the size of its image); null when there is none or it cannot be read. */
  private pictureOf(key: string): AlphaPicture | null {
    const textures = this.host.scene.textures;
    if (!textures.exists(key)) return null;
    const src = textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number };
    const width = src.naturalWidth || src.width;
    const height = src.naturalHeight || src.height;
    if (!width || !height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(src, 0, 0, width, height);
      return { alpha: ctx.getImageData(0, 0, width, height).data, width, height, stride: 4, offset: 3 };
    } catch {
      // A picture the page may not read back (another site's): no suggestions for it.
      return null;
    }
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (this.loading || (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'))) return;
    const ed = this.editor;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
    } else if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    } else if (e.key === 'Enter' && ed.pending) {
      e.preventDefault();
      if (ed.closeFront()) this.changed();
      else this.refresh();
    } else if (e.key === 'Escape' && (ed.pending || this.press || this.suggestions.length)) {
      ed.cancelFront();
      // A drag let go of with Escape puts the item back as the press found it.
      if (this.press?.kind === 'drag') ed.preview(this.press.before);
      this.press = null;
      this.suggestions = [];
      this.note = null;
      this.refresh();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selected) {
      e.preventDefault();
      this.remove();
    }
  };

  // ---------- presses ----------

  private worldOf(p: Phaser.Input.Pointer): Vec2 {
    const w = this.host.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  /** Room px per CSS px at the camera's zoom now. */
  private cssPx(): number {
    return this.host.pixelRatio / this.host.scene.cameras.main.zoom;
  }

  private take(p: Phaser.Input.Pointer): void {
    this.tookAt = p.downTime;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.gone || this.loading || p.downElement !== this.host.scene.game.canvas) return;
    // Another finger while one is pressing: left to the room. The same pointer down again lost its
    // release (let go outside the window): that press is dropped, a drag put back as it was.
    if (this.press && this.press.pointer !== p.id) return;
    if (this.press?.kind === 'drag') this.editor.preview(this.press.before);
    this.press = null;
    const at = this.worldOf(p);
    const reach = (p.wasTouch ? REACH_TOUCH_PX : REACH_MOUSE_PX) * this.cssPx();
    const ed = this.editor;
    this.note = null;
    // A front being drawn takes every press: its next point, or its first again to close it.
    if (ed.tool === 'front' && ed.pending) {
      this.take(p);
      if (ed.addPoint(at, reach) === 'closed') this.changed();
      else this.refresh();
      return;
    }
    // Inside a front picks it with the select tool only; the front tool takes only a front's points and edges.
    let hit = hitTest(ed.draft, at, reach, TREE_GROUND);
    if (hit && ((hit.part === 'inside' && ed.tool !== 'select') || (ed.tool === 'front' && hit.kind !== 'front'))) hit = null;
    if (hit) {
      this.take(p);
      ed.selected = { kind: hit.kind, id: hit.id };
      this.press = { kind: 'drag', pointer: p.id, hit, from: at, before: ed.draft };
      this.refresh();
      return;
    }
    // A suggestion is a ledge: a tap takes it with the select and the ledge tools, and the others draw over it.
    const s = ed.tool === 'select' || ed.tool === 'ledge' ? this.suggestionAt(at, reach) : -1;
    if (s >= 0) {
      this.take(p);
      this.press = { kind: 'suggestion', pointer: p.id, index: s, down: { x: p.x, y: p.y } };
      return;
    }
    if (ed.tool === 'ledge' || ed.tool === 'wall' || ed.tool === 'hazard') {
      this.take(p);
      ed.selected = null;
      this.press = { kind: 'draw', pointer: p.id, tool: ed.tool, from: at, to: at };
      this.refresh();
      return;
    }
    if (ed.tool === 'front') {
      this.take(p);
      ed.selected = null;
      ed.addPoint(at, reach);
      this.refresh();
      return;
    }
    // The select tool on empty ground: nothing picked, and the room walks the owl there.
    if (ed.selected) {
      ed.selected = null;
      this.refresh();
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || press.pointer !== p.id || !p.isDown) return;
    const at = this.worldOf(p);
    if (press.kind === 'drag') {
      this.editor.preview(dragged(press.before, press.hit, press.from, at, { size: this.host.room.size, ground: TREE_GROUND }));
      this.refresh();
    } else if (press.kind === 'draw') {
      press.to = at;
      this.refresh();
    }
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const press = this.press;
    if (!press || press.pointer !== p.id) return;
    this.press = null;
    const ed = this.editor;
    const frame = { size: this.host.room.size, ground: TREE_GROUND };
    if (press.kind === 'drag') {
      ed.settle(press.before, dragged(press.before, press.hit, press.from, this.worldOf(p), frame));
      this.changed();
    } else if (press.kind === 'draw') {
      const to = this.worldOf(p);
      if (press.tool === 'wall') {
        const mark = drawnMark('wall', press.from, to, frame);
        if (mark) ed.add('wall', mark);
      } else {
        const mark = drawnMark(press.tool, press.from, to, frame);
        if (mark) ed.add(press.tool, mark);
      }
      this.changed();
    } else {
      const s = this.suggestions[press.index];
      if (s && Math.hypot(p.x - press.down.x, p.y - press.down.y) <= TAP_PX * this.host.pixelRatio) {
        ed.add('ledge', s);
        this.suggestions = this.suggestions.filter((_, i) => i !== press.index);
        this.changed();
      }
    }
  }

  /** The suggestion whose dashed line a press at `at` is on (the nearest), or -1. */
  private suggestionAt(at: Vec2, reach: number): number {
    let best = -1;
    let bestD = reach;
    this.suggestions.forEach((s, i) => {
      const y = TREE_GROUND - s.top;
      const dx = at.x < s.x0 ? s.x0 - at.x : at.x > s.x1 ? at.x - s.x1 : 0;
      const d = Math.hypot(dx, at.y - y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  // ---------- after a change ----------

  /** The draft changed: Try follows it, a failed save's words go, and the panel shows it. */
  private changed(): void {
    this.saveError = null;
    this.applyTry();
    this.refresh();
  }

  private applyTry(): void {
    this.host.tryPerches(this.trying && !this.loading ? trialPerches(this.editor.draft.ledges, this.host.room.walkable) : null);
  }

  private statusOf(): { state: PaintState; status: string } {
    const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (this.loading) return { state: 'loading', status: 'Reading the saved draft…' };
    if (this.saving) return { state: 'saving', status: 'Saving…' };
    if (this.saveError) return { state: 'error', status: this.saveError };
    if (this.loadFailed) return { state: 'error', status: this.loadFailed };
    if (!this.editor.unsaved && this.savedAt !== null) return { state: 'saved', status: `Saved ${clock(this.savedAt)}` };
    return { state: 'unsaved', status: this.savedAt !== null ? `Not saved: changed since ${clock(this.savedAt)}` : 'Not saved yet: the room’s own ledges, or as changed here' };
  }

  private readoutOf(): string {
    const ed = this.editor;
    const press = this.press;
    if (press?.kind === 'draw') {
      const frame = { size: this.host.room.size, ground: TREE_GROUND };
      const m = press.tool === 'wall' ? drawnMark('wall', press.from, press.to, frame) : drawnMark(press.tool, press.from, press.to, frame);
      if (!m) return `new ${press.tool}: drag further`;
      return 'y0' in m ? `new wall  x ${m.x}  y0 ${m.y0}  y1 ${m.y1}` : `new ${press.tool}  x0 ${m.x0}  x1 ${m.x1}  top ${m.top}`;
    }
    if (ed.pending) return `front: ${ed.pending.length} point${ed.pending.length === 1 ? '' : 's'}; tap the first again, or Enter, to close it`;
    if (ed.selected) return readout(ed.draft, ed.selected);
    if (this.note) return this.note;
    const hints: Record<Tool, string> = {
      select: 'Tap a line or a point to pick it; drag its ends or the line.',
      ledge: 'Ledge: drag along a surface to draw one.',
      wall: 'Wall: drag up or down to draw one.',
      hazard: 'Hazard: drag along it to draw one.',
      front: 'Front: tap the points around it; the first again, or Enter, closes it.',
    };
    return hints[ed.tool];
  }

  private refresh(): void {
    if (this.gone) return;
    const ed = this.editor;
    this.panel.show({
      tool: ed.tool,
      readout: this.readoutOf(),
      ...this.statusOf(),
      canUndo: ed.canUndo,
      canDelete: ed.selected !== null,
      trying: this.trying,
      busy: this.loading || this.saving,
    });
  }

  // ---------- drawing (each frame: the camera moves, and the lines keep their width on screen) ----------

  draw(): void {
    if (this.gone) return;
    const k = this.cssPx();
    const g = this.g.clear();
    const d = this.editor.draft;
    const picked = this.editor.selected;
    const isPicked = (kind: MarkKind, id: string) => picked?.kind === kind && picked.id === id;
    const handle = (p: Vec2, colour: number, hollow = false) => {
      if (hollow) g.lineStyle(2 * k, colour, 1).strokeCircle(p.x, p.y, 5 * k);
      else g.fillStyle(colour, 1).fillCircle(p.x, p.y, 5 * k).lineStyle(1.5 * k, 0x0c1e36, 1).strokeCircle(p.x, p.y, 5 * k);
    };
    const line = (a: Vec2, b: Vec2, colour: number, on: boolean) => {
      if (on) g.lineStyle(9 * k, PICKED, 0.55).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(3 * k, colour, 0.95).lineBetween(a.x, a.y, b.x, b.y);
      handle(a, colour);
      handle(b, colour);
    };
    for (const f of d.fronts) {
      const on = isPicked('front', f.id);
      g.fillStyle(COLOURS.front, on ? 0.34 : 0.22).fillPoints(f.points, true);
      g.lineStyle((on ? 3 : 2) * k, on ? PICKED : COLOURS.front, 0.95).strokePoints(f.points, true);
      for (const q of f.points) handle(q, COLOURS.front, true);
    }
    for (const w of d.walls) line({ x: w.x, y: w.y0 }, { x: w.x, y: w.y1 }, COLOURS.wall, isPicked('wall', w.id));
    for (const h of d.hazards) line({ x: h.x0, y: TREE_GROUND - h.top }, { x: h.x1, y: TREE_GROUND - h.top }, COLOURS.hazard, isPicked('hazard', h.id));
    for (const l of d.ledges) line({ x: l.x0, y: TREE_GROUND - l.top }, { x: l.x1, y: TREE_GROUND - l.top }, COLOURS.ledge, isPicked('ledge', l.id));
    // Suggestions, dashed.
    g.lineStyle(2 * k, SUGGESTED, 0.9);
    for (const s of this.suggestions) {
      const y = TREE_GROUND - s.top;
      for (let x = s.x0; x < s.x1; x += 17 * k) g.lineBetween(x, y, Math.min(x + 10 * k, s.x1), y);
    }
    // The front being drawn: its points so far, its first ringed (a tap there closes it).
    const pending = this.editor.pending;
    if (pending) {
      if (pending.length > 1) g.lineStyle(2 * k, COLOURS.front, 0.95).strokePoints(pending, false);
      pending.forEach((q, i) => handle(q, COLOURS.front, i > 0));
      g.lineStyle(2 * k, PICKED, 1).strokeCircle(pending[0]!.x, pending[0]!.y, 9 * k);
    }
    // A line being drawn.
    const press = this.press;
    if (press?.kind === 'draw') {
      const { from, to } = press;
      const end = press.tool === 'wall' ? { x: from.x, y: to.y } : { x: to.x, y: from.y };
      g.lineStyle(3 * k, COLOURS[press.tool], 0.8).lineBetween(from.x, from.y, end.x, end.y);
    }
    this.label(k);
    this.drawn = { ledges: d.ledges.map((l) => l.id), walls: d.walls.map((w) => w.id), hazards: d.hazards.map((h) => h.id), fronts: d.fronts.map((f) => f.id) };
  }

  /** Each ledge's height over its line's middle, the same size on screen at any zoom. */
  private label(k: number): void {
    const ledges = this.editor.draft.ledges;
    const ids = new Set(ledges.map((l) => l.id));
    for (const [id, t] of this.labels) {
      if (!ids.has(id)) {
        t.destroy();
        this.labels.delete(id);
      }
    }
    const scale = (LABEL_CSS_PX / LABEL_DRAWN_PX) * k;
    for (const l of ledges) {
      let t = this.labels.get(l.id);
      if (!t) {
        t = this.host.scene.add
          .text(0, 0, '', { fontFamily: FONT, fontSize: `${LABEL_DRAWN_PX}px`, fontStyle: '700', color: '#9CFF57', backgroundColor: 'rgba(12,30,54,0.8)', padding: { x: 8, y: 2 } })
          .setOrigin(0.5, 1)
          .setDepth(this.host.room.size.h + 401);
        this.labels.set(l.id, t);
      }
      const words = String(Math.round(l.top));
      if (t.text !== words) t.setText(words);
      t.setPosition((l.x0 + l.x1) / 2, TREE_GROUND - l.top - 7 * k).setScale(scale);
    }
  }

  debug(): PaintDebug {
    const ed = this.editor;
    const item = ed.selected ? find(ed.draft, ed.selected) : undefined;
    return {
      tool: ed.tool,
      ...this.statusOf(),
      readout: this.readoutOf(),
      own: ledgesOf(this.host.room).map((l) => l.id),
      drawn: this.drawn,
      labels: this.labels.size,
      selected: item && ed.selected ? { kind: ed.selected.kind, ...item } : null,
      suggestions: this.suggestions.map((s) => ({ ...s })),
      pending: ed.pending?.length ?? 0,
      trying: this.trying,
      unsaved: ed.unsaved,
      draft: JSON.parse(draftJson(ed.draft)) as MaskDraft,
    };
  }

  destroy(): void {
    this.gone = true;
    const input = this.host.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    window.removeEventListener('keydown', this.onKey);
    this.g.destroy();
    for (const t of this.labels.values()) t.destroy();
    this.labels.clear();
    this.panel.destroy();
  }
}
