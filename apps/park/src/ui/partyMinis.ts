/**
 * The party game's minigames on the page (OP-314): each draws its own canvas over the board while it
 * runs, from the view the room server sends and, for a game the room streams as inputs, every owl's
 * input as it was taken. The rules are the shared ones (packages/shared/src/party), so the page draws
 * what the server will decide; the server's result is the one that counts.
 */
import {
  AIR_MS,
  BREATH_MAX,
  ECHO_CALLS,
  FALL_FIELD,
  FALL_MS,
  FALL_OWL_START,
  FALL_OWL_Y,
  crossesAt,
  fallScore,
  itemAt,
  owlX,
  UPDRAFT_COLUMNS,
  UPDRAFT_GOAL,
  UPDRAFT_MS,
  flightAt,
  type FallItem,
  type MiniKey,
  type PartyLook,
  type StampedInput,
} from '@owl-park/shared';
import { drawOwl, sizeBox } from './partyDraw';

/** What a minigame's drawer needs of the screen. */
export interface MiniHost {
  send(k: MiniKey, v: number): void;
  /** ms since the minigame started, on the room server's clock. */
  now(): number;
  you(): number | null;
  look(seat: number): PartyLook | undefined;
  name(seat: number): string;
  seats(): number[];
}

export interface MiniDrawer {
  /** The minigame as the room server sees it now. */
  view(v: unknown): void;
  /** One owl's input as the room took it (for a game streamed as inputs). */
  event(ev: { seat: number; k: string; v: number; t: number }): void;
  draw(): void;
  key(key: string, down: boolean): void;
  destroy(): void;
}

const CSS = `
#hud .party .mini{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#hud .party .pads{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;width:min(680px,calc(100% - 24px))}
#hud .party .pad{aspect-ratio:1;min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:16px;background:rgba(255,211,106,.10);border:2px solid #ffd36a;color:#ffd36a;font-weight:700;font-size:15px;box-shadow:none}
#hud .party .pad small{font-weight:500;font-size:11px;opacity:.9}
#hud .party .pad.lit{background:#FFD36A;color:#0C1E36}
#hud .party .pad:disabled{opacity:.45}
#hud .party .ctl{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:10px;width:min(560px,calc(100% - 24px))}
#hud .party .ctl .pad{flex:1;aspect-ratio:auto;min-height:72px;touch-action:none;user-select:none;-webkit-user-select:none}
#hud .party .ctl .pad.big{flex:2}
#hud .party .holes{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;width:min(520px,calc(100% - 24px))}
#hud .party .hole{aspect-ratio:1;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:14px;background:rgba(246,241,227,.06);border:2px dashed rgba(246,241,227,.55);color:#F6F1E3;font-size:13px}
#hud .party .hole b{font-size:30px;line-height:1.1}
#hud .party .hole.open{border-style:solid;border-color:#FFD36A;background:rgba(255,211,106,.16)}
#hud .party .hole.found{border-style:solid;opacity:.7}
#hud .party .hole.t0.found{border-color:#7FD1C7}
#hud .party .hole.t1.found{border-color:#E7A0C8}
#hud .party .hole.cursor{outline:3px solid #FFD36A;outline-offset:2px}
@media (max-width:600px){#hud .party .pads{grid-template-columns:repeat(2,minmax(0,1fr));width:min(320px,calc(100% - 24px))}}
`;
let styled = false;
function style(): void {
  if (styled) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  styled = true;
}

function canvasIn(stage: HTMLElement): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; fit: (w: number, h: number) => { s: number; ox: number; oy: number } } {
  style();
  const c = document.createElement('canvas');
  c.className = 'mini';
  stage.appendChild(c);
  const ctx = c.getContext('2d')!;
  const fit = (w: number, h: number) => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(r.width * dpr));
    const ch = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const s = Math.min(cw / w, ch / h);
    const ox = (cw - w * s) / 2;
    const oy = (ch - h * s) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(s, 0, 0, s, ox, oy);
    return { s, ox, oy };
  };
  return { c, ctx, fit };
}

/** Scores across the top: each owl's, in its colours. */
function drawScores(ctx: CanvasRenderingContext2D, host: MiniHost, scores: Record<number, number>, w: number, word: string): void {
  const seats = host.seats();
  const each = w / Math.max(1, seats.length);
  seats.forEach((seat, i) => {
    const look = host.look(seat);
    const x = each * i + 24;
    if (look) drawOwl(ctx, x, 26, 13, look, seat === host.you());
    ctx.fillStyle = '#F6F1E3';
    ctx.font = '700 18px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${host.name(seat)}: ${scores[seat] ?? 0} ${word}`, x + 22, 26, each - 50);
  });
}

function timeBar(ctx: CanvasRenderingContext2D, t: number, ms: number, w: number, y: number): void {
  ctx.fillStyle = 'rgba(246,241,227,.15)';
  ctx.fillRect(0, y, w, 6);
  ctx.fillStyle = '#FFD36A';
  ctx.fillRect(0, y, w * Math.max(0, 1 - t / ms), 6);
}

// ---------- Feather Fall: drag, or hold an arrow ----------

/** A page sends where its owl flies no more often than this (the room takes one every 200 ms). */
const FALL_SEND_MS = 230;

function featherFall(host: MiniHost, stage: HTMLElement): MiniDrawer {
  const { c, ctx, fit } = canvasIn(stage);
  let items: FallItem[] = [];
  let inputs: StampedInput[] = [];
  const mine: StampedInput[] = [];
  let want: number | null = null;
  let sentX = FALL_OWL_START;
  let lastSent = -1e9;
  const held = { left: false, right: false };
  let geo = { s: 1, ox: 0, oy: 0 };
  let down = false;
  const W = FALL_FIELD.w;
  const H = FALL_FIELD.h + 60;

  const all = () => [...inputs.filter((i) => i.seat !== host.you()), ...mine].sort((a, b) => a.t - b.t);
  const toField = (e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    const dpr = c.width / Math.max(1, r.width);
    return Math.max(0, Math.min(W, ((e.clientX - r.left) * dpr - geo.ox) / geo.s));
  };
  const onDown = (e: PointerEvent) => {
    down = true;
    want = toField(e);
    c.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (down || e.pointerType === 'mouse') want = toField(e);
  };
  const onUp = () => (down = false);
  c.addEventListener('pointerdown', onDown);
  c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp);
  c.addEventListener('pointercancel', onUp);

  const timer = setInterval(() => {
    const me = host.you();
    const t = host.now();
    if (me === null || t < 0 || t > FALL_MS) return;
    const x = owlX(all(), me, t);
    if (held.left !== held.right) want = Math.max(0, Math.min(W, x + (held.left ? -320 : 320)));
    if (want === null || Math.abs(want - sentX) < 6 || t - lastSent < FALL_SEND_MS) return;
    const v = Math.round(want);
    host.send('x', v);
    mine.push({ seat: me, k: 'x', v, t });
    sentX = v;
    lastSent = t;
  }, 40);

  return {
    view(v) {
      const fv = v as { items: FallItem[]; inputs: StampedInput[] };
      items = fv.items ?? [];
      inputs = fv.inputs ?? [];
    },
    event(ev) {
      if (ev.k !== 'x' || ev.seat === host.you()) return;
      inputs.push({ seat: ev.seat, k: 'x', v: ev.v, t: ev.t });
      inputs.sort((a, b) => a.t - b.t);
    },
    draw() {
      geo = fit(W, H);
      const t = Math.max(0, Math.min(FALL_MS, host.now()));
      const timeline = all();
      const scores: Record<number, number> = {};
      for (const seat of host.seats()) scores[seat] = fallScore({ players: [], items, inputs: timeline }, seat, t).score;
      drawScores(ctx, host, scores, W, 'feathers');
      ctx.save();
      ctx.translate(0, 60);
      sizeBox(ctx, 0, 0, FALL_FIELD.w, FALL_FIELD.h, 'Forest floor', { fill: 'rgba(255,211,106,.04)', font: 16 });
      timeBar(ctx, t, FALL_MS, W, FALL_FIELD.h - 6);
      const tint = host.look(host.you() ?? 0)?.body;
      for (const it of items) {
        if (it.t > t || crossesAt(it) + 250 < t) continue;
        const p = itemAt(it, t);
        if (it.kind === 'feather') sizeBox(ctx, p.x - 12, p.y - 18, 24, 36, 'F', { font: 9, ...(tint ? { fill: `${tint}cc` } : {}) });
        else sizeBox(ctx, p.x - 16, p.y - 20, 32, 40, 'Cone', { font: 9, fill: 'rgba(160,90,40,.5)' });
      }
      for (const seat of host.seats()) {
        const look = host.look(seat);
        if (look) drawOwl(ctx, owlX(timeline, seat, t), FALL_OWL_Y, 24, look, seat === host.you());
      }
      ctx.restore();
    },
    key(k, isDown) {
      if (k === 'ArrowLeft') held.left = isDown;
      else if (k === 'ArrowRight') held.right = isDown;
      else return;
      if (!isDown && !held.left && !held.right) want = owlX(all(), host.you() ?? 0, host.now());
    },
    destroy() {
      clearInterval(timer);
      c.remove();
    },
  };
}

// ---------- Hoot Echo: four calls, tapped back ----------

/** The elder's four calls as stand-in tones until the park's owl calls are recorded. */
const CALL_HZ = [392, 523, 659, 784];
const CALL_KEYS: Record<string, number> = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, ArrowDown: 3 };
const CALL_ARROWS = ['←', '↑', '→', '↓'];

interface EchoView {
  round: number;
  phase: 'show' | 'answer' | 'done';
  at: number;
  ends: number;
  length: number;
  pattern?: number[];
  callMs?: number;
  leadMs?: number;
  alive: number[];
  got: Record<number, number>;
  cleared: Record<number, number>;
}

function hootEcho(host: MiniHost, stage: HTMLElement): MiniDrawer {
  const { c, ctx, fit } = canvasIn(stage);
  const audio: { ctx: AudioContext | null } = { ctx: null };
  const tone = (i: number) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      audio.ctx ??= new AC();
      const a = audio.ctx;
      if (a.state === 'suspended') void a.resume();
      const now = a.currentTime;
      const g = a.createGain();
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      g.connect(a.destination);
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(CALL_HZ[i] ?? 440, now);
      o.connect(g);
      o.start(now);
      o.stop(now + 0.36);
    } catch {
      // No sound on this device: the calls still light up.
    }
  };
  const pads = document.createElement('div');
  pads.className = 'pads';
  const buttons = Array.from({ length: ECHO_CALLS }, (_, i) => {
    const b = document.createElement('button');
    b.className = 'pad';
    b.dataset['call'] = String(i);
    b.innerHTML = `<span>Call ${CALL_ARROWS[i]}</span><small>160×160</small>`;
    b.addEventListener('click', () => hoot(i));
    pads.appendChild(b);
    return b;
  });
  stage.appendChild(pads);
  let v: EchoView | null = null;
  let flash: { i: number; until: number } | null = null;
  let lastShown = -1;

  const mayHoot = () => {
    const me = host.you();
    return !!v && me !== null && v.phase === 'answer' && v.alive.includes(me) && (v.got[me] ?? 0) < v.length;
  };
  const hoot = (i: number) => {
    if (!mayHoot()) return;
    tone(i);
    flash = { i, until: performance.now() + 220 };
    host.send('tap', i);
  };

  return {
    view(next) {
      v = next as EchoView;
    },
    event() {},
    draw() {
      const W = 1000;
      const H = 420;
      fit(W, H);
      const scores: Record<number, number> = {};
      if (v) for (const seat of host.seats()) scores[seat] = v.cleared[seat] ?? 0;
      drawScores(ctx, host, scores, W, 'rounds');
      sizeBox(ctx, W / 2 - 60, 60, 120, 120, 'Elder owl', { font: 13 });
      if (!v) return;
      const t = host.now();
      const me = host.you();
      let lit: number | null = null;
      if (v.phase === 'show' && v.pattern && v.callMs !== undefined && v.leadMs !== undefined) {
        const k = Math.floor((t - v.at - v.leadMs) / v.callMs);
        const into = (t - v.at - v.leadMs) % v.callMs;
        if (k >= 0 && k < v.pattern.length && into < v.callMs * 0.8) {
          lit = v.pattern[k]!;
          if (k !== lastShown) {
            lastShown = k;
            tone(lit);
          }
        }
      } else lastShown = -1;
      if (flash && performance.now() < flash.until) lit = flash.i;
      buttons.forEach((b, i) => {
        b.classList.toggle('lit', lit === i);
        b.disabled = !mayHoot();
      });
      ctx.fillStyle = '#F6F1E3';
      ctx.font = '700 26px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const out = me !== null && !v.alive.includes(me);
      const line = v.phase === 'show' ? 'Listen to the elder…' : out ? 'You sat out: watch the others!' : v.phase === 'answer' ? (mayHoot() ? 'Hoot it back!' : 'Well hooted! Wait for the others') : 'Done!';
      ctx.fillText(`Round ${v.round}: ${line}`, W / 2, 220);
      // Who is still hooting, and how far each got this round.
      const seats = host.seats();
      seats.forEach((seat, i) => {
        const x = (W / (seats.length + 1)) * (i + 1);
        const look = host.look(seat);
        if (look) {
          ctx.globalAlpha = v!.alive.includes(seat) ? 1 : 0.35;
          drawOwl(ctx, x, 290, 22, look, seat === me);
          ctx.globalAlpha = 1;
        }
        ctx.font = '600 16px system-ui,sans-serif';
        ctx.fillStyle = '#F6F1E3';
        ctx.fillText(v!.alive.includes(seat) ? `${v!.got[seat] ?? 0}/${v!.length}` : 'out', x, 330);
      });
      timeBar(ctx, t - v.at, Math.max(1, v.ends - v.at), W, 360);
    },
    key(k, isDown) {
      const i = CALL_KEYS[k];
      if (isDown && i !== undefined) hoot(i);
    },
    destroy() {
      pads.remove();
      c.remove();
      void audio.ctx?.close().catch(() => undefined);
    },
  };
}

// ---------- Shared bits for the four below ----------

/** Sends a page's inputs no closer together than `gap` ms (the room refuses quicker ones): a later hold replaces one still waiting. */
function spaced(host: MiniHost, gap: number, sent?: (k: MiniKey, v: number, t: number) => void): (k: MiniKey, v: number) => void {
  const queue: { k: MiniKey; v: number }[] = [];
  let last = -1e9;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    const next = queue.shift();
    if (!next) return;
    const t = host.now();
    host.send(next.k, next.v);
    sent?.(next.k, next.v, t);
    last = performance.now();
    if (queue.length) timer = setTimeout(flush, gap);
  };
  return (k, v) => {
    const waiting = k === 'hold' ? queue.find((q) => q.k === 'hold') : undefined;
    if (waiting) waiting.v = v;
    else queue.push({ k, v });
    if (timer) return;
    const wait = Math.max(0, gap - (performance.now() - last));
    timer = setTimeout(flush, wait);
  };
}

/** A big button that holds while pressed (pointer down to up), and calls `press` with true and false. */
function holdPad(label: string, size: string, press: (down: boolean) => void, big = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = big ? 'pad big' : 'pad';
  b.innerHTML = `<span>${label}</span><small>${size}</small>`;
  let down = false;
  const set = (d: boolean) => {
    if (d === down) return;
    down = d;
    b.classList.toggle('lit', d);
    press(d);
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.setPointerCapture?.(e.pointerId);
    set(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 24, color = '#F6F1E3'): void {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px system-ui,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

// ---------- Updraft Race: hold to flap, steer into the warm air ----------

const AIR_FILL: Record<number, string> = { [-1]: 'rgba(110,160,255,.22)', 0: 'rgba(246,241,227,.03)', 1: 'rgba(255,211,106,.16)', 2: 'rgba(255,170,60,.34)' };
const AIR_WORD: Record<number, string> = { [-1]: 'Cold ↓', 0: 'Still', 1: 'Warm ↑', 2: 'Updraft ↑↑' };

function updraftRace(host: MiniHost, stage: HTMLElement): MiniDrawer {
  const { ctx, fit, c } = canvasIn(stage);
  let air: number[][] = [];
  let inputs: StampedInput[] = [];
  const mine: StampedInput[] = [];
  const send = spaced(host, 130, (k, v, t) => {
    const me = host.you();
    if (me !== null) mine.push({ seat: me, k, v, t });
  });
  const held = new Set<string>();
  const ctl = document.createElement('div');
  ctl.className = 'ctl';
  ctl.append(
    holdPad('◀ Steer', '120×72', (d) => d && send('dir', -1)),
    holdPad('Flap', '240×72', (d) => send('hold', d ? 1 : 0), true),
    holdPad('Steer ▶', '120×72', (d) => d && send('dir', 1)),
  );
  stage.appendChild(ctl);
  const all = () => [...inputs.filter((i) => i.seat !== host.you()), ...mine].sort((a, b) => a.t - b.t);
  const W = 1000;
  const H = 700;
  const SKY = { y: 60, h: 600 };
  const colW = W / UPDRAFT_COLUMNS;
  const yOf = (alt: number) => SKY.y + SKY.h - (alt / UPDRAFT_GOAL) * (SKY.h - 40) - 20;

  return {
    view(v) {
      const uv = v as { air: number[][]; inputs: StampedInput[] };
      air = uv.air ?? [];
      inputs = uv.inputs ?? [];
    },
    event(ev) {
      if (ev.seat === host.you() || (ev.k !== 'hold' && ev.k !== 'dir')) return;
      inputs.push({ seat: ev.seat, k: ev.k, v: ev.v, t: ev.t });
      inputs.sort((a, b) => a.t - b.t);
    },
    draw() {
      fit(W, H);
      const t = Math.max(0, Math.min(UPDRAFT_MS, host.now()));
      const row = air[Math.floor(t / AIR_MS)] ?? [];
      const next = air[Math.floor(t / AIR_MS) + 1];
      const timeline = { air, inputs: all() };
      const flights = new Map(host.seats().map((seat) => [seat, flightAt(timeline, seat, t)]));
      const scores: Record<number, number> = {};
      for (const [seat, f] of flights) scores[seat] = Math.round((f.alt / UPDRAFT_GOAL) * 100);
      drawScores(ctx, host, scores, W, '% up');
      for (let col = 0; col < UPDRAFT_COLUMNS; col++) {
        const a = row[col] ?? 0;
        sizeBox(ctx, col * colW, SKY.y, colW, SKY.h, 'Sky column', { fill: AIR_FILL[a] ?? AIR_FILL[0]!, font: 11 });
        line(ctx, AIR_WORD[a] ?? '', col * colW + colW / 2, SKY.y + SKY.h - 18, 16);
        if (next) line(ctx, `next: ${AIR_WORD[next[col] ?? 0]}`, col * colW + colW / 2, SKY.y + 52, 12, 'rgba(246,241,227,.7)');
      }
      sizeBox(ctx, 0, SKY.y, W, 34, 'Treetop', { fill: 'rgba(127,209,199,.22)', font: 13 });
      timeBar(ctx, t, UPDRAFT_MS, W, SKY.y + SKY.h + 4);
      const me = host.you();
      host.seats().forEach((seat, i) => {
        const f = flights.get(seat)!;
        const look = host.look(seat);
        if (look) drawOwl(ctx, f.col * colW + colW / 2 + (i - 1.5) * 14, yOf(f.alt), 20, look, seat === me);
      });
      if (me !== null) {
        const f = flights.get(me);
        if (f) {
          // Breath for the own owl: a bar under the sky.
          ctx.fillStyle = 'rgba(246,241,227,.15)';
          ctx.fillRect(W / 2 - 150, SKY.y + SKY.h + 16, 300, 12);
          ctx.fillStyle = f.winded ? '#E07A5F' : '#7FD1C7';
          ctx.fillRect(W / 2 - 150, SKY.y + SKY.h + 16, (300 * f.breath) / BREATH_MAX, 12);
          line(ctx, f.doneAt !== null ? 'At the top!' : f.winded ? 'Out of breath: glide!' : 'Breath', W / 2, SKY.y + SKY.h + 40, 14);
        }
      }
    },
    key(k, down) {
      const was = held.has(k);
      if (down) held.add(k);
      else held.delete(k);
      if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp') {
        if (down !== was) send('hold', down ? 1 : 0);
      } else if ((k === 'ArrowLeft' || k === 'ArrowRight') && down && !was) send('dir', k === 'ArrowLeft' ? -1 : 1);
    },
    destroy() {
      ctl.remove();
      c.remove();
    },
  };
}

/** Each minigame's drawer, by id: a minigame not here yet shows the board while it runs. */
export const MINI_DRAWERS: Partial<Record<string, (host: MiniHost, stage: HTMLElement) => MiniDrawer>> = {
  'updraft-race': updraftRace,
  'feather-fall': featherFall,
  'hoot-echo': hootEcho,
};
