/**
 * The party game's screen (OP-314): over the whole park while the owl is in a game's room. The board
 * (the Old Stump's carved loop, seen from above), each owl's Moonstones and Glowberries, what the owl
 * whose turn it is may do, and each minigame on its own canvas. Everything shown comes from the room
 * server's view of the game; the page only sends what its owl does (`send`).
 *
 * Every piece of the game's art is a plain size box with its size written on it until the artists'
 * art takes its place. The owls are drawn simply in their own colours. One thumb plays it on a phone;
 * on a computer the arrow keys and Space.
 */
import {
  BOARD,
  BOARD_H,
  BOARD_HOP_MS,
  BOARD_W,
  PARTY_WORDS,
  SPACE_WORDS,
  type PartyKey,
  type PartyLook,
  type PartyView,
  type ServerParty,
} from '@owl-park/shared';
import { MINI_DRAWERS, type MiniDrawer, type MiniHost } from './partyMinis';
import { BOX_EDGE, BOX_FILL, drawOwl, sizeBox } from './partyDraw';

export interface PartyScreen {
  /** The room server's word: the game as it stands, one owl's input, or what the game paid. */
  hear(f: ServerParty): void;
  /** The game's room is let go (or this owl was not let in): the screen says so. */
  closed(): void;
  destroy(): void;
  readonly el: HTMLElement;
}

export interface PartyScreenOpts {
  root: HTMLElement;
  send(k: PartyKey, v: number): void;
  /** The room server's clock now (ms). */
  serverNow(): number;
  /** Back to the Party Grove. */
  leave(): void;
}

const CSS = `
#hud .party{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;background:#0C1E36;color:#F6F1E3;pointer-events:auto;font:600 15px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;touch-action:none}
#hud .party header{display:flex;align-items:center;gap:10px;padding:max(8px,env(safe-area-inset-top)) 12px 6px;min-height:48px}
#hud .party header b{font-size:17px}
#hud .party header .grow{flex:1}
#hud .party header button{min-height:40px;padding:6px 14px}
#hud .party .owls{display:flex;gap:8px;padding:0 12px 6px;overflow-x:auto}
#hud .party .owl{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:14px;background:rgba(246,241,227,.07);border:1px solid rgba(246,241,227,.14);white-space:nowrap;font-size:13px}
#hud .party .owl.turn{border-color:#FFD36A;background:rgba(255,211,106,.14)}
#hud .party .owl canvas{width:30px;height:30px}
#hud .party .owl .n{opacity:.85}
#hud .party .stage{position:relative;flex:1;min-height:0}
#hud .party .stage canvas.main{position:absolute;inset:0;width:100%;height:100%}
#hud .party .prompt{display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 12px max(12px,env(safe-area-inset-bottom));min-height:96px;text-align:center}
#hud .party .prompt .line{font-size:16px;max-width:640px}
#hud .party .prompt .notes{font-size:14px;opacity:.9;min-height:18px}
#hud .party .prompt .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
#hud .party .prompt button{min-height:52px;min-width:120px;padding:8px 18px;font-size:16px}
#hud .party .prompt button.big{min-height:64px;min-width:220px;font-size:18px}
#hud .party .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center;background:rgba(12,30,54,.86)}
#hud .party .card h2{margin:0;font-size:26px}
#hud .party .card p{margin:0;max-width:520px}
#hud .party .card ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;min-width:min(360px,90vw)}
#hud .party .card li{display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:12px;background:rgba(246,241,227,.07)}
#hud .party .card li .grow{flex:1;text-align:left}
#hud .party .card li canvas{width:30px;height:30px}
#hud .party .card .count{font-size:40px;color:#FFD36A}
#hud .party :focus-visible{outline:3px solid #FFD36A;outline-offset:2px}
`;

let styled = false;

/** Who an owl is on the screen: the page's own, a park owl, or a visitor's by seat. */
export function owlName(v: Pick<PartyView, 'you' | 'owls'>, seat: number): string {
  const o = v.owls[seat];
  if (seat === v.you) return 'You';
  if (!o || o.bot || o.away) return PARTY_WORDS.parkOwl;
  return `Owl ${seat + 1}`;
}

/** What the prompt asks of this page's owl now (null: nothing, it watches). */
export type Ask = { kind: 'roll' } | { kind: 'fork' } | { kind: 'hollow' } | { kind: 'fact'; question: string };

export function askOf(v: PartyView): Ask | null {
  const t = v.turn;
  if (v.phase !== 'turn' || !t || t.seat !== v.you || v.you === null || v.owls[v.you]?.away) return null;
  switch (t.step) {
    case 'roll':
      return { kind: 'roll' };
    case 'fork':
      return { kind: 'fork' };
    case 'hollow':
      return { kind: 'hollow' };
    case 'fact':
      return t.question ? { kind: 'fact', question: t.question } : null;
    default:
      return null;
  }
}

/** The page's own seat's look, for the feathers in its colour. */
function lookOf(v: PartyView, seat: number): PartyLook | undefined {
  return v.owls[seat]?.look;
}

export function createPartyScreen(opts: PartyScreenOpts): PartyScreen {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const el = document.createElement('section');
  el.className = 'party';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', PARTY_WORDS.stump);
  el.innerHTML = `
    <header><b data-round>${PARTY_WORDS.stump}</b><span class="grow"></span><button class="ghost" data-leave>${PARTY_WORDS.leave}</button></header>
    <div class="owls" data-owls></div>
    <div class="stage" data-stage><canvas class="main" data-canvas></canvas></div>
    <div class="prompt" data-prompt aria-live="polite"><div class="notes" data-notes>${PARTY_WORDS.getReady}</div></div>`;
  opts.root.appendChild(el);
  const $ = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const roundEl = $<HTMLElement>('[data-round]');
  const owlsEl = $<HTMLElement>('[data-owls]');
  const stage = $<HTMLElement>('[data-stage]');
  const canvas = $<HTMLCanvasElement>('[data-canvas]');
  const prompt = $<HTMLElement>('[data-prompt]');
  const ctx = canvas.getContext('2d')!;
  $<HTMLButtonElement>('[data-leave]').addEventListener('click', () => opts.leave());

  let view: PartyView | null = null;
  /** The server's clock minus this page's when the view came. */
  let paid: ServerParty['paid'] | null = null;
  let over: 'closed' | null = null;
  let card: HTMLElement | null = null;
  let mini: { id: string; at: number; drawer: MiniDrawer } | null = null;
  let promptKey = '';
  let owlsKey = '';
  let raf = 0;
  /** Where each seat's owl is drawn on the board, hopping along its turn's path. */
  const shown = new Map<number, { at: number; path: number[]; from: number; startedAt: number }>();

  const host: MiniHost = {
    send: (k, v) => opts.send(k, v),
    now: () => (view && mini ? opts.serverNow() - mini.at : 0),
    you: () => view?.you ?? null,
    look: (seat) => (view ? lookOf(view, seat) : undefined),
    name: (seat) => (view ? owlName(view, seat) : ''),
    seats: () => (view ? view.owls.map((o) => o.seat) : []),
  };

  const fit = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w, h, dpr };
  };

  const setCard = (html: string | null) => {
    card?.remove();
    card = null;
    if (html === null) return;
    card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = html;
    stage.appendChild(card);
  };

  const portrait = (look: PartyLook): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = 60;
    c.height = 60;
    drawOwl(c.getContext('2d')!, 30, 32, 26, look);
    return c;
  };

  const renderOwls = (v: PartyView) => {
    const key = JSON.stringify([v.you, v.turn?.seat, v.owls.map((o) => [o.stones, o.berries, o.away, o.look.body])]);
    if (key === owlsKey) return;
    owlsKey = key;
    owlsEl.innerHTML = '';
    for (const o of v.owls) {
      const chip = document.createElement('div');
      chip.className = `owl${v.phase === 'turn' && v.turn?.seat === o.seat ? ' turn' : ''}`;
      chip.dataset['seat'] = String(o.seat);
      chip.append(portrait(o.look));
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = `${owlName(v, o.seat)}: ${o.stones} 🌙 ${o.berries} 🫐`;
      n.title = `${o.stones} ${PARTY_WORDS.moonstones}, ${o.berries} ${PARTY_WORDS.glowberries}`;
      chip.append(n);
      owlsEl.append(chip);
    }
  };

  const button = (label: string, k: PartyKey, val: number, big = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (big) b.className = 'big';
    b.dataset['k'] = `${k}:${val}`;
    b.addEventListener('click', () => opts.send(k, val));
    return b;
  };

  const renderPrompt = (v: PartyView) => {
    const ask = askOf(v);
    const t = v.turn;
    const key = JSON.stringify([v.phase, ask, t?.seat, t?.step, t?.notes, t?.roll, v.mini?.id]);
    if (key === promptKey) return;
    promptKey = key;
    prompt.innerHTML = '';
    const line = document.createElement('div');
    line.className = 'line';
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.dataset['notes'] = '';
    const row = document.createElement('div');
    row.className = 'row';
    if (v.phase === 'turn' && t) {
      const who = owlName(v, t.seat);
      if (ask?.kind === 'roll') {
        line.textContent = PARTY_WORDS.yourTurn;
        row.append(button(PARTY_WORDS.roll, 'roll', 0, true));
      } else if (ask?.kind === 'fork') {
        line.textContent = PARTY_WORDS.fork;
        row.append(button(`← ${PARTY_WORDS.short}`, 'way', 0), button(`${PARTY_WORDS.long} →`, 'way', 1));
      } else if (ask?.kind === 'hollow') {
        line.textContent = PARTY_WORDS.hollow;
        row.append(button(`← ${PARTY_WORDS.yes}`, 'hollow', 1), button(`${PARTY_WORDS.no} →`, 'hollow', 0));
      } else if (ask?.kind === 'fact') {
        line.textContent = `${PARTY_WORDS.fact} ${ask.question}`;
        row.append(button(`← ${PARTY_WORDS.true}`, 'fact', 1), button(`${PARTY_WORDS.false} →`, 'fact', 0));
      } else {
        line.textContent = t.step === 'fact' && t.question ? `${who}: ${t.question}` : `${who === 'You' ? PARTY_WORDS.yourTurn : `${who}: ${PARTY_WORDS.theirTurn}`}`;
      }
      const said: string[] = [];
      if (t.roll) said.push(PARTY_WORDS.rolled(t.roll));
      said.push(...t.notes);
      if (t.step === 'show' && t.truth !== undefined && t.question) said.push(t.truth ? `${PARTY_WORDS.true}!` : `${PARTY_WORDS.false}!`);
      notes.textContent = said.join(' · ');
    } else if (v.phase === 'gather') line.textContent = PARTY_WORDS.getReady;
    prompt.append(line, row, notes);
  };

  const listOwls = (v: PartyView, order: number[], extra: (seat: number) => string) =>
    `<ol>${order
      .map((seat) => {
        const o = v.owls[seat]!;
        return `<li data-seat="${seat}"><span data-portrait="${seat}"></span><span class="grow">${owlName(v, seat)}</span><span>${extra(seat)}</span></li>`;
      })
      .join('')}</ol>`;

  const fillPortraits = (v: PartyView) => {
    card?.querySelectorAll<HTMLElement>('[data-portrait]').forEach((s) => {
      const o = v.owls[Number(s.dataset['portrait'])];
      if (o) s.replaceWith(portrait(o.look));
    });
  };

  const renderCard = (v: PartyView) => {
    const m = v.mini;
    if (v.phase === 'intro' && m) {
      const phone = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
      const kind = m.kind === 'team' ? '2 vs 2' : m.kind === 'one-vs-rest' ? '1 vs 3' : 'Everyone for themselves';
      setCard(`<h2>${m.name}</h2><p>${kind}</p><p>${phone ? m.how.phone : m.how.keys}</p><div class="count" data-count></div>`);
    } else if (v.phase === 'scores' && m?.result) {
      const order = Object.keys(m.result.places)
        .map(Number)
        .sort((a, b) => m.result!.places[a]! - m.result!.places[b]!);
      setCard(`<h2>${m.name}</h2>${listOwls(v, order, (s) => `+${m.berries?.[s] ?? 0} ${PARTY_WORDS.glowberries}`)}`);
    } else if (v.phase === 'bonus' && v.bonuses) {
      const words = { wins: PARTY_WORDS.bonusWins, facts: PARTY_WORDS.bonusFacts, flown: PARTY_WORDS.bonusFlown };
      const lines = v.bonuses.map((b) => `<p>${words[b.what]}: ${b.seats.length ? b.seats.map((s) => owlName(v, s)).join(', ') : '-'}</p>`).join('');
      setCard(`<h2>${PARTY_WORDS.round(v.round, v.rounds)}</h2>${lines}`);
    } else if (v.phase === 'over' && v.standings) {
      const winners = v.winners ?? [];
      const you = v.you !== null && winners.includes(v.you);
      const head = winners.length > 1 ? PARTY_WORDS.tie : you ? PARTY_WORDS.youWin : `${owlName(v, winners[0] ?? 0)} ${PARTY_WORDS.winner}`;
      const pay = paid ? (paid.practice ? PARTY_WORDS.practice : paid.feathers > 0 ? PARTY_WORDS.feathers(paid.feathers) : PARTY_WORDS.doneForToday) : '';
      setCard(`<h2 data-winner>${head}</h2>${listOwls(v, v.standings, (s) => `${v.owls[s]!.stones} 🌙 ${v.owls[s]!.berries} 🫐`)}<p data-paid>${pay}</p><button class="big" data-back>${PARTY_WORDS.leave}</button>`);
      card?.querySelector('[data-back]')?.addEventListener('click', () => opts.leave());
    } else if (v.phase === 'ended') {
      setCard(`<h2>${PARTY_WORDS.goodGame}</h2><p>${v.ended === 'restart' ? PARTY_WORDS.ended : PARTY_WORDS.empty}</p><button class="big" data-back>${PARTY_WORDS.leave}</button>`);
      card?.querySelector('[data-back]')?.addEventListener('click', () => opts.leave());
    } else setCard(null);
    fillPortraits(v);
  };

  let cardKey = '';
  const render = (v: PartyView) => {
    roundEl.textContent = PARTY_WORDS.round(Math.min(v.round, v.rounds), v.rounds);
    renderOwls(v);
    renderPrompt(v);
    const key = JSON.stringify([v.phase, v.mini?.id, v.mini?.result ? 1 : 0, !!paid]);
    if (key !== cardKey) {
      cardKey = key;
      renderCard(v);
    }
    // The minigame's own drawer while it runs.
    if (v.phase === 'mini' && v.mini) {
      if (!mini || mini.id !== v.mini.id || mini.at !== v.mini.at) {
        mini?.drawer.destroy();
        const make = MINI_DRAWERS[v.mini.id];
        mini = make ? { id: v.mini.id, at: v.mini.at, drawer: make(host, stage) } : null;
      }
      mini?.drawer.view(v.mini.view);
    } else if (mini) {
      mini.drawer.destroy();
      mini = null;
    }
  };

  const placeOwls = (v: PartyView) => {
    const now = performance.now();
    for (const o of v.owls) {
      const s = shown.get(o.seat);
      const moving = v.phase === 'turn' && v.turn?.seat === o.seat ? v.turn.path : [];
      if (!s) shown.set(o.seat, { at: o.at, path: [], from: o.at, startedAt: now });
      else if (moving.length > s.path.length && moving.join() !== s.path.join()) {
        // The new hops of its turn, from where it was drawn.
        shown.set(o.seat, { at: o.at, path: moving.slice(s.path.length), from: currentSpace(s, now), startedAt: now });
      } else if (!moving.length && s.at !== o.at && !s.path.length) shown.set(o.seat, { at: o.at, path: [], from: o.at, startedAt: now });
      else if (!moving.length && s.path.length) shown.set(o.seat, { at: o.at, path: [], from: o.at, startedAt: now });
    }
  };

  const currentSpace = (s: { at: number; path: number[]; from: number; startedAt: number }, now: number) => {
    if (!s.path.length) return s.at;
    const hop = Math.floor((now - s.startedAt) / BOARD_HOP_MS);
    return hop >= s.path.length ? s.path[s.path.length - 1]! : hop < 0 ? s.from : s.path[hop]!;
  };

  const drawBoard = (v: PartyView) => {
    const { w, h, dpr } = fit();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 16 * dpr;
    const scale = Math.min((w - pad * 2) / BOARD_W, (h - pad * 2) / BOARD_H);
    const ox = (w - BOARD_W * scale) / 2;
    const oy = (h - BOARD_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    // The stump's top, carved: one size box for the board.
    sizeBox(ctx, 0, 0, BOARD_W, BOARD_H, 'Old Stump board', { fill: 'rgba(255,211,106,.05)', font: 18 });
    // The ways between the spaces, and the hollow's way through the trunk.
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(246,241,227,.22)';
    for (const sp of BOARD)
      for (const n of sp.next) {
        const to = BOARD[n]!;
        ctx.beginPath();
        ctx.moveTo(sp.at.x, sp.at.y);
        ctx.lineTo(to.at.x, to.at.y);
        ctx.stroke();
      }
    const hollow = BOARD.find((s) => s.hollowTo !== undefined);
    if (hollow) {
      const to = BOARD[hollow.hollowTo!]!;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(hollow.at.x, hollow.at.y);
      ctx.lineTo(to.at.x, to.at.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const sp of BOARD) sizeBox(ctx, sp.at.x - 32, sp.at.y - 22, 64, 44, SPACE_WORDS[sp.kind].name, { font: 11, dims: '64×44', edge: sp.n === 0 ? '#F6F1E3' : BOX_EDGE });
    // The Moon Perch on its branch.
    const perch = BOARD[v.perch];
    if (perch) sizeBox(ctx, perch.at.x - 24, perch.at.y - 78, 48, 48, 'Moon Perch', { font: 9, dims: '48×48', fill: 'rgba(255,211,106,.28)' });
    // The acorn die in the middle.
    const roll = v.phase === 'turn' && v.turn?.roll ? String(v.turn.roll) : '?';
    sizeBox(ctx, BOARD_W / 2 - 45, BOARD_H / 2 - 45, 90, 90, 'Acorn', { font: 12, dims: '90×90', fill: BOX_FILL });
    ctx.fillStyle = '#FFD36A';
    ctx.font = '700 40px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(roll, BOARD_W / 2, BOARD_H / 2 + 4);
    // The owls, a little apart on a shared space.
    const now = performance.now();
    const offs = [
      { x: -18, y: -10 },
      { x: 18, y: -10 },
      { x: -18, y: 14 },
      { x: 18, y: 14 },
    ];
    for (const o of v.owls) {
      const s = shown.get(o.seat);
      const at = s ? currentSpace(s, now) : o.at;
      const sp = BOARD[at] ?? BOARD[0]!;
      const off = offs[o.seat % 4]!;
      drawOwl(ctx, sp.at.x + off.x, sp.at.y + off.y, 17, o.look, v.phase === 'turn' && v.turn?.seat === o.seat);
    }
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!view) return;
    if (view.phase === 'mini' && mini) {
      mini.drawer.draw();
      return;
    }
    drawBoard(view);
    const count = card?.querySelector<HTMLElement>('[data-count]');
    if (count) count.textContent = String(Math.max(0, Math.ceil((view.ends - opts.serverNow()) / 1000)));
  };
  raf = requestAnimationFrame(frame);

  // One thumb on a phone, or the arrow keys and Space on a computer: the owl in the park stands still meanwhile.
  const onKey = (e: KeyboardEvent) => {
    if (!view || e.repeat && e.key === ' ') return;
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (view.phase === 'mini' && mini) return mini.drawer.key(e.key, true);
    const ask = askOf(view);
    if (!ask) return;
    const left = e.key === 'ArrowLeft';
    const right = e.key === 'ArrowRight';
    if (ask.kind === 'roll' && (e.key === ' ' || e.key === 'Spacebar')) opts.send('roll', 0);
    else if (ask.kind === 'fork' && (left || right)) opts.send('way', left ? 0 : 1);
    else if (ask.kind === 'hollow' && (left || right)) opts.send('hollow', left ? 1 : 0);
    else if (ask.kind === 'fact' && (left || right)) opts.send('fact', left ? 1 : 0);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (view?.phase === 'mini' && mini) mini.drawer.key(e.key, false);
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);

  return {
    el,
    hear(f) {
      if (f.paid) {
        paid = f.paid;
        if (view) {
          cardKey = '';
          render(view);
        }
      }
      if (f.ev && mini) mini.drawer.event(f.ev);
      if (!f.view || over) return;
      view = f.view;
      el.dataset['phase'] = view.phase;
      placeOwls(view);
      render(view);
    },
    closed() {
      if (over) return;
      over = 'closed';
      if (view && (view.phase === 'over' || view.phase === 'ended')) return;
      setCard(`<h2>${PARTY_WORDS.stump}</h2><p>${PARTY_WORDS.empty}</p><button class="big" data-back>${PARTY_WORDS.leave}</button>`);
      card?.querySelector('[data-back]')?.addEventListener('click', () => opts.leave());
    },
    destroy() {
      cancelAnimationFrame(raf);
      mini?.drawer.destroy();
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      el.remove();
    },
  };
}
