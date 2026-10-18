import { ACCENT_COLOURS, BELLY_COLOURS, BODY_COLOURS, type OwlLook } from '@owl-park/shared';
import type { CollectionState } from '../collect/state';
import type { ConnectionStatus } from '../net';
import { createCollectionPanel, type CollectionActions, type CollectionPanel } from './collection';

/** What the finds counter shows: drops left in this half-day window and when new ones arrive. */
export interface FindsInfo {
  left: number;
  half: 'AM' | 'PM';
  /** "12:00": when the next window opens, in the collector's home time zone. */
  nextAt: string;
}

/** Something to do where the owl stands: one button each, and E runs the first. */
export interface HudAction {
  id: string;
  label: string;
}

export interface Hud {
  setCount(n: number): void;
  /** Owls in the whole park, when known (authoritative transports). */
  setParkCount(n: number | null): void;
  setStatus(s: ConnectionStatus, kind: 'local' | 'supabase' | 'edge'): void;
  /** A short message; `accent` colours its edge (rarity colours for finds). */
  toast(message: string, ms?: number, accent?: string): void;
  /** The finds counter; null hides it (no collection, or offline). */
  setFinds(info: FindsInfo | null): void;
  /** Wire the collection panel and the emote tray to the visitor's collection. */
  attachCollection(state: CollectionState, actions: CollectionActions): CollectionPanel;
  /** The action buttons for where the owl stands (gift shop, Realm Vote, ...); empty hides them. */
  setActions(actions: HudAction[]): void;
  onAction(cb: (id: string) => void): void;
  /** Q: open or close the collection (closing the other panels). */
  toggleCollection(): void;
  /** Escape: close every open panel. */
  closePanels(): void;
  setLook(look: OwlLook): void;
  onLookChange(cb: (look: OwlLook) => void): void;
}

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#F6F1E3;
  padding:max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));}
#hud *{box-sizing:border-box}
#hud .bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
#hud .brand{font-weight:700;letter-spacing:.04em;font-size:18px;text-shadow:0 1px 2px rgba(0,0,0,.6);display:flex;align-items:center;gap:8px}
#hud .brand i{width:22px;height:22px;border-radius:50%;background:#C9A227;display:inline-block;position:relative}
#hud .brand i:before,#hud .brand i:after{content:"";position:absolute;top:6px;width:7px;height:7px;border-radius:50%;background:#F6F1E3;box-shadow:inset 0 0 0 2px #0C1E36}
#hud .brand i:before{left:3px}#hud .brand i:after{right:3px}
#hud .pill,#hud .finds{pointer-events:auto;background:rgba(12,30,54,.72);border:1px solid rgba(246,241,227,.18);border-radius:999px;padding:8px 14px;font-size:14px;backdrop-filter:blur(6px);display:flex;align-items:center;gap:8px;white-space:nowrap}
#hud .dot{width:8px;height:8px;border-radius:50%;background:#C9A227;box-shadow:0 0 8px #C9A227}
#hud .dot.offline{background:#999;box-shadow:none}
#hud .dot.connecting{background:#F6F1E3;opacity:.6}
#hud .bottom{position:absolute;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));display:flex;justify-content:space-between;align-items:flex-end;gap:8px}
#hud button{pointer-events:auto;cursor:pointer;font:inherit;color:#0C1E36;background:#C9A227;border:0;border-radius:999px;padding:10px 16px;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.35);min-height:44px}
#hud button.ghost{background:rgba(12,30,54,.72);color:#F6F1E3;border:1px solid rgba(246,241,227,.18)}
#hud .owl{position:relative}
#hud .panel{position:absolute;left:0;bottom:calc(100% + 8px);pointer-events:auto;background:rgba(12,30,54,.92);border:1px solid rgba(246,241,227,.18);border-radius:16px;padding:14px;width:min(320px,calc(100vw - 24px));display:none;flex-direction:column;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)}
#hud .panel.open{display:flex}
#hud .panel h2{margin:0;font-size:15px;font-weight:700}
#hud .row{display:flex;flex-direction:column;gap:6px}
#hud .row span{font-size:12px;opacity:.8}
#hud .swatches{display:flex;gap:8px;flex-wrap:wrap}
#hud .sw{width:34px;height:34px;border-radius:50%;border:2px solid transparent;cursor:pointer;pointer-events:auto;padding:0;min-height:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
#hud .sw.on{border-color:#F6F1E3;transform:scale(1.08)}
#hud .toasts{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(max(12px,env(safe-area-inset-bottom)) + 64px);display:flex;flex-direction:column;gap:6px;align-items:center;width:min(92vw,520px)}
#hud .toast{background:rgba(246,241,227,.95);color:#0C1E36;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:600;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.4);animation:hud-in .25s ease-out}
@keyframes hud-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#hud .actions button{animation:hud-in .25s ease-out}
#hud kbd{display:none;margin-left:8px;padding:0 6px;border:1px solid currentColor;border-radius:5px;font:700 11px/1.5 system-ui,sans-serif;opacity:.7;vertical-align:1px}
@media (hover:hover) and (pointer:fine){#hud kbd{display:inline-block}}
#hud .actions{display:flex;gap:8px;align-items:flex-end}
#hud .left{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}
#hud .finds{display:none;font-size:13px}
#hud .finds.show{display:flex}
#hud .finds i{width:10px;height:10px;display:inline-block;background:#FFD36A;clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%);box-shadow:0 0 8px #FFD36A}
#hud .toast.accent{border-left:6px solid var(--accent)}
#hud .emote-wrap{position:relative}
@media (max-width:520px){#hud .bar{flex-wrap:wrap}#hud .finds{order:3}}
`;

export function createHud(parent: HTMLElement, initialLook: OwlLook): Hud {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="bar">
      <div class="brand" aria-label="Owl Park"><i aria-hidden="true"></i>Owl Park</div>
      <div class="finds" role="status" aria-live="polite" data-finds><i aria-hidden="true"></i><span data-finds-text></span></div>
      <div class="pill" role="status" aria-live="polite"><span class="dot connecting" data-dot></span><span data-count>1 owl here</span></div>
    </div>
    <div class="toasts" aria-live="polite" data-toasts></div>
    <div class="bottom">
      <div class="left">
        <div class="owl">
          <div class="panel" data-panel aria-label="Your owl">
            <h2>Your owl</h2>
            <div class="row"><span>Feathers</span><div class="swatches" data-sw="body"></div></div>
            <div class="row"><span>Belly</span><div class="swatches" data-sw="belly"></div></div>
            <div class="row"><span>Tufts and feet</span><div class="swatches" data-sw="accent"></div></div>
          </div>
          <button class="ghost" data-customize aria-expanded="false">Your owl</button>
        </div>
        <button class="ghost" data-collection-btn aria-expanded="false" aria-keyshortcuts="Q">Collection<kbd aria-hidden="true">Q</kbd></button>
        <div class="emote-wrap" data-emote-wrap><button class="ghost" data-emotes-btn aria-expanded="false">Emotes</button></div>
      </div>
      <div class="actions" data-actions></div>
    </div>`;
  parent.appendChild(root);

  const $ = <T extends Element>(sel: string) => root.querySelector(sel) as T;
  const dot = $<HTMLElement>('[data-dot]');
  const count = $<HTMLElement>('[data-count]');
  const toasts = $<HTMLElement>('[data-toasts]');
  const panel = $<HTMLElement>('[data-panel]');
  const customize = $<HTMLButtonElement>('[data-customize]');
  const actionsEl = $<HTMLElement>('[data-actions]');
  const finds = $<HTMLElement>('[data-finds]');
  const findsText = $<HTMLElement>('[data-finds-text]');
  const collectionBtn = $<HTMLButtonElement>('[data-collection-btn]');
  const emotesBtn = $<HTMLButtonElement>('[data-emotes-btn]');
  const emoteWrap = $<HTMLElement>('[data-emote-wrap]');
  let collectionPanel: CollectionPanel | null = null;

  let look: OwlLook = { ...initialLook };
  let lookCb: ((l: OwlLook) => void) | null = null;
  let actionCb: ((id: string) => void) | null = null;
  let shownActions = '';
  let here = 1;
  let park: number | null = null;
  const renderCount = () => {
    const base = here === 1 ? '1 owl here' : `${here} owls here`;
    count.textContent = park !== null && park > here ? `${base} · ${park} in the park` : base;
  };

  const groups: Array<[keyof OwlLook, string[]]> = [
    ['body', BODY_COLOURS],
    ['belly', BELLY_COLOURS],
    ['accent', ACCENT_COLOURS],
  ];
  const renderSwatches = () => {
    for (const [part, colours] of groups) {
      const host = $<HTMLElement>(`[data-sw="${part}"]`);
      host.innerHTML = '';
      for (const c of colours) {
        const b = document.createElement('button');
        b.className = `sw${look[part] === c ? ' on' : ''}`;
        b.style.background = c;
        b.setAttribute('aria-label', `${part} colour ${c}`);
        b.dataset['part'] = part;
        b.dataset['colour'] = c;
        b.addEventListener('click', () => {
          look = { ...look, [part]: c };
          renderSwatches();
          lookCb?.(look);
        });
        host.appendChild(b);
      }
    }
  };
  renderSwatches();

  const closeEmotes = () => {
    emoteWrap.querySelector('.emotes')?.classList.remove('open');
    emotesBtn.setAttribute('aria-expanded', 'false');
  };
  customize.addEventListener('click', () => {
    const open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    customize.setAttribute('aria-expanded', String(open));
    if (open) {
      collectionPanel?.close();
      closeEmotes();
    }
  });
  const toggleCollection = () => {
    if (!collectionPanel) return;
    collectionPanel.toggle();
    collectionBtn.setAttribute('aria-expanded', String(collectionPanel.isOpen()));
    panel.classList.remove('open');
    customize.setAttribute('aria-expanded', 'false');
    closeEmotes();
  };
  collectionBtn.addEventListener('click', toggleCollection);
  emotesBtn.addEventListener('click', () => {
    const tray = emoteWrap.querySelector('.emotes');
    if (!tray) return;
    const open = !tray.classList.contains('open');
    tray.classList.toggle('open', open);
    emotesBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      collectionPanel?.close();
      panel.classList.remove('open');
    }
  });

  return {
    setCount(n) {
      here = n;
      renderCount();
    },
    setParkCount(n) {
      park = n;
      renderCount();
    },
    setStatus(s, kind) {
      dot.className = `dot ${s === 'online' ? '' : s}`.trim();
      dot.title = s === 'online' ? (kind === 'local' ? 'Connected (this device only)' : 'Connected') : s === 'connecting' ? 'Connecting…' : 'Offline';
      dot.dataset['status'] = s;
    },
    toast(message, ms = 2600, accent) {
      const el = document.createElement('div');
      el.className = accent ? 'toast accent' : 'toast';
      if (accent) el.style.setProperty('--accent', accent);
      el.textContent = message;
      toasts.appendChild(el);
      setTimeout(() => el.remove(), ms);
    },
    setFinds(info) {
      finds.classList.toggle('show', info !== null);
      if (!info) return;
      const when = info.half === 'AM' ? 'this morning' : 'this afternoon';
      findsText.textContent = info.left > 0 ? `${info.left} ${info.left === 1 ? 'find' : 'finds'} left ${when} · new finds at ${info.nextAt}` : `All found ${when} · new finds at ${info.nextAt}`;
    },
    attachCollection(state, actions) {
      collectionPanel = createCollectionPanel(root, emoteWrap, state, actions);
      return collectionPanel;
    },
    setActions(list) {
      const key = list.map((a) => `${a.id}:${a.label}`).join('|');
      if (key === shownActions) return;
      shownActions = key;
      actionsEl.innerHTML = '';
      list.forEach((a, i) => {
        const b = document.createElement('button');
        b.dataset['action'] = a.id;
        b.textContent = a.label;
        if (i === 0) {
          // E runs the first action; the key cap shows only where there is a keyboard.
          b.setAttribute('aria-keyshortcuts', 'E');
          const k = document.createElement('kbd');
          k.setAttribute('aria-hidden', 'true');
          k.textContent = 'E';
          b.appendChild(k);
        }
        b.addEventListener('click', () => actionCb?.(a.id));
        actionsEl.appendChild(b);
      });
    },
    onAction(cb) {
      actionCb = cb;
    },
    toggleCollection,
    closePanels() {
      panel.classList.remove('open');
      customize.setAttribute('aria-expanded', 'false');
      collectionPanel?.close();
      collectionBtn.setAttribute('aria-expanded', 'false');
      closeEmotes();
    },
    setLook(l) {
      look = { ...l };
      renderSwatches();
    },
    onLookChange(cb) {
      lookCb = cb;
    },
  };
}
