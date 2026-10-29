/**
 * The owl's account on the page (OP-139), with the park's accounts on: its friend code and whether
 * an email protects it (the Menu's Nest tab), the box a grown-up types an email in (to protect this
 * owl, or to bring one to this screen), the owls a restore link shows as pictures to tap, and the
 * card a screen gets when its owl has moved to another one. A child never types here: every box that
 * takes an email says it is for a grown-up.
 */
import { speciesOf, type OwlAccount, type OwlPicture, type PortraitLook } from '@owl-park/shared';
import type { AccountLink, AccountSend } from '../net';
import { createModal, modalHeader } from './modal';

/** Every word the account screens show (for the owner's approval before ACCOUNTS goes on). */
export const ACCOUNT_WORDS = {
  friendCode: 'Your friend code',
  friendNote: 'Four letters that are yours alone, and never change.',
  unprotected: 'This owl lives only on this screen.',
  unprotectedMore: 'If this screen is lost or its browser is cleared, the owl is gone. A grown-up can protect it with an email, so it can come back on another screen.',
  protectedLine: 'Protected: this owl can come back on another screen.',
  protect: 'Protect this owl',
  restore: 'I already have an owl',
  protectTitle: 'Protect this owl',
  protectLead: 'For a grown-up: type your email and we will send you a link. Open it to protect this owl, so it can come back on another screen.',
  restoreTitle: 'Bring your owl here',
  restoreLead: 'Ask a grown-up to type the email that protects your owl. We will send a link to open on this screen.',
  email: 'Email',
  send: 'Send the link',
  privacy: 'The park keeps the email only to send these links, and never shows it to anyone.',
  sent: {
    protect: 'Check your email: open the link we sent to protect this owl. It works for 15 minutes.',
    restore: 'If that email protects an owl, a link is on its way. Open it on this screen within 15 minutes.',
  },
  refused: {
    'bad-email': 'That doesn’t look like an email. Check it and try again.',
    'try-later': 'That’s plenty of links for now. Please try again in an hour.',
    'not-ready': 'This can’t be done just now. Please try again later.',
    offline: 'The park can’t be reached just now. Try again in a moment.',
  },
  done: 'Done',
  picturesTitle: 'Which owl is yours?',
  picturesLead: 'Tap your owl to bring it to this screen. It leaves the screen it was on.',
  bringing: 'Bringing your owl…',
  gone: 'That link has run out or was used already. Ask for a new one from “I already have an owl”.',
  protectedNow: 'This owl is protected now. It can come back on another screen.',
  protectedThat: 'Done: that owl is protected now.',
  protectGone: 'That link has run out or was used already. Ask for a new one in the Menu’s Nest tab.',
  protectNoOwl: 'Make your owl first, then open the link again.',
  movedTitle: 'Your owl moved to another screen',
  movedLead: 'It was brought back on another screen, and an owl plays on one screen at a time.',
  movedBack: 'Bring it back here',
  movedNew: 'Make a new owl here',
  movedNewSure: 'Make a new owl on this screen? Your other owl stays safe on its own screen.',
} as const;

const SVG = 'http://www.w3.org/2000/svg';
const PLAIN: PortraitLook = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };
const HEX = /^#[0-9a-fA-F]{6}$/;

/** An owl drawn in its colours (the load screen's owl, standing still), for a picture to tap. */
export function owlPicture(look: PortraitLook | null): SVGSVGElement {
  const c = (k: 'body' | 'belly' | 'accent') => (look && HEX.test(look[k]) ? look[k] : PLAIN[k]);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 64 80');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    `<ellipse cx="10" cy="52" rx="7" ry="16" transform="rotate(12 10 52)" fill="${c('accent')}"/>` +
    `<ellipse cx="54" cy="52" rx="7" ry="16" transform="rotate(-12 54 52)" fill="${c('accent')}"/>` +
    `<ellipse cx="32" cy="50" rx="24" ry="26" fill="${c('body')}"/>` +
    `<ellipse cx="32" cy="57" rx="14" ry="17" fill="${c('belly')}"/>` +
    `<path d="M20 74l3-3 3 3M38 74l3-3 3 3" fill="none" stroke="#E2A93B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M14 20L10 2 24 13ZM50 20L54 2 40 13Z" fill="${c('accent')}"/>` +
    `<circle cx="32" cy="28" r="19" fill="${c('body')}"/>` +
    `<circle cx="24" cy="27" r="9" fill="${c('belly')}" fill-opacity=".55"/><circle cx="40" cy="27" r="9" fill="${c('belly')}" fill-opacity=".55"/>` +
    `<circle cx="24" cy="27" r="6" fill="#FFD36A"/><circle cx="40" cy="27" r="6" fill="#FFD36A"/>` +
    `<circle cx="24.5" cy="27.5" r="3" fill="#1B1B2F"/><circle cx="40.5" cy="27.5" r="3" fill="#1B1B2F"/>` +
    `<path d="M32 30L28.5 34 32 40 35.5 34Z" fill="#E2A93B"/>`;
  return svg;
}

const CSS = `
#hud .account .a-lead{margin:0;font-size:15px;line-height:1.45}
#hud .account .a-note{margin:0;font-size:12.5px;line-height:1.35;opacity:.78}
#hud .account .a-status{margin:0;font-size:14px;line-height:1.4;color:#FFD36A}
#hud .account .a-status:empty{display:none}
#hud .account label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700}
#hud .account input{font:inherit;font-size:16px;padding:10px 12px;border-radius:12px;border:1px solid rgba(246,241,227,.25);background:rgba(246,241,227,.06);color:#F6F1E3}
#hud .account input:focus{outline:2px solid #C9A227;outline-offset:1px}
#hud .account .a-foot{display:flex;justify-content:flex-end;gap:10px}
#hud .account .a-owls{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px}
#hud .account .a-owl{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;min-height:150px;border-radius:16px;background:rgba(246,241,227,.06);border:1px solid rgba(246,241,227,.18);color:#F6F1E3;box-shadow:none}
#hud .account .a-owl svg{width:64px;height:80px}
#hud .account .a-owl strong{font-size:18px;letter-spacing:.12em}
#hud .account .a-owl small{font-size:12px;opacity:.8}
#hud .moved-card{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,14,28,.86);pointer-events:auto}
#hud .moved-card[hidden]{display:none}
#hud .moved-card .m-box{display:flex;flex-direction:column;gap:12px;width:min(440px,100%);padding:20px;border-radius:22px;background:rgba(12,30,54,.98);border:1px solid rgba(255,211,106,.45);color:#F6F1E3;text-align:center}
#hud .moved-card h2{margin:0;font-size:20px;color:#FFD36A}
#hud .moved-card p{margin:0;font-size:15px;line-height:1.45}
#hud .moved-card button{width:100%}
`;

let styled = false;
function style(): void {
  if (styled) return;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
  styled = true;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * The Menu's card for the owl's account: its friend code, and whether it lives only on this screen
 * (with the way to protect it) or is protected.
 */
export function accountCard(account: OwlAccount, protect: (button: HTMLElement) => void): HTMLElement[] {
  style();
  const code = el('div', 'a-code');
  code.dataset['friendCode'] = account.friendCode;
  const big = el('strong', undefined, account.friendCode);
  big.style.cssText = 'display:block;font-size:30px;letter-spacing:.2em;color:#FFD36A';
  code.append(big, el('p', 'mnote', ACCOUNT_WORDS.friendNote));
  const guard = el('div', 'a-guard');
  guard.dataset['protected'] = String(account.protected);
  if (account.protected) guard.appendChild(el('p', 'mnote', ACCOUNT_WORDS.protectedLine));
  else {
    guard.append(el('p', 'mnote', ACCOUNT_WORDS.unprotected), el('p', 'mnote', ACCOUNT_WORDS.unprotectedMore));
    const b = el('button', 'ghost', ACCOUNT_WORDS.protect);
    b.dataset['protect'] = '';
    b.addEventListener('click', () => protect(b));
    guard.appendChild(b);
  }
  return [code, guard];
}

export interface AccountScreens {
  /** The box for a grown-up's email: a link that protects this owl, or one that brings an owl here. */
  openEmail(kind: 'protect' | 'restore', opener?: HTMLElement | null): void;
  /** A restore link opened: its email's owls, as pictures to tap. */
  openPictures(token: string): void;
  /** A protect link opened: protect its owl, and say so. */
  confirm(token: string): Promise<void>;
  /** This screen's owl is on another screen now: the moved card, over everything, until it is brought back or a new owl is made. */
  showMoved(): void;
  isOpen(): boolean;
  close(): void;
}

export interface AccountScreenDeps {
  toast(message: string, ms?: number): void;
  /** The owl's account changed (protected now): the Menu draws it again. */
  changed(): void;
  /** The page starts again with the owl this screen holds now. */
  restart(look: PortraitLook | null): void;
  /** This screen forgets its owl and starts again without one. */
  startOver(): void;
}

export function createAccountScreens(root: HTMLElement, link: AccountLink, deps: AccountScreenDeps): AccountScreens {
  style();
  const modal = createModal(root, { name: 'account', label: ACCOUNT_WORDS.protectTitle, layout: 'card', sheet: false });
  const box = modal.box;

  const openEmail = (kind: 'protect' | 'restore', opener?: HTMLElement | null) => {
    box.innerHTML = '';
    box.dataset['account'] = kind;
    box.setAttribute('aria-label', kind === 'protect' ? ACCOUNT_WORDS.protectTitle : ACCOUNT_WORDS.restoreTitle);
    box.appendChild(modalHeader(kind === 'protect' ? ACCOUNT_WORDS.protectTitle : ACCOUNT_WORDS.restoreTitle, { onClose: () => modal.close(), closeLabel: 'Close' }));
    const lead = el('p', 'a-lead', kind === 'protect' ? ACCOUNT_WORDS.protectLead : ACCOUNT_WORDS.restoreLead);
    const label = el('label', undefined, ACCOUNT_WORDS.email);
    const input = el('input');
    input.type = 'email';
    input.autocomplete = 'email';
    input.inputMode = 'email';
    input.maxLength = 254;
    input.dataset['accountEmail'] = '';
    label.appendChild(input);
    const status = el('p', 'a-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.dataset['accountStatus'] = '';
    const send = el('button', undefined, ACCOUNT_WORDS.send);
    send.dataset['accountSend'] = '';
    const foot = el('div', 'a-foot');
    foot.appendChild(send);
    box.append(lead, label, el('p', 'a-note', ACCOUNT_WORDS.privacy), status, foot);
    const go = async () => {
      if (send.disabled) return;
      send.disabled = true;
      status.textContent = '';
      const r: AccountSend = await link.send(kind, input.value);
      send.disabled = false;
      if (r !== 'sent') {
        status.textContent = ACCOUNT_WORDS.refused[r];
        return;
      }
      // Sent: the box gives way to what happens next.
      lead.textContent = ACCOUNT_WORDS.sent[kind];
      label.remove();
      status.textContent = '';
      send.textContent = ACCOUNT_WORDS.done;
      send.onclick = () => modal.close();
      send.dataset['accountDone'] = '';
    };
    send.onclick = () => void go();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void go();
      }
    });
    modal.open(opener);
  };

  const openPictures = (token: string) => {
    box.innerHTML = '';
    box.dataset['account'] = 'pictures';
    box.setAttribute('aria-label', ACCOUNT_WORDS.picturesTitle);
    box.appendChild(modalHeader(ACCOUNT_WORDS.picturesTitle, { onClose: () => modal.close(), closeLabel: 'Close' }));
    const lead = el('p', 'a-lead', ACCOUNT_WORDS.picturesLead);
    const grid = el('div', 'a-owls');
    const status = el('p', 'a-status');
    status.setAttribute('role', 'status');
    box.append(lead, grid, status);
    modal.open();
    void link.owls(token).then((owls) => {
      if (owls === 'gone' || owls === 'offline') {
        lead.textContent = owls === 'gone' ? ACCOUNT_WORDS.gone : ACCOUNT_WORDS.refused.offline;
        return;
      }
      for (const owl of owls) grid.appendChild(pictureButton(owl, token, grid, status));
    });
  };

  const pictureButton = (owl: OwlPicture, token: string, grid: HTMLElement, status: HTMLElement): HTMLButtonElement => {
    const b = el('button', 'a-owl');
    b.dataset['owl'] = owl.code;
    const kind = speciesOf(owl.look ?? {}).name;
    b.setAttribute('aria-label', `${kind}, ${owl.code}`);
    b.append(owlPicture(owl.look), el('strong', undefined, owl.code), el('small', undefined, kind));
    b.addEventListener('click', () => {
      for (const other of grid.querySelectorAll('button')) other.disabled = true;
      status.textContent = ACCOUNT_WORDS.bringing;
      void link.bind(token, owl.code).then((r) => {
        if (r === 'bound') return deps.restart(owl.look);
        status.textContent = r === 'offline' ? ACCOUNT_WORDS.refused.offline : ACCOUNT_WORDS.gone;
        if (r === 'offline') for (const other of grid.querySelectorAll('button')) other.disabled = false;
      });
    });
    return b;
  };

  const confirm = async (token: string) => {
    const r = await link.confirm(token);
    if (r === 'gone') return deps.toast(ACCOUNT_WORDS.protectGone, 6000);
    if (r === 'no-owl') return deps.toast(ACCOUNT_WORDS.protectNoOwl, 6000);
    if (r === 'offline') return deps.toast(ACCOUNT_WORDS.refused.offline, 6000);
    deps.toast(r.mine ? ACCOUNT_WORDS.protectedNow : ACCOUNT_WORDS.protectedThat, 6000);
    if (r.mine) deps.changed();
  };

  // The moved card: over everything, and nothing behind it answers until it goes.
  const moved = el('div', 'moved-card');
  moved.hidden = true;
  moved.setAttribute('role', 'alertdialog');
  moved.setAttribute('aria-modal', 'true');
  moved.dataset['moved'] = '';
  const mBox = el('div', 'm-box');
  const mTitle = el('h2', undefined, ACCOUNT_WORDS.movedTitle);
  mTitle.id = 'moved-title';
  moved.setAttribute('aria-labelledby', mTitle.id);
  const back = el('button', undefined, ACCOUNT_WORDS.movedBack);
  back.dataset['movedBack'] = '';
  const fresh = el('button', 'ghost', ACCOUNT_WORDS.movedNew);
  fresh.dataset['movedNew'] = '';
  mBox.append(mTitle, el('p', undefined, ACCOUNT_WORDS.movedLead), back, fresh);
  moved.appendChild(mBox);
  root.appendChild(moved);
  let isMoved = false;
  // Bringing it back asks for the email over the card, and the card returns if the box closes first.
  back.addEventListener('click', () => {
    moved.hidden = true;
    openEmail('restore', back);
  });
  modal.onClose(() => {
    if (isMoved) moved.hidden = false;
  });
  fresh.addEventListener('click', () => {
    if (window.confirm(ACCOUNT_WORDS.movedNewSure)) deps.startOver();
  });

  return {
    openEmail,
    openPictures,
    confirm,
    showMoved() {
      if (isMoved) return;
      isMoved = true;
      // A restore box or a restore link's owls open on this screen stay up (they bring the owl back): the card comes once they close.
      const kind = box.dataset['account'];
      if (modal.isOpen() && (kind === 'restore' || kind === 'pictures')) return;
      if (modal.isOpen()) return modal.close();
      moved.hidden = false;
      back.focus({ preventScroll: true });
    },
    isOpen: () => modal.isOpen() || !moved.hidden,
    close: () => modal.close(),
  };
}
