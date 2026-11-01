/**
 * Phones play the tree on their side (OP-155 decision (d), OP-156). In a room played sideways (a tree
 * room, map 2), a phone held upright sees a card asking to turn it. The card covers the game until the
 * phone is turned, so no tap reaches the room under it; the cards that ask the visitor something
 * ("Still here?", the account screens) stay above it. Today's park (map 1) plays either way and never
 * shows it, and neither does a computer's window or a tablet, however tall. Nothing is saved or sent:
 * the card follows the screen's shape as it changes.
 */
export interface TurnPhone {
  /** Whether the room the owl is in is played sideways. */
  set(sideways: boolean): void;
  /** Whether the card shows now. */
  shown(): boolean;
}

/** Every word the card shows (for the owner's approval). */
export const TURN_PHONE_WORDS = {
  title: 'Turn your phone sideways',
  text: 'This part of the park plays with your phone on its side.',
  stuck: 'If the screen does not turn, check your phone’s screen rotation setting.',
} as const;

/** A phone, not a tablet: its short side is under this many CSS pixels (the largest phones are about 430). */
export const PHONE_MAX_SIDE = 600;

/** Whether the card shows: a room played sideways, on a phone's touch screen taller than it is wide. */
export function turnPhoneShows(o: { sideways: boolean; touch: boolean; width: number; height: number }): boolean {
  return o.sideways && o.touch && o.height > o.width && o.width < PHONE_MAX_SIDE;
}

const CSS = `
#hud .turn-phone{position:fixed;inset:0;z-index:35;display:none;align-items:center;justify-content:center;pointer-events:auto;touch-action:none;background:rgba(6,14,28,.94)}
#hud .turn-phone.open{display:flex}
#hud.at-home .turn-phone.open{display:none}
#hud .turn-phone .card{display:flex;flex-direction:column;align-items:center;gap:12px;width:min(320px,calc(100vw - 32px));padding:20px 16px;text-align:center;color:#F6F1E3}
#hud .turn-phone svg{width:104px;height:104px}
#hud .turn-phone h2{margin:0;font-size:22px}
#hud .turn-phone p{margin:0;font-size:16px;line-height:1.35;opacity:.9}
#hud .turn-phone p.stuck{font-size:14px;opacity:.7}
`;

/** A phone upright, faint, and the same phone on its side, with the arrow between them. */
const ICON = `<svg viewBox="0 0 96 96" aria-hidden="true">
<rect x="12" y="8" width="26" height="44" rx="5" fill="none" stroke="#F6F1E3" stroke-width="3" opacity=".4"/>
<rect x="34" y="56" width="52" height="30" rx="5" fill="none" stroke="#FFD36A" stroke-width="3.5"/>
<circle cx="41" cy="71" r="2.2" fill="#FFD36A"/>
<path d="M46 14Q74 14 76 42" fill="none" stroke="#FFD36A" stroke-width="3.5" stroke-linecap="round"/>
<path d="M69 36L76 44L83 36" fill="none" stroke="#FFD36A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

let styled = false;

export function createTurnPhone(root: HTMLElement): TurnPhone {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const layer = document.createElement('div');
  layer.className = 'turn-phone';
  layer.dataset['turnPhone'] = '';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', TURN_PHONE_WORDS.title);
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = ICON;
  const title = document.createElement('h2');
  title.textContent = TURN_PHONE_WORDS.title;
  const text = document.createElement('p');
  text.textContent = TURN_PHONE_WORDS.text;
  const stuck = document.createElement('p');
  stuck.className = 'stuck';
  stuck.textContent = TURN_PHONE_WORDS.stuck;
  card.append(title, text, stuck);
  layer.append(card);
  root.append(layer);

  const touch = globalThis.matchMedia?.('(pointer: coarse)');
  let sideways = false;
  const update = () => {
    const show = turnPhoneShows({ sideways, touch: touch?.matches ?? false, width: window.innerWidth, height: window.innerHeight });
    layer.classList.toggle('open', show);
  };
  // A phone turned says so as a resize; some say it first as an orientation change, before the size is new.
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => requestAnimationFrame(update));
  return {
    set(on) {
      sideways = on;
      update();
    },
    shown: () => layer.classList.contains('open'),
  };
}
