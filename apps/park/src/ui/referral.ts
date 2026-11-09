/**
 * Bring a friend (OP-056): the Menu's card in the Nest tab. The owl's friend code to tell a friend
 * new to the park, how the thank-you works, the free Day Tickets waiting on this owl (each opens the
 * store's checkout at $0), and, for an owl new to the park, the box to type the code of the friend
 * who sent it. Shown with the park's REFERRALS on, or as a preview with ?friends=1.
 */
import { REFERRAL_MEMBER_FEATHERS, REFERRAL_MONTHLY_CAP, type ReferralRefusal } from '@owl-park/shared';
import type { ReferralState } from '../net';

/** Every word the card shows (for the owner's approval before REFERRALS goes on for everyone). */
export const REFERRAL_WORDS = {
  title: 'Bring a friend',
  yourCode: 'Tell a friend who is new to the park your friend code:',
  how: `When your friend comes through the front gate for the first time, you get a free Day Ticket. With an annual pass, you get ${REFERRAL_MEMBER_FEATHERS} feathers instead. Your friend gets a free Day Ticket too.`,
  cap: `You can be thanked for ${REFERRAL_MONTHLY_CAP} friends a month.`,
  left: (n: number) => (n === 1 ? 'One thank-you left this month.' : n === 0 ? 'No thank-yous left this month. Friends you bring still get their free ticket.' : `${n} thank-yous left this month.`),
  thanked: (n: number) => (n === 1 ? 'One friend has come in with your code so far.' : `${n} friends have come in with your code so far.`),
  waiting: { friend: 'A free Day Ticket from your friend is waiting for you.', reward: 'A free Day Ticket is waiting for you: thanks for bringing a friend!' },
  get: 'Get my free ticket',
  notYet: 'Free tickets open soon. Check back here in a little while.',
  blocked: 'Your browser stopped the checkout window. Let this page open windows, then tap again.',
  none: 'That free ticket isn’t ready just now. Try again in a moment.',
  enterLabel: 'Did a friend send you? Type their four letters',
  use: 'Use code',
  welcome: 'Welcome, friend! Your free Day Ticket is waiting just above.',
  refused: {
    'unknown-code': 'No owl has that code. Check the four letters and try again.',
    self: 'That’s your own code! Tell it to a friend.',
    'same-device': 'That owl is on this same screen. Your friend types the code on their own screen.',
    'same-email': 'That owl and yours are kept by the same email, so it can’t bring you in.',
    'has-ticket': 'Friend codes are for owls new to the park, and this owl has had a ticket already.',
    'already-invited': 'A friend already brought this owl in.',
    'too-many': 'That’s a lot of codes from here today. Please try again tomorrow.',
    offline: 'The park can’t be reached just now. Try again in a moment.',
  } satisfies Record<ReferralRefusal | 'offline', string>,
} as const;

export interface ReferralActions {
  /** A friend's code typed in: the card's answer, which the Menu shows. */
  invite(code: string): Promise<{ ok: true } | { ok: false; reason: ReferralRefusal | 'offline' }>;
  /** Opens checkout for one free Day Ticket, in the tap itself. */
  freeTicket(button: HTMLElement): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** What a typed friend code becomes: four capital letters, or null. */
export function typedCode(raw: string): string | null {
  const c = raw.trim().toUpperCase();
  return /^[A-HJ-NP-Z]{4}$/.test(c) ? c : null;
}

/** The card's parts, under its title. */
export function referralCard(state: ReferralState, actions: ReferralActions, status = ''): HTMLElement[] {
  const parts: HTMLElement[] = [];
  const code = el('div', 'r-code');
  code.dataset['referralCode'] = state.code;
  const big = el('strong', undefined, state.code);
  big.style.cssText = 'display:block;font-size:26px;letter-spacing:.2em;color:#FFD36A';
  code.append(el('p', 'mnote', REFERRAL_WORDS.yourCode), big);
  parts.push(code, el('p', 'mnote', REFERRAL_WORDS.how), el('p', 'mnote', `${REFERRAL_WORDS.cap} ${REFERRAL_WORDS.left(state.thanksLeft)}`));
  if (state.thanked > 0) parts.push(el('p', 'mnote', REFERRAL_WORDS.thanked(state.thanked)));

  for (const offer of state.offers) {
    const row = el('div', 'r-offer');
    row.dataset['offer'] = offer.kind;
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:14px;border:1px solid rgba(255,211,106,.45)';
    row.appendChild(el('p', 'mnote', REFERRAL_WORDS.waiting[offer.kind]));
    if (state.free) {
      const b = el('button', undefined, REFERRAL_WORDS.get);
      b.dataset['freeTicket'] = '';
      b.addEventListener('click', () => actions.freeTicket(b));
      row.appendChild(b);
    } else row.appendChild(el('p', 'mnote', REFERRAL_WORDS.notYet));
    parts.push(row);
  }

  const said = el('p', 'mnote r-status', status);
  said.setAttribute('role', 'status');
  if (state.canEnterCode) {
    const form = el('form', 'r-enter');
    form.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const label = el('label', undefined, REFERRAL_WORDS.enterLabel);
    label.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700';
    const input = el('input');
    input.name = 'friend-code';
    input.maxLength = 4;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'characters');
    input.style.cssText = 'font:inherit;font-size:20px;letter-spacing:.2em;text-transform:uppercase;padding:8px 12px;border-radius:12px;border:1px solid rgba(246,241,227,.25);background:rgba(246,241,227,.06);color:#F6F1E3;width:8em';
    label.appendChild(input);
    const go = el('button', 'ghost', REFERRAL_WORDS.use);
    go.type = 'submit';
    form.append(label, go);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = typedCode(input.value);
      if (!c) {
        said.textContent = REFERRAL_WORDS.refused['unknown-code'];
        return;
      }
      go.disabled = true;
      void actions.invite(c).then((r) => {
        go.disabled = false;
        // A code taken redraws the card (with its welcome); a refusal says why here.
        if (!r.ok) said.textContent = REFERRAL_WORDS.refused[r.reason];
      });
    });
    parts.push(form);
  }
  parts.push(said);
  return parts;
}
