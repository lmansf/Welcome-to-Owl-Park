#!/usr/bin/env node
// The art kit's catalogue for the level assembler (OP-241): writes packages/shared/src/kitCatalog.ts
// from the art tools' own list of what the kit holds (tools/art/kit.mjs, from tools/art/config/kit.json)
// and where each piece's art stands in its box (tools/kit/stand.json, from tools/kit/measure.py), so
// a kit room names the published pieces by their own keys and sizes and nothing is typed in twice.
//
//   node tools/kit/catalog.mjs           # rewrites packages/shared/src/kitCatalog.ts (pnpm kit:catalog)
//   node tools/kit/catalog.mjs --check   # exits 1 if it is out of date (the kit tests run this)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT, KIT_AREA_LAYERS, KIT_AREA_PIECES, KIT_AREA_TEXTURE_KEYS, KIT_COURSE_PIECES, KIT_HERO_LAYERS, KIT_LANDMARK_PIECES, KIT_PIECES, KIT_RECUT_PIECES, KIT_TEXTURE_KEYS } from '../art/kit.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CATALOG_FILE = path.join(REPO_ROOT, 'packages', 'shared', 'src', 'kitCatalog.ts');
const STAND_FILE = path.join(REPO_ROOT, 'tools', 'kit', 'stand.json');
export const SLOTS_FILE = path.join(REPO_ROOT, 'tools', 'kit', 'slots.json');
export const KIT_CSV = path.join(REPO_ROOT, 'tools', 'kit', 'realm-kit.csv');
const ART_DIR = path.join(REPO_ROOT, 'apps', 'park', 'public', 'art');
/** The realms with a kit of their own (OP-275), in the tree's order from the top. */
export const KIT_REALMS = ['glass', 'ink', 'clearing', 'neon'];

/** A line of the kit's CSV, split on its commas outside quotes. */
function csvCells(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) {
      out.push(cell);
      cell = '';
    } else cell += c;
  }
  out.push(cell);
  return out;
}

/** The realm kit's slots (tools/kit/realm-kit.csv, the realm asset list): what each realm's artist delivers. */
export function kitSlots() {
  const [head, ...rows] = readFileSync(KIT_CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const cols = csvCells(head);
  const size = (v) => v.split('x').map(Number);
  return rows.map((line) => {
    const r = Object.fromEntries(csvCells(line).map((v, i) => [cols[i], v]));
    const [w, h] = size(r.game_size_px);
    const [dw, dh] = size(r.deliver_size_px);
    const repeat = r.must_repeat_seamlessly === 'all four edges' ? 'xy' : r.must_repeat_seamlessly === 'left and right edges' ? 'x' : r.must_repeat_seamlessly === 'top and bottom edges' ? 'y' : 'none';
    return { id: r.id, slot: r.asset, w, h, deliverW: dw, deliverH: dh, opaque: r.background === 'opaque', repeat, anchor: r.anchor };
  });
}

/** What a slot's art is: a texture, a backdrop layer or a piece. */
function slotKind(slot) {
  if (slot.startsWith('texture-')) return 'texture';
  if (['sky', 'far', 'mid', 'start-screen'].includes(slot)) return 'layer';
  return 'piece';
}

/** Whether the build ships a key's own art. */
function published(key) {
  return ['webp', 'png', 'svg'].some((ext) => existsSync(path.join(ART_DIR, `${key}.${ext}`)));
}

/** A slot's stand-in key for a piece of today's kit: kit-<realm>-<slot>--<the piece's name>. */
export function slotVariant(realm, slot, key) {
  return `kit-${realm}-${slot}--${key.replace(/^kit-/, '')}`;
}

/** Every kit key with its logical size, kind and (for a measured piece) where its art's top and foot are. */
export function catalogEntries() {
  const stand = existsSync(STAND_FILE) ? JSON.parse(readFileSync(STAND_FILE, 'utf8')) : {};
  const t = KIT.texture_size;
  const out = [];
  for (const key of [...KIT_TEXTURE_KEYS, ...KIT_AREA_TEXTURE_KEYS]) out.push({ key, w: t, h: t, kind: 'texture' });
  for (const p of [...KIT_PIECES, ...KIT_AREA_PIECES, ...KIT_COURSE_PIECES, ...KIT_LANDMARK_PIECES, ...KIT_RECUT_PIECES]) {
    const s = stand[p.key];
    out.push({ key: p.key, w: p.w, h: p.h, kind: 'piece', ...(s ? { top: s[0], foot: s[1], left: s[2], right: s[3] } : {}), ...(s && s.length >= 7 ? { surface: [s[4], s[5], s[6]] } : {}) });
  }
  for (const l of KIT_AREA_LAYERS) out.push({ key: l.key, w: l.w, h: l.h, kind: 'layer' });
  for (const l of KIT_HERO_LAYERS) out.push({ key: l.key, w: l.w, h: l.h, kind: 'layer' });
  out.push(...slotEntries(out, stand));
  return out;
}

/**
 * The realm kit's slots (OP-275): kit-<realm>-<slot> for every slot of every realm, and a stand-in
 * key for each of today's pieces a realm's rooms draw in that slot. Until the realm's artist delivers
 * a slot, its key and its stand-ins show today's art (standIn names the key whose files and box they
 * take); a slot with nothing standing in shows the placeholder. Once delivered, all of them take the
 * slot's own art and box.
 */
function slotEntries(kit, stand) {
  const byKey = new Map(kit.map((e) => [e.key, e]));
  const { realms } = JSON.parse(readFileSync(SLOTS_FILE, 'utf8'));
  const out = [];
  const take = (key, from, slot, standIn) => {
    const { key: _k, slot: _s, standIn: _i, ...rest } = from;
    return { key, ...rest, slot, ...(standIn ? { standIn } : {}) };
  };
  for (const realm of KIT_REALMS) {
    const map = realms[realm] ?? { rows: [], slots: {} };
    // A recut row's caps stand in for the perch's end, its middles for its middle.
    const given = { ...map.slots };
    for (const row of map.rows ?? []) {
      const caps = [`${row}-cap-left`, `${row}-cap-right`].filter((k) => byKey.has(k));
      const mids = ['320', '480', '640'].map((l) => `${row}-mid-${l}`).filter((k) => byKey.has(k));
      given['perch-end'] = [...(given['perch-end'] ?? []), ...caps];
      given['perch-mid'] = [...(given['perch-mid'] ?? []), ...mids];
    }
    for (const s of kitSlots()) {
      const key = `kit-${realm}-${s.slot}`;
      const kind = slotKind(s.slot);
      const m = stand[key];
      // Unmeasured (not delivered yet, nothing standing in): the art fills its box.
      const box = m ? { top: m[0], foot: m[1], left: m[2], right: m[3] } : kind === 'piece' ? { top: 0, foot: s.h, left: 0, right: s.w } : {};
      const own = { key, w: s.w, h: s.h, kind, ...box };
      const delivered = published(key);
      const ins = given[s.slot] ?? [];
      for (const k of ins) if (!byKey.has(k)) throw new Error(`tools/kit/slots.json: ${realm} ${s.slot} names ${k}, which is not in the kit`);
      const first = ins[0] && byKey.get(ins[0]);
      out.push(delivered || !first ? { ...own, slot: s.slot } : take(key, first, s.slot, ins[0]));
      for (const k of ins) out.push(delivered ? take(slotVariant(realm, s.slot, k), own, s.slot) : take(slotVariant(realm, s.slot, k), byKey.get(k), s.slot, k));
    }
  }
  return out;
}

/** The catalogue module's source. */
export function catalogSource() {
  const slots = kitSlots();
  const lines = catalogEntries().map(
    (e) =>
      `  '${e.key}': { w: ${e.w}, h: ${e.h}, kind: '${e.kind}'${e.top === undefined ? '' : `, top: ${e.top}, foot: ${e.foot}, left: ${e.left}, right: ${e.right}`}${e.surface ? `, surface: [${e.surface.join(', ')}]` : ''}${e.slot ? `, slot: '${e.slot}'` : ''}${e.standIn ? `, standIn: '${e.standIn}'` : ''} },`,
  );
  return `// Generated by tools/kit/catalog.mjs from tools/art/config/kit.json and tools/kit/stand.json (OP-241).
// Do not edit: change the kit's config or re-measure the art, then run \`pnpm kit:catalog\`.

/** What a kit key is: a seamless texture, a piece cut from a keyed sheet, or a backdrop layer. */
export type KitArtKind = 'texture' | 'piece' | 'layer';

export interface KitCatalogEntry {
  /** Logical size in room pixels (the 1x file's size). */
  w: number;
  h: number;
  kind: KitArtKind;
  /** A measured piece: where its art's upper edge is across the middle half of its width, from its top (room px). */
  top?: number;
  /** A measured piece: the row under its lowest opaque one, from its top (room px). */
  foot?: number;
  /** A measured piece: its first opaque column and the one after its last, from its left (room px). */
  left?: number;
  right?: number;
  /** A rolling-ground piece (OP-238): its upper edge's row at its art's left end, middle and right end, from its top (room px). */
  surface?: readonly [number, number, number];
  /** A realm kit slot's key or a stand-in for one (OP-275): the slot (tools/kit/realm-kit.csv). */
  slot?: KitSlot;
  /** Until the slot's art is delivered: the key whose art and box it shows meanwhile. */
  standIn?: string;
}

/** The realms with a kit of their own (OP-275). */
export const KIT_REALMS = ${JSON.stringify(KIT_REALMS).replace(/"/g, "'").replace(/,/g, ', ')} as const;
export type KitRealm = (typeof KIT_REALMS)[number];

/** The realm kit's slots (tools/kit/realm-kit.csv): what each realm's artist delivers, at its size in the game, the size to deliver, and how it repeats. */
export const KIT_SLOT_SPECS = {
${slots.map((s) => `  '${s.slot}': { id: '${s.id}', w: ${s.w}, h: ${s.h}, deliverW: ${s.deliverW}, deliverH: ${s.deliverH}, opaque: ${s.opaque}, repeat: '${s.repeat}', anchor: '${s.anchor.replace(/'/g, "\\'")}' },`).join('\n')}
} as const;
export type KitSlot = keyof typeof KIT_SLOT_SPECS;
export const KIT_SLOTS = Object.keys(KIT_SLOT_SPECS) as KitSlot[];

/** Every piece of the published art kit, by key. */
export const KIT_CATALOG: Readonly<Record<string, KitCatalogEntry>> = {
${lines.join('\n')}
};
`;
}

function main(argv) {
  const src = catalogSource();
  if (argv.includes('--check')) {
    if (!existsSync(CATALOG_FILE) || readFileSync(CATALOG_FILE, 'utf8') !== src) {
      console.error('packages/shared/src/kitCatalog.ts is out of date: run pnpm kit:catalog');
      return 1;
    }
    return 0;
  }
  writeFileSync(CATALOG_FILE, src);
  console.log(`wrote ${path.relative(process.cwd(), CATALOG_FILE)} (${src.split('\n').filter((l) => l.startsWith("  'kit-")).length} keys)`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv);
