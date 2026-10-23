#!/usr/bin/env node
/**
 * Preview finished art in the real game before it is published.
 *
 *   pnpm art:preview [--finals work/art/final] [--rooms hub,grove,market] [--out work/art/preview]
 *                    [--owls 4] [--views desktop,phone] [--keep-site]
 *
 * Builds the client once and makes two copies of it: "current", with the art in
 * apps/park/public/art as it is now, and "new", with every final PNG and WebP from the finals folder laid
 * over it (the matching placeholder SVG removed, since the loader prefers an SVG). Both are served
 * locally and each room is opened in a headless browser with a few visitor owls walking about
 * (local transport, no server or account). When the finals include a species' own layers
 * (`owl-barn-body` and so on), the visitors are owls of those species in their natural colours,
 * beside one great horned owl for scale. For every room and view it writes
 *   <out>/<room>-<view>-current.png, <room>-<view>-new.png and a side-by-side <room>-<view>-compare.png.
 * Nothing under apps/park changes. Needs the Playwright browser: `pnpm exec playwright install chromium`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const ROOMS = ['hub', 'grove', 'market', 'arcade', 'lobby', 'homes', 'nest'];

/** Which room shows each key. Owl layers and the blockades show in the hub (owls show everywhere). */
const ROOM_OF = {
  hub: 'hub', 'hub-fg': 'hub', grove: 'grove', 'grove-fg': 'grove', guardian: 'grove',
  market: 'market', 'market-fg': 'market', 'robot-owl': 'market',
};
/** Furniture (`decor-<id>`) stands in a nest. */
const roomOfKey = (k) => ROOM_OF[k] ?? (k.startsWith('decor-') ? 'nest' : ROOMS.find((r) => k === r || k.startsWith(`${r}-`)));

export const VIEWS = {
  desktop: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, showWidth: 960 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, showWidth: 360 },
};

/** Visitor looks from the client's own colour lists (packages/shared/src/look.ts). */
const LOOKS = [
  '#8B5A2B,#F6F1E3,#C9A227', '#2F3E5C,#E0D4F0,#00E5FF', '#7A5C99,#F2E1C1,#FF2AA1', '#3E6B48,#E8D8B8,#81B29A',
  '#D9C7A5,#BFC9D6,#6E3AFF', '#5C4033,#F6F1E3,#E07A5F', '#6B6B6B,#D6C7B0,#C9A227', '#A67B5B,#E0D4F0,#00E5FF',
];
/** Each species' natural colours, as in packages/shared/src/species.ts. */
export const SPECIES_LOOKS = {
  barn: '#D9A066,#FFF8EC,#A67B5B', burrowing: '#A67B5B,#F2E1C1,#5C4033', snowy: '#EDEAE0,#FFFFFF,#2F3E5C', screech: '#6B6B6B,#D6C7B0,#5C4033',
};

/**
 * The visitors' looks (`body,belly,accent[,species]`): one owl per species the finals bring, after
 * a great horned owl for scale, else the usual colour mix.
 */
export function previewLooks(keys, owls) {
  const species = Object.keys(SPECIES_LOOKS).filter((sp) => [...keys].some((k) => k.startsWith(`owl-${sp}-`)));
  if (!species.length) return Array.from({ length: owls }, (_, i) => LOOKS[i % LOOKS.length]);
  return [LOOKS[0], ...species.map((sp) => `${SPECIES_LOOKS[sp]},${sp}`)];
}

/** Where each owl walks, in room pixels; the client clamps a target to the walkable floor. */
const TARGETS = [[800, 770], [560, 700], [1040, 720], [420, 810], [1180, 800], [680, 840], [930, 650], [1300, 690]];

/** The walk targets, centred on room x `focus` (a wider room's arches, guardian or stalls) instead of the first screen. */
export function walkTargets(focus) {
  return focus === undefined ? TARGETS : TARGETS.map(([x, y]) => [x + focus - 800, y]);
}

export function loadKeys(toolsDir = TOOLS_DIR) {
  const assets = JSON.parse(fs.readFileSync(path.join(toolsDir, 'config', 'assets.json'), 'utf8'));
  return new Set(Object.keys(assets.keys ?? {}));
}

/** The finals in a folder that the loader would use: `<key>[@2x].webp` and `<key>[@2x].png` for known keys. */
export function scanFinals(dir, keys) {
  const files = [];
  if (!fs.existsSync(dir)) return { files, keys: new Set() };
  for (const name of fs.readdirSync(dir).sort()) {
    const m = /^([a-z][a-z0-9-]*)(@2x)?\.(?:png|webp)$/.exec(name);
    if (m && keys.has(m[1])) files.push({ name, key: m[1], two: Boolean(m[2]) });
  }
  return { files, keys: new Set(files.map((f) => f.key)) };
}

/** The rooms a set of replaced keys shows up in, in park order; owl layers and blockades alone mean the hub. */
export function roomsTouched(keys) {
  const set = new Set();
  // A screen of a wider room (`lobby-west`, `hub-east-fg`) shows in its room.
  for (const k of keys) set.add(roomOfKey(k) ?? 'hub');
  return ROOMS.filter((r) => set.has(r));
}

/**
 * Lay the finals over a built site's art folder; returns what it removed: the placeholder SVGs the
 * loader would prefer, and published files of the same keys that the finals replace (a PNG the new
 * WebP supersedes, a 2x the finish no longer has), as `publish` would.
 */
export function overlayFinals(siteDir, finalsDir, files) {
  const art = path.join(siteDir, 'art');
  fs.mkdirSync(art, { recursive: true });
  const removed = [];
  const incoming = new Set(files.map((f) => f.name));
  for (const key of new Set(files.map((f) => f.key))) {
    for (const name of [`${key}.svg`, `${key}.webp`, `${key}@2x.webp`, `${key}.png`, `${key}@2x.png`]) {
      if (!incoming.has(name) && fs.existsSync(path.join(art, name))) { fs.rmSync(path.join(art, name)); removed.push(name); }
    }
  }
  for (const f of files) fs.copyFileSync(path.join(finalsDir, f.name), path.join(art, f.name));
  return removed;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** A static file server for one folder on a free local port. Missing files are a plain 404. */
export function serve(root) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(base, `.${path.posix.normalize(rel)}`);
    if (file !== base && !file.startsWith(`${base}${path.sep}`)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

function buildSite(outDir) {
  const r = spawnSync('pnpm', ['--filter', '@owl-park/park', 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, VITE_TRANSPORT: 'local' },
  });
  if (r.status !== 0) throw new Error(`client build failed:\n${r.stderr || r.stdout}`);
}

async function until(fn, timeoutMs, stepMs = 150) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try { if (await fn()) return true; } catch { /* page still loading */ }
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

const stateOf = (page) => page.evaluate(() => window.owlPark?.state?.() ?? null);

/**
 * A nest to photograph: in the local mode every page of one browser is the same collector, whose
 * nest the street makes on its first visit (with the starter furniture in it).
 */
async function ownNest(ctx, base) {
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/?${new URLSearchParams({ transport: 'local', room: 'homes' })}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    let id = null;
    await until(async () => (id = (await stateOf(page))?.street?.[0]?.nestId ?? null) !== null, 30_000);
    if (!id) throw new Error('nest: the street made no nest');
    return `nest-${id}`;
  } finally {
    await page.close();
  }
}

/** One screenshot of one room in one view, one visitor per look, the first being the camera's. */
async function shoot(browser, base, room, view, looks, targets, file, warn) {
  const owls = looks.length;
  const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: view.deviceScaleFactor, isMobile: view.isMobile, hasTouch: view.hasTouch });
  try {
    const where = room === 'nest' ? await ownNest(ctx, base) : room;
    const pages = [];
    for (let i = 0; i < owls; i += 1) {
      const page = await ctx.newPage();
      // Only the first page is photographed; the other visitors just need to exist as peers, so
      // they get a tiny viewport and cost little to render (the game renders in software here).
      if (i > 0) await page.setViewportSize({ width: 160, height: 90 });
      const q = new URLSearchParams({ transport: 'local', room: where, id: `preview-${i}`, look: looks[i] });
      await page.goto(`${base}/?${q}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (!(await until(async () => (await stateOf(page))?.connected === true, 30_000))) throw new Error(`${room}: the park did not start`);
      pages.push(page);
    }
    const main = pages[0];
    if (!(await until(async () => (await stateOf(main))?.peers?.length >= owls - 1, 10_000))) warn(`${room}: only ${(await stateOf(main))?.peers?.length ?? 0} of ${owls - 1} other owls arrived`);
    await Promise.all(pages.map((p, i) => p.evaluate(([x, y]) => window.owlPark.walkTo(x, y), targets[i % targets.length])));
    await until(async () => (await Promise.all(pages.map(stateOf))).every((s) => s && !s.walking), 10_000);
    await until(async () => (await stateOf(main)).peers.every((p) => !p.walking), 5_000);
    await main.waitForTimeout(700); // camera follow and ambience settle
    await main.screenshot({ path: file });
  } finally {
    await ctx.close();
  }
}

/** Current and new side by side, labelled, as one image. */
async function compose(browser, current, next, view, file) {
  const w = view.showWidth;
  const h = Math.round((w * view.viewport.height) / view.viewport.width);
  const src = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  const fig = (label, f) => `<figure><figcaption>${label}</figcaption><img src="${src(f)}" width="${w}" height="${h}"></figure>`;
  const page = await browser.newPage({ viewport: { width: 2 * w + 48, height: h + 64 }, deviceScaleFactor: 1.5 });
  try {
    await page.setContent(`<!doctype html><style>
      body{margin:0;background:#0C1E36;color:#F6F1E3;font:600 18px system-ui,sans-serif}
      main{display:flex;gap:16px;padding:16px} figure{margin:0} figcaption{padding:0 0 8px} img{display:block;border-radius:6px}
    </style><main>${fig('Current', current)}${fig('New', next)}</main>`);
    await page.screenshot({ path: file, fullPage: true });
  } finally {
    await page.close();
  }
}

const USAGE = `usage: pnpm art:preview [--finals <dir>] [--rooms hub,grove,market] [--out <dir>] [--owls N] [--views desktop,phone] [--focus <room x>] [--keep-site]`;

export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const out = (s) => stdout.write(`${s}\n`);
  const err = (s) => stderr.write(`${s}\n`);
  let values;
  try {
    ({ values } = parseArgs({
      args: argv[0] === '--' ? argv.slice(1) : argv,
      options: {
        finals: { type: 'string' }, rooms: { type: 'string' }, out: { type: 'string' }, owls: { type: 'string' },
        views: { type: 'string' }, focus: { type: 'string' }, 'keep-site': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (e) { err(e.message); err(USAGE); return 2; }
  if (values.help) { out(USAGE); return 0; }

  const finalsDir = path.resolve(values.finals ?? path.join(REPO_ROOT, 'work', 'art', 'final'));
  const outDir = path.resolve(values.out ?? path.join(REPO_ROOT, 'work', 'art', 'preview'));
  const owls = values.owls === undefined ? 4 : Number(values.owls);
  if (!Number.isInteger(owls) || owls < 1 || owls > 8) { err('--owls must be 1 to 8'); return 2; }
  const focus = values.focus === undefined ? undefined : Number(values.focus);
  if (focus !== undefined && !(Number.isFinite(focus) && focus >= 0)) { err('--focus takes a room x in pixels'); return 2; }
  const targets = walkTargets(focus);
  const viewNames = (values.views ?? 'desktop,phone').split(',').map((s) => s.trim()).filter(Boolean);
  for (const v of viewNames) if (!VIEWS[v]) { err(`unknown view ${v} (${Object.keys(VIEWS).join(', ')})`); return 2; }

  const { files, keys } = scanFinals(finalsDir, loadKeys());
  if (!files.length) { err(`no final PNG or WebP files in ${path.relative(REPO_ROOT, finalsDir) || finalsDir}: run pnpm art:finish room|piece|overlay|owl first`); return 1; }
  const rooms = values.rooms ? values.rooms.split(',').map((s) => s.trim()).filter(Boolean) : roomsTouched(keys);
  for (const r of rooms) if (!ROOMS.includes(r)) { err(`unknown room ${r} (${ROOMS.join(', ')})`); return 2; }
  const looks = previewLooks(keys, owls);
  out(`new art: ${[...keys].join(', ')} (${files.length} file(s)); rooms: ${rooms.join(', ')}; views: ${viewNames.join(', ')}; owls: ${looks.length}`);

  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'owl-art-preview-'));
  const servers = [];
  let browser;
  try {
    const current = path.join(site, 'current');
    const next = path.join(site, 'new');
    buildSite(current);
    fs.cpSync(current, next, { recursive: true });
    const removed = overlayFinals(next, finalsDir, files);
    if (removed.length) out(`replaced in the new copy: ${removed.join(', ')}`);

    const a = await serve(current);
    const b = await serve(next);
    servers.push(a.server, b.server);
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch();
    fs.mkdirSync(outDir, { recursive: true });
    const written = [];
    for (const room of rooms) {
      for (const v of viewNames) {
        const view = VIEWS[v];
        const cur = path.join(outDir, `${room}-${v}-current.png`);
        const nxt = path.join(outDir, `${room}-${v}-new.png`);
        const cmp = path.join(outDir, `${room}-${v}-compare.png`);
        await shoot(browser, a.base, room, view, looks, targets, cur, (m) => err(`warning: current ${v} ${m}`));
        await shoot(browser, b.base, room, view, looks, targets, nxt, (m) => err(`warning: new ${v} ${m}`));
        await compose(browser, cur, nxt, view, cmp);
        written.push(cmp, nxt, cur);
        out(`${room} ${v}: ${path.relative(REPO_ROOT, cmp)}`);
      }
    }
    out(`wrote ${written.length} image(s) in ${path.relative(REPO_ROOT, outDir) || outDir}`);
    return 0;
  } catch (e) {
    err(`preview failed: ${e?.message ?? e}`);
    return 1;
  } finally {
    await browser?.close();
    for (const s of servers) s.close();
    if (values['keep-site']) out(`site kept at ${site}`);
    else fs.rmSync(site, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e?.stack ?? e}\n`); process.exitCode = 1; });
