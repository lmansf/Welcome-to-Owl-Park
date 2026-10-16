var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/pass.ts
var GUEST_PASS_TTL_S = 12 * 60 * 60;
var DEV_KEY = "owl-park-dev-only-signing-key";
var enc = new TextEncoder();
function b64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function unb64url(s) {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - s.length % 4);
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
__name(unb64url, "unb64url");
async function key(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(key, "key");
function signingSecret(env) {
  if (env.PASS_SIGNING_KEY && env.PASS_SIGNING_KEY.length >= 16) return env.PASS_SIGNING_KEY;
  console.warn("[owl-park] PASS_SIGNING_KEY is not set; using the development key. Set it with: wrangler secret put PASS_SIGNING_KEY");
  return DEV_KEY;
}
__name(signingSecret, "signingSecret");
function randomVisitorId() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = "v_";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
__name(randomVisitorId, "randomVisitorId");
async function mintPass(secret, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}
__name(mintPass, "mintPass");
async function verifyPass(secret, token, nowS = Math.floor(Date.now() / 1e3)) {
  if (!token || token.length > 512) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = unb64url(token.slice(dot + 1));
  if (!sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await key(secret), sig, enc.encode(body));
  if (!ok) return null;
  const raw = unb64url(body);
  if (!raw) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(raw));
    if (typeof p.id !== "string" || !/^v_[A-Za-z0-9]{6,16}$/.test(p.id) || typeof p.exp !== "number" || p.exp < nowS) return null;
    return { id: p.id, exp: p.exp, adm: p.adm === true };
  } catch {
    return null;
  }
}
__name(verifyPass, "verifyPass");

// ../../packages/shared/src/room.ts
var ROOM_W = 1600;
var ROOM_H = 900;
function findSpawn(room, name) {
  return room.spawns[name ?? "default"] ?? room.spawns["default"] ?? { x: room.size.w / 2, y: room.size.h / 2 };
}
__name(findSpawn, "findSpawn");

// ../../packages/shared/rooms/index.ts
var size = { w: ROOM_W, h: ROOM_H };
var ROOMS = {
  hub: {
    id: "hub",
    size,
    background: "hub",
    foreground: "hub-fg",
    mood: "hub",
    walkable: [
      [
        { x: 0, y: 604 },
        { x: 206, y: 604 },
        { x: 206, y: 634 },
        { x: 268, y: 634 },
        { x: 300, y: 566 },
        { x: 420, y: 600 },
        { x: 600, y: 612 },
        { x: 800, y: 630 },
        { x: 1e3, y: 612 },
        { x: 1180, y: 600 },
        { x: 1300, y: 566 },
        { x: 1332, y: 634 },
        { x: 1394, y: 634 },
        { x: 1394, y: 604 },
        { x: 1600, y: 604 },
        { x: 1600, y: 900 },
        { x: 0, y: 900 }
      ]
    ],
    spawns: { "default": { x: 800, y: 730 }, "from-grove": { x: 220, y: 690 }, "from-market": { x: 1380, y: 690 } },
    doors: [
      { id: "to-grove", rect: { x: 0, y: 604, w: 140, h: 120 }, to: { room: "grove", spawn: "default" }, marker: { x: 92, y: 560 } },
      { id: "to-market", rect: { x: 1460, y: 604, w: 140, h: 120 }, to: { room: "market", spawn: "default" }, marker: { x: 1508, y: 560 } },
      { id: "closed-a", rect: { x: 430, y: 560, w: 140, h: 90 }, closedSign: "Not Yet Fledged", marker: { x: 500, y: 598 } },
      { id: "closed-b", rect: { x: 1030, y: 560, w: 140, h: 90 }, closedSign: "Hatching Soon", marker: { x: 1100, y: 598 } }
    ]
  },
  grove: {
    id: "grove",
    size,
    background: "grove",
    foreground: "grove-fg",
    mood: "dusk",
    walkable: [
      [
        { x: 330, y: 510 },
        { x: 1270, y: 510 },
        { x: 1420, y: 545 },
        { x: 1600, y: 640 },
        { x: 1600, y: 850 },
        { x: 1470, y: 870 },
        { x: 1250, y: 880 },
        { x: 360, y: 880 },
        { x: 290, y: 790 },
        { x: 250, y: 600 },
        { x: 262, y: 540 }
      ]
    ],
    spawns: { "default": { x: 1406, y: 760 } },
    doors: [{ id: "to-hub", rect: { x: 1486, y: 630, w: 114, h: 250 }, to: { room: "hub", spawn: "from-grove" }, marker: { x: 1545, y: 745 } }]
  },
  market: {
    id: "market",
    size,
    background: "market",
    foreground: "market-fg",
    mood: "neon",
    walkable: [
      [
        { x: 150, y: 590 },
        { x: 1480, y: 590 },
        { x: 1600, y: 660 },
        { x: 1600, y: 690 },
        { x: 1420, y: 720 },
        { x: 1380, y: 885 },
        { x: 280, y: 885 },
        { x: 250, y: 830 },
        { x: 170, y: 760 },
        { x: 0, y: 760 },
        { x: 0, y: 640 },
        { x: 60, y: 600 }
      ]
    ],
    spawns: { "default": { x: 200, y: 700 } },
    doors: [
      { id: "to-hub", rect: { x: 0, y: 600, w: 120, h: 220 }, to: { room: "hub", spawn: "from-market" }, marker: { x: 70, y: 580 } },
      { id: "shop", rect: { x: 730, y: 590, w: 256, h: 90 }, marker: { x: 857, y: 234 } }
    ]
  }
};

// src/rooms.ts
var ROOMS2 = ROOMS;
var DEFAULT_CAPS = { hub: 80, grove: 40, market: 40 };
function roomCap(env, roomId) {
  try {
    const caps = env.ROOM_CAPS ? JSON.parse(env.ROOM_CAPS) : {};
    const c = caps[roomId];
    if (typeof c === "number" && c >= 1 && c <= 120) return Math.floor(c);
  } catch {
  }
  return DEFAULT_CAPS[roomId] ?? 40;
}
__name(roomCap, "roomCap");

// src/RoomObject.ts
import { DurableObject } from "cloudflare:workers";

// ../../packages/shared/src/geometry.ts
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
__name(distance, "distance");
function lerpVec(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
__name(lerpVec, "lerpVec");
function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (onSegment(p, a, b)) return true;
    const intersects = a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
__name(pointInPolygon, "pointInPolygon");
function onSegment(p, a, b) {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  return p.x >= Math.min(a.x, b.x) - 1e-6 && p.x <= Math.max(a.x, b.x) + 1e-6 && p.y >= Math.min(a.y, b.y) - 1e-6 && p.y <= Math.max(a.y, b.y) + 1e-6;
}
__name(onSegment, "onSegment");
function closestPointOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}
__name(closestPointOnSegment, "closestPointOnSegment");
function closestPointOnPolygon(p, poly) {
  let best = poly[0] ?? { x: p.x, y: p.y };
  let bestDist = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = closestPointOnSegment(p, poly[j], poly[i]);
    const d = distance(p, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
__name(closestPointOnPolygon, "closestPointOnPolygon");
function isWalkable(p, polys) {
  return polys.some((poly) => pointInPolygon(p, poly));
}
__name(isWalkable, "isWalkable");
function snapToWalkable(p, polys) {
  if (isWalkable(p, polys)) return p;
  let best = p;
  let bestDist = Infinity;
  for (const poly of polys) {
    const c = closestPointOnPolygon(p, poly);
    const d = distance(p, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
__name(snapToWalkable, "snapToWalkable");

// ../../packages/shared/src/walk.ts
var WALK_SPEED = 260;
function walkDurationMs(from, to, speed = WALK_SPEED) {
  return distance(from, to) / speed * 1e3;
}
__name(walkDurationMs, "walkDurationMs");
function positionAlongWalk(walk, now, speed = WALK_SPEED) {
  const total = walkDurationMs(walk.from, walk.to, speed);
  if (total <= 0) return { pos: { ...walk.to }, done: true };
  const elapsed = now - walk.startedAt;
  if (elapsed >= total) return { pos: { ...walk.to }, done: true };
  if (elapsed <= 0) return { pos: { ...walk.from }, done: false };
  return { pos: lerpVec(walk.from, walk.to, elapsed / total), done: false };
}
__name(positionAlongWalk, "positionAlongWalk");

// ../../packages/shared/src/look.ts
var HEX = /^#[0-9a-fA-F]{6}$/;
function isHexColour(s) {
  return typeof s === "string" && HEX.test(s);
}
__name(isHexColour, "isHexColour");

// ../../packages/shared/src/resolveTarget.ts
var WALK_SAMPLE_PX = 6;
function resolveTarget(from, to, walkable) {
  const snapped = snapToWalkable(to, walkable);
  const len = distance(from, snapped);
  if (len <= WALK_SAMPLE_PX) return isWalkable(snapped, walkable) ? snapped : from;
  if (!isWalkable(from, walkable)) return snapped;
  const steps = Math.ceil(len / WALK_SAMPLE_PX);
  let last = from;
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, i / steps);
    const p = { x: from.x + (snapped.x - from.x) * t, y: from.y + (snapped.y - from.y) * t };
    if (!isWalkable(p, walkable)) return last;
    last = p;
  }
  return snapped;
}
__name(resolveTarget, "resolveTarget");

// ../../packages/shared/src/edge.ts
var EDGE_PROTOCOL_VERSION = 2;
var MAX_FRAME_BYTES = 1024;
var HEARTBEAT_FRAME = "hb";
var CLOSE = {
  BAD_PASS: 4001,
  BAD_PROTOCOL: 4002,
  RATE_LIMITED: 4003,
  NOT_ADMITTED: 4004,
  REPLACED: 4005,
  ROOM_FULL: 4010,
  TOO_LARGE: 1009
};
function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
__name(isObj, "isObj");
function isVec2(v, maxX = 1600, maxY = 900) {
  return isObj(v) && typeof v["x"] === "number" && typeof v["y"] === "number" && Number.isFinite(v["x"]) && Number.isFinite(v["y"]) && v["x"] >= 0 && v["x"] <= maxX && v["y"] >= 0 && v["y"] <= maxY;
}
__name(isVec2, "isVec2");
function isLook(v) {
  return isObj(v) && isHexColour(v["body"]) && isHexColour(v["belly"]) && isHexColour(v["accent"]);
}
__name(isLook, "isLook");
var SPAWN_NAME = /^[a-z][a-z0-9-]{0,23}$/;
function parseClientFrame(text, maxBytes = MAX_FRAME_BYTES) {
  if (typeof text !== "string" || text.length > maxBytes) return null;
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  switch (v["t"]) {
    case "hello": {
      if (v["v"] !== EDGE_PROTOCOL_VERSION || !isLook(v["look"])) return null;
      const out = { t: "hello", v: EDGE_PROTOCOL_VERSION, look: v["look"] };
      if (v["spawn"] !== void 0) {
        if (typeof v["spawn"] !== "string" || !SPAWN_NAME.test(v["spawn"])) return null;
        out.spawn = v["spawn"];
      }
      if (v["pos"] !== void 0) {
        if (!isVec2(v["pos"])) return null;
        out.pos = { x: Math.round(v["pos"].x), y: Math.round(v["pos"].y) };
      }
      return out;
    }
    case "move": {
      if (!isVec2(v["to"]) || typeof v["seq"] !== "number" || !Number.isInteger(v["seq"]) || v["seq"] < 0 || v["seq"] > 1e9) return null;
      return { t: "move", to: { x: Math.round(v["to"].x), y: Math.round(v["to"].y) }, seq: v["seq"] };
    }
    case "look":
      return isLook(v["look"]) ? { t: "look", look: { body: v["look"].body, belly: v["look"].belly, accent: v["look"].accent } } : null;
    case "bye":
      return { t: "bye" };
    default:
      return null;
  }
}
__name(parseClientFrame, "parseClientFrame");

// src/Room.ts
var LIMITS = {
  moveBurst: 5,
  moveRefillPerS: 2,
  strikeWindowMs: 1e4,
  strikesToClose: 3,
  frameWindowMs: 5e3,
  framesPerWindow: 40,
  minMovePx: 4,
  minSpacingPx: 24,
  scatterDefault: 220,
  scatterDoor: 60,
  scatterAttempts: 11,
  scatterShrink: 20,
  resumeRadius: 240,
  leaverMemoryMs: 12e4
};
var Room = class {
  static {
    __name(this, "Room");
  }
  def;
  visitors = /* @__PURE__ */ new Map();
  leavers = /* @__PURE__ */ new Map();
  opts;
  constructor(def, opts) {
    this.def = def;
    this.opts = opts;
  }
  get id() {
    return this.def.id;
  }
  get count() {
    return this.visitors.size;
  }
  get cap() {
    return this.opts.cap;
  }
  has(id) {
    return this.visitors.has(id);
  }
  ids() {
    return [...this.visitors.keys()];
  }
  now() {
    return this.opts.now();
  }
  rnd() {
    return (this.opts.random ?? Math.random)();
  }
  send(v, frame) {
    try {
      v.peer.send(JSON.stringify(frame));
    } catch {
    }
  }
  broadcast(frame, except) {
    const text = JSON.stringify(frame);
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      try {
        v.peer.send(text);
      } catch {
      }
    }
  }
  snapshot(except) {
    const out = [];
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      out.push({ id, look: v.st.look, pos: v.st.pos, walk: v.st.walk });
    }
    return out;
  }
  /** Where the visitor is right now, finishing any walk that has run its course. */
  currentPos(v) {
    if (!v.st.walk) return v.st.pos;
    const { pos, done } = positionAlongWalk({ from: v.st.walk.from, to: v.st.walk.to, startedAt: v.st.walk.at }, this.now());
    if (done) {
      v.st.pos = v.st.walk.to;
      v.st.walk = null;
      return v.st.pos;
    }
    return { x: Math.round(pos.x), y: Math.round(pos.y) };
  }
  occupied(p, except) {
    for (const [id, v] of this.visitors) {
      if (id === except) continue;
      if (distance(this.currentPos(v), p) < LIMITS.minSpacingPx) return true;
    }
    return false;
  }
  /** Pick a free walkable point near the spawn, shrinking the search each failed attempt. */
  scatter(spawn, radius, except) {
    let r = radius;
    for (let i = 0; i < LIMITS.scatterAttempts && r > 0; i++) {
      const p = { x: Math.round(spawn.x + (this.rnd() * 2 - 1) * r), y: Math.round(spawn.y + (this.rnd() * 2 - 1) * r * 0.5) };
      if (isWalkable(p, this.def.walkable) && !this.occupied(p, except)) return p;
      r -= LIMITS.scatterShrink;
    }
    return { ...spawn };
  }
  /**
   * Admit a visitor. Returns 'full' (caller sends `full` and closes 4010) or 'ok' after
   * the welcome and enter frames have been sent. A second session for the same id
   * replaces the first (closed 4005).
   */
  join(peer, id, hello) {
    const existing = this.visitors.get(id);
    if (existing) {
      existing.peer.close(CLOSE.REPLACED, "replaced by a newer session");
      this.visitors.delete(id);
      this.broadcast({ t: "leave", id });
    } else if (this.visitors.size >= this.opts.cap) {
      return "full";
    }
    const spawnName = hello.spawn ?? "default";
    const spawn = findSpawn(this.def, spawnName);
    const isDoorEntry = spawnName !== "default" && this.def.spawns[spawnName] !== void 0;
    let pos = null;
    if (hello.pos && isWalkable(hello.pos, this.def.walkable)) {
      const recent = this.leavers.get(id);
      const nearSpawn = distance(hello.pos, spawn) <= LIMITS.resumeRadius;
      const nearLeave = recent !== void 0 && this.now() - recent.leftAt <= LIMITS.leaverMemoryMs && distance(hello.pos, recent.pos) <= LIMITS.resumeRadius;
      if ((nearSpawn || nearLeave) && !this.occupied(hello.pos)) pos = hello.pos;
    }
    if (!pos) pos = this.scatter(spawn, isDoorEntry ? LIMITS.scatterDoor : LIMITS.scatterDefault);
    const now = this.now();
    const v = { peer, st: { id, look: hello.look, pos, walk: null }, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [] };
    this.visitors.set(id, v);
    this.leavers.delete(id);
    this.opts.onState?.(id, v.st);
    this.send(v, {
      t: "welcome",
      v: EDGE_PROTOCOL_VERSION,
      id,
      room: this.def.id,
      now,
      cap: this.opts.cap,
      you: { pos },
      owls: this.snapshot(id),
      counts: this.opts.counts?.() ?? { [this.def.id]: this.visitors.size }
    });
    this.broadcast({ t: "enter", owl: { id, look: v.st.look, pos, walk: null } }, id);
    return "ok";
  }
  /** Re-attach a visitor after the host process was recycled (no frames are sent). */
  restore(peer, st) {
    const now = this.now();
    this.visitors.set(st.id, { peer, st, seq: -1, tokens: LIMITS.moveBurst, refilledAt: now, strikes: [], frames: [] });
  }
  /** Count a frame against the per-socket flood limit. Returns false when the socket must go. */
  admitFrame(v) {
    const now = this.now();
    v.frames = v.frames.filter((t) => now - t < LIMITS.frameWindowMs);
    v.frames.push(now);
    return v.frames.length <= LIMITS.framesPerWindow;
  }
  strike(v) {
    const now = this.now();
    v.strikes = v.strikes.filter((t) => now - t < LIMITS.strikeWindowMs);
    v.strikes.push(now);
    return v.strikes.length >= LIMITS.strikesToClose;
  }
  takeToken(v) {
    const now = this.now();
    const refill = (now - v.refilledAt) / 1e3 * LIMITS.moveRefillPerS;
    if (refill >= 1) {
      v.tokens = Math.min(LIMITS.moveBurst, v.tokens + Math.floor(refill));
      v.refilledAt = now;
    }
    if (v.tokens <= 0) return false;
    v.tokens -= 1;
    return true;
  }
  /** Validate and apply a walk request; echoes to the sender with its seq. */
  move(id, msg) {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, "too many frames");
    if (!this.takeToken(v)) {
      if (this.strike(v)) v.peer.close(CLOSE.RATE_LIMITED, "too many moves");
      return;
    }
    if (msg.seq <= v.seq) return;
    v.seq = msg.seq;
    const from = this.currentPos(v);
    const to = resolveTarget(from, msg.to, this.def.walkable);
    const target = { x: Math.round(to.x), y: Math.round(to.y) };
    if (distance(from, target) < LIMITS.minMovePx) return;
    const at = this.now();
    v.st.walk = { from, to: target, at };
    v.st.pos = from;
    this.opts.onState?.(id, v.st);
    const frame = { t: "move", id, from, to: target, at };
    this.broadcast(frame, id);
    this.send(v, { ...frame, seq: msg.seq });
  }
  look(id, look) {
    const v = this.visitors.get(id);
    if (!v) return;
    if (!this.admitFrame(v)) return void v.peer.close(CLOSE.RATE_LIMITED, "too many frames");
    v.st.look = look;
    this.opts.onState?.(id, v.st);
    this.broadcast({ t: "look", id, look }, id);
  }
  /** Remove a visitor (graceful bye, socket close, or idle reap). */
  leave(id) {
    const v = this.visitors.get(id);
    if (!v) return;
    const pos = this.currentPos(v);
    this.visitors.delete(id);
    this.leavers.set(id, { pos, leftAt: this.now() });
    if (this.leavers.size > 200) {
      const oldest = this.leavers.keys().next().value;
      if (oldest !== void 0) this.leavers.delete(oldest);
    }
    this.broadcast({ t: "leave", id });
  }
};

// src/RoomObject.ts
var HELLO_TIMEOUT_MS = 5e3;
var IDLE_CLOSE_MS = 9e4;
var ALARM_EVERY_MS = 6e4;
var MAX_SOCKETS_PER_IP = 3;
function peerOf(ws) {
  return {
    send: /* @__PURE__ */ __name((text) => ws.send(text), "send"),
    close: /* @__PURE__ */ __name((code, reason) => {
      try {
        ws.close(code, reason);
      } catch {
      }
    }, "close")
  };
}
__name(peerOf, "peerOf");
var RoomObject = class extends DurableObject {
  static {
    __name(this, "RoomObject");
  }
  rooms = /* @__PURE__ */ new Map();
  lastCounts = "";
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_FRAME, HEARTBEAT_FRAME));
    for (const ws of ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att?.state) continue;
      this.room(att.room).restore(peerOf(ws), att.state);
    }
  }
  counts() {
    const out = {};
    for (const [id, r] of this.rooms) out[id] = r.count;
    return out;
  }
  room(id) {
    let r = this.rooms.get(id);
    if (!r) {
      const def = ROOMS2[id];
      if (!def) throw new Error(`unknown room ${id}`);
      r = new Room(def, {
        now: /* @__PURE__ */ __name(() => Date.now(), "now"),
        cap: roomCap(this.env, id),
        counts: /* @__PURE__ */ __name(() => this.counts(), "counts"),
        onState: /* @__PURE__ */ __name((vid, st) => this.persist(vid, st), "onState")
      });
      this.rooms.set(id, r);
    }
    return r;
  }
  socketFor(id) {
    return this.ctx.getWebSockets(`id:${id}`)[0];
  }
  persist(id, state) {
    const ws = this.socketFor(id);
    if (!ws) return;
    const att = ws.deserializeAttachment();
    if (att) ws.serializeAttachment({ ...att, state });
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/counts") {
      return Response.json(this.counts());
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const roomId = request.headers.get("X-Room") ?? "";
    const id = request.headers.get("X-Visitor-Id") ?? "";
    const ip = request.headers.get("X-Visitor-Ip") ?? "unknown";
    if (!ROOMS2[roomId] || !id) return new Response("bad room", { status: 400 });
    if (this.ctx.getWebSockets(`ip:${ip}`).length >= MAX_SOCKETS_PER_IP) return new Response("too many connections from this address", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [`id:${id}`, `ip:${ip}`, `room:${roomId}`]);
    server.serializeAttachment({ room: roomId, id, ip, joinedAt: Date.now(), state: null });
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, message) {
    const att = ws.deserializeAttachment();
    if (!att) return ws.close(CLOSE.BAD_PROTOCOL, "no session");
    if (typeof message !== "string") return ws.close(CLOSE.BAD_PROTOCOL, "text frames only");
    if (message === HEARTBEAT_FRAME) return;
    const frame = parseClientFrame(message);
    if (!frame) {
      if (message.length > 1024) return ws.close(CLOSE.TOO_LARGE, "frame too large");
      return ws.close(CLOSE.BAD_PROTOCOL, "malformed frame");
    }
    const room = this.room(att.room);
    if (!att.state) {
      if (frame.t !== "hello") return ws.close(CLOSE.BAD_PROTOCOL, "hello first");
      if (this.env.GATE === "ticket" && att.ip !== "admitted") {
      }
      const result = room.join(peerOf(ws), att.id, frame);
      if (result === "full") {
        ws.send(JSON.stringify({ t: "full", room: att.room, cap: room.cap }));
        return ws.close(CLOSE.ROOM_FULL, "room full");
      }
      this.emitCounts();
      return;
    }
    switch (frame.t) {
      case "hello":
        return ws.close(CLOSE.BAD_PROTOCOL, "duplicate hello");
      case "move":
        return room.move(att.id, frame);
      case "look":
        return room.look(att.id, frame.look);
      case "bye":
        room.leave(att.id);
        ws.serializeAttachment({ ...att, state: null });
        ws.close(1e3, "bye");
        this.emitCounts();
        return;
    }
  }
  async webSocketClose(ws) {
    this.drop(ws);
  }
  async webSocketError(ws) {
    this.drop(ws);
  }
  drop(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    if (att.state) {
      const room = this.rooms.get(att.room);
      if (room && this.socketFor(att.id) === ws) room.leave(att.id);
      else if (room && !this.socketFor(att.id)) room.leave(att.id);
    }
    this.emitCounts();
  }
  emitCounts() {
    const counts = this.counts();
    const text = JSON.stringify(counts);
    if (text === this.lastCounts) return;
    this.lastCounts = text;
    for (const room of this.rooms.values()) room.broadcast({ t: "counts", rooms: counts });
  }
  async ensureAlarm() {
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + ALARM_EVERY_MS);
  }
  /** Every minute while anyone is connected: close silent sockets and refresh counts. */
  async alarm() {
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      const att = ws.deserializeAttachment();
      if (!att) continue;
      const lastBeat = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? att.joinedAt;
      const idleFor = now - Math.max(lastBeat, att.joinedAt);
      const limit = att.state ? IDLE_CLOSE_MS : HELLO_TIMEOUT_MS;
      if (idleFor > limit) {
        try {
          ws.close(att.state ? 1001 : CLOSE.BAD_PROTOCOL, att.state ? "idle" : "no hello");
        } catch {
        }
        this.drop(ws);
      }
    }
    this.emitCounts();
    if (this.ctx.getWebSockets().length > 0) await this.ctx.storage.setAlarm(now + ALARM_EVERY_MS);
  }
};

// src/index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store"
};
function objectFor(env, roomId) {
  const name = env.ROOM_SHARDING === "room" ? `room:${roomId}` : "park";
  return env.ROOMS.get(env.ROOMS.idFromName(name));
}
__name(objectFor, "objectFor");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/pass") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (env.GATE === "ticket") return Response.json({ error: "tickets required" }, { status: 403, headers: CORS });
      const exp = Math.floor(Date.now() / 1e3) + GUEST_PASS_TTL_S;
      const pass = await mintPass(signingSecret(env), { id: randomVisitorId(), exp, adm: false });
      return Response.json({ pass, exp }, { headers: CORS });
    }
    if (url.pathname === "/api/counts") {
      if (env.ROOM_SHARDING === "room") {
        const out = {};
        await Promise.all(
          Object.keys(ROOMS2).map(async (id) => {
            const r2 = await objectFor(env, id).fetch("https://park/counts");
            const c = await r2.json();
            out[id] = c[id] ?? 0;
          })
        );
        return Response.json(out, { headers: CORS });
      }
      const r = await objectFor(env, "hub").fetch("https://park/counts");
      return new Response(r.body, { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (url.pathname.startsWith("/ws/")) {
      const roomId = url.pathname.slice(4);
      if (!ROOMS2[roomId]) return new Response("unknown room", { status: 404 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      const pass = await verifyPass(signingSecret(env), url.searchParams.get("pass"));
      if (!pass) return new Response("bad pass", { status: 401 });
      if (env.GATE === "ticket" && !pass.adm) return new Response("not admitted", { status: 403 });
      const headers = new Headers(request.headers);
      headers.set("X-Room", roomId);
      headers.set("X-Visitor-Id", pass.id);
      headers.set("X-Visitor-Ip", request.headers.get("CF-Connecting-IP") ?? "unknown");
      return objectFor(env, roomId).fetch(new Request(request, { headers }));
    }
    return env.ASSETS.fetch(request);
  }
};

// ../../node_modules/.pnpm/wrangler@4.151.0_@cloudflare+workers-types@4.20260702.1_@types+node@22.20.5/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/.pnpm/wrangler@4.151.0_@cloudflare+workers-types@4.20260702.1_@types+node@22.20.5/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-myqKW9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/.pnpm/wrangler@4.151.0_@cloudflare+workers-types@4.20260702.1_@types+node@22.20.5/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-myqKW9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RoomObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
