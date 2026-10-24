import { MENU_THEMES, themeAt, tokenStyle, type MenuThemeId, type MenuTokens } from './menuTheme';

/**
 * The Menu (OP-108): one shell for everything the Menu button opens, dressed only by its theme's
 * tokens (menuTheme.ts), so a realm's skin (OP-109) changes its wood and never its layout. It rises
 * from the bottom on a phone, 70% of the screen high so the park stays in sight, and stands as a card
 * on a wider screen; it keeps one height whatever its tab shows, so the tabs never move under a
 * finger. Tabs across its top, each with its word always shown: Quests, Collection, Nest, Map and
 * Settings; the tab shown is told by its weight and its amber bar, not by colour alone.
 *
 * One tap opens it and one closes it: the Menu button again, the dimmed park, Close, a swipe down on
 * its top, Escape, or a phone's back. It opens with a soft knock on wood unless the park's sounds are
 * off, and moves for 200 ms unless the device or the owl asks for calm motion.
 */

export type MenuTabId = 'quests' | 'collection' | 'nest' | 'map' | 'settings';
export const MENU_TABS: readonly MenuTabId[] = ['quests', 'collection', 'nest', 'map', 'settings'];

export interface MenuTab {
  id: MenuTabId;
  label: string;
  /** Draws the tab into its panel, each time it is shown or the Menu is refreshed. */
  render(panel: HTMLElement): void;
  /** A dot on the tab: news there not seen yet. */
  badge?(): boolean;
}

export interface MenuShellOptions {
  /** The park's sounds are on (Settings). */
  sound(): boolean;
  /** Calm motion (Settings, or the device asks for less motion). */
  calm(): boolean;
  /** The clock that picks day or night (the visitor's own). */
  now?: () => Date;
}

export interface MenuShell {
  /** Opens on this tab (the last one shown, else Quests); `opener` takes the focus back when it closes. */
  open(tab?: MenuTabId, opener?: HTMLElement | null): void;
  /** Closes at once (another screen is taking over). */
  close(): void;
  isOpen(): boolean;
  /** The tab shown. */
  tab(): MenuTabId;
  /** Shows another tab while open. */
  show(tab: MenuTabId): void;
  /** Redraws the tab shown and the dots. */
  refresh(): void;
  onClose(cb: () => void): void;
  /** The theme it wears now (tests and the preview). */
  theme(): MenuThemeId;
}

/** Two-tone tab icons (main and accent tones from the theme): feather, egg, branch, moon, gear. */
const ICONS: Record<MenuTabId, string> = {
  quests:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i2" d="M24.5 3.5C14 6 7.5 14.5 7 26.5c9-1 15.5-7.5 17.5-23z"/><path class="i1" d="M5 29l17-23" stroke-width="2.2" stroke-linecap="round" fill="none"/><path class="i1" d="M13 17l5-1M11 21l5-1" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>',
  collection:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i2" d="M16 3c-6 0-10.5 9-10.5 15.5S10 29 16 29s10.5-4 10.5-10.5S22 3 16 3z"/><path class="i1" d="M7 17l4-3 4 3 4-3 4 3 3-2" stroke-width="2" fill="none" stroke-linejoin="round"/><circle class="i1" cx="12" cy="22" r="1.6"/><circle class="i1" cx="20" cy="23" r="1.4"/></svg>',
  nest:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i1" d="M3 11c7 2 13 1 26-4" stroke-width="2.4" stroke-linecap="round" fill="none"/><path class="i2" d="M12 7.5c2-3 6-3.5 8-1.5-2.5 2.5-5.5 3-8 1.5zM20 12c2.5-1.5 5.5-.5 6.5 1.5-3 1-5.5.5-6.5-1.5z"/><path class="i2" d="M6 19c0 6 4.5 9 10 9s10-3 10-9z"/><path class="i1" d="M6 19h20M8 23c5 1.5 11 1.5 16 0" stroke-width="1.8" fill="none"/></svg>',
  map: '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i2" d="M21 4.5A12 12 0 1 0 27.5 21 9.5 9.5 0 0 1 21 4.5z"/><circle class="i1" cx="13" cy="15" r="1.8"/><circle class="i1" cx="17.5" cy="22" r="1.4"/><circle class="i1" cx="9.5" cy="21.5" r="1.2"/><path class="i1" d="M13 15l4.5 7-8-.5z" stroke-width="1.2" fill="none" stroke-dasharray="2 2"/></svg>',
  settings:
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="i2" d="M16 3l2.3 3.1 3.8-.9.9 3.8 3.1 2.3-1.8 3.5 1.8 3.5-3.1 2.3-.9 3.8-3.8-.9L16 29l-2.3-3.1-3.8.9-.9-3.8-3.1-2.3 1.8-3.5-1.8-3.5 3.1-2.3.9-3.8 3.8.9z"/><circle class="i1" cx="16" cy="16" r="5"/></svg>',
};

const CSS = `
#hud .menu-layer{position:fixed;inset:0;z-index:20;display:none;pointer-events:auto;align-items:center;justify-content:center}
#hud .menu-layer.open{display:flex}
#hud .menu-layer .menu-scrim{position:absolute;inset:0;background:var(--m-scrim);animation:menu-fade var(--m-motion) var(--m-easing)}
#hud .menu-shell{position:relative;display:flex;flex-direction:column;width:min(560px,calc(100vw - 24px));height:min(70dvh,600px);background-color:var(--m-surface);background-image:var(--m-grain);background-size:360px 150px;color:var(--m-text);border:2px solid var(--m-frame);border-radius:var(--m-radius);box-shadow:var(--m-shadow);font-size:var(--m-body);line-height:1.4;overflow:hidden;animation:menu-pop var(--m-motion) var(--m-easing)}
#hud .menu-shell .branch{flex:none;height:18px;background:var(--m-branch) repeat-x center top/400px 18px;pointer-events:none}
#hud .menu-shell .grab{display:none}
#hud .menu-shell .mhead{flex:none;display:flex;align-items:center;gap:10px;padding:0 12px 0 18px;min-height:var(--m-target)}
#hud .menu-shell .mhead h2{margin:0;flex:1;font-size:var(--m-heading);letter-spacing:.01em}
#hud .menu-shell button{font:inherit;font-size:var(--m-body);color:var(--m-text);box-shadow:none;text-shadow:none}
#hud .menu-shell .x{min-height:var(--m-target);min-width:var(--m-target);padding:8px 16px;border-radius:999px;background:transparent;border:2px solid var(--m-frame);font-weight:700}
#hud .menu-shell .mtabs{flex:none;display:flex;gap:2px;padding:0 6px;border-bottom:2px solid color-mix(in srgb,var(--m-frame) 45%,transparent)}
#hud .menu-shell .mtab{position:relative;flex:1 1 0;min-width:max-content;min-height:calc(var(--m-target) + 18px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 4px 9px;margin:0;background:transparent;border:0;border-radius:var(--m-tab-radius) var(--m-tab-radius) 0 0;font-weight:500;white-space:nowrap}
#hud .menu-shell .mtab svg{width:26px;height:26px}
#hud .menu-shell .mtab .i1{fill:var(--m-icon-main);stroke:var(--m-icon-main)}
#hud .menu-shell .mtab .i2{fill:var(--m-icon-accent);opacity:.55}
#hud .menu-shell .mtab[aria-selected=true]{font-weight:800;background:color-mix(in srgb,var(--m-raised) 70%,transparent)}
#hud .menu-shell .mtab[aria-selected=true] .i2{opacity:1}
#hud .menu-shell .mtab[aria-selected=true]::after{content:'';position:absolute;left:12%;right:12%;bottom:-2px;height:5px;border-radius:5px 5px 0 0;background:var(--m-accent)}
#hud .menu-shell .mtab .dot{position:absolute;top:6px;right:calc(50% - 22px);width:11px;height:11px;border-radius:50%;background:#D7263D;border:2px solid var(--m-surface)}
#hud .menu-shell .mtab .dot[hidden]{display:none}
#hud .menu-shell .mpanel{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:14px 16px 18px;display:flex;flex-direction:column;gap:12px}
#hud .menu-shell :focus-visible{outline:3px solid var(--m-focus);outline-offset:2px}
#hud .menu-shell .mcard{background:var(--m-raised);border-radius:var(--m-card-radius);padding:12px 14px;border:1px solid color-mix(in srgb,var(--m-frame) 35%,transparent);display:flex;flex-direction:column;gap:8px}
#hud .menu-shell .mcard h3{margin:0;font-size:var(--m-body);font-weight:800}
#hud .menu-shell .mnote{margin:0;color:var(--m-muted)}
#hud .menu-shell .mrow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
#hud .menu-shell .mbtn{min-height:var(--m-target);padding:10px 18px;border-radius:999px;background:var(--m-accent);color:var(--m-on-accent);border:0;font-weight:800}
#hud .menu-shell .mbtn.ghost{background:transparent;color:var(--m-text);border:2px solid var(--m-frame)}
#hud .menu-shell .mbtn[disabled]{opacity:.55}
#hud .menu-shell .mmeter{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:baseline}
#hud .menu-shell .mmeter .bar{grid-column:1 / -1;display:block;height:12px;border-radius:6px;background:color-mix(in srgb,var(--m-frame) 22%,transparent);overflow:hidden}
#hud .menu-shell .mmeter .bar i{display:block;height:100%;background:var(--m-accent);border-radius:6px}
#hud .menu-shell .mlines{display:flex;flex-direction:column;gap:6px}
#hud .menu-shell .mmap{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(5,minmax(72px,auto));gap:8px}
#hud .menu-shell .mmap .paths{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#hud .menu-shell .mmap .paths line{stroke:var(--m-frame);stroke-width:3;vector-effect:non-scaling-stroke;stroke-linecap:round}
#hud .menu-shell .mmap .paths line.closed{stroke-dasharray:4 6;opacity:.7}
#hud .menu-shell .mmap .pin{position:relative;align-self:center;justify-self:center;display:flex;flex-direction:column;align-items:center;gap:2px;max-width:100%;padding:8px 10px;border-radius:var(--m-card-radius);background:var(--m-raised);border:2px solid var(--m-frame);text-align:center;font-weight:700;line-height:1.2}
#hud .menu-shell .mmap .pin.closed{border-style:dashed;font-weight:500;color:var(--m-muted)}
#hud .menu-shell .mmap .pin.here{border-width:3px;border-color:var(--m-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--m-accent) 35%,transparent)}
#hud .menu-shell .mmap .pin .you{font-size:var(--m-body);font-weight:800;color:var(--m-text)}
#hud .menu-shell .mmap .pin .you::before{content:'★ ';color:var(--m-accent)}
#hud .menu-shell .quests{display:flex;flex-direction:column;gap:10px}
#hud .menu-shell .quests .qsum{margin:0;color:var(--m-muted)}
#hud .menu-shell .quests nav.tabs{display:flex;gap:6px;flex-wrap:wrap}
#hud .menu-shell .quests nav.tabs button{min-height:var(--m-target);padding:8px 14px;border-radius:999px;background:transparent;border:2px solid var(--m-frame)}
#hud .menu-shell .quests nav.tabs button[aria-selected=true]{background:var(--m-accent);color:var(--m-on-accent);border-color:var(--m-accent);font-weight:800}
#hud .menu-shell .quests h3{margin:4px 0 0;font-size:var(--m-body);font-weight:800;letter-spacing:0;text-transform:none;opacity:1}
#hud .menu-shell .quests .empty,#hud .menu-shell .quests .who{font-size:var(--m-body);color:var(--m-muted);opacity:1}
#hud .menu-shell .quests .who span{background:var(--m-raised);color:var(--m-text)}
#hud .menu-shell .qcard{background:var(--m-raised);border:1px solid color-mix(in srgb,var(--m-frame) 35%,transparent);color:var(--m-text)}
#hud .menu-shell .qcard.ready{border:2px solid var(--m-accent)}
#hud .menu-shell .qcard .top b{font-size:var(--m-body)}
#hud .menu-shell .qcard .prog,#hud .menu-shell .qcard.ready .prog{font-size:var(--m-body);background:var(--m-accent);color:var(--m-on-accent);border:0}
#hud .menu-shell .qcard ol,#hud .menu-shell .qcard .meta,#hud .menu-shell .qcard .collect,#hud .menu-shell .qcard .quote{font-size:var(--m-body)}
#hud .menu-shell .qcard .meta{color:var(--m-muted);opacity:1}
#hud .menu-shell .qcard li.done{opacity:1;color:var(--m-muted)}
#hud .menu-shell .qcard button{min-height:var(--m-target);border-radius:999px;background:var(--m-accent);color:var(--m-on-accent);border:0;font-weight:800}
#hud .menu-shell .qcard button.ghost,#hud .menu-shell .quests button.ghost{min-height:var(--m-target);border-radius:999px;background:transparent;color:var(--m-text);border:2px solid var(--m-frame);font-weight:700}
#hud .menu-shell .chip{font-size:var(--m-body);background:transparent;border:1px solid var(--m-frame);color:var(--m-text)}
#hud .menu-shell .chip.easy,#hud .menu-shell .chip.medium,#hud .menu-shell .chip.hard{color:var(--m-text)}
#hud .menu-shell .today .task,#hud .menu-shell .quests .today .task{font-size:var(--m-body);background:var(--m-raised)}
#hud .menu-shell .today .task b{color:var(--m-text)}
#hud .menu-shell .today .task i{font-size:var(--m-body);color:var(--m-muted);opacity:1}
#hud .menu-shell .settings{display:flex;flex-direction:column;gap:10px}
#hud .menu-shell .settings h3{margin:4px 0 0;font-size:var(--m-body);font-weight:800;letter-spacing:0;text-transform:none;opacity:1}
#hud .menu-shell .settings .opt{background:var(--m-raised);border:1px solid color-mix(in srgb,var(--m-frame) 35%,transparent);min-height:var(--m-target)}
#hud .menu-shell .settings .opt > span{font-size:var(--m-body)}
#hud .menu-shell .settings .opt small{font-size:var(--m-body);color:var(--m-muted);opacity:1}
#hud .menu-shell .settings .switch{width:62px;min-height:var(--m-target);height:var(--m-target);background:color-mix(in srgb,var(--m-frame) 30%,transparent);border:2px solid var(--m-frame)}
#hud .menu-shell .settings .switch::after{top:5px;left:5px;width:30px;height:30px;background:var(--m-surface);box-shadow:0 1px 3px rgba(0,0,0,.4)}
#hud .menu-shell .settings .switch[aria-checked=true]{background:var(--m-accent);border-color:var(--m-frame)}
#hud .menu-shell .settings .switch[aria-checked=true]::after{transform:translateX(18px)}
#hud .menu-shell .settings .keys,#hud .menu-shell .settings .tips{font-size:var(--m-body);opacity:1}
#hud .menu-shell .settings button:not(.switch){min-height:var(--m-target);padding:8px 16px;border-radius:999px;background:var(--m-accent);color:var(--m-on-accent);border:0;font-weight:800}
#hud .menu-layer.closing .menu-scrim{animation:menu-fade-out var(--m-motion) var(--m-easing) forwards}
#hud .menu-layer.closing .menu-shell{animation:menu-drop var(--m-motion) var(--m-easing) forwards}
#hud .menu-layer.calm .menu-scrim,#hud .menu-layer.calm .menu-shell{animation:none !important}
@keyframes menu-fade{from{opacity:0}to{opacity:1}}
@keyframes menu-fade-out{from{opacity:1}to{opacity:0}}
@keyframes menu-pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
@keyframes menu-drop{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.98)}}
@media (max-width:600px){
  #hud .menu-layer{align-items:flex-end}
  #hud .menu-shell{width:100vw;height:70dvh;border-radius:var(--m-radius) var(--m-radius) 0 0;border-bottom:0;animation-name:menu-rise}
  #hud .menu-layer.closing .menu-shell{animation-name:menu-sink}
  #hud .menu-shell .grab{display:block;flex:none;width:44px;height:5px;margin:2px auto 0;border-radius:3px;background:color-mix(in srgb,var(--m-frame) 70%,transparent)}
  #hud .menu-shell .mpanel{padding-bottom:max(18px,env(safe-area-inset-bottom))}
}
@keyframes menu-rise{from{transform:translateY(100%)}to{transform:none}}
@keyframes menu-sink{from{transform:none}to{transform:translateY(100%)}}
@media (prefers-reduced-motion:reduce){#hud .menu-layer .menu-scrim,#hud .menu-shell{animation:none !important}}
`;

let styled = false;

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** The knock on wood: a short wooden tone and a click of grain, made on the spot (no sound file). */
function knock(audio: { ctx: AudioContext | null }, t: MenuTokens): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio.ctx ??= new AC();
    const ctx = audio.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(t.tapGain, now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    out.connect(ctx.destination);
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(t.tapHz, now);
    tone.frequency.exponentialRampToValueAtTime(t.tapHz * 0.6, now + 0.08);
    tone.connect(out);
    tone.start(now);
    tone.stop(now + 0.1);
    const len = Math.floor(ctx.sampleRate * 0.03);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const grainSrc = ctx.createBufferSource();
    grainSrc.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = t.tapHz * 4;
    band.Q.value = 1.2;
    grainSrc.connect(band);
    band.connect(out);
    grainSrc.start(now);
  } catch {
    /* no sound here: the Menu opens all the same */
  }
}

export function createMenuShell(root: HTMLElement, tabs: readonly MenuTab[], opts: MenuShellOptions): MenuShell {
  if (!styled) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    styled = true;
  }
  const now = opts.now ?? (() => new Date());

  const layer = document.createElement('div');
  layer.className = 'menu-layer';
  const scrim = document.createElement('div');
  scrim.className = 'menu-scrim';
  const box = document.createElement('section');
  box.className = 'menu-shell';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Menu');
  box.innerHTML = '<div class="branch" aria-hidden="true"></div><div class="grab" aria-hidden="true"></div><header class="mhead"><h2>Menu</h2></header><nav class="mtabs" role="tablist" aria-label="Menu"></nav><div class="mpanel" role="tabpanel" id="menu-panel" tabindex="-1"></div>';
  layer.append(scrim, box);
  root.appendChild(layer);

  const head = box.querySelector<HTMLElement>('.mhead')!;
  const nav = box.querySelector<HTMLElement>('.mtabs')!;
  const panel = box.querySelector<HTMLElement>('.mpanel')!;
  const x = document.createElement('button');
  x.className = 'x';
  x.dataset['close'] = '';
  x.setAttribute('aria-label', 'Close the menu');
  x.textContent = 'Close';
  head.appendChild(x);

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const tabButtons = new Map<MenuTabId, HTMLButtonElement>();
  const dots = new Map<MenuTabId, HTMLElement>();
  let current: MenuTabId = tabs[0]?.id ?? 'quests';
  let themeId: MenuThemeId = themeAt(now());
  let back: HTMLElement | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const closers: Array<() => void> = [];
  const audio: { ctx: AudioContext | null } = { ctx: null };

  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'mtab';
    b.id = `menu-tab-${t.id}`;
    b.dataset['tab'] = t.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'menu-panel');
    b.innerHTML = `${ICONS[t.id]}<span></span>`;
    b.querySelector('span')!.textContent = t.label;
    if (t.badge) {
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.dataset['dot'] = t.id;
      dot.hidden = true;
      b.appendChild(dot);
      dots.set(t.id, dot);
    }
    b.addEventListener('click', () => show(t.id));
    tabButtons.set(t.id, b);
    nav.appendChild(b);
  }

  // Arrow keys move between tabs, as tabs do everywhere.
  nav.addEventListener('keydown', (e) => {
    const i = tabs.findIndex((t) => t.id === current);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    show(tabs[next]!.id);
    tabButtons.get(tabs[next]!.id)?.focus();
  });

  const dress = () => {
    themeId = themeAt(now());
    layer.setAttribute('style', tokenStyle(MENU_THEMES[themeId]));
    layer.dataset['theme'] = themeId;
    layer.classList.toggle('calm', opts.calm());
  };

  const drawDots = () => {
    for (const t of tabs) {
      const dot = dots.get(t.id);
      if (dot) dot.hidden = !t.badge?.();
    }
  };

  function show(id: MenuTabId) {
    const t = byId.get(id);
    if (!t) return;
    current = id;
    for (const [tid, b] of tabButtons) {
      b.setAttribute('aria-selected', String(tid === id));
      b.tabIndex = tid === id ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `menu-tab-${id}`);
    panel.dataset['panel'] = id;
    panel.innerHTML = '';
    panel.scrollTop = 0;
    t.render(panel);
    drawDots();
  }

  const isOpen = () => layer.classList.contains('open');

  /** Closes now: the screen goes, the callbacks run, and the focus goes back where it came from. */
  const finish = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
    if (!isOpen()) return;
    layer.classList.remove('open', 'closing');
    for (const cb of closers) cb();
    if (back?.isConnected) back.focus({ preventScroll: true });
    back = null;
    if (pushed) {
      // The entry the Menu added for a phone's back goes too.
      pushed = false;
      ignorePop = true;
      history.back();
    }
  };

  /** The owl closes it: it moves away first, unless calm motion is asked for. */
  const closeByHand = () => {
    if (!isOpen() || closeTimer) return;
    if (opts.calm() || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish();
    layer.classList.add('closing');
    closeTimer = setTimeout(finish, MENU_THEMES[themeId].motionMs);
  };

  x.addEventListener('click', closeByHand);
  scrim.addEventListener('click', closeByHand);

  // A swipe down on its top (the grabber, the title, the tabs) closes it.
  let swipe: { y: number; x: number } | null = null;
  const top = [box.querySelector<HTMLElement>('.grab')!, head, nav];
  for (const el of top) {
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      swipe = t ? { y: t.clientY, x: t.clientX } : null;
    }, { passive: true });
  }
  box.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (swipe && t && t.clientY - swipe.y > 60 && Math.abs(t.clientX - swipe.x) < 50) closeByHand();
    swipe = null;
  });

  // A phone's back closes it, by an entry this page adds to its history while the Menu is open
  // (only this page's own: an entry from before a reload belongs to a page that is gone).
  let pushed = false;
  let ignorePop = false;
  window.addEventListener('popstate', () => {
    if (ignorePop) {
      ignorePop = false;
      return;
    }
    pushed = false;
    if (isOpen()) {
      // The entry is gone already: close without going back again.
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
      layer.classList.remove('open', 'closing');
      for (const cb of closers) cb();
      if (back?.isConnected) back.focus({ preventScroll: true });
      back = null;
    }
  });

  // Keep Tab inside the open Menu.
  layer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  return {
    open(tab, opener) {
      if (closeTimer) finish();
      dress();
      back = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      const already = isOpen();
      layer.classList.add('open');
      show(tab && byId.has(tab) ? tab : current);
      if (already) return;
      if (!pushed) {
        history.pushState({ ...(history.state ?? {}), owlParkMenu: true }, '');
        pushed = true;
      }
      if (opts.sound()) knock(audio, MENU_THEMES[themeId]);
      requestAnimationFrame(() => {
        if (!isOpen() || box.contains(document.activeElement)) return;
        tabButtons.get(current)?.focus({ preventScroll: true });
      });
    },
    close: finish,
    isOpen,
    tab: () => current,
    show(tab) {
      if (isOpen()) show(tab);
      else current = tab;
    },
    refresh() {
      if (isOpen()) {
        const scroll = panel.scrollTop;
        const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.['key'];
        show(current);
        panel.scrollTop = scroll;
        if (focusKey) panel.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
      } else drawDots();
    },
    onClose(cb) {
      closers.push(cb);
    },
    theme: () => themeId,
  };
}
