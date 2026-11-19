/**
 * The party game in the park (OP-314), behind the friends preview (`?friends=1`): the Old Stump and its
 * four seats in the Great Hollow, drawn as size boxes; the stump's card, where owls sit, stand and the
 * first to sit starts the game; and, in a game's own room, the party screen over everything.
 *
 * The room server keeps the seats and the games; this layer asks it (`party` frames through the room's
 * connection) and shows what it says. Without the room server (the local park) the stump says so.
 *
 * Never a one-owl game (OP-426, `?standin=1`): an owl that has sat alone for a few seconds may start
 * anyway, and Pip the lantern keeper, a park owl, takes the second seat.
 */
import Phaser from 'phaser';
import {
  PARTY_MIN_OWLS,
  PARTY_SEATS,
  PARTY_STANDIN_WAIT_MS,
  PARTY_WORDS,
  SEAT_SIZE,
  STUMP_AT,
  STUMP_REACH,
  STUMP_ROOM,
  STUMP_SEATS,
  STUMP_SIZE,
  distance,
  isPartyRoom,
  type PartyKey,
  type ServerParty,
  type ServerStump,
  type StumpView,
  type Vec2,
} from '@owl-park/shared';
import type { RoomConnection } from '../net/transport';
import { createPartyScreen, type PartyScreen } from '../ui/partyScreen';

export interface PartyLayerOpts {
  scene: Phaser.Scene;
  room: string;
  hudRoot: () => HTMLElement | null;
  toast(message: string, ms?: number): void;
  /** Walk the owl to a spot (its seat). */
  walkTo(p: Vec2): void;
  /** Into a game's room, or back to the Great Hollow in front of the stump. */
  goTo(room: string): void;
  back(): void;
  /** Whether an owl alone at the stump may play with Pip (OP-426). */
  standIn?: boolean;
}

export interface PartyAction {
  id: string;
  label: string;
  run: () => void;
}

const CARD_CSS = `
#hud .stump-card{position:absolute;z-index:12;left:50%;transform:translateX(-50%);bottom:calc(max(12px,env(safe-area-inset-bottom)) + 120px);width:min(420px,calc(calc(100vw/var(--vz,1)) - 24px));display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:18px;background:rgba(12,30,54,.94);border:1px solid rgba(255,211,106,.55);color:#F6F1E3;pointer-events:auto;box-shadow:0 8px 30px rgba(0,0,0,.45)}
#hud .stump-card header{display:flex;align-items:center;gap:8px}
#hud .stump-card header b{flex:1;font-size:17px}
#hud .stump-card .seats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
#hud .stump-card .seat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:52px;border-radius:12px;border:1px dashed rgba(255,211,106,.6);font-size:12px;text-align:center;padding:4px}
#hud .stump-card .seat i{display:block;width:22px;height:22px;border-radius:50%;border:2px solid #F6F1E3}
#hud .stump-card .seat.taken{border-style:solid;background:rgba(255,211,106,.10)}
#hud .stump-card .line{font-size:14px;min-height:18px}
#hud .stump-card .row{display:flex;gap:8px;flex-wrap:wrap}
#hud .stump-card .row button{flex:1;min-height:46px}
`;
let styled = false;

export class PartyLayer {
  private readonly boxes: Phaser.GameObjects.GameObject[] = [];
  private conn: RoomConnection | null = null;
  private stump: StumpView | null = null;
  /** The seat this owl sits in, as the room last said. */
  private seat: number | null = null;
  private card: HTMLElement | null = null;
  private screen: PartyScreen | null = null;
  private going = false;
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  /** When this owl sat down, by this page's clock; and the timer that shows Pip's offer once it has sat long enough. */
  private satAt = 0;
  private pipTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly inGame: boolean;

  constructor(private readonly o: PartyLayerOpts) {
    this.inGame = isPartyRoom(o.room);
    if (o.room === STUMP_ROOM) this.drawStump();
    if (this.inGame) this.openScreen();
  }

  /** The room's connection, once the scene holds it: the stump is watched, the game asked for. */
  attach(conn: RoomConnection): void {
    this.conn = conn;
    if (!conn.party) {
      if (this.inGame) this.o.back();
      return;
    }
    if (this.o.room === STUMP_ROOM) conn.party.send('stump');
    if (this.inGame) conn.party.send('view');
  }

  /** The Old Stump and its seats as size boxes on the plaza's floor. */
  private drawStump(): void {
    const s = this.o.scene;
    const box = (x: number, y: number, w: number, h: number, name: string) => {
      const g = s.add.graphics();
      g.fillStyle(0xffd36a, 0.1).fillRect(x - w / 2, y - h, w, h);
      g.lineStyle(2, 0xffd36a, 1).strokeRect(x - w / 2, y - h, w, h);
      g.setDepth(y);
      const t = s.add
        .text(x, y - h / 2, `${name}\n${w}×${h}`, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffd36a', align: 'center' })
        .setOrigin(0.5)
        .setDepth(y + 0.5);
      this.boxes.push(g, t);
    };
    box(STUMP_AT.x, STUMP_AT.y + STUMP_SIZE.h / 2, STUMP_SIZE.w, STUMP_SIZE.h, PARTY_WORDS.stump);
    STUMP_SEATS.forEach((p, i) => box(p.x, p.y + SEAT_SIZE.h / 2, SEAT_SIZE.w, SEAT_SIZE.h, `Seat ${i + 1}`));
  }

  private mySeat(): number | null {
    return this.seat;
  }

  /** What the owl can do at the stump, standing by it. */
  actions(pos: Vec2): PartyAction[] {
    if (this.o.room !== STUMP_ROOM || this.going || distance(pos, STUMP_AT) > STUMP_REACH) return [];
    if (this.mySeat() !== null) return [{ id: 'party:stand', label: PARTY_WORDS.stand, run: () => this.ask('stand') }];
    return [{ id: 'party:sit', label: PARTY_WORDS.sit, run: () => this.ask('sit') }];
  }

  private ask(op: 'sit' | 'stand' | 'start', bots = false, standin = false): void {
    const party = this.conn?.party;
    if (!party) return this.o.toast(PARTY_WORDS.noServer, 4000);
    party.send(op, op === 'start' ? { bots, ...(standin ? { standin } : {}) } : {});
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = setTimeout(() => this.o.toast(PARTY_WORDS.notAnswering, 3500), 6000);
  }

  /** The room's word about the seats: an answer or a push. */
  onStump(f: ServerStump): void {
    if (f.r !== undefined && this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
    const before = this.mySeat();
    this.stump = f.stump;
    this.seat = f.you ?? null;
    if (!f.ok && f.reason) {
      const words: Record<string, string> = { full: PARTY_WORDS.full, closing: PARTY_WORDS.closing, few: PARTY_WORDS.waitMore, 'not-starter': PARTY_WORDS.waitStarter, far: PARTY_WORDS.sit };
      this.o.toast(words[f.reason] ?? PARTY_WORDS.notAnswering, 3500);
    }
    const seat = this.mySeat();
    if (seat !== null && before === null) {
      this.satAt = Date.now();
      const p = STUMP_SEATS[seat];
      if (p) this.o.walkTo({ x: p.x, y: p.y + 4 });
    }
    if (f.go && !this.going) {
      this.going = true;
      this.closeCard();
      this.o.toast(PARTY_WORDS.going, 1500);
      this.o.goTo(f.go);
      return;
    }
    this.renderCard();
  }

  private renderCard(): void {
    const v = this.stump;
    const seat = this.mySeat();
    if (!v || seat === null) return this.closeCard();
    const root = this.o.hudRoot();
    if (!root) return;
    if (!styled) {
      const st = document.createElement('style');
      st.textContent = CARD_CSS;
      document.head.appendChild(st);
      styled = true;
    }
    if (!this.card) {
      this.card = document.createElement('section');
      this.card.className = 'stump-card';
      this.card.setAttribute('aria-label', PARTY_WORDS.stump);
      root.appendChild(this.card);
    }
    const seated = v.seats.filter((s) => s !== null).length;
    const starter = v.starter === seat;
    // Alone at the stump: after a few seconds Pip offers to play (OP-426).
    const alone = !!this.o.standIn && starter && seated === 1 && !v.closing;
    const left = this.satAt + PARTY_STANDIN_WAIT_MS + 200 - Date.now();
    const withPip = alone && left <= 0;
    if (this.pipTimer) clearTimeout(this.pipTimer);
    this.pipTimer = alone && !withPip ? setTimeout(() => this.renderCard(), left) : null;
    const few = seated < PARTY_MIN_OWLS && !withPip;
    const line = v.closing ? PARTY_WORDS.closing : withPip ? PARTY_WORDS.standIn : seated < PARTY_MIN_OWLS ? PARTY_WORDS.waitMore : starter ? '' : PARTY_WORDS.waitStarter;
    this.card.innerHTML = `
      <header><b>${PARTY_WORDS.stump}</b></header>
      <div class="seats">${v.seats
        .map((s, i) => `<div class="seat${s ? ' taken' : ''}" data-seat="${i}">${s ? `<i style="background:${s.look.body}"></i>${i === seat ? 'You' : `Owl ${i + 1}`}` : `Seat ${i + 1}`}</div>`)
        .join('')}</div>
      <div class="line" data-line>${line}</div>
      <div class="row">${starter ? `<button data-start ${few || v.closing ? 'disabled' : ''}>${withPip ? PARTY_WORDS.withPip : PARTY_WORDS.start}</button>` : ''}${starter && seated < PARTY_SEATS ? `<button data-fill ${few || v.closing ? 'disabled' : ''}>${PARTY_WORDS.fill}</button>` : ''}<button class="ghost" data-stand>${PARTY_WORDS.stand}</button></div>`;
    this.card.querySelector('[data-start]')?.addEventListener('click', () => this.ask('start', false, withPip));
    this.card.querySelector('[data-fill]')?.addEventListener('click', () => this.ask('start', true, withPip));
    this.card.querySelector('[data-stand]')?.addEventListener('click', () => this.ask('stand'));
  }

  private closeCard(): void {
    if (this.pipTimer) clearTimeout(this.pipTimer);
    this.pipTimer = null;
    this.card?.remove();
    this.card = null;
  }

  // ---------- in a game's room ----------

  private openScreen(): void {
    const root = this.o.hudRoot();
    if (!root) return;
    this.screen = createPartyScreen({
      root,
      send: (k: PartyKey, v: number) => this.conn?.party?.send('in', { k, v }),
      serverNow: () => this.conn?.serverNow?.() ?? Date.now(),
      leave: () => this.o.back(),
    });
  }

  onParty(f: ServerParty): void {
    this.screen?.hear(f);
  }

  onClosed(): void {
    this.screen?.closed();
  }

  /** The owl moves on: everything here goes with the room. */
  destroy(): void {
    if (this.waitTimer) clearTimeout(this.waitTimer);
    for (const b of this.boxes) b.destroy();
    this.boxes.length = 0;
    this.closeCard();
    this.screen?.destroy();
    this.screen = null;
  }
}
