import { EGG_CODE_LENGTH, EGG_CODE_WORDS, eggRedeemLine, type EggRedeemReply } from '@owl-park/shared';

/**
 * The Menu's Redeem a code card (OP-260), in the Settings tab behind ?eggcode=1: one box that takes a
 * pasted code from the portfolio site, a Redeem button, and one line saying what came of it. A code is
 * never read from the page's address: it is only ever pasted or typed here (the owner's pick, Nov 19).
 */
export function eggCodeCard(redeem: (code: string) => Promise<EggRedeemReply>): HTMLElement {
  const card = document.createElement('section');
  card.className = 'mcard';
  card.dataset['eggCode'] = '';
  const title = document.createElement('h3');
  title.textContent = EGG_CODE_WORDS.title;
  const lead = document.createElement('p');
  lead.className = 'mnote';
  lead.textContent = EGG_CODE_WORDS.note;

  const label = document.createElement('label');
  label.textContent = EGG_CODE_WORDS.label;
  label.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-weight:700';
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  // Room for a paste with a stray space or line break around it.
  input.maxLength = EGG_CODE_LENGTH + 40;
  input.dataset['eggCodeInput'] = '';
  input.style.cssText =
    'font:inherit;font-size:16px;padding:10px 12px;border-radius:12px;border:1px solid rgba(246,241,227,.25);background:rgba(246,241,227,.06);color:#F6F1E3;min-width:0;width:100%;box-sizing:border-box';
  label.appendChild(input);

  const row = document.createElement('div');
  row.className = 'mrow';
  const button = document.createElement('button');
  button.className = 'mbtn';
  button.textContent = EGG_CODE_WORDS.button;
  button.dataset['eggCodeRedeem'] = '';
  row.appendChild(button);

  const status = document.createElement('p');
  status.className = 'mnote';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.dataset['eggCodeStatus'] = '';

  let busy = false;
  const go = async () => {
    const code = input.value.trim();
    if (busy || !code) return;
    busy = true;
    button.disabled = true;
    status.textContent = 'Checking…';
    let reply: EggRedeemReply;
    try {
      reply = await redeem(code);
    } catch {
      reply = { ok: false, reason: 'offline' };
    }
    status.textContent = eggRedeemLine(reply);
    status.dataset['eggCodeStatus'] = reply.ok ? 'redeemed' : reply.reason;
    if (reply.ok || reply.reason === 'have') input.value = '';
    busy = false;
    button.disabled = false;
  };
  button.addEventListener('click', () => void go());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void go();
    }
  });

  card.append(title, lead, label, row, status);
  return card;
}
