import { PHRASE_GROUPS, SAY_EVERY_MS, phrasesIn, type PhraseGroup } from '@owl-park/shared';
import { wheelSpot } from './emoteWheel';
import { createModal, type Modal } from './modal';

export interface SayWheel {
  open(opener?: HTMLElement | null): void;
  close(): void;
  isOpen(): boolean;
  /** Called after it closes, whichever way. */
  onClose(cb: () => void): void;
  /** Key `n` (1 to 4): say that phrase of the group shown. */
  press(n: number): void;
}

/** The group shown after `group` when turning `step` groups round the wheel (either way, wrapping). */
export function turnGroup(group: PhraseGroup, step: number): PhraseGroup {
  const i = PHRASE_GROUPS.findIndex((g) => g.id === group);
  const n = PHRASE_GROUPS.length;
  return PHRASE_GROUPS[(((i + step) % n) + n) % n]!.id;
}

const CSS = `
#hud .layer .modal.say{width:auto;max-height:calc(100dvh - 16px);overflow:auto;padding:0;background:transparent;border:0;box-shadow:none;align-items:center;gap:12px}
#hud .say .ring{--r:126px;position:relative;flex:none;width:calc(var(--r) * 2 + 92px);height:calc(var(--r) * 2 + 92px);border-radius:50%;background:radial-gradient(circle,rgba(12,30,54,.94) 0 46%,rgba(12,30,54,.86) 47% 100%);border:1px solid rgba(246,241,227,.2);box-shadow:0 18px 60px rgba(0,0,0,.55),inset 0 0 0 10px rgba(246,241,227,.04)}
#hud .say .group{position:absolute;left:50%;top:50%;width:84px;height:84px;min-height:0;margin:-42px 0 0 -42px;padding:6px;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;background:rgba(246,241,227,.08);color:#F6F1E3;border:1px solid rgba(246,241,227,.22);box-shadow:none;font-size:12px;font-weight:700;line-height:1.15;transition:transform .12s ease-out,background .12s}
#hud .say .group[aria-pressed=true]{background:#C9A227;color:#0C1E36;border-color:#FFD36A}
#hud .say .group:focus-visible{border-color:#FFD36A;transform:scale(1.08)}
@media (hover:hover){#hud .say .group:hover{border-color:#FFD36A;transform:scale(1.08)}}
#hud .say .hub{position:absolute;left:50%;top:50%;width:120px;margin-left:-60px;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
#hud .say .hub b{font-size:20px}
#hud .say .hub [data-group-name]{font-size:13px;color:#FFD36A;min-height:16px}
#hud .say .phrases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:min(420px,calc(100vw - 24px))}
#hud .say .phrase{position:relative;min-height:48px;padding:8px 30px 8px 12px;border-radius:16px;font-size:15px;line-height:1.2;text-align:left;background:rgba(12,30,54,.92);color:#F6F1E3;border:1px solid rgba(255,211,106,.55)}
#hud .say .phrase:disabled{opacity:.45;cursor:default}
#hud .say .phrase kbd{position:absolute;top:8px;right:8px;margin:0}
#hud .say [data-close]{min-height:40px}
@media (max-width:420px),(max-height:620px){#hud .say .ring{--r:104px}#hud .say .group{width:72px;height:72px;margin:-36px 0 0 -36px;font-size:11px}#hud .say .hub{width:96px;margin-left:-48px}#hud .say .phrases{grid-template-columns:1fr}}
`;

/**
 * The Say wheel (C44): the six groups of prewritten phrases round a ring, and the four phrases of the
 * group chosen under it. A phrase (tapped, or 1 to 4 on a keyboard through `press`) is said at once
 * and the wheel closes; the arrows turn to the next group. An owl says one phrase every few seconds:
 * until it may again, the phrases stay greyed. Nothing here is ever typed.
 */
export function createSayWheel(root: HTMLElement, say: (n: number) => boolean): SayWheel {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const modal: Modal = createModal(root, { name: 'say', label: 'Say', layout: 'card', sheet: false });
  const box = modal.box;
  box.innerHTML = `
    <div class="ring" data-ring>
      <div class="hub"><b>Say</b><span data-group-name aria-live="polite"></span></div>
    </div>
    <div class="phrases" data-phrases></div>
    <button class="ghost" data-close aria-label="Close Say">Close</button>`;
  const $ = <T extends Element>(sel: string) => box.querySelector(sel) as T;
  const ring = $<HTMLElement>('[data-ring]');
  const groupName = $<HTMLElement>('[data-group-name]');
  const list = $<HTMLElement>('[data-phrases]');
  let group: PhraseGroup = 'hello';
  /** When the owl may say its next phrase (this page's clock). */
  let readyAt = 0;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let phraseButtons: HTMLButtonElement[] = [];

  const groups = PHRASE_GROUPS.map((g, i) => {
    const b = document.createElement('button');
    b.className = 'group';
    b.dataset['group'] = g.id;
    b.textContent = g.name;
    b.addEventListener('click', () => {
      group = g.id;
      render();
    });
    ring.appendChild(b);
    return { b, i };
  });

  const render = () => {
    const r = parseFloat(getComputedStyle(ring).getPropertyValue('--r')) || 126;
    for (const { b, i } of groups) {
      const p = wheelSpot(i, r, PHRASE_GROUPS.length);
      b.style.left = `calc(50% + ${p.x}px)`;
      b.style.top = `calc(50% + ${p.y}px)`;
      b.setAttribute('aria-pressed', String(b.dataset['group'] === group));
    }
    groupName.textContent = PHRASE_GROUPS.find((g) => g.id === group)!.name;
    // Turning to another group with the keys keeps the focus on a phrase.
    const focused = phraseButtons.indexOf(document.activeElement as HTMLButtonElement);
    list.innerHTML = '';
    const waiting = Date.now() < readyAt;
    phraseButtons = phrasesIn(group).map((p, i) => {
      const b = document.createElement('button');
      b.className = 'phrase';
      b.dataset['phrase'] = String(p.n);
      b.textContent = p.text;
      b.disabled = waiting;
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      const k = document.createElement('kbd');
      k.setAttribute('aria-hidden', 'true');
      k.textContent = String(i + 1);
      b.appendChild(k);
      b.addEventListener('click', () => {
        if (Date.now() < readyAt || !say(p.n)) return;
        readyAt = Date.now() + SAY_EVERY_MS;
        modal.close();
      });
      list.appendChild(b);
      return b;
    });
    if (focused >= 0) phraseButtons[focused]?.focus({ preventScroll: true });
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = waiting ? setTimeout(() => modal.isOpen() && render(), readyAt - Date.now() + 20) : null;
  };

  $<HTMLButtonElement>('[data-close]').addEventListener('click', () => modal.close());
  // The arrows turn round the groups. (1 to 4 and Escape are the HUD's, from the keyboard module.)
  window.addEventListener('keydown', (e) => {
    if (!modal.isOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault();
      group = turnGroup(group, e.code === 'ArrowLeft' ? -1 : 1);
      render();
    }
  });
  modal.onClose(() => {
    if (readyTimer) clearTimeout(readyTimer);
    readyTimer = null;
  });

  return {
    open(opener) {
      modal.open(opener);
      render();
    },
    close: () => modal.close(),
    isOpen: () => modal.isOpen(),
    onClose: (cb) => modal.onClose(cb),
    press(n) {
      if (modal.isOpen()) phraseButtons[n - 1]?.click();
    },
  };
}
