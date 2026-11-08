import { ROOM_W, TREE_LEVEL_MAX, doorTarget, mapOf, treeLevelOf, type RoomDef } from '@owl-park/shared';
import { ROOMS } from '../rooms';

/**
 * The tree's minimap (OP-213): on a computer, a small panel at the top left, under the top bar, so a
 * visitor knows where in the tree its owl is. The six levels stand as bands, the lowest at the bottom;
 * each level's rooms are short strips at their band, as far west or east of the trunk as they lie; each
 * doorway is a small mark on its strip, a stair's reaching toward the level it leads to; a bright dot
 * is the owl, moving along its strip as it walks; and the level's name is under the map. Drawn in code
 * (SVG), no pictures. It shows only in the tree's rooms, and not on a phone, over a covering screen, or
 * while the Menu or another panel is open.
 *
 * TODO-DOCS (OP-213): docs/MAP.md (the tools, or a section of its own): the minimap, its level names
 * and where each room lies on it (`TREE_ROOM_SCREENS`); docs/MENU.md or the HUD's notes: shown on a
 * computer only, top left under the top bar, clear of the feedback bug.
 */

/** The levels' names on the minimap, level 0 first (the owner's words, OP-213). */
export const TREE_LEVEL_NAMES: readonly string[] = ['Underground', 'Ground level', 'Low branches', 'High branches', 'Sky landing', 'Top of the canopy'];

/**
 * Where each room of the tree begins on its level, in screens from the trunk's (0; west negative), as
 * docs/MAP.md's grid has them: a room's screens run east from there, one a ROOM_W of its width.
 */
export const TREE_ROOM_SCREENS: Readonly<Record<string, number>> = {
  l0: -1,
  'l0-arcade': 1,
  l1: -1,
  l2: -2,
  l3: 0,
  l4: 0,
  'l5-street': -2,
  l5: 1,
};

/** The panel's map, in its own px (the SVG's view box): its width, a band's height, and the room left at its sides. */
export const MINIMAP_SIZE = { w: 196, band: 18, pad: 6, strip: 6 } as const;

export interface MinimapStrip {
  room: string;
  /** Its west end and width on the map (px). */
  x: number;
  w: number;
}

export interface MinimapBand {
  level: number;
  name: string;
  /** The band's middle (px from the map's top), where its strips and the owl's dot lie. */
  y: number;
  strips: MinimapStrip[];
}

export interface MinimapMark {
  room: string;
  door: string;
  x: number;
  /** From its strip (`y0`) to `y1`: toward the level a stair leads to, or a short tick for a doorway on the level. */
  y0: number;
  y1: number;
  stair: boolean;
}

export interface MinimapLayout {
  w: number;
  h: number;
  bands: MinimapBand[];
  marks: MinimapMark[];
  /** Px per screen, and the map's x of the westmost screen's west edge. */
  perScreen: number;
  west: number;
}

/** A room's place on the tree, or null for one that is not a room of the tree's levels. */
function placeOf(room: RoomDef): { level: number; from: number } | null {
  if (mapOf(room) !== 2) return null;
  const level = treeLevelOf(room.id);
  const from = TREE_ROOM_SCREENS[room.id];
  return level === null || from === undefined ? null : { level, from };
}

/** The band's middle for `level`: level 0 at the bottom, the canopy at the top. */
function bandY(level: number): number {
  return MINIMAP_SIZE.pad + (TREE_LEVEL_MAX - level) * MINIMAP_SIZE.band + MINIMAP_SIZE.band / 2;
}

/** The minimap of `rooms` (the tree's, by default): bands, strips and doorway marks, scaled to fit its width. */
export function minimapLayout(rooms: readonly RoomDef[] = Object.values(ROOMS)): MinimapLayout {
  const placed = rooms.flatMap((room) => {
    const at = placeOf(room);
    return at ? [{ room, ...at, screens: room.size.w / ROOM_W }] : [];
  });
  const westmost = Math.min(0, ...placed.map((p) => p.from));
  const eastmost = Math.max(1, ...placed.map((p) => p.from + p.screens));
  const { w, pad } = MINIMAP_SIZE;
  const perScreen = (w - 2 * pad) / (eastmost - westmost);
  const west = pad - westmost * perScreen;
  const bands: MinimapBand[] = [];
  for (let level = 0; level <= TREE_LEVEL_MAX; level++) {
    bands.push({
      level,
      name: TREE_LEVEL_NAMES[level] ?? '',
      y: bandY(level),
      strips: placed
        .filter((p) => p.level === level)
        .sort((a, b) => a.from - b.from)
        .map((p) => ({ room: p.room.id, x: west + p.from * perScreen, w: p.screens * perScreen })),
    });
  }
  const marks: MinimapMark[] = [];
  const reach = MINIMAP_SIZE.band / 2;
  for (const p of placed) {
    for (const door of p.room.doors) {
      // The tree's own ways (a tree owl's), as an owl walking the tree takes them.
      const to = doorTarget(door, 2);
      if (!to) continue;
      const toRoom = rooms.find((r) => r.id === to.room);
      const toLevel = toRoom ? placeOf(toRoom)?.level : undefined;
      const x = west + (p.from + (door.rect.x + door.rect.w / 2) / ROOM_W) * perScreen;
      const y0 = bandY(p.level);
      const stair = toLevel !== undefined && toLevel !== p.level;
      // A stair reaches halfway to the next band toward its level; any other doorway is a short tick over its strip.
      const y1 = stair ? y0 + (toLevel > p.level ? -reach : reach) : y0 - MINIMAP_SIZE.strip;
      marks.push({ room: p.room.id, door: door.id, x, y0, y1, stair });
    }
  }
  return { w, h: 2 * pad + (TREE_LEVEL_MAX + 1) * MINIMAP_SIZE.band, bands, marks, perScreen, west };
}

/** Where the owl's dot lies on `layout` for an owl at `x` (room px) in room `roomId`, kept on its strip; null for a room not on the map. */
export function owlOnMinimap(layout: MinimapLayout, roomId: string, x: number): { x: number; y: number; level: number } | null {
  for (const band of layout.bands) {
    const strip = band.strips.find((s) => s.room === roomId);
    if (!strip) continue;
    const width = (ROOMS[roomId]?.size.w ?? ROOM_W) || ROOM_W;
    const t = Math.min(1, Math.max(0, x / width));
    return { x: strip.x + t * strip.w, y: band.y, level: band.level };
  }
  return null;
}

/** The level's name for a room of the tree (null for any other room). */
export function levelNameOf(roomId: string): string | null {
  const level = treeLevelOf(roomId);
  return level === null || TREE_ROOM_SCREENS[roomId] === undefined ? null : (TREE_LEVEL_NAMES[level] ?? null);
}

const CSS = `
#hud .tree-map{display:none;position:absolute;z-index:5;top:calc(max(10px,env(safe-area-inset-top)) + 52px);left:max(12px,env(safe-area-inset-left));width:220px;padding:8px 12px 7px;
  background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:12px;backdrop-filter:blur(6px);pointer-events:none}
#hud .tree-map svg{display:block;width:196px;height:auto;overflow:visible}
#hud .tree-map .band{fill:rgba(246,241,227,.05)}
#hud .tree-map .band.here{fill:rgba(255,211,106,.14)}
#hud .tree-map .strip{fill:rgba(246,241,227,.42)}
#hud .tree-map .strip.here{fill:#F6F1E3}
#hud .tree-map .mark{stroke:#C9A227;stroke-width:2;stroke-linecap:round}
#hud .tree-map .mark.stair{stroke:#FFD36A}
#hud .tree-map .owl{fill:#FFD36A;stroke:#0C1E36;stroke-width:1.5;filter:drop-shadow(0 0 3px rgba(255,211,106,.9))}
#hud .tree-map .name{margin-top:5px;font-size:13px;font-weight:700;color:#FFD36A;letter-spacing:.02em;text-align:center}
/* A computer's screen only (a fine pointer that hovers), wide and tall enough to keep it clear of the feedback bug halfway down the left edge. */
@media (hover:hover) and (pointer:fine) and (min-width:761px) and (min-height:560px){#hud .tree-map.show{display:block}}
#hud.covered .tree-map,#hud.at-home .tree-map{display:none}
`;

const SVG = 'http://www.w3.org/2000/svg';

export interface TreeMinimap {
  readonly el: HTMLElement;
  /** The owl in room `roomId` at `x` (room px), or null out of the tree; `blocked` hides it while a panel is open. */
  set(spot: { room: string; x: number } | null, blocked: boolean): void;
}

/** The minimap panel in the HUD's root, hidden until `set` puts an owl in a room of the tree. */
export function createTreeMinimap(root: HTMLElement): TreeMinimap {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const layout = minimapLayout();
  const el = document.createElement('div');
  el.className = 'tree-map';
  el.dataset['treeMap'] = '';
  el.setAttribute('role', 'img');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${layout.w} ${layout.h}`);
  svg.setAttribute('aria-hidden', 'true');
  const node = (tag: string, attrs: Record<string, string | number>, cls: string): SVGElement => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    n.setAttribute('class', cls);
    svg.appendChild(n);
    return n;
  };
  const bandEls = new Map<number, SVGElement>();
  const stripEls = new Map<string, SVGElement>();
  const { band: bh, strip: sh } = MINIMAP_SIZE;
  for (const b of layout.bands) {
    bandEls.set(b.level, node('rect', { x: 0, y: b.y - bh / 2 + 1, width: layout.w, height: bh - 2, rx: 3 }, 'band'));
    for (const s of b.strips) {
      const strip = node('rect', { x: s.x + 0.5, y: b.y - sh / 2, width: Math.max(1, s.w - 1), height: sh, rx: sh / 2 }, 'strip');
      strip.dataset['room'] = s.room;
      stripEls.set(s.room, strip);
    }
  }
  for (const m of layout.marks) node('line', { x1: m.x, y1: m.y0, x2: m.x, y2: m.y1 }, m.stair ? 'mark stair' : 'mark');
  const owl = node('circle', { cx: 0, cy: 0, r: 4.5 }, 'owl');
  owl.dataset['owl'] = '';
  const name = document.createElement('div');
  name.className = 'name';
  name.dataset['level'] = '';
  el.append(svg, name);
  root.appendChild(el);

  let shownRoom: string | null = null;
  let shownAt = '';
  return {
    el,
    set(spot, blocked) {
      const at = spot ? owlOnMinimap(layout, spot.room, spot.x) : null;
      el.classList.toggle('show', !!at && !blocked);
      if (!spot || !at) return;
      if (spot.room !== shownRoom) {
        shownRoom = spot.room;
        for (const [room, s] of stripEls) s.classList.toggle('here', room === spot.room);
        for (const [level, b] of bandEls) b.classList.toggle('here', level === at.level);
        const level = TREE_LEVEL_NAMES[at.level] ?? '';
        name.textContent = level;
        el.setAttribute('aria-label', `Where you are in the tree: ${level}`);
      }
      // Moved a whole map px or more: the dot follows (an unchanged frame touches no DOM).
      const key = `${Math.round(at.x)},${Math.round(at.y)}`;
      if (key === shownAt) return;
      shownAt = key;
      owl.setAttribute('cx', at.x.toFixed(1));
      owl.setAttribute('cy', String(at.y));
    },
  };
}
