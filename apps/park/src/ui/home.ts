/**
 * The home screen (OP-065): what the park opens on. Logged out (no owl on this device yet): the
 * park's name with its mascot, Make your owl and Settings. Logged in: Play, a line about the tickets
 * on this device, and Settings, with the visitor's own owl drawn big beside them (the builder's
 * preview scene draws it in the frame this screen leaves for it). Play always lands the owl in its
 * own nest, before its mirror (OP-105), and the park is out of the nest's door. "Logged in" means
 * only that this device holds an owl: the park has no accounts, and nobody types a thing.
 * While the keepers have the park closed for setup (OP-233), the closed card takes the place of Play
 * and Make your owl, with their words and the time they expect to open; a keeper's tab keeps its Play.
 */
import type { Entry, WalletEntry } from '../net';
import { ACCOUNT_WORDS } from './account';
import type { PreviewFrame } from './owlBuilder';
import { KIND_LABEL, bestTicket, timeLeft } from './tickets';

/** Every word the home screen shows (for the owner's approval). */
export const HOME_WORDS = {
  name: 'Owl Park',
  /** The first visit's button: there is no account to log into yet, so it makes the owl on this device (Log in returns with OP-050's sign-in). */
  logIn: 'Make your owl',
  /** Into the owl's own nest, before its mirror, where Your owl is (OP-077, OP-105). */
  play: 'Play',
  settings: 'Settings',
  added: 'Ticket added',
  /** A ticket link whose ticket is already running on another owl (OP-174). */
  inUse: 'Ticket already in use',
  held: 'waiting on a quick check from the store',
  none: 'No ticket yet: you can get one at the turnstiles',
  /** The Menu's way back here from inside the park. */
  menu: 'Home screen',
} as const;

/** Every word the line shows on the home screen while an owl waits to get in (OP-075), for the owner's approval. */
export const LINE_WORDS = {
  heading: "You're in line",
  /** Shown as a label over the number, big. */
  placeLabel: 'Your place in line:',
  place: (n: number) => `Your place in line: ${n}`,
  /** A rough wait, from how fast the line has moved lately. */
  wait: (min: number) => (min <= 1 ? 'About a minute' : min > 60 ? 'More than an hour' : `About ${min} minutes`),
  /** Before the line has moved at all. */
  waitUnknown: 'Your wait shows here once the line starts moving',
  auto: 'This page updates on its own.',
  /** Only for an owl holding a ticket: its clock starts at the gate's first scan (C35). */
  ticket: "Your ticket's time starts at the turnstiles, not here.",
  turn: "It's your turn!",
  passed: "Your turn came while you were away, so you're back in line.",
  offline: "We can't reach the park just now. Trying again…",
} as const;

/**
 * Every word the closed card adds to the keepers' own (OP-233), for the owner's approval. The card
 * itself is the keepers' words (SETUP_WORDS unless they wrote their own), shown in place of Play.
 */
export const CLOSED_WORDS = {
  /** The time the keepers expect to open, in the visitor's own time zone. */
  back: (when: string) => `Back by ${when}`,
  /** Only on a keeper's tab (a keeper's token, OP-156): its Play still walks in, to check the park. */
  keeper: 'You hold a keeper’s token: Play walks you in.',
} as const;

/**
 * The reopen time as the closed card says it (OP-233), in this browser's own time zone (or `timeZone`,
 * for the tests): the time alone when it is later today there, else with its day.
 */
export function reopenWords(at: number, now: number, opts: { locale?: string; timeZone?: string } = {}): string {
  const zone = opts.timeZone ? { timeZone: opts.timeZone } : {};
  const day = (ms: number) => new Intl.DateTimeFormat(opts.locale, { ...zone, year: 'numeric', month: 'numeric', day: 'numeric' }).format(ms);
  const sameDay = day(at) === day(now);
  const when = new Intl.DateTimeFormat(opts.locale, {
    ...zone,
    ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(at);
  return CLOSED_WORDS.back(when);
}

/** What the closed card shows (OP-233): the keepers' words, their reopen time if any, and whether this tab is a keeper's. */
export interface ClosedCard {
  words: string;
  reopenAt: number | null;
  keeper: boolean;
}

/** What the home screen shows of the line: the owl's place, or a short message. */
export type LineView = { place: number; waitMin: number | null; ticket: boolean } | { message: 'turn' | 'passed' | 'offline' };

const shortDate = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const HOUR = 3_600_000;

/**
 * The line under Play (OP-172): only when it changes what the owl does. While the gate takes tickets
 * and the owl holds none, where to get one (the turnstiles sell a Day Ticket, OP-180); for the
 * ticket that matters most (bestTicket), a wait on the store's check, a dated event or Opening Night Ticket
 * whose night is still to come, or a running Day or Night ticket with under an hour left. A running
 * annual pass, a ready ticket, or an open gate with none: null, and the line is not shown.
 */
export function walletSummary(tickets: readonly WalletEntry[], gate: Entry['gate'], now: number, date: (ms: number) => string = shortDate): string | null {
  const best = bestTicket(tickets);
  if (!best) return gate === 'ticket' ? HOME_WORDS.none : null;
  const name = KIND_LABEL[best.kind];
  if (best.status === 'held') return `${name}: ${HOME_WORDS.held}`;
  if (best.status === 'unused') {
    const dated = best.kind === 'event' || best.kind === 'opening-night';
    return dated && best.validFrom !== null && best.validFrom > now ? `${name}: for ${date(best.validFrom)}` : null;
  }
  const short = (best.kind === 'day' || best.kind === 'night') && best.msLeft !== null && best.msLeft < HOUR;
  return short ? `${name}: ${timeLeft(best.msLeft!)} left` : null;
}

export interface HomeActions {
  logIn(button: HTMLElement): void;
  /** Into the owl's own nest (OP-105), through the line while the park has one. */
  play(): void;
  settings(button: HTMLElement): void;
  /** I already have an owl (OP-139): a grown-up's email brings an owl it protects to this screen. */
  restore(button: HTMLElement): void;
  /** Where the owl stands moved (the screen came up, or its size changed). */
  stage(frame: PreviewFrame): void;
  /** A screen is open over the home screen (the builder, Settings): Enter is theirs. */
  blocked(): boolean;
}

export interface HomeScreen {
  show(loggedIn: boolean): void;
  hide(): void;
  isShown(): boolean;
  setWallet(line: string | null): void;
  /** A short note over Play ("Ticket added"); null clears it. */
  note(text: string | null): void;
  /** The frame the owl is drawn in, in CSS pixels. */
  frame(): PreviewFrame;
  /** The line (OP-075): the owl's place while it waits, in place of Play; null puts Play back. */
  line(view: LineView | null): void;
  /** Whether the owl is waiting in the line. */
  inLine(): boolean;
  /** Whether the park keeps accounts (OP-139): I already have an owl is shown only then. */
  setAccounts(on: boolean): void;
  /**
   * Closed for setup (OP-233): the closed card, in place of Play and Make your owl (a keeper's tab keeps
   * its Play); null takes the card away and puts them back.
   */
  closed(card: ClosedCard | null): void;
  /** Whether the closed card keeps this tab out (shown, and not a keeper's tab). */
  isShut(): boolean;
}

/** Width over height of what the builder's preview keeps in view around the owl, a hat above and a pet behind (VIEW in game/BuilderScene.ts). */
const OWL_VIEW = 204 / 222;

/**
 * The mascot is the link-preview card's medallion (og-image.jpg, 1200 x 630: the 310 px square at 67,
 * 130), cut out as home-mascot.webp, so the home screen fetches 17 kB rather than the whole card (OP-129).
 */
function css(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `
#hud .home{position:absolute;inset:0;z-index:4;display:grid;grid-template-columns:minmax(0,min(440px,56vw)) minmax(0,1fr);pointer-events:none}
#hud .home[hidden]{display:none}
#hud.covered .home{visibility:hidden}
#hud .home .h-side{pointer-events:auto;display:flex;flex-direction:column;justify-content:center;gap:clamp(10px,2.2vh,16px);min-height:0;
  padding:max(16px,env(safe-area-inset-top)) clamp(16px,4vw,44px) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:linear-gradient(90deg,rgba(12,30,54,.9),rgba(12,30,54,.62) 72%,rgba(12,30,54,0))}
#hud .home .h-brand{display:flex;align-items:center;gap:clamp(10px,2vw,16px);margin-bottom:clamp(4px,2.4vh,20px)}
#hud .home .h-mascot{--m:clamp(56px,13vh,112px);flex:none;width:var(--m);height:var(--m);border-radius:50%;
  background:url(${base}home-mascot.webp) center/cover no-repeat;box-shadow:0 0 22px rgba(255,211,106,.35)}
#hud .home h1{margin:0;font-size:clamp(28px,5.6vh,46px);line-height:1.05;color:#FFD36A;text-shadow:0 2px 12px rgba(0,0,0,.55)}
#hud .home .h-side button{width:100%}
#hud .home .h-main{min-height:clamp(52px,8vh,64px);font-size:clamp(18px,2.8vh,22px)}
#hud .home .h-small{min-height:40px;font-size:14px}
#hud .home .h-wallet{margin:-4px 0 0;font-size:14px;line-height:1.35;text-align:center;opacity:.92}
#hud .home .h-note{margin:0;align-self:flex-start;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700;background:rgba(123,201,80,.2);border:1px solid rgba(123,201,80,.65)}
#hud .home .h-line{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:16px;background:rgba(12,30,54,.72);border:1px solid rgba(255,211,106,.45)}
#hud .home .h-line h2{margin:0;font-size:clamp(16px,2.4vh,19px);color:#FFD36A}
#hud .home .h-line .h-place{margin:0;font-size:15px;opacity:1}
#hud .home .h-line .h-place strong{display:block;font-size:clamp(34px,6vh,48px);line-height:1.05;color:#F6F1E3}
#hud .home .h-line .h-message{margin:0;font-size:clamp(18px,2.8vh,22px);font-weight:700;opacity:1}
#hud .home .h-line p{margin:0;font-size:14px;line-height:1.35;opacity:.92}
#hud .home .h-line .h-small-note{font-size:13px;opacity:.75}
#hud .home .h-closed{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-radius:16px;background:rgba(12,30,54,.78);border:1px solid rgba(224,122,95,.75)}
#hud .home .h-closed .h-closed-words{margin:0;font-size:clamp(17px,2.6vh,21px);font-weight:700;line-height:1.3}
#hud .home .h-closed p{margin:0;font-size:14px;line-height:1.35;opacity:.92}
#hud .home .h-stage{min-width:0;min-height:0}
/* After every rule that sets a display, so a hidden part (the line, its message, the note) stays hidden. */
#hud .home [hidden]{display:none}
@media (max-width:520px){
  #hud .home{grid-template-columns:minmax(0,50vw) minmax(0,1fr)}
  /* Make your owl on one line on a phone (a very narrow one may still wrap it). */
  #hud .home .h-main{font-size:clamp(15px,4.8vw,20px);padding-left:10px;padding-right:10px}
  #hud .home .h-side{padding-left:max(14px,env(safe-area-inset-left));padding-right:10px}
  #hud .home .h-brand{flex-direction:column;align-items:flex-start;gap:8px}
  #hud .home h1{font-size:clamp(24px,7.4vw,32px)}
}
`;
}

let styled = false;

export function createHomeScreen(root: HTMLElement, actions: HomeActions): HomeScreen {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = css();
    document.head.appendChild(style);
    styled = true;
  }
  const el = document.createElement('section');
  el.className = 'home';
  el.dataset['home'] = '';
  el.hidden = true;
  el.setAttribute('aria-label', HOME_WORDS.name);
  el.innerHTML = `
    <div class="h-side">
      <div class="h-brand"><span class="h-mascot" aria-hidden="true"></span><h1></h1></div>
      <p class="h-note" data-home-note hidden></p>
      <div class="h-closed" data-home-closed role="status" aria-live="polite" hidden>
        <p class="h-closed-words" data-closed-words></p>
        <p data-closed-back hidden></p>
        <p data-closed-keeper hidden></p>
      </div>
      <button class="h-main" data-home-btn="login"></button>
      <button class="h-main" data-home-btn="play"></button>
      <div class="h-line" data-home-line role="status" aria-live="polite" hidden>
        <h2 data-line-heading></h2>
        <p class="h-place" data-line-place><span data-line-label></span> <strong data-line-number></strong></p>
        <p class="h-message" data-line-message hidden></p>
        <p data-line-wait></p>
        <p class="h-small-note" data-line-ticket hidden></p>
        <p class="h-small-note" data-line-auto></p>
      </div>
      <p class="h-wallet" data-home-wallet hidden></p>
      <button class="ghost h-small" data-home-btn="restore" hidden></button>
      <button class="ghost h-small" data-home-btn="settings"></button>
    </div>
    <div class="h-stage" data-home-stage></div>`;
  root.appendChild(el);
  const $ = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  $<HTMLElement>('h1').textContent = HOME_WORDS.name;
  const login = $<HTMLButtonElement>('[data-home-btn="login"]');
  const play = $<HTMLButtonElement>('[data-home-btn="play"]');
  const settings = $<HTMLButtonElement>('[data-home-btn="settings"]');
  const restore = $<HTMLButtonElement>('[data-home-btn="restore"]');
  const wallet = $<HTMLElement>('[data-home-wallet]');
  const noteEl = $<HTMLElement>('[data-home-note]');
  const stage = $<HTMLElement>('[data-home-stage]');
  const lineEl = $<HTMLElement>('[data-home-line]');
  const linePlace = $<HTMLElement>('[data-line-place]');
  const lineNumber = $<HTMLElement>('[data-line-number]');
  const lineMessage = $<HTMLElement>('[data-line-message]');
  $<HTMLElement>('[data-line-label]').textContent = LINE_WORDS.placeLabel;
  const lineWait = $<HTMLElement>('[data-line-wait]');
  const lineTicket = $<HTMLElement>('[data-line-ticket]');
  const lineAuto = $<HTMLElement>('[data-line-auto]');
  $<HTMLElement>('[data-line-heading]').textContent = LINE_WORDS.heading;
  const closedEl = $<HTMLElement>('[data-home-closed]');
  const closedWords = $<HTMLElement>('[data-closed-words]');
  const closedBack = $<HTMLElement>('[data-closed-back]');
  const closedKeeper = $<HTMLElement>('[data-closed-keeper]');
  closedKeeper.textContent = CLOSED_WORDS.keeper;
  lineTicket.textContent = LINE_WORDS.ticket;
  login.textContent = HOME_WORDS.logIn;
  play.textContent = HOME_WORDS.play;
  settings.textContent = HOME_WORDS.settings;
  restore.textContent = ACCOUNT_WORDS.restore;
  // Logged in, Make your owl goes: the builder hands the focus back to Play.
  login.addEventListener('click', () => actions.logIn(play));
  play.addEventListener('click', () => actions.play());
  settings.addEventListener('click', () => actions.settings(settings));
  restore.addEventListener('click', () => actions.restore(restore));

  let shown = false;
  let loggedIn = false;
  let waiting = false;
  /** The closed card keeps this tab out (OP-233): no Play, no Make your owl. */
  let shut = false;
  /** Play and Make your owl as the screen stands: one or the other, unless the line or the closed card has their place. */
  const buttons = () => {
    login.hidden = loggedIn || shut;
    play.hidden = !loggedIn || waiting || shut;
  };
  const frame = (): PreviewFrame => {
    // The owl stands low in the space beside the buttons. On a narrow phone its frame reaches a little
    // under the buttons' side, where only a pet would stand, so the owl itself can fill the space.
    const r = stage.getBoundingClientRect();
    const w = Math.min(r.width * 1.45, r.height * 0.72 * OWL_VIEW);
    const h = w / OWL_VIEW;
    return { x: r.left + (r.width - w) / 2, y: r.top + r.height * 0.94 - h, w, h };
  };
  new ResizeObserver(() => {
    if (shown && loggedIn) actions.stage(frame());
  }).observe(stage);
  // On a computer, Enter plays; a focused button takes Enter itself.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.repeat || !shown || !loggedIn || waiting || shut || actions.blocked()) return;
    const t = e.target;
    if (t instanceof HTMLElement && t !== document.body && (!el.contains(t) || t instanceof HTMLButtonElement)) return;
    e.preventDefault();
    actions.play();
  });

  return {
    show(isIn) {
      loggedIn = isIn;
      shown = true;
      el.hidden = false;
      buttons();
      if (!isIn) {
        wallet.hidden = true;
        noteEl.hidden = true;
      }
      if (!shut) (isIn ? play : login).focus({ preventScroll: true });
      if (isIn) actions.stage(frame());
    },
    hide() {
      shown = false;
      el.hidden = true;
    },
    isShown: () => shown,
    setWallet(line) {
      wallet.textContent = line ?? '';
      wallet.hidden = !line || !loggedIn || waiting;
    },
    note(text) {
      noteEl.textContent = text ?? '';
      noteEl.hidden = !text;
    },
    frame,
    line(view) {
      // While the owl waits, Play gives way to its place in line.
      waiting = view !== null;
      lineEl.hidden = !waiting;
      buttons();
      if (waiting) wallet.hidden = true;
      else wallet.hidden = !wallet.textContent || !loggedIn;
      if (!view) return;
      if ('message' in view) {
        // A short message in the place's spot: the turn, a turn that passed, or the park out of reach.
        linePlace.hidden = true;
        lineMessage.hidden = false;
        lineMessage.textContent = LINE_WORDS[view.message];
        lineWait.textContent = '';
        lineWait.hidden = true;
        lineTicket.hidden = true;
        lineAuto.hidden = view.message === 'turn';
        lineAuto.textContent = LINE_WORDS.auto;
        return;
      }
      linePlace.hidden = false;
      lineMessage.hidden = true;
      lineNumber.textContent = String(view.place);
      linePlace.setAttribute('aria-label', LINE_WORDS.place(view.place));
      lineWait.hidden = false;
      lineWait.textContent = view.waitMin === null ? LINE_WORDS.waitUnknown : LINE_WORDS.wait(view.waitMin);
      lineTicket.hidden = !view.ticket;
      lineAuto.hidden = false;
      lineAuto.textContent = LINE_WORDS.auto;
    },
    inLine: () => waiting,
    setAccounts(on) {
      restore.hidden = !on;
    },
    closed(card) {
      const wasShut = shut;
      shut = card !== null && !card.keeper;
      closedEl.hidden = card === null;
      if (card) {
        closedWords.textContent = card.words;
        closedBack.textContent = card.reopenAt === null ? '' : reopenWords(card.reopenAt, Date.now());
        closedBack.hidden = card.reopenAt === null;
        closedKeeper.hidden = !card.keeper;
      }
      buttons();
      // Open again while the screen is up: Play is back, and takes the focus as it would have.
      if (wasShut && !shut && shown) (loggedIn ? play : login).focus({ preventScroll: true });
    },
    isShut: () => shut,
  };
}
