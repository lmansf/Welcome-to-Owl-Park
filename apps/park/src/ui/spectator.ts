/**
 * Spectators, the page's half (OP-191). With the park's SPECTATORS switch on, an owl without a ticket
 * that works walks on past the turnstiles as a spectator: it goes everywhere, emotes, says phrases,
 * plays every game and flops into leaf piles (OP-243), but earns nothing, and the quests, the Realm
 * Vote and the stores stay locked to it
 * (the room server enforces all of that; the server half, docs/ARCHITECTURE.md section 4). This file
 * holds what the page says to a spectator (and the turnstiles' question's words, OP-198), the turnstiles' choice, the end-of-game offer's words and
 * how often the full offer may come up, and the HUD's "Just looking" badge. Every way it offers a Day
 * Ticket opens the turnstiles' own sale (gateSale.ts, OP-180): the card before the store, then checkout.
 *
 * The words are drafts for the owner's approval.
 */
import { BAND_FEATHERS, type ArcadeGame, runFeathers } from '@owl-park/shared';
import type { Entry, ScanReply } from '../net';
import { gateRefusal } from './tickets';

/** Everything a spectator is told, in one place (drafts for the owner). */
export const SPECTATOR_WORDS = {
  /** At the turnstiles, with no ticket that works: the turnstiles' question (OP-198, gatePrompt.ts) says this above its buttons. */
  turnstile: 'No ticket yet? A Day Ticket lets you keep what you win.',
  /** The question's first button: the turnstiles' sale. */
  buy: 'Buy a Day Ticket',
  /** Its second: in as a spectator. */
  guest: 'Enter as a guest',
  /** Under its buttons. */
  guestNote: 'Guests can look around and play, but keep nothing they win.',
  /** What a screen reader calls the question. */
  askLabel: 'At the turnstiles',
  /** Once a guest is through the turnstiles. */
  guestIn: 'Welcome in! You can get a Day Ticket any time from the button up top.',
  /** The HUD's badge while the owl is a spectator. */
  badge: 'Just looking',
  /** The button on the badge, the turnstiles' line, the end of a game and the busy line. */
  get: 'Get a Day Ticket',
  /** The arcade's and the climb's second button on a spectator's result card. */
  again: 'Play again',
  /** The quests, the NPC owls, the stores: shown above the card before the store. */
  locked: 'Quests and the shops are for ticket holders.',
  /** A guest's first flop into a leaf pile on this page (OP-243): said once, with no card. */
  leaves: 'With a Day Ticket, leaf piles can turn up feathers.',
  /** At a realm's idol (the Realm Vote). */
  idol: 'Ticket holders vote here, one vote a day.',
  /** Once a bought ticket has made the spectator a full visitor in place. */
  admitted: 'Your Day Ticket is in. Have fun!',
  /** A room past its spectators' share turned the owl away (`full` with `spectators`). */
  busy: 'This part of the park is busy. A Day Ticket gets you in.',
  /** The card before the store from the badge's button, or after a game: the turnstiles' line's last sentence. */
  keep: 'A Day Ticket lets you keep what you win.',
  /** The end of a game that would have earned nothing anyway. */
  noFeathers: 'With a Day Ticket, games earn feathers.',
} as const;

const feathersOf = (n: number) => `${n} feather${n === 1 ? '' : 's'}`;

/** After a game a spectator played (fishing, the copy game, the quiz, the beam): what it would have earned, after the game's own line. */
export function wouldHaveEarned(n: number): string {
  return n > 0 ? `With a Day Ticket this would have earned ${feathersOf(n)}.` : SPECTATOR_WORDS.noFeathers;
}

/** The arcade's and the climb's result card for a spectator: "Nice run!" and what the run would have earned. */
export function endOfGameLine(n: number): string {
  return n > 0 ? `Nice run! ${wouldHaveEarned(n)}` : SPECTATOR_WORDS.noFeathers;
}

/** What an arcade run would have earned with a ticket: one feather for each band its score reaches (the day's best bonus aside). */
export function arcadeWouldEarn(game: ArcadeGame, score: number): number {
  return runFeathers(game, score);
}

/** What the climb's bands from `from` (banked before) up to `to` would have earned with a ticket (the brisk bonus aside). */
export function climbWouldEarn(from: number, to: number): number {
  let n = 0;
  for (let b = Math.max(0, from) + 1; b <= to; b++) n += BAND_FEATHERS[b - 1] ?? 0;
  return n;
}

/**
 * What the turnstiles do (OP-191): `in` with a ticket that went through (or an open gate); `spectate`,
 * with SPECTATORS on and no ticket that works, lets the owl in as a spectator, with the line to show
 * and whether it offers a Day Ticket (with one on offer, the turnstiles ask first, OP-198: buy one or
 * enter as a guest); `back` turns it away as before (OP-180) with why and
 * whether to sell one. A ticket that waits on the store's check or its night still lets the owl in as
 * a spectator, saying why; the turnstiles that could not reach the park turn it back.
 */
export type TurnstileWay = { go: 'in' } | { go: 'spectate'; line: string; sale: boolean } | { go: 'back'; line: string; sale: boolean };

export function turnstileWay(scan: ScanReply, entry: Entry): TurnstileWay {
  if (scan.ok || entry.gate !== 'ticket' || entry.admitted) return { go: 'in' };
  const refusal = gateRefusal(scan.reason, scan.kind);
  if (scan.reason === 'offline' || !entry.spectators) return { go: 'back', line: refusal.line, sale: refusal.buy };
  return refusal.buy ? { go: 'spectate', line: SPECTATOR_WORDS.turnstile, sale: true } : { go: 'spectate', line: refusal.line, sale: false };
}

/**
 * A free guest's gentle word that tickets turn up rewards (OP-243): said the first time only, for the
 * whole page, never as the card before the store. `say()` answers the line once, then null.
 */
export function createOnceHint(line: string): { say(): string | null } {
  let said = false;
  return {
    say() {
      if (said) return null;
      said = true;
      return line;
    },
  };
}

/** The full offer after a game comes up at most this often (the toast says it every time). */
export const FULL_OFFER_EVERY_MS = 5 * 60_000;

export interface OfferPacer {
  /** Whether the full offer may come up now; true counts as shown. */
  due(): boolean;
}

/** At most one full offer after games per FULL_OFFER_EVERY_MS, for the whole page. */
export function createOfferPacer(now: () => number = Date.now): OfferPacer {
  let last: number | null = null;
  return {
    due() {
      const t = now();
      if (last !== null && t - last < FULL_OFFER_EVERY_MS) return false;
      last = t;
      return true;
    },
  };
}

/** What the HUD's badge shows: nothing for a visitor; for a spectator its words and the Get a Day Ticket button. */
export function badgeView(spectator: boolean): { shown: boolean; label: string; button: string } {
  return { shown: spectator, label: SPECTATOR_WORDS.badge, button: SPECTATOR_WORDS.get };
}

const CSS = `
#hud .spectator{position:relative;z-index:9;margin-top:8px;width:max-content;max-width:calc(100vw - 24px);display:none;align-items:center;gap:8px;padding:4px 4px 4px 12px;border-radius:999px;
  background:rgba(12,30,54,.86);border:1px dashed rgba(255,211,106,.7);color:#FFD36A;font-size:13px;font-weight:700;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.4)}
#hud .spectator.show{display:flex}
#hud .spectator button{min-height:36px;padding:6px 12px;font-size:13px}
#hud.covered .spectator,#hud.at-home .spectator{display:none}
/*
 * The badge stands in the HUD's flow under the bar (OP-369), below the keepers' ribbon and any card
 * there, so it never lies over them: on a computer it was set at a height of its own, over the
 * ribbon's words. On a phone (OP-242) it is one slim line, and while the ribbon shows the badge waits
 * (the Menu and the shop still sell a ticket) and comes back once the ribbon is hidden or gone.
 */
@media (pointer:coarse){
  #hud .spectator{padding:3px 3px 3px 11px;font-size:12px;gap:6px}
  #hud .spectator button{min-height:34px;padding:5px 12px}
  #hud.ribbon-on .spectator.show{display:none}
}
#hud .toast .offer-get{display:block;margin:8px auto 0;min-height:40px}
`;

export interface SpectatorBadge {
  set(spectator: boolean): void;
  shown(): boolean;
}

/** The HUD's "Just looking" badge (CSS only, no art), with its Get a Day Ticket button. */
export function createSpectatorBadge(root: HTMLElement, get: () => void): SpectatorBadge {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const view = badgeView(true);
  const el = document.createElement('div');
  el.className = 'spectator';
  el.setAttribute('role', 'status');
  el.dataset['spectator'] = '';
  const label = document.createElement('span');
  label.textContent = view.label;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = view.button;
  button.dataset['spectatorGet'] = 'badge';
  button.addEventListener('click', get);
  el.append(label, button);
  root.appendChild(el);
  let on = false;
  return {
    set(spectator) {
      on = badgeView(spectator).shown;
      if (on) el.classList.add('show');
      else el.classList.remove('show');
    },
    shown: () => on,
  };
}
