#!/usr/bin/env node
/**
 * Art generator: stage 1 of the art pipeline (see tools/art/README.md).
 *
 * Reads the job list in prompts.mjs, builds one request per job and variant for a provider
 * (`mock` offline, `ark` for BytePlus ModelArk / Volcengine Ark, `fal` for fal.ai), caches by a
 * hash of the request, downloads raw candidates into the work directory with a JSON sidecar
 * each, and appends to a provenance log. Node 22, ES modules, built-ins only.
 *
 *   node tools/art/generate.mjs [run] [--provider mock|ark|fal] [--only k1,k2] [--variants N]
 *                               [--seed S] [--dry-run] [--out work/art] [--now ISO] ...
 *   node tools/art/generate.mjs list <key>
 *   node tools/art/generate.mjs select <key> <hash16|latest>
 *   node tools/art/generate.mjs cost
 *   node tools/art/generate.mjs geometry
 *
 * Secrets (ARK_API_KEY, FAL_KEY) are read from the environment only and are never printed.
 */
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(TOOLS_DIR, '..', '..');
export const PUBLIC_ART_DIR = path.join(REPO_ROOT, 'apps', 'park', 'public', 'art');
export const ASSETS_FILE = path.join(TOOLS_DIR, 'config', 'assets.json');

export const KEY_RE = /^[a-z][a-z0-9-]*$/;
export const SIZE_RE = /^(\d{2,5})x(\d{2,5})$/;
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
export const KINDS = ['room', 'overlay', 'piece', 'owl', 'owl-edit', 'anchor'];
const KEYED_KINDS = new Set(['overlay', 'piece', 'owl', 'owl-edit']);

// ---------------------------------------------------------------------------------------------
// Small helpers

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function hexToRgb(hex) {
  if (!HEX_RE.test(hex)) throw new Error(`bad colour ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Deterministic JSON: object keys sorted recursively, no whitespace, undefined dropped. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function parseSize(size) {
  const m = SIZE_RE.exec(String(size));
  if (!m) throw new Error(`size must be WxH, got ${size}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

function globToRegExp(glob) {
  return new RegExp(`^${glob.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
}

async function writeFileAtomic(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

const trim = (s, n = 500) => (s.length > n ? `${s.slice(0, n)}...` : s);

/** A path for messages: relative when it is under the current directory, else absolute. */
function showPath(p) {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith('..') ? rel : p;
}

// ---------------------------------------------------------------------------------------------
// PNG codec on node:zlib. Encoding writes IHDR, one IDAT and IEND only (no ancillary chunks),
// filter type 0 on every scanline and a fixed deflate level, so the same pixels give the same
// bytes on every run.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(data, crc32(typeBuf)) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode 8-bit RGB (channels 3) or RGBA (channels 4) pixels as a PNG. */
export function encodePng({ width, height, channels, data, level = 6 }) {
  if (channels !== 3 && channels !== 4) throw new Error('channels must be 3 or 4');
  if (data.length !== width * height * channels) throw new Error('pixel buffer size does not match');
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level })), pngChunk('IEND', Buffer.alloc(0))]);
}

export const isPng = (buf) => buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG);
export const isWebp = (buf) => buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
export const isJpeg = (buf) => buf.length >= 3 && buf.subarray(0, 3).equals(JPEG_SIG);

/** Read the header and the chunk list of a PNG, verifying every chunk's CRC. */
export function parsePng(buf) {
  if (!isPng(buf)) throw new Error('not a PNG (bad signature)');
  const chunks = [];
  let off = 8;
  let info = null;
  while (off + 12 <= buf.length) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (off + 12 + length > buf.length) throw new Error(`truncated PNG chunk ${type}`);
    const data = buf.subarray(off + 8, off + 8 + length);
    const expect = crc32(data, crc32(buf.subarray(off + 4, off + 8))) >>> 0;
    if (buf.readUInt32BE(off + 8 + length) !== expect) throw new Error(`bad CRC in PNG chunk ${type}`);
    if (type === 'IHDR') info = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9] };
    chunks.push({ type, length });
    off += 12 + length;
    if (type === 'IEND') break;
  }
  if (!info) throw new Error('PNG has no IHDR');
  return { ...info, chunks };
}

/** Width and height from a JPEG's start-of-frame marker. */
export function parseJpegSize(buf) {
  if (!isJpeg(buf)) throw new Error('not a JPEG');
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) { off += 1; continue; }
    const marker = buf[off + 1];
    if (marker === 0xff) { off += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    if (marker === 0xd9 || marker === 0xda) break;
    off += 2 + len;
  }
  throw new Error('JPEG has no start-of-frame marker');
}

/** Identify downloaded bytes: format, extension and pixel size. */
export function inspectImage(buf) {
  if (isPng(buf)) {
    const { width, height } = parsePng(buf);
    return { format: 'png', ext: 'png', width, height };
  }
  if (isJpeg(buf)) {
    const { width, height } = parseJpegSize(buf);
    return { format: 'jpg', ext: 'jpg', width, height };
  }
  throw new Error('downloaded data is neither PNG nor JPEG');
}

// ---------------------------------------------------------------------------------------------
// A tiny software rasterizer for the mock provider.

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** xorshift32: returns a function giving floats in [0, 1). */
export function xorshift32(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const darker = (rgb, k) => rgb.map((c) => Math.round(c * k));
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

export class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.channels = 3;
    this.data = new Uint8Array(width * height * 3);
  }

  fill(rgb) {
    for (let i = 0; i < this.data.length; i += 3) { this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; }
  }

  get(x, y) {
    const i = (y * this.width + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  blend(x, y, rgb, a) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 3;
    if (a >= 1) { this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; return; }
    this.data[i] = Math.round(this.data[i] + (rgb[0] - this.data[i]) * a);
    this.data[i + 1] = Math.round(this.data[i + 1] + (rgb[1] - this.data[i + 1]) * a);
    this.data[i + 2] = Math.round(this.data[i + 2] + (rgb[2] - this.data[i + 2]) * a);
  }

  fillRect(x0, y0, w, h, rgb) {
    const xa = Math.max(0, Math.round(x0)); const ya = Math.max(0, Math.round(y0));
    const xb = Math.min(this.width, Math.round(x0 + w)); const yb = Math.min(this.height, Math.round(y0 + h));
    for (let y = ya; y < yb; y += 1) for (let x = xa; x < xb; x += 1) this.blend(x, y, rgb, 1);
  }

  /** Vertical gradient from `top` at y0 to `bottom` at y0 + h. */
  gradientV(x0, y0, w, h, top, bottom) {
    const xa = Math.max(0, Math.round(x0)); const ya = Math.max(0, Math.round(y0));
    const xb = Math.min(this.width, Math.round(x0 + w)); const yb = Math.min(this.height, Math.round(y0 + h));
    for (let y = ya; y < yb; y += 1) {
      const c = mix(top, bottom, (y - y0) / Math.max(1, h));
      for (let x = xa; x < xb; x += 1) this.blend(x, y, c, 1);
    }
  }

  /**
   * Anti-aliased ellipse. `shadeBelow` (0..1 of the ellipse height from the top) darkens the
   * lower part by `shadeK`; `spill` tints a ring just inside the edge toward a colour, which is
   * how the mock reproduces key-colour spill for the post stage's despill to remove.
   */
  fillEllipse(cx, cy, rx, ry, rgb, opts = {}) {
    const { shadeBelow = null, shadeK = 0.7, spill = null } = opts;
    const xa = Math.max(0, Math.floor(cx - rx - 1)); const xb = Math.min(this.width - 1, Math.ceil(cx + rx + 1));
    const ya = Math.max(0, Math.floor(cy - ry - 1)); const yb = Math.min(this.height - 1, Math.ceil(cy + ry + 1));
    const rAvg = (rx + ry) / 2;
    const dark = darker(rgb, shadeK);
    for (let y = ya; y <= yb; y += 1) {
      for (let x = xa; x <= xb; x += 1) {
        const dx = (x + 0.5 - cx) / rx; const dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        const a = clamp01((1 - d) * rAvg + 0.5);
        if (a <= 0) continue;
        let c = shadeBelow !== null && y + 0.5 > cy - ry + 2 * ry * shadeBelow ? dark : rgb;
        if (spill && (1 - d) * rAvg < spill.width) c = mix(c, spill.colour, spill.amount);
        this.blend(x, y, c, a);
      }
    }
  }

  /** Thin anti-aliased line (for lids and tendrils). */
  line(x0, y0, x1, y1, width, rgb) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      this.fillEllipse(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, width / 2, rgb);
    }
  }

  toPng() {
    return encodePng({ width: this.width, height: this.height, channels: 3, data: this.data });
  }
}

// ---------------------------------------------------------------------------------------------
// Forbidden-word check. The list is private: it comes from OWL_PARK_FORBIDDEN or
// ART_FORBIDDEN_WORDS (comma separated), ART_FORBIDDEN_WORDS_FILE, or the gitignored
// tools/art/.local/forbidden-words.txt (one entry per line, `#` comments). Entries starting with
// `=` match whole words only; the rest match as case-insensitive substrings. Without a list the
// check is a no-op. Matches are reported on stderr only and never written to any file.

export function loadForbidden(env = process.env, toolsDir = TOOLS_DIR) {
  const words = [];
  const sources = [];
  const split = (s) => s.split(',').map((w) => w.trim()).filter(Boolean);
  if (env.OWL_PARK_FORBIDDEN) { words.push(...split(env.OWL_PARK_FORBIDDEN)); sources.push('OWL_PARK_FORBIDDEN'); }
  if (env.ART_FORBIDDEN_WORDS) { words.push(...split(env.ART_FORBIDDEN_WORDS)); sources.push('ART_FORBIDDEN_WORDS'); }
  const file = env.ART_FORBIDDEN_WORDS_FILE || path.join(toolsDir, '.local', 'forbidden-words.txt');
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    words.push(...lines);
    sources.push(env.ART_FORBIDDEN_WORDS_FILE ? 'ART_FORBIDDEN_WORDS_FILE' : 'tools/art/.local/forbidden-words.txt');
  }
  if (!words.length) return null;
  const entries = [...new Set(words.map((w) => w.toLowerCase()))].map((w) => (w.startsWith('=') ? { word: w.slice(1), whole: true } : { word: w, whole: false })).filter((e) => e.word);
  return { entries, sources };
}

export function findForbidden(text, list) {
  if (!list || typeof text !== 'string' || !text) return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const { word, whole } of list.entries) {
    if (whole) {
      const re = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
      if (re.test(lower)) hits.push(word);
    } else if (lower.includes(word)) hits.push(word);
  }
  return hits;
}

/** Walk any JSON-like value and return the forbidden words found in its strings. */
export function findForbiddenDeep(value, list) {
  if (!list) return [];
  const hits = new Set();
  const walk = (v) => {
    if (typeof v === 'string') findForbidden(v, list).forEach((h) => hits.add(h));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { findForbidden(k, list).forEach((h) => hits.add(h)); walk(x); });
  };
  walk(value);
  return [...hits];
}

// ---------------------------------------------------------------------------------------------
// Job list: validation, prompt expansion, selection and variants.

export function loadAssets(file = ASSETS_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Replace `@block` items and `{key_colour}` and join the prompt into one string. */
export function expandPrompt(prompt, blocks, job) {
  const parts = Array.isArray(prompt) ? prompt : [prompt];
  const out = parts.map((p) => {
    if (typeof p !== 'string') throw new Error(`job ${job.key}: prompt parts must be strings`);
    if (p.startsWith('@')) {
      const name = p.slice(1);
      if (!(name in blocks)) throw new Error(`job ${job.key}: unknown prompt block @${name}`);
      return blocks[name];
    }
    return p;
  });
  return out.join(' ').replace(/\{key_colour\}/g, () => {
    if (!job.key_colour) throw new Error(`job ${job.key}: prompt uses {key_colour} but the job has none`);
    return job.key_colour;
  }).replace(/\s+/g, ' ').trim();
}

function normaliseRef(entry, job) {
  const r = typeof entry === 'string' ? { ref: entry } : entry;
  if (!r || typeof r.ref !== 'string') throw new Error(`job ${job.key}: bad ref entry`);
  const ok = r.ref.startsWith('refs/') || r.ref.startsWith('@guide:') || r.ref.startsWith('@raw:') || r.ref.startsWith('@final:') || r.ref.startsWith('https://');
  if (!ok) throw new Error(`job ${job.key}: ref ${r.ref} must be refs/<file>, @guide:<room>, @raw:<key>, @final:<key> or https://...`);
  if (r.ref.includes('..')) throw new Error(`job ${job.key}: ref ${r.ref} may not contain ..`);
  if (/^@(guide|raw|final):/.test(r.ref) && !KEY_RE.test(r.ref.split(':')[1])) throw new Error(`job ${job.key}: ref ${r.ref} names an invalid key`);
  return { ref: r.ref, role: r.role ?? '', optional: Boolean(r.optional) };
}

/**
 * Validate the job list against the public key list and return normalised jobs with the prompt
 * expanded. Throws on the first problem. Runs the forbidden-word check when a list is given.
 */
export function validateJobs(jobs, { assets, helperKeys = [], blocks = {}, forbidden = null } = {}) {
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('job list is empty');
  const allowed = new Set([...Object.keys(assets?.keys ?? {}), ...helperKeys]);
  const seen = new Set();
  const out = [];
  for (const job of jobs) {
    if (!job || typeof job !== 'object') throw new Error('job entries must be objects');
    const { key } = job;
    if (typeof key !== 'string' || !KEY_RE.test(key)) throw new Error(`invalid job key ${JSON.stringify(key)} (expected ${KEY_RE})`);
    if (!allowed.has(key)) throw new Error(`job key ${key} is not a public asset key or helper key`);
    if (seen.has(key)) throw new Error(`duplicate job key ${key}`);
    seen.add(key);
    if (!KINDS.includes(job.kind)) throw new Error(`job ${key}: kind must be one of ${KINDS.join(', ')}`);
    if (typeof job.realm !== 'string' || !KEY_RE.test(job.realm)) throw new Error(`job ${key}: realm must be a public id`);
    const { width, height } = parseSize(job.size);
    const seed = job.seed ?? null;
    if (seed !== null && !Number.isInteger(seed)) throw new Error(`job ${key}: seed must be an integer`);
    const variants = job.variants ?? null;
    if (variants !== null && (!Number.isInteger(variants) || variants < 1)) throw new Error(`job ${key}: variants must be a positive integer`);
    if (job.key_colour !== undefined && !HEX_RE.test(job.key_colour)) throw new Error(`job ${key}: key_colour must be #RRGGBB`);
    if (KEYED_KINDS.has(job.kind) && !job.key_colour) throw new Error(`job ${key}: kind ${job.kind} needs a key_colour`);
    if (job.regions !== undefined) {
      for (const [name, hex] of Object.entries(job.regions)) if (!HEX_RE.test(hex)) throw new Error(`job ${key}: region ${name} must be #RRGGBB`);
    }
    if (job.derives !== undefined) {
      if (!Array.isArray(job.derives)) throw new Error(`job ${key}: derives must be an array`);
      for (const d of job.derives) if (!(d in (assets?.keys ?? {}))) throw new Error(`job ${key}: derives unknown asset key ${d}`);
    }
    const prompt = expandPrompt(job.prompt, blocks, job);
    if (!prompt) throw new Error(`job ${key}: empty prompt`);
    const refs = (job.refs ?? []).map((r) => normaliseRef(r, job));
    if (job.providers !== undefined && (typeof job.providers !== 'object' || Array.isArray(job.providers))) throw new Error(`job ${key}: providers must be an object`);
    out.push({ ...job, key, width, height, seed, variants, prompt, refs, optional: Boolean(job.optional) });
  }
  if (forbidden) {
    const hits = findForbiddenDeep({ jobs: out, blocks }, forbidden);
    if (hits.length) throw new Error(`forbidden words in the job list: ${hits.join(', ')}`);
  }
  return out;
}

/** `--only a,b,owl-*` filtering; throws when a pattern matches nothing. */
export function selectJobs(jobs, only) {
  if (!only) return jobs;
  const patterns = only.split(',').map((p) => p.trim()).filter(Boolean);
  const chosen = [];
  for (const pat of patterns) {
    const re = globToRegExp(pat);
    const hits = jobs.filter((j) => re.test(j.key));
    if (!hits.length) throw new Error(`--only ${pat} matches no job`);
    for (const j of hits) if (!chosen.includes(j)) chosen.push(j);
  }
  return chosen;
}

/** Seeds for the variants of a job: base, base + 1, ... */
export function variantSeeds(job, { variants = null, seed = null, defaults = {} } = {}) {
  const n = variants ?? job.variants ?? defaults.variants ?? 1;
  const base = seed ?? job.seed ?? defaults.seed ?? 1000;
  return Array.from({ length: n }, (_, i) => base + i);
}

// ---------------------------------------------------------------------------------------------
// Reference images.

export function refLocation(ref, { workDir, toolsDir = TOOLS_DIR, publicArtDir = PUBLIC_ART_DIR }) {
  if (ref.startsWith('https://')) return { kind: 'url', url: ref };
  if (ref.startsWith('refs/')) return { kind: 'file', file: path.join(toolsDir, ref) };
  if (ref.startsWith('@guide:')) return { kind: 'file', file: path.join(workDir, 'guides', `${ref.slice(7)}.png`) };
  if (ref.startsWith('@final:')) {
    // Rooms publish as WebP, everything else as PNG.
    const png = path.join(publicArtDir, `${ref.slice(7)}.png`);
    const webp = path.join(publicArtDir, `${ref.slice(7)}.webp`);
    return { kind: 'file', file: !fs.existsSync(png) && fs.existsSync(webp) ? webp : png };
  }
  if (ref.startsWith('@raw:')) {
    const key = ref.slice(5);
    const dir = path.join(workDir, 'raw', key);
    const marker = path.join(dir, 'SELECTED');
    if (!fs.existsSync(marker)) return { kind: 'file', file: null, reason: `no SELECTED candidate for ${key} (run: generate.mjs select ${key} <hash16|latest>)` };
    const hash16 = fs.readFileSync(marker, 'utf8').trim();
    for (const ext of ['png', 'jpg']) {
      const f = path.join(dir, `${hash16}.${ext}`);
      if (fs.existsSync(f)) return { kind: 'file', file: f };
    }
    return { kind: 'file', file: null, reason: `SELECTED candidate ${hash16} of ${key} has no image file` };
  }
  throw new Error(`unknown ref form ${ref}`);
}

/**
 * Resolve a job's reference slots to bytes (or URLs). Missing optional slots are returned with
 * status `missing`; a missing required slot throws.
 */
export function resolveRefs(job, ctx) {
  const out = [];
  for (const slot of job.refs) {
    const required = ctx.requireRefs || !slot.optional;
    const loc = refLocation(slot.ref, ctx);
    if (loc.kind === 'url') { out.push({ ...slot, status: 'ok', url: loc.url, token: loc.url, sha256: null, bytes: null }); continue; }
    if (!loc.file || !fs.existsSync(loc.file)) {
      const reason = loc.reason ?? `missing file ${loc.file ? showPath(loc.file) : slot.ref}`;
      if (required) throw new RefError(`job ${job.key}: required ref ${slot.ref}: ${reason}`);
      out.push({ ...slot, status: 'missing', reason });
      continue;
    }
    const bytes = fs.readFileSync(loc.file);
    const maxRef = ctx.maxRefBytes ?? 2 * 1024 * 1024;
    if (bytes.length > maxRef) throw new RefError(`job ${job.key}: ref ${slot.ref} is ${bytes.length} bytes, over the ${maxRef} byte limit for inline references`);
    if (!isPng(bytes) && !isJpeg(bytes) && !isWebp(bytes)) throw new RefError(`job ${job.key}: ref ${slot.ref} is not a PNG, JPEG or WebP`);
    const hex = sha256(bytes);
    out.push({ ...slot, status: 'ok', file: loc.file, bytes, sha256: hex, token: `sha256:${hex}`, mime: isPng(bytes) ? 'image/png' : isWebp(bytes) ? 'image/webp' : 'image/jpeg' });
  }
  return out;
}

export class RefError extends Error {}

/** The value a provider sends for a ref: a data URL, or the URL itself. */
export function refValue(ref, mode) {
  if (ref.url) return ref.url;
  if (mode === 'url') throw new Error(`ref ${ref.ref} is a local file but *_REF_MODE=url needs hosted https refs`);
  return `data:${ref.mime};base64,${ref.bytes.toString('base64')}`;
}

/** Deep-replace ref tokens inside a request body with their send-time values. */
export function materialise(body, refs, mode) {
  const map = new Map(refs.filter((r) => r.token).map((r) => [r.token, refValue(r, mode)]));
  const walk = (v) => {
    if (typeof v === 'string') return map.get(v) ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(body);
}

// ---------------------------------------------------------------------------------------------
// Cache identity and the raw layout: work/art/raw/<key>/<hash16>.(png|jpg) + <hash16>.json

/** sha256 over provider, model and the canonical request body (refs already as sha256 tokens). */
export function cacheKey({ provider, model, body }) {
  const clean = { ...body };
  delete clean.Authorization;
  delete clean.authorization;
  const hash = sha256(`${provider}\n${model}\n${canonicalJson(clean)}`);
  return { hash, hash16: hash.slice(0, 16) };
}

export function rawDir(workDir, key) { return path.join(workDir, 'raw', key); }
export function sidecarPath(workDir, key, hash16) { return path.join(rawDir(workDir, key), `${hash16}.json`); }
export function imagePath(workDir, key, hash16, ext) { return path.join(rawDir(workDir, key), `${hash16}.${ext}`); }

export function readSidecar(workDir, key, hash16) {
  const f = sidecarPath(workDir, key, hash16);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

export function isCached(workDir, key, hash16) {
  const sc = readSidecar(workDir, key, hash16);
  return Boolean(sc && fs.existsSync(imagePath(workDir, key, hash16, sc.format === 'jpg' ? 'jpg' : 'png')));
}

export function listCandidates(workDir, key) {
  const dir = rawDir(workDir, key);
  if (!fs.existsSync(dir)) return { selected: null, candidates: [] };
  const marker = path.join(dir, 'SELECTED');
  const selected = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null;
  const candidates = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const sc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const img = imagePath(workDir, key, sc.hash16, sc.format === 'jpg' ? 'jpg' : 'png');
    const exists = fs.existsSync(img);
    return { ...sc, bytes: exists ? fs.statSync(img).size : 0, status: exists ? 'ok' : 'missing-image', selected: sc.hash16 === selected };
  }).sort((a, b) => String(a.generated_at).localeCompare(String(b.generated_at)) || a.seed - b.seed);
  return { selected, candidates };
}

// ---------------------------------------------------------------------------------------------
// HTTP: retries with backoff for transient failures, redaction for anything that gets printed.

export class HttpError extends Error {
  constructor(status, message) { super(`HTTP ${status}: ${message}`); this.status = status; }
}

export function redactHeaders(headers) {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k, /^(authorization|x-api-key|api-key)$/i.test(k) ? '***' : v]));
}

function retryAfterMs(value) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

/**
 * fetch with a per-request timeout and retries (1s * 2^n, +-20 % jitter, Retry-After honoured)
 * on network errors, 408, 425, 429 and 5xx. Other 4xx fail at once with the provider's message
 * trimmed to 500 characters. Never logs headers.
 */
export async function fetchRetry(url, init, opts = {}) {
  const { retries = 5, timeoutMs = 120000, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random } = opts;
  // Defensive: a NaN retry count or timeout must never mean "retry forever" or "no timeout".
  const max = Number.isInteger(retries) && retries >= 0 ? retries : 0;
  const tmo = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000;
  const backoff = (n) => Math.round(1000 * 2 ** n * (0.8 + 0.4 * random()));
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(tmo) });
    } catch (e) {
      // Programming errors (bad URL, bad argument) are not network errors: fail at once.
      const fatal = e?.code === 'ERR_OUT_OF_RANGE' || e?.code === 'ERR_INVALID_ARG_TYPE' || (e instanceof TypeError && /URL/.test(e.message));
      if (fatal) throw e;
      if (attempt >= max) throw new Error(`network error after ${attempt + 1} attempts: ${trim(String(e?.message ?? e))}`);
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return res;
    const status = res.status;
    let text = '';
    try { text = await res.text(); } catch { text = ''; }
    const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
    if (!retryable || attempt >= max) throw new HttpError(status, trim(text || res.statusText || 'request failed'));
    await sleep(retryAfterMs(res.headers?.get?.('retry-after')) ?? backoff(attempt));
  }
}

export async function fetchJson(url, init, opts) {
  const res = await fetchRetry(url, init, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`provider returned non-JSON (${trim(text, 120)})`); }
}

export async function downloadImage(url, opts) {
  const res = await fetchRetry(url, { method: 'GET' }, opts);
  const buf = Buffer.from(await res.arrayBuffer());
  const info = inspectImage(buf);
  return { bytes: buf, ...info };
}

// ---------------------------------------------------------------------------------------------
// Configuration: flag > environment > prompts.mjs defaults > built-in.

const envBool = (v, dflt) => (v === undefined || v === '' ? dflt : !/^(0|false|no|off)$/i.test(v));
/** A non-negative integer from the environment; anything else is a usage error that names the variable. */
export function envInt(v, dflt, name) {
  if (v === undefined || v === '') return dflt;
  const s = String(v).trim();
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw new Error(`${name} must be a non-negative integer, got ${JSON.stringify(v)}`);
  return Number(s);
}
/** A non-negative finite number from the environment. */
export function envNum(v, dflt, name) {
  if (v === undefined || v === '') return dflt;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number, got ${JSON.stringify(v)}`);
  return n;
}
function envJson(v, name) {
  if (!v) return {};
  try { const o = JSON.parse(v); if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object'); return o; } catch (e) { throw new Error(`${name} must be a JSON object: ${e.message}`); }
}

// ---------------------------------------------------------------------------------------------
// Seedream model families. Endpoints, size limits and prices are from the providers' public model
// pages as of October 2026 (fal.ai lists all three; the BytePlus ids and prices are less certain,
// override them with SEEDREAM_MODEL and ART_PRICE_USD). A job's size is the size it should be
// generated at; `fitSize` scales it into the chosen family's limits, keeping the aspect ratio, and
// the finishing stage resizes to the loader's exact sizes either way.

export const MODELS = {
  'seedream-v5-pro': {
    label: 'Seedream 5.0 Pro',
    fal: { endpoint: 'bytedance/seedream/v5/pro/text-to-image', edit: 'bytedance/seedream/v5/pro/edit' },
    ark: { model: 'dola-seedream-5-0-pro-260628' },
    minPixels: 1024 * 1024,
    maxPixels: 2048 * 2048,
    price: { fal: [{ maxPixels: 1536 * 1536, usd: 0.0675 }, { maxPixels: Infinity, usd: 0.135 }], ark: [{ maxPixels: Infinity, usd: 0.045 }] },
    extraRefUsd: 0.0045,
  },
  'seedream-v4.5': {
    label: 'Seedream 4.5',
    fal: { endpoint: 'fal-ai/bytedance/seedream/v4.5/text-to-image', edit: 'fal-ai/bytedance/seedream/v4.5/edit' },
    ark: { model: 'seedream-4-5-251128' },
    minPixels: 2560 * 1440,
    maxPixels: 4096 * 4096,
    maxSide: 4096,
    price: { fal: [{ maxPixels: Infinity, usd: 0.04 }], ark: [{ maxPixels: Infinity, usd: 0.04 }] },
  },
  'seedream-v4': {
    label: 'Seedream 4.0',
    fal: { endpoint: 'fal-ai/bytedance/seedream/v4/text-to-image', edit: 'fal-ai/bytedance/seedream/v4/edit' },
    ark: { model: 'seedream-4-0-250828' },
    minSide: 1024,
    maxSide: 4096,
    price: { fal: [{ maxPixels: Infinity, usd: 0.03 }], ark: [{ maxPixels: Infinity, usd: 0.03 }] },
  },
};
export const DEFAULT_MODEL = 'seedream-v5-pro';

/**
 * Scale width x height into a model family's limits, keeping the aspect ratio. Sides land on a
 * multiple of 8, rounded up when scaling up and down when scaling down, so the result is always
 * inside the limits. Sizes already inside them come back unchanged.
 */
export function fitSize(width, height, m) {
  const px = width * height;
  let s = 1;
  if (m.minPixels && px < m.minPixels) s = Math.sqrt(m.minPixels / px);
  if (m.minSide) s = Math.max(s, m.minSide / Math.min(width, height));
  if (m.maxPixels && px * s * s > m.maxPixels) s = Math.sqrt(m.maxPixels / px);
  if (m.maxSide) s = Math.min(s, m.maxSide / Math.max(width, height));
  if (s === 1) return { width, height, scaled: false };
  const step = 8;
  const r = (v) => (s > 1 ? Math.ceil(v / step) : Math.floor(v / step)) * step;
  return { width: r(width * s), height: r(height * s), scaled: true };
}

/** Estimated USD for one image of this size with this many reference images. */
export function priceFor(cfg, providerName, width, height, nRefs = 0) {
  if (providerName === 'mock') return 0;
  if (cfg.priceOverride !== null && cfg.priceOverride !== undefined) return cfg.priceOverride;
  const m = MODELS[cfg.model];
  const tiers = m?.price?.[providerName] ?? [{ maxPixels: Infinity, usd: 0.03 }];
  const px = width * height;
  const tier = tiers.find((t) => px <= t.maxPixels) ?? tiers[tiers.length - 1];
  return tier.usd + Math.max(0, nRefs - 1) * (providerName === 'fal' ? m?.extraRefUsd ?? 0 : 0);
}

export function resolveConfig(flags = {}, env = process.env, defaults = {}) {
  const nowFlag = flags.now ?? null;
  const nowEnv = env.ART_NOW || null;
  const now = nowFlag ?? nowEnv ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) throw new Error(`--now / ART_NOW must be an ISO-8601 timestamp, got ${now}`);
  const workDir = path.resolve(flags.out ?? flags.work ?? env.ART_WORK_DIR ?? path.join(REPO_ROOT, 'work', 'art'));
  const model = flags.model ?? env.ART_MODEL ?? defaults.model ?? DEFAULT_MODEL;
  if (!MODELS[model]) throw new Error(`unknown model ${JSON.stringify(model)} (${Object.keys(MODELS).join(', ')})`);
  const prof = MODELS[model];
  return {
    provider: flags.provider ?? env.ART_PROVIDER ?? defaults.provider ?? 'mock',
    model,
    workDir,
    repoRoot: REPO_ROOT,
    toolsDir: TOOLS_DIR,
    publicArtDir: PUBLIC_ART_DIR,
    now,
    nowSource: nowFlag ? 'flag' : nowEnv ? 'env' : 'clock',
    retries: envInt(env.ART_HTTP_RETRIES, 5, 'ART_HTTP_RETRIES'),
    timeoutMs: envInt(env.ART_HTTP_TIMEOUT_MS, 120000, 'ART_HTTP_TIMEOUT_MS'),
    concurrency: flags.concurrency ?? envInt(env.ART_CONCURRENCY, defaults.concurrency ?? 2, 'ART_CONCURRENCY'),
    failFast: Boolean(flags['fail-fast']),
    force: Boolean(flags.force),
    dryRun: Boolean(flags['dry-run']),
    requireRefs: Boolean(flags['require-refs']),
    maxSpend: flags['max-spend'] ?? envNum(env.ART_MAX_SPEND, defaults.maxSpendUsd ?? 5, 'ART_MAX_SPEND'),
    priceOverride: envNum(env.ART_PRICE_USD, null, 'ART_PRICE_USD'),
    maxRefBytes: defaults.maxRefBytes ?? 2 * 1024 * 1024,
    warnBodyBytes: defaults.warnBodyBytes ?? 12 * 1024 * 1024,
    maxRefs: defaults.maxRefs ?? 14,
    ark: {
      apiKey: env.ARK_API_KEY ?? '',
      baseUrl: (env.ARK_BASE_URL ?? 'https://ark.ap-southeast.bytepluses.com').replace(/\/$/, ''),
      imagesPath: env.ARK_IMAGES_PATH ?? '/api/v3/images/generations',
      model: env.SEEDREAM_MODEL ?? prof.ark.model,
      responseFormat: env.ARK_RESPONSE_FORMAT ?? 'url',
      sizeMode: env.ARK_SIZE_MODE ?? 'wxh',
      sizePreset: env.ARK_SIZE_PRESET ?? '',
      refMode: env.ARK_REF_MODE ?? 'data',
      imageField: env.ARK_IMAGE_FIELD ?? 'image',
      watermark: envBool(env.ARK_WATERMARK, false),
      sequential: env.ARK_SEQUENTIAL ?? 'disabled',
      negativeField: env.ARK_NEGATIVE_FIELD ?? '',
      extraJson: envJson(env.ARK_EXTRA_JSON, 'ARK_EXTRA_JSON'),
    },
    fal: {
      key: env.FAL_KEY ?? '',
      endpoint: env.FAL_ENDPOINT ?? `https://queue.fal.run/${prof.fal.endpoint}`,
      editEndpoint: env.FAL_EDIT_ENDPOINT ?? `https://queue.fal.run/${prof.fal.edit}`,
      syncMode: envBool(env.FAL_SYNC_MODE, false),
      refField: env.FAL_REF_FIELD ?? 'image_urls',
      refMode: env.FAL_REF_MODE ?? 'data',
      pollMs: envInt(env.FAL_POLL_MS, 2000, 'FAL_POLL_MS'),
      timeoutMs: envInt(env.FAL_TIMEOUT_MS, 300000, 'FAL_TIMEOUT_MS'),
      safety: envBool(env.FAL_SAFETY, true),
      negativeField: env.FAL_NEGATIVE_FIELD ?? '',
      extraJson: envJson(env.FAL_EXTRA_JSON, 'FAL_EXTRA_JSON'),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Providers. Each has `buildRequest(job, cfg, refs) -> { url, headers, body, model, meta }`
// (pure: the body carries refs as sha256 tokens and is what the cache key hashes) and
// `generate(req, ctx) -> { bytes, format, ext, width, height, sourceUrl, seedReturned, providerMeta }`.

const MOCK_PALETTES = {
  hub: { skyTop: '#07122A', skyBottom: '#1B2E4C', ground: '#5C4632', groundLit: '#8F8068', trunk: '#2B1C12', doors: ['#F2B24A', '#111111', '#1F4A9C', '#FF2AA1'], prop: '#4A3322', propLit: '#C9A227' },
  grove: { skyTop: '#0C1E36', skyBottom: '#2E4C7A', ground: '#3E5A3A', groundLit: '#6E8B4E', trunk: '#4A3322', doors: ['#F2B24A', '#6E4E36', '#6E4E36', '#F2B24A'], prop: '#4A3322', propLit: '#F2B24A' },
  market: { skyTop: '#0B0B16', skyBottom: '#6E3AFF', ground: '#1A1A2C', groundLit: '#3A3A52', trunk: '#C7CEDA', doors: ['#FF2AA1', '#00E5FF', '#6E3AFF', '#FF2AA1'], prop: '#0B0B16', propLit: '#00E5FF' },
};

/** Draw the mock image for a job kind at a size, seeded. Same inputs give the same pixels. */
export function drawMock({ kind, realm, width, height, seed, key, keyColour, regions }) {
  const rnd = xorshift32((seed ^ fnv1a(key)) >>> 0);
  const pal = MOCK_PALETTES[realm] ?? MOCK_PALETTES.hub;
  const c = (hex) => hexToRgb(hex);
  const r = new Raster(width, height);
  const w = width; const h = height;
  const jitter = (rnd() - 0.5) * 0.04; // +-2 %: variants differ visibly

  if (kind === 'room' || kind === 'anchor') {
    r.gradientV(0, 0, w, h * 0.55, c(pal.skyTop), c(pal.skyBottom));
    r.fillRect(0, h * 0.55, w, h * 0.45, c(pal.ground));
    if (kind === 'room') {
      r.fillEllipse(w * 0.5, h * 0.74, w * 0.16, h * 0.08, c(pal.groundLit));
      const tx = w * (0.5 + jitter);
      r.fillRect(tx - w * 0.06, h * 0.08, w * 0.12, h * 0.52, c(pal.trunk));
      r.fillEllipse(tx, h * 0.6, w * 0.2, h * 0.05, c(pal.trunk));
      const doorX = [0.02, 0.29, 0.66, 0.92];
      doorX.forEach((fx, i) => r.fillRect(w * fx, h * 0.5, w * 0.06, h * 0.12, c(pal.doors[i])));
    } else {
      const tx = w * (0.5 + jitter);
      r.fillRect(tx - w * 0.1, 0, w * 0.2, h * 0.78, c(pal.trunk));
      for (let i = 0; i < 5; i += 1) r.fillEllipse(tx + (i - 2) * w * 0.12, h * 0.78, w * 0.07, h * 0.06, c(pal.trunk));
      for (let i = 0; i < 7; i += 1) r.fillEllipse(tx - w * 0.06 + (i / 6) * w * 0.12, h * (0.7 - i * 0.09), w * 0.012, w * 0.012, c(pal.propLit));
      r.fillEllipse(tx - w * 0.03, h * 0.3, w * 0.025, h * 0.06, c(pal.propLit));
      r.fillEllipse(tx, h * 0.76, w * 0.04, h * 0.04, c('#07122A'));
    }
    // Faint seeded noise on the ground so variants are not flat.
    const dots = Math.floor((w * h) / 64);
    for (let i = 0; i < dots; i += 1) {
      const x = Math.floor(rnd() * w); const y = Math.floor(h * 0.55 + rnd() * h * 0.45);
      const g = r.get(x, y); const d = Math.round((rnd() - 0.5) * 16);
      r.blend(x, y, g.map((v) => Math.max(0, Math.min(255, v + d))), 1);
    }
    return r;
  }

  const key_ = c(keyColour);
  r.fill(key_);
  const spill = { colour: key_, amount: 0.03, width: 3 };

  if (kind === 'piece') {
    const cx = w * (0.5 + jitter);
    r.fillEllipse(cx, h * 0.66, w * 0.28, h * 0.32, c(pal.prop), { shadeBelow: 0.66, spill });
    r.fillEllipse(cx, h * 0.3, w * 0.19, w * 0.19, c(pal.propLit), { shadeBelow: 0.8, spill });
    r.fillEllipse(cx - w * 0.07, h * 0.28, w * 0.035, w * 0.035, c('#F6F1E3'));
    r.fillEllipse(cx + w * 0.07, h * 0.28, w * 0.035, w * 0.035, c('#F6F1E3'));
    return r;
  }

  if (kind === 'overlay') {
    // Props in the upper corners and along the top only: the hub's walkable polygon runs the
    // full width of the bottom edge, so anything in the bottom band would cover the crowd and
    // fail the overlay rule (see artlib/overlaycheck.py). Thin wall slivers stay above the
    // floor line (upper 42 % of the frame) and away from the door markers.
    r.fillEllipse(w * 0.02, h * 0.1, w * 0.07, h * 0.13, c(pal.prop), { shadeBelow: 0.6, spill });
    r.fillEllipse(w * 0.98, h * 0.09, w * 0.065, h * 0.12, c(pal.prop), { shadeBelow: 0.6, spill });
    r.fillRect(0, h * 0.2, w * 0.01, h * 0.22, c(pal.prop));
    r.fillRect(w * 0.99, h * 0.18, w * 0.01, h * 0.22, c(pal.prop));
    r.fillEllipse(w * 0.055, h * 0.16, w * 0.012, w * 0.012, c(pal.propLit));
    r.fillEllipse(w * 0.945, h * 0.15, w * 0.01, w * 0.01, c(pal.propLit));
    for (let i = 0; i < 6; i += 1) {
      const len = h * (0.06 + rnd() * 0.08);
      r.line(w * (0.02 + i * 0.015), 0, w * (0.02 + i * 0.015 + jitter * 0.3), len, w * 0.003, c(pal.prop));
      r.line(w * (0.98 - i * 0.015), 0, w * (0.98 - i * 0.015 - jitter * 0.3), len * 0.8, w * 0.003, c(pal.prop));
    }
    return r;
  }

  // owl / owl-edit: a colour-coded layer master with the flat region fills from the job.
  const body = c(regions?.body ?? '#FF0000');
  const belly = c(regions?.belly ?? '#00FF00');
  const accent = c(regions?.accent ?? '#0000FF');
  const cream = c('#F6F1E3'); const navy = c('#0C1E36'); const gold = c('#C9A227');
  const cx = w * (0.48 + jitter);
  const feetY = h * 0.94; // feet 6 % above the bottom edge: registration is exercised in post
  r.fillEllipse(cx, feetY - h * 0.08, w * 0.11, h * 0.035, accent, { shadeBelow: 0.5, spill }); // tail
  r.fillEllipse(cx - w * 0.25, h * 0.6, w * 0.07, h * 0.2, darker(body, 0.7), { spill }); // wings
  r.fillEllipse(cx + w * 0.25, h * 0.6, w * 0.07, h * 0.2, darker(body, 0.7), { spill });
  r.fillEllipse(cx, h * 0.6, w * 0.26, h * 0.27, body, { shadeBelow: 0.66, spill }); // body
  r.fillEllipse(cx, h * 0.3, w * 0.21, w * 0.21, body, { shadeBelow: 0.8, spill }); // head
  r.fillEllipse(cx - w * 0.15, h * 0.15, w * 0.045, h * 0.07, body, { spill }); // tufts
  r.fillEllipse(cx + w * 0.15, h * 0.15, w * 0.045, h * 0.07, body, { spill });
  r.fillEllipse(cx - w * 0.17, h * 0.09, w * 0.03, h * 0.035, accent, { spill }); // tuft tips
  r.fillEllipse(cx + w * 0.17, h * 0.09, w * 0.03, h * 0.035, accent, { spill });
  r.fillEllipse(cx - w * 0.28, h * 0.76, w * 0.05, h * 0.05, accent, { shadeBelow: 0.5, spill }); // wing tips
  r.fillEllipse(cx + w * 0.28, h * 0.76, w * 0.05, h * 0.05, accent, { shadeBelow: 0.5, spill });
  r.fillEllipse(cx, h * 0.64, w * 0.15, h * 0.19, belly, { shadeBelow: 0.66 }); // belly
  if (kind === 'owl-edit') {
    r.line(cx - w * 0.16, h * 0.3, cx - w * 0.02, h * 0.3, w * 0.012, navy); // closed lids
    r.line(cx + w * 0.02, h * 0.3, cx + w * 0.16, h * 0.3, w * 0.012, navy);
  } else {
    for (const s of [-1, 1]) {
      r.fillEllipse(cx + s * w * 0.09, h * 0.3, w * 0.07, w * 0.07, cream);
      r.fillEllipse(cx + s * w * 0.09, h * 0.3, w * 0.03, w * 0.03, navy);
      r.fillEllipse(cx + s * w * 0.09 - w * 0.012, h * 0.3 - w * 0.012, w * 0.008, w * 0.008, cream);
    }
  }
  r.fillEllipse(cx, h * 0.38, w * 0.025, h * 0.035, gold); // beak
  r.fillEllipse(cx - w * 0.06, feetY - h * 0.015, w * 0.05, h * 0.015, gold); // feet
  r.fillEllipse(cx + w * 0.06, feetY - h * 0.015, w * 0.05, h * 0.015, gold);
  return r;
}

const mockProvider = {
  name: 'mock',
  buildRequest(job, cfg, refs) {
    const body = {
      kind: job.kind, key: job.key, realm: job.realm, prompt: job.prompt, size: job.size, seed: job.seed,
      key_colour: job.key_colour ?? null, regions: job.regions ?? null, refs: refs.filter((r) => r.token).map((r) => r.token),
    };
    return { url: 'mock://raster', headers: {}, body, model: 'mock-raster-1', meta: {} };
  },
  async generate(req, { job }) {
    const raster = drawMock({ kind: job.kind, realm: job.realm, width: job.width, height: job.height, seed: req.body.seed, key: job.key, keyColour: job.key_colour, regions: job.regions });
    const bytes = raster.toPng();
    return { bytes, format: 'png', ext: 'png', width: job.width, height: job.height, sourceUrl: null, seedReturned: req.body.seed, providerMeta: {} };
  },
};

function arkSize(job, ark) {
  if (ark.sizeMode === 'preset') {
    if (ark.sizePreset) return ark.sizePreset;
    const m = Math.max(job.width, job.height);
    return m >= 3000 ? '4K' : m >= 1500 ? '2K' : '1K';
  }
  return `${job.width}x${job.height}`;
}

const arkProvider = {
  name: 'ark',
  buildRequest(job, cfg, refs) {
    const { ark } = cfg;
    const body = {
      model: ark.model,
      prompt: job.prompt,
      size: arkSize(job, ark),
      seed: job.seed,
      response_format: ark.responseFormat,
      watermark: ark.watermark,
      sequential_image_generation: ark.sequential,
    };
    const tokens = refs.filter((r) => r.token).map((r) => r.token);
    if (tokens.length) body[ark.imageField] = tokens;
    if (ark.negativeField && job.negative) body[ark.negativeField] = job.negative;
    Object.assign(body, job.providers?.ark ?? {}, ark.extraJson);
    return {
      url: `${ark.baseUrl}${ark.imagesPath}`,
      headers: { Authorization: `Bearer ${ark.apiKey}`, 'Content-Type': 'application/json' },
      body,
      model: ark.model,
      meta: { refMode: ark.refMode },
    };
  },
  async generate(req, ctx) {
    const { cfg, refs, http } = ctx;
    if (!cfg.ark.apiKey) throw new Error('ARK_API_KEY is not set');
    const sent = materialise(req.body, refs, cfg.ark.refMode);
    const res = await fetchJson(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(sent) }, http);
    const item = res?.data?.[0];
    if (!item) throw new Error(`provider response has no data[0] (${trim(JSON.stringify(res), 200)})`);
    let image;
    let sourceUrl = null;
    if (item.b64_json) {
      const bytes = Buffer.from(item.b64_json, 'base64');
      image = { bytes, ...inspectImage(bytes) };
    } else if (item.url) {
      sourceUrl = item.url;
      image = await downloadImage(item.url, http);
    } else throw new Error('provider response has neither url nor b64_json');
    const providerMeta = {};
    if (item.size) providerMeta.size = item.size;
    if (res.usage) providerMeta.usage = res.usage;
    if (res.request_id ?? res.id) providerMeta.request_id = res.request_id ?? res.id;
    return { ...image, sourceUrl, seedReturned: res.seed ?? item.seed ?? null, providerMeta };
  },
};

const falProvider = {
  name: 'fal',
  buildRequest(job, cfg, refs) {
    const { fal } = cfg;
    const tokens = refs.filter((r) => r.token).map((r) => r.token);
    const url = tokens.length ? fal.editEndpoint : fal.endpoint;
    const body = {
      prompt: job.prompt,
      image_size: { width: job.width, height: job.height },
      num_images: 1,
      seed: job.seed,
      enable_safety_checker: fal.safety,
    };
    if (tokens.length) body[fal.refField] = tokens;
    if (fal.syncMode) body.sync_mode = true;
    if (fal.negativeField && job.negative) body[fal.negativeField] = job.negative;
    Object.assign(body, job.providers?.fal ?? {}, fal.extraJson);
    const model = url.replace(/^https?:\/\/[^/]+\//, '').replace(/\/$/, '');
    return { url, headers: { Authorization: `Key ${fal.key}`, 'Content-Type': 'application/json' }, body, model, meta: { refMode: fal.refMode } };
  },
  async generate(req, ctx) {
    const { cfg, refs, http } = ctx;
    if (!cfg.fal.key) throw new Error('FAL_KEY is not set');
    const sleep = http.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const sent = materialise(req.body, refs, cfg.fal.refMode);
    const auth = { Authorization: req.headers.Authorization };
    const submitted = await fetchJson(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(sent) }, http);
    if (!submitted?.status_url || !submitted?.response_url) throw new Error(`queue response lacks status_url/response_url (${trim(JSON.stringify(submitted), 200)})`);
    const started = Date.now();
    for (;;) {
      const st = await fetchJson(submitted.status_url, { method: 'GET', headers: auth }, http);
      const status = String(st?.status ?? '').toUpperCase();
      if (status === 'COMPLETED') break;
      if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') throw new Error(`fal request ${submitted.request_id ?? ''} ${status}: ${trim(JSON.stringify(st.error ?? st.detail ?? st.logs ?? ''), 300)}`);
      if (Date.now() - started > cfg.fal.timeoutMs) throw new Error(`fal request ${submitted.request_id ?? ''} timed out after ${cfg.fal.timeoutMs} ms (last status ${status || 'unknown'})`);
      await sleep(cfg.fal.pollMs);
    }
    const result = await fetchJson(submitted.response_url, { method: 'GET', headers: auth }, http);
    const img = result?.images?.[0];
    if (!img?.url) throw new Error('fal result has no images[0].url');
    // With FAL_SYNC_MODE the image comes back inline as a data URL: no CDN download, no source URL.
    const inline = decodeDataUrl(img.url);
    const image = inline ? { bytes: inline, ...inspectImage(inline) } : await downloadImage(img.url, http);
    const providerMeta = { request_id: submitted.request_id ?? null };
    if (img.width && img.height) providerMeta.size = `${img.width}x${img.height}`;
    if (img.content_type) providerMeta.content_type = img.content_type;
    return { ...image, sourceUrl: inline ? null : img.url, seedReturned: result.seed ?? null, providerMeta };
  },
};

/** Bytes of a base64 `data:` URL, or null for any other URL. */
export function decodeDataUrl(u) {
  if (typeof u !== 'string' || !u.startsWith('data:')) return null;
  const comma = u.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(u.slice(0, comma))) throw new Error('inline image is not a base64 data URL');
  return Buffer.from(u.slice(comma + 1), 'base64');
}

export const PROVIDERS = { mock: mockProvider, ark: arkProvider, fal: falProvider };

// ---------------------------------------------------------------------------------------------
// Provenance: the work log (work/art/log.jsonl), one line per attempt. Fields are allowlisted;
// the free-text fields (`error`, `human_edits`) are scrubbed of the user name, home directory
// and host name, while the fixed vocabulary (`key`, `provider`, `model`, ...) is left alone so a
// login such as "owl" cannot corrupt "robot-owl"; absolute paths are rejected in every field,
// prompt text never appears (only its hash) and the forbidden-word check runs on the line when a
// list is configured.

export const LOG_FIELDS = ['ts', 'key', 'provider', 'model', 'prompt_sha256', 'seed', 'size', 'hash16', 'status', 'source_url', 'error', 'human_edits'];
/** The fields that hold free text and are therefore scrubbed of personal markers. */
export const SCRUBBED_FIELDS = new Set(['error', 'human_edits']);

export function personalMarkers() {
  const markers = [];
  try { markers.push(os.homedir()); } catch { /* no home */ }
  // Short names are left out: a three-letter login would match ordinary words in error text.
  try { const u = os.userInfo().username; if (u && u.length >= 4) markers.push(u); } catch { /* no user */ }
  try { const hn = os.hostname(); if (hn && hn.length >= 4) markers.push(hn); } catch { /* no host */ }
  return markers.filter(Boolean);
}

export function scrubString(s, { markers = personalMarkers(), repoRoot = REPO_ROOT } = {}) {
  let out = s;
  if (repoRoot) out = out.split(repoRoot).join('.');
  for (const m of [...markers].sort((a, b) => b.length - a.length)) out = out.split(m).join('[redacted]');
  return out;
}

export function sanitiseLogEntry(entry, { forbidden = null, markers, repoRoot } = {}) {
  const line = {};
  for (const f of LOG_FIELDS) {
    const v = entry[f];
    if (v === undefined) { line[f] = f === 'human_edits' ? [] : null; continue; }
    if (typeof v === 'string') {
      const s = SCRUBBED_FIELDS.has(f) ? scrubString(v, { markers, repoRoot }) : v;
      if (/^(\/|[A-Za-z]:\\)/.test(s)) throw new Error(`log field ${f} holds an absolute path`);
      line[f] = s;
    } else if (f === 'human_edits') {
      line[f] = (Array.isArray(v) ? v : []).map((x) => scrubString(String(x), { markers, repoRoot }));
    } else if (typeof v === 'number' || v === null) line[f] = v;
    else throw new Error(`log field ${f} has an unsupported value`);
  }
  if (forbidden) {
    const hits = findForbiddenDeep(line, forbidden);
    if (hits.length) throw new Error(`log line contains forbidden words: ${hits.join(', ')}`);
  }
  return line;
}

export async function appendLog(file, entry, opts) {
  const line = sanitiseLogEntry(entry, opts);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, `${JSON.stringify(line)}\n`);
  return line;
}

// ---------------------------------------------------------------------------------------------
// Planning a run: one task per (job, seed) with its request, cache identity and ref state.

export function planTasks(jobs, cfg, { variants = null, seed = null, defaults = {}, negative = null } = {}) {
  const provider = PROVIDERS[cfg.provider];
  if (!provider) throw new Error(`unknown provider ${cfg.provider} (mock, ark, fal)`);
  const tasks = [];
  const skipped = [];
  for (const job of jobs) {
    let refs;
    try {
      refs = resolveRefs(job, cfg);
    } catch (e) {
      if (e instanceof RefError && job.optional) { skipped.push({ key: job.key, reason: e.message }); continue; }
      throw e;
    }
    if (refs.filter((r) => r.status === 'ok').length > cfg.maxRefs) throw new Error(`job ${job.key}: more than ${cfg.maxRefs} reference images`);
    for (const s of variantSeeds(job, { variants, seed, defaults })) {
      // Every provider, the mock included, generates at the size the chosen model accepts.
      const fit = fitSize(job.width, job.height, MODELS[cfg.model]);
      const jobSeeded = { ...job, seed: s, negative, width: fit.width, height: fit.height, size: `${fit.width}x${fit.height}`, requested_size: job.size };
      const okRefs = refs.filter((r) => r.status === 'ok');
      const req = provider.buildRequest(jobSeeded, cfg, okRefs);
      const { hash, hash16 } = cacheKey({ provider: provider.name, model: req.model, body: req.body });
      const cached = !cfg.force && isCached(cfg.workDir, job.key, hash16);
      const priceUsd = priceFor(cfg, provider.name, fit.width, fit.height, okRefs.length);
      tasks.push({ job: jobSeeded, refs, req, hash, hash16, cached, priceUsd, costUsd: cached ? 0 : priceUsd });
    }
  }
  return { tasks, skipped, provider };
}

/**
 * A provider's result URL with its query string and fragment removed. Providers hand back
 * presigned URLs (time-limited credentials, signatures and key ids in the query), and the
 * sidecar is copied into the committed provenance file, so only the path is ever recorded.
 */
export function publicUrl(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    x.search = '';
    x.hash = '';
    x.username = '';
    x.password = '';
    return x.href;
  } catch {
    return null;
  }
}

function sidecarFor(task, cfg, result) {
  const { job, req, hash16 } = task;
  const sc = {
    schema: 1,
    key: job.key,
    kind: job.kind,
    realm: job.realm,
    provider: cfg.provider,
    model: req.model,
    hash16,
    prompt_sha256: sha256(job.prompt),
    seed: job.seed,
    seed_returned: result.seedReturned ?? null,
    size: job.size,
    requested_size: job.requested_size ?? job.size,
    model_family: cfg.model,
    width: result.width,
    height: result.height,
    format: result.format,
    key_colour: job.key_colour ?? null,
    refs: task.refs.filter((r) => r.status === 'ok').map((r) => ({ ref: r.ref, sha256: r.sha256 })),
    source_url: publicUrl(result.sourceUrl),
    generated_at: cfg.now,
    now_source: cfg.nowSource,
    cost_estimate_usd: task.priceUsd ?? 0,
    provider_meta: result.providerMeta ?? {},
  };
  if (job.regions) sc.regions = job.regions;
  if (job.derives) sc.derives = job.derives;
  return sc;
}

async function runTask(task, cfg, provider, ctx) {
  const { job, req, hash16 } = task;
  const refsOk = task.refs.filter((r) => r.status === 'ok');
  const sent = provider.name === 'mock' ? req.body : materialise(req.body, refsOk, cfg[provider.name]?.refMode ?? 'data');
  const bodyBytes = Buffer.byteLength(JSON.stringify(sent));
  if (bodyBytes > cfg.warnBodyBytes) ctx.warn(`${job.key} seed ${job.seed}: request body is ${(bodyBytes / 1048576).toFixed(1)} MB`);
  const result = await provider.generate(req, { job, cfg, refs: refsOk, http: ctx.http });
  if (result.width !== job.width || result.height !== job.height) ctx.warn(`${job.key} seed ${job.seed}: provider returned ${result.width}x${result.height}, requested ${job.size}`);
  if (result.format === 'jpg' && (job.kind === 'piece' || job.kind === 'owl' || job.kind === 'owl-edit' || job.kind === 'overlay')) {
    ctx.warn(`${job.key} seed ${job.seed}: provider returned JPEG; ringing around key-colour edges costs matte quality. Ask for PNG, e.g. ARK_EXTRA_JSON='{"output_format":"png"}'.`);
  }
  await writeFileAtomic(imagePath(cfg.workDir, job.key, hash16, result.ext), result.bytes);
  const sidecar = sidecarFor(task, cfg, result);
  await writeFileAtomic(sidecarPath(cfg.workDir, job.key, hash16), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}

async function pool(items, concurrency, worker) {
  let next = 0;
  const n = Number.isInteger(concurrency) && concurrency >= 1 ? concurrency : 1; // never zero workers
  const runners = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------------------------
// Geometry export for the post stage: the live room data from packages/shared.

export async function loadGeometry(repoRoot = REPO_ROOT) {
  // packages/shared/rooms/index.ts is TypeScript; Node strips types by default from 22.18 only.
  if (!process.features?.typescript) {
    throw new Error(`geometry needs Node 22.18 or newer (type stripping on by default), or run: node --experimental-strip-types tools/art/generate.mjs geometry (this is Node ${process.versions.node})`);
  }
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
  const mod = await import(pathToFileURL(path.join(repoRoot, 'packages', 'shared', 'rooms', 'index.ts')).href);
  const rooms = {};
  for (const [id, room] of Object.entries(mod.ROOMS)) {
    rooms[id] = {
      size: room.size,
      background: room.background,
      foreground: room.foreground ?? null,
      walkable: room.walkable,
      doors: room.doors,
      spawns: room.spawns,
      anchors: mod.ANCHORS[id] ?? {},
    };
  }
  return { schema: 1, rooms, closedSigns: [...mod.CLOSED_SIGNS], assets: loadAssets() };
}

// ---------------------------------------------------------------------------------------------
// CLI

const USAGE = `usage: node tools/art/generate.mjs [run] [flags]
       node tools/art/generate.mjs list <key>
       node tools/art/generate.mjs select <key> <hash16|latest>
       node tools/art/generate.mjs cost [flags]
       node tools/art/generate.mjs models
       node tools/art/generate.mjs geometry [--stdout]

flags: --provider mock|ark|fal   --model seedream-v5-pro|seedream-v4.5|seedream-v4
       --only k1,k2 (globs ok)   --variants N   --seed S
       --dry-run   --out <dir> (alias --work; default work/art)   --now <ISO-8601>
       --concurrency N   --fail-fast   --force   --max-spend <usd>   --require-refs
       --prompts <file.mjs>   --help`;

export function parseFlags(argv) {
  // `pnpm run script -- --flag` forwards the `--` itself; it is not a positional for us.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      provider: { type: 'string' },
      model: { type: 'string' },
      only: { type: 'string' },
      variants: { type: 'string' },
      seed: { type: 'string' },
      'dry-run': { type: 'boolean' },
      out: { type: 'string' },
      work: { type: 'string' },
      now: { type: 'string' },
      concurrency: { type: 'string' },
      'fail-fast': { type: 'boolean' },
      force: { type: 'boolean' },
      'max-spend': { type: 'string' },
      'require-refs': { type: 'boolean' },
      prompts: { type: 'string' },
      stdout: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const int = (name) => {
    if (values[name] === undefined) return undefined;
    const n = Number.parseInt(values[name], 10);
    if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
    return n;
  };
  const num = (name) => {
    if (values[name] === undefined) return undefined;
    const n = Number(values[name]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${name} must be a number`);
    return n;
  };
  const flags = { ...values, variants: int('variants'), seed: int('seed'), concurrency: int('concurrency'), 'max-spend': num('max-spend') };
  if (flags.variants === 0) throw new Error('--variants must be at least 1');
  return { flags, positionals };
}

async function loadPrompts(file) {
  const target = file ? path.resolve(file) : path.join(TOOLS_DIR, 'prompts.mjs');
  return import(pathToFileURL(target).href);
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout, stderr = process.stderr, fetchImpl = globalThis.fetch, sleep } = {}) {
  const out = (s) => stdout.write(`${s}\n`);
  const err = (s) => stderr.write(`${s}\n`);
  let parsed;
  try { parsed = parseFlags(argv); } catch (e) { err(e.message); err(USAGE); return 2; }
  const { flags, positionals } = parsed;
  if (flags.help) { out(USAGE); return 0; }
  const command = positionals[0] ?? 'run';

  const prompts = await loadPrompts(flags.prompts);
  const defaults = prompts.DEFAULTS ?? {};
  let cfg;
  try { cfg = resolveConfig(flags, env, defaults); } catch (e) { err(e.message); return 2; }
  const forbidden = loadForbidden(env, TOOLS_DIR);
  if (!forbidden) err('forbidden-word check: no list configured (OWL_PARK_FORBIDDEN, ART_FORBIDDEN_WORDS, ART_FORBIDDEN_WORDS_FILE or tools/art/.local/forbidden-words.txt); skipping');
  else err(`forbidden-word check: ${forbidden.entries.length} entries from ${forbidden.sources.join(', ')}`);

  if (command === 'models') {
    out(['model', 'name', 'fal endpoint', 'size limits', 'fal price per image'].join('\t'));
    for (const [id, m] of Object.entries(MODELS)) {
      const lim = [m.minPixels ? `>= ${(m.minPixels / 1e6).toFixed(2)} MP` : '', m.maxPixels ? `<= ${(m.maxPixels / 1e6).toFixed(2)} MP` : '', m.minSide ? `side >= ${m.minSide}` : '', m.maxSide ? `side <= ${m.maxSide}` : ''].filter(Boolean).join(', ');
      const price = m.price.fal.map((t) => `$${t.usd}${Number.isFinite(t.maxPixels) ? ` up to ${(t.maxPixels / 1e6).toFixed(2)} MP` : ''}`).join(', ');
      out([`${id}${id === cfg.model ? ' *' : ''}`, m.label, m.fal.endpoint, lim, price].join('\t'));
    }
    out(`* = selected (--model, ART_MODEL, or the default ${DEFAULT_MODEL})`);
    return 0;
  }

  if (command === 'geometry') {
    let geometry;
    try { geometry = await loadGeometry(cfg.repoRoot); } catch (e) { err(`geometry: ${e?.message ?? e}`); return 2; }
    if (flags.stdout) { out(JSON.stringify(geometry, null, 2)); return 0; }
    const file = path.join(cfg.workDir, 'geometry.json');
    await writeFileAtomic(file, `${JSON.stringify(geometry, null, 2)}\n`);
    out(`wrote ${showPath(file)} (${Object.keys(geometry.rooms).length} rooms)`);
    return 0;
  }

  let jobs;
  try {
    jobs = validateJobs(prompts.JOBS, { assets: loadAssets(), helperKeys: prompts.HELPER_KEYS ?? [], blocks: prompts.BLOCKS ?? {}, forbidden });
  } catch (e) { err(`job list invalid: ${e.message}`); return 1; }

  if (command === 'list') {
    const key = positionals[1];
    if (!key) { err(USAGE); return 2; }
    const { selected, candidates } = listCandidates(cfg.workDir, key);
    if (!candidates.length) { out(`no candidates for ${key} in ${showPath(rawDir(cfg.workDir, key))}`); return 0; }
    out(['hash16', 'seed', 'size', 'format', 'bytes', 'status', 'selected', 'generated_at'].join('\t'));
    for (const c of candidates) out([c.hash16, c.seed, c.size, c.format, c.bytes, c.status, c.selected ? '*' : '', c.generated_at].join('\t'));
    if (!selected) out('(none selected: generate.mjs select <key> <hash16|latest>)');
    return 0;
  }

  if (command === 'select') {
    const [, key, which] = positionals;
    if (!key || !which) { err(USAGE); return 2; }
    const { candidates } = listCandidates(cfg.workDir, key);
    const ok = candidates.filter((c) => c.status === 'ok');
    const pick = which === 'latest' ? ok[ok.length - 1] : ok.find((c) => c.hash16 === which);
    if (!pick) { err(`no candidate ${which} for ${key}`); return 1; }
    await writeFileAtomic(path.join(rawDir(cfg.workDir, key), 'SELECTED'), `${pick.hash16}\n`);
    out(`selected ${key} ${pick.hash16} (seed ${pick.seed})`);
    return 0;
  }

  if (command !== 'run' && command !== 'cost') { err(`unknown command ${command}`); err(USAGE); return 2; }

  let plan;
  try {
    plan = planTasks(selectJobs(jobs, flags.only), cfg, { variants: flags.variants, seed: flags.seed, defaults, negative: prompts.NEGATIVE_PROMPT ?? null });
  } catch (e) { err(e.message); return 1; }
  const { tasks, skipped, provider } = plan;
  for (const s of skipped) err(`skipping optional job ${s.key}: ${s.reason}`);
  const missingRefs = new Map();
  for (const t of tasks) for (const r of t.refs) if (r.status === 'missing') missingRefs.set(`${t.job.key} ${r.ref}`, r.reason);
  for (const [slot, reason] of missingRefs) err(`ref slot empty: ${slot} (${reason})`);

  const uncached = tasks.filter((t) => !t.cached);
  const cost = uncached.reduce((a, t) => a + t.costUsd, 0);
  const summary = `${tasks.length} request(s) for provider ${provider.name} (${MODELS[cfg.model].label}): ${tasks.length - uncached.length} cached, ${uncached.length} to generate, estimated cost $${cost.toFixed(2)} (limit $${cfg.maxSpend})`;

  if (command === 'cost') {
    const perKey = new Map();
    for (const t of tasks) { const e = perKey.get(t.job.key) ?? { total: 0, uncached: 0, usd: 0 }; e.total += 1; if (!t.cached) { e.uncached += 1; e.usd += t.costUsd; } perKey.set(t.job.key, e); }
    for (const [k, e] of perKey) out(`${k}\t${e.total} variant(s)\t${e.uncached} uncached\t$${e.usd.toFixed(2)}`);
    out(summary);
    return 0;
  }

  if (cfg.dryRun) {
    for (const t of tasks) {
      const rel = showPath(imagePath(cfg.workDir, t.job.key, t.hash16, 'png'));
      const shown = { url: t.req.url, headers: redactHeaders(t.req.headers), body: t.req.body };
      const sized = t.job.size === t.job.requested_size ? t.job.size : `${t.job.size} (job asks ${t.job.requested_size})`;
      out(`# ${t.job.key} seed ${t.job.seed} at ${sized}: ${t.cached ? 'cache hit' : 'cache miss'} -> ${rel} ($${t.costUsd.toFixed(3)})`);
      out(JSON.stringify(shown, null, 2));
    }
    out(summary);
    if (provider.name !== 'mock') {
      const keyName = provider.name === 'ark' ? 'ARK_API_KEY' : 'FAL_KEY';
      const set = provider.name === 'ark' ? Boolean(cfg.ark.apiKey) : Boolean(cfg.fal.key);
      out(`${keyName}: ${set ? 'set' : 'NOT set'}`);
    }
    out('dry run: no requests made, nothing written');
    return 0;
  }

  if (cost > cfg.maxSpend) {
    err(`${summary}\nrefusing to start: estimated cost exceeds --max-spend ${cfg.maxSpend}`);
    return 1;
  }
  err(summary);

  const logFile = path.join(cfg.workDir, 'log.jsonl');
  const logOpts = { forbidden, repoRoot: cfg.repoRoot };
  const ctx = { warn: (m) => err(`warning: ${m}`), http: { retries: cfg.retries, timeoutMs: cfg.timeoutMs, fetchImpl, sleep } };
  let failed = 0;
  let stop = false;
  await pool(tasks, cfg.concurrency, async (t) => {
    if (stop) return;
    const base = { ts: cfg.now, key: t.job.key, provider: provider.name, model: t.req.model, prompt_sha256: sha256(t.job.prompt), seed: t.job.seed, size: t.job.size, hash16: t.hash16 };
    if (t.cached) {
      await appendLog(logFile, { ...base, status: 'cached' }, logOpts);
      out(`cached   ${t.job.key} seed ${t.job.seed} ${t.hash16}`);
      return;
    }
    try {
      const sc = await runTask(t, cfg, provider, ctx);
      await appendLog(logFile, { ...base, status: 'ok', source_url: sc.source_url }, logOpts);
      out(`ok       ${t.job.key} seed ${t.job.seed} ${t.hash16} ${sc.width}x${sc.height} ${sc.format}`);
    } catch (e) {
      failed += 1;
      const message = trim(String(e?.message ?? e));
      try { await appendLog(logFile, { ...base, status: 'failed', error: message }, logOpts); } catch (logErr) { err(`log line dropped: ${logErr.message}`); }
      err(`failed   ${t.job.key} seed ${t.job.seed}: ${message}`);
      if (cfg.failFast) stop = true;
    }
  });
  err(`done: ${tasks.length - failed} ok, ${failed} failed; raw candidates in ${showPath(path.join(cfg.workDir, 'raw'))}`);
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${e?.stack ?? e}\n`); process.exitCode = 1; });
}
