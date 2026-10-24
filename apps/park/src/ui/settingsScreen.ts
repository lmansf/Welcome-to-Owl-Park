import type { Settings, SettingsStore } from '../settings';
import { createModal, modalHeader } from './modal';

export interface SettingsScreen {
  /** `fromMenu` adds the way back to the Menu. */
  open(fromMenu: boolean, opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
}

const CSS = `
#hud .settings h3{margin:4px 0 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
#hud .settings .opt{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.12)}
#hud .settings .opt > span{flex:1;display:flex;flex-direction:column;gap:2px;font-size:15px;font-weight:700}
#hud .settings .opt small{font-size:12.5px;font-weight:400;opacity:.8;line-height:1.3}
#hud .settings .switch{position:relative;flex:none;width:58px;min-height:34px;height:34px;padding:0;border-radius:999px;background:rgba(246,241,227,.18);border:1px solid rgba(246,241,227,.3);box-shadow:none}
#hud .settings .switch::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#F6F1E3;box-shadow:0 1px 4px rgba(0,0,0,.4);transition:transform .15s ease-out}
#hud .settings .switch[aria-checked=true]{background:#C9A227;border-color:#FFD36A}
#hud .settings .switch[aria-checked=true]::after{transform:translateX(24px)}
#hud .settings .keys{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13.5px;align-items:center}
#hud .settings .keys kbd{display:inline-block;margin:0 4px 0 0;opacity:.95}
#hud .settings .keys span:nth-child(odd){white-space:nowrap}
#hud .settings .touch-only,#hud .settings .keys-only{display:none}
@media (pointer:coarse){#hud .settings .touch-only{display:flex}}
@media (hover:hover) and (pointer:fine){#hud .settings .keys-only{display:grid}}
#hud .settings .tips{font-size:13.5px;line-height:1.45;margin:0;opacity:.9}
`;

/** What the keys do, for the Controls part (the same keys as ui/keyboard.ts). */
export const KEY_HELP: ReadonlyArray<[keys: string[], what: string]> = [
  [['W', 'A', 'S', 'D'], 'Walk (or the arrow keys)'],
  [['E'], 'Do what you are standing at'],
  [['Space'], 'Hop'],
  [['M'], 'Menu'],
  [['T'], 'Say'],
  [['1–8'], 'Play an emote at once, as numbered on the wheel'],
  [['Q'], 'Your owl: to the mirror in your nest'],
  [['J'], 'Quests'],
  [['Esc'], 'Close'],
];

/**
 * Settings, on this device: the thumbstick (touch screens), the bubbles of what owls say, calm
 * motion, full screen where the browser allows it, and which keys and touches do what.
 */
export function createSettingsScreen(root: HTMLElement, store: SettingsStore, back: () => void): SettingsScreen {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const modal = createModal(root, { name: 'settings', label: 'Settings', layout: 'card' });
  const box = modal.box;
  let fromMenu = false;

  const toggle = (key: keyof Settings, title: string, note: string, cls = ''): HTMLElement => {
    const row = document.createElement('label');
    row.className = `opt ${cls}`.trim();
    const text = document.createElement('span');
    text.append(title);
    if (note) {
      const small = document.createElement('small');
      small.textContent = note;
      text.appendChild(small);
    }
    const sw = document.createElement('button');
    sw.className = 'switch';
    sw.dataset['setting'] = key;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', title);
    sw.addEventListener('click', () => store.set({ [key]: !store.get()[key] }));
    row.append(text, sw);
    return row;
  };

  const render = () => {
    box.innerHTML = '';
    box.appendChild(modalHeader('Settings', { onBack: fromMenu ? back : null, onClose: () => modal.close(), closeLabel: 'Close settings' }));
    const h = (t: string) => {
      const e = document.createElement('h3');
      e.textContent = t;
      return e;
    };
    box.append(
      h('On screen'),
      toggle('thumbstick', 'Thumbstick', 'Walk with the stick in the corner. Off: tap the floor to walk.', 'touch-only'),
      toggle('bubbles', 'Show what owls say', ''),
      h('Motion'),
      toggle('calm', 'Calm motion', 'No drifting fireflies, gold dust or neon rain.'),
    );
    if (document.fullscreenEnabled) {
      const row = document.createElement('div');
      row.className = 'opt';
      const text = document.createElement('span');
      text.append('Full screen');
      const small = document.createElement('small');
      small.textContent = 'The park fills the whole screen. Esc or the browser’s own button leaves it.';
      text.appendChild(small);
      const b = document.createElement('button');
      b.dataset['fullscreen'] = '';
      b.textContent = document.fullscreenElement ? 'Leave' : 'Go full screen';
      b.addEventListener('click', () => {
        const done = () => render();
        if (document.fullscreenElement) void document.exitFullscreen().then(done, done);
        else void document.documentElement.requestFullscreen().then(done, done);
      });
      row.append(text, b);
      box.append(h('Screen'), row);
    }
    box.appendChild(h('Controls'));
    const keys = document.createElement('div');
    keys.className = 'keys keys-only';
    for (const [ks, what] of KEY_HELP) {
      const k = document.createElement('span');
      for (const key of ks) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        k.appendChild(kbd);
      }
      const w = document.createElement('span');
      w.textContent = what;
      keys.append(k, w);
    }
    const tips = document.createElement('p');
    tips.className = 'tips';
    tips.textContent =
      'Tap the floor to walk there, or hold the thumbstick. On a phone, the hand does what you are standing at, the arrow hops, the small button in the corner opens the Menu and the smile above them your emotes. Tap an owl with a gold “!” to talk. Your quests are in the Menu.';
    box.append(keys, tips);
    sync(store.get());
  };

  const sync = (s: Settings) => {
    for (const sw of box.querySelectorAll<HTMLButtonElement>('[data-setting]')) sw.setAttribute('aria-checked', String(s[sw.dataset['setting'] as keyof Settings]));
  };
  store.onChange(sync);
  document.addEventListener('fullscreenchange', () => {
    if (modal.isOpen()) render();
  });

  return {
    open(menu, opener) {
      fromMenu = menu;
      render();
      modal.open(opener);
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
  };
}
