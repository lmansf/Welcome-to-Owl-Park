#!/usr/bin/env node
// The kit room greybox (OP-234): draws a room built from the art kit as a flat PNG of its layout, the
// reference an artist paints a kit-guided hero screen over. It draws the room's kit plan
// (packages/shared/src/kit.ts) the way the park does, but in greys by what each piece is for, with the
// ground line, the ledges' tops, the doorways' triggers, the spawns and the screens' edges over it.
// With --placeholders it draws the kit's placeholder art instead of greys. No browser, no dependencies:
// a small rasterizer (packages/shared/src/raster.ts) and a PNG writer on node:zlib.
//
//   node tools/kit/greybox.mjs <room> [--out <file.png>] [--scale <k>] [--placeholders]
//   node tools/kit/greybox.mjs <room> --plan <file.json|->   (the drawing as data, for tools/kit/preview.py)
//   pnpm kit:greybox l4 --scale 0.5
//
// <room> is a kit room: one of ROOMS with a kit, or a kit room standing in for a painted one
// (KIT_DEMOS), or a kit room laid out ahead of its painted one (KIT_PREVIEWS). The PNG goes to
// work/kit/<room>-greybox.png by default (work/ is not committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The PNG of an RGBA raster ({ w, h, data }). */
export function encodePng({ w, h, data }) {
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    rows[y * (w * 4 + 1)] = 0; // no filter
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(rows, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Loads the shared room data and kit rules (TypeScript, its imports without extensions). */
export async function loadShared(repoRoot = REPO_ROOT) {
  if (!process.features?.typescript) throw new Error(`the greybox needs Node 22.18 or newer (type stripping on by default); this is Node ${process.versions.node}`);
  const hook = `
import { fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const p = fileURLToPath(new URL(specifier, context.parentURL));
    for (const t of [p, p + '.ts', p + '/index.ts']) {
      try { if (existsSync(t) && statSync(t).isFile()) return { url: 'file://' + t, shortCircuit: true }; } catch {}
    }
  }
  return next(specifier, context);
}`;
  register(`data:text/javascript,${encodeURIComponent(hook)}`, pathToFileURL(`${repoRoot}/`));
  const at = (...p) => import(pathToFileURL(path.join(repoRoot, 'packages', 'shared', ...p)).href);
  const [rooms, demos, kit, kitArt, ras] = await Promise.all([at('rooms', 'index.ts'), at('rooms', 'kit.ts'), at('src', 'kit.ts'), at('src', 'kitArt.ts'), at('src', 'raster.ts')]);
  return { rooms, demos, kit, kitArt, ras };
}

/** The greys by what a piece is for: its fill, and the edge drawn along its top (ledges and paths: where an owl stands). */
const GREYS = {
  surface: 0x464646,
  path: 0x8c8c8c,
  ledge: 0xb4b4b4,
  stair: 0xa0a0a0,
  door: 0x262626,
  barrier: 0x6e6e6e,
  prop: 0x7c7c7c,
  decal: 0x5a5a5a,
};
const BACK = 0x1c1c1c;
const MARK = { ground: 0x3c78c8, top: 0xf4f4f4, door: 0xe8c040, spawn: 0x40c870, screen: 0x505050, grid: 0x262626 };

/** Draws `src` (a piece's raster) into dst over the box at x, y, w, h, showing its part `crop` (piece px), nearest pixel, mirrored with flip. */
function blitScaled(ras, dst, src, crop, x, y, w, h, flip, alpha) {
  const x0 = Math.max(0, Math.ceil(x - 0.5));
  const x1 = Math.min(dst.w, Math.ceil(x + w - 0.5));
  const y0 = Math.max(0, Math.ceil(y - 0.5));
  const y1 = Math.min(dst.h, Math.ceil(y + h - 0.5));
  for (let py = y0; py < y1; py++) {
    const sy = Math.min(src.h - 1, Math.floor(crop.y + ((py + 0.5 - y) / h) * crop.h));
    for (let px = x0; px < x1; px++) {
      let u = (px + 0.5 - x) / w;
      if (flip) u = 1 - u;
      const sx = Math.min(src.w - 1, Math.floor(crop.x + u * crop.w));
      const i = (sy * src.w + sx) * 4;
      const a = (src.data[i + 3] / 255) * alpha;
      if (a > 0) ras.fillRect(dst, px, py, 1, 1, (src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2], a);
    }
  }
}

/** The greybox of kit room `room` at `scale` (room px to PNG px): an RGBA raster. */
export function renderGreybox(shared, room, { scale = 1, placeholders = false } = {}) {
  const { kit, kitArt, ras } = shared;
  const k = scale;
  const W = Math.round(room.size.w * k);
  const H = Math.round(room.size.h * k);
  const out = ras.raster(W, H, BACK);
  const pieces = new Map();
  const piece = (key) => {
    if (!pieces.has(key)) {
      const spec = kitArt.KIT_ART[key];
      const r = ras.raster(spec.w, spec.h);
      kitArt.drawOps(r, kitArt.kitPlaceholder(key) ?? []);
      pieces.set(key, r);
    }
    return pieces.get(key);
  };
  const ROOM_W = 1600;
  const ROOM_H = 900;
  if (placeholders) {
    // The backdrops as they line up with the room at rest (no parallax), the far ones first.
    for (const t of room.backgrounds ?? []) {
      const r = piece(t.key);
      blitScaled(ras, out, r, { x: 0, y: 0, w: r.w, h: r.h }, t.x * k, t.y * k, ROOM_W * k, ROOM_H * k, false, 1);
    }
  } else {
    for (let x = 0; x < room.size.w; x += 100) ras.fillRect(out, x * k, 0, 1, H, MARK.grid);
    for (let y = 0; y < room.size.h; y += 100) ras.fillRect(out, 0, y * k, W, 1, MARK.grid);
  }
  const plan = kit.kitDrawPlan(room);
  const order = ['back', 'play', 'piece', 'front'];
  for (const layer of order) {
    for (const d of plan.filter((p) => p.layer === layer)) {
      if (placeholders) {
        const r = piece(d.key);
        for (const c of kit.kitCells(d)) {
          // A cell's crop is the part of its box inside the piece's box: drawn where that part lies.
          const cx = c.x + (c.crop.x / r.w) * c.w;
          const cy = c.y + (c.crop.y / r.h) * c.h;
          blitScaled(ras, out, r, c.crop, cx * k, cy * k, (c.crop.w / r.w) * c.w * k, (c.crop.h / r.h) * c.h * k, !!d.flip, d.alpha ?? 1);
        }
        continue;
      }
      const alpha = d.role === 'decal' ? 0.5 : 1;
      ras.fillRect(out, d.x * k, d.y * k, d.w * k, d.h * k, GREYS[d.role], alpha);
      if (d.layer === 'front' || d.role === 'door') {
        // Outlined: a front piece stands in front of the owls; a doorway is a way through.
        const c = d.role === 'door' ? MARK.door : MARK.top;
        ras.fillRect(out, d.x * k, d.y * k, d.w * k, 2, c);
        ras.fillRect(out, d.x * k, (d.y + d.h) * k - 2, d.w * k, 2, c);
        ras.fillRect(out, d.x * k, d.y * k, 2, d.h * k, c);
        ras.fillRect(out, (d.x + d.w) * k - 2, d.y * k, 2, d.h * k, c);
      }
      if (d.role === 'barrier') for (let x = d.x; x < d.x + d.w; x += 16) ras.strokeLine(out, x * k, (d.y + d.h) * k, (x + 12) * k, d.y * k, 2, MARK.top, 0.6);
    }
  }
  if (placeholders) {
    // The overlay, over everything.
    for (const t of room.foregrounds ?? []) {
      const r = piece(t.key);
      blitScaled(ras, out, r, { x: 0, y: 0, w: r.w, h: r.h }, t.x * k, t.y * k, ROOM_W * k, ROOM_H * k, false, 1);
    }
  } else {
    const g = room.kit.ground;
    for (let s = 1; s * ROOM_W < room.size.w; s++) ras.fillRect(out, s * ROOM_W * k - 1, 0, 2, H, MARK.screen);
    ras.fillRect(out, 0, g * k - 1, W, 2, MARK.ground);
    for (const d of room.doors) {
      const top = d.top ?? 0;
      ras.fillRect(out, d.rect.x * k, (g - top - 6) * k, d.rect.w * k, 6 * k + 1, MARK.door, 0.8);
      if (d.markAt) ras.fillEllipse(out, d.markAt.x * k, d.markAt.y * k, 8 * k + 2, 8 * k + 2, MARK.door);
    }
    // Where an owl stands: the floor it walks and each perch's top.
    for (const [a, b] of kit.walkedAt(room, g, 0, 0, room.size.w)) ras.fillRect(out, a * k, g * k - 3, (b - a) * k, 3, MARK.top);
    for (const p of room.perches ?? []) {
      const xs = p.area.map((q) => q.x);
      ras.fillRect(out, Math.min(...xs) * k, (g - p.top) * k - 3, (Math.max(...xs) - Math.min(...xs)) * k, 3, MARK.top);
    }
    for (const s of Object.values(room.spawns)) {
      ras.fillRect(out, (s.x - 12) * k, s.y * k - 1, 24 * k, 3, MARK.spawn);
      ras.fillRect(out, s.x * k - 1, (s.y - 12) * k, 3, 24 * k, MARK.spawn);
    }
  }
  return out;
}

/**
 * A kit room's drawing as data (OP-241), for tools that composite the real art (tools/kit/preview.py):
 * its backdrop tiles, every image of its draw plan in drawing order, its doorways, perches and spawns.
 */
export function planOf(shared, room) {
  const { kit } = shared;
  const order = ['back', 'play', 'piece', 'front'];
  const plan = kit.kitDrawPlan(room);
  const images = order.flatMap((layer) =>
    plan
      .filter((d) => d.layer === layer)
      .flatMap((d) => kit.kitCells(d).map((c) => ({ key: d.key, layer, role: d.role, id: d.id, ...c, flip: !!d.flip, alpha: d.alpha ?? 1, tile: d.tile }))),
  );
  return {
    id: room.id,
    size: room.size,
    ground: room.kit.ground,
    owlScale: room.owlScale ?? 1,
    backgrounds: room.backgrounds ?? [],
    foregrounds: room.foregrounds ?? [],
    images,
    doors: room.doors,
    perches: (room.perches ?? []).map((p) => ({ id: p.id, top: p.top, x0: Math.min(...p.area.map((q) => q.x)), x1: Math.max(...p.area.map((q) => q.x)) })),
    spawns: room.spawns,
    problems: kit.kitProblems(room),
  };
}

/** The kit rooms the greybox can draw, by id. */
export function kitRooms(shared) {
  const out = { ...Object.fromEntries(Object.entries(shared.rooms.ROOMS).filter(([, r]) => r.kit)), ...shared.demos.KIT_DEMOS, ...(shared.demos.KIT_PREVIEWS ?? {}) };
  return out;
}

async function main(argv) {
  const args = argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const placeholders = args.includes('--placeholders');
  if (placeholders) args.splice(args.indexOf('--placeholders'), 1);
  const outArg = flag('--out');
  const scale = Number(flag('--scale') ?? '1');
  const planArg = flag('--plan');
  const id = args[0];
  const shared = await loadShared();
  const rooms = kitRooms(shared);
  if (!id || !rooms[id]) {
    console.error(`usage: node tools/kit/greybox.mjs <room> [--out <file.png>] [--scale <k>] [--placeholders] [--plan <file.json|->]\nkit rooms: ${Object.keys(rooms).join(', ') || '(none)'}`);
    return 2;
  }
  if (!(scale > 0 && scale <= 2)) {
    console.error('--scale is a number from just over 0 to 2');
    return 2;
  }
  if (planArg) {
    writeFileSync(planArg === '-' ? 1 : path.resolve(planArg), JSON.stringify(planOf(shared, rooms[id])));
    return 0;
  }
  const problems = shared.kit.kitProblems(rooms[id]);
  for (const p of problems) console.warn(`warning: ${p}`);
  const png = encodePng(renderGreybox(shared, rooms[id], { scale, placeholders }));
  const out = path.resolve(outArg ?? path.join(REPO_ROOT, 'work', 'kit', `${id}-${placeholders ? 'placeholders' : 'greybox'}.png`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(rooms[id].size.w * scale)} x ${Math.round(rooms[id].size.h * scale)}, ${png.length} bytes)`);
  if (!placeholders) console.log('greys: surface darkest, path, stair, ledge lightest; doorways dark, outlined gold; barriers hatched; front pieces outlined. White: where an owl stands. Blue: the ground line. Green: spawns.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv);
