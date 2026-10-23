/**
 * The home screen (OP-065): what the park opens on, before the lobby. Logged out (no owl on this
 * device yet): the park's name with its mascot, Make your owl and Settings. Logged in: Play, a line about
 * the tickets on this device, Your owl and Settings, with the visitor's own owl drawn big beside
 * them (the builder's preview scene draws it in the frame this screen leaves for it). "Logged in"
 * means only that this device holds an owl: the park has no accounts, and nobody types a thing.
 */
import type { Entry, WalletEntry } from '../net';
import type { PreviewFrame } from './owlBuilder';
import { KIND_LABEL, timeLeft } from './tickets';

/** Every word the home screen shows (for the owner's approval). */
export const HOME_WORDS = {
  name: 'Owl Park',
  /** The first visit's button: there is no account to log into yet, so it makes the owl on this device (Log in returns with OP-050's sign-in). */
  logIn: 'Make your owl',
  play: 'Play',
  owl: 'Your owl',
  settings: 'Settings',
  added: 'Ticket added',
  ready: 'ready at the turnstiles',
  held: 'waiting on a quick check from the store',
  none: 'No ticket yet: the booth is by the gate',
  /** The Menu's way back here from inside the park. */
  menu: 'Home screen',
} as const;

const shortDate = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Running, then ready, then waiting on the store: the ticket the line under Play is about. */
const RANK: Partial<Record<WalletEntry['status'], number>> = { active: 3, unused: 2, held: 1 };
/** Time left for ordering: none given sorts with the longest. */
const left = (t: WalletEntry) => t.msLeft ?? Number.MAX_SAFE_INTEGER;

/**
 * The line under Play: the ticket on this device that matters most (a running one, with its time
 * left; an annual pass by name), or, while the gate takes tickets and the device holds none, where
 * to get one. Null while the gate lets everyone through and there is nothing to say.
 */
export function walletSummary(tickets: readonly WalletEntry[], gate: Entry['gate'], now: number, date: (ms: number) => string = shortDate): string | null {
  const best = tickets
    .filter((t) => RANK[t.status] !== undefined)
    .sort((a, b) => RANK[b.status]! - RANK[a.status]! || left(b) - left(a))[0];
  if (!best) return gate === 'ticket' ? HOME_WORDS.none : null;
  const name = KIND_LABEL[best.kind];
  if (best.status === 'active') return best.kind === 'annual' || best.msLeft === null ? name : `${name}: ${timeLeft(best.msLeft)} left`;
  if (best.status === 'held') return `${name}: ${HOME_WORDS.held}`;
  if (best.validFrom !== null && best.validFrom > now) return `${name}: for ${date(best.validFrom)}`;
  return `${name}: ${HOME_WORDS.ready}`;
}

export interface HomeActions {
  logIn(button: HTMLElement): void;
  play(): void;
  owl(button: HTMLElement): void;
  settings(button: HTMLElement): void;
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
}

/** Width over height of what the builder's preview keeps in view around the owl, a hat above and a pet behind (VIEW in game/BuilderScene.ts). */
const OWL_VIEW = 204 / 222;

/** The mascot's medallion in the link-preview card (og-image.jpg, 1200 x 630): its box, in the card's pixels. */
const MEDALLION = { x: 67, y: 130, size: 310, cardW: 1200 };

function css(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const m = MEDALLION;
  return `
#hud .home{position:absolute;inset:0;z-index:4;display:grid;grid-template-columns:minmax(0,min(440px,56vw)) minmax(0,1fr);pointer-events:none}
#hud .home[hidden]{display:none}
#hud.covered .home{visibility:hidden}
#hud .home .h-side{pointer-events:auto;display:flex;flex-direction:column;justify-content:center;gap:clamp(10px,2.2vh,16px);min-height:0;
  padding:max(16px,env(safe-area-inset-top)) clamp(16px,4vw,44px) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));
  background:linear-gradient(90deg,rgba(12,30,54,.9),rgba(12,30,54,.62) 72%,rgba(12,30,54,0))}
#hud .home .h-brand{display:flex;align-items:center;gap:clamp(10px,2vw,16px);margin-bottom:clamp(4px,2.4vh,20px)}
#hud .home .h-mascot{--m:clamp(56px,13vh,112px);flex:none;width:var(--m);height:var(--m);border-radius:50%;
  background:url(${base}og-image.jpg) no-repeat;background-size:calc(var(--m) * ${m.cardW / m.size}) auto;
  background-position:calc(var(--m) * ${-m.x / m.size}) calc(var(--m) * ${-m.y / m.size});box-shadow:0 0 22px rgba(255,211,106,.35)}
#hud .home h1{margin:0;font-size:clamp(28px,5.6vh,46px);line-height:1.05;color:#FFD36A;text-shadow:0 2px 12px rgba(0,0,0,.55)}
#hud .home .h-side button{width:100%}
#hud .home .h-main{min-height:clamp(52px,8vh,64px);font-size:clamp(18px,2.8vh,22px)}
#hud .home .h-small{min-height:40px;font-size:14px}
#hud .home .h-wallet{margin:-4px 0 0;font-size:14px;line-height:1.35;text-align:center;opacity:.92}
#hud .home .h-note{margin:0;align-self:flex-start;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700;background:rgba(123,201,80,.2);border:1px solid rgba(123,201,80,.65)}
#hud .home [hidden]{display:none}
#hud .home .h-stage{min-width:0;min-height:0}
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
      <button class="h-main" data-home-btn="login"></button>
      <button class="h-main" data-home-btn="play"></button>
      <p class="h-wallet" data-home-wallet hidden></p>
      <button class="ghost" data-home-btn="owl"></button>
      <button class="ghost h-small" data-home-btn="settings"></button>
    </div>
    <div class="h-stage" data-home-stage></div>`;
  root.appendChild(el);
  const $ = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  $<HTMLElement>('h1').textContent = HOME_WORDS.name;
  const login = $<HTMLButtonElement>('[data-home-btn="login"]');
  const play = $<HTMLButtonElement>('[data-home-btn="play"]');
  const owl = $<HTMLButtonElement>('[data-home-btn="owl"]');
  const settings = $<HTMLButtonElement>('[data-home-btn="settings"]');
  const wallet = $<HTMLElement>('[data-home-wallet]');
  const noteEl = $<HTMLElement>('[data-home-note]');
  const stage = $<HTMLElement>('[data-home-stage]');
  login.textContent = HOME_WORDS.logIn;
  play.textContent = HOME_WORDS.play;
  owl.textContent = HOME_WORDS.owl;
  settings.textContent = HOME_WORDS.settings;
  // Logged in, Make your owl goes: the builder hands the focus back to Your owl.
  login.addEventListener('click', () => actions.logIn(owl));
  play.addEventListener('click', () => actions.play());
  owl.addEventListener('click', () => actions.owl(owl));
  settings.addEventListener('click', () => actions.settings(settings));

  let shown = false;
  let loggedIn = false;
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
    if (e.key !== 'Enter' || e.repeat || !shown || !loggedIn || actions.blocked()) return;
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
      login.hidden = isIn;
      play.hidden = !isIn;
      owl.hidden = !isIn;
      if (!isIn) {
        wallet.hidden = true;
        noteEl.hidden = true;
      }
      (isIn ? play : login).focus({ preventScroll: true });
      if (isIn) actions.stage(frame());
    },
    hide() {
      shown = false;
      el.hidden = true;
    },
    isShown: () => shown,
    setWallet(line) {
      wallet.textContent = line ?? '';
      wallet.hidden = !line || !loggedIn;
    },
    note(text) {
      noteEl.textContent = text ?? '';
      noteEl.hidden = !text;
    },
    frame,
  };
}
